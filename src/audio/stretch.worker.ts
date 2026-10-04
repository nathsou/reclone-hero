// Time-stretches whole songs (song speed) off the main thread.
import { stretchChannels } from './wsola.ts';

export type StretchRequest = { id: number; chans: Float32Array[]; rate: number };
export type StretchResponse =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'done'; chans: Float32Array[] }
  | { id: number; type: 'error'; message: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<StretchRequest>) => void) | null;
  postMessage(msg: StretchResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = (e: MessageEvent<StretchRequest>) => {
  const { id, chans, rate } = e.data;
  try {
    const out = stretchChannels(chans, rate, (value) => ctx.postMessage({ id, type: 'progress', value }));
    ctx.postMessage({ id, type: 'done', chans: out }, out.map((c) => c.buffer));
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: (err as Error).message });
  }
};
