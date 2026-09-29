import { rng } from './dsp.ts';
import type { SongDef } from './score.ts';
import { COVER_DESIGNS } from './coverDesign.ts';
import type { CoverDesign } from './coverDesign.ts';

const SIZE = 512;
const FONT = "'Inter Tight', 'Inter', system-ui, sans-serif";
const TAU = Math.PI * 2;

/** A cover is a small vector score, drawn only on demand. PNGs never enter the shipped bundle. */
export async function coverArt(def: SongDef): Promise<Blob> {
  // The same bundled typeface is used by the UI. Wait for it so first-visit covers don't cache
  // fallback-font lettering, which can overflow after a reload on another browser.
  await document.fonts.load(`800 48px ${FONT}`);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  drawCover(g, def);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'));
}

/** Kept separate from Blob encoding so the whole collection can be previewed and audited. */
export function drawCover(g: CanvasRenderingContext2D, def: SongDef): void {
  const design = COVER_DESIGNS[def.id] ?? fallback(def);
  const seed = [...def.id].reduce((a, c) => Math.imul(a, 31) + c.charCodeAt(0) | 0, 7);
  const rand = rng(seed);
  const { from, to, ink } = def.art;
  const paper = design.layout === 1;
  const bold = design.layout === 2;
  const bg = paper ? ink : bold ? to : from;
  // Dark accent colours sometimes need light lettering even on the bold poster layout.
  let fg = contrast(from, bg) >= contrast(ink, bg) ? from : ink;
  if (contrast(fg, bg) < 4.5) fg = contrast('#ffffff', bg) > contrast('#060606', bg) ? '#ffffff' : '#060606';
  const accent = paper ? to : bold ? ink : to;
  g.save();
  g.fillStyle = bg;
  g.fillRect(0, 0, SIZE, SIZE);
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Oversized colour fields give the thumbnail a silhouette before the fine lettering is legible.
  g.fillStyle = accent;
  g.globalAlpha = paper ? 0.16 : bold ? 0.18 : 0.28;
  if (paper) {
    g.beginPath(); g.arc(384, 135, 246, 0, TAU); g.fill();
  } else if (bold) {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(310, 0); g.lineTo(512, 334); g.lineTo(512, 392); g.lineTo(0, 195); g.fill();
  } else {
    g.globalAlpha = 0.3;
    g.beginPath(); g.ellipse(280, 196, 204, 160, -0.3, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  backdrop(g, design.scene, accent, rand, paper);

  // Three distinct poster compositions, with per-song framing and an individually drawn symbol.
  g.save();
  const x = paper ? 105 : bold ? 128 : 108;
  const y = paper ? 82 : bold ? 72 : 76;
  const scale = paper ? 2.7 : bold ? 2.65 : 2.85;
  g.translate(x, y);
  g.scale(scale, scale);
  g.translate(50, 50);
  g.rotate(paper ? -0.07 : bold ? 0.06 : 0);
  g.translate(-50, -50);
  const silhouette = new Path2D(design.shape);
  g.save();
  g.translate(paper ? 2 : 3, paper ? 3 : 4);
  g.fillStyle = accent;
  g.globalAlpha = paper ? 0.7 : 0.45;
  g.fill(silhouette, 'evenodd');
  g.restore();
  g.fillStyle = fg;
  g.fill(silhouette, 'evenodd');
  if (design.lines) {
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.stroke(new Path2D(design.lines));
  }
  g.restore();

  // A quiet title area holds its contrast regardless of the illustration palette.
  g.fillStyle = bg;
  g.globalAlpha = 0.94;
  g.fillRect(0, 370, SIZE, 142);
  g.globalAlpha = 1;
  g.strokeStyle = fg;
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(30, 370); g.lineTo(482, 370); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = fg;
  g.textBaseline = 'top';
  lettering(g, def.artist.toUpperCase(), 30, 24, 452, 15, 600);
  // The genre is secondary, leaving the title and composer as the visual anchors.
  g.save(); g.translate(485, 352); g.rotate(-Math.PI / 2);
  g.globalAlpha = 0.75;
  lettering(g, def.genre.toUpperCase(), 0, -12, 240, 11, 600);
  g.restore();
  title(g, def.name, fg);
  g.restore();
}

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(i => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const l = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l[0] + 0.05) / (l[1] + 0.05);
}

function lettering(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight: number) {
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > width && size > 9) g.font = `${weight} ${--size}px ${FONT}`;
  g.fillText(text, x, y, width);
}

