// Lyrics: syllables from the chart grouped into lines (vocal phrases), in Rock Band / Clone Hero notation.

export interface Syllable {
  /** seconds */
  time: number;
  /** text to show, markers removed */
  text: string;
  /** joins the next syllable without a space (the rest of the same word) */
  join: boolean;
}

export interface LyricLine {
  /** seconds: the phrase's start and end */
  startTime: number;
  endTime: number;
  syllables: Syllable[];
}

export interface RawLyric {
  tick: number;
  text: string;
}

/**
 * Clean one lyric event: `-` at the end joins the next syllable, `=` is a hyphen that is shown and
 * joins, `#` `^` `*` mark spoken or unpitched words, `%` `/` `$` are range, line and harmony markers,
 * `_` is a space, `§` links two vowels sung on one note, and `+` alone continues the previous
 * syllable's note (nothing new to show). Formatting tags like `<i>` are dropped. Null when nothing
 * is left to show.
 */
export function cleanSyllable(raw: string): { text: string; join: boolean } | null {
  let t = raw.replace(/<[^>]*>/g, '').trim();
  if (!t || /^\+*$/.test(t)) return null;
  let join = false;
  // markers can stack at the end ("word-#", "say=^"): peel them off one by one
  for (;;) {
    const last = t[t.length - 1];
    if (last === '-') {
      join = true;
      t = t.slice(0, -1);
    } else if (last === '=') {
      join = true;
      t = t.slice(0, -1) + '-';
      break;
    } else if (last === '#' || last === '^' || last === '*' || last === '%' || last === '/' || last === '$' || last === '+') {
      t = t.slice(0, -1);
    } else break;
    if (!t) return null;
  }
  t = t.replace(/^[$#^*%/+]+/, '').replace(/=/g, '-').replace(/_/g, ' ').replace(/§/g, '‿').trim();
  return t ? { text: t, join } : null;
}

/** Lines break at gaps this long (seconds) when the chart has no phrase markers. */
const GAP = 1.6;
/** ... and once a line has this many characters. */
const MAX_CHARS = 42;

/**
 * Group syllables into lines. With phrase ranges (vocal phrase markers) each phrase is a line; without
 * them, lines break at pauses and when they get long.
 */
export function buildLyrics(lyrics: RawLyric[], phrases: { start: number; end: number }[], tickToTime: (tick: number) => number): LyricLine[] {
  const syllables: (Syllable & { tick: number })[] = [];
  for (const l of lyrics.slice().sort((a, b) => a.tick - b.tick)) {
    const c = cleanSyllable(l.text);
    if (c) syllables.push({ tick: l.tick, time: tickToTime(l.tick), text: c.text, join: c.join });
  }
  if (!syllables.length) return [];
  const lines: LyricLine[] = [];
  const push = (list: (Syllable & { tick: number })[], start: number, end: number) => {
    if (!list.length) return;
    list[list.length - 1].join = false;
    lines.push({ startTime: start, endTime: end, syllables: list.map(({ time, text, join }) => ({ time, text, join })) });
  };

  const sorted = phrases.filter((p) => p.end > p.start).sort((a, b) => a.start - b.start);
  if (sorted.length) {
    let i = 0;
    for (const p of sorted) {
      while (i < syllables.length && syllables[i].tick < p.start) i++;
      const list: (Syllable & { tick: number })[] = [];
      while (i < syllables.length && syllables[i].tick < p.end) list.push(syllables[i++]);
      push(list, tickToTime(p.start), tickToTime(p.end));
    }
    return lines;
  }

  let list: (Syllable & { tick: number })[] = [];
  let chars = 0;
  for (let i = 0; i < syllables.length; i++) {
    const s = syllables[i];
    const prev = list[list.length - 1];
    // break between words only, at a pause or once the line is long
    if (prev && !prev.join && (s.time - prev.time > GAP || chars + s.text.length > MAX_CHARS)) {
      push(list, list[0].time, Math.min(s.time, prev.time + GAP));
      list = [];
      chars = 0;
    }
    list.push(s);
    chars += s.text.length + 1;
  }
  const last = list[list.length - 1];
  push(list, list[0].time, last.time + 1);
  return lines;
}

/** A line's text, for tests and tools. */
export function lineText(line: LyricLine): string {
  return line.syllables.map((s) => s.text + (s.join ? '' : ' ')).join('').trim();
}
