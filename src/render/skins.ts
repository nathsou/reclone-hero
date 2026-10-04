// Note skins: how gems, sustains, fret buttons and hit particles look. Independent of the page theme.
// Colour order: green, red, yellow, blue, orange, open, star power, missed (linear light).

export const SKIN_IDS = ['dome', 'cone', 'glass'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export interface NoteSkin {
  id: SkinId;
  name: string;
  description: string;
  /** index passed to shaders to pick a shading style: 0 dome, 1 crystal, 2 cone */
  style: number;
  colors: number[][];
  particles: 'sparks' | 'glitter';
  /** scale on HOPO gems */
  hopoScale: number;
}

export const SKINS: Record<SkinId, NoteSkin> = {
  dome: {
    id: 'dome',
    name: 'Classic dome',
    description: 'Domed gems in a dark outline: the fret colour with a silver cap for strums, a glowing white face for HOPOs, a dark face for taps. Wheel frets.',
    style: 0,
    // the gem faces' colours (FRET in the shaders), in linear light
    colors: [
      [0.01, 0.646, 0.066],
      [0.891, 0.015, 0.04],
      [1.0, 0.612, 0.003],
      [0.012, 0.167, 1.0],
      [1.0, 0.198, 0.002],
      [0.389, 0.072, 1.0],
      [0.076, 0.774, 1.0],
      [0.28, 0.259, 0.227],
    ],
    particles: 'sparks',
    hopoScale: 0.95,
  },
  cone: {
    id: 'cone',
    name: 'Cone',
    description: 'Clone Hero-style cones: the colour on the slope, a silver cap on strums, a glowing white top on HOPOs, a dark cap in a glowing ring on taps.',
    style: 2,
    // the same face colours as the dome (FRET in the shaders), in linear light
    colors: [
      [0.01, 0.646, 0.066],
      [0.891, 0.015, 0.04],
      [1.0, 0.612, 0.003],
      [0.012, 0.167, 1.0],
      [1.0, 0.198, 0.002],
      [0.389, 0.072, 1.0],
      [0.076, 0.774, 1.0],
      [0.28, 0.259, 0.227],
    ],
    particles: 'sparks',
    hopoScale: 1,
  },
  glass: {
    id: 'glass',
    name: 'Crystal',
    description: 'Lit glass beads on a flowing glass highway: coloured for strums, glowing frosted glass for HOPOs, smoked for taps.',
    style: 1,
    colors: [
      [0.1, 0.85, 0.3],
      [1.0, 0.1, 0.14],
      [1.0, 0.72, 0.08],
      [0.1, 0.38, 1.0],
      [1.0, 0.36, 0.05],
      [0.62, 0.22, 1.0],
      [0.55, 0.9, 1.0],
      [0.4, 0.4, 0.42],
    ],
    particles: 'glitter',
    hopoScale: 0.9,
  },
};

/** sRGB hex for a skin colour (for the DOM: results bars, pickers). */
export function skinHex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)) * 255).toString(16).padStart(2, '0')).join('');
}
