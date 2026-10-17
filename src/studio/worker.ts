import { analyzeJob } from './analysis.ts';

self.onmessage = (e: MessageEvent<{ pcm: Float32Array; sr: number }>) => {
  try {
    const job = analyzeJob(e.data.pcm, e.data.sr);
    for (;;) {
      const step = job.next();
      if (step.done) { self.postMessage({ type: 'done', analysis: step.value }); break; }
      self.postMessage({ type: 'progress', value: step.value });
    }
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
};
