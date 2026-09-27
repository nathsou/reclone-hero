export const FRET_ACTIONS = ['green', 'red', 'yellow', 'blue', 'orange'] as const;
export const ACTIONS = [...FRET_ACTIONS, 'strumUp', 'strumDown', 'starPower', 'tilt', 'start'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABEL: Record<Action, string> = {
  green: 'Green fret',
  red: 'Red fret',
  yellow: 'Yellow fret',
  blue: 'Blue fret',
  orange: 'Orange fret',
  strumUp: 'Strum up',
  strumDown: 'Strum down',
  starPower: 'Star Power (select)',
  tilt: 'Tilt',
  start: 'Start / pause',
};

export type DigitalBinding =
  | { type: 'button'; index: number }
  /** axis or hat switch position: active when the axis sits near `value` (rest is the idle value) */
  | { type: 'axis'; index: number; value: number; rest: number };

export interface AnalogBinding {
  index: number;
  rest: number;
  full: number;
}

export interface PadProfile {
  digital: Partial<Record<Action, DigitalBinding[]>>;
  whammy: AnalogBinding | null;
}

export type KeyBindings = Record<Action, string[]> & { whammy: string[] };

export const DEFAULT_KEYS: KeyBindings = {
  green: ['KeyA', 'Digit1'],
  red: ['KeyS', 'Digit2'],
  yellow: ['KeyD', 'Digit3'],
  blue: ['KeyF', 'Digit4'],
  orange: ['KeyG', 'Digit5'],
  strumUp: ['ArrowUp'],
  strumDown: ['ArrowDown', 'Enter'],
  starPower: ['Space', 'ShiftRight'],
  tilt: [],
  start: ['Escape'],
  whammy: ['KeyW'],
};

/** Xbox-style guitars exposed with the "standard" mapping. */
export const STANDARD_PROFILE: PadProfile = {
  digital: {
    green: [{ type: 'button', index: 0 }],
    red: [{ type: 'button', index: 1 }],
    yellow: [{ type: 'button', index: 3 }],
    blue: [{ type: 'button', index: 2 }],
    orange: [{ type: 'button', index: 4 }],
    strumUp: [{ type: 'button', index: 12 }],
    strumDown: [{ type: 'button', index: 13 }],
    starPower: [{ type: 'button', index: 8 }],
    start: [{ type: 'button', index: 9 }],
  },
  whammy: null,
};

const PADS_KEY = 'chsq.pads';
const KEYS_KEY = 'chsq.keys';

export function loadPadProfiles(): Record<string, PadProfile> {
  try {
    return JSON.parse(localStorage.getItem(PADS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePadProfile(id: string, profile: PadProfile): void {
  const all = loadPadProfiles();
  all[id] = profile;
  try {
    localStorage.setItem(PADS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable
  }
}

export function loadKeyBindings(): KeyBindings {
  try {
    const raw = localStorage.getItem(KEYS_KEY);
    if (raw) return { ...DEFAULT_KEYS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return structuredClone(DEFAULT_KEYS);
}

export function saveKeyBindings(k: KeyBindings): void {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(k));
  } catch {
    // storage unavailable
  }
}

// Chrome reports hat switches as a single axis with 8 positions in [-1, 1] and ~1.29 at rest.
const HAT_TOLERANCE = 0.12;

export function digitalActive(b: DigitalBinding, pad: Gamepad): boolean {
  if (b.type === 'button') return pad.buttons[b.index]?.pressed ?? false;
  const v = pad.axes[b.index];
  if (v === undefined) return false;
  if (Math.abs(b.rest) > 1.05) return Math.abs(v - b.value) < HAT_TOLERANCE;
  const span = b.value - b.rest;
  return (v - b.rest) / span > 0.5;
}

export function analogValue(b: AnalogBinding, pad: Gamepad): number {
  const v = pad.axes[b.index];
  if (v === undefined || b.full === b.rest) return 0;
  return Math.min(1, Math.max(0, (v - b.rest) / (b.full - b.rest)));
}

export interface PadSnapshot {
  buttons: number[];
  axes: number[];
}

export function snapshot(pad: Gamepad): PadSnapshot {
  return { buttons: pad.buttons.map((b) => b.value), axes: [...pad.axes] };
}

/** Find the first input that changed significantly from a baseline snapshot. */
export function detectDigital(base: PadSnapshot, pad: Gamepad): DigitalBinding | null {
  for (let i = 0; i < pad.buttons.length; i++) {
    if (pad.buttons[i].pressed && (base.buttons[i] ?? 0) < 0.5) return { type: 'button', index: i };
  }
  for (let i = 0; i < pad.axes.length; i++) {
    const rest = base.axes[i] ?? 0;
    const v = pad.axes[i];
    if (Math.abs(rest) > 1.05) {
      if (Math.abs(v) <= 1.0001) return { type: 'axis', index: i, value: v, rest };
    } else if (Math.abs(v - rest) > 0.6) {
      return { type: 'axis', index: i, value: v, rest };
    }
  }
  return null;
}

/** Track the axis with the largest excursion; used while the player moves the whammy bar. */
export function detectAnalog(base: PadSnapshot, pad: Gamepad, best: AnalogBinding | null): AnalogBinding | null {
  let out = best;
  for (let i = 0; i < pad.axes.length; i++) {
    const rest = base.axes[i] ?? 0;
    if (Math.abs(rest) > 1.05) continue; // hat switch
    const d = Math.abs(pad.axes[i] - rest);
    if (d > 0.3 && (!out || (out.index === i ? d > Math.abs(out.full - out.rest) : d > Math.abs(out.full - out.rest) + 0.2))) {
      out = { index: i, rest, full: pad.axes[i] };
    }
  }
  return out;
}
