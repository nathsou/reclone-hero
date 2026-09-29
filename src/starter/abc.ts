import type { Note } from './score.ts';

/**
 * A small reader for ABC notation, the plain-text format folk-tune collections use, so built-in
 * arrangements of traditional and public-domain tunes can quote their melodies exactly.
 *
 * Supported: headers L: M: K: (major, minor and modes), notes with octave marks and accidentals
 * (carried through the bar), lengths (2, /2, 3/2, /), broken rhythm (> <), ties, chords [CEG], rests
 * z x Z, triplets (3, repeats |: :| :: with first and second endings, chord symbols "Am" (kept as
 * harmony), inline [K:] changes. Decorations, grace notes, lyrics and comments are skipped.
 */

export interface AbcTune {
  notes: Note[];
  /** chord symbols, e.g. { b: 4, name: 'Am' } */
  chords: { b: number; name: string }[];
  /** beats (quarter notes) per bar */
  bar: number;
  /** length in beats */
  length: number;
  /** the length of every bar as played (beats), to check a transcription adds up */
  bars: number[];
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const MODE_SHIFT: Record<string, number> = { maj: 0, ion: 0, '': 0, m: -3, min: -3, aeo: -3, mix: -1, dor: -2, phr: -4, lyd: 1, loc: -5 };
const MAJOR_FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };

