// Theme registry: every theme drives both the page (CSS tokens, see style.css) and the 3D scene.
import type { SkinId } from '../render/skins.ts';

export type Rgb = [number, number, number];

/** Scene parameters (linear-light colours). */
export interface RenderTheme {
  light: boolean;
  /** background gradient, bottom to top */
  bgBottom: Rgb;
  bgTop: Rgb;
  /** how much album art / video shows through */
  art: number;
  /** multiplies the highway surface colour */
  highwayTint: Rgb;
  /** highway surface far / near, lane separators and strike line (may be negative to darken) */
  hwFar: Rgb;
  hwNear: Rgb;
  laneLine: Rgb;
  strike: Rgb;
  /** beat lines colour, and 0 = additive glow / 1 = painted over (for light highways) */
  beat: Rgb;
  beatOver: number;
  /** synthwave sun and horizon grid */
  grid: number;
  /** CRT scanlines */
  scanlines: number;
  /** baroque damask pattern */
  pattern: number;
  bloom: number;
  vignette: number;
  /** side rails: a fixed colour (steel, ink), or null to colour them by multiplier */
  railColor: Rgb | null;
  /** 0 = plain board, 1 = the textured Classic board */
  board: number;
  /** 0 = shaded gems, 1 = flat "inked" gems with heavy outlines and a drop shadow (Daylight ink) */
  ink: number;
  inkColor: Rgb;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
  /** background, panel, accent, text: for the picker preview */
  swatch: [string, string, string, string];
  /** note style used when the note style is "Match theme" */
  skin: SkinId;
  render: RenderTheme;
}

export const THEME_IDS = ['classic', 'ink', 'swiss', 'baroque', 'synthwave', 'terminal', 'paper', 'midnight'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

const DARK_HIGHWAY = {
  hwFar: [0.008, 0.008, 0.016] as Rgb,
  hwNear: [0.03, 0.028, 0.05] as Rgb,
  laneLine: [0.06, 0.06, 0.09] as Rgb,
  strike: [0.25, 0.25, 0.3] as Rgb,
  beat: [0.7, 0.7, 0.85] as Rgb,
  beatOver: 0,
};

function scene(r: Partial<RenderTheme> & Pick<RenderTheme, 'light' | 'bgBottom' | 'bgTop'>): RenderTheme {
  return { art: 1, highwayTint: [1, 1, 1], grid: 0, scanlines: 0, pattern: 0, bloom: 0.55, vignette: 0.35, railColor: null, board: 0, ink: 0, inkColor: [0.01, 0.009, 0.007], ...DARK_HIGHWAY, ...r };
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    id: 'classic',
    name: 'Classic dark',
    description: 'Textured board, cone gems, wheel frets.',
    swatch: ['#0d0c0b', '#171614', '#ff7038', '#f2efe9'],
    skin: 'cone',
    render: scene({
      light: false,
      bgBottom: [0.004, 0.0035, 0.003],
      bgTop: [0.002, 0.0018, 0.0016],
      art: 0.45,
      board: 1,
      railColor: [0.55, 0.53, 0.5],
      hwFar: [0.004, 0.003, 0.0026],
      hwNear: [0.0095, 0.0068, 0.0056],
      laneLine: [0.075, 0.07, 0.064],
      strike: [0.55, 0.53, 0.5],
      beat: [0.72, 0.7, 0.66],
      bloom: 0.45,
      vignette: 0.55,
    }),
  },
  ink: {
    id: 'ink',
    name: 'Daylight ink',
    description: 'Paper highway with inked outlines.',
    swatch: ['#ece6db', '#faf7f1', '#ff7038', '#1a1814'],
    skin: 'dome',
    render: scene({
      light: true,
      bgBottom: [0.84, 0.8, 0.72],
      bgTop: [0.84, 0.8, 0.72],
      art: 0,
      ink: 1,
      inkColor: [0.011, 0.01, 0.008],
      railColor: [0.011, 0.01, 0.008],
      hwFar: [0.93, 0.9, 0.85],
      hwNear: [0.955, 0.93, 0.885],
      laneLine: [-0.16, -0.16, -0.16],
      strike: [-0.9, -0.9, -0.9],
      beat: [0.011, 0.01, 0.008],
      beatOver: 0.9,
      bloom: 0,
      vignette: 0,
    }),
  },
  swiss: {
    id: 'swiss',
    name: 'Swiss',
    description: 'International Typographic Style: white, black, red, a strict grid.',
    swatch: ['#ffffff', '#f2f2f2', '#e30613', '#111111'],
    skin: 'dome',
    render: scene({
      light: true,
      bgBottom: [0.86, 0.86, 0.86],
      bgTop: [0.97, 0.97, 0.97],
      art: 0,
      hwFar: [0.62, 0.62, 0.62],
      hwNear: [0.78, 0.78, 0.78],
      laneLine: [-0.55, -0.55, -0.55],
      strike: [-0.7, -0.7, -0.7],
      beat: [0.02, 0.02, 0.02],
      beatOver: 0.55,
      bloom: 0.25,
      vignette: 0,
    }),
  },
  baroque: {
    id: 'baroque',
    name: 'Baroque',
    description: 'Oxblood velvet, gilded frames and engraved type.',
    swatch: ['#140a0b', '#2e1614', '#d4a24c', '#f3e6c8'],
    skin: 'dome',
    render: scene({
      light: false,
      bgBottom: [0.05, 0.008, 0.01],
      bgTop: [0.018, 0.004, 0.006],
      art: 0.5,
      highwayTint: [1.35, 0.95, 0.7],
      laneLine: [0.18, 0.11, 0.03],
      strike: [0.45, 0.3, 0.08],
      beat: [0.8, 0.55, 0.2],
      pattern: 1,
      bloom: 0.5,
      vignette: 0.5,
    }),
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro sunset, horizon grid, hot pink.',
    swatch: ['#13051f', '#2c0f48', '#ff4fd8', '#ffe9fb'],
    skin: 'glass',
    render: scene({ light: false, bgBottom: [0.05, 0.004, 0.06], bgTop: [0.02, 0.004, 0.06], art: 0.3, highwayTint: [1.3, 0.7, 1.7], grid: 1, bloom: 0.7, vignette: 0.3 }),
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    description: 'Phosphor green, monospace, scanlines.',
    swatch: ['#030a04', '#0a1c0d', '#39ff6a', '#b8ffc4'],
    skin: 'dome',
    render: scene({ light: false, bgBottom: [0, 0.03, 0.006], bgTop: [0, 0.008, 0], art: 0.2, highwayTint: [0.55, 1.35, 0.65], scanlines: 1, bloom: 0.75, vignette: 0.45 }),
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    description: 'Warm cream pages and serif type.',
    swatch: ['#f5efe3', '#fffaf0', '#c2410c', '#2a2118'],
    skin: 'dome',
    render: scene({ light: true, bgBottom: [0.88, 0.7, 0.44], bgTop: [0.97, 0.85, 0.62], art: 0.25, highwayTint: [1.45, 1.05, 0.7], bloom: 0.35, vignette: 0.1 }),
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy and cool cyan.',
    swatch: ['#050d1a', '#10223b', '#4cc9f0', '#e4efff'],
    skin: 'glass',
    render: scene({ light: false, bgBottom: [0.01, 0.035, 0.08], bgTop: [0.003, 0.01, 0.035], art: 0.8, highwayTint: [0.8, 1.0, 1.4], bloom: 0.6 }),
  },
};
