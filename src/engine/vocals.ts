import { pitchDistance } from '../audio/pitch.ts';
import type { TempoMap } from '../chart/tempo.ts';
import type { Difficulty, Track } from '../chart/types.ts';
import { TAP } from '../chart/types.ts';
import { Engine, HIT, POINTS_PER_NOTE, SUSTAIN_POINTS_PER_BEAT } from './engine.ts';
import type { EngineConfig } from './engine.ts';

/** How far off (semitones, any octave) a sung pitch may be and still count, per difficulty. */
export const VOCAL_TOLERANCE: Record<Difficulty, number> = { easy: 3, medium: 2.2, hard: 1.5, expert: 1 };
/** Share of a note that has to be sung in tune for it to count, per difficulty. */
export const VOCAL_NEEDED: Record<Difficulty, number> = { easy: 0.3, medium: 0.4, hard: 0.5, expert: 0.6 };
/** Phrase ratings, Rock Band style, from the share of the phrase sung in tune. */
export const PHRASE_RATINGS = ['Awful', 'Messy', 'OK', 'Good', 'Strong', 'Awesome'] as const;
const RATING_AT = [0.25, 0.45, 0.65, 0.8, 0.92];

/** A sung share of a phrase (0..1) as a rating index into PHRASE_RATINGS. */
export function phraseRating(share: number): number {
  let r = 0;
  while (r < RATING_AT.length && share >= RATING_AT[r]) r++;
  return r;
}

/**
 * Judges singing. Each frame the game reports what is sung (sing()); every note collects the time it was
 * sung in tune (any octave; spoken notes just need a voice) and is judged when it ends: a hit when enough
 * of it was in tune, scored by how much. Streak, multiplier, Star Power, the rock meter and events are the
 * engine's own.
 */
export class VocalJudge extends Engine {
  /** seconds each note has been sung in tune */
  readonly sung: Float32Array;
  /** the bot: every note is sung perfectly */
  autoSing = false;
  /** rating index of each phrase (line) sung so far */
  readonly ratings: number[] = [];
  private readonly tolerance: number;
  private readonly needed: number;
  private lastSing = -Infinity;
  private line = 0;

  constructor(track: Track, tempo: TempoMap, cfg: Partial<EngineConfig> = {}, range?: { first: number; last: number }) {
    super(track, tempo, cfg, range);
    this.sung = new Float32Array(track.notes.length);
    this.tolerance = VOCAL_TOLERANCE[track.difficulty];
    this.needed = VOCAL_NEEDED[track.difficulty];
    const lines = track.lines ?? [];
    while (this.line < lines.length && lines[this.line].last < this.next) this.line++;
  }

  /** What is sung at song time t: a pitch (MIDI; NaN for none) and whether there is a voice at all. */
  sing(t: number, pitch: number, voiced: boolean): void {
    // one reading stands for the time since the last (a slow frame included, up to half a second)
    const from = Math.max(this.lastSing, t - 0.5);
    this.lastSing = t;
    if (!(t > from)) return;
    const N = this.notes;
    for (let i = this.next; i < this.end; i++) {
      const s = N.time[i];
      if (s >= t) break;
      const e = N.endTime[i];
      if (e <= from) continue;
      const ok = N.type[i] === TAP ? voiced : pitch === pitch && Math.abs(pitchDistance(pitch, N.mask[i])) <= this.tolerance;
      if (ok) this.sung[i] += Math.min(t, e) - Math.max(from, s);
    }
  }

  /** How far through note i the singing has got in tune (0..1), for drawing. */
  progress(i: number): number {
    const N = this.notes;
    return Math.min(1, this.sung[i] / Math.max(0.05, N.endTime[i] - N.time[i]));
  }

  override advance(t: number): number {
    if (t <= this.time) return this.time;
    const N = this.notes;
    while (this.next < this.end && N.endTime[this.next] <= t) {
      const n = this.next;
      if (this.autoSing) this.sung[n] = N.endTime[n] - N.time[n];
      const share = this.progress(n);
      if (share >= this.needed) this.vocalHit(n, share);
      else this.miss(n, N.endTime[n], 'late');
      this.rateLines();
    }
    return super.advance(t);
  }

  private vocalHit(n: number, share: number) {
    const N = this.notes;
    const t = N.endTime[n];
    this.noteState[n] = HIT;
    this.hitDelta[n] = 0;
    this.next = n + 1;
    this.hits++;
    this.rock = Math.min(1, this.rock + this.cfg.rockGain);
    this.streak++;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;
    this.checkMultiplier(t);
    // a note is worth what a sustained gem of its length is, scaled by how much of it was in tune
    const beats = this.tempo.timeToBeat(t) - this.tempo.timeToBeat(N.time[n]);
    this.score += Math.round((POINTS_PER_NOTE + beats * SUSTAIN_POINTS_PER_BEAT) * Math.min(1, share / 0.9)) * this.multiplier;
    const e = this.emit('hit', t);
    e.note = n;
    e.delta = 0;
    e.strum = false;
    e.auto = true;
    const sp = N.sp[n];
    if (sp >= 0 && !this.spBroken[sp] && this.phraseDone(sp, n)) {
      this.spBar = Math.min(1, this.spBar + 0.25);
      this.spPhrasesHit++;
      const p = this.emit('spPhrase', t);
      p.phrase = sp;
      p.complete = true;
    }
  }

  /** Lines whose last note has been judged get their rating. */
  private rateLines() {
    const lines = this.track.lines ?? [];
    const N = this.notes;
    while (this.line < lines.length && lines[this.line].last < this.next) {
      const l = lines[this.line];
      let sung = 0;
      let total = 0;
      let hits = 0;
      for (let i = l.first; i <= l.last; i++) {
        const d = Math.max(0.05, N.endTime[i] - N.time[i]);
        total += d;
        sung += Math.min(d, this.sung[i]);
        if (this.noteState[i] === HIT) hits++;
      }
      const r = phraseRating(total ? sung / total : 0);
      this.ratings.push(r);
      const e = this.emit('vocalPhrase', N.endTime[l.last]);
      e.value = r;
      e.hits = hits;
      e.total = l.last - l.first + 1;
      this.line++;
    }
  }
}
