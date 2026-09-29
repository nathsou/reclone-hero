// Renders built-in songs off the main thread: a stretch of a song's stems, or a song-list preview.
import { chunkJob, previewJob, runJob } from './synth.ts';

export type WorkerRequest = { id: number; song: string; kind: 'chunk'; from: number; to: number } | { id: number; song: string; kind: 'preview' };
export type WorkerResponse =
  | { id: number; type: 'progress'; value: number }
  | { id: number; type: 'chunk'; start: number; guitar: Int16Array; song: Int16Array }
  | { id: number; type: 'preview'; wav: Uint8Array }
  | { id: number; type: 'error'; message: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const { id } = req;
  let last = 0;
  const progress = (p: number) => {
    if (p - last < 0.02 && p < 1) return;
    last = p;
    ctx.postMessage({ id, type: 'progress', value: p } satisfies WorkerResponse);
  };
  try {
    if (req.kind === 'chunk') {
      const c = runJob(chunkJob(req.song, req.from, req.to), progress);
      ctx.postMessage({ id, type: 'chunk', start: c.start, guitar: c.guitar, song: c.song } satisfies WorkerResponse, [c.guitar.buffer, c.song.buffer]);
    } else {
      const wav = runJob(previewJob(req.song), progress);
      ctx.postMessage({ id, type: 'preview', wav } satisfies WorkerResponse, [wav.buffer]);
    }
  } catch (err) {
    ctx.postMessage({ id, type: 'error', message: (err as Error).message } satisfies WorkerResponse);
  }
};
