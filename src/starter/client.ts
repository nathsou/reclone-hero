import { SYNTH_RATE, previewJob, stemsJob } from './synth.ts';
import type { Stems } from './synth.ts';
import type { WorkerRequest, WorkerResponse } from './worker.ts';
import RenderWorker from './worker.ts?worker&inline';

/** One synthesis worker, with a time-sliced fallback. Gameplay preempts optional previews. */
type Job =
  | { kind: 'stems'; song: string; key: string; sampleRate: number; resolve: (s: Stems) => void; reject: (e: Error) => void; progress: (p: number) => void }
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
    worker.onmessageerror = () => failWorker();
    worker.onerror = (e) => {
      // If workers are blocked, retry the same job inline and remember the fallback.
      e.preventDefault();
      failWorker();
    };
  } catch {
    worker = null;
  }
  return worker;
}

function failWorker() {
  worker?.terminate();
  worker = null;
  if (current) runInline(current);
  else pump();
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
  else if (msg.type === 'stems' && job.kind === 'stems') job.resolve({ guitar: msg.guitar, song: msg.song, sampleRate: msg.sampleRate });
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
    worker.onmessageerror = null;
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
  else {
    try { w.postMessage({ id: task.id, song: job.song, kind: job.kind, sampleRate: job.kind === 'stems' ? job.sampleRate : SYNTH_RATE } satisfies WorkerRequest); }
    catch { failWorker(); }
  }
}

/** Yield between render blocks, and abandon canceled generators before doing any more work. */
function runInline(task: Task) {
  const { job } = task;
  const gen = job.kind === 'stems' ? stemsJob(job.song, job.sampleRate) : previewJob(job.song);
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

type StemRequest = { p: Promise<Stems>; listeners: Set<(p: number) => void>; users: number };
const inFlight = new Map<string, StemRequest>();
let lastStems: { key: string; request: StemRequest } | null = null;
/** A small replay cache; long songs must not keep a second full PCM copy alive during play. */
const PCM_CACHE_BYTES = 32 * 1024 * 1024;

function cancelStem(key: string, request: StemRequest) {
  if (inFlight.get(key) !== request) return;
  inFlight.delete(key);
  if (lastStems?.request === request) lastStems = null;
  const error = new DOMException('Song load canceled', 'AbortError');
  const queued = stemQueue.findIndex(j => j.kind === 'stems' && j.key === key);
  if (queued >= 0) stemQueue.splice(queued, 1)[0].reject(error);
  if (current?.job.kind === 'stems' && current.job.key === key) {
    current.job.reject(error);
    current = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      worker = undefined;
    }
  }
  pump();
}

/** Deduplicate same-song reads. Cancel the render only when its last consumer leaves. */
export function renderStems(song: string, onProgress?: (p: number) => void, signal?: AbortSignal, sampleRate = SYNTH_RATE): Promise<Stems> {
  signal?.throwIfAborted();
  cancelPreviews();
  const key = `${song}:${sampleRate}`;
  let request = inFlight.get(key) ?? (lastStems?.key === key ? lastStems.request : undefined);
  if (!request) {
    const listeners = new Set<(p: number) => void>();
    const p = new Promise<Stems>((resolve, reject) => {
      stemQueue.push({ kind: 'stems', song, key, sampleRate, resolve, reject, progress: v => listeners.forEach(l => l(v)) });
    });
    request = { p, listeners, users: 0 };
    inFlight.set(key, request);
    const own = request;
    const done = () => { listeners.clear(); if (inFlight.get(key) === own) inFlight.delete(key); };
    void p.then(stems => {
      done();
      const bytes = [...stems.guitar, ...stems.song].reduce((n, c) => n + c.byteLength, 0);
      if (bytes > PCM_CACHE_BYTES && lastStems?.request === own) lastStems = null;
    }, () => {
      done();
      if (lastStems?.request === own) lastStems = null;
    });
    lastStems = { key, request };
  }
  const own = request;
  own.users++;
  if (onProgress) own.listeners.add(onProgress);
  const result = new Promise<Stems>((resolve, reject) => {
    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      own.users--;
      if (onProgress) own.listeners.delete(onProgress);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
      if (!own.users) cancelStem(key, own);
    };
    signal?.addEventListener('abort', abort, { once: true });
    void own.p.then(value => { if (active) { cleanup(); resolve(value); } }, error => { if (active) { cleanup(); reject(error); } });
  });
  pump();
  return result;
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
