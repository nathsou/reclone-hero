// A small hand-drawn icon set (24px grid, stroked with currentColor) so buttons look consistent in
// every theme instead of relying on emoji fonts.

const PATHS = {
  shuffle: '<path d="M3 7h3.5c2.5 0 4 1.5 5.5 5s3 5 5.5 5H21"/><path d="M3 17h3.5c1.4 0 2.5-.5 3.4-1.4"/><path d="M14.1 8.4C15 7.5 16 7 17.5 7H21"/><path d="m18 4 3 3-3 3"/><path d="m18 14 3 3-3 3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  folder: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  maximize: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M15 4h4a1 1 0 0 1 1 1v4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M9 20H5a1 1 0 0 1-1-1v-4"/>',
  minimize: '<path d="M9 4v4a1 1 0 0 1-1 1H4"/><path d="M20 9h-4a1 1 0 0 1-1-1V4"/><path d="M15 20v-4a1 1 0 0 1 1-1h4"/><path d="M4 15h4a1 1 0 0 1 1 1v4"/>',
  settings: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.2 4.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>',
  practice: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2"/><path d="M9.5 3h5"/>',
  bot: '<rect x="4.5" y="8" width="15" height="11" rx="3"/><path d="M12 4v4"/><circle cx="9.5" cy="13.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13.5" r="1.2" fill="currentColor"/>',
  sortAsc: '<path d="M7 5v14"/><path d="m4 16 3 3 3-3"/><path d="M13 6h3"/><path d="M13 11h5"/><path d="M13 16h7"/>',
  sortDesc: '<path d="M7 5v14"/><path d="m4 16 3 3 3-3"/><path d="M13 6h7"/><path d="M13 11h5"/><path d="M13 16h3"/>',
  filter: '<path d="M4 5h16l-6.2 7.3v5.2L10.2 19v-6.7z"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name];
  return svg;
}
