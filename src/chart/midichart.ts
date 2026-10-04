import { EV_NOTE_OFF, EV_NOTE_ON, EV_SYSEX, EV_TEMPO, EV_TEXT, EV_TIMESIG, parseMidi } from './midi.ts';
import type { MidiTrack } from './midi.ts';
import { emptyTrack } from './dotchart.ts';
import { finishDrumTrack } from './drums.ts';
import type { Instrument, RawChart, RawTrack, TickRange } from './types.ts';
import { DIFFICULTIES, pushRaw, trackKey } from './types.ts';

const TRACK_NAMES: Record<string, Instrument> = {
  'PART GUITAR': 'guitar',
  'T1 GEMS': 'guitar',
  'PART BASS': 'bass',
  'PART RHYTHM': 'rhythm',
  'PART KEYS': 'keys',
  'PART GUITAR COOP': 'guitarcoop',
};

const TAP_NOTE = 104;
const SOLO_NOTE = 103;

/** Parse a Rock Band / Clone Hero style MIDI chart. */
export function parseMidiChart(bytes: Uint8Array, multiplierNote = 116): RawChart {
  const midi = parseMidi(bytes);
  const chart: RawChart = {
    format: 'mid',
    resolution: midi.division,
    tempos: [],
    timeSigs: [],
    sections: [],
    lyrics: [],
    phrases: [],
    tracks: new Map(),
    meta: {},
  };
  midi.tracks.forEach((track, i) => {
    for (const ev of track.events) {
      if (ev.type === EV_TEMPO) chart.tempos.push({ tick: ev.tick, usPerQuarter: ev.a });
      else if (ev.type === EV_TIMESIG) chart.timeSigs.push({ tick: ev.tick, num: ev.a, den: ev.b });
    }
    const name = track.name.trim().toUpperCase();
    if (name === 'EVENTS' || (i === 0 && midi.tracks.length === 1)) {
      for (const ev of track.events) {
        if (ev.type !== EV_TEXT || !ev.text) continue;
        const m = /^\[?(?:section[ _]|prc_)(.+?)\]?$/.exec(ev.text.trim());
        if (m) chart.sections.push({ tick: ev.tick, name: m[1] });
      }
    }
    const inst = TRACK_NAMES[name];
    if (inst && !DIFFICULTIES.some((d) => chart.tracks.has(trackKey(inst, d)))) {
      readInstrument(track, inst, chart, multiplierNote);
    } else if (name === 'PART DRUMS' && !DIFFICULTIES.some((d) => chart.tracks.has(trackKey('drums', d)))) {
      readDrums(track, chart, multiplierNote);
    }
  });
  // lyrics from the lead vocals, or from the first harmony part when there is no lead part
  const named = (n: string) => midi.tracks.find((t) => t.name.trim().toUpperCase() === n);
  const vocals = named('PART VOCALS') ?? named('HARM1');
  if (vocals) readVocals(vocals, chart);
  return chart;
}

function readInstrument(track: MidiTrack, inst: Instrument, chart: RawChart, multiplierNote: number) {
  // Pair note-on/off per pitch into ranges.
  const ranges = new Map<number, TickRange[]>();
  const open = new Map<number, number>();
  const close = (pitch: number, tick: number) => {
    const start = open.get(pitch);
    if (start === undefined) return;
    open.delete(pitch);
    let list = ranges.get(pitch);
    if (!list) ranges.set(pitch, (list = []));
    list.push({ start, end: tick });
  };
  // Phase Shift sysex: [0x50,0x53,0,0,diff,type,enable]
  const sysOpen: TickRange[][] = [[], [], [], []];
  const sysTap: TickRange[][] = [[], [], [], []];
  const sysStart = new Map<string, number>();
  let enhancedOpens = false;

  for (const ev of track.events) {
    if (ev.type === EV_NOTE_ON) {
      close(ev.a, ev.tick);
      open.set(ev.a, ev.tick);
    } else if (ev.type === EV_NOTE_OFF) {
      close(ev.a, ev.tick);
    } else if (ev.type === EV_TEXT && ev.text) {
      if (/ENHANCED_OPENS/i.test(ev.text)) enhancedOpens = true;
    } else if (ev.type === EV_SYSEX && ev.data) {
      const d = ev.data;
      if (d.length >= 7 && d[0] === 0x50 && d[1] === 0x53 && d[2] === 0 && d[3] === 0) {
        const diff = d[4];
        const type = d[5];
        if (type !== 1 && type !== 4) continue;
        const diffs = diff === 0xff ? [0, 1, 2, 3] : diff <= 3 ? [diff] : [];
        for (const di of diffs) {
          const key = `${di}:${type}`;
          if (d[6]) sysStart.set(key, ev.tick);
          else {
            const s = sysStart.get(key);
            if (s !== undefined) {
              (type === 1 ? sysOpen : sysTap)[di].push({ start: s, end: Math.max(ev.tick, s + 1) });
              sysStart.delete(key);
            }
          }
        }
      }
    }
  }
  for (const pitch of [...open.keys()]) close(pitch, open.get(pitch)! + 1);

  const get = (pitch: number) => ranges.get(pitch) ?? [];
  const spNote = multiplierNote === SOLO_NOTE ? SOLO_NOTE : 116;
  const soloRanges = spNote === SOLO_NOTE ? [] : get(SOLO_NOTE);

  DIFFICULTIES.forEach((diff, di) => {
    const base = 60 + di * 12;
    const t: RawTrack = emptyTrack();
    for (let lane = 0; lane < 5; lane++) {
      for (const r of get(base + lane)) pushRaw(t.notes, r.start, lane, r.end - r.start);
    }
    if (enhancedOpens) for (const r of get(base - 1)) pushRaw(t.notes, r.start, 7, r.end - r.start);
    if (sysOpen[di].length) {
      // Notes covered by an open-note sysex phrase become open notes.
      const n = t.notes;
      for (let i = 0; i < n.tick.length; i++) if (inRanges(sysOpen[di], n.tick[i])) n.lane[i] = 7;
    }
    if (t.notes.tick.length === 0) return;
    t.forceHopo = get(base + 5);
    t.forceStrum = get(base + 6);
    t.tap = [...get(TAP_NOTE), ...sysTap[di]];
    t.starPower = get(spNote);
    t.solos = soloRanges;
    chart.tracks.set(trackKey(inst, diff), t);
  });
}

