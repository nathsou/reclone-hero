type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string };

/** Tiny hyperscript helper. Keys starting with "on" become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** replaceChildren that skips null/false children. */
export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, ...children);
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Set text only when it changed (avoids layout work in the frame loop). */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function fmtScore(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}
