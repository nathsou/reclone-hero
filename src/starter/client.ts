import { previewJob, stemsJob } from './synth.ts';
import type { Stems } from './synth.ts';
import type { WorkerRequest, WorkerResponse } from './worker.ts';
import RenderWorker from './worker.ts?worker&inline';

/**
 * Renders built-in songs, in a worker when the browser allows one (falling back to time-sliced work
 * on the main thread). Full stems jump the queue; song-list previews only render the latest request.
 */

type Job =
  | { kind: 'stems'; song: string; resolve: (s: Stems) => void; reject: (e: Error) => void; progress?: (p: number) => void }
  | { kind: 'preview'; song: string; resolve: (w: Uint8Array) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined;
let busy = false;
let nextId = 1;
let current: { id: number; job: Job } | null = null;
const stemQueue: Job[] = [];
let pendingPreview: Job | null = null;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new RenderWorker();
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => onMessage(e.data);
    worker.onerror = (e) => {
      // A worker that cannot start (e.g. blocked blob URLs) fails the job; later jobs run inline.
      e.preventDefault();
      worker?.terminate();
      worker = null;
      const job = current?.job;
      current = null;
      busy = false;
      if (job) runInline(job);
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
    if (job.kind === 'stems') job.progress?.(msg.value);
    return;
  }
  current = null;
  busy = false;
  if (msg.type === 'error') job.reject(new Error(msg.message));
  else if (msg.type === 'stems' && job.kind === 'stems') job.resolve({ guitar: msg.guitar, song: msg.song });
  else if (msg.type === 'preview' && job.kind === 'preview') job.resolve(msg.wav);
  pump();
}

function pump() {
  if (busy) return;
  const job = stemQueue.shift() ?? pendingPreview;
  if (!job) return;
  if (job === pendingPreview) pendingPreview = null;
  busy = true;
  const w = getWorker();
  if (!w) {
    runInline(job);
    return;
  }
  const id = nextId++;
  current = { id, job };
  w.postMessage({ id, song: job.song, kind: job.kind } satisfies WorkerRequest);
}

/** Main-thread fallback: run the generator in ~25 ms slices so the page stays responsive. */
function runInline(job: Job) {
  busy = true;
  const gen = job.kind === 'stems' ? stemsJob(job.song) : previewJob(job.song);
  const step = () => {
    try {
      const until = performance.now() + 25;
      for (;;) {
        const r = gen.next();
        if (r.done) {
          busy = false;
          if (job.kind === 'stems') job.resolve(r.value as Stems);
          else job.resolve(r.value as Uint8Array);
          pump();
          return;
        }
        if (job.kind === 'stems') job.progress?.(r.value);
        if (performance.now() > until) break;
      }
      setTimeout(step, 0);
    } catch (err) {
      busy = false;
      job.reject(err as Error);
      pump();
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
  const p = new Promise<Stems>((resolve, reject) => {
    stemQueue.push({ kind: 'stems', song, resolve, reject, progress: (v) => progressListeners.forEach((l) => l(v)) });
    pump();
  });
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
