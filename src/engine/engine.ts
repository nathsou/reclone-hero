import type { TempoMap } from '../chart/tempo.ts';
import type { NoteList, Track } from '../chart/types.ts';
import { GEM_COUNT, STRUM, TAP } from '../chart/types.ts';

export interface EngineConfig {
  /** seconds a note may be hit before its time */
  early: number;
  /** seconds a note may be hit after its time */
  late: number;
  /** a strum may precede the matching fret press by this long */
  strumLeniency: number;
  /** strums shortly after a hammered HOPO/tap are forgiven */
  hopoStrumGrace: number;
  /** releasing a sustain this close to its end still counts as complete */
  sustainGrace: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  early: 0.07,
  late: 0.07,
  strumLeniency: 0.05,
  hopoStrumGrace: 0.09,
  sustainGrace: 0.1,
};

export const PENDING = 0;
export const HIT = 1;
export const MISSED = 2;

export const POINTS_PER_NOTE = 50;
export const SUSTAIN_POINTS_PER_BEAT = 25;
export const SOLO_BONUS_PER_NOTE = 100;
const SP_PHRASE_GAIN = 0.25;
const SP_BEATS_FULL_BAR = 32;
const SP_WHAMMY_GAIN_PER_BEAT = 1 / 30;

export type MissReason = 'late' | 'wrong' | 'skipped';

export type EngineEventType =
  | 'hit'
  | 'miss'
  | 'overstrum'
  | 'streakBreak'
  | 'multiplier'
  | 'sustainDrop'
  | 'sustainEnd'
  | 'spPhrase'
  | 'spActivate'
  | 'spEnd'
  | 'soloStart'
  | 'soloEnd';

/**
 * One judgement event. Records are pooled and reused: read them before the next engine call, and
 * copy what you need to keep. Fields not relevant to a type hold stale values.
 */
export interface EngineEvent {
  type: EngineEventType;
  t: number;
  /** note index: hit, miss, sustainDrop, sustainEnd */
  note: number;
  /** hit: seconds early (-) or late (+) */
  delta: number;
  /** hit: by strum (vs hammer-on/pull-off) */
  strum: boolean;
  /** hit: auto-hit because frets were already held when the window opened */
  auto: boolean;
  reason: MissReason;
  /** frets held: miss, overstrum */
  frets: number;
  /** streakBreak: the streak that was lost */
  streak: number;
  /** multiplier: new value */
  value: number;
  /** spPhrase: phrase index and whether it was completed */
  phrase: number;
  complete: boolean;
  /** soloStart/soloEnd */
  solo: number;
  hits: number;
  total: number;
  bonus: number;
}

function newEvent(): EngineEvent {
  return { type: 'hit', t: 0, note: -1, delta: 0, strum: false, auto: false, reason: 'late', frets: 0, streak: 0, value: 0, phrase: -1, complete: false, solo: -1, hits: 0, total: 0, bonus: 0 };
}

/** A sustain being held: the note index plus copies of the fields the judge needs. */
export interface ActiveSustain {
  note: number;
  mask: number;
  count: number;
  sp: number;
  endTime: number;
  lastBeat: number;
}

function highestBit(m: number): number {
  return m === 0 ? 0 : 1 << (31 - Math.clz32(m));
}

/**
 * Judges player input against one track. Pure game logic: no audio, video or DOM.
 * Every input carries its own timestamp (song seconds) so judgement is independent of frame rate.
 */
export class Engine {
  readonly track: Track;
  readonly notes: NoteList;
  readonly cfg: EngineConfig;
  private readonly tempo: TempoMap;

  readonly noteState: Uint8Array;
  readonly hitDelta: Float32Array;
  readonly spBroken: Uint8Array;
  /** notes that were ghosted (a wrong higher fret pressed in their window): they must be strummed */
  readonly ghosted: Uint8Array;

