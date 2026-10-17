/** Smooth audio-quantum jitter without making the highway visibly run in slow motion. */
export class SongClock {
  private anchored = false;
  private perf = 0;
  private song = 0;

  reset(): void { this.anchored = false; }

  sync(raw: number, perf: number, rate: number): void {
    const dt = Math.max(0, (perf - this.perf) / 1000);
    const estimate = this.song + dt * rate;
    if (!this.anchored || raw - estimate > 0.04) {
      this.song = raw;
      this.anchored = true;
    } else {
      // A late output timestamp used to trigger half-speed catch-up. Limit phase corrections to
      // 2% of playback speed, independent of refresh rate; keep timestamps monotonic.
      const limit = dt * rate * 0.02;
      const correction = (raw - estimate) * (1 - Math.exp(-dt * 2));
      this.song = estimate + Math.max(-limit, Math.min(limit, correction));
    }
    this.perf = perf;
  }

  time(perf: number, rate: number): number {
    return this.song + Math.max(0, (perf - this.perf) / 1000) * rate;
  }
}
