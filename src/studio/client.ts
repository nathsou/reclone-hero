import AnalysisWorker from './worker.ts?worker&inline';
import { analyzeJob } from './analysis.ts';
import type { Analysis } from './analysis.ts';

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

/** Decode once at analysis sample rate, retaining the original file for playback and export. */
export async function analyzeFile(file: File, signal: AbortSignal, progress: (p: number) => void): Promise<Analysis> {
  if (!/\.(mp3|wav|ogg|opus|m4a)$/i.test(file.name)) throw new Error('Choose an MP3, WAV, OGG, Opus, or M4A song file.');
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('Choose an audio file between 1 byte and 100 MB.');
  const ctx = new OfflineAudioContext(1, 1, 22050);
  let buffer: AudioBuffer;
  try { buffer = await ctx.decodeAudioData(await file.arrayBuffer()); }
  catch {
    throw new Error(/\.m4a$/i.test(file.name)
      ? 'This M4A audio could not be decoded. Codec support varies by browser; try an unprotected AAC recording or convert to MP3 or WAV.'
      : 'This audio could not be decoded. Try an MP3, WAV, OGG, Opus, or M4A file supported by your browser.');
  }
  signal.throwIfAborted();
  if (buffer.duration > 1200) throw new Error('Songs up to 20 minutes are supported.');
  // Pick the loudest channel. Summing anti-phase stereo can erase an otherwise valid song.
  let channel = 0, energy = -1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c); let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum += data[i] ** 2;
    if (sum > energy) { channel = c; energy = sum; }
  }
  const pcm = buffer.getChannelData(channel).slice(), sr = buffer.sampleRate;
  return new Promise<Analysis>((resolve, reject) => {
    let worker: Worker | undefined, ended = false;
    const finish = (error?: unknown, result?: Analysis) => {
      if (ended) return;
      ended = true; worker?.terminate(); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(new DOMException('Analysis cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const fallback = () => {
      worker?.terminate(); worker = undefined;
      const job = analyzeJob(pcm, sr);
      const step = () => {
        if (ended) return;
        try {
          const next = job.next();
          if (next.done) finish(undefined, next.value);
          else { progress(next.value); setTimeout(step, 0); }
        } catch (error) { finish(error); }
      };
      step();
    };
    try {
      worker = new AnalysisWorker();
      worker.onmessage = (e: MessageEvent<{ type: string; analysis: Analysis; value: number; message: string }>) => {
        if (e.data.type === 'done') finish(undefined, e.data.analysis);
        else if (e.data.type === 'error') finish(new Error(e.data.message));
        else progress(e.data.value);
      };
      worker.onerror = (e) => { e.preventDefault(); fallback(); };
      // Keep the small mono buffer available if a CSP blocks the worker at startup.
      worker.postMessage({ pcm, sr });
    } catch { fallback(); }
  });
}
