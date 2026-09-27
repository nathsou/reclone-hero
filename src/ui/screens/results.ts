import { audio } from '../../audio/audio.ts';
import { INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import type { GameResult, SectionResult } from '../../game/game.ts';
import { getBest, recordScore, scoreKey } from '../../game/scores.ts';
import type { NavAction } from '../../input/input.ts';
import { skinHex } from '../../render/skins.ts';
import { noteSkin } from '../theme.ts';
import { settings } from '../../settings.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import type { GameRequest } from './gamescreen.ts';
import { starsEl } from './songselect.ts';

const LANE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];

export class ResultsScreen implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly req: GameRequest;
  private readonly r: GameResult;

  constructor(app: App, r: GameResult, req: GameRequest) {
    this.app = app;
    this.req = req;
    this.r = r;
    const { song } = req;
    const t = r.setup.track;
    const acc = r.total ? r.hits / r.total : 0;
    const fc = r.misses === 0 && r.overstrums === 0;
    let newBest = false;
    if (!req.bot && !req.practice) {
      const prev = getBest(scoreKey(song.id, trackKey(t.instrument, t.difficulty)));
      newBest = recordScore(scoreKey(song.id, trackKey(t.instrument, t.difficulty)), { score: r.score, stars: r.stars, accuracy: acc, fc, date: Date.now() }) && !!prev;
    }
    const weakest = weakestSection(r.sections);
    const mean = r.deltas.length ? r.deltas.reduce((a, b) => a + b, 0) / r.deltas.length : 0;

    this.el = h(
      'div',
      { class: 'screen results-screen' },
      h(
        'div',
        { class: 'res-head' },
        h('div', { class: 'res-song' }, h('div', { class: 'title' }, song.name), h('div', { class: 'artist' }, `${song.artist} · ${INSTRUMENT_LABEL[t.instrument]} ${t.difficulty}${req.bot ? ' · bot' : ''}`)),
        h(
          'div',
          { class: 'res-score' },
          h('div', { class: 'stars' }, starsEl(r.stars)),
          h('div', { class: 'score' }, r.score.toLocaleString('en-US')),
          h('div', { class: 'acc' }, `${(acc * 100).toFixed(1)}%`, fc ? h('span', { class: 'fc' }, 'FULL COMBO') : null, newBest ? h('span', { class: 'best' }, 'NEW BEST') : null),
        ),
      ),
      h(
        'div',
        { class: 'res-grid' },
        stat('Notes hit', `${r.hits} / ${r.total}`),
        stat('Best streak', String(r.maxStreak)),
        stat('Wrong frets', String(r.wrongFret), r.wrongFret ? 'bad' : ''),
        stat('Not played', String(r.lateMiss), r.lateMiss ? 'bad' : ''),
        stat('Overstrums', String(r.overstrums), r.overstrums ? 'bad' : ''),
        stat('Sustains dropped', String(r.sustainDrops), r.sustainDrops ? 'bad' : ''),
        stat('Star Power phrases', `${r.spPhrases} / ${r.spPhrasesTotal}`),
        r.solos.length ? stat('Solos', r.solos.map((s) => `${Math.round((s.hits / s.total) * 100)}%`).join(' · ')) : null,
      ),
      h(
        'div',
        { class: 'res-cols' },
        h('section', { class: 'res-card' }, h('h3', null, 'Timing'), this.timingChart(), h('p', { class: 'hint' }, timingAdvice(mean, r.deltas.length))),
        h('section', { class: 'res-card' }, h('h3', null, 'Where notes were lost'), this.missBreakdown(), this.tips()),
        h('section', { class: 'res-card sections' }, h('h3', null, 'Sections'), this.sectionList(weakest)),
      ),
      h(
        'div',
        { class: 'res-actions' },
        h('button', { class: 'btn primary big', onclick: () => this.retry() }, 'Retry'),
        weakest && !req.practice ? h('button', { class: 'btn', onclick: () => this.practiceSection(weakest) }, `Practice “${weakest.name}”`) : null,
        h('button', { class: 'btn ghost', onclick: () => this.back() }, 'Song list'),
      ),
    );
    if (fc && !req.bot) setTimeout(() => audio().playSfx('soloEnd', 0.8), 300);
  }

  private timingChart(): HTMLElement {
    const win = settings.hitWindowMs;
    const c = h('canvas', { class: 'timing-chart', width: 360, height: 120 });
    const ctx = c.getContext('2d')!;
    const bins = new Array(29).fill(0);
    for (const d of this.r.deltas) {
      const x = Math.max(-1, Math.min(1, (d * 1000) / win));
      bins[Math.round(((x + 1) / 2) * (bins.length - 1))]++;
    }
    const max = Math.max(1, ...bins);
    const w = c.width / bins.length;
    bins.forEach((b, i) => {
      const off = Math.abs(i - (bins.length - 1) / 2) / ((bins.length - 1) / 2);
      ctx.fillStyle = off < 0.3 ? '#4ef08a' : off < 0.65 ? '#f5d34a' : '#ff8a3d';
      const hgt = (b / max) * (c.height - 18);
      ctx.fillRect(i * w + 1, c.height - 16 - hgt, w - 2, hgt);
    });
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(c.width / 2 - 0.5, 0, 1, c.height - 16);
    ctx.font = '11px system-ui';
    ctx.fillText(`early −${win}ms`, 2, c.height - 3);
    const late = `+${win}ms late`;
    ctx.fillText(late, c.width - ctx.measureText(late).width - 2, c.height - 3);
    return c;
  }

  private missBreakdown(): HTMLElement {
    const r = this.r;
    const totalMissed = r.total - r.hits;
    if (!totalMissed) return h('p', { class: 'hint' }, 'Nothing. Every note was hit.');
    const max = Math.max(1, ...r.missByLane);
    const lanes = h(
      'div',
      { class: 'lane-bars' },
      ...r.missByLane.map((n, i) => {
        const c = skinHex(noteSkin().colors[i]);
        return h(
          'div',
          { class: 'lane-bar', title: `${LANE_NAMES[i]}: ${n} missed` },
          h('div', { class: 'fill', style: `height:${(n / max) * 100}%;background:${c}` }),
          h('span', null, String(n)),
        );
      }),
    );
    const t = r.missByType;
    const kinds = [
      ['Strums', t.strum],
      ['HOPOs', t.hopo],
      ['Taps', t.tap],
      ['Chords', r.missChords],
      ['Open notes', r.missOpen],
    ].filter(([, n]) => (n as number) > 0);
    return h(
      'div',
      null,
      lanes,
      h('div', { class: 'kinds' }, ...kinds.map(([k, n]) => h('span', { class: 'kind' }, `${k} `, h('b', null, String(n))))),
    );
  }

  /** Plain-language advice derived from how notes were lost. */
  private tips(): HTMLElement | null {
    const r = this.r;
    const tips: string[] = [];
    const lost = r.total - r.hits;
    if (r.overstrums >= 3) tips.push(`${r.overstrums} overstrums broke your streak. Only strum when a gem reaches the line, and let HOPOs ring without strumming.`);
    if (r.wrongFret > r.lateMiss && r.wrongFret >= 5) tips.push('Most misses were wrong frets, not timing. A slowed-down practice loop helps the shapes sink in.');
    if (r.lateMiss > r.wrongFret && r.lateMiss >= 5) tips.push('Most misses were notes you never played. Try a faster note speed so you can read further ahead.');
    if (r.sustainDrops >= 3) tips.push(`${r.sustainDrops} sustains were let go early. Keep the fret down until the tail passes the line.`);
    if (lost >= 8 && r.missByType.hopo > lost * 0.4) tips.push('HOPOs cost you the most. After a miss, the next HOPO has to be strummed.');
    if (lost >= 8 && r.missChords > lost * 0.4) tips.push('Chords cost you the most. Chords need exactly their frets: no extra lower frets.');
    const worstLane = r.missByLane.indexOf(Math.max(...r.missByLane));
    if (lost >= 10 && r.missByLane[worstLane] > lost * 0.45) tips.push(`The ${LANE_NAMES[worstLane].toLowerCase()} fret accounts for most misses.`);
    if (!tips.length) return null;
    return h('ul', { class: 'tips' }, ...tips.slice(0, 3).map((t) => h('li', null, t)));
  }

  private sectionList(weakest: SectionResult | null): HTMLElement {
    const list = h('div', { class: 'sec-list' });
    for (const s of this.r.sections) {
      const acc = s.hits / s.total;
      const cls = acc >= 0.98 ? 'great' : acc >= 0.85 ? 'ok' : 'bad';
      list.append(
        h(
          'button',
          {
            class: `sec ${cls} ${s === weakest ? 'weak' : ''}`,
            title: this.req.practice ? '' : 'Practice this section',
            onclick: () => !this.req.practice && this.practiceSection(s),
          },
          h('span', { class: 'name' }, s.name),
          h('span', { class: 'bar' }, h('span', { style: `width:${acc * 100}%` })),
          h('span', { class: 'pct' }, `${Math.round(acc * 100)}%`),
        ),
      );
    }
    return list;
  }

  private async retry() {
    const { GameScreen } = await import('./gamescreen.ts');
    this.app.show(new GameScreen(this.app, this.req));
  }

  private async practiceSection(s: SectionResult) {
    const { PracticeModal } = await import('./practice.ts');
    const idx = this.req.chart.sections.findIndex((x) => x.time === s.time);
    this.app.pushModal(new PracticeModal(this.app, this.req, idx >= 0 ? idx : 0));
  }

  private async back() {
    const { SongSelect } = await import('./songselect.ts');
    this.app.show(new SongSelect(this.app));
  }

  nav(a: NavAction): void {
    if (a === 'confirm') void this.retry();
    else if (a === 'back') void this.back();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') void this.retry();
    else if (e.key === 'Escape') void this.back();
    else return false;
    return true;
  }
}

function stat(label: string, value: string, cls = '') {
  return h('div', { class: `stat ${cls}` }, h('div', { class: 'v' }, value), h('div', { class: 'l' }, label));
}

function weakestSection(sections: SectionResult[]): SectionResult | null {
  let worst: SectionResult | null = null;
  for (const s of sections) {
    if (s.total < 4 || s.hits === s.total) continue;
    const miss = s.total - s.hits;
    if (!worst || miss / s.total > (worst.total - worst.hits) / worst.total) worst = s;
  }
  return worst;
}

function timingAdvice(mean: number, n: number): string {
  if (n < 20) return '';
  const ms = Math.round(mean * 1000);
  if (Math.abs(ms) < 8) return `Centered: average offset ${ms >= 0 ? '+' : ''}${ms} ms.`;
  return `On average you hit ${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}. If that happens every song, calibrate the audio offset in Settings.`;
}
