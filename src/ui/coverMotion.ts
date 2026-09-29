/** Inertia in cover units, independent of DOM/events so gesture physics can be tested. */
export class CoverMotion {
  position = 0;
  velocity = 0;
  active = false;
  private lastMove = 0;
  private limit = 0;
  private target: number | null = null;

  begin(position: number, count: number, now: number): void {
    this.limit = Math.max(0, count - 1);
    this.position = Math.max(0, Math.min(this.limit, position));
    this.velocity = 0;
    this.lastMove = now;
    this.target = null;
    this.active = true;
  }

  move(position: number, now: number): void {
    const next = Math.max(0, Math.min(this.limit, position));
    const dt = Math.max(0.008, (now - this.lastMove) / 1000);
    const speed = Math.max(-18, Math.min(18, (next - this.position) / dt));
    this.velocity = this.velocity * 0.35 + speed * 0.65;
    this.position = next;
    this.lastMove = now;
  }

  release(now: number, reducedMotion = false): void {
    if (reducedMotion) {
      this.position = Math.round(this.position);
      this.stop();
      return;
    }
    if (now - this.lastMove > 100) this.velocity = 0;
    this.target = Math.abs(this.velocity) < 0.25 ? Math.round(this.position) : null;
  }

  /** Advance the fling; exponential decay is independent of refresh rate. Ends on a whole cover. */
  tick(seconds: number): boolean {
    const dt = Math.max(0, Math.min(0.05, seconds));
    if (!this.active) return false;
    if (this.target === null) {
      const decay = Math.exp(-dt / 0.22);
      const next = this.position + this.velocity * 0.22 * (1 - decay);
      this.position = Math.max(0, Math.min(this.limit, next));
      this.velocity *= decay;
      if (next !== this.position || Math.abs(this.velocity) < 0.25) {
        this.velocity = 0;
        this.target = Math.round(this.position);
      }
    }
    if (this.target !== null) {
      this.position += (this.target - this.position) * (1 - Math.exp(-dt * 22));
      if (Math.abs(this.target - this.position) < 0.001) {
        this.position = this.target;
        this.stop();
      }
    }
    return this.active;
  }

  stop(): void {
    this.active = false;
    this.velocity = 0;
    this.target = null;
  }
}
