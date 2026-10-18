import type { App, Screen } from '../app.ts';
import { h, setText } from '../dom.ts';
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
import { separateAudio } from '../../studio/stems.ts';
import type { StudioStems } from '../../studio/stems.ts';
import { StudioClicks } from '../../studio/clicks.ts';
import { icon } from '../icons.ts';
import type { IconName } from '../icons.ts';
import { formatTime } from '../../util/text.ts';

const LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };
const LANES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'];
type InspectorPanel = 'notes' | 'timing' | 'passage' | 'audio';
type StudioView = Pick<TimelineState, 'cursor' | 'start' | 'span' | 'snap' | 'tool'> & {
  selected: number[]; panel: InspectorPanel; history: StudioHistory;
  range: { start: number; end: number }; looping: boolean; follow: boolean;
};

export class StudioScreen implements Screen {
  readonly el: HTMLElement;
  private app: App;
  private project: StudioProject | null = null;
  private audioFile: Blob | null = null;
  private stems?: StudioStems;
  private separation: AbortController | null = null;
  private stemPanel = h('div', { class: 'studio-stem-panel' });
  private stemStatus = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  private pairingCode = '';
  private listenMode: 'original' | 'guitar' | 'backing' = 'original';
  private audio = h('audio', { hidden: true, preload: 'metadata', 'aria-label': 'Song preview' });
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
  private inspectorSignature = '';
  private stats = h('p', { class: 'studio-stats' });
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
  private projectMenu = h('details', { class: 'studio-project-menu' });
  private projectMeta = h('div', { class: 'studio-project-meta' });
  private songHeading = h('div', { class: 'studio-song-heading' });
  private projectActions = h('div', { class: 'studio-preview-actions', hidden: true });
  private activePanel: InspectorPanel = 'notes';
  private panels = new Map<InspectorPanel, HTMLElement>();
  private tabs = new Map<InspectorPanel, HTMLButtonElement>();
  private playButton: HTMLButtonElement | null = null;
  private undoButton: HTMLButtonElement | null = null;
  private redoButton: HTMLButtonElement | null = null;
  private zoomLabel = h('span', { class: 'studio-zoom-label' });
  private tempoButton: HTMLButtonElement | null = null;
  private follow = true;
  private followButton: HTMLButtonElement | null = null;
  private restoreView?: StudioView;

