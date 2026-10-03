import { previewJob, stemsJob } from './synth.ts';
import type { Stems } from './synth.ts';
import type { WorkerRequest, WorkerResponse } from './worker.ts';
import RenderWorker from './worker.ts?worker&inline';

/** One synthesis worker, with a time-sliced fallback. Gameplay preempts optional previews. */
type Job =
  | { kind: 'stems'; song: string; resolve: (s: Stems) => void; reject: (e: Error) => void; progress: (p: number) => void }
  | { kind: 'preview'; song: string; resolve: (w: Uint8Array) => void; reject: (e: Error) => void };
type Task = { id: number; job: Job };

let worker: Worker | null | undefined;
let nextId = 1;
let current: Task | null = null;
const stemQueue: Job[] = [];
let pendingPreview: Job | null = null;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new RenderWorker();
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => onMessage(e.data);
    worker.onerror = (e) => {
      // If workers are blocked, retry the same job inline and remember the fallback.
      e.preventDefault();
      worker?.terminate();
      worker = null;
      if (current) runInline(current);
      else pump();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function onMessage(msg: WorkerResponse) {
  if (!current || msg.id !== current.id) return;
  const job = current.job;
  if (msg.type === 'progress') {
    if (job.kind === 'stems') job.progress(msg.value);
    return;
  }
  current = null;
  if (msg.type === 'error') job.reject(new Error(msg.message));
  else if (msg.type === 'stems' && job.kind === 'stems') job.resolve({ guitar: msg.guitar, song: msg.song });
  else if (msg.type === 'preview' && job.kind === 'preview') job.resolve(msg.wav);
  pump();
}

/** Worker rendering is synchronous, so terminating it is the only immediate cancellation. */
function cancelPreviews() {
  if (pendingPreview) {
    previews.delete(pendingPreview.song);
    pendingPreview.reject(new Error('superseded'));
    pendingPreview = null;
  }
  if (current?.job.kind !== 'preview') return;
  previews.delete(current.job.song);
  current.job.reject(new Error('superseded'));
  current = null;
  if (worker) {
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    worker = undefined;
  }
}

function pump() {
  if (current) return;
  const job = stemQueue.shift() ?? pendingPreview;
  if (!job) return;
  if (job === pendingPreview) pendingPreview = null;
  const task = current = { id: nextId++, job };
  const w = getWorker();
  if (!w) runInline(task);
  else w.postMessage({ id: task.id, song: job.song, kind: job.kind } satisfies WorkerRequest);
}

/** Yield between render blocks, and abandon canceled generators before doing any more work. */
function runInline(task: Task) {
  const { job } = task;
  const gen = job.kind === 'stems' ? stemsJob(job.song) : previewJob(job.song);
  const step = () => {
    if (current !== task) {
      gen.return(undefined as never);
      return;
    }
    try {
      const until = performance.now() + 12;
      for (;;) {
        const r = gen.next();
        if (r.done) {
          current = null;
          if (job.kind === 'stems') job.resolve(r.value as Stems);
          else job.resolve(r.value as Uint8Array);
          pump();
          return;
        }
        if (job.kind === 'stems') job.progress(r.value);
        if (performance.now() >= until) break;
      }
      setTimeout(step, 0);
    } catch (err) {
      current = null;
      job.reject(err as Error);
      pump();
    }
  };
  setTimeout(step, 0);
}

type StemRequest = { p: Promise<Stems>; listeners: Set<(p: number) => void> };
const inFlight = new Map<string, StemRequest>();
let lastStems: { song: string; request: StemRequest } | null = null;

/** Deduplicate simultaneous stem reads and retain just the most recently requested full song. */
export function renderStems(song: string, onProgress?: (p: number) => void): Promise<Stems> {
  cancelPreviews();
  let request = inFlight.get(song) ?? (lastStems?.song === song ? lastStems.request : undefined);
  if (!request) {
    const listeners = new Set<(p: number) => void>();
    const p = new Promise<Stems>((resolve, reject) => {
      stemQueue.push({ kind: 'stems', song, resolve, reject, progress: v => listeners.forEach(l => l(v)) });
    });
    request = { p, listeners };
    inFlight.set(song, request);
    const done = () => { listeners.clear(); inFlight.delete(song); };
    void p.then(done, () => {
      done();
      if (lastStems?.request.p === p) lastStems = null;
    });
  }
  if (onProgress && inFlight.has(song)) request.listeners.add(onProgress);
  lastStems = { song, request };
  pump();
  return request.p;
}

const previews = new Map<string, Promise<Uint8Array>>();

/** Keep four excerpts; browsing to a different song cancels obsolete work immediately. */
export function renderPreview(song: string): Promise<Uint8Array> {
  // Reuse pending work only when it is still the selected preview.
  const selected = current?.job.kind === 'preview' && current.job.song === song || pendingPreview?.song === song;
  if (!selected) cancelPreviews();
  const hit = previews.get(song);
  if (hit) {
    previews.delete(song);
    previews.set(song, hit);
    return hit;
  }
  const p = new Promise<Uint8Array>((resolve, reject) => {
    pendingPreview = { kind: 'preview', song, resolve, reject };
  });
  previews.set(song, p);
  void p.catch(() => { if (previews.get(song) === p) previews.delete(song); });
  while (previews.size > 4) previews.delete(previews.keys().next().value!);
  pump();
  return p;
}