/** Key signature as letter -> semitone offset. */
function keySignature(k: string): Record<string, number> {
  const m = /^([A-G])([#b]?)\s*([a-zA-Z]*)/.exec(k.trim());
  const sig: Record<string, number> = {};
  if (!m || /^none/i.test(k.trim())) return sig;
  const mode = m[3].toLowerCase().slice(0, 3);
  const tonic = m[1] + m[2];
  // fifths of the tonic as a major key, shifted for the mode
  const order = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  let fifths = MAJOR_FIFTHS[tonic];
  if (fifths === undefined) fifths = order.indexOf(tonic) - 7;
  fifths += MODE_SHIFT[mode] ?? (mode.startsWith('m') ? -3 : 0);
  if (fifths > 0) for (let i = 0; i < fifths; i++) sig[SHARPS[i]] = 1;
  if (fifths < 0) for (let i = 0; i < -fifths; i++) sig[SHARPS[6 - i]] = -1;
  return sig;
}

function fraction(s: string): number {
  const [a, b] = s.split('/');
  return Number(a) / Number(b);
}

type Tok =
  | { t: 'note'; pitches: number[]; len: number; tie: boolean }
  | { t: 'rest'; len: number; bar?: boolean }
  | { t: 'broken'; dir: '>' | '<'; n: number }
  | { t: 'tuplet'; p: number; q: number; r: number }
  | { t: 'bar'; kind: string; ending: number }
  | { t: 'chord'; name: string }
  | { t: 'key'; value: string };

export function abc(text: string, opts: { transpose?: number; v?: number } = {}): AbcTune {
  let unit = 1 / 8; // of a whole note
  let meter = 4; // beats per bar
  let key: Record<string, number> = {};
  const body: string[] = [];
  let unitSet = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/%.*$/, '').trim();
    if (!line) continue;
    const hm = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (hm && !/^\|/.test(line)) {
      const [, f, v] = hm;
      if (f === 'L') {
        unit = fraction(v);
        unitSet = true;
      } else if (f === 'M') {
        const mm = /(\d+)\/(\d+)/.exec(v);
        if (v === 'C' || v === 'C|') meter = v === 'C' ? 4 : 4;
        else if (mm) {
          meter = (Number(mm[1]) * 4) / Number(mm[2]);
          if (!unitSet) unit = Number(mm[1]) / Number(mm[2]) < 0.75 ? 1 / 16 : 1 / 8;
        }
      } else if (f === 'K') {
        key = keySignature(v);
        if (body.length) body.push(`[K:${v}]`);
      } else if (f === 'w' || f === 'W') continue;
      continue;
    }
    body.push(line.replace(/\\$/, ''));
  }
  const src = body.join(' ');
  const beatsPerUnit = unit * 4;

  // ---- tokenize
  const toks: Tok[] = [];
  let i = 0;
  const lengthAt = (): number => {
    const m = /^(\d*)(\/*)(\d*)/.exec(src.slice(i))!;
    i += m[0].length;
    let len = m[1] ? Number(m[1]) : 1;
    if (m[2]) len /= m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length;
    return len;
  };
  const noteAt = (barAcc: Record<string, number>): number | null => {
    let acc: number | null = null;
    const am = /^(\^\^|\^|__|_|=)/.exec(src.slice(i));
    if (am) {
      acc = { '^^': 2, '^': 1, __: -2, _: -1, '=': 0 }[am[1]]!;
      i += am[1].length;
    }
    const c = src[i];
    if (!/[A-Ga-g]/.test(c)) return null;
    i++;
    const letter = c.toUpperCase();
    let octave = c === letter ? 4 : 5;
    while (src[i] === ',' || src[i] === "'") {
      octave += src[i] === "'" ? 1 : -1;
      i++;
    }
    const id = `${letter}${octave}`;
    if (acc !== null) barAcc[id] = acc;
    const shift = barAcc[id] ?? key[letter] ?? 0;
    return (octave + 1) * 12 + LETTER_PC[letter] + shift;
  };
  let barAcc: Record<string, number> = {};
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '`') {
      i++;
    } else if (c === '"') {
      const end = src.indexOf('"', i + 1);
      const name = src.slice(i + 1, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end + 1;
      if (/^[A-G]/.test(name)) toks.push({ t: 'chord', name });
    } else if (c === '!' || c === '+') {
      const end = src.indexOf(c, i + 1);
      i = end < 0 ? i + 1 : end + 1;
    } else if (c === '{') {
      const end = src.indexOf('}', i);
      i = end < 0 ? src.length : end + 1;
    } else if (c === '[' && /^\[[A-Za-z]:/.test(src.slice(i))) {
      const end = src.indexOf(']', i);
      const field = src.slice(i + 1, end);
      if (field[0] === 'K') {
        key = keySignature(field.slice(2));
        toks.push({ t: 'key', value: field.slice(2) });
      } else if (field[0] === 'L') unit = fraction(field.slice(2).trim());
      i = end + 1;
    } else if (c === '[' && /^\[\d/.test(src.slice(i))) {
      toks.push({ t: 'bar', kind: '', ending: Number(src[i + 1]) });
      i += 2;
    } else if (c === '|' || c === ':' || (c === '[' && src[i + 1] === '|')) {
      const m = /^(:*\|*\[?\|*\]?:*)(\d?)/.exec(src.slice(i))!;
      i += m[0].length || 1;
      toks.push({ t: 'bar', kind: m[1], ending: m[2] ? Number(m[2]) : 0 });
      barAcc = {};
    } else if (c === '[') {
      i++;
      const pitches: number[] = [];
      // a chord lasts as long as its first note
      let len = 0;
      while (i < src.length && src[i] !== ']') {
        const p = noteAt(barAcc);
        if (p === null) {
          i++;
          continue;
        }
        const l = lengthAt();
        pitches.push(p);
        if (!len) len = l;
        if (src[i] === '-') i++;
      }
      i++;
      len ||= 1;
      const outer = lengthAt();
      let tie = false;
      if (src[i] === '-') {
        tie = true;
        i++;
      }
      toks.push({ t: 'note', pitches, len: len * outer, tie });
    } else if (c === '>' || c === '<') {
      let n = 0;
      while (src[i] === c) {
        n++;
        i++;
      }
      toks.push({ t: 'broken', dir: c, n });
    } else if (c === '(' && /^\(\d/.test(src.slice(i))) {
      const m = /^\((\d)(?::(\d?))?(?::(\d?))?/.exec(src.slice(i))!;
      i += m[0].length;
      const p = Number(m[1]);
      const q = m[2] ? Number(m[2]) : p === 3 || p === 6 ? 2 : p === 2 || p === 4 || p === 8 ? 3 : 2;
      toks.push({ t: 'tuplet', p, q, r: m[3] ? Number(m[3]) : p });
    } else if (c === 'z' || c === 'x') {
      i++;
      toks.push({ t: 'rest', len: lengthAt() });
    } else if (c === 'Z') {
      i++;
      const n = /^\d+/.exec(src.slice(i));
      if (n) i += n[0].length;
      toks.push({ t: 'rest', len: (meter / beatsPerUnit) * (n ? Number(n[0]) : 1), bar: true });
    } else if (/[\^_=A-Ga-g]/.test(c)) {
      const p = noteAt(barAcc);
      if (p === null) {
        i++;
        continue;
      }
      const len = lengthAt();
      let tie = false;
      if (src[i] === '-') {
        tie = true;
        i++;
      }
      toks.push({ t: 'note', pitches: [p], len, tie });
    } else {
      i++; // decorations (~ . H T u v …), slurs, stray characters
    }
  }

  // ---- expand repeats, then lay out in time
  const flat: Tok[] = [];
  let start = 0;
  let second = false;
  let skipping = false;
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === 'bar') {
      if (tk.ending === 1 && second) {
        // the bar line before a first ending still closes a bar
        if (!skipping) flat.push({ t: 'bar', kind: '|', ending: 0 });
        skipping = true;
      }
      if (tk.ending >= 2) skipping = false;
      const endRepeat = tk.kind.startsWith(':');
      const startRepeat = tk.kind.endsWith(':');
      if (endRepeat && !second) {
        flat.push({ t: 'bar', kind: '|', ending: 0 });
        second = true;
        k = start - 1;
        continue;
      }
      if (endRepeat) {
        second = false;
        skipping = false;
      }
      if (startRepeat) {
        start = k + 1;
        second = false;
      }
      if (!skipping) flat.push(tk);
      continue;
    }
    if (!skipping) flat.push(tk);
  }

  const notes: Note[] = [];
  const chords: { b: number; name: string }[] = [];
  let pos = 0;
  let tuplet = { left: 0, scale: 1 };
  let pendingBroken = 1;
  const bars: number[] = [];
  let barStart = 0;
  const v = opts.v ?? 0.8;
  const tr = opts.transpose ?? 0;
  for (let k = 0; k < flat.length; k++) {
    const tk = flat[k];
    if (tk.t === 'bar') {
      if (pos > barStart + 1e-6) bars.push(pos - barStart);
      barStart = pos;
    } else if (tk.t === 'chord') chords.push({ b: pos, name: tk.name });
    else if (tk.t === 'tuplet') tuplet = { left: tk.r, scale: tk.q / tk.p };
    else if (tk.t === 'note' || tk.t === 'rest') {
      let len = tk.len * beatsPerUnit * pendingBroken;
      pendingBroken = 1;
      const nx = flat[k + 1];
      if (nx && nx.t === 'broken') {
        const f = 1 - 0.5 ** nx.n;
        len *= nx.dir === '>' ? 1 + f : 1 - f;
        pendingBroken = nx.dir === '>' ? 1 - f : 1 + f;
      }
      if (tuplet.left > 0) {
        len *= tuplet.scale;
        tuplet.left--;
      }
      if (tk.t === 'note') {
        const prev = notes[notes.length - 1];
        const tied = prev && (prev as Note & { tie?: boolean }).tie && prev.b + prev.d > pos - 1e-6 && prev.p[0] === tk.pitches[0] + tr;
        if (tied) {
          prev.d += len;
          (prev as Note & { tie?: boolean }).tie = tk.tie;
        } else notes.push({ b: pos, d: len, p: tk.pitches.map((p) => p + tr).sort((a, b) => a - b), v, tie: tk.tie } as Note);
      }
      pos += len;
    }
  }
  for (const n of notes) delete (n as Note & { tie?: boolean }).tie;
  if (pos > barStart + 1e-6) bars.push(pos - barStart);
  return { notes, chords, bar: meter, length: pos, bars };
}

/** Chord symbols turned into one chord per `span` beats (whichever is in effect as it starts), for backing parts. */
export function harmony(t: AbcTune, span: number, fallback = 'C'): string[] {
  const out: string[] = [];
  const clean = (n: string) => n.replace(/^([A-G][#b]?)(maj7|m7|m|7|dim|aug|sus4|sus2|6|9)?.*$/, '$1$2');
  let cur = t.chords.length ? clean(t.chords[0].name) : fallback;
  let ci = 0;
  for (let b = 0; b < t.length - 1e-6; b += span) {
    // the chord in effect when the span starts
    while (ci < t.chords.length && t.chords[ci].b <= b + 1e-6) cur = clean(t.chords[ci++].name);
    out.push(cur);
  }
  return out;
}