  constructor(app: App, projectId?: string, difficulty?: Difficulty, view?: StudioView) {
    this.app = app;
    this.restoreView = view;
    this.cancelButton.onclick = () => { this.controller?.abort(); this.controller = null; this.cancelButton.disabled = true; this.cancelButton.hidden = true; this.status.textContent = 'Analysis cancelled.'; };
    if (difficulty) this.difficulty = difficulty;
    const file = h('input', { type: 'file', hidden: true, accept: '.mp3,.wav,.ogg,.opus,.m4a', 'aria-label': 'Import song file', onchange: () => {
      const chosen = file.files?.[0]; file.value = '';
      if (chosen) void this.run(() => this.importSong(chosen));
    } });
    const zip = h('input', { type: 'file', hidden: true, accept: '.zip', 'aria-label': 'Import Studio ZIP', onchange: () => {
      const chosen = zip.files?.[0]; zip.value = '';
      if (chosen) void this.run(() => this.importZip(chosen));
    } });
    this.saved.onchange = () => { if (this.saved.value) void this.run(() => this.open(this.saved.value)); };
    const importSong = () => { this.projectMenu.open = false; file.click(); };
    const importZip = () => { this.projectMenu.open = false; zip.click(); };
    this.projectMenu.append(h('summary', null, icon('folder'), 'Project'),
      h('div', { class: 'studio-project-popover' },
        h('h2', null, 'Projects'), this.saved,
        h('div', { class: 'studio-row' }, this.button('Import song…', importSong), this.button('Open Studio ZIP…', importZip)),
        this.projectMeta,
        h('p', { class: 'hint' }, 'Audio and charts stay on this device. Export a ZIP to keep a portable copy.')));
    const watch = this.button('Watch bot', () => this.playtest(true)); watch.prepend(icon('bot'));
    const playtest = this.button('Playtest', () => this.playtest(), true); playtest.prepend(icon('play'));
    this.projectActions.append(this.iconButton('Export song ZIP', 'download', () => this.download()), watch, playtest);
    const shortcuts = h('details', { class: 'studio-help' }, h('summary', { title: 'Keyboard shortcuts', 'aria-label': 'Keyboard shortcuts' }, icon('help')),
      h('div', { class: 'studio-help-popover' }, h('strong', null, 'Keyboard shortcuts'),
        ...[['Space', 'Play / pause'], ['1–5', 'Add a fret at the playhead'], ['← →', 'Seek, or nudge selected notes'], ['Delete', 'Delete selected notes'], ['Ctrl / ⌘ Z', 'Undo · Shift to redo'], ['Ctrl / ⌘ C / V', 'Copy / paste notes'], ['+ / −', 'Zoom at the playhead'], ['Shift + wheel', 'Pan the timeline']].map(([key, label]) => h('p', null, h('kbd', null, key), label))));
    this.el = h('div', { class: 'screen studio-screen', 'data-loaded': 'false' },
      h('header', { class: 'studio-header' }, this.button('← Library', () => this.back()),
        h('div', { class: 'studio-brand' }, h('h1', null, 'Chart Studio'), this.songHeading),
        this.saveStatus, this.projectMenu, shortcuts, this.projectActions),
      h('div', { class: 'studio-notice' }, this.status, this.cancelButton,
        this.iconButton('Dismiss notice', 'close', () => { if (!this.controller) this.status.textContent = ''; })),
      this.content, this.audio, file, zip);
    this.cancelButton.hidden = true;
    this.content.append(h('section', { class: 'studio-welcome' },
      h('div', { class: 'studio-welcome-copy' }, h('span', { class: 'studio-eyebrow' }, 'FROM RECORDING TO HIGHWAY'),
        h('h2', null, 'Make it yours.'), h('p', null, 'Start with a song. Find its rhythm, shape the notes, and watch your chart come to life.'),
        h('div', { class: 'studio-dropzone' }, icon('download'), h('strong', null, 'Drop a song or Studio ZIP here'),
          h('span', null, 'MP3, WAV, OGG, Opus, M4A · Up to 100 MB / 20 minutes'),
          this.button('Choose song file', importSong, true), this.button('Open Studio ZIP', importZip)),
        h('p', { class: 'hint' }, 'Already started? Open a saved chart from the Project menu.')),
      h('div', { class: 'studio-welcome-steps' },
        ...[['01', 'Find the rhythm', 'Get four difficulty drafts from your recording.'], ['02', 'Shape your chart', 'Drag notes, add sustains, and refine each passage.'], ['03', 'See it play', 'Watch the bot, playtest, then export your song.']].map(([n, title, text]) => h('div', null, h('span', null, n), h('h3', null, title), h('p', null, text))))));
    this.el.addEventListener('pointerdown', (e) => {
      if (!this.projectMenu.contains(e.target as Node)) this.projectMenu.open = false;
      if (!shortcuts.contains(e.target as Node)) shortcuts.open = false;
    });
    this.el.ondragover = (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); this.el.classList.add('dragging-file'); } };
    this.el.ondragleave = (e) => { if (!this.el.contains(e.relatedTarget as Node | null)) this.el.classList.remove('dragging-file'); };
    this.el.ondrop = (e) => {
      e.preventDefault(); this.el.classList.remove('dragging-file');
      const dropped = e.dataTransfer?.files[0];
      if (dropped) void this.run(() => /\.zip$/i.test(dropped.name) ? this.importZip(dropped) : this.importSong(dropped));
    };
    this.audio.ontimeupdate = () => this.updatePlayback();
    this.audio.onplay = () => { this.syncTransport(); this.animate(); };
    this.audio.onpause = () => { this.clicks.reset(); this.syncTransport(); };
    this.scrub.oninput = () => this.seek(Number(this.scrub.value));
    window.addEventListener('beforeunload', this.beforeUnload);
    void this.refreshSaved();
    if (projectId) void this.run(() => this.open(projectId));
  }

  private beforeUnload = (e: BeforeUnloadEvent) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
  private button(label: string, action: () => unknown, primary = false): HTMLButtonElement {
    return h('button', { class: primary ? 'btn primary' : 'btn', onclick: () => void this.run(async () => { await action(); }) }, label);
  }
  private iconButton(label: string, name: IconName, action: () => unknown): HTMLButtonElement {
    const button = this.button('', action);
    button.classList.add('studio-icon-button'); button.setAttribute('aria-label', label); button.title = label;
    button.append(icon(name)); return button;
  }
  private async importZip(file: File): Promise<void> {
    this.projectMenu.open = false;
    const revision = ++this.loadRevision;
    if (!await this.saveBeforeLeaving() || this.destroyed || revision !== this.loadRevision) return;
    this.controller?.abort(); this.controller = null; this.cancelButton.hidden = true;
    const imported = await importProjectZip(file, crypto.randomUUID());
    if (this.destroyed || revision !== this.loadRevision) return;
    this.install(imported.project, imported.audio, imported.stems); this.changed();
    this.status.textContent = 'Project restored, including all edits and locked passages.';
  }
  private setSaveStatus(text: string): void {
    this.saveStatus.textContent = text; this.saveStatus.title = text;
    this.saveStatus.dataset.state = text.startsWith('Saved') ? 'saved' : text.startsWith('Saving') ? 'saving' : text.startsWith('Unsaved') ? 'dirty' : 'error';
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
    } catch { this.setSaveStatus('Browser storage unavailable — export to keep your work.'); }
  }
  private async importSong(file: File): Promise<void> {
    this.projectMenu.open = false;
    const revision = ++this.loadRevision;
    if (!await this.saveBeforeLeaving()) return;
    if (this.destroyed || revision !== this.loadRevision) return;
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    this.cancelButton.disabled = false; this.cancelButton.hidden = false;
    this.audio.pause();
    this.separation?.abort(); this.separation = null;
    this.status.textContent = 'Decoding audio…';
    let analysis;
    try { analysis = await analyzeFile(file, controller.signal, (p) => { if (!this.destroyed && this.controller === controller) this.status.textContent = `Analyzing music… ${Math.round(p * 100)}%`; }); }
    catch (error) { if (this.controller === controller) { this.controller = null; this.cancelButton.disabled = true; this.cancelButton.hidden = true; throw error; } return; }
    if (this.destroyed || this.controller !== controller) return;
    this.controller = null; this.cancelButton.disabled = true; this.cancelButton.hidden = true;
    this.install(createProject(crypto.randomUUID(), file.name, analysis), file);
    this.status.textContent = analysis.onsets.length ? `Found ${analysis.onsets.length} musical attacks. Listen and refine the draft below.` : 'No clear attacks found. You can add notes manually, or try another recording.';
    this.changed();
  }
  private async open(id: string): Promise<void> {
    const revision = ++this.loadRevision;
    if (!await this.saveBeforeLeaving()) return;
    if (this.destroyed || revision !== this.loadRevision) return;
    this.controller?.abort(); this.controller = null; this.cancelButton.disabled = true; this.cancelButton.hidden = true;
    const saved = await readProject(id);
    if (this.destroyed || revision !== this.loadRevision) return;
    this.install(saved.project, saved.audio, saved.stems);
    this.setSaveStatus('Saved in this browser'); this.status.textContent = '';
  }
  private install(project: StudioProject, audio: Blob, stems?: StudioStems): void {
    this.separation?.abort(); this.separation = null; this.stems = stems; this.listenMode = 'original'; this.stemStatus.textContent = '';
    clearTimeout(this.saveTimer);
    this.audio.pause();
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.project = project; this.audioFile = audio; this.audioUrl = URL.createObjectURL(audio); this.audio.src = this.audioUrl;
    this.history = new StudioHistory(); this.selected.clear(); this.clipboard = []; this.cursor = 0; this.start = 0;
    this.span = Math.min(12, Math.max(2, project.analysis.duration)); this.follow = true;
    this.projectMenu.open = false; this.projectActions.hidden = false; this.el.dataset.loaded = 'true';
    this.range = { start: 0, end: project.analysis.duration }; this.looping = false; this.dirty = false; this.revision++;
    const view = this.restoreView; this.restoreView = undefined;
    if (view) {
      this.cursor = view.cursor; this.start = view.start; this.span = view.span; this.snap = view.snap; this.tool = view.tool;
      this.selected = new Set(view.selected); this.activePanel = view.panel; this.history = view.history;
      this.range = { ...view.range }; this.looping = view.looping; this.follow = view.follow;
    }
    this.audio.onloadedmetadata = view ? () => {
      this.audio.currentTime = view.cursor; this.scrub.value = String(view.cursor); this.syncTransport(); this.timeline?.draw();
    } : null;
    this.renderEditor();
  }
  private async save(): Promise<void> {
    if (!this.project || !this.audioFile) return;
    clearTimeout(this.saveTimer);
    const project = structuredClone(this.project), audio = this.audioFile, stems = this.stems, revision = this.revision;
    this.setSaveStatus('Saving…');
    const write = this.writes.catch(() => {}).then(() => saveProject(project, audio, stems)); this.writes = write;
    try {
      await write;
      if (this.project?.id === project.id && this.revision === revision) { this.dirty = false; this.setSaveStatus('Saved in this browser'); }
      await this.refreshSaved();
    } catch { this.setSaveStatus('Not saved — export a ZIP to keep your work.'); throw new Error('Could not save the project. Browser storage may be full or unavailable. Export a ZIP before leaving.'); }
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
    this.revision++; this.dirty = true; this.setSaveStatus('Unsaved changes');
    this.clicks.reset();
    clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.run(() => this.save()), 1200);
    this.updateEditor();
  }
  private edit(action: () => void): void { if (!this.project) return; this.history.capture(this.project); action(); this.changed(); }

  private renderEditor(): void {
    const p = this.project!;
    this.timeline?.destroy(); this.inspectorSignature = '';
    const name = h('input', { value: p.name, 'aria-label': 'Song title', maxlength: 200, onchange: () => { p.name = name.value.trim() || 'Untitled song'; this.changed(); } });
    const artist = h('input', { value: p.artist, 'aria-label': 'Artist', maxlength: 200, onchange: () => { p.artist = artist.value.trim() || 'Unknown Artist'; this.changed(); } });
    const diff = h('select', { 'aria-label': 'Chart difficulty', onchange: () => { this.difficulty = diff.value as Difficulty; this.selected.clear(); this.clicks.reset(); this.updateEditor(); } }, ...DIFFICULTIES.map((d) => h('option', { value: d }, LABEL[d])));
    diff.value = this.difficulty;
    const tool = h('select', { 'aria-label': 'Editing tool', onchange: () => { this.tool = tool.value as TimelineState['tool']; } }, h('option', { value: 'select' }, 'Select'), h('option', { value: 'add' }, 'Add notes'), h('option', { value: 'erase' }, 'Erase'));
    tool.value = this.tool;
    const snap = h('select', { 'aria-label': 'Grid snap', onchange: () => { this.snap = Number(snap.value); } }, ...[[0, 'Free timing'], [1, '¼ notes'], [2, '⅛ notes'], [3, 'Triplets'], [4, '1/16 notes']].map(([value, label]) => h('option', { value }, label)));
    snap.value = String(this.snap);
    const canvas = h('canvas', { class: 'studio-timeline', tabindex: 0, 'aria-label': 'Chart timeline. Click waveform to seek. Select and drag notes, or use Add notes. Keyboard 1 to 5 adds frets at the playhead.' });
    this.scrub.max = String(p.analysis.duration); this.scrub.value = String(this.cursor);
    const rate = h('select', { 'aria-label': 'Preview speed', onchange: () => { this.audio.playbackRate = Number(rate.value); this.clicks.reset(); } }, ...[0.5, 0.75, 1].map((v) => h('option', { value: v }, `${v * 100}% speed`))); rate.value = String(this.audio.playbackRate);
    const click = h('select', { 'aria-label': 'Preview clicks', onchange: () => { this.clicks.reset(); this.clicks.mode = click.value as StudioClicks['mode']; } }, h('option', { value: 'off' }, 'Clicks off'), h('option', { value: 'notes' }, 'Hear chart notes'), h('option', { value: 'beats' }, 'Hear beat grid')); click.value = this.clicks.mode;
    const loop = h('input', { type: 'checkbox', checked: this.looping, onchange: () => { this.looping = loop.checked; } });
    const rangeStart = this.number('Passage start (seconds)', this.range.start, 0, p.analysis.duration, 0.01, (v) => { this.range.start = Math.min(v, this.range.end - 0.01); });
    const rangeEnd = this.number('Passage end (seconds)', this.range.end, 0.01, p.analysis.duration, 0.01, (v) => { this.range.end = Math.max(v, this.range.start + 0.01); });
    this.projectMeta.replaceChildren(h('h3', null, 'Song details'), this.field('Title', name), this.field('Artist', artist),
      h('div', { class: 'studio-row' }, this.button('Save', () => this.save()), this.button('Delete saved project', () => this.removeProject())));
    this.undoButton = this.iconButton('Undo', 'undo', () => this.undo());
    this.redoButton = this.iconButton('Redo', 'redo', () => this.redo());
    this.playButton = this.iconButton('Play preview', 'play', () => this.togglePlayback());
    this.playButton.classList.add('studio-play-button'); this.playButton.title = 'Play / pause (Space)';
    const volume = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: this.audio.volume, 'aria-label': 'Preview volume', oninput: () => { this.audio.volume = Number(volume.value); } });
    this.tempoButton = this.button('', () => this.setPanel('timing')); this.tempoButton.classList.add('studio-tempo-button');
    this.followButton = this.button('Follow playhead', () => { this.follow = !this.follow; if (this.follow) this.seek(this.cursor); this.updateView(); });
    this.followButton.classList.add('studio-follow');
    const passage = h('div', { class: 'studio-passage-controls' },
      h('p', { class: 'hint' }, 'Choose a passage to loop, protect, or regenerate.'),
      h('div', { class: 'studio-row' }, this.field('From (s)', rangeStart), this.field('To (s)', rangeEnd)),
      h('div', { class: 'studio-row' },
        this.button('From playhead', () => { this.range.start = Math.min(this.cursor, this.range.end - 0.01); rangeStart.value = this.range.start.toFixed(2); }),
        this.button('To playhead', () => { this.range.end = Math.max(this.cursor, this.range.start + 0.01); rangeEnd.value = this.range.end.toFixed(2); })),
      h('label', { class: 'studio-check' }, loop, 'Loop passage'),
      this.button('Select passage', () => { this.selected = new Set(p.notes[this.difficulty].filter((n) => n.time >= this.range.start && n.time < this.range.end).map((n) => n.id)); this.setPanel('notes'); this.updateEditor(); }),
      h('hr'), h('h3', null, 'Protect your edits'),
      h('div', { class: 'studio-row' }, this.button('Lock passage', () => this.edit(() => { p.locks[this.difficulty].push({ ...this.range }); })),
        this.button('Unlock passage', () => this.edit(() => { p.locks[this.difficulty] = p.locks[this.difficulty].filter((r) => r.end <= this.range.start || r.start >= this.range.end); }))),
      h('p', { class: 'hint' }, 'Locked notes stay intact when you regenerate.'), h('hr'),
      this.button('Regenerate passage', () => this.edit(() => regenerate(p, this.difficulty, this.range)), true),
      h('p', { class: 'hint' }, 'Replaces the unlocked notes in this difficulty only. You can undo this.'));
    this.panels.clear(); this.tabs.clear();
    const tablist = h('div', { class: 'studio-inspector-tabs', role: 'tablist', 'aria-label': 'Inspector' });
    for (const [id, label, body] of [['notes', 'Notes', this.inspector], ['timing', 'Grid', this.timingControls()], ['passage', 'Passage', passage], ['audio', 'Audio', this.audioControls()]] as const) {
      const tab = h('button', { role: 'tab', id: `studio-tab-${id}`, 'aria-controls': `studio-panel-${id}`, onclick: () => this.setPanel(id) }, label);
      tab.onkeydown = (e) => {
        const ids: InspectorPanel[] = ['notes', 'timing', 'passage', 'audio'];
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? 3 : e.key === 'ArrowRight' ? (ids.indexOf(id) + 1) % 4 : e.key === 'ArrowLeft' ? (ids.indexOf(id) + 3) % 4 : -1;
        if (next >= 0) { e.preventDefault(); this.setPanel(ids[next]); this.tabs.get(ids[next])?.focus(); }
      };
      const panel = h('section', { class: 'studio-inspector-panel', id: `studio-panel-${id}`, role: 'tabpanel', 'aria-labelledby': tab.id, tabindex: 0 }, body);
      this.tabs.set(id, tab); this.panels.set(id, panel); tablist.append(tab);
    }
    const zoomOut = this.iconButton('Zoom out', 'minus', () => this.zoomView(1.5));
    const zoomIn = this.iconButton('Zoom in', 'plus', () => this.zoomView(1 / 1.5));
    const previousView = this.button('←', () => this.panView(-this.span * 0.8)), nextView = this.button('→', () => this.panView(this.span * 0.8));
    previousView.setAttribute('aria-label', 'Previous view'); nextView.setAttribute('aria-label', 'Next view');
    previousView.title = 'Previous view (Shift + wheel to pan)'; nextView.title = 'Next view (Shift + wheel to pan)';
    this.content.replaceChildren(h('div', { class: 'studio-workspace' },
      h('section', { class: 'studio-editor', 'aria-label': 'Chart editor' },
        h('div', { class: 'studio-editor-toolbar' }, this.field('Difficulty', diff), this.field('Tool', tool), this.field('Snap', snap),
          h('div', { class: 'studio-edit-history' }, this.undoButton, this.redoButton)),
        h('div', { class: 'studio-transport' }, this.iconButton('Back to start', 'start', () => this.seek(0)), this.playButton, this.position,
          this.tempoButton, this.field('Speed', rate), this.field('Listen', click), h('label', { class: 'studio-volume' }, 'Volume', volume)),
        h('div', { class: 'studio-canvas-wrap' }, canvas),
        h('div', { class: 'studio-navigation' },
          previousView, nextView,
          this.followButton, h('div', { class: 'studio-zoom' }, zoomOut, this.zoomLabel, zoomIn)),
        h('div', { class: 'studio-song-overview' }, h('span', null, 'SONG'), this.scrub, h('span', null, formatTime(p.analysis.duration))),
        h('footer', { class: 'studio-editor-footer' }, this.stats, h('span', { class: 'studio-short-hint' }, '1–5 add notes · Shift-click selects more'))),
      h('aside', { class: 'studio-sidebar', 'aria-label': 'Chart inspector' },
        h('div', { class: 'studio-inspector-heading' }, h('h2', null, 'Inspector'), h('span', null, 'Refine this chart')), tablist, ...this.panels.values())));
    this.setPanel(this.activePanel);
    this.timeline = new StudioTimeline(canvas, () => ({ project: this.project!, difficulty: this.difficulty, selected: this.selected, start: this.start, span: this.span, cursor: this.cursor, snap: this.snap, tool: this.tool }), {
      select: (ids) => { this.selected = ids; if (ids.size) this.setPanel('notes'); this.updateEditor(); }, seek: (time) => this.seek(time), add: (time, lane) => this.add(time, lane),
      remove: (id) => this.edit(() => { p.notes[this.difficulty] = p.notes[this.difficulty].filter((n) => n.id !== id); }),
      move: (ids, delta, lanes) => this.moveNotes(ids, delta, lanes),
      pan: (delta) => this.panView(delta), zoom: (factor) => this.zoomView(factor),
    });
    this.updateEditor(); this.syncTransport(); this.updateView();
  }

  private audioControls(): HTMLElement {
    const setup = h('details', { class: 'studio-helper-setup', open: this.stemPanel.querySelector<HTMLDetailsElement>('details')?.open ?? false }, h('summary', null, 'Set up the local helper'),
      h('p', { class: 'hint' }, 'Install Python 3.10–3.12 and ffmpeg, then follow the setup guide. Start the helper for this page:'),
      h('code', null, `python tools/stem-helper/server.py --origin '${location.origin}'`),
      h('a', { href: 'https://github.com/nathsou/reclone-hero/blob/main/tools/stem-helper/README.md', target: '_blank', rel: 'noopener noreferrer' }, 'Installation guide ↗'),
      h('p', { class: 'hint' }, 'The first run downloads an ~80 MB model. CPU separation can take several minutes; a supported GPU is faster.'));
    const pairing = h('input', { type: 'password', autocomplete: 'off', value: this.pairingCode, placeholder: 'Code from helper terminal', 'aria-label': 'Helper pairing code', oninput: () => { this.pairingCode = pairing.value.trim(); start.disabled = !this.pairingCode || !!this.separation; } });
    const start = this.button(this.stems ? 'Separate guitar again' : 'Separate guitar', () => this.extractStems(), true);
    start.disabled = !this.pairingCode || !!this.separation;
    const cancel = this.button('Cancel separation', () => { this.separation?.abort(); }); cancel.hidden = !this.separation;
    const remove = this.button('Use original mix', () => {
      this.stems = undefined; this.listenMode = 'original'; this.changeAudioPreview(); this.changed(); this.audioControls();
      this.stemStatus.textContent = 'Separate audio removed. The original recording is restored for gameplay.';
    }); remove.hidden = !this.stems; remove.disabled = !!this.separation;
    const audition = h('select', { 'aria-label': 'Preview audio', onchange: () => {
      this.listenMode = audition.value as typeof this.listenMode; this.changeAudioPreview();
    } }, h('option', { value: 'original' }, 'Original recording'), h('option', { value: 'guitar' }, 'Guitar only'), h('option', { value: 'backing' }, 'Backing only'));
    audition.value = this.listenMode; audition.disabled = !this.stems;
    this.stemPanel.replaceChildren(h('h3', null, 'Instrument audio'),
      h('p', { class: 'hint' }, this.stems ? 'Separate guitar is ready. Misses mute the guitar while the backing keeps playing.' : 'Give misses a separate guitar part to mute, keeping the rest of the band playing.'),
      h('p', { class: 'hint' }, 'Optional · AI separation runs on your computer. Songs are sent only to the helper at 127.0.0.1.'), setup,
      this.field('Pairing code', pairing), h('div', { class: 'studio-row' }, start, cancel), this.stemStatus,
      this.field('Audition tracks', audition), h('p', { class: 'hint' }, 'Use the transport to listen. Separation is an estimate: other instruments may bleed through. Your notes and original recording stay intact.'), remove);
    return this.stemPanel;
  }
  private changeAudioPreview(): void {
    const blob = this.listenMode === 'original' ? this.audioFile : this.stems?.[this.listenMode];
    if (!blob) return;
    const playing = !this.audio.paused, cursor = this.cursor;
    this.audio.pause(); if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = URL.createObjectURL(blob); this.audio.src = this.audioUrl;
    this.audio.onloadedmetadata = () => {
      this.audio.currentTime = Math.min(cursor, this.audio.duration); this.syncTransport();
      if (playing) void this.run(() => this.audio.play());
    };
  }
  private async extractStems(): Promise<void> {
    const project = this.project, audio = this.audioFile;
    if (!project || !audio || !this.pairingCode || this.separation) return;
    const controller = this.separation = new AbortController();
    const started = performance.now(); this.audioControls();
    try {
      const stems = await separateAudio(audio, this.pairingCode, project.analysis.duration, controller.signal, (phase, fraction) => {
        if (this.destroyed || this.separation !== controller) return;
        this.stemStatus.textContent = `${phase}${phase === 'Separating guitar' ? ` · ${Math.round(fraction * 100)}%` : ''} · ${Math.round((performance.now() - started) / 1000)}s`;
      });
      if (this.destroyed || this.project !== project || this.separation !== controller) return;
      this.stems = stems; if (this.listenMode !== 'original') this.changeAudioPreview(); this.changed();
      this.stemStatus.textContent = 'Guitar and backing ready. Audition the result, then watch the bot or playtest.';
    } catch (error) {
      if (!this.destroyed && this.separation === controller) this.stemStatus.textContent = controller.signal.aborted ? 'Separation cancelled. Your audio is unchanged.' : error instanceof Error ? error.message : String(error);
    } finally {
      if (this.separation === controller) { this.separation = null; if (!this.destroyed) this.audioControls(); }
    }
  }

  private field(label: string, input: HTMLElement): HTMLElement { return h('label', { class: 'studio-field' }, h('span', null, label), input); }
  private setPanel(id: InspectorPanel): void {
    this.activePanel = id;
    for (const [key, tab] of this.tabs) { tab.setAttribute('aria-selected', String(key === id)); tab.tabIndex = key === id ? 0 : -1; }
    for (const [key, panel] of this.panels) panel.hidden = key !== id;
  }
  private togglePlayback(): void {
    if (!this.project) return;
    if (this.audio.paused) {
      if (this.looping && (this.cursor < this.range.start || this.cursor >= this.range.end)) this.seek(this.range.start);
      void this.run(() => this.audio.play());
    } else this.audio.pause();
  }
  private syncTransport(): void {
    const label = this.audio.paused ? 'Play preview' : 'Pause preview';
    if (this.playButton?.getAttribute('aria-label') !== label) {
      this.playButton?.replaceChildren(icon(this.audio.paused ? 'play' : 'pause')); this.playButton?.setAttribute('aria-label', label);
    }
    const clock = (time: number) => `${formatTime(time)}.${Math.floor((time % 1) * 10)}`;
    setText(this.position, `${clock(this.cursor)} / ${formatTime(this.project?.analysis.duration ?? 0)}`);
  }
  private updateView(): void {
    this.zoomLabel.textContent = `${Number(this.span.toFixed(1))}s window`;
    this.followButton?.setAttribute('aria-pressed', String(this.follow));
    this.timeline?.draw();
  }
  private panView(delta: number): void {
    if (!this.project) return;
    this.start = Math.max(0, Math.min(Math.max(0, this.project.analysis.duration - this.span), this.start + delta));
    this.follow = false; this.updateView();
  }
  private zoomView(factor: number): void {
    if (!this.project) return;
    const anchor = this.cursor >= this.start && this.cursor <= this.start + this.span ? this.cursor : this.start + this.span / 2;
    const fraction = (anchor - this.start) / this.span;
    this.span = Math.max(2, Math.min(120, this.span * factor));
    this.start = Math.max(0, Math.min(Math.max(0, this.project.analysis.duration - this.span), anchor - fraction * this.span));
    this.updateView();
  }
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
    this.stats.textContent = `${LABEL[this.difficulty]} · ${attacks} notes · ${(attacks / p.analysis.duration).toFixed(1)}/s · ${p.locks[this.difficulty].length} locked`;
    this.stats.title = `${notes.length} gems across ${attacks} attacks. Density is the whole-song average.`;
    this.songHeading.textContent = p.name; this.songHeading.title = `${p.name} — ${p.artist}`;
    if (this.undoButton) this.undoButton.disabled = !this.history.canUndo;
    if (this.redoButton) this.redoButton.disabled = !this.history.canRedo;
    if (this.tempoButton) { this.tempoButton.textContent = `${Number(timingMap(p).map.bpmAt(this.cursor).toFixed(2))} BPM`; this.tempoButton.title = 'Adjust the beat grid'; }
    const signature = `${p.id}:${this.difficulty}:${selected.map((n) => n.id).join(',')}:${notes.length}:${this.clipboard.length}`;
    if (signature !== this.inspectorSignature) {
      this.inspectorSignature = signature;
      this.inspector.replaceChildren(selected.length
        ? h('div', { class: 'studio-selection-heading' }, h('h3', null, selected.length === 1 ? 'Note properties' : `${selected.length} notes selected`), h('p', { class: 'hint' }, 'Changes apply to the selected gems.'))
        : h('div', { class: 'studio-empty-selection' }, h('span', { class: 'studio-note-symbol' }, '♪'), h('h3', null, 'Select a note'), h('p', null, 'Click a gem in the timeline to edit its timing, fret, or sustain.'), h('p', { class: 'hint' }, 'Shift-click adds to your selection. Use keys 1–5 to add notes at the playhead.')));
      const previous = this.button('Previous note', () => this.adjacent(-1)), next = this.button('Next note', () => this.adjacent(1));
      previous.disabled = next.disabled = !notes.length;
      this.inspector.append(h('div', { class: 'studio-row' }, previous, next));
      if (selected.length) {
        const first = selected[0];
        const time = this.number('Note time (seconds)', first.time, 0, p.analysis.duration - 0.0001, 0.001, (v) => this.moveNotes(this.selected, v - (p.notes[this.difficulty].find((n) => this.selected.has(n.id))?.time ?? v), 0));
        const length = this.number('Sustain length (seconds)', first.length, 0, p.analysis.duration, 0.01, (v) => this.edit(() => p.notes[this.difficulty].filter((n) => this.selected.has(n.id)).forEach((n) => { n.length = v; })));
        const lane = h('select', { 'aria-label': 'Note lane', onchange: () => this.moveNotes(this.selected, 0, Number(lane.value) - (p.notes[this.difficulty].find((n) => this.selected.has(n.id))?.lane ?? 0)) }, ...LANES.map((label, i) => h('option', { value: i }, label))); lane.value = String(first.lane);
        const kind = h('select', { 'aria-label': 'Note type', onchange: () => this.edit(() => p.notes[this.difficulty].filter((n) => this.selected.has(n.id)).forEach((n) => { n.kind = kind.value as StudioNote['kind']; })) }, h('option', { value: 'auto' }, 'Auto strum / HOPO'), h('option', { value: 'tap' }, 'Tap')); kind.value = first.kind;
        this.inspector.append(h('div', { class: 'studio-row' }, this.field('Time (s)', time), this.field('Sustain (s)', length)), h('div', { class: 'studio-row' }, lane, kind),
          this.button('Delete notes', () => this.removeSelected()), this.button('Snap notes to grid', () => this.edit(() => p.notes[this.difficulty].filter((n) => this.selected.has(n.id)).forEach((n) => { n.time = snapTime(p, n.time, this.snap); }))));
      }
      const copy = this.button('Copy notes', () => this.copy()), paste = this.button('Paste at playhead', () => this.paste());
      copy.disabled = !selected.length; paste.disabled = !this.clipboard.length;
      this.inspector.append(h('div', { class: 'studio-row' }, copy, paste));
    }
    // Keep form nodes alive while editing, so Tab and keyboard focus stay in the inspector.
    const first = selected[0];
    if (first) {
      for (const [label, value] of [['Note time (seconds)', first.time], ['Sustain length (seconds)', first.length], ['Note lane', first.lane], ['Note type', first.kind]] as const) {
        const input = this.inspector.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
        if (input) input.value = typeof value === 'number' ? String(Number(value.toFixed(4))) : value;
      }
    }
    this.syncTransport();
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
    this.setPanel('notes');
    this.edit(() => { const note: StudioNote = { id: p.nextId++, time, length: 0, lane, kind: 'auto' }; p.notes[this.difficulty].push(note); this.selected = new Set([note.id]); });
  }
  private moveNotes(ids: Set<number>, delta: number, lanes: number): void {
    const p = this.project!, notes = p.notes[this.difficulty].filter((n) => ids.has(n.id)); if (!notes.length) return;
    delta = Math.max(-Math.min(...notes.map((n) => n.time)), Math.min(delta, p.analysis.duration - 0.0001 - Math.max(...notes.map((n) => n.time))));
    lanes = Math.max(-Math.min(...notes.map((n) => n.lane)), Math.min(lanes, 4 - Math.max(...notes.map((n) => n.lane))));
    this.edit(() => notes.forEach((n) => { n.time += delta; n.lane += lanes; }));
  }
  private removeSelected(): void { const p = this.project!; this.edit(() => { p.notes[this.difficulty] = p.notes[this.difficulty].filter((n) => !this.selected.has(n.id)); this.selected.clear(); }); }
  private copy(): void { this.clipboard = this.project!.notes[this.difficulty].filter((n) => this.selected.has(n.id)).map((n) => ({ ...n })); this.updateEditor(); }
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
    this.scrub.value = String(this.cursor); this.syncTransport(); this.timeline?.draw();
  }
  private updatePlayback(): void {
    if (!this.project) return;
    if (this.looping && !this.audio.paused && (this.audio.currentTime >= this.range.end || this.audio.currentTime < this.range.start)) this.audio.currentTime = this.range.start;
    this.cursor = this.audio.currentTime;
    this.clicks.update(this.project, this.difficulty, this.audio);
    if (this.follow && (this.cursor > this.start + this.span || this.cursor < this.start)) this.start = Math.max(0, this.cursor - this.span / 5);
    this.scrub.value = String(this.cursor); this.syncTransport(); this.timeline?.draw();
  }
  private animate(): void { cancelAnimationFrame(this.raf); const frame = () => { if (this.destroyed || this.audio.paused) return; this.updatePlayback(); this.raf = requestAnimationFrame(frame); }; frame(); }
  private async download(): Promise<void> {
    if (!this.project || !this.audioFile) return;
    const blob = await exportProject(this.project, this.audioFile, this.stems), url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${this.project.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Studio song'}.zip` });
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    this.status.textContent = 'Exported song ZIP. Extract it into your charts folder to play in Clone Hero or reclone hero.';
  }
  private async playtest(bot = false): Promise<void> {
    const p = this.project; if (!p) return;
    if (!p.notes[this.difficulty].length) throw new Error('Add some notes before previewing this difficulty.');
    await this.save(); await this.app.library.index();
    if (this.destroyed) return;
    const song = makeSongEntry(studioFolder(p, this.stems))!;
    const chart = loadChart('notes.chart', new TextEncoder().encode(chartText(p, this.stems ? 'song.ogg' : p.audioName)), song.chartOptions);
    const { GameScreen } = await import('./gamescreen.ts');
    const diff = this.difficulty;
    const app = this.app, id = p.id;
    const view: StudioView = { cursor: this.cursor, start: this.start, span: this.span, snap: this.snap, tool: this.tool,
      selected: [...this.selected], panel: this.activePanel, history: this.history, range: { ...this.range }, looping: this.looping, follow: this.follow };
    app.show(new GameScreen(app, { song, chart, instrument: 'guitar', difficulty: diff, bot,
      studioReturn: () => app.show(new StudioScreen(app, id, diff, view)) }));
  }
  private async removeProject(): Promise<void> {
    if (!this.project || !confirm(`Delete “${this.project.name}” from this browser? Export it first if you want to keep it.`)) return;
    clearTimeout(this.saveTimer); await this.writes.catch(() => {}); await deleteProject(this.project.id);
    this.dirty = false; await this.app.library.index(); this.app.show(new StudioScreen(this.app));
  }
  private async back(): Promise<void> { if (!await this.saveBeforeLeaving()) return; await this.app.library.index(); const { SongSelect } = await import('./songselect.ts'); if (!this.destroyed) this.app.show(new SongSelect(this.app)); }
  key(e: KeyboardEvent): boolean {
    if (e.defaultPrevented) return false;
    if (e.key === 'Escape' && this.projectMenu.open) { (document.activeElement as HTMLElement)?.blur(); this.projectMenu.open = false; return true; }
    const help = this.el.querySelector<HTMLDetailsElement>('.studio-help');
    if (e.key === 'Escape' && help?.open) { help.open = false; return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { (document.activeElement as HTMLElement)?.blur(); void this.run(() => this.save()); return true; }
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
    if (e.code === 'Space') { if (e.target instanceof Element && e.target.closest('button, summary, a')) return false; this.togglePlayback(); return true; }
    if (e.key === '+' || e.key === '=') { this.zoomView(1 / 1.5); return true; }
    if (e.key === '-') { this.zoomView(1.5); return true; }
    if (e.target instanceof HTMLCanvasElement && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      const first = this.project.notes[this.difficulty].find((n) => this.selected.has(n.id));
      if (first) {
        const { map } = timingMap(this.project);
        const delta = this.snap ? map.tickToTime(map.timeToTick(first.time) + direction * 480 / this.snap) - first.time : direction * 0.01;
        this.moveNotes(this.selected, delta, 0);
      } else this.seek(this.cursor + direction);
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.removeSelected(); return true; }
    if (/^[1-5]$/.test(e.key)) { this.add(snapTime(this.project, this.cursor, this.snap), Number(e.key) - 1); return true; }
    return false;
  }
  destroy(): void {
    this.destroyed = true; this.controller?.abort(); this.separation?.abort(); clearTimeout(this.saveTimer); cancelAnimationFrame(this.raf);
    this.timeline?.destroy(); this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    this.clicks.reset();
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
