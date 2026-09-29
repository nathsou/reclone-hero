/**
 * Score model for the built-in songs. A song is written as code: text riffs in a small notation (see
 * `seq`) and drum grids (see `grid`), placed on a beat timeline. The same score renders the audio
 * (render.ts) and the chart (chartgen.ts), so notes and sound can never drift apart.
 */

/** A pitched note or chord. Times and durations are in beats (quarter notes). */
export interface Note {
  b: number;
  d: number;
  /** MIDI pitches, lowest first; one pitch is a single note */
  p: number[];
  /** 0..1 */
  v: number;
  /** palm mute / staccato: short, damped */
  mute?: boolean;
  /** bend up into the note from this many semitones below */
  bend?: number;
}

export interface Hit {
  b: number;
  /** drum voice, see DRUM_VOICES */
  k: DrumVoice;
  v: number;
}

export type DrumVoice = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'ohat' | 'ride' | 'crash' | 'tomHi' | 'tomMid' | 'tomLo' | 'shaker';

export type InstrumentKind =
  | 'drive' // high-gain rhythm guitar, double-tracked
  | 'lead' // singing lead guitar
  | 'clean' // clean electric with chorus
  | 'pickbass'
  | 'synthbass'
  | 'subbass'
  | 'supersaw'
  | 'pluck'
  | 'pad'
  | 'organ'
  | 'piano'
  | 'harpsichord'
  | 'strings'
  | 'bell'
  | 'choir'
  | 'chip' // 8-bit pulse wave
  | 'brass' // brassy saw with a filter swell
  | 'accordion' // two detuned reeds
  | 'fiddle' // bowed, with vibrato
  | 'banjo' // bright, fast-decaying pluck
  | 'timpani'; // tuned orchestral drum

export interface Part {
  inst: InstrumentKind;
  notes: Note[];
  /** linear gain */
  gain?: number;
  /** -1..1 */
  pan?: number;
  /** reverb send 0..1 */
  verb?: number;
  /** tempo-synced echo send 0..1 */
  echo?: number;
  /** duck under the kick (electro pumping), 0..1 */
  pump?: number;
  /** filter brightness 0..1 for synths */
  tone?: number;
}

export interface DrumPart {
  kit: 'rock' | 'electro' | 'orchestral';
  hits: Hit[];
  gain?: number;
  verb?: number;
}

export interface TempoPoint {
  beat: number;
  bpm: number;
}

export interface SongDef {
  id: string;
  name: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  /** composer credit for arrangements of public-domain works */
  composer?: string;
  loadingPhrase: string;
  tempo: TempoPoint[];
  /** time signature changes; den is the note value (4 = quarter) */
  timeSigs: { beat: number; num: number; den: number }[];
  sections: { beat: number; name: string }[];
  /** what the player plays (e.g. rhythm riffs and lead lines): rendered to the guitar stem and charted */
  player: Part[];
  backing: Part[];
  drums: DrumPart[];
  /** solo sections (beats) */
  solos: [number, number][];
  lengthBeats: number;
  previewBeat: number;
  /** cover art: two colours and a motif */
  art: { from: string; to: string; ink: string; motif: 'sun' | 'grid' | 'rings' | 'bars' | 'wave' | 'crest' | 'shards' | 'orbit' };
}

