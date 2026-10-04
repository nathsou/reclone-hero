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

// Classic dome: per fret colour (green, red, yellow) the face, its highlight and its shaded edge
// (FRET, LIGHT and SHADE in the shaders).
const DOME = [
  { fret: '#1fd14a', light: '#8cffa6', shade: '#08762a' },
  { fret: '#f2263b', light: '#ff8a94', shade: '#96101f' },
  { fret: '#ffcc12', light: '#fff08a', shade: '#a37400' },
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
        // dark base, a ring of the fret colour, then the face: colour (strum), white (HOPO) or dark (tap)
        const c = DOME[idx];
        const faceStops =
          kind === 1
            ? `<stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e4e0da"/><stop offset=".8" stop-color="${c.fret}"/><stop offset="1" stop-color="${c.shade}"/>`
            : kind === 2
              ? '<stop offset="0" stop-color="#24232a"/><stop offset="1" stop-color="#08080a"/>'
              : `<stop offset="0" stop-color="${mixHex(c.fret, c.light, 0.45)}"/><stop offset=".6" stop-color="${c.fret}"/><stop offset="1" stop-color="${c.shade}"/>`;
        defs += `<radialGradient id="dome-f${idx}" cx=".42" cy=".45" r=".62">${faceStops}</radialGradient>`;
        const ring = kind === 0 ? mixHex(c.shade, c.fret, 0.55) : mixHex(c.fret, c.light, 0.2);
        body += `<ellipse cx="${x}" cy="${cy + 4}" rx="17" ry="11.5" fill="#0b0b0c"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="17" ry="11.5" fill="#26252a"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 0.4}" rx="14.8" ry="10" fill="${ring}"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 0.8}" rx="12.6" ry="8.4" fill="url(#dome-f${idx})"/>`;
        body +=
          kind === 2
            ? `<ellipse cx="${x}" cy="${cy - 1.6}" rx="5.4" ry="3.6" fill="#2a2930"/><ellipse cx="${x}" cy="${cy - 1.6}" rx="2.6" ry="1.8" fill="${c.light}"/>`
            : kind === 1
              ? `<ellipse cx="${x}" cy="${cy - 1.6}" rx="9" ry="6" fill="#ffffff" opacity=".55"/><ellipse cx="${x}" cy="${cy - 1.6}" rx="5.4" ry="3.6" fill="#ffffff"/>`
              : `<ellipse cx="${x}" cy="${cy - 1.6}" rx="5.6" ry="3.8" fill="#0d0d0f"/><ellipse cx="${x}" cy="${cy - 1.6}" rx="4.3" ry="2.9" fill="#d9d7d3"/>`;
        break;
      }
      case 'cone': {
        // a silver base band, a cone of the fret colour, and the top: a matte silver cap in a black ring
        // (strum), a glowing white top (HOPO) or a dark cap in a glowing coloured ring (tap)
        const c = DOME[idx];
        defs += `<linearGradient id="cone-s${idx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mixHex(c.fret, c.light, 0.4)}"/><stop offset=".55" stop-color="${c.fret}"/><stop offset="1" stop-color="${c.shade}"/></linearGradient>`;
        if (kind === 1) defs += `<radialGradient id="cone-g${idx}"><stop offset=".45" stop-color="#ffffff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`;
        body += `<ellipse cx="${x}" cy="${cy + 8}" rx="17" ry="6" fill="#e9e7e3"/>`;
        body += `<path d="M${x - 17} ${cy + 6} L${x - 10} ${cy - 5} L${x + 10} ${cy - 5} L${x + 17} ${cy + 6} Z" fill="url(#cone-s${idx})"/>`;
        body += `<ellipse cx="${x}" cy="${cy + 6}" rx="17" ry="5.5" fill="url(#cone-s${idx})"/>`;
        const ring = kind === 0 ? '#0d0d0f' : kind === 1 ? '#ffffff' : mixHex(c.fret, c.light, 0.35);
        const cap = kind === 0 ? '#d9d7d3' : kind === 2 ? '#1c1b20' : '#ffffff';
        if (kind === 1) body += `<ellipse cx="${x}" cy="${cy - 6}" rx="16" ry="8" fill="url(#cone-g${idx})"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 5}" rx="10" ry="4.2" fill="${ring}"/>`;
        body += `<ellipse cx="${x}" cy="${cy - 5}" rx="7" ry="2.9" fill="${cap}"/>`;
        break;
      }
      case 'glass': {
        // a lit glass bead: coloured (strum), frosted white in a coloured rim (HOPO)
        // or smoked in a glowing rim (tap); a dark band inside a bright silhouette outlines each one
        const face =
          kind === 1
            ? `<stop offset="0" stop-color="#f2f3f6"/><stop offset=".62" stop-color="#d9dbe0"/><stop offset=".68" stop-color="${col}"/><stop offset="1" stop-color="${col}"/>`
            : kind === 2
              ? `<stop offset="0" stop-color="${col}"/><stop offset=".18" stop-color="#101012"/><stop offset=".62" stop-color="#0b0b0d"/><stop offset=".68" stop-color="${col}"/><stop offset="1" stop-color="${col}"/>`
              : `<stop offset="0" stop-color="${mixHex(col, '#ffffff', 0.25)}"/><stop offset="1" stop-color="${col}"/>`;
        defs += `<radialGradient id="glass-b${idx}" cx=".5" cy=".5" r=".5">${face}</radialGradient>`;
        body += `<ellipse cx="${x}" cy="${cy + 3}" rx="18" ry="12" fill="rgba(0,0,0,.45)"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="url(#glass-b${idx})"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="14.3" ry="9.8" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/>`;
        body += `<ellipse cx="${x}" cy="${cy}" rx="16" ry="11" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1"/>`;
        body += `<path d="M${x - 9} ${cy - 5} Q${x} ${cy - 9.5} ${x + 9} ${cy - 5}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
        break;
      }
    }
  };
  gem(cx[0], g, 0, 0);
  gem(cx[1], r, 1, 1);
  gem(cx[2], y, 2, 2);
  return `<svg viewBox="0 0 120 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs}</defs>${body}</svg>`;
}
