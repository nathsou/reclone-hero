import { audio } from '../audio/audio.ts';
import { timingMap } from './model.ts';
import type { StudioProject } from './model.ts';
import type { Difficulty } from '../chart/types.ts';

/** Short lookahead schedules clicks on the audio clock, including slowed preview playback. */
export class StudioClicks {
  mode: 'off' | 'notes' | 'beats' = 'off';
  private until = -1;
  private previous = -1;
  private voices = new Set<OscillatorNode>();
  reset(): void {
    for (const node of this.voices) { try { node.stop(); } catch { /* already ended */ } }
    this.voices.clear(); this.until = -1; this.previous = -1;
  }
  update(p: StudioProject, difficulty: Difficulty, media: HTMLAudioElement): void {
    if (this.mode === 'off' || media.paused) { if (this.until >= 0) this.reset(); return; }
    const time = media.currentTime;
    if (time < this.previous || Math.abs(time - this.previous) > 0.3) this.reset();
    this.previous = time;
    const from = Math.max(time, this.until), to = time + 0.12 * media.playbackRate;
    const times: number[] = [];
    if (this.mode === 'notes') {
      for (const n of p.notes[difficulty]) if (n.time >= from && n.time < to && times[times.length - 1] !== n.time) times.push(n.time);
    } else {
      const { map } = timingMap(p);
      for (let beat = Math.ceil(map.timeToBeat(from)); map.tickToTime(beat * 480) < to; beat++) times.push(map.tickToTime(beat * 480));
    }
    const ctx = audio().ctx;
    for (const t of times) {
      const when = ctx.currentTime + (t - time) / media.playbackRate;
      const node = ctx.createOscillator(), gain = ctx.createGain();
      node.frequency.value = this.mode === 'notes' ? 1000 : 1600;
      gain.gain.setValueAtTime(0.09, when); gain.gain.exponentialRampToValueAtTime(0.001, when + 0.035);
      node.connect(gain); gain.connect(ctx.destination); node.start(when); node.stop(when + 0.04);
      this.voices.add(node); node.onended = () => { this.voices.delete(node); node.disconnect(); gain.disconnect(); };
    }
    this.until = to;
  }
}
