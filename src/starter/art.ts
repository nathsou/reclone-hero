import { rng } from './dsp.ts';
import type { SongDef } from './score.ts';

const SIZE = 512;

/** Album cover for a built-in song: a gradient, a motif, and the title set in the corner. */
export async function coverArt(def: SongDef): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  const { from, to, ink, motif } = def.art;
  const bg = g.createLinearGradient(0, 0, SIZE * 0.3, SIZE);
  bg.addColorStop(0, from);
  bg.addColorStop(1, to);
  g.fillStyle = bg;
  g.fillRect(0, 0, SIZE, SIZE);
  const rand = rng([...def.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  const c = SIZE / 2;

  switch (motif) {
    case 'sun': {
      // setting sun cut by horizontal bands, over a horizon
      const r = SIZE * 0.3;
      const cy = SIZE * 0.5;
      g.save();
      g.beginPath();
      g.arc(c, cy, r, 0, Math.PI * 2);
      g.clip();
      const sun = g.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, ink);
      sun.addColorStop(1, to);
      g.fillStyle = sun;
      g.fillRect(0, 0, SIZE, SIZE);
      g.fillStyle = from;
      for (let i = 0; i < 7; i++) {
        const y = cy + r * 0.05 + i * i * 3.4 + i * 6;
        g.fillRect(0, y, SIZE, 2 + i * 1.6);
      }
      g.restore();
      g.globalAlpha = 0.55;
      g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const y = cy + r + 6 + i * i * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(SIZE, y);
        g.stroke();
      }
      break;
    }
    case 'grid': {
      const hy = SIZE * 0.46;
      g.globalAlpha = 0.8;
      g.lineWidth = 2;
      for (let i = -12; i <= 12; i++) {
        g.beginPath();
        g.moveTo(c + i * 8, hy);
        g.lineTo(c + i * 90, SIZE);
        g.stroke();
      }
      for (let i = 1; i < 12; i++) {
        const y = hy + (SIZE - hy) * (i / 12) ** 2.2;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(SIZE, y);
        g.stroke();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 40; i++) g.fillRect(rand() * SIZE, rand() * hy * 0.9, 2, 2);
      break;
    }
    case 'rings': {
      g.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = 0.9 - i * 0.055;
        g.beginPath();
        g.arc(c + i * 6, SIZE * 0.42 - i * 2, 18 + i * 17, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case 'bars': {
      const n = 24;
      const w = SIZE / n;
      for (let i = 0; i < n; i++) {
        const h = SIZE * (0.12 + 0.55 * Math.abs(Math.sin(i * 0.45 + rand() * 0.6)) * (0.5 + rand() * 0.5));
        g.globalAlpha = 0.35 + 0.6 * (h / (SIZE * 0.67));
        g.fillRect(i * w + 3, SIZE * 0.72 - h, w - 6, h);
      }
      break;
    }
    case 'wave': {
      g.lineWidth = 2.5;
      for (let k = 0; k < 16; k++) {
        g.globalAlpha = 0.25 + k * 0.045;
        g.beginPath();
        for (let x = 0; x <= SIZE; x += 4) {
          const y = SIZE * 0.2 + k * 20 + Math.sin(x * 0.018 + k * 0.5) * 24 * Math.sin(k * 0.3 + 0.5) + Math.sin(x * 0.051 + k) * 6;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    }
    case 'crest': {
      // nested arches, like a cathedral window, with a rose at the top
      g.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const w = 150 - i * 22;
        const top = SIZE * 0.2 + i * 18;
        const bottom = SIZE * 0.74;
        g.globalAlpha = 1 - i * 0.12;
        g.beginPath();
        g.moveTo(c - w, bottom);
        g.lineTo(c - w, top + w);
        g.arc(c, top + w, w, Math.PI, 0);
        g.lineTo(c + w, bottom);
        g.stroke();
      }
      g.globalAlpha = 0.9;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        g.beginPath();
        g.arc(c + Math.cos(a) * 26, SIZE * 0.36 + Math.sin(a) * 26, 14, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case 'shards': {
      for (let i = 0; i < 26; i++) {
        g.globalAlpha = 0.15 + rand() * 0.6;
        const x = rand() * SIZE;
        const y = rand() * SIZE * 0.75;
        const s = 20 + rand() * 90;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * s * 2, y + s);
        g.lineTo(x + (rand() - 0.5) * s * 2, y + s * (0.3 + rand()));
        g.closePath();
        if (rand() < 0.5) g.fill();
        else g.stroke();
      }
      break;
    }
    case 'orbit': {
      g.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) {
        g.globalAlpha = 0.7;
        g.beginPath();
        g.ellipse(c, SIZE * 0.42, 40 + i * 30, 14 + i * 10, -0.35, 0, Math.PI * 2);
        g.stroke();
        // a planet somewhere on the (rotated) orbit
        const a = rand() * Math.PI * 2;
        const rx = 40 + i * 30;
        const ry = 14 + i * 10;
        const th = -0.35;
        const px = c + rx * Math.cos(a) * Math.cos(th) - ry * Math.sin(a) * Math.sin(th);
        const py = SIZE * 0.42 + rx * Math.cos(a) * Math.sin(th) + ry * Math.sin(a) * Math.cos(th);
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(px, py, 4 + rand() * 5, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(c, SIZE * 0.42, 26, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }

  // title block
  g.globalAlpha = 1;
  const shade = g.createLinearGradient(0, SIZE * 0.62, 0, SIZE);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = shade;
  g.fillRect(0, SIZE * 0.6, SIZE, SIZE * 0.4);
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  const font = "'Inter Tight', 'Inter', system-ui, sans-serif";
  let size = 58;
  g.font = `800 ${size}px ${font}`;
  while (g.measureText(def.name).width > SIZE - 64 && size > 26) g.font = `800 ${(size -= 2)}px ${font}`;
  g.fillText(def.name, 32, SIZE - 40);
  g.globalAlpha = 0.85;
  g.font = `600 22px ${font}`;
  g.fillText(def.artist.toUpperCase(), 32, SIZE - 40 - size - 6);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