  time = -Infinity;
  frets = 0;
  whammy = 0;
  streak = 0;
  maxStreak = 0;
  score = 0;
  spBar = 0;
  spActive = false;
  sustains: ActiveSustain[] = [];
  hits = 0;
  misses = 0;
  overstrums = 0;
  spPhrasesHit = 0;
  /** index of the solo currently in progress, or -1 */
  activeSolo = -1;

  private next: number;
  private readonly end: number;
  private lastNoteHit = true;
  private lastHitTime = -Infinity;
  private lastHammerTime = -Infinity;
  private fretChangeTime = -Infinity;
  private lastWhammyMove = -Infinity;
  private lastDrainBeat = 0;
  /** a strum waiting (strum leniency) for its fret press; NaN when none */
  private pendingT = NaN;
  private pendingDeadline = NaN;
  private soloCursor = 0;
  private lastMultiplier = 1;
  private readonly events: EngineEvent[] = [];
  private eventCount = 0;
  private readonly sustainPool: ActiveSustain[] = [];

  constructor(track: Track, tempo: TempoMap, cfg: Partial<EngineConfig> = {}, range?: { first: number; last: number }) {
    this.track = track;
    this.notes = track.notes;
    this.tempo = tempo;
    this.cfg = { ...DEFAULT_ENGINE_CONFIG, ...cfg };
    this.noteState = new Uint8Array(this.notes.length);
    this.hitDelta = new Float32Array(this.notes.length);
    this.spBroken = new Uint8Array(track.starPower.length);
    this.ghosted = new Uint8Array(this.notes.length);
    this.next = range?.first ?? 0;
    this.end = range ? range.last + 1 : this.notes.length;
    while (this.soloCursor < track.solos.length && track.solos[this.soloCursor].last < this.next) this.soloCursor++;
    // Phrases that start before the practice range cannot be completed.
    for (let i = 0; i < track.starPower.length; i++) {
      const p = track.starPower[i];
      if (p.first < this.next || p.last >= this.end) this.spBroken[i] = 1;
    }
  }

  get multiplier(): number {
    return this.baseMultiplier * (this.spActive ? 2 : 1);
  }

  get baseMultiplier(): number {
    return Math.min(4, 1 + Math.floor(this.streak / 10));
  }

  /** Index of the first note that has not been judged yet. */
  get nextNote(): number {
    return this.next;
  }

  get finished(): boolean {
    return this.next >= this.end && this.sustains.length === 0 && !this.hasPending;
  }

  private get hasPending(): boolean {
    return this.pendingT === this.pendingT;
  }

  /** Number of events since the last clearEvents(); read them with event(i). Allocation-free. */
  get pendingEvents(): number {
    return this.eventCount;
  }

  event(i: number): EngineEvent {
    return this.events[i];
  }

  clearEvents(): void {
    this.eventCount = 0;
  }

  /** Copy out and clear the pending events (allocates; convenient for tests and tools). */
  drainEvents(): EngineEvent[] {
    const out: EngineEvent[] = [];
    for (let i = 0; i < this.eventCount; i++) out.push({ ...this.events[i] });
    this.eventCount = 0;
    return out;
  }

  // ---------------------------------------------------------------- inputs

  setFrets(t: number, mask: number): void {
    t = this.advance(t);
    if (mask === this.frets) return;
    const gained = mask & ~this.frets;
    this.frets = mask;
    this.fretChangeTime = t;

    for (let i = this.sustains.length - 1; i >= 0; i--) {
      const s = this.sustains[i];
      if ((s.mask & ~mask) !== 0) {
        this.accrueSustain(s, t);
        this.removeSustain(i);
        this.emit(t < s.endTime - this.cfg.sustainGrace ? 'sustainDrop' : 'sustainEnd', t).note = s.note;
      }
    }

    if (this.hasPending) {
      // Strum came first; the fret press completes it within the leniency window.
      const pt = this.pendingT;
      const n = this.findStrumTarget(pt);
      if (n >= 0) {
        this.pendingT = this.pendingDeadline = NaN;
        this.hit(n, pt, true, false);
        return;
      }
    }

    const n = this.next;
    const N = this.notes;
    if (n < this.end && N.type[n] !== STRUM && this.inWindow(n, t)) {
      if (this.canHammer(n) && this.matches(n)) this.hit(n, t, false, false);
      // Anti-ghosting: pressing a wrong, higher fret over a single HOPO/tap forfeits the hammer-on.
      else if (gained && GEM_COUNT[N.mask[n]] === 1 && N.mask[n] !== 0 && highestBit(gained) > N.mask[n]) this.ghosted[n] = 1;
    }
  }

