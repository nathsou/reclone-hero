import type { Difficulty, Instrument, RawChart, RawTrack } from './types.ts';
import { pushRaw, rawNotes, trackKey } from './types.ts';
import { finishDrumTrack } from './drums.ts';

const DIFF_NAMES: Record<string, Difficulty> = { easy: 'easy', medium: 'medium', hard: 'hard', expert: 'expert' };
const INST_NAMES: Record<string, Instrument> = {
  single: 'guitar',
  doubleguitar: 'guitarcoop',
  doublebass: 'bass',
  doublerhythm: 'rhythm',
  keyboard: 'keys',
  drums: 'drums',
  touch: 'touch',
};

export function emptyTrack(): RawTrack {
  return { notes: rawNotes(), forceFlip: new Set(), tap: [], forceHopo: [], forceStrum: [], starPower: [], solos: [] };
}

/** Parse a Moonscraper/Feedback .chart file. */
export function parseDotChart(text: string): RawChart {
  const chart: RawChart = {
    format: 'chart',
    resolution: 192,
    tempos: [],
    timeSigs: [],
    sections: [],
    lyrics: [],
    phrases: [],
    tracks: new Map(),
    meta: {},
  };
  let section = '';
  let phraseStart = -1;
  let track: RawTrack | null = null;
  let soloStart = -1;
  /** drums: cymbal markers (N 66-68) of the track being read, or null for other instruments */
  let cymbals: Set<number> | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^﻿/, '');
    if (!line || line === '{') continue;
    if (line === '}') {
      if (track && cymbals) finishDrumTrack(track, cymbals);
      section = '';
      track = null;
      cymbals = null;
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      track = null;
      soloStart = -1;
      const m = /^(easy|medium|hard|expert)(single|doubleguitar|doublebass|doublerhythm|keyboard|drums|touch)$/i.exec(section);
      if (m) {
        const inst = INST_NAMES[m[2].toLowerCase()];
        const key = trackKey(inst, DIFF_NAMES[m[1].toLowerCase()]);
        track = emptyTrack();
        cymbals = inst === 'drums' ? new Set() : null;
        chart.tracks.set(key, track);
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (section === 'Song') {
      chart.meta[key.toLowerCase()] = value.replace(/^"(.*)"$/, '$1');
      if (key === 'Resolution') chart.resolution = Number(value) || 192;
      continue;
    }
    const tick = Number(key);
    if (!Number.isFinite(tick)) continue;
    const parts = value.split(/\s+/);
    const kind = parts[0];

    if (section === 'SyncTrack') {
      if (kind === 'B') chart.tempos.push({ tick, usPerQuarter: 60e9 / Number(parts[1]) });
      else if (kind === 'TS') chart.timeSigs.push({ tick, num: Number(parts[1]) || 4, den: 2 ** (Number(parts[2] ?? 2) || 2) });
    } else if (section === 'Events') {
      if (kind === 'E') {
        const ev = value.slice(1).trim().replace(/^"(.*)"$/, '$1');
        const m = /^section\s+(.*)$/.exec(ev);
        if (m) chart.sections.push({ tick, name: m[1] });
        else if (ev.startsWith('lyric ')) chart.lyrics.push({ tick, text: ev.slice(6) });
        else if (ev === 'phrase_start') {
          // a new phrase also ends one left open
          if (phraseStart >= 0) chart.phrases.push({ start: phraseStart, end: tick });
          phraseStart = tick;
        } else if (ev === 'phrase_end' && phraseStart >= 0) {
          chart.phrases.push({ start: phraseStart, end: tick });
          phraseStart = -1;
        }
      }
    } else if (track) {
      if (kind === 'N' && cymbals) {
        // drums: 0 kick, 1-4 pads (5: the green of a 5-lane chart), 66-68 yellow/blue/green cymbal markers
        const lane = Number(parts[1]);
        if (lane >= 0 && lane <= 5) pushRaw(track.notes, tick, lane, 0);
        else if (lane >= 66 && lane <= 68) cymbals.add(tick * 8 + lane - 64);
      } else if (kind === 'N') {
        const lane = Number(parts[1]);
        const length = Number(parts[2]) || 0;
        if (lane <= 4 || lane === 7) pushRaw(track.notes, tick, lane, length);
        else if (lane === 5) track.forceFlip.add(tick);
        else if (lane === 6) track.tap.push({ start: tick, end: tick + 1 });
      } else if (kind === 'S') {
        if (parts[1] === '2') track.starPower.push({ start: tick, end: tick + Math.max(1, Number(parts[2]) || 0) });
      } else if (kind === 'E') {
        const ev = parts[1];
        if (ev === 'solo') soloStart = tick;
        else if (ev === 'soloend' && soloStart >= 0) {
          track.solos.push({ start: soloStart, end: tick + 1 });
          soloStart = -1;
        }
      }
    }
  }
  // a last phrase with no end runs on past its last syllable
  if (phraseStart >= 0) {
    const last = chart.lyrics.reduce((m, l) => Math.max(m, l.tick), phraseStart);
    chart.phrases.push({ start: phraseStart, end: last + chart.resolution * 2 });
  }
  return chart;
}
