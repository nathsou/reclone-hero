// Fullscreen toggle (Shift+F). Escape leaves fullscreen as browsers normally do; during a song that
// also pauses the game (see GameScreen).

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

export function canFullscreen(): boolean {
  return document.fullscreenEnabled === true;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // denied (no user gesture, iframe restrictions…)
  }
}
