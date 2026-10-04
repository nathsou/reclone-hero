import type { StretchRequest, StretchResponse } from './stretch.worker.ts';
import { stretchChannels } from './wsola.ts';
import StretchWorker from './stretch.worker.ts?worker&inline';

/**
 * WSOLA time stretching for practice and song speed: changes the speed of audio without changing its
 * pitch. `rate` above 1 speeds up. A 30 s practice excerpt takes a fraction of a second; a whole
 * 4-minute stem about 1.5-2 s, so whole songs are stretched in a worker (stretchAsync).
 */
export function stretchExcerpt(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number): AudioBuffer {
  return toBuffer(ctx, stretchChannels(excerpt(buf, start, end, false), rate), buf.sampleRate);
}

/** The same, off the main thread when workers are available. */
export async function stretchAsync(ctx: BaseAudioContext, buf: AudioBuffer, start: number, end: number, rate: number, onProgress?: (p: number) => void): Promise<AudioBuffer> {
  const worker = getWorker();
  if (!worker) return stretchExcerpt(ctx, buf, start, end, rate);
  const chans = excerpt(buf, start, end, true);
  const id = ++lastId;
  const out = await new Promise<Float32Array[]>((resolve, reject) => {
    jobs.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, chans, rate } satisfies StretchRequest, chans.map((c) => c.buffer));
  });
  return toBuffer(ctx, out, buf.sampleRate);
}

/** The channels of buf between two times: views, or copies that can be handed to a worker. */
function excerpt(buf: AudioBuffer, start: number, end: number, copy: boolean): Float32Array[] {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(start * sr));
  const s1 = Math.max(s0, Math.min(buf.length, Math.ceil(end * sr)));
  return Array.from({ length: buf.numberOfChannels }, (_, c) => (copy ? buf.getChannelData(c).slice(s0, s1) : buf.getChannelData(c).subarray(s0, s1)));
}

function toBuffer(ctx: BaseAudioContext, chans: Float32Array[], sr: number): AudioBuffer {
  const out = ctx.createBuffer(chans.length, Math.max(1, chans[0]?.length ?? 0), sr);
  chans.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  return out;
}

let worker: Worker | null | undefined;
let lastId = 0;
const jobs = new Map<number, { resolve: (c: Float32Array[]) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new StretchWorker();
    worker.onmessage = (e: MessageEvent<StretchResponse>) => {
      const m = e.data;
      const job = jobs.get(m.id);
      if (!job) return;
      if (m.type === 'progress') job.onProgress?.(m.value);
      else {
        jobs.delete(m.id);
        if (m.type === 'done') job.resolve(m.chans);
        else job.reject(new Error(m.message));
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}
