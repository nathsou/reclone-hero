import type { RawTempo } from './types.ts';

/** Converts between ticks and seconds for a list of tempo changes. */
export class TempoMap {
  readonly resolution: number;
  private readonly ticks: Float64Array;
  private readonly times: Float64Array;
  private readonly secPerTick: Float64Array;

  constructor(tempos: RawTempo[], resolution: number, offsetSec = 0) {
    this.resolution = resolution;
    const list = [...tempos].sort((a, b) => a.tick - b.tick).filter((t) => t.usPerQuarter > 0);
    if (list.length === 0 || list[0].tick > 0) list.unshift({ tick: 0, usPerQuarter: 500000 });
    // keep only the last tempo on a given tick
    const dedup: RawTempo[] = [];
    for (const t of list) {
      if (dedup.length && dedup[dedup.length - 1].tick === t.tick) dedup[dedup.length - 1] = t;
      else dedup.push(t);
    }
    const n = dedup.length;
    this.ticks = new Float64Array(n);
    this.times = new Float64Array(n);
    this.secPerTick = new Float64Array(n);
    let time = offsetSec;
    for (let i = 0; i < n; i++) {
      if (i > 0) time += (dedup[i].tick - dedup[i - 1].tick) * this.secPerTick[i - 1];
      this.ticks[i] = dedup[i].tick;
      this.times[i] = time;
      this.secPerTick[i] = dedup[i].usPerQuarter / 1e6 / resolution;
    }
  }

  tickToTime(tick: number): number {
    const i = upperBound(this.ticks, tick) - 1;
    const j = Math.max(0, i);
    return this.times[j] + (tick - this.ticks[j]) * this.secPerTick[j];
  }

  timeToTick(time: number): number {
    const i = upperBound(this.times, time) - 1;
    const j = Math.max(0, i);
    return this.ticks[j] + (time - this.times[j]) / this.secPerTick[j];
  }

  /** Quarter-note beats elapsed at a given time (fractional). */
  timeToBeat(time: number): number {
    return this.timeToTick(time) / this.resolution;
  }

  bpmAt(time: number): number {
    const j = Math.max(0, upperBound(this.times, time) - 1);
    return 60 / (this.secPerTick[j] * this.resolution);
  }
}

/** First index whose value is > x. */
export function upperBound(arr: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
