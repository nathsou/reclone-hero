import type { Note, SongDef } from './score.ts';

export interface Phrasing {
  /** Quarter-note beats in the bar and phrase. */
  bar: number;
  origin?: number;
  phrase: number;
  /** Phrase-start, crest and cadence multipliers. */
  shape: [number, number, number];
  /** Separation between short notes. Long sustains retain their notation. */
  gate: number;
  /** Strength of metrical accents, not random timing jitter. */
  accent: number;
}

/** Deterministic written dynamics. Onsets, pitches and existing accents are preserved. */
export function phrase(notes: Note[], o: Phrasing): Note[] {
  const start = o.origin ?? 0;
  return notes.map(n => {
    const x = (((n.b - start) % o.phrase + o.phrase) % o.phrase) / o.phrase;
    const [a, crest, end] = o.shape;
    const dynamic = x < 0.65 ? a + (crest - a) * x / 0.65 : crest + (end - crest) * (x - 0.65) / 0.35;
    const beat = ((n.b - start) % o.bar + o.bar) % o.bar;
    const accent = Math.abs(beat) < 1e-5 ? 1 + o.accent : Math.abs(beat - Math.round(beat)) < 1e-5 ? 1 : 1 - o.accent * 0.6;
    return { ...n, v: Math.max(0.12, Math.min(1, n.v * dynamic * accent)), d: n.d <= 0.5 ? n.d * o.gate : n.d };
  });
}

/** Apply a score's own phrase plan; quieter accompaniment leaves the melody in front. */
export function perform(song: SongDef, o: Phrasing): SongDef {
  const meters = [...song.timeSigs].sort((a, b) => a.beat - b.beat);
  const phrased = (notes: Note[], plan: Phrasing) => meters.flatMap((m, i) => {
    const bar = m.num * 4 / m.den;
    return phrase(notes.filter(n => n.b >= m.beat && n.b < (meters[i + 1]?.beat ?? Infinity)), {
      ...plan, origin: m.beat, bar, phrase: plan.phrase / plan.bar * bar,
    });
  });
  return {
    ...song,
    player: song.player.map(p => ({ ...p, notes: phrased(p.notes, o).map(n => ({ ...n, vibrato: n.vibrato ?? (p.inst === 'lead' ? 0.12 : undefined) })) })),
    backing: song.backing.map(p => ({ ...p, notes: phrased(p.notes, { ...o, accent: o.accent * 0.6, shape: o.shape.map(v => v * 0.92) as [number, number, number] }) })),
    drums: song.drums.map(p => ({ ...p, hits: p.hits.map(h => {
      const subdivision = Math.abs(h.b - Math.round(h.b)) > 1e-5;
      const cymbal = h.k === 'hat' || h.k === 'ride' || h.k === 'shaker';
      return { ...h, v: h.v * (cymbal && subdivision ? 0.78 : 1) };
    }) })),
  };
}