// ---------------------------------------------------------------- pitch

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" = 60, "F#2", "Bb3", "E-1". */
export function midi(name: string): number {
  const m = /^([A-G])([#b]*)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  let n = NOTE_INDEX[m[1]];
  for (const c of m[2]) n += c === '#' ? 1 : -1;
  return n + (Number(m[3]) + 1) * 12;
}

const CHORD_SHAPES: Record<string, number[]> = {
  '5': [0, 7, 12], // power chord
  '5s': [0, 7], // two-string power chord
  '8': [0, 12],
  M: [0, 4, 7],
  m: [0, 3, 7],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  add9: [0, 4, 7, 14],
  m9: [0, 3, 7, 10, 14],
};

// ---------------------------------------------------------------- notation

/**
 * Parse a riff. Tokens are separated by spaces; durations are in sixteenth notes and sticky:
 *
 *   E2:2      E2 for an eighth note          C#4 Bb3   pitches (octave numbers as in MIDI, C4 = 60)
 *   E2+B2     a chord                        E2^5      a chord shape (^5 power chord, ^m, ^M, ^m7…)
 *   E2*       palm muted / staccato          A4!       accent             D4?  soft
 *   G4/2      bend up 2 semitones into it
 *   .         rest                           ~         hold the previous note longer
 *   (… )x3    repeat a group                 :3/2      fractional durations (triplets: 4/3)
 *   |         bar line, ignored
 */
export function seq(text: string, start = 0, opts: { v?: number; transpose?: number } = {}): Note[] {
  const out: Note[] = [];
  let pos = start;
  let dur = 1;
  const baseV = opts.v ?? 0.8;
  const tr = opts.transpose ?? 0;
  const tokens = expandRepeats(text).split(/\s+/).filter((t) => t && t !== '|');
  for (const tok of tokens) {
    const m = /^([^:]*)(?::(\d+(?:\.\d+)?(?:\/\d+)?))?$/.exec(tok);
    if (!m) throw new Error(`Bad token "${tok}"`);
    if (m[2]) dur = m[2].includes('/') ? Number(m[2].split('/')[0]) / Number(m[2].split('/')[1]) : Number(m[2]);
    const beats = dur / 4;
    let body = m[1];
    if (body === '.' || body === '') {
      pos += beats;
      continue;
    }
    if (body === '~') {
      const last = out[out.length - 1];
      if (last) last.d += beats;
      pos += beats;
      continue;
    }
    let v = baseV;
    let mute = false;
    let bend = 0;
    // accent, soft, mute and bend suffixes, in any order
    for (;;) {
      const c = body[body.length - 1];
      const bm = /\/(\d)$/.exec(body);
      if (bm) {
        bend = Number(bm[1]);
        body = body.slice(0, -2);
        continue;
      }
      if (c === '!') v = Math.min(1, baseV + 0.2);
      else if (c === '?') v = baseV * 0.6;
      else if (c === '*') mute = true;
      else break;
      body = body.slice(0, -1);
    }
    const pitches: number[] = [];
    for (const part of body.split('+')) {
      const cm = /^([A-G][#b]*-?\d)(?:\^(\w+))?$/.exec(part);
      if (!cm) throw new Error(`Bad note "${part}" in "${tok}"`);
      const root = midi(cm[1]) + tr;
      if (cm[2]) {
        const shape = CHORD_SHAPES[cm[2]];
        if (!shape) throw new Error(`Unknown chord shape ^${cm[2]}`);
        for (const s of shape) pitches.push(root + s);
      } else pitches.push(root);
    }
    pitches.sort((a, b) => a - b);
    out.push({ b: pos, d: beats, p: [...new Set(pitches)], v, mute: mute || undefined, bend: bend || undefined });
    pos += beats;
  }
  return out;
}

function expandRepeats(text: string): string {
  let s = text;
  for (let guard = 0; guard < 50; guard++) {
    const next = s.replace(/\(([^()]*)\)x(\d+)/g, (_, body: string, n: string) => Array(Number(n)).fill(body).join(' '));
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Total length in beats of a riff (for chaining). */
export function seqLength(notes: Note[], start = 0): number {
  let end = start;
  for (const n of notes) end = Math.max(end, n.b + n.d);
  return end - start;
}

/**
 * Drum grid: one string per voice, one character per step (default a sixteenth note).
 * `x` hit, `X` accent, `g` ghost, `.` rest, spaces and `|` ignored.
 */
export function grid(lines: Partial<Record<DrumVoice, string>>, start = 0, step = 0.25): Hit[] {
  const out: Hit[] = [];
  for (const [voice, line] of Object.entries(lines) as [DrumVoice, string][]) {
    const cells = line.replace(/[\s|]/g, '');
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c === '.') continue;
      const v = c === 'X' ? 1 : c === 'g' ? 0.35 : c === 'o' ? 0.8 : 0.78;
      out.push({ b: start + i * step, k: voice, v });
    }
  }
  return out;
}

/** Shift a list of notes or hits in time. */
export function at<T extends { b: number }>(items: T[], beat: number): T[] {
  return items.map((x) => ({ ...x, b: x.b + beat }));
}

/** Repeat a pattern `times` times, `every` beats apart. */
export function loop<T extends { b: number }>(items: T[], times: number, every: number, start = 0): T[] {
  const out: T[] = [];
  for (let i = 0; i < times; i++) for (const x of items) out.push({ ...x, b: x.b + start + i * every });
  return out;
}

export function transpose(notes: Note[], semis: number): Note[] {
  return notes.map((n) => ({ ...n, p: n.p.map((p) => p + semis) }));
}

// ---------------------------------------------------------------- tempo

/** Beat <-> seconds for a stepwise tempo map. */
export class Tempo {
  private readonly pts: { beat: number; bpm: number; sec: number }[];

  constructor(points: TempoPoint[]) {
    const sorted = [...points].sort((a, b) => a.beat - b.beat);
    if (!sorted.length || sorted[0].beat > 0) sorted.unshift({ beat: 0, bpm: sorted[0]?.bpm ?? 120 });
    let sec = 0;
    this.pts = sorted.map((p, i) => {
      if (i > 0) sec += ((p.beat - sorted[i - 1].beat) * 60) / sorted[i - 1].bpm;
      return { ...p, sec };
    });
  }

  toSec(beat: number): number {
    const pts = this.pts;
    let i = pts.length - 1;
    while (i > 0 && pts[i].beat > beat) i--;
    return pts[i].sec + ((beat - pts[i].beat) * 60) / pts[i].bpm;
  }

  toBeat(sec: number): number {
    const pts = this.pts;
    let i = pts.length - 1;
    while (i > 0 && pts[i].sec > sec) i--;
    return pts[i].beat + ((sec - pts[i].sec) * pts[i].bpm) / 60;
  }

  bpmAt(beat: number): number {
    const pts = this.pts;
    let i = pts.length - 1;
    while (i > 0 && pts[i].beat > beat) i--;
    return pts[i].bpm;
  }
}

/** Root notes of a riff, shifted (e.g. a bass line doubling guitar chords an octave down). */
export function roots(notes: Note[], semis = -12, opts: { mute?: boolean } = {}): Note[] {
  return notes.map((n) => ({ ...n, p: [n.p[0] + semis], mute: opts.mute ?? n.mute }));
}

/**
 * Arpeggiate chords: `pattern` indexes into each chord's pitches (lowest first; indexes past the
 * top wrap up an octave), one step every `step` beats, `steps` steps per chord.
 */
export function arp(chords: number[][], pattern: number[], step: number, steps: number, start: number, v = 0.75): Note[] {
  const out: Note[] = [];
  chords.forEach((ch, c) => {
    for (let i = 0; i < steps; i++) {
      const k = pattern[i % pattern.length];
      const p = ch[k % ch.length] + 12 * Math.floor(k / ch.length);
      out.push({ b: start + (c * steps + i) * step, d: step, p: [p], v: i % 4 === 0 ? v + 0.1 : v });
    }
  });
  return out;
}

/** Pitches of a chord written in the riff notation, e.g. chord('F3^m') or chord('Db3+F3+Ab3'). */
export function chord(text: string): number[] {
  return seq(text)[0].p;
}

/** Move each note `steps` scale degrees within `scale` (pitch classes), e.g. a harmony a third below. */
export function diatonic(notes: Note[], scale: number[], steps: number): Note[] {
  const pcs = [...scale].sort((a, b) => a - b);
  return notes.map((n) => ({
    ...n,
    p: n.p.map((p) => {
      let deg = pcs.indexOf(((p % 12) + 12) % 12);
      if (deg < 0) return p; // chromatic note: leave it
      let q = p;
      for (let s = 0; s < Math.abs(steps); s++) {
        const dir = Math.sign(steps);
        const next = (deg + dir + pcs.length) % pcs.length;
        let diff = pcs[next] - pcs[deg];
        if (dir > 0 && diff <= 0) diff += 12;
        if (dir < 0 && diff >= 0) diff -= 12;
        q += diff;
        deg = next;
      }
      return q;
    }),
  }));
}
