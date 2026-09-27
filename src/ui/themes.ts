// Theme registry: every theme drives both the page (CSS tokens, see style.css) and the 3D scene.

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
  /** synthwave sun and horizon grid */
  grid: number;
  /** CRT scanlines */
  scanlines: number;
  bloom: number;
  vignette: number;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
  /** background, panel, accent, text: for the picker preview */
  swatch: [string, string, string, string];
  render: RenderTheme;
}

export const THEME_IDS = ['neon', 'light', 'synthwave', 'terminal', 'paper', 'midnight'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: Record<ThemeId, ThemeDef> = {
  neon: {
    id: 'neon',
    name: 'Neon',
    description: 'Glowing gems on a dark stage.',
    swatch: ['#07060d', '#1a1630', '#36e0ff', '#ece9ff'],
    render: { light: false, bgBottom: [0.03, 0.012, 0.05], bgTop: [0.012, 0.01, 0.03], art: 1, highwayTint: [1, 1, 1], grid: 0, scanlines: 0, bloom: 0.55, vignette: 0.35 },
  },
  light: {
    id: 'light',
    name: 'Light',
    description: 'Bright and airy; the highway stays dark for contrast.',
    swatch: ['#f3f1f9', '#ffffff', '#0788ad', '#1c1830'],
    render: { light: true, bgBottom: [0.8, 0.82, 0.92], bgTop: [0.9, 0.88, 0.96], art: 0.35, highwayTint: [1, 1, 1], grid: 0, scanlines: 0, bloom: 0.5, vignette: 0.08 },
  },
  synthwave: {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro sunset, horizon grid, hot pink.',
    swatch: ['#13051f', '#2c0f48', '#ff4fd8', '#ffe9fb'],
    render: { light: false, bgBottom: [0.05, 0.004, 0.06], bgTop: [0.02, 0.004, 0.06], art: 0.3, highwayTint: [1.3, 0.7, 1.7], grid: 1, scanlines: 0, bloom: 0.7, vignette: 0.3 },
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    description: 'Phosphor green, monospace, scanlines.',
    swatch: ['#030a04', '#0a1c0d', '#39ff6a', '#b8ffc4'],
    render: { light: false, bgBottom: [0, 0.03, 0.006], bgTop: [0, 0.008, 0], art: 0.2, highwayTint: [0.55, 1.35, 0.65], grid: 0, scanlines: 1, bloom: 0.75, vignette: 0.45 },
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    description: 'Warm cream pages and serif type.',
    swatch: ['#f5efe3', '#fffaf0', '#c2410c', '#2a2118'],
    render: { light: true, bgBottom: [0.88, 0.7, 0.44], bgTop: [0.97, 0.85, 0.62], art: 0.25, highwayTint: [1.45, 1.05, 0.7], grid: 0, scanlines: 0, bloom: 0.35, vignette: 0.1 },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy and cool cyan.',
    swatch: ['#050d1a', '#10223b', '#4cc9f0', '#e4efff'],
    render: { light: false, bgBottom: [0.01, 0.035, 0.08], bgTop: [0.003, 0.01, 0.035], art: 0.8, highwayTint: [0.8, 1.0, 1.4], grid: 0, scanlines: 0, bloom: 0.6, vignette: 0.35 },
  },
};
