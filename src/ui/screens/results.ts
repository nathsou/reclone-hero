import { audio } from '../../audio/audio.ts';
import { DIFFICULTIES, INSTRUMENT_LABEL, trackKey } from '../../chart/types.ts';
import { HIT } from '../../engine/engine.ts';
import { formatTime } from '../../util/text.ts';
import type { GameResult, SectionResult } from '../../game/game.ts';
import { getBest, PLAYED_WITH_LABEL, recordScore, scoreKey } from '../../game/scores.ts';
import { getHistory, recordRun, variantKey, variantLabel } from '../../game/history.ts';
import type { Run } from '../../game/history.ts';
import type { NavAction } from '../../input/input.ts';
import { skinHex } from '../../render/skins.ts';
import { noteSkin } from '../theme.ts';
import { settings } from '../../settings.ts';
import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import type { GameRequest } from './gamescreen.ts';
import { starsEl } from './songselect.ts';
import { resultSummary } from '../resultAdvice.ts';

const LANE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];

/** The last runs of this part as bars (score, relative to the best of them); this run is the last, lit. */
function runsChart(runs: Run[]): HTMLElement | null {
  const last = runs.slice(-12);
  if (last.length < 2) return null;
  const max = Math.max(1, ...last.map((x) => x.score));
  const day = (d: number) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return h(
    'div',
    { class: 'res-runs', title: 'Your last runs of this part' },
    h('span', { class: 'lbl' }, `Run ${runs.length >= 25 ? '25+' : runs.length}`),
    h(
      'span',
      { class: 'bars' },
      ...last.map((x, i) =>
        h('i', {
          class: `${i === last.length - 1 ? 'now' : ''}${x.fc ? ' fc' : ''}`,
          style: `height:${Math.max(8, Math.round((x.score / max) * 100))}%`,
          title: `${day(x.date)} · ${x.score.toLocaleString('en-US')} · ${(x.accuracy * 100).toFixed(1)}%${x.fc ? ' · FC' : ''}${x.speed !== 1 ? ` · ${Math.round(x.speed * 100)}%` : ''}${x.mods.length ? ` · ${x.mods.join(', ')}` : ''}`,
        }),
      ),
    ),
  );
}

export class ResultsScreen implements Screen {
  readonly el: HTMLElement;
  private readonly app: App;
  private readonly req: GameRequest;
  private readonly r: GameResult;
  private readonly weakest: SectionResult | null;
  private readonly fc: boolean;
  private stopConfetti: (() => void) | null = null;
  private readonly plot: HTMLCanvasElement;
  private readonly drift: HTMLCanvasElement;
  private readonly hist: HTMLCanvasElement;
  private readonly timeline: HTMLDivElement;
  private resizeObserver: ResizeObserver | null = null;
  private artUrl: Promise<string> | null = null;

