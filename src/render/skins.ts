// Note skins: how gems, sustains, fret buttons and hit particles look. Independent of the page theme.
// Colour order: green, red, yellow, blue, orange, open, star power, missed (linear light).

export const SKIN_IDS = ['dome', 'studio', 'glass', 'neon', 'swiss', 'baroque', 'pixel', 'clay'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export interface NoteSkin {
  id: SkinId;
  name: string;
  description: string;
  /** index passed to shaders to pick a shading style */
  style: number;
  colors: number[][];
  gem: 'dome' | 'puck' | 'disc' | 'jewel' | 'block' | 'pill' | 'lens' | 'bead';
  button: 'wheel' | 'ring' | 'flat' | 'gold' | 'square' | 'soft' | 'bezel';
  particles: 'sparks' | 'dots' | 'glitter' | 'squares' | 'puffs';
  /** scale on HOPO gems (smaller in Neon, like Guitar Hero) */
  hopoScale: number;
}

export const SKINS: Record<SkinId, NoteSkin> = {
  dome: {
    id: 'dome',
    name: 'Classic dome',
    description: 'Domed gems with a muted rim and a cap, wheel frets.',
    style: 5,
    colors: [
      [0.041, 0.875, 0.145],
      [1.0, 0.04, 0.066],
      [1.0, 0.652, 0.038],
      [0.038, 0.263, 1.0],
      [1.0, 0.259, 0.01],
      [0.442, 0.072, 1.0],
      [0.334, 0.867, 1.0],
      [0.28, 0.259, 0.227],
    ],
    gem: 'dome',
    button: 'wheel',
    particles: 'sparks',
    hopoScale: 0.94,
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    description: 'Glass lenses in chrome bezels on a lacquered board, with ray-traced reflections and soft shadows.',
    style: 6,
    colors: [
      [0.03, 0.46, 0.13],
      [0.66, 0.025, 0.035],
      [0.92, 0.52, 0.035],
      [0.025, 0.15, 0.7],
      [0.86, 0.2, 0.02],
      [0.32, 0.07, 0.62],
      [0.6, 0.88, 1.0],
      [0.22, 0.21, 0.2],
    ],
    gem: 'lens',
    button: 'bezel',
    particles: 'sparks',
    hopoScale: 0.92,
  },
  glass: {
    id: 'glass',
    name: 'Liquid Glass',
    description: 'Glass beads, tubes and a flowing glass highway that bend, split and reflect the light behind them.',
    style: 7,
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
    gem: 'bead',
    button: 'bezel',
    particles: 'glitter',
    hopoScale: 0.9,
  },
  neon: {
    id: 'neon',
    name: 'Neon',
    description: 'Glowing pucks, light trails and sparks.',
    style: 0,
    colors: [
      [0.12, 1.0, 0.22],
      [1.0, 0.1, 0.12],
      [1.0, 0.82, 0.08],
      [0.12, 0.42, 1.0],
      [1.0, 0.26, 0.02],
      [0.62, 0.2, 1.0],
      [0.62, 0.92, 1.05],
      [0.3, 0.3, 0.33],
    ],
    gem: 'puck',
    button: 'ring',
    particles: 'sparks',
    hopoScale: 0.86,
  },
  swiss: {
    id: 'swiss',
    name: 'Swiss',
    description: 'Flat geometric dots, pure colour, no glow. Strum ● HOPO ◉ tap ○.',
    style: 1,
    colors: [
      [0.0, 0.4, 0.09],
      [0.8, 0.005, 0.01],
      [1.0, 0.68, 0.0],
      [0.0, 0.1, 0.5],
      [1.0, 0.16, 0.0],
      [0.02, 0.02, 0.02],
      [0.2, 0.55, 1.0],
      [0.45, 0.45, 0.45],
    ],
    gem: 'disc',
    button: 'flat',
    particles: 'dots',
    hopoScale: 1,
  },
  baroque: {
    id: 'baroque',
    name: 'Baroque',
    description: 'Faceted jewels set in gold, pearls for HOPOs, gilded sustains.',
    style: 2,
    colors: [
      [0.02, 0.5, 0.14],
      [0.65, 0.01, 0.05],
      [1.0, 0.62, 0.06],
      [0.03, 0.13, 0.75],
      [0.95, 0.28, 0.02],
      [0.38, 0.05, 0.55],
      [0.92, 0.96, 1.05],
      [0.3, 0.28, 0.26],
    ],
    gem: 'jewel',
    button: 'gold',
    particles: 'glitter',
    hopoScale: 0.92,
  },
  pixel: {
    id: 'pixel',
    name: 'Pixel',
    description: '8-bit blocks, stepped sustains and square sparks.',
    style: 3,
    colors: [
      [0.04, 0.72, 0.04],
      [0.86, 0.04, 0.04],
      [1.0, 0.82, 0.08],
      [0.05, 0.22, 0.95],
      [1.0, 0.32, 0.02],
      [0.55, 0.08, 0.8],
      [0.35, 0.9, 1.0],
      [0.3, 0.3, 0.3],
    ],
    gem: 'block',
    button: 'square',
    particles: 'squares',
    hopoScale: 0.9,
  },
  clay: {
    id: 'clay',
    name: 'Clay',
    description: 'Soft matte pastel pebbles with a hand-made feel.',
    style: 4,
    colors: [
      [0.3, 0.72, 0.36],
      [0.9, 0.26, 0.28],
      [0.98, 0.78, 0.3],
      [0.3, 0.48, 0.92],
      [0.98, 0.48, 0.24],
      [0.6, 0.4, 0.88],
      [0.78, 0.92, 1.0],
      [0.45, 0.43, 0.42],
    ],
    gem: 'pill',
    button: 'soft',
    particles: 'puffs',
    hopoScale: 0.9,
  },
};

/** sRGB hex for a skin colour (for the DOM: results bars, pickers). */
export function skinHex(c: number[]): string {
  return '#' + c.map((v) => Math.round(Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)) * 255).toString(16).padStart(2, '0')).join('');
}
