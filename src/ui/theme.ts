import { onSettingsChange, settings } from '../settings.ts';
import { THEMES } from './themes.ts';
import type { RenderTheme, ThemeId } from './themes.ts';

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
let current: ThemeId = 'neon';

/** The theme in effect: "system" follows the OS between Neon and Light. */
export function resolveTheme(): ThemeId {
  const t = settings.theme;
  if (t === 'system') return media?.matches ? 'light' : 'neon';
  return t in THEMES ? (t as ThemeId) : 'neon';
}

function apply() {
  current = resolveTheme();
  document.documentElement.dataset.theme = current;
}

/** Follow the theme setting (and the OS setting when it is "system"). */
export function initTheme(): void {
  apply();
  onSettingsChange(apply);
  media?.addEventListener('change', apply);
}

/** Scene parameters for the current theme (cheap; safe to call every frame). */
export function renderTheme(): RenderTheme {
  return THEMES[current].render;
}