  constructor(app: App, r: GameResult, req: GameRequest) {
    this.app = app;
    this.req = req;
    this.r = r;
    const { song } = req;
    const t = r.setup.track;
    const acc = r.total ? r.hits / r.total : 0;
    const fc = (this.fc = r.fullCombo);
    let newBest = false;
    const key = scoreKey(song.id, trackKey(t.instrument, t.difficulty));
    // A slowed-down song is easier: its score is shown but not kept as a best.
    const slowed = (req.speed ?? 1) < 1;
    const run: Run = { score: r.score, stars: r.stars, accuracy: acc, fc, date: Date.now(), input: r.input, speed: req.speed ?? 1, mods: [] };
    const variant = variantKey(run.speed, run.mods);
    let variantBest = false;
    if (!req.bot && !req.practice) {
      variantBest = recordRun(key, run);
      if (!slowed) newBest = recordScore(key, { score: r.score, stars: r.stars, accuracy: acc, fc, date: run.date, input: r.input });
    }
    const bestTag = newBest ? 'NEW BEST' : variantBest && variant !== '100' ? `BEST AT ${variantLabel(variant).toUpperCase()}` : null;
    const best = getBest(key);
    const weakest = (this.weakest = req.practice ? null : weakestSection(r.sections));
    const mean = r.deltas.length ? r.deltas.reduce((a, b) => a + b, 0) / r.deltas.length : 0;

    const art = h('div', { class: 'res-art none' });
    if (song.albumArt) {
      art.classList.remove('none');
      this.artUrl = app.library.fileUrl(song, song.albumArt);
      void this.artUrl.then((u) => (art.style.backgroundImage = `url("${u}")`));
    }
    this.plot = h('canvas', { class: 'tl-plot' });
    this.drift = h('canvas', { class: 'tl-drift' });
    this.hist = h('canvas', { class: 'timing-chart' });
    this.timeline = h('div', { class: 'res-timeline' });

    const span = Math.max(1, r.end - r.start);
    const heads = h('div', { class: 'tl-heads' });
    r.sections.forEach((s, i) => {
      const from = Math.max(r.start, s.time);
      const to = i + 1 < r.sections.length ? r.sections[i + 1].time : r.end;
      const a = s.hits / s.total;
      const cls = a >= 0.98 ? 'great' : a >= 0.85 ? 'ok' : 'bad';
      heads.append(
        h(
          'button',
          {
            class: `tl-head ${cls}${s === weakest ? ' weak' : ''}`,
            style: `left:${(((from - r.start) / span) * 100).toFixed(3)}%;width:${(((to - from) / span) * 100).toFixed(3)}%`,
            title: req.practice ? s.name : `Practice “${s.name}”`,
            onclick: () => !req.practice && void this.practiceSection(s),
          },
          h('span', { class: 'n' }, s.name),
          h('span', { class: 'p' }, `${Math.round(a * 100)}%`),
        ),
      );
    });
    const axis = h('div', { class: 'tl-axis' });
    const step = span > 240 ? 60 : span > 100 ? 30 : 15;
    for (let x = 0; x < span - step * 0.4; x += step) axis.append(h('span', { style: `position:absolute;left:${(x / span) * 100}%;${x === 0 ? '' : 'transform:translateX(-50%)'}` }, formatTime(r.start + x)));
    axis.append(h('span', { style: 'position:absolute;right:0' }, formatTime(r.end)));
    axis.style.position = 'relative';
    axis.style.height = '16px';
    this.timeline.append(heads, this.plot, this.drift, axis);

    const stats: (string | HTMLElement)[] = [
      `Star Power ${r.spPhrases} / ${r.spPhrasesTotal} · Sustains dropped ${r.sustainDrops}`,
    ];
    if (r.solos.length) stats.push(` · Solos ${r.solos.map((x) => `${Math.round((x.hits / x.total) * 100)}%`).join(' ')}`);

    this.el = h(
      'div',
      { class: 'screen results-screen' },
      h(
        'div',
        { class: 'res-head' },
        art,
        h('div', { class: 'res-song' }, h('div', { class: 'title' }, song.name), h('div', { class: 'artist' }, `${song.artist} · ${INSTRUMENT_LABEL[t.instrument]} ${t.difficulty}${req.bot ? ' · bot' : ` · played with ${PLAYED_WITH_LABEL[r.input].toLowerCase()}`}${req.practice ? ' · practice' : ''}${!req.practice && req.speed && req.speed !== 1 ? ` · ${Math.round(req.speed * 100)}% speed` : ''}`)),
        h(
          'div',
          { class: 'res-nums' },
          h('div', { class: 'res-num' }, h('div', { class: 'label' }, 'Score'), h('div', { class: 'v' }, r.score.toLocaleString('en-US')), bestTag ? h('span', { class: 'tag best' }, bestTag) : null, h('div', { class: 'res-best' }, `Best score: ${best ? best.score.toLocaleString('en-US') : '—'}`, best?.input ? ` · ${PLAYED_WITH_LABEL[best.input]}` : ''), req.bot || req.practice ? null : runsChart(getHistory(key)?.runs ?? [])),
          h('div', { class: 'res-num' }, h('div', { class: 'label' }, 'Max streak'), h('div', { class: 'v' }, r.maxStreak.toLocaleString('en-US'))),
          h('div', { class: 'res-num' }, h('div', { class: 'label' }, 'Accuracy'), h('div', { class: 'v' }, `${(acc * 100).toFixed(1)}%`), fc ? h('span', { class: 'tag fc' }, 'FULL COMBO') : null),
          h('div', { class: 'res-num' }, h('div', { class: 'label' }, 'Stars'), h('div', { class: 'res-stars' }, starsEl(r.stars))),
        ),
      ),
      this.timeline,
      h(
        'div',
        { class: 'res-cols' },
        h('section', { class: 'res-col' }, h('div', { class: 'label' }, 'Where notes were lost'), this.missBreakdown()),
        h('section', { class: 'res-col' }, h('div', { class: 'label' }, 'Timing'), this.hist, h('p', { class: 'res-note' }, timingAdvice(mean, r.deltas.length))),
        h('section', { class: 'res-col res-work' }, h('div', { class: 'label' }, 'What to work on'), this.work(weakest)),
      ),
      h(
        'div',
        { class: 'res-foot' },
        h('div', { class: 'stats' }, ...stats),
        h(
          'div',
          { class: 'res-actions' },
          weakest ? h('button', { class: 'btn', onclick: () => this.practiceSection(weakest) }, h('i', { class: 'dot', style: 'background:var(--blue)' }), `Practice “${weakest.name}”`, h('kbd', null, 'P')) : null,
          h('button', { class: 'btn', onclick: () => this.retry() }, h('i', { class: 'dot', style: 'background:var(--yellow)' }), 'Retry', h('kbd', null, 'R')),
          h('button', { class: 'btn primary', onclick: () => this.back() }, h('i', { class: 'dot ring' }), 'Song list', h('kbd', null, 'Enter')),
        ),
      ),
    );
    if (fc && !req.bot) setTimeout(() => audio().playSfx('soloEnd', 0.8), 300);
  }