  strum(t: number): void {
    t = this.advance(t);
    if (this.hasPending) this.failPending(t);
    const n = this.findStrumTarget(t);
    if (n >= 0) {
      this.hit(n, t, true, false);
      return;
    }
    if (t - this.lastHammerTime < this.cfg.hopoStrumGrace) {
      this.lastHammerTime = -Infinity; // forgive a single strum per hammer
      return;
    }
    this.pendingT = t;
    this.pendingDeadline = t + this.cfg.strumLeniency;
  }

  setWhammy(t: number, value: number): void {
    t = this.advance(t);
    if (Math.abs(value - this.whammy) > 0.04) this.lastWhammyMove = t;
    this.whammy = value;
  }

  activateStarPower(t: number): boolean {
    t = this.advance(t);
    if (this.spActive || this.spBar < 0.5 - 1e-9) return false;
    this.spActive = true;
    this.lastDrainBeat = this.tempo.timeToBeat(t);
    this.emit('spActivate', t);
    this.checkMultiplier(t);
    return true;
  }

  /** Move the engine clock forward, judging anything that has become final. Returns the (clamped) time. */
  advance(t: number): number {
    if (t <= this.time) return this.time;
    const { early, late } = this.cfg;

    if (this.hasPending && this.pendingDeadline <= t) this.failPending(this.pendingDeadline);

    // HOPOs/taps whose fret state was set up before their window opened.
    const N = this.notes;
    for (;;) {
      const n = this.next;
      if (n >= this.end || N.type[n] === STRUM) break;
      const open = N.time[n] - early;
      if (open > t || !this.canHammer(n) || !this.matches(n) || this.fretChangeTime <= this.lastHitTime) break;
      this.hit(n, Math.max(open, this.fretChangeTime, this.time), false, true);
    }

    while (this.next < this.end && N.time[this.next] + late < t) {
      const n = this.next;
      this.miss(n, N.time[n] + late, 'late');
    }

    for (let i = this.sustains.length - 1; i >= 0; i--) {
      const s = this.sustains[i];
      this.accrueSustain(s, t);
      if (t >= s.endTime) {
        this.removeSustain(i);
        this.emit('sustainEnd', s.endTime).note = s.note;
      }
    }

    if (this.spActive) {
      const beat = this.tempo.timeToBeat(t);
      this.spBar -= (beat - this.lastDrainBeat) / SP_BEATS_FULL_BAR;
      this.lastDrainBeat = beat;
      if (this.spBar <= 0) {
        this.spBar = 0;
        this.spActive = false;
        this.emit('spEnd', t);
        this.checkMultiplier(t);
      }
    }

    const solos = this.track.solos;
    if (this.activeSolo < 0 && this.soloCursor < solos.length && solos[this.soloCursor].startTime - 0.001 <= t) {
      if (solos[this.soloCursor].first < this.end) {
        this.activeSolo = this.soloCursor;
        this.emit('soloStart', t).solo = this.soloCursor;
      } else this.soloCursor = solos.length;
    }
    if (this.activeSolo >= 0) {
      const s = solos[this.activeSolo];
      if (t > Math.max(s.endTime, N.time[s.last] + late)) {
        let hits = 0;
        const last = Math.min(s.last, this.end - 1);
        for (let i = s.first; i <= last; i++) if (this.noteState[i] === HIT) hits++;
        const total = last - s.first + 1;
        const bonus = hits * SOLO_BONUS_PER_NOTE;
        this.score += bonus;
        const e = this.emit('soloEnd', t);
        e.solo = this.activeSolo;
        e.hits = hits;
        e.total = total;
        e.bonus = bonus;
        this.activeSolo = -1;
        this.soloCursor++;
      }
    }

    this.time = t;
    return t;
  }

