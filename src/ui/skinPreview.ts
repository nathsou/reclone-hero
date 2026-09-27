import { SKINS, skinHex } from '../render/skins.ts';
import type { SkinId } from '../render/skins.ts';

/**
 * A small SVG showing a skin's strum, HOPO and tap gems (green, red, yellow), for the style picker.
 * Built from constant markup only.
 */
export function skinPreviewSvg(id: SkinId): string {
  const skin = SKINS[id];
  const [g, r, y] = skin.colors.slice(0, 3).map(skinHex);
  const cx = [22, 60, 98];
  const cy = 26;
  let body = '';
  const gem = (x: number, col: string, kind: 0 | 1 | 2) => {
    switch (id) {
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
  gem(cx[0], g, 0);
  gem(cx[1], r, 1);
  gem(cx[2], y, 2);
  const glow = `<defs><filter id="glow-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  return `<svg viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${glow}${body}</svg>`;
}
