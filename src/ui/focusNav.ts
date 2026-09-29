import type { NavAction } from '../input/input.ts';

/**
 * Guitar and keyboard navigation over the controls in a panel: up/down (strum, arrows) move between
 * controls, left/right (blue/orange, arrows) adjust sliders, switches, selects and chip groups, and
 * confirm (green, Enter) presses the focused control.
 */

const SELECTOR = 'button, input, select, [data-stop], [data-items]';

/** Focusable controls in document order; chips inside a chip group are reached through the group. */
export function controls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
    if (el.classList.contains('hidden-input')) return false;
    const group = el.parentElement?.closest('[data-items]');
    if (group && root.contains(group)) return false;
    return el.getClientRects().length > 0;
  });
}

export function moveFocus(root: HTMLElement, dir: number): void {
  const list = controls(root);
  if (!list.length) return;
  const active = document.activeElement as HTMLElement | null;
  const i = list.findIndex((x) => x === active || x.contains(active));
  const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + dir))];
  if (!next.hasAttribute('tabindex') && !(next instanceof HTMLButtonElement || next instanceof HTMLInputElement || next instanceof HTMLSelectElement)) next.tabIndex = 0;
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}

/** Whether nudging the focused control in `dir` would change it (false at the end of its range too). */
export function canAdjust(dir: number): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el instanceof HTMLInputElement && el.type === 'range') {
    const v = Number(el.value);
    return dir > 0 ? v < Number(el.max || 100) : v > Number(el.min || 0);
  }
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked !== dir > 0;
  if (el instanceof HTMLSelectElement) return dir > 0 ? el.selectedIndex < el.options.length - 1 : el.selectedIndex > 0;
  if (el.dataset.items) {
    const chips = [...el.querySelectorAll<HTMLElement>(el.dataset.items)];
    const on = chips.findIndex((c) => c.classList.contains('on'));
    // with nothing picked yet, only "right" picks the first
    return on < 0 ? dir > 0 && chips.length > 0 : dir > 0 ? on < chips.length - 1 : on > 0;
  }
  return false;
}

/** Nudge the focused control: returns false when it has nothing to adjust. */
export function adjustFocused(dir: number): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.dataset.items && !canAdjust(dir)) return true; // at the end of the group: stay put
  if (el instanceof HTMLInputElement && el.type === 'range') {
    if (dir > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    if (el.checked !== dir > 0) el.click();
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
    if (i !== el.selectedIndex) {
      el.selectedIndex = i;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }
  if (el.dataset.items) {
    const chips = [...el.querySelectorAll<HTMLElement>(el.dataset.items)];
    const on = chips.findIndex((c) => c.classList.contains('on'));
    const next = chips[on < 0 ? 0 : Math.max(0, Math.min(chips.length - 1, on + dir))];
    if (next && next !== chips[on]) next.click();
    if (el.isConnected) el.focus();
    return true;
  }
  return false;
}

/** Handle a guitar/keyboard navigation action inside `root`; returns whether it was used. */
export function navFocus(root: HTMLElement, a: NavAction): boolean {
  if (a === 'up' || a === 'down') {
    moveFocus(root, a === 'up' ? -1 : 1);
    return true;
  }
  if (a === 'left' || a === 'right') {
    if (!adjustFocused(a === 'left' ? -1 : 1)) moveFocus(root, a === 'left' ? -1 : 1);
    return true;
  }
  if (a === 'confirm') {
    const el = document.activeElement as HTMLElement | null;
    if (el && root.contains(el) && el !== root) {
      if (el instanceof HTMLInputElement && el.type === 'range') return false;
      el.click();
      return true;
    }
    moveFocus(root, 1);
    return true;
  }
  return false;
}

/** Keyboard equivalent of navFocus for arrow keys (Enter and Space already press buttons). */
export function keyFocus(root: HTMLElement, e: KeyboardEvent): boolean {
  const typing = e.target instanceof HTMLInputElement && (e.target.type === 'text' || e.target.type === 'search');
  if (typing) return false;
  if (e.key === 'ArrowDown') return navFocus(root, 'down');
  if (e.key === 'ArrowUp') return navFocus(root, 'up');
  if (e.key === 'ArrowLeft') return navFocus(root, 'left');
  if (e.key === 'ArrowRight') return navFocus(root, 'right');
  return false;
}