  // ---------------------------------------------------------------- judgement

  private inWindow(n: number, t: number): boolean {
    const time = this.notes.time[n];
    return t >= time - this.cfg.early && t <= time + this.cfg.late;
  }

  private canHammer(n: number): boolean {
    return !this.ghosted[n] && (this.notes.type[n] === TAP || this.lastNoteHit);
  }

  /** Frets match note n, ignoring frets held for other still-ringing sustains. */
  matches(n: number, frets = this.frets): boolean {
    const mask = this.notes.mask[n];
    let f = frets;
    const sus = this.sustains;
    for (let i = 0; i < sus.length; i++) if ((sus[i].mask & mask) === 0) f &= ~sus[i].mask;
    if (mask === 0) return f === 0;
    if (GEM_COUNT[mask] === 1) return highestBit(f) === mask;
    return f === mask;
  }

  /** Index of the note a strum at time t would hit with the current frets, or -1. */
  private findStrumTarget(t: number): number {
    const time = this.notes.time;
    for (let i = this.next; i < this.end; i++) {
      if (time[i] - this.cfg.early > t) break;
      if (this.noteState[i] !== PENDING || time[i] + this.cfg.late < t) continue;
      if (this.matches(i)) return i;
    }
    return -1;
  }

  private failPending(t: number): void {
    const pt = this.pendingT;
    this.pendingT = this.pendingDeadline = NaN;
    // A wrong-fret strum while a note is in reach costs that note; otherwise it is an overstrum.
    const n = this.next;
    if (n < this.end && this.inWindow(n, pt)) {
      this.miss(n, t, 'wrong');
    } else {
      this.overstrums++;
      this.emit('overstrum', pt).frets = this.frets;
      while (this.sustains.length) {
        const s = this.sustains[this.sustains.length - 1];
        this.accrueSustain(s, t);
        this.emit('sustainDrop', t).note = s.note;
        this.removeSustain(this.sustains.length - 1);
      }
      this.lastNoteHit = false;
      this.breakStreak(t);
    }
  }

  private hit(n: number, t: number, strum: boolean, auto: boolean): void {
    const N = this.notes;
    for (let i = this.next; i < n; i++) if (this.noteState[i] === PENDING) this.miss(i, t, 'skipped');
    const mask = N.mask[n];
    const time = N.time[n];
    this.noteState[n] = HIT;
    this.hitDelta[n] = t - time;
    this.next = n + 1;
    this.hits++;

    for (let i = this.sustains.length - 1; i >= 0; i--) {
      const s = this.sustains[i];
      if ((s.mask & mask) !== 0 || s.mask === 0 || mask === 0) {
        this.accrueSustain(s, t);
        this.removeSustain(i);
        this.emit('sustainEnd', t).note = s.note;
      }
    }

    this.streak++;
    if (this.streak > this.maxStreak) this.maxStreak = this.streak;
    this.checkMultiplier(t);
    this.score += POINTS_PER_NOTE * GEM_COUNT[mask] * this.multiplier;
    if (N.endTime[n] > time) {
      const sus = this.sustainPool.pop() ?? { note: 0, mask: 0, count: 0, sp: -1, endTime: 0, lastBeat: 0 };
      sus.note = n;
      sus.mask = mask;
      sus.count = GEM_COUNT[mask];
      sus.sp = N.sp[n];
      sus.endTime = N.endTime[n];
      sus.lastBeat = this.tempo.timeToBeat(time);
      this.sustains.push(sus);
    }

    this.lastNoteHit = true;
    this.lastHitTime = t;
    if (!strum) this.lastHammerTime = t;
    const e = this.emit('hit', t);
    e.note = n;
    e.delta = t - time;
    e.strum = strum;
    e.auto = auto;

    const sp = N.sp[n];
    if (sp >= 0 && !this.spBroken[sp] && this.track.starPower[sp].last === n) {
      this.spBar = Math.min(1, this.spBar + SP_PHRASE_GAIN);
      this.spPhrasesHit++;
      const p = this.emit('spPhrase', t);
      p.phrase = sp;
      p.complete = true;
    }
  }

