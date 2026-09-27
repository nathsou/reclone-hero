import { h } from './dom.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** A note gem seen from the player's angle, in the game's own visual language (strum gem: white ring, dark centre). */
export function gemIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 40 26');
  svg.setAttribute('class', 'logo-gem');
  svg.setAttribute('aria-hidden', 'true');
  const shapes: [string, Record<string, string>][] = [
    ['ellipse', { cx: '20', cy: '15.5', rx: '18', ry: '9.5', class: 'gem-side' }],
    ['ellipse', { cx: '20', cy: '11.5', rx: '18', ry: '9.5', class: 'gem-top' }],
    ['ellipse', { cx: '20', cy: '11.5', rx: '11.5', ry: '6', class: 'gem-ring' }],
    ['ellipse', { cx: '20', cy: '11.5', rx: '5.5', ry: '2.9', class: 'gem-core' }],
  ];
  for (const [tag, attrs] of shapes) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}

/** The reclone hero wordmark. */
export function logo(size: 'big' | 'small' = 'big'): HTMLElement {
  const el = h('div', { class: `logo ${size}`, role: 'img', 'aria-label': 'reclone hero' }, h('span', { class: 're' }, 'reclone'), h('span', { class: 'hero' }, 'hero'));
  el.prepend(gemIcon());
  return el;
}
