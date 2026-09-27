import { onSettingsChange, settings } from '../settings.ts';

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
let light = false;

function apply() {
  document.documentElement.dataset.theme = settings.theme;
  light = settings.theme === 'light' || (settings.theme === 'system' && !!media?.matches);
}

/** Follow the theme setting (and the OS setting when it is "system"). */
export function initTheme(): void {
  apply();
  onSettingsChange(apply);
  media?.addEventListener('change', apply);
}

/** Whether the effective theme is light (cheap; safe to call every frame). */
export function isLightTheme(): boolean {
  return light;
}
