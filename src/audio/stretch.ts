import type { StretchRequest, StretchResponse } from './stretch.worker.ts';
import { stretchJob, stretchChannels } from './wsola.ts';
import StretchWorker from './stretch.worker.ts?worker&inline';

export function stretchExcerpt(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number): AudioBuffer {
  return toBuffer(ctx, stretchChannels(excerpt(buf, start, end, false), rate), buf.sampleRate);
}

/** A load owns its worker. Cancellation or a worker-level failure always settles the request and
 * releases its memory. Call sequentially for stems so queued jobs do not duplicate whole songs. */
export async function stretchAsync(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<AudioBuffer> {
  signal?.throwIfAborted();
  let worker: Worker;
  try { worker = new StretchWorker(); }
  catch { return inline(ctx, buf, start, end, rate, onProgress, signal); }
  try {
    const out = await new Promise<Float32Array[]>((resolve, reject) => {
      const abort = () => fail(signal?.reason ?? new DOMException('Canceled', 'AbortError'));
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const fail = (error: unknown) => { cleanup(); reject(error); };
      worker.onerror = e => { e.preventDefault(); fail(new Error(e.message || 'Audio worker failed')); };
      worker.onmessageerror = () => fail(new Error('Could not read audio worker response'));
      worker.onmessage = (e: MessageEvent<StretchResponse>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress?.(m.value);
        else if (m.type === 'error') fail(new Error(m.message));
        else { cleanup(); resolve(m.chans); }
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        signal?.throwIfAborted();
        const chans = excerpt(buf, start, end, true);
        worker.postMessage({ id: 1, chans, rate } satisfies StretchRequest, chans.map(c => c.buffer));
      } catch (err) { fail(err); }
    });
    signal?.throwIfAborted();
    return toBuffer(ctx, out, buf.sampleRate);
  } finally { worker.terminate(); }
}

/** Workers blocked by a browser policy still get a cancellable, time-sliced fallback. */
async function inline(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number, progress?: (p: number) => void, signal?: AbortSignal): Promise<AudioBuffer> {
  const job = stretchJob(excerpt(buf, start, end, false), rate, progress);
  try {
    for (;;) {
      signal?.throwIfAborted();
      const until = performance.now() + 8;
      do {
        const r = job.next();
        if (r.done) return toBuffer(ctx, r.value, buf.sampleRate);
      } while (performance.now() < until);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally { job.return([]); }
}

function excerpt(buf: AudioBuffer, start: number, end: number, copy: boolean): Float32Array[] {
  const sr = buf.sampleRate;
  const s0 = Math.min(buf.length, Math.max(0, Math.floor(start * sr)));
  const s1 = Math.max(s0, Math.min(buf.length, Math.ceil(end * sr)));
  return Array.from({ length: buf.numberOfChannels }, (_, c) => copy ? buf.getChannelData(c).slice(s0, s1) : buf.getChannelData(c).subarray(s0, s1));
}

function toBuffer(ctx: BaseAudioContext, chans: Float32Array[], sr: number): AudioBuffer {
  const out = ctx.createBuffer(chans.length, Math.max(1, chans[0]?.length ?? 0), sr);
  chans.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return out;
}
