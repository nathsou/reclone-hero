import { assembleStems, chunkJob, planChunks, previewJob } from './synth.ts';
import type { Chunk, Stems } from './synth.ts';
import type { WorkerRequest, WorkerResponse } from './worker.ts';
import RenderWorker from './worker.ts?worker&inline';

/**
 * Renders built-in songs on a pool of workers: a song is cut into stretches that render side by
 * side (one per worker) and are stitched back together, several times faster than one pass. When
 * workers are unavailable the same pieces render on the main thread in ~25 ms slices. Full stems
 * jump the queue; song-list previews only render the latest request.
 */

type Task =
  | { kind: 'chunk'; song: string; from: number; to: number; resolve: (c: Chunk) => void; reject: (e: Error) => void; progress: (p: number) => void }
  | { kind: 'preview'; song: string; resolve: (w: Uint8Array) => void; reject: (e: Error) => void };

interface Slot {
  worker: Worker;
  job: { id: number; task: Task } | null;
}

/** Leave a core for the page itself; beyond six pieces the warm-up of each outweighs the gain. */
const POOL_SIZE = Math.max(1, Math.min(6, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

let slots: Slot[] = [];
/** workers could not start (e.g. blob URLs blocked): render on the main thread instead */
let noWorkers = false;
let nextId = 1;
const chunkQueue: Task[] = [];
let pendingPreview: Task | null = null;
let inlineBusy = false;

function spawn(): Slot | null {
  try {
    const worker = new RenderWorker();
    const slot: Slot = { worker, job: null };
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => onMessage(slot, e.data);
    worker.onerror = (e) => {
      // A worker that cannot start fails over to the main thread, with its task.
      e.preventDefault();
      worker.terminate();
      slots = slots.filter((s) => s !== slot);
      if (!slots.length) noWorkers = true;
      const task = slot.job?.task;
      slot.job = null;
      if (task) requeue(task);
      pump();
    };
    return slot;
  } catch {
    return null;
  }
}

function requeue(task: Task) {
  if (task.kind === 'chunk') chunkQueue.unshift(task);
  else if (!pendingPreview) pendingPreview = task;
  else task.reject(new Error('superseded'));
}

function onMessage(slot: Slot, msg: WorkerResponse) {
  const job = slot.job;
  if (!job || msg.id !== job.id) return;
  const task = job.task;
  if (msg.type === 'progress') {
    if (task.kind === 'chunk') task.progress(msg.value);
    return;
  }
  slot.job = null;
  if (msg.type === 'error') task.reject(new Error(msg.message));
  else if (msg.type === 'chunk' && task.kind === 'chunk') task.resolve({ start: msg.start, guitar: msg.guitar, song: msg.song });
  else if (msg.type === 'preview' && task.kind === 'preview') task.resolve(msg.wav);
  pump();
}

function takeTask(): Task | null {
  const t = chunkQueue.shift() ?? pendingPreview;
  if (t === pendingPreview) pendingPreview = null;
  return t ?? null;
}

/** Hand waiting tasks to idle workers, starting workers as needed. */
function pump() {
  if (noWorkers) {
    runInline();
    return;
  }
  for (;;) {
    if (!chunkQueue.length && !pendingPreview) return;
    let slot = slots.find((s) => !s.job);
    if (!slot && slots.length < POOL_SIZE) {
      const s = spawn();
      if (!s) {
        noWorkers = !slots.length;
        if (noWorkers) runInline();
        return;
      }
      slots.push(s);
      slot = s;
    }
    if (!slot) return;
    const task = takeTask()!;
    const id = nextId++;
    slot.job = { id, task };
    const req: WorkerRequest = task.kind === 'chunk' ? { id, song: task.song, kind: 'chunk', from: task.from, to: task.to } : { id, song: task.song, kind: 'preview' };
    slot.worker.postMessage(req);
  }
}

/** Main-thread fallback: one task at a time, run in ~25 ms slices so the page stays responsive. */
function runInline() {
  if (inlineBusy) return;
  const task = takeTask();
  if (!task) return;
  inlineBusy = true;
  const gen: Generator<number, Chunk | Uint8Array> = task.kind === 'chunk' ? chunkJob(task.song, task.from, task.to) : previewJob(task.song);
  const done = () => {
    inlineBusy = false;
    runInline();
  };
  const step = () => {
    try {
      const until = performance.now() + 25;
      for (;;) {
        const r = gen.next();
        if (r.done) {
          if (task.kind === 'chunk') task.resolve(r.value as Chunk);
          else task.resolve(r.value as Uint8Array);
          done();
          return;
        }
        if (task.kind === 'chunk') task.progress(r.value);
        if (performance.now() > until) break;
      }
      setTimeout(step, 0);
    } catch (err) {
      task.reject(err as Error);
      done();
    }
  };
  setTimeout(step, 0);
}

let lastStems: { song: string; p: Promise<Stems> } | null = null;
const progressListeners = new Set<(p: number) => void>();

/** Both stems of a built-in song as WAV files; the most recent song stays cached. */
export function renderStems(song: string, onProgress?: (p: number) => void): Promise<Stems> {
  if (onProgress) progressListeners.add(onProgress);
  if (lastStems?.song === song) {
    void lastStems.p.finally(() => onProgress && progressListeners.delete(onProgress));
    return lastStems.p;
  }
  const plan = planChunks(song, noWorkers ? 1 : POOL_SIZE);
  const total = plan.reduce((s, [a, b]) => s + (b - a), 0);
  const done = plan.map(() => 0);
  const report = () => {
    const p = plan.reduce((s, [a, b], i) => s + done[i] * (b - a), 0) / total;
    progressListeners.forEach((l) => l(p));
  };
  const p = Promise.all(
    plan.map(
      ([from, to], i) =>
        new Promise<Chunk>((resolve, reject) => {
          chunkQueue.push({ kind: 'chunk', song, from, to, resolve, reject, progress: (v) => ((done[i] = v), report()) });
        }),
    ),
  ).then((chunks) => assembleStems(song, chunks));
  pump();
  lastStems = { song, p };
  p.catch(() => {
    if (lastStems?.p === p) lastStems = null;
  });
  void p.finally(() => progressListeners.clear());
  return p;
}

const previews = new Map<string, Promise<Uint8Array>>();

/** A short excerpt for the song list. Only the latest request renders; older ones are dropped. */
export function renderPreview(song: string): Promise<Uint8Array> {
  const hit = previews.get(song);
  if (hit) return hit;
  if (pendingPreview) pendingPreview.reject(new Error('superseded'));
  const p = new Promise<Uint8Array>((resolve, reject) => {
    pendingPreview = { kind: 'preview', song, resolve, reject };
    pump();
  });
  previews.set(song, p);
  p.catch(() => previews.delete(song));
  while (previews.size > 4) previews.delete(previews.keys().next().value!);
  return p;
}
