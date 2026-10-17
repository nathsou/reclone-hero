// Renders built-in songs off the main thread.
import { previewJob, runJob, stemsJob } from './synth.ts';

export type WorkerRequest = { id: number; song: string; kind: 'stems' | 'preview'; sampleRate: number };
export type WorkerResponse =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'stems'; guitar: Float32Array[]; song: Float32Array[]; sampleRate: number }
  | { id: number; type: 'preview'; wav: Uint8Array }
  | { id: number; type: 'error'; message: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, song, kind, sampleRate } = e.data;
  let last = 0;
  const progress = (p: number) => {
    if (p - last < 0.02 && p < 1) return;
    last = p;
    ctx.postMessage({ id, type: 'progress', value: p } satisfies WorkerResponse);
  };
  try {
    if (kind === 'stems') {
      const s = runJob(stemsJob(song, sampleRate), progress);
      ctx.postMessage({ id, type: 'stems', guitar: s.guitar, song: s.song, sampleRate: s.sampleRate } satisfies WorkerResponse, [...s.guitar, ...s.song].map(c => c.buffer));
    } else {
      const wav = runJob(previewJob(song), progress);
      ctx.postMessage({ id, type: 'preview', wav } satisfies WorkerResponse, [wav.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: (err as Error).message } satisfies WorkerResponse);
  }
};
