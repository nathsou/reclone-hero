/** Sample the light loading screen, before the gameplay renderer can hide missed refreshes. */
export function measureDisplayInterval(signal: AbortSignal): Promise<number> {
  return new Promise(resolve => {
    let last = 0, count = 0, best = 1 / 60, raf = 0;
    const finish = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      signal.removeEventListener('abort', finish);
      resolve(best);
    };
    const frame = (now: number) => {
      if (last) {
        const dt = (now - last) / 1000;
        if (dt > 0.004) best = Math.min(best, dt);
      }
      last = now;
      if (++count >= 12) finish();
      else raf = requestAnimationFrame(frame);
    };
    const timeout = setTimeout(finish, 500);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
    else raf = requestAnimationFrame(frame);
  });
}
