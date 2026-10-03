import { SKINS, skinHex } from '../render/skins.ts';
import type { SkinId } from '../render/skins.ts';

/**
 * A small SVG showing a skin's strum, HOPO and tap gems (green, red, yellow), for the style picker.
 * Built from constant markup only.
 */
/** Linear blend of two #rrggbb colours in sRGB, like a CSS colour-mix. */
function mixHex(a: string, b: string, t: number): string {
  let out = '#';
  for (let i = 1; i < 7; i += 2) {
    const v = Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t);
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

// Classic dome: per fret colour (green, red, yellow) the light tint, the shade and the deep skirt colour.
const DOME = [
  { tint: '#8dffab', shade: '#15803d', deep: '#0f6b2c' },
  { tint: '#ff8c96', shade: '#a3162a', deep: '#8c1220' },
  { tint: '#ffe68a', shade: '#a87f06', deep: '#8f6a05' },
];

export function skinPreviewSvg(id: SkinId): string {
  const skin = SKINS[id];
  const [g, r, y] = skin.colors.slice(0, 3).map(skinHex);
  const cx = [22, 60, 98];
  const cy = 26;
  let body = '';
  let defs = '';
  const gem = (x: number, col: string, kind: 0 | 1 | 2, idx: number) => {
    switch (id) {
      case 'dome': {
        const c = DOME[idx];
        const bodyStops =
          kind === 1
            ? `<stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#d9d5cd"/><stop offset="1" stop-color="${mixHex('#d9d5cd', col, 0.6)}"/>`
            : `<stop offset="0" stop-color="${c.tint}"/><stop offset=".55" stop-color="${col}"/><stop offset="1" stop-color="${c.shade}"/>`;
        const capStops =
          kind === 2
            ? '<stop offset="0" stop-color="#4a4641"/><stop offset="1" stop-color="#0d0c0b"/>'
            : '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8e4dd"/>';
        defs += `<radialGradient id="dome-b${idx}" cx=".5" cy=".28" r=".8">${bodyStops}</radialGradient>`;
        defs += `<radialGradient id="dome-c${idx}" cx=".4" cy=".35" r=".8">${capStops}</radialGradient>`;
        body += `<ellipse cx="${x}" cy="${cy + 5}" rx="16" ry="11" fill="${c.deep}"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="${mixHex('#9c978e', col, 0.4)}"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 0.5}" rx="13" ry="8.6" fill="url(#dome-b${idx})"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 1.6}" rx="6.8" ry="4.4" fill="url(#dome-c${idx})"/>`;
        break;
      }
      case 'glass': {
        // a clear bead: tinted body, bright rim, a crescent highlight and a coloured caustic below
        defs += `<radialGradient id="glass-b${idx}" cx=".5" cy=".6" r=".65"><stop offset="0" stop-color="${kind === 1 ? '#f4f4f8' : kind === 2 ? '#1a1a1e' : mixHex(col, '#ffffff', 0.25)}" stop-opacity=".9"/><stop offset=".8" stop-color="${kind === 2 ? '#0a0a0c' : col}" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></radialGradient>`;
        body += `<ellipse cx="${x}" cy="${cy + 6}" rx="12" ry="5" fill="${col}" opacity=".35"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="url(#glass-b${idx})" stroke="rgba(255,255,255,.8)" stroke-width="1"/>`;
        body += `<path d="M${x - 10} ${cy - 4} Q${x} ${cy - 11} ${x + 10} ${cy - 4}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".85"/>`;
        break;
      }
    }
  };
  gem(cx[0], g, 0, 0);
  gem(cx[1], r, 1, 1);
  gem(cx[2], y, 2, 2);
  return `<svg viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}
