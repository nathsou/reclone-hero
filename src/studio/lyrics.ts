export const MAX_LYRICS_LENGTH = 128 * 1024;
export interface TimedLyric { time: number; text: string; end: number }

/** LRC line timing, including repeated timestamps, milliseconds, and a global offset. */
export function timedLyrics(input: string, duration: number): TimedLyric[] {
  const offset = Number(/\[offset:\s*([+-]?\d+)\]/i.exec(input)?.[1] ?? 0) / 1000;
  const entries: { time: number; text: string }[] = [];
  const stamp = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
  for (const line of input.slice(0, MAX_LYRICS_LENGTH).split(/\r?\n/)) {
    const matches = [...line.matchAll(stamp)];
    const text = line.replace(stamp, '').replace(/<\d{1,3}:[0-5]\d(?:\.\d{1,3})?>/g, '').trim();
    for (const match of matches) {
      const time = Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] ?? 0}`) - offset;
      if (time < duration) entries.push({ time: Math.max(0, time), text });
    }
  }
  entries.sort((a, b) => a.time - b.time);
  const unique = entries.filter((entry, i) => !i || entry.time !== entries[i - 1].time);
  // Repeated timestamps can multiply one long line; bound expanded chart/HUD text as well as input.
  let remaining = MAX_LYRICS_LENGTH;
  return unique.slice(0, 5000).map((entry, i) => {
    const text = entry.text.slice(0, Math.min(2000, remaining)); remaining -= text.length;
    return { time: entry.time, text, end: Math.min(duration, unique[i + 1]?.time ?? entry.time + 5) };
  });
}

export function lrcTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `[${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}]`;
}

export function lyricsFile(lyrics?: string): 'lyrics.lrc' | 'lyrics.txt' | null {
  return lyrics?.trim() ? timedLyrics(lyrics, 1200).length ? 'lyrics.lrc' : 'lyrics.txt' : null;
}
