import type { App, Screen } from '../app.ts';
import { h } from '../dom.ts';
import { DIFFICULTIES } from '../../chart/types.ts';
import type { Difficulty } from '../../chart/types.ts';
import { loadChart } from '../../chart/load.ts';
import { makeSongEntry } from '../../library/song.ts';
import { analyzeFile } from '../../studio/client.ts';
import { chartText, createProject, normalizeNotes, regenerate, snapTime, StudioHistory, timingMap } from '../../studio/model.ts';
import type { StudioNote, StudioProject } from '../../studio/model.ts';
import { exportProject, importProjectZip } from '../../studio/export.ts';
import { deleteProject, listProjects, readProject, saveProject } from '../../studio/storage.ts';
import { studioFolder } from '../../studio/source.ts';
import { StudioTimeline } from '../../studio/timeline.ts';
import type { TimelineState } from '../../studio/timeline.ts';
import { StudioClicks } from '../../studio/clicks.ts';

const LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const LANES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];

export class StudioScreen implements Screen {
  readonly el: HTMLElement;
  private app: App;
  private project: StudioProject | null = null;
  private audioFile: Blob | null = null;
  private audio = h('audio', { controls: true, preload: 'metadata', 'aria-label': 'Song preview' });
  private audioUrl = '';
  private history = new StudioHistory();
  private difficulty: Difficulty = 'medium';
  private selected = new Set<number>();
  private clipboard: StudioNote[] = [];
  private cursor = 0;
  private start = 0;
  private span = 12;
  private snap = 2;
  private tool: TimelineState['tool'] = 'select';
  private range = { start: 0, end: 0 };
  private looping = false;
  private timeline: StudioTimeline | null = null;
  private content = h('main', { class: 'studio-content' });
  private status = h('div', { class: 'studio-status', role: 'status', 'aria-live': 'polite' });
  private saveStatus = h('span', { class: 'studio-save-status', role: 'status' });
  private saved = h('select', { 'aria-label': 'Saved projects' }, h('option', { value: '' }, 'Open a saved project…'));
  private inspector = h('div', { class: 'studio-inspector' });
  private stats = h('p', { class: 'hint' });
  private scrub = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0, 'aria-label': 'Song position' });
  private position = h('span', { class: 'studio-position' });
  private controller: AbortController | null = null;
  private destroyed = false;
  private revision = 0;
  private dirty = false;
  private saveTimer = 0;
  private raf = 0;
  private writes: Promise<void> = Promise.resolve();
  private clicks = new StudioClicks();
  private loadRevision = 0;
  private cancelButton = h('button', { class: 'btn', disabled: true }, 'Cancel analysis');

  constructor(app: App, projectId?: string, difficulty?: Difficulty) {
    this.app = app;
    this.cancelButton.onclick = () => { this.controller?.abort(); this.controller = null; this.cancelButton.disabled = true; this.status.textContent = 'Analysis cancelled.'; };
    if (difficulty) this.difficulty = difficulty;
    const file = h('input', { type: 'file', accept: '.mp3,.wav,.ogg,.opus', 'aria-label': 'Import song file', onchange: () => {
      const chosen = file.files?.[0]; file.value = '';
      if (chosen) void this.run(() => this.importSong(chosen));
    } });
    const zip = h('input', { type: 'file', accept: '.zip', 'aria-label': 'Import Studio ZIP', onchange: () => {
      const chosen = zip.files?.[0]; zip.value = '';
      if (chosen) void this.run(async () => {
        const revision = ++this.loadRevision;
        if (!await this.saveBeforeLeaving()) return;
        if (this.destroyed || revision !== this.loadRevision) return;
        this.controller?.abort(); this.controller = null; this.cancelButton.disabled = true;
        const imported = await importProjectZip(chosen, crypto.randomUUID());
        if (this.destroyed || revision !== this.loadRevision) return;
        this.install(imported.project, imported.audio); this.changed(); this.status.textContent = 'Imported a copy of the studio project, including all edits and locks.';
      });
    } });
    this.saved.onchange = () => { if (this.saved.value) void this.run(() => this.open(this.saved.value)); };
    this.el = h('div', { class: 'screen studio-screen' },
      h('header', { class: 'studio-header' },
        this.button('← Library', () => this.back()),
        h('div', { class: 'studio-title' }, h('h1', null, 'Chart Studio'), h('span', { class: 'hint' }, 'Turn a recording into your next chart.')),
        this.saveStatus),
      h('div', { class: 'studio-files' }, h('label', { class: 'studio-file-label' }, 'Import song', file), h('label', { class: 'studio-file-label' }, 'Open Studio ZIP', zip), this.saved,
        this.cancelButton),
      this.status, this.content);
    this.content.append(h('div', { class: 'studio-welcome' }, h('h2', null, 'Start with a song you know'),
      h('p', null, 'Import an MP3, WAV, OGG, or Opus recording. Studio detects musical attacks and creates Easy, Medium, Hard, and Expert guitar charts.'),
      h('p', null, 'Listen, adjust the beat grid, then shape the notes. Everything stays in this browser. Save your projects here and export a ZIP to keep the audio and charts together.'),
      h('p', { class: 'hint' }, 'Up to 100 MB and 20 minutes. Automatic charts are a starting point, not instrument transcription.')));
    this.audio.ontimeupdate = () => this.updatePlayback();
    this.audio.onplay = () => this.animate();
    this.audio.onpause = () => this.clicks.reset();
    this.scrub.oninput = () => this.seek(Number(this.scrub.value));
    window.addEventListener('beforeunload', this.beforeUnload);
    void this.refreshSaved();
    if (projectId) void this.run(() => this.open(projectId));
  }

  private beforeUnload = (e: BeforeUnloadEvent) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
  private button(label: string, action: () => unknown, primary = false): HTMLButtonElement {
    return h('button', { class: primary ? 'btn primary' : 'btn', onclick: () => void this.run(async () => { await action(); }) }, label);
  }
  private async run(action: () => Promise<unknown>): Promise<void> {
    try { await action(); }
    catch (e) { if (!this.destroyed && !(e instanceof DOMException && e.name === 'AbortError')) this.status.textContent = e instanceof Error ? e.message : String(e); }
  }
  private async refreshSaved(): Promise<void> {
    try {
      const projects = await listProjects();
      if (this.destroyed) return;
      this.saved.replaceChildren(h('option', { value: '' }, 'Open a saved project…'), ...projects.map(({ project }) => h('option', { value: project.id }, project.name)));
      this.saved.value = this.project?.id ?? '';
    } catch { this.saveStatus.textContent = 'Browser storage unavailable — export to keep your work.'; }
  }
  private async importSong(file: File): Promise<void> {
    const revision = ++this.loadRevision;
    if (!await this.saveBeforeLeaving()) return;
    if (this.destroyed || revision !== this.loadRevision) return;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    this.cancelButton.disabled = false;
    this.audio.pause();
    this.status.textContent = 'Decoding audio…';
    let analysis;
    try { analysis = await analyzeFile(file, controller.signal, (p) => { if (!this.destroyed && this.controller === controller) this.status.textContent = `Analyzing music… ${Math.round(p * 100)}%`; }); }
    catch (error) { if (this.controller === controller) { this.controller = null; this.cancelButton.disabled = true; throw error; } return; }
    if (this.destroyed || this.controller !== controller) return;
    this.controller = null; this.cancelButton.disabled = true;
    this.install(createProject(crypto.randomUUID(), file.name, analysis), file);
    this.status.textContent = analysis.onsets.length ? `Found ${analysis.onsets.length} musical attacks. Listen and refine the draft below.` : 'No clear attacks found. You can add notes manually, or try another recording.';
    this.changed();
  }
  private async open(id: string): Promise<void> {
    const revision = ++this.loadRevision;
    if (!await this.saveBeforeLeaving()) return;
    if (this.destroyed || revision !== this.loadRevision) return;
    this.controller?.abort(); this.controller = null; this.cancelButton.disabled = true;
    const saved = await readProject(id);
    if (this.destroyed || revision !== this.loadRevision) return;
    this.install(saved.project, saved.audio);
    this.saveStatus.textContent = 'Saved in this browser'; this.status.textContent = '';
  }
  private install(project: StudioProject, audio: Blob): void {
    clearTimeout(this.saveTimer);
    this.audio.pause();
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.project = project; this.audioFile = audio; this.audioUrl = URL.createObjectURL(audio); this.audio.src = this.audioUrl;
    this.history = new StudioHistory(); this.selected.clear(); this.clipboard = []; this.cursor = 0; this.start = 0;
    this.range = { start: 0, end: project.analysis.duration }; this.looping = false; this.dirty = false; this.revision++;
    this.renderEditor();
  }
  private async save(): Promise<void> {
    if (!this.project || !this.audioFile) return;
    clearTimeout(this.saveTimer);
    const project = structuredClone(this.project), audio = this.audioFile, revision = this.revision;
    this.saveStatus.textContent = 'Saving…';
    const write = this.writes.catch(() => {}).then(() => saveProject(project, audio)); this.writes = write;
    try {
      await write;
      if (this.project?.id === project.id && this.revision === revision) { this.dirty = false; this.saveStatus.textContent = 'Saved in this browser'; }
      await this.refreshSaved();
    } catch { this.saveStatus.textContent = 'Not saved — export a ZIP to keep your work.'; throw new Error('Could not save the project. Browser storage may be full or unavailable. Export a ZIP before leaving.'); }
  }
  private async saveBeforeLeaving(): Promise<boolean> {
    if (!this.dirty) return true;
    try { await this.save(); return true; }
    catch {
      if (!confirm('This project could not be saved in the browser. Leave without saving? Cancel to export a ZIP first.')) return false;
      clearTimeout(this.saveTimer); this.dirty = false; return true;
    }
  }
  private changed(): void {
    if (!this.project) return;
    this.project.notes[this.difficulty] = normalizeNotes(this.project.notes[this.difficulty], this.project.analysis.duration);
    this.revision++; this.dirty = true; this.saveStatus.textContent = 'Unsaved changes';
    this.clicks.reset();
    clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.run(() => this.save()), 1200);
    this.updateEditor();
  }
  private edit(action: () => void): void { if (!this.project) return; this.history.capture(this.project); action(); this.changed(); }

  private renderEditor(): void {
    const p = this.project!;
    this.timeline?.destroy();
    const name = h('input', { value: p.name, 'aria-label': 'Song title', maxlength: 200, onchange: () => { p.name = name.value.trim() || 'Untitled song'; this.changed(); } });
    const artist = h('input', { value: p.artist, 'aria-label': 'Artist', maxlength: 200, onchange: () => { p.artist = artist.value.trim() || 'Unknown Artist'; this.changed(); } });
    const diff = h('select', { 'aria-label': 'Chart difficulty', onchange: () => { this.difficulty = diff.value as Difficulty; this.selected.clear(); this.updateEditor(); } }, ...DIFFICULTIES.map((d) => h('option', { value: d }, LABEL[d])));
    diff.value = this.difficulty;
    const tool = h('select', { 'aria-label': 'Editing tool', onchange: () => { this.tool = tool.value as TimelineState['tool']; } }, h('option', { value: 'select' }, 'Select / drag'), h('option', { value: 'add' }, 'Add notes'), h('option', { value: 'erase' }, 'Erase notes'));
    tool.value = this.tool;
    const snap = h('select', { 'aria-label': 'Grid snap', onchange: () => { this.snap = Number(snap.value); } }, ...[[0, 'Free timing'], [1, 'Quarter notes'], [2, 'Eighth notes'], [3, 'Triplets'], [4, 'Sixteenth notes']].map(([value, label]) => h('option', { value }, label)));
    snap.value = String(this.snap);
    const canvas = h('canvas', { class: 'studio-timeline', tabindex: 0, 'aria-label': 'Chart timeline. Click waveform to seek. Select and drag notes, or use Add notes. Keyboard 1 to 5 adds frets at the playhead.' });
    this.scrub.max = String(p.analysis.duration); this.scrub.value = String(this.cursor);
    const rate = h('select', { 'aria-label': 'Preview speed', onchange: () => { this.audio.playbackRate = Number(rate.value); this.clicks.reset(); } }, ...[0.5, 0.75, 1].map((v) => h('option', { value: v }, `${v * 100}% speed`))); rate.value = String(this.audio.playbackRate);
    const click = h('select', { 'aria-label': 'Preview clicks', onchange: () => { this.clicks.reset(); this.clicks.mode = click.value as StudioClicks['mode']; } }, h('option', { value: 'off' }, 'Clicks off'), h('option', { value: 'notes' }, 'Hear chart notes'), h('option', { value: 'beats' }, 'Hear beat grid')); click.value = this.clicks.mode;
    const loop = h('input', { type: 'checkbox', checked: this.looping, onchange: () => { this.looping = loop.checked; } });
    const rangeStart = this.number('Passage start (seconds)', this.range.start, 0, p.analysis.duration, 0.01, (v) => { this.range.start = Math.min(v, this.range.end - 0.01); });
    const rangeEnd = this.number('Passage end (seconds)', this.range.end, 0.01, p.analysis.duration, 0.01, (v) => { this.range.end = Math.max(v, this.range.start + 0.01); });
    this.content.replaceChildren(
      h('div', { class: 'studio-row studio-metadata' }, this.field('Title', name), this.field('Artist', artist),
        this.button('Save', () => this.save()), this.button('Export song ZIP', () => this.download()), this.button('Playtest', () => this.playtest(), true)),
      h('div', { class: 'studio-row' }, this.field('Difficulty', diff), this.field('Tool', tool), this.field('Snap', snap),
        this.button('Undo', () => this.undo()), this.button('Redo', () => this.redo()),
        this.button('Zoom in', () => { this.span = Math.max(2, this.span / 1.5); this.timeline?.draw(); }), this.button('Zoom out', () => { this.span = Math.min(120, this.span * 1.5); this.timeline?.draw(); })),
      h('div', { class: 'studio-transport' }, this.audio, rate, click, this.position), this.scrub, canvas,
      h('p', { class: 'hint' }, 'Click the waveform to seek. Drag gems to move them; Shift-click selects several. 1–5 adds notes at the playhead, Delete removes, Space plays/pauses. Ctrl/Cmd+Z undoes.'),
      this.stats,
      h('div', { class: 'studio-panels' },
        h('section', null, h('h2', null, 'Selected notes'), this.inspector),
        h('section', null, h('h2', null, 'Beat grid'), this.timingControls()),
        h('section', null, h('h2', null, 'Passage'),
          h('div', { class: 'studio-row' }, this.field('From (s)', rangeStart), this.field('To (s)', rangeEnd)),
          this.button('From playhead', () => { this.range.start = Math.min(this.cursor, this.range.end - 0.01); rangeStart.value = this.range.start.toFixed(2); }),
          this.button('To playhead', () => { this.range.end = Math.max(this.cursor, this.range.start + 0.01); rangeEnd.value = this.range.end.toFixed(2); }),
          h('label', { class: 'studio-check' }, loop, 'Loop passage'),
          this.button('Select passage', () => { this.selected = new Set(p.notes[this.difficulty].filter((n) => n.time >= this.range.start && n.time < this.range.end).map((n) => n.id)); this.updateEditor(); }),
          this.button('Lock passage', () => this.edit(() => { p.locks[this.difficulty].push({ ...this.range }); })),
          this.button('Unlock passage', () => this.edit(() => { p.locks[this.difficulty] = p.locks[this.difficulty].filter((r) => r.end <= this.range.start || r.start >= this.range.end); })),
          this.button('Regenerate passage', () => this.edit(() => regenerate(p, this.difficulty, this.range))),
          h('p', { class: 'hint' }, 'Regeneration replaces only this difficulty inside the passage. Locked areas are preserved. Undo restores the previous draft.'))),
      h('div', { class: 'studio-row' }, this.button('Delete saved project', () => this.removeProject()), h('span', { class: 'hint' }, 'Browser storage is local to this site and device. Export a ZIP for a portable copy.')));
    this.timeline = new StudioTimeline(canvas, () => ({ project: this.project!, difficulty: this.difficulty, selected: this.selected, start: this.start, span: this.span, cursor: this.cursor, snap: this.snap, tool: this.tool }), {
      select: (ids) => { this.selected = ids; this.updateEditor(); }, seek: (time) => this.seek(time), add: (time, lane) => this.add(time, lane),
      remove: (id) => this.edit(() => { p.notes[this.difficulty] = p.notes[this.difficulty].filter((n) => n.id !== id); }),
      move: (ids, delta, lanes) => this.moveNotes(ids, delta, lanes),
    });
    this.updateEditor();
  }

  private field(label: string, input: HTMLElement): HTMLElement { return h('label', { class: 'studio-field' }, h('span', null, label), input); }
  private number(label: string, value: number, min: number, max: number, step: number, change: (v: number) => void): HTMLInputElement {
    const input = h('input', { type: 'number', value: Number(value.toFixed(4)), min, max, step, 'aria-label': label });
    input.onchange = () => { const v = input.valueAsNumber; if (!Number.isFinite(v) || v < min || v > max) { input.value = String(value); this.status.textContent = `${label} must be between ${min} and ${max}.`; return; } value = v; change(v); };
    return input;
  }
  private timingControls(): HTMLElement {
    const p = this.project!;
    const panel = h('div');
    const render = () => {
      const bpm = this.number('Initial BPM', p.timing[0].bpm, 30, 300, 0.01, (v) => this.edit(() => { p.timing[0].bpm = v; }));
      const offset = this.number('First beat (seconds)', p.beatOffset, 0, 4, 0.001, (v) => this.edit(() => { p.beatOffset = v; }));
      panel.replaceChildren(h('div', { class: 'studio-row' }, this.field('BPM', bpm), this.field('First beat (s)', offset)),
        this.button('Half BPM', () => { if (p.timing[0].bpm >= 60) { this.edit(() => { p.timing[0].bpm /= 2; }); render(); } }),
        this.button('Double BPM', () => { if (p.timing[0].bpm <= 150) { this.edit(() => { p.timing[0].bpm *= 2; }); render(); } }),
        this.button('Beat at playhead', () => { this.edit(() => { p.beatOffset = this.cursor % (60 / p.timing[0].bpm); }); render(); }),
        h('p', { class: 'hint' }, `Tempo estimate: ${p.analysis.bpm} BPM · ${p.analysis.confidence < 0.45 ? 'low' : p.analysis.confidence < 0.7 ? 'moderate' : 'high'} confidence. Correct the grid by ear; existing note times stay fixed.`));
      for (const point of p.timing.slice(1)) {
        const value = this.number(`BPM at ${point.time.toFixed(2)} seconds`, point.bpm, 30, 300, 0.01, (v) => this.edit(() => { point.bpm = v; }));
        panel.append(h('div', { class: 'studio-row' }, this.field(`${point.time.toFixed(2)}s`, value), this.button('Remove tempo', () => { this.edit(() => { p.timing = p.timing.filter((t) => t !== point); }); render(); })));
      }
      panel.append(this.button('Add tempo at playhead', () => {
        if (this.cursor < 0.1 || this.cursor >= p.analysis.duration || p.timing.some((t) => Math.abs(t.time - this.cursor) < 0.1)) return;
        this.edit(() => { p.timing.push({ time: this.cursor, bpm: timingMap(p).map.bpmAt(this.cursor) }); p.timing.sort((a, b) => a.time - b.time); }); render();
      }));
    };
    render(); return panel;
  }
  private updateEditor(): void {
    const p = this.project; if (!p) return;
    const notes = p.notes[this.difficulty]; this.selected = new Set([...this.selected].filter((id) => notes.some((n) => n.id === id)));
    const selected = notes.filter((n) => this.selected.has(n.id));
    const attacks = new Set(notes.map((n) => n.time)).size;
    this.stats.textContent = `${LABEL[this.difficulty]} · ${attacks} attacks · ${notes.length} gems · ${(attacks / p.analysis.duration).toFixed(1)} attacks/s average · ${p.locks[this.difficulty].length} locked passages`;
    this.inspector.replaceChildren(h('p', { class: 'hint' }, selected.length ? `${selected.length} gem${selected.length === 1 ? '' : 's'} selected` : 'Select a gem, select a passage, or add a note with keys 1–5.'));
    this.inspector.append(this.button('Previous note', () => this.adjacent(-1)), this.button('Next note', () => this.adjacent(1)));
    if (selected.length) {
      const first = selected[0];
      const time = this.number('Note time (seconds)', first.time, 0, p.analysis.duration - 0.0001, 0.001, (v) => this.moveNotes(this.selected, v - first.time, 0));
      const length = this.number('Sustain length (seconds)', first.length, 0, p.analysis.duration, 0.01, (v) => this.edit(() => selected.forEach((n) => { n.length = v; })));
      const lane = h('select', { 'aria-label': 'Note lane', onchange: () => this.moveNotes(this.selected, 0, Number(lane.value) - first.lane) }, ...LANES.map((label, i) => h('option', { value: i }, label))); lane.value = String(first.lane);
      const kind = h('select', { 'aria-label': 'Note type', onchange: () => this.edit(() => selected.forEach((n) => { n.kind = kind.value as StudioNote['kind']; })) }, h('option', { value: 'auto' }, 'Auto strum / HOPO'), h('option', { value: 'tap' }, 'Tap')); kind.value = first.kind;
      this.inspector.append(h('div', { class: 'studio-row' }, this.field('Time (s)', time), this.field('Sustain (s)', length)), h('div', { class: 'studio-row' }, lane, kind),
        this.button('Delete notes', () => this.removeSelected()), this.button('Snap notes to grid', () => this.edit(() => selected.forEach((n) => { n.time = snapTime(p, n.time, this.snap); }))));
    }
    this.inspector.append(this.button('Copy notes', () => this.copy()), this.button('Paste at playhead', () => this.paste()));
    this.position.textContent = `${this.cursor.toFixed(2)} / ${p.analysis.duration.toFixed(2)} s`;
    this.timeline?.draw();
  }
  private adjacent(direction: number): void {
    const notes = this.project!.notes[this.difficulty], chosen = notes.findIndex((n) => this.selected.has(n.id));
    const index = chosen < 0 ? notes.findIndex((n) => n.time >= this.cursor) : chosen + direction;
    const note = notes[Math.max(0, Math.min(notes.length - 1, index))];
    if (note) { this.selected = new Set([note.id]); this.seek(note.time); this.updateEditor(); }
  }
  private add(time: number, lane: number): void {
    const p = this.project!;
    this.edit(() => { const note: StudioNote = { id: p.nextId++, time, length: 0, lane, kind: 'auto' }; p.notes[this.difficulty].push(note); this.selected = new Set([note.id]); });
  }
  private moveNotes(ids: Set<number>, delta: number, lanes: number): void {
    const p = this.project!, notes = p.notes[this.difficulty].filter((n) => ids.has(n.id)); if (!notes.length) return;
    delta = Math.max(-Math.min(...notes.map((n) => n.time)), Math.min(delta, p.analysis.duration - 0.0001 - Math.max(...notes.map((n) => n.time))));
    lanes = Math.max(-Math.min(...notes.map((n) => n.lane)), Math.min(lanes, 4 - Math.max(...notes.map((n) => n.lane))));
    this.edit(() => notes.forEach((n) => { n.time += delta; n.lane += lanes; }));
  }
  private removeSelected(): void { const p = this.project!; this.edit(() => { p.notes[this.difficulty] = p.notes[this.difficulty].filter((n) => !this.selected.has(n.id)); this.selected.clear(); }); }
  private copy(): void { this.clipboard = this.project!.notes[this.difficulty].filter((n) => this.selected.has(n.id)).map((n) => ({ ...n })); }
  private paste(): void {
    if (!this.clipboard.length) return;
    const p = this.project!, first = Math.min(...this.clipboard.map((n) => n.time)), at = snapTime(p, this.cursor, this.snap);
    this.edit(() => { const notes = this.clipboard.map((n) => ({ ...n, id: p.nextId++, time: n.time - first + at })); p.notes[this.difficulty].push(...notes); this.selected = new Set(notes.map((n) => n.id)); });
  }
  private undo(): void { if (this.project && this.history.undo(this.project)) { this.changed(); this.renderEditor(); } }
  private redo(): void { if (this.project && this.history.redo(this.project)) { this.changed(); this.renderEditor(); } }
  private seek(time: number): void {
    if (!this.project) return;
    this.clicks.reset();
    this.cursor = Math.max(0, Math.min(this.project.analysis.duration, time)); this.audio.currentTime = this.cursor;
    if (this.cursor < this.start || this.cursor > this.start + this.span) this.start = Math.max(0, this.cursor - this.span / 4);
    this.scrub.value = String(this.cursor); this.position.textContent = `${this.cursor.toFixed(2)} / ${this.project.analysis.duration.toFixed(2)} s`; this.timeline?.draw();
  }
  private updatePlayback(): void {
    if (!this.project) return;
    if (this.looping && !this.audio.paused && (this.audio.currentTime >= this.range.end || this.audio.currentTime < this.range.start)) this.audio.currentTime = this.range.start;
    this.cursor = this.audio.currentTime;
    this.clicks.update(this.project, this.difficulty, this.audio);
    if (this.cursor > this.start + this.span || this.cursor < this.start) this.start = Math.max(0, this.cursor - this.span / 5);
    this.scrub.value = String(this.cursor); this.position.textContent = `${this.cursor.toFixed(2)} / ${this.project.analysis.duration.toFixed(2)} s`; this.timeline?.draw();
  }
  private animate(): void { cancelAnimationFrame(this.raf); const frame = () => { if (this.destroyed || this.audio.paused) return; this.updatePlayback(); this.raf = requestAnimationFrame(frame); }; frame(); }
  private async download(): Promise<void> {
    if (!this.project || !this.audioFile) return;
    const blob = await exportProject(this.project, this.audioFile), url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${this.project.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Studio song'}.zip` });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    this.status.textContent = 'Exported song ZIP. Extract it into your charts folder to play in Clone Hero or reclone hero.';
  }
  private async playtest(): Promise<void> {
    const p = this.project; if (!p) return;
    if (!p.notes[this.difficulty].length) throw new Error('Add some notes before playtesting this difficulty.');
    await this.save(); await this.app.library.index();
    if (this.destroyed) return;
    const song = makeSongEntry(studioFolder(p))!;
    const chart = loadChart('notes.chart', new TextEncoder().encode(chartText(p)), song.chartOptions);
    const { GameScreen } = await import('./gamescreen.ts');
    const diff = this.difficulty;
    this.app.show(new GameScreen(this.app, { song, chart, instrument: 'guitar', difficulty: diff, bot: false,
      studioReturn: () => this.app.show(new StudioScreen(this.app, p.id, diff)) }));
  }
  private async removeProject(): Promise<void> {
    if (!this.project || !confirm(`Delete “${this.project.name}” from this browser? Export it first if you want to keep it.`)) return;
    clearTimeout(this.saveTimer); await this.writes.catch(() => {}); await deleteProject(this.project.id);
    this.dirty = false; await this.app.library.index(); this.app.show(new StudioScreen(this.app));
  }
  private async back(): Promise<void> { if (!await this.saveBeforeLeaving()) return; await this.app.library.index(); const { SongSelect } = await import('./songselect.ts'); if (!this.destroyed) this.app.show(new SongSelect(this.app)); }
  key(e: KeyboardEvent): boolean {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return false;
    if (!this.project) return false;
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
      if (e.key.toLowerCase() === 'y') { this.redo(); return true; }
      if (e.key.toLowerCase() === 's') { void this.run(() => this.save()); return true; }
      if (e.key.toLowerCase() === 'c') { this.copy(); return true; }
      if (e.key.toLowerCase() === 'v') { this.paste(); return true; }
      return false;
    }
    if (e.code === 'Space') { if (this.audio.paused) void this.run(() => this.audio.play()); else this.audio.pause(); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.removeSelected(); return true; }
    if (/^[1-5]$/.test(e.key)) { this.add(snapTime(this.project, this.cursor, this.snap), Number(e.key) - 1); return true; }
    return false;
  }
  destroy(): void {
    this.destroyed = true; this.controller?.abort(); clearTimeout(this.saveTimer); cancelAnimationFrame(this.raf);
    this.timeline?.destroy(); this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    this.clicks.reset();
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
