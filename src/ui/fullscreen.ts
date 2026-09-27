// Fullscreen toggle. While fullscreen, Escape is captured (Keyboard Lock, Chromium) so it pauses the
// game instead of leaving fullscreen; holding Escape still exits.

type KeyboardLock = { lock?(keys?: string[]): Promise<void>; unlock?(): void };

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

export function canFullscreen(): boolean {
  return document.fullscreenEnabled === true;
}

export async function toggleFullscreen(): Promise<void> {
  const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  try {
    if (isFullscreen()) {
      kb?.unlock?.();
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await kb?.lock?.(['Escape']).catch(() => {});
    }
  } catch {
    // denied (no user gesture, iframe restrictions…)
  }
}
