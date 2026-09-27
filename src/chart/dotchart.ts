import type { Difficulty, Instrument, RawChart, RawTrack } from './types.ts';
import { pushRaw, rawNotes, trackKey } from './types.ts';

const DIFF_NAMES: Record<string, Difficulty> = { easy: 'easy', medium: 'medium', hard: 'hard', expert: 'expert' };
const INST_NAMES: Record<string, Instrument> = {
  single: 'guitar',
  doubleguitar: 'guitarcoop',
  doublebass: 'bass',
  doublerhythm: 'rhythm',
  keyboard: 'keys',
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
    tracks: new Map(),
    meta: {},
  };
  let section = '';
  let track: RawTrack | null = null;
  let soloStart = -1;

  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^﻿/, '');
    if (!line || line === '{') continue;
    if (line === '}') {
      section = '';
      track = null;
      continue;
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      track = null;
      soloStart = -1;
      const m = /^(easy|medium|hard|expert)(single|doubleguitar|doublebass|doublerhythm|keyboard)$/i.exec(section);
      if (m) {
        const key = trackKey(INST_NAMES[m[2].toLowerCase()], DIFF_NAMES[m[1].toLowerCase()]);
        track = emptyTrack();
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
      }
    } else if (track) {
      if (kind === 'N') {
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
  return chart;
}