/** Tom markers (pro drums): gems on yellow, blue or green under these are toms, the rest cymbals. */
const TOM_NOTES = [110, 111, 112];

/**
 * PART DRUMS: per difficulty (base 60/72/84/96) kick, red, yellow, blue, green (+5: the green of a 5-lane
 * chart). Charts with tom markers are pro drums: yellow, blue and green are cymbals unless marked as toms;
 * charts without them are all toms, as Clone Hero shows them.
 */
function readDrums(track: MidiTrack, chart: RawChart, multiplierNote: number) {
  const ranges = new Map<number, TickRange[]>();
  const open = new Map<number, number>();
  const close = (pitch: number, tick: number) => {
    const start = open.get(pitch);
    if (start === undefined) return;
    open.delete(pitch);
    let list = ranges.get(pitch);
    if (!list) ranges.set(pitch, (list = []));
    list.push({ start, end: tick });
  };
  for (const ev of track.events) {
    if (ev.type === EV_NOTE_ON) {
      close(ev.a, ev.tick);
      open.set(ev.a, ev.tick);
    } else if (ev.type === EV_NOTE_OFF) close(ev.a, ev.tick);
  }
  for (const pitch of [...open.keys()]) close(pitch, open.get(pitch)! + 1);
  const get = (pitch: number) => ranges.get(pitch) ?? [];
  const pro = TOM_NOTES.some((p) => get(p).length > 0);
  const spNote = multiplierNote === SOLO_NOTE ? SOLO_NOTE : 116;
  DIFFICULTIES.forEach((diff, di) => {
    const base = 60 + di * 12;
    const t: RawTrack = emptyTrack();
    const cymbals = new Set<number>();
    for (let lane = 0; lane <= 5; lane++) {
      for (const r of get(base + lane)) {
        pushRaw(t.notes, r.start, lane, 0);
        if (pro && lane >= 2 && lane <= 4 && !inRanges(get(TOM_NOTES[lane - 2]), r.start)) cymbals.add(r.start * 8 + lane);
      }
    }
    if (t.notes.tick.length === 0) return;
    t.starPower = get(spNote);
    t.solos = spNote === SOLO_NOTE ? [] : get(SOLO_NOTE);
    finishDrumTrack(t, cymbals);
    chart.tracks.set(trackKey('drums', diff), t);
  });
}

function inRanges(ranges: TickRange[], tick: number): boolean {
  for (const r of ranges) if (tick >= r.start && tick < r.end) return true;
  return false;
}

/** Phrase markers in PART VOCALS (Rock Band: 105, and 106 for the second player). */
const PHRASE_NOTES = [105, 106];

/** Lyrics: every text or lyric event that is not a [bracketed] event, and the phrase notes as lines. */
function readVocals(track: MidiTrack, chart: RawChart) {
  const open = new Map<number, number>();
  const phrases: TickRange[] = [];
  for (const ev of track.events) {
    if (ev.type === EV_TEXT && ev.text && (ev.a === 0x01 || ev.a === 0x05)) {
      const text = ev.text.trim();
      if (text && !text.startsWith('[')) chart.lyrics.push({ tick: ev.tick, text });
    } else if ((ev.type === EV_NOTE_ON || ev.type === EV_NOTE_OFF) && PHRASE_NOTES.includes(ev.a)) {
      const start = open.get(ev.a);
      if (start !== undefined) {
        phrases.push({ start, end: ev.tick });
        open.delete(ev.a);
      }
      if (ev.type === EV_NOTE_ON) open.set(ev.a, ev.tick);
    }
  }
  // 105 and 106 often mark the same phrases: keep each range once
  phrases.sort((a, b) => a.start - b.start || a.end - b.end);
  for (const p of phrases) {
    const prev = chart.phrases[chart.phrases.length - 1];
    if (prev && p.start < prev.end) prev.end = Math.max(prev.end, p.end);
    else chart.phrases.push({ ...p });
  }
}