  private miss(n: number, t: number, reason: MissReason): void {
    this.noteState[n] = MISSED;
    if (n >= this.next) this.next = n + 1;
    this.misses++;
    this.lastNoteHit = false;
    const e = this.emit('miss', t);
    e.note = n;
    e.reason = reason;
    e.frets = this.frets;
    const sp = this.notes.sp[n];
    if (sp >= 0 && !this.spBroken[sp]) {
      this.spBroken[sp] = 1;
      const p = this.emit('spPhrase', t);
      p.phrase = sp;
      p.complete = false;
    }
    this.breakStreak(t);
  }

  private breakStreak(t: number): void {
    if (this.streak > 0) this.emit('streakBreak', t).streak = this.streak;
    this.streak = 0;
    this.checkMultiplier(t);
  }

  private checkMultiplier(t: number): void {
    const m = this.multiplier;
    if (m !== this.lastMultiplier) {
      this.lastMultiplier = m;
      this.emit('multiplier', t).value = m;
    }
  }

  private accrueSustain(s: ActiveSustain, t: number): void {
    const beat = this.tempo.timeToBeat(Math.min(t, s.endTime));
    const beats = beat - s.lastBeat;
    if (beats <= 0) return;
    s.lastBeat = beat;
    this.score += beats * SUSTAIN_POINTS_PER_BEAT * s.count * this.multiplier;
    if (s.sp >= 0 && !this.spBroken[s.sp] && t - this.lastWhammyMove < 0.15) {
      this.spBar = Math.min(1, this.spBar + beats * SP_WHAMMY_GAIN_PER_BEAT);
    }
  }

  /** Take a pooled event record, set its type and time, and queue it. */
  private emit(type: EngineEventType, t: number): EngineEvent {
    let e = this.events[this.eventCount];
    if (!e) this.events.push((e = newEvent()));
    this.eventCount++;
    e.type = type;
    e.t = t;
    return e;
  }

  /** Remove sustains[i] without allocating (order is irrelevant) and recycle it. */
  private removeSustain(i: number): void {
    const list = this.sustains;
    const s = list[i];
    list[i] = list[list.length - 1];
    list.pop();
    this.sustainPool.push(s);
  }

}

/** Score for hitting every note at 1x, used for star ratings. */
export function baseScore(track: Track, tempo: TempoMap): number {
  let total = 0;
  const N = track.notes;
  for (let i = 0; i < N.length; i++) {
    const count = GEM_COUNT[N.mask[i]];
    total += POINTS_PER_NOTE * count;
    if (N.endTime[i] > N.time[i]) total += (tempo.timeToBeat(N.endTime[i]) - tempo.timeToBeat(N.time[i])) * SUSTAIN_POINTS_PER_BEAT * count;
  }
  return total;
}

const STAR_THRESHOLDS = [0.21, 0.46, 0.77, 1.85, 3.08, 4.52];

/** Stars (0-6, fractional progress towards the next star). 6 = gold. */
export function starProgress(score: number, base: number): number {
  if (base <= 0) return 0;
  const r = score / base;
  let prev = 0;
  for (let i = 0; i < STAR_THRESHOLDS.length; i++) {
    const th = STAR_THRESHOLDS[i];
    if (r < th) return i + (r - prev) / (th - prev);
    prev = th;
  }
  return 6;
}