/** Keep meaningful words together; long classical titles get three lines instead of tiny type. */
function title(g: CanvasRenderingContext2D, name: string, color: string) {
  let size = name.length < 18 ? 55 : 48;
  let lines: string[] = [];
  for (; size >= 29; size--) {
    g.font = `800 ${size}px ${FONT}`;
    lines = [''];
    for (const word of name.split(/\s+/)) {
      const i = lines.length - 1;
      const candidate = lines[i] ? `${lines[i]} ${word}` : word;
      if (lines[i] && g.measureText(candidate).width > 452) lines.push(word);
      else lines[i] = candidate;
    }
    if (lines.length * size * 1.04 <= 104 && lines.every(l => g.measureText(l).width <= 452)) break;
  }
  g.fillStyle = color;
  g.font = `800 ${size}px ${FONT}`;
  const y = 386 + Math.max(0, (104 - lines.length * size * 1.04) / 2);
  lines.forEach((line, i) => g.fillText(line, 30, y + i * size * 1.04, 452));
}

function backdrop(g: CanvasRenderingContext2D, scene: CoverDesign['scene'], color: string, rand: () => number, paper: boolean) {
  g.save();
  g.beginPath(); g.rect(0, 58, 512, 306); g.clip();
  g.fillStyle = g.strokeStyle = color;
  g.globalAlpha = paper ? 0.35 : 0.38;
  g.lineWidth = 1.5;
  switch (scene) {
    case 'rays':
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU + rand() * 0.04;
        g.beginPath(); g.moveTo(256 + Math.cos(a) * 167, 215 + Math.sin(a) * 167);
        g.lineTo(256 + Math.cos(a) * 360, 215 + Math.sin(a) * 360); g.stroke();
      }
      break;
    case 'steps':
      for (let i = 0; i < 8; i++) {
        g.beginPath(); const y = 85 + i * 36;
        g.moveTo(0, y); g.lineTo(58 + i * 25, y); g.lineTo(112 + i * 25, y + 26); g.lineTo(512, y + 26); g.stroke();
      }
      break;
    case 'ribbons':
      for (let i = 0; i < 6; i++) {
        g.beginPath(); const x = -100 + i * 120;
        g.moveTo(x, 80); g.bezierCurveTo(x + 220, 95, x - 130, 304, x + 240, 355); g.stroke();
      }
      break;
    case 'stars':
      for (let i = 0; i < 50; i++) {
        const x = 12 + rand() * 488, y = 60 + rand() * 290, r = 1 + rand() * 2;
        if (i % 8 === 0) { g.fillRect(x - r * 2, y, r * 4, 1); g.fillRect(x, y - r * 2, 1, r * 4); }
        else {g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();}
      }
      break;
    case 'staff':
      for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) {
        const y = 90 + j * 112 + i * 9;
        g.beginPath();g.moveTo(0, y);g.bezierCurveTo(180, y - 50, 360, y + 40, 512, y - 15);g.stroke();
      }
      break;
    case 'tiles':
      for (let y = 62; y < 364; y += 38) for (let x = 12; x < 512; x += 38) {
        if (rand() < 0.24) g.fillRect(x, y, 18, 18);
        else g.strokeRect(x, y, 18, 18);
      }
      break;
    case 'ripples':
      for (let i = 0; i < 11; i++) {
        const y = 65 + i * 29;
        g.beginPath();g.moveTo(-20, y);
        for (let x = -20; x < 532; x += 55) {
          g.quadraticCurveTo(x + 14, y - 11, x + 28, y);
          g.quadraticCurveTo(x + 41, y + 11, x + 55, y);
        }
        g.stroke();
      }
      break;
  }
  g.restore();
}

/** New, uncatalogued songs still get a code-only cover; the shipped catalog has bespoke designs. */
function fallback(def: SongDef): CoverDesign {
  return {scene: def.art.motif === 'orbit' ? 'stars' : 'ribbons', layout: 0,
    shape: 'M18 25H82V75H18ZM26 33V67H74V33Z', lines:'M35 55L45 40L55 60L65 45'};
}