  shown(): void {
    this.draw();
    // The game already celebrated the last note; a shower of confetti welcomes the results too.
    if (this.fc && !this.req.bot && !this.req.practice) {
      void import('../confetti.ts').then(({ celebrate }) => {
        if (!this.el.isConnected) return;
        this.stopConfetti = celebrate(document.body, { fixed: true, rain: 160, cannons: [[0, innerHeight], [innerWidth, innerHeight]], spread: 1.8 });
      });
    }
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(this.timeline);
  }

  destroy(): void {
    this.stopConfetti?.();
    this.resizeObserver?.disconnect();
    if (this.artUrl) void this.artUrl.then((u) => this.app.library.release(u));
  }

  private colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    return { good: v('--good', '#4ef08a'), ok: v('--ok', '#f5d34a'), meh: v('--meh', '#ff8a3d'), bad: v('--bad', '#ff4d5e'), text: v('--text', '#f2efe9'), line: v('--line-soft', 'rgba(255,255,255,.1)'), dim: v('--faint', '#6f6a63') };
  }

  /** Size a canvas to its CSS box at device resolution and return a scaled 2D context. */
  private prep(c: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (!w || !hgt) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(hgt * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h: hgt };
  }

  private draw() {
    const col = this.colors();
    this.drawPlot(col);
    this.drawDrift(col);
    this.drawHistogram(col);
  }

  /** Every note of the song, flattened: one row per lane, hits as pills, misses as red rings. */
  private drawPlot(col: ReturnType<ResultsScreen['colors']>) {
    const p = this.prep(this.plot);
    if (!p) return;
    const { g, w, h: H } = p;
    const r = this.r;
    const notes = r.setup.track.notes;
    const skin = noteSkin();
    const span = Math.max(1, r.end - r.start);
    const laneH = H / 5;
    const x = (t: number) => ((t - r.start) / span) * w;
    for (let l = 0; l < 5; l++) {
      g.fillStyle = l % 2 ? 'rgba(128,128,128,0.05)' : 'rgba(128,128,128,0.09)';
      g.fillRect(0, l * laneH, w, laneH);
    }
    // section dividers
    g.fillStyle = col.line;
    for (const s of r.sections) g.fillRect(Math.round(x(Math.max(r.start, s.time))), 0, 1, H);
    const hex = skin.colors.map(skinHex);
    // local density (notes within a second) fades sparse passages so busy ones read as solid runs
    const dens = new Float32Array(notes.length);
    for (let i = 0, lo = 0, hi = 0; i < notes.length; i++) {
      while (notes.time[lo] < notes.time[i] - 1) lo++;
      while (hi < notes.length && notes.time[hi] <= notes.time[i] + 1) hi++;
      dens[i] = Math.min(1, 0.45 + (hi - lo) / 22);
    }
    const pillW = Math.max(3, Math.min(9, w / 200));
    const pillH = Math.min(14, laneH - 8);
    const missed: [number, number][] = [];
    for (let i = 0; i < notes.length; i++) {
      const mask = notes.mask[i];
      const px = x(notes.time[i]);
      const hit = r.noteState[i] === HIT;
      if (mask === 0) {
        g.globalAlpha = hit ? 0.45 : 0.9;
        g.fillStyle = hex[5];
        g.fillRect(px - pillW / 2, 3, pillW, H - 6);
        if (!hit) missed.push([px, H / 2]);
        continue;
      }
      for (let l = 0; l < 5; l++) {
        if (!(mask & (1 << l))) continue;
        const cy = l * laneH + laneH / 2;
        if (hit) {
          g.globalAlpha = dens[i];
          g.fillStyle = hex[l];
          g.beginPath();
          g.roundRect(px - pillW / 2, cy - pillH / 2, pillW, pillH, pillW / 2.2);
          g.fill();
        } else missed.push([px, cy]);
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = col.bad;
    g.lineWidth = 2;
    for (const [px, cy] of missed) {
      g.beginPath();
      g.arc(px, cy, 5.5, 0, Math.PI * 2);
      g.stroke();
    }
    const weak = this.weakest;
    if (weak) {
      const i = r.sections.indexOf(weak);
      const from = Math.max(r.start, weak.time);
      const to = i + 1 < r.sections.length ? r.sections[i + 1].time : r.end;
      g.strokeStyle = col.text;
      g.lineWidth = 1.5;
      g.strokeRect(Math.round(x(from)) + 0.75, 0.75, Math.round(x(to) - x(from)) - 1.5, H - 1.5);
    }
  }

  /** Timing drift: how early or late each hit was across the song. */
  private drawDrift(col: ReturnType<ResultsScreen['colors']>) {
    const p = this.prep(this.drift);
    if (!p) return;
    const { g, w, h: H } = p;
    const r = this.r;
    const notes = r.setup.track.notes;
    const win = settings.hitWindowMs / 1000;
    const span = Math.max(1, r.end - r.start);
    g.fillStyle = col.line;
    g.fillRect(0, Math.round(H / 2), w, 1);
    g.font = '500 10px ui-monospace, "JetBrains Mono", monospace';
    g.fillStyle = col.dim;
    g.fillText('early', 0, 9);
    g.fillText('late', 0, H - 2);
    for (let i = 0; i < notes.length; i++) {
      if (r.noteState[i] !== HIT) continue;
      const d = r.hitDelta[i];
      const ms = Math.abs(d * 1000);
      g.fillStyle = ms < 20 ? col.good : ms < 45 ? col.ok : col.meh;
      const y = H / 2 + Math.max(-1, Math.min(1, d / win)) * (H / 2 - 4);
      g.fillRect(((notes.time[i] - r.start) / span) * w - 1, y - 1, 2, 2);
    }
  }

  private drawHistogram(col: ReturnType<ResultsScreen['colors']>) {
    const p = this.prep(this.hist);
    if (!p) return;
    const { g, w, h: H } = p;
    const win = settings.hitWindowMs;
    const bins = new Array(29).fill(0);
    for (const d of this.r.deltas) {
      const x = Math.max(-1, Math.min(1, (d * 1000) / win));
      bins[Math.round(((x + 1) / 2) * (bins.length - 1))]++;
    }
    const max = Math.max(1, ...bins);
    const bw = w / bins.length;
    bins.forEach((b, i) => {
      const off = Math.abs(i - (bins.length - 1) / 2) / ((bins.length - 1) / 2);
      g.fillStyle = off < 0.3 ? col.good : off < 0.65 ? col.ok : col.meh;
      const bh = b ? Math.max(2, (b / max) * (H - 4)) : 1;
      g.fillRect(i * bw + 1, H - bh, bw - 2, bh);
    });
    g.fillStyle = col.text;
    g.globalAlpha = 0.5;
    g.fillRect(Math.round(w / 2), 0, 1, H);
    g.globalAlpha = 1;
  }

  private missBreakdown(): HTMLElement {
    const r = this.r;
    const totalMissed = r.total - r.hits;
    if (!totalMissed) return h('p', { class: 'res-note' }, 'Nothing. Every note was hit.');
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
      ['HOPOs', t.hopo],
      ['Taps', t.tap],
      ['Chords', r.missChords],
      ['Open notes', r.missOpen],
    ].filter(([, n]) => (n as number) > 0);
    return h(
      'div',
      null,
      lanes,
      h('p', { class: 'res-note' }, 'Wrong frets ', h('b', null, String(r.wrongFret)), ' · Not played ', h('b', null, String(r.lateMiss)), ' · Overstrums ', h('b', null, String(r.overstrums))),
      kinds.length ? h('p', { class: 'res-note' }, ...kinds.flatMap(([k, n], i) => [i ? ' · ' : '', `${k} `, h('b', null, String(n))])) : null,
    );
  }

  /** Plain-language advice derived from how notes were lost. */
  private tips(): string[] {
    const r = this.r;
    if (this.req.bot) return [];
    const tapping = r.input === 'touch' || (r.input === 'keyboard' && settings.kbTapMode);
    const tips: string[] = [];
    const lost = r.total - r.hits;
    if (r.overstrums >= 3) tips.push(tapping ? `${r.overstrums} extra presses broke your streak. Press the frets when a gem reaches the line.` : `${r.overstrums} overstrums broke your streak. Only strum when a gem reaches the line, and let HOPOs ring without strumming.`);
    if (r.wrongFret > r.lateMiss && r.wrongFret >= 5) tips.push('Most misses were wrong frets, not timing. A slowed-down practice loop helps the shapes sink in.');
    if (r.lateMiss > r.wrongFret && r.lateMiss >= 5) tips.push('Most misses were notes you never played. Practise the weakest section at a slower speed until the pattern feels familiar.');
    if (r.sustainDrops >= 3) tips.push(`${r.sustainDrops} sustains were let go early. Keep the fret down until the tail passes the line.`);
    if (lost >= 8 && r.missByType.hopo > lost * 0.4) tips.push(tapping ? 'HOPOs cost you the most. Use a fresh fret press for each note, including repeated frets.' : 'HOPOs cost you the most. After a miss, the next HOPO has to be strummed.');
    if (lost >= 8 && r.missChords > lost * 0.4) tips.push('Chords cost you the most. Chords need exactly their frets: no extra lower frets.');
    const worstLane = r.missByLane.indexOf(Math.max(...r.missByLane));
    if (lost >= 10 && r.missByLane[worstLane] > lost * 0.45) tips.push(`The ${LANE_NAMES[worstLane].toLowerCase()} fret accounts for most misses.`);
    return tips.slice(0, 2);
  }

  private work(weakest: SectionResult | null): HTMLElement {
    const tips = this.tips();
    const box = h('div');
    const t = this.r.setup.track;
    const harderDifficulty = DIFFICULTIES.slice(DIFFICULTIES.indexOf(t.difficulty) + 1).find(d => this.req.chart.tracks.has(trackKey(t.instrument, d)));
    if (!tips.length) box.append(h('p', { class: 'lead' }, resultSummary({ ...this.r, bot: this.req.bot, practiceSpeed: this.req.practice?.speed, harderDifficulty })));
    for (const t of tips) box.append(h('p', { class: 'lead' }, t));
    if (weakest) box.append(h('p', { class: 'aside' }, 'The ', h('b', null, weakest.name), ` (outlined) cost you the most: ${weakest.total - weakest.hits} notes.`));
    return box;
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
    if (a === 'confirm' || a === 'back') void this.back();
    else if (a === 'alt') void this.retry();
    else if (a === 'left' && this.weakest) void this.practiceSection(this.weakest);
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter' || e.key === 'Escape') void this.back();
    else if (e.key === 'r' || e.key === 'R') void this.retry();
    else if ((e.key === 'p' || e.key === 'P') && this.weakest) void this.practiceSection(this.weakest);
    else return false;
    return true;
  }
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
