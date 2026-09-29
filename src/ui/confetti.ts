/**
 * Confetti and fireworks on a 2D canvas laid over an element, for celebrations (a full combo).
 * Self-contained: it runs its own animation frames and removes its canvas when the last particle
 * is gone. Does nothing when the system asks for reduced motion.
 */

const COLOURS = ['#3cf06a', '#ff3b4a', '#ffd23a', '#3a8bff', '#ff8c1a', '#ffffff', '#ffe08a'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  colour: string;
  /** paper confetti flutters and falls slowly; sparks glow, fade and leave a trail */
  kind: 'paper' | 'spark' | 'rocket';
  life: number;
  max: number;
  /** a rocket bursts into sparks when its life runs out */
  burst?: string;
}

export interface CelebrateOptions {
  /** where confetti cannons fire from (px, relative to the host), aiming up */
  cannons?: [number, number][];
  /** fireworks launched over the middle of the host */
  fireworks?: number;
  /** confetti falling from the top edge */
  rain?: number;
  /** seconds over which the cannons, rockets and rain are spread */
  spread?: number;
  /** cover the whole window (for a scrolling host) instead of the host's box */
  fixed?: boolean;
}

export function celebrate(host: HTMLElement, opts: CelebrateOptions): () => void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const dpr = Math.min(2, devicePixelRatio || 1);
  const box = opts.fixed ? { width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
  const w = box.width;
  const h = box.height;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  Object.assign(canvas.style, { position: opts.fixed ? 'fixed' : 'absolute', inset: '0', width: `${w}px`, height: `${h}px`, pointerEvents: 'none', zIndex: '50' });
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const bits: Bit[] = [];
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const scale = Math.min(1.4, Math.max(0.6, h / 800));

  const paper = (x: number, y: number, vx: number, vy: number) =>
    bits.push({ x, y, vx, vy, rot: rand(0, Math.PI * 2), vr: rand(-12, 12), size: rand(6, 11) * scale, colour: pick(COLOURS), kind: 'paper', life: 0, max: rand(2.6, 4.2) });
  const cannon = ([x, y]: [number, number], n: number) => {
    // aim up and a little towards the middle of the screen
    const lean = ((w / 2 - x) / w) * 0.9;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + lean + rand(-0.38, 0.38);
      const v = rand(560, 1150) * scale;
      paper(x, y, Math.cos(a) * v, Math.sin(a) * v);
    }
  };
  const rocket = () =>
    bits.push({ x: rand(w * 0.25, w * 0.75), y: h + 10, vx: rand(-60, 60), vy: -rand(820, 1080) * scale, rot: 0, vr: 0, size: 3, colour: '#fff6d8', kind: 'rocket', life: 0, max: rand(0.75, 1.05), burst: pick(COLOURS.slice(0, 5)) });
  const burst = (x: number, y: number, colour: string) => {
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const v = rand(180, 420) * scale;
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: 0, vr: 0, size: rand(1.6, 2.8) * scale, colour: Math.random() < 0.2 ? '#ffffff' : colour, kind: 'spark', life: 0, max: rand(0.9, 1.5) });
    }
  };

  // Schedule everything over the first `spread` seconds.
  const spread = opts.spread ?? 1.6;
  const plan: { at: number; go: () => void }[] = [];
  for (const c of opts.cannons ?? []) {
    plan.push({ at: 0, go: () => cannon(c, 55) });
    plan.push({ at: spread * 0.45, go: () => cannon(c, 30) });
  }
  for (let i = 0; i < (opts.fireworks ?? 0); i++) plan.push({ at: (i / Math.max(1, opts.fireworks! - 1)) * spread + rand(0, 0.15), go: rocket });
  for (let i = 0; i < (opts.rain ?? 0); i++) plan.push({ at: rand(0, spread), go: () => paper(rand(0, w), -20, rand(-40, 40), rand(40, 160)) });
  plan.sort((a, b) => a.at - b.at);

  let t = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    while (plan.length && plan[0].at <= t) plan.shift()!.go();

    ctx.clearRect(0, 0, w, h);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      if (b.kind === 'paper') {
        // strong air drag, gentle gravity and a flutter from side to side
        b.vx *= Math.exp(-2.2 * dt);
        b.vy = b.vy * Math.exp(-2.2 * dt) + 520 * scale * dt;
        b.vy = Math.min(b.vy, 190 * scale);
        b.x += (b.vx + Math.sin(b.life * 6 + b.rot) * 40) * dt;
      } else {
        b.vx *= Math.exp(-(b.kind === 'spark' ? 1.6 : 0.2) * dt);
        b.vy = b.vy * Math.exp(-(b.kind === 'spark' ? 1.6 : 0.2) * dt) + (b.kind === 'spark' ? 170 : 380) * scale * dt;
        b.x += b.vx * dt;
      }
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.life >= b.max || b.y > h + 40) {
        if (b.kind === 'rocket' && b.burst) burst(b.x, b.y, b.burst);
        bits.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, (b.max - b.life) / 0.6);
      if (b.kind === 'paper') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        // turning over in the air: the width shrinks and grows
        ctx.scale(Math.cos(b.life * 9 + b.rot), 1);
        ctx.fillStyle = b.colour;
        ctx.fillRect(-b.size / 2, -b.size * 0.3, b.size, b.size * 0.6);
        ctx.restore();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = b.kind === 'rocket' ? 1 : fade * fade;
        ctx.strokeStyle = b.colour;
        ctx.lineWidth = b.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!stopped && (bits.length || plan.length)) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}
