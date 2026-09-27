/** Small CPU particle pool rendered as additive billboards. */
export class Particles {
  readonly max: number;
  count = 0;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly col: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  readonly shape: Float32Array;
  readonly gravity: Float32Array;

  constructor(max: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.gravity = new Float32Array(max);
  }

  /**
   * Reserve a particle slot and return its index; the caller writes the fields directly into the typed
   * arrays. (Passing a dozen floats through a call would box each one as a heap number in V8.)
   */
  alloc(): number {
    if (this.count < this.max) return this.count++;
    return (Math.random() * this.max) | 0; // full: recycle a random particle
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; ) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.remove(i);
        continue;
      }
      const g = this.gravity[i];
      this.vel[i * 3 + 1] += g * dt;
      const drag = Math.exp(-dt * 1.5);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      i++;
    }
  }

  private remove(i: number) {
    const j = --this.count;
    if (i === j) return;
    this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.col.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.size[i] = this.size[j];
    this.shape[i] = this.shape[j];
    this.gravity[i] = this.gravity[j];
  }
}
