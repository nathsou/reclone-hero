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
      case 'swiss': {
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="${col}"/>`;
        if (kind === 1) body += `<ellipse cx="${x}" cy="${cy}" rx="10" ry="7" fill="none" stroke="#e8e8e8" stroke-width="3.2"/>`;
        if (kind === 2) body += `<ellipse cx="${x}" cy="${cy}" rx="11.5" ry="7.8" fill="#e8e8e8"/>`;
        break;
      }
      case 'baroque': {
        const oct = (rx: number, ry: number, fill: string, extra = '') => {
          const pts = Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            return `${(x + Math.cos(a) * rx).toFixed(1)},${(cy + Math.sin(a) * ry).toFixed(1)}`;
          }).join(' ');
          body += `<polygon points="${pts}" fill="${fill}" ${extra}/>`;
        };
        oct(17, 12, '#c2892f', 'stroke="#f0cf7a" stroke-width="1.2"');
        oct(12, 8, kind === 2 ? '#141010' : col);
        body += `<ellipse cx="${x}" cy="${cy}" rx="4.5" ry="3" fill="${kind === 1 ? '#f1ece2' : 'rgba(255,255,255,.55)'}"/>`;
        break;
      }
      case 'pixel': {
        body += `<rect x="${x - 15}" y="${cy - 10}" width="30" height="20" fill="${kind === 2 ? '#1a1a1a' : col}" stroke="${col}" stroke-width="3"/>`;
        body += `<rect x="${x - 5}" y="${cy - 3.5}" width="10" height="7" fill="${kind === 1 ? '#fafafa' : 'rgba(0,0,0,.55)'}"/>`;
        break;
      }
      case 'clay': {
        body += `<ellipse cx="${x}" cy="${cy + 3}" rx="16" ry="10" fill="rgba(0,0,0,.18)"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="${kind === 2 ? '#ece7df' : col}" stroke="${col}" stroke-width="${kind === 2 ? 3 : 0}"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 1}" rx="7" ry="4.5" fill="${kind === 1 ? '#f4f1ec' : 'rgba(0,0,0,.08)'}"/>`;
        break;
      }
      default: {
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="${kind === 2 ? '#101010' : col}" filter="url(#glow-${id})"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="10" ry="6.5" fill="none" stroke="${kind === 0 ? '#f2f2f2' : col}" stroke-width="3"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="5" ry="3.2" fill="${kind === 1 ? '#ffffff' : '#101010'}"/>`;
      }
    }
  };
  gem(cx[0], g, 0, 0);
  gem(cx[1], r, 1, 1);
  gem(cx[2], y, 2, 2);
  const glow = `<defs>${defs}<filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  return `<svg viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${glow}${body}</svg>`;
}
