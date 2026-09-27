/** Minimal Standard MIDI File reader: notes, text, tempo, time signatures and sysex. */

export const EV_NOTE_ON = 0;
export const EV_NOTE_OFF = 1;
export const EV_TEXT = 2;
export const EV_TEMPO = 3;
export const EV_TIMESIG = 4;
export const EV_SYSEX = 5;

export interface MidiEvent {
  tick: number;
  type: number;
  /** note number, tempo (µs/quarter) or time signature numerator */
  a: number;
  /** velocity or time signature denominator */
  b: number;
  text?: string;
  data?: Uint8Array;
}

export interface MidiTrack {
  name: string;
  events: MidiEvent[];
}

export interface MidiFile {
  division: number;
  tracks: MidiTrack[];
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8', { fatal: true });

function decodeMidiText(bytes: Uint8Array): string {
  try {
    return utf8.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
}

export function parseMidi(buf: Uint8Array): MidiFile {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 0;
  const str4 = (p: number) => String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
  if (str4(0) !== 'MThd') throw new Error('Not a MIDI file');
  const headerLen = view.getUint32(4);
  const ntracks = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  pos = 8 + headerLen;

  const tracks: MidiTrack[] = [];
  for (let t = 0; t < ntracks && pos + 8 <= buf.length; t++) {
    const id = str4(pos);
    const len = view.getUint32(pos + 4);
    const start = pos + 8;
    const end = Math.min(buf.length, start + len);
    pos = start + len;
    if (id !== 'MTrk') {
      t--;
      continue;
    }
    tracks.push(readTrack(buf, start, end));
  }
  return { division, tracks };
}

function readTrack(buf: Uint8Array, start: number, end: number): MidiTrack {
  const events: MidiEvent[] = [];
  let name = '';
  let p = start;
  let tick = 0;
  let status = 0;
  const varlen = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const c = buf[p++];
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  };
  while (p < end) {
    tick += varlen();
    let s = buf[p];
    if (s & 0x80) {
      p++;
      if (s < 0xf0) status = s;
    } else {
      s = status;
    }
    if (s === 0xff) {
      const type = buf[p++];
      const len = varlen();
      const data = buf.subarray(p, p + len);
      p += len;
      if (type === 0x03 && !name) name = decodeMidiText(data);
      else if (type >= 0x01 && type <= 0x07) events.push({ tick, type: EV_TEXT, a: type, b: 0, text: decodeMidiText(data) });
      else if (type === 0x51 && len >= 3) events.push({ tick, type: EV_TEMPO, a: (data[0] << 16) | (data[1] << 8) | data[2], b: 0 });
      else if (type === 0x58 && len >= 2) events.push({ tick, type: EV_TIMESIG, a: data[0], b: 2 ** data[1] });
      else if (type === 0x2f) break;
    } else if (s === 0xf0 || s === 0xf7) {
      const len = varlen();
      events.push({ tick, type: EV_SYSEX, a: 0, b: 0, data: buf.subarray(p, p + len) });
      p += len;
    } else {
      const hi = s >> 4;
      if (hi === 0xc || hi === 0xd) {
        p += 1;
      } else if (hi >= 0x8 && hi <= 0xe) {
        const d1 = buf[p++];
        const d2 = buf[p++];
        if (hi === 0x9 && d2 > 0) events.push({ tick, type: EV_NOTE_ON, a: d1, b: d2 });
        else if (hi === 0x8 || hi === 0x9) events.push({ tick, type: EV_NOTE_OFF, a: d1, b: 0 });
      } else {
        // Corrupt data; bail out of this track rather than misparse everything after it.
        break;
      }
    }
  }
  return { name, events };
}
