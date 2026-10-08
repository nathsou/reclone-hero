/** Linked, offline lookahead peak control. The same gain goes to both stems.
 * No delay is added to the score: the renderer supplies future samples explicitly.
 * The conservative sample ceiling leaves room for reconstructed peaks; the full-song
 * audit also checks true peak with FFmpeg rather than claiming sample peak is true peak.
 */
export class MasterLimiter {
  readonly lookahead: number;
  private gain = 1;
  private readonly release: number;
  readonly ceiling = 0.7;

  constructor(sr: number) {
    this.lookahead = Math.ceil(sr * 0.005);
    this.release = Math.exp(-1 / (sr * 0.08));
  }

  gains(peaks: Float32Array, n: number): Float32Array {
    const envelope = new Float32Array(peaks.length);
    let next = 1;
    for (let i = peaks.length - 1; i >= 0; i--) {
      const required = Math.min(1, this.ceiling / Math.max(1e-12, peaks[i]));
      next = Math.min(required, next + 1 / this.lookahead);
      envelope[i] = next;
    }
    for (let i = 0; i < n; i++) {
      this.gain = Math.min(envelope[i], this.release * this.gain + 1 - this.release);
      envelope[i] = this.gain;
    }
    return envelope.subarray(0, n);
  }
}
