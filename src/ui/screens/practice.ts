import type { NavAction } from '../../input/input.ts';
import { trackKey } from '../../chart/types.ts';
import { formatTime } from '../../util/text.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import type { GameRequest } from './gamescreen.ts';

/** Choose a section range and speed, then loop it. */
export class PracticeModal implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;

  constructor(app: App, req: Omit<GameRequest, 'bot' | 'practice'> & { bot?: boolean }, startSection = 0) {
    this.app = app;
    const chart = req.chart;
    const track = chart.tracks.get(trackKey(req.instrument, req.difficulty))!;
    const notes = track.notes;
    const secs = chart.sections.length ? chart.sections : [{ time: notes.length ? notes.time[0] : 0, name: 'Whole song' }];
    const option = (i: number) => h('option', { value: String(i) }, `${formatTime(secs[i].time)}  ${secs[i].name}`);
    const from = h('select', null, ...secs.map((_, i) => option(i)));
    const to = h('select', null, ...secs.map((_, i) => option(i)));
    from.value = String(startSection);
    to.value = String(startSection);
    from.addEventListener('change', () => {
      if (Number(to.value) < Number(from.value)) to.value = from.value;
    });
    const speed = h('input', { class: 'slider', type: 'range', min: '40', max: '100', step: '5', value: '75', style: '--pct:58.3%' });
    const speedLabel = h('span', { class: 'val' }, '75%');
    speed.addEventListener('input', () => {
      speedLabel.textContent = `${speed.value}%`;
      speed.style.setProperty('--pct', `${((Number(speed.value) - 40) / 60) * 100}%`);
    });

    const start = async () => {
      const a = Number(from.value);
      const b = Math.max(a, Number(to.value));
      const startT = secs[a].time;
      const endT = b + 1 < secs.length ? secs[b + 1].time : notes.endTime[notes.length - 1] + 0.5;
      let first = notes.time.findIndex((time) => time >= startT - 0.001);
      let last = -1;
      for (let i = notes.length - 1; i >= 0; i--) {
        if (notes.time[i] < endT - 0.001) {
          last = i;
          break;
        }
      }
      if (first < 0 || last < first) {
        app.toast('No notes in that range.');
        return;
      }
      first = Math.max(0, first);
      const label = a === b ? secs[a].name : `${secs[a].name} → ${secs[b].name}`;
      const practiceEnd = Math.max(notes.endTime[last], notes.time[last]) + 0.4;
      app.popModal(this);
      const { GameScreen } = await import('./gamescreen.ts');
      app.show(
        new GameScreen(app, {
          ...req,
          bot: false,
          practice: { start: notes.time[first], end: practiceEnd, speed: Number(speed.value) / 100, first, last, label },
        }),
      );
    };

    this.el = h(
      'div',
      { class: 'modal-backdrop', onclick: (e: Event) => e.target === this.el && app.popModal(this) },
      h(
        'div',
        { class: 'modal practice-modal' },
        h('h2', null, 'Practice'),
        h('p', { class: 'hint' }, 'Loops the chosen sections. Audio is slowed down without changing pitch.'),
        h('label', { class: 'row' }, h('span', null, 'From'), from),
        h('label', { class: 'row' }, h('span', null, 'To'), to),
        h('label', { class: 'row' }, h('span', null, 'Speed'), speed, speedLabel),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: start }, 'Start practice'), h('button', { class: 'btn ghost', onclick: () => app.popModal(this) }, 'Cancel')),
      ),
    );
    this.start = start;
  }

  private start: () => Promise<void>;

  nav(a: NavAction): void {
    if (a === 'confirm') void this.start();
    else if (a === 'back') this.app.popModal(this);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') this.app.popModal(this);
    else if (e.key === 'Enter' && !(document.activeElement instanceof HTMLSelectElement)) void this.start();
    else return false;
    return true;
  }
}
