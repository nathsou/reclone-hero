import type { BeatList, NoteList } from '../chart/types.ts';
import { HOPO, TAP, noteListOf } from '../chart/types.ts';
import { HIT, MISSED } from '../engine/engine.ts';
import type { Quality } from '../settings.ts';
import {
  OPEN_R,
  QUAD,
  blockMesh,
  discMesh,
  domeBarMesh,
  domeMesh,
  flatButtonMesh,
  fretButtonMesh,
  gemMesh,
  goldButtonMesh,
  jewelMesh,
  openBarMesh,
  pillMesh,
  softButtonMesh,
  squareButtonMesh,
  stripMesh,
  wheelMesh,
} from './geometry.ts';
import { InstanceBuffer, deleteTarget, program, staticBuffer, target } from './gl.ts';
import type { GL, Program, Target } from './gl.ts';
import { lookAt, multiply, perspective, project } from './math.ts';
import type { Mat4 } from './math.ts';
import { Particles } from './particles.ts';
import * as S from './shaders.ts';
import type { RenderTheme } from '../ui/themes.ts';
import { SKINS } from './skins.ts';
import type { NoteSkin } from './skins.ts';

/** Fallback scene theme (Neon), for callers that do not care. */
export const DEFAULT_RENDER_THEME: RenderTheme = {
  light: false, bgBottom: [0.03, 0.012, 0.05], bgTop: [0.012, 0.01, 0.03], art: 1, highwayTint: [1, 1, 1], grid: 0, scanlines: 0, pattern: 0, bloom: 0.55, vignette: 0.35,
  hwFar: [0.008, 0.008, 0.016], hwNear: [0.03, 0.028, 0.05], laneLine: [0.06, 0.06, 0.09], strike: [0.25, 0.25, 0.3], beat: [0.7, 0.7, 0.85], beatOver: 0,
  railColor: null, board: 0, ink: 0, inkColor: [0.01, 0.009, 0.007],
};

/** How hit sparks behave per skin (all allocation-free at runtime). */
interface ParticleFx {
  flare: boolean;
  count: number;
  openCount: number;
  speed: number;
  size: number;
  sizeVar: number;
  life: number;
  lifeVar: number;
  shape: number;
  gravity: number;
  gain: number;
  add: number;
  /** tint towards gold (Baroque glitter) */
  gold: number;
  sustainRate: number;
}

const FX: Record<NoteSkin['particles'], ParticleFx> = {
  sparks: { flare: true, count: 12, openCount: 26, speed: 1, size: 0.05, sizeVar: 0.05, life: 0.3, lifeVar: 0.35, shape: 0, gravity: -9, gain: 1.8, add: 0.3, gold: 0, sustainRate: 60 },
  dots: { flare: false, count: 5, openCount: 10, speed: 0.55, size: 0.06, sizeVar: 0.03, life: 0.22, lifeVar: 0.12, shape: 3, gravity: -7, gain: 0.85, add: 0, gold: 0, sustainRate: 10 },
  glitter: { flare: true, count: 16, openCount: 30, speed: 0.8, size: 0.035, sizeVar: 0.04, life: 0.4, lifeVar: 0.4, shape: 0, gravity: -5, gain: 1.7, add: 0.15, gold: 0.65, sustainRate: 45 },
  squares: { flare: false, count: 8, openCount: 16, speed: 0.9, size: 0.07, sizeVar: 0.03, life: 0.3, lifeVar: 0.2, shape: 2, gravity: -12, gain: 1.15, add: 0.05, gold: 0, sustainRate: 22 },
  puffs: { flare: false, count: 6, openCount: 12, speed: 0.35, size: 0.14, sizeVar: 0.08, life: 0.5, lifeVar: 0.3, shape: 0, gravity: 1.5, gain: 0.55, add: 0.06, gold: 0, sustainRate: 10 },
};
const GOLD = [1.0, 0.66, 0.22];
/** Rail colour by multiplier (index 1-4). */
const RAIL_COLORS = [
  new Float32Array([0.5, 0.52, 0.62]),
  new Float32Array([0.5, 0.52, 0.62]),
  new Float32Array([1.4, 0.6, 0.08]),
  new Float32Array([0.15, 1.3, 0.3]),
  new Float32Array([0.9, 0.3, 1.6]),
];
const RAIL_SP = new Float32Array([0.4, 1.3, 2.2]);
const TINT_SP = new Float32Array([0.2, 0.6, 1]);
const TINT_NONE = new Float32Array([0, 0, 0]);
const BEAT_SP = new Float32Array([0.4, 0.8, 1.2]);

const HALF = 2.65;
const LEN = 26;
const BEHIND = 3;
const SUSTAIN_W = 0.13;

export interface RenderState {
  /** song time to draw (already video-calibrated) */
  time: number;
  dt: number;
  /** world units per second */
  speed: number;
  notes: NoteList;
  noteState: Uint8Array;
  spBroken: Uint8Array;
  /** 1 while a sustain is being held */
  sustainHeld: Uint8Array;
  /** time a sustain was dropped, NaN otherwise */
  sustainDrop: Float32Array;
  /** lanes with a sustain currently being held */
  sustainMask: number;
  beats: BeatList;
  frets: number;
  laneHit: Float32Array;
  laneWrong: Float32Array;
  spActive: boolean;
  multiplier: number;
  missPulse: number;
  whammy: number;
  lefty: boolean;
  solo: boolean;
  beatPulse: number;
  /** theme scene parameters (background, highway tint, glow, extras) */
  theme: RenderTheme;
  /** note skin: gem shapes, colours, sustains, particles */
  skin: NoteSkin;
}

interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
  inst: InstanceBuffer;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: GL;
  private readonly hdr: boolean;
  private quality: Quality = 'high';

  private pBg!: Program;
  private pHighway!: Program;
  private pBeat!: Program;
  private pGem!: Program;
  private pButton!: Program;
  private pSustain!: Program;
  private pParticle!: Program;
  private pBright!: Program;
  private pDown!: Program;
  private pUp!: Program;
  private pComposite!: Program;

  private emptyVao!: WebGLVertexArrayObject;
  private highwayVao!: WebGLVertexArrayObject;
  private gems!: Mesh;
  private gemMeshes!: Record<NoteSkin['gem'], Mesh>;
  private buttonMeshes!: Record<NoteSkin['button'], Mesh>;
  private skin: NoteSkin = SKINS.dome;
  private colorsFlat = new Float32Array(SKINS.dome.colors.flat());
  private opens!: Mesh;
  private opensStd!: Mesh;
  private opensDome!: Mesh;
  private buttons!: Mesh;
  private sustains!: Mesh;
  private beatLines!: Mesh;
  private sprites!: Mesh;
  private stripVerts = 0;

  private bgTex: WebGLTexture | null = null;
  private bgAspect = 1;
  private bgLod = 5.5;
  private bgBright = 0.13;
  private video: HTMLVideoElement | null = null;
  private videoFrame = false;

  private msFbo: WebGLFramebuffer | null = null;
  private msColor: WebGLRenderbuffer | null = null;
  private msDepth: WebGLRenderbuffer | null = null;
  private scene: Target | null = null;
  private sceneDepth: WebGLRenderbuffer | null = null;
  private bloom: Target[] = [];
  private samples = 4;

  private width = 0;
  private height = 0;
  private cssW = 0;
  private cssH = 0;
  // Everything below is preallocated: the frame loop must not create garbage.
  vp: Mat4 = new Float32Array(16);
  private readonly proj: Mat4 = new Float32Array(16);
  private readonly view: Mat4 = new Float32Array(16);
  private readonly cam = new Float32Array(3);
  private readonly right = new Float32Array(3);
  private readonly up = new Float32Array(3);
  private readonly lanes = new Float32Array(5);
  private readonly laneCol = new Float32Array(15);
  private camKey = '';
  private sizeDirty = true;
  private resizeObserver: ResizeObserver | null = null;

  readonly particles = new Particles(1800);
  private buttonPress = new Float32Array(5);
  private time = 0;
  private lefty = false;
  /** 1 while the inked dome look is on (Daylight ink theme with the dome note style) */
  private inkGems = 0;
  private inkCol: RenderTheme['inkColor'] = [0.01, 0.009, 0.007];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.init();
    // Read the canvas size only when it changes: reading clientWidth every frame can force a
    // synchronous layout right after the HUD has written styles.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => (this.sizeDirty = true));
      this.resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', this.markDirty);
  }

  private markDirty = () => {
    this.sizeDirty = true;
  };

  private init() {
    const gl = this.gl;
    this.pBg = program(gl, S.FULLSCREEN_VS, S.BACKGROUND_FS);
    this.pHighway = program(gl, S.HIGHWAY_VS, S.HIGHWAY_FS);
    this.pBeat = program(gl, S.BEAT_VS, S.BEAT_FS);
    this.pGem = program(gl, S.LIT_VS, S.GEM_FS);
    this.pButton = program(gl, S.BUTTON_VS, S.BUTTON_FS);
    this.pSustain = program(gl, S.SUSTAIN_VS, S.SUSTAIN_FS);
    this.pParticle = program(gl, S.PARTICLE_VS, S.PARTICLE_FS);
    this.pBright = program(gl, S.FULLSCREEN_VS, S.BRIGHT_FS);
    this.pDown = program(gl, S.FULLSCREEN_VS, S.DOWN_FS);
    this.pUp = program(gl, S.FULLSCREEN_VS, S.UP_FS);
    this.pComposite = program(gl, S.FULLSCREEN_VS, S.COMPOSITE_FS);

    this.emptyVao = gl.createVertexArray()!;

    this.highwayVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.highwayVao);
    staticBuffer(gl, new Float32Array([-HALF, -LEN, HALF, -LEN, -HALF, BEHIND, HALF, BEHIND]), [2]);

    const lit = (mesh: Float32Array, cap: number, instLayout: number[]): Mesh => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      staticBuffer(gl, mesh, [3, 3, 1]);
      const inst = new InstanceBuffer(gl, instLayout, 3, cap);
      return { vao, count: mesh.length / 7, inst };
    };
    // Every skin's meshes are small; build them all now so switching skins costs nothing.
    this.gemMeshes = {
      dome: lit(domeMesh(), 1024, [4, 4]),
      puck: lit(gemMesh(), 1024, [4, 4]),
      disc: lit(discMesh(), 1024, [4, 4]),
      jewel: lit(jewelMesh(), 1024, [4, 4]),
      block: lit(blockMesh(), 1024, [4, 4]),
      pill: lit(pillMesh(), 1024, [4, 4]),
    };
    this.buttonMeshes = {
      wheel: lit(wheelMesh(), 5, [4, 4]),
      ring: lit(fretButtonMesh(), 5, [4, 4]),
      flat: lit(flatButtonMesh(), 5, [4, 4]),
      gold: lit(goldButtonMesh(), 5, [4, 4]),
      square: lit(squareButtonMesh(), 5, [4, 4]),
      soft: lit(softButtonMesh(), 5, [4, 4]),
    };
    this.gems = this.gemMeshes.dome;
    this.buttons = this.buttonMeshes.wheel;
    this.opensStd = lit(openBarMesh(HALF - 0.28), 128, [4, 4]);
    this.opensDome = lit(domeBarMesh(HALF - 0.28), 128, [4, 4]);
    this.opens = this.opensDome;

    const strip = stripMesh(64);
    this.stripVerts = strip.length / 2;
    let vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    staticBuffer(gl, strip, [2]);
    this.sustains = { vao, count: this.stripVerts, inst: new InstanceBuffer(gl, [4, 4], 1, 512) };

    vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    staticBuffer(gl, QUAD, [2]);
    this.beatLines = { vao, count: 4, inst: new InstanceBuffer(gl, [4], 1, 256) };

    vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    staticBuffer(gl, QUAD, [2]);
    this.sprites = { vao, count: 4, inst: new InstanceBuffer(gl, [4, 4, 4], 1, this.particles.max) };
    gl.bindVertexArray(null);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.width = 0; // force target rebuild
    this.sizeDirty = true;
  }

  /** Use a playing <video> as the background (song video backgrounds). */
  setVideo(video: HTMLVideoElement | null): void {
    this.video = video;
    if (!video) return;
    const gl = this.gl;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bgTex = tex;
    this.bgLod = 0;
    this.bgBright = 0.3;
    // Upload only when the decoder has produced a new frame.
    const onFrame = () => {
      if (this.video !== video) return;
      this.videoFrame = true;
      video.requestVideoFrameCallback(onFrame);
    };
    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(onFrame);
  }

  private uploadVideo() {
    const v = this.video;
    if (!v || !this.bgTex || v.readyState < 2) return;
    if (!this.videoFrame && 'requestVideoFrameCallback' in v) return;
    this.videoFrame = false;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (v.videoWidth === this.videoW && v.videoHeight === this.videoH) {
      // Same size: update in place instead of reallocating the texture every frame.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v);
      this.videoW = v.videoWidth;
      this.videoH = v.videoHeight;
      this.bgAspect = this.videoW && this.videoH ? this.videoW / this.videoH : 16 / 9;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private videoW = 0;
  private videoH = 0;

  setBackground(img: TexImageSource | null): void {
    const gl = this.gl;
    if (this.video) return;
    if (this.bgTex) gl.deleteTexture(this.bgTex);
    this.bgTex = null;
    if (!img) return;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    this.bgTex = tex;
    const w = (img as { width: number }).width;
    const h = (img as { height: number }).height;
    this.bgAspect = w && h ? w / h : 1;
  }

  // ---------------------------------------------------------------- sizing

  private resize() {
    const c = this.camera;
    if (c.height !== this.camHeight || c.back !== this.camBack || c.lookZ !== this.camLookZ || c.fov !== this.camFov) this.sizeDirty = true;
    if (!this.sizeDirty) return;
    this.sizeDirty = false;
    const dprCap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.25 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    this.cssW = cssW;
    this.cssH = cssH;
    this.updateCamera();
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.buildTargets();
  }

  /** Camera tuning: eye height/distance and look-at point along the highway. */
  camera = { height: 5.6, back: 7.4, lookZ: -5.2, fov: 0.74 };

  private camHeight = NaN;
  private camBack = NaN;
  private camLookZ = NaN;
  private camFov = NaN;

  private updateCamera() {
    const aspect = this.cssW / Math.max(1, this.cssH);
    const c = this.camera;
    this.camHeight = c.height;
    this.camBack = c.back;
    this.camLookZ = c.lookZ;
    this.camFov = c.fov;
    // Narrow (portrait) screens: pull back so the whole highway width stays visible.
    const pull = aspect < 1.2 ? 1 + (1.2 - aspect) * 0.9 : 1;
    perspective(this.proj, c.fov, aspect, 0.1, 100);
    const v = this.view;
    lookAt(v, 0, c.height * pull, c.back * pull, 0, 0, c.lookZ);
    this.cam[0] = 0;
    this.cam[1] = c.height * pull;
    this.cam[2] = c.back * pull;
    multiply(this.vp, this.proj, v);
    this.right[0] = v[0];
    this.right[1] = v[4];
    this.right[2] = v[8];
    this.up[0] = v[1];
    this.up[1] = v[5];
    this.up[2] = v[9];
    this.camKey = `${this.cssW}x${this.cssH}:${c.height}:${c.back}:${c.lookZ}:${c.fov}`;
  }

  /** Changes whenever the projection changes (for callers caching screen positions). */
  get cameraKey(): string {
    return this.camKey;
  }

  private buildTargets() {
    const gl = this.gl;
    const { width: w, height: h } = this;
    if (this.msFbo) gl.deleteFramebuffer(this.msFbo);
    if (this.msColor) gl.deleteRenderbuffer(this.msColor);
    if (this.msDepth) gl.deleteRenderbuffer(this.msDepth);
    if (this.sceneDepth) gl.deleteRenderbuffer(this.sceneDepth);
    deleteTarget(gl, this.scene);
    for (const t of this.bloom) deleteTarget(gl, t);
    this.msFbo = this.msColor = this.msDepth = this.sceneDepth = null;
    this.bloom = [];

    this.scene = target(gl, w, h, this.hdr);
    const maxSamples = gl.getParameter(gl.MAX_SAMPLES) as number;
    this.samples = this.quality === 'high' ? Math.min(4, maxSamples) : this.quality === 'medium' ? Math.min(2, maxSamples) : 0;
    if (this.samples > 1) {
      this.msFbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msFbo);
      this.msColor = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, this.hdr ? gl.RGBA16F : gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msColor);
      this.msDepth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.msDepth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(this.msFbo);
        this.msFbo = null;
        this.samples = 0;
      }
    }
    if (!this.msFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
      this.sceneDepth = gl.createRenderbuffer()!;
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepth);
    }
    if (this.quality !== 'low') {
      let bw = w >> 1;
      let bh = h >> 1;
      for (let i = 0; i < 6 && bw >= 4 && bh >= 4; i++) {
        this.bloom.push(target(gl, bw, bh, this.hdr));
        bw >>= 1;
        bh >>= 1;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** CSS-pixel position of a world point, written into out, for positioning the DOM HUD. */
  toScreen(x: number, y: number, z: number, out: Float64Array): Float64Array {
    return project(this.vp, x, y, z, this.cssW, this.cssH, out);
  }

  get highwayHalfWidth(): number {
    return HALF;
  }

  laneX(lane: number): number {
    const x = lane - 2;
    return this.lefty ? -x : x;
  }

  // ---------------------------------------------------------------- effects

  private setSkin(skin: NoteSkin) {
    if (skin === this.skin) return;
    this.skin = skin;
    this.colorsFlat = new Float32Array(skin.colors.flat());
    this.gems = this.gemMeshes[skin.gem];
    this.buttons = this.buttonMeshes[skin.button];
    this.opens = skin.style === 5 ? this.opensDome : this.opensStd;
  }

  hitBurst(mask: number, sp: boolean): void {
    const P = this.particles;
    const fx = FX[this.skin.particles];
    const colors = this.skin.colors;
    for (let lane = 0; lane < 5; lane++) {
      if (mask !== 0 && !(mask & (1 << lane))) continue;
      const x = mask === 0 ? 0 : this.laneX(lane);
      const c = sp ? colors[6] : colors[mask === 0 ? 5 : lane];
      const r = c[0] + (GOLD[0] - c[0]) * fx.gold;
      const g = c[1] + (GOLD[1] - c[1]) * fx.gold;
      const b = c[2] + (GOLD[2] - c[2]) * fx.gold;
      const spread = mask === 0 ? HALF - 0.3 : 0.2;
      let i: number;
      if (fx.flare) {
        i = P.alloc();
        setParticle(P, i, x, 0.25, 0.05, 0, 0.1, 0, 0.16, 0.55, 1, 0);
        P.col[i * 3] = r * 2.2;
        P.col[i * 3 + 1] = g * 2.2;
        P.col[i * 3 + 2] = b * 2.2;
      }
      for (let k = 0, n = mask === 0 ? fx.openCount : fx.count; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = (1.5 + Math.random() * 3.5) * fx.speed;
        i = P.alloc();
        const i3 = i * 3;
        P.pos[i3] = x + (Math.random() - 0.5) * spread * 2;
        P.pos[i3 + 1] = 0.2;
        P.pos[i3 + 2] = 0.05;
        P.vel[i3] = Math.cos(a) * v * 0.6;
        P.vel[i3 + 1] = (2.5 + Math.random() * 4) * fx.speed;
        P.vel[i3 + 2] = -Math.abs(Math.sin(a)) * v * 0.5;
        P.col[i3] = r * fx.gain + fx.add;
        P.col[i3 + 1] = g * fx.gain + fx.add;
        P.col[i3 + 2] = b * fx.gain + fx.add;
        P.maxLife[i] = P.life[i] = fx.life + Math.random() * fx.lifeVar;
        P.size[i] = fx.size + Math.random() * fx.sizeVar;
        P.shape[i] = fx.shape;
        P.gravity[i] = fx.gravity;
      }
    }
  }

  sustainSparks(mask: number, sp: boolean, dt: number): void {
    const P = this.particles;
    const fx = FX[this.skin.particles];
    const colors = this.skin.colors;
    const rate = fx.sustainRate * dt;
    for (let lane = 0; lane < 5; lane++) {
      if (!(mask & (1 << lane))) continue;
      const c = sp ? colors[6] : colors[lane];
      const x = this.laneX(lane);
      for (let k = 0; k < rate; k++) {
        if (Math.random() > rate - k) break;
        const i = P.alloc();
        const i3 = i * 3;
        P.pos[i3] = x + (Math.random() - 0.5) * 0.3;
        P.pos[i3 + 1] = 0.12;
        P.pos[i3 + 2] = 0.02;
        P.vel[i3] = (Math.random() - 0.5) * 1.5 * fx.speed;
        P.vel[i3 + 1] = (1.8 + Math.random() * 2.5) * fx.speed;
        P.vel[i3 + 2] = -Math.random() * 1.2 * fx.speed;
        P.col[i3] = (c[0] + (GOLD[0] - c[0]) * fx.gold) * fx.gain + fx.add * 0.7;
        P.col[i3 + 1] = (c[1] + (GOLD[1] - c[1]) * fx.gold) * fx.gain + fx.add * 0.7;
        P.col[i3 + 2] = (c[2] + (GOLD[2] - c[2]) * fx.gold) * fx.gain + fx.add * 0.7;
        P.maxLife[i] = P.life[i] = (fx.life + Math.random() * fx.lifeVar) * 0.8;
        P.size[i] = (fx.size + Math.random() * fx.sizeVar) * 0.8;
        P.shape[i] = fx.shape;
        P.gravity[i] = fx.gravity;
      }
    }
  }

  starPowerBurst(): void {
    const P = this.particles;
    for (let k = 0; k < 220; k++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const i = P.alloc();
      const i3 = i * 3;
      P.pos[i3] = side * HALF;
      P.pos[i3 + 1] = 0.1;
      P.pos[i3 + 2] = -Math.random() * 14;
      P.vel[i3] = side * (1 + Math.random() * 2);
      P.vel[i3 + 1] = 2 + Math.random() * 4;
      P.vel[i3 + 2] = 0;
      P.col[i3] = 0.5;
      P.col[i3 + 1] = 1.2;
      P.col[i3 + 2] = 2.2;
      P.maxLife[i] = P.life[i] = 0.5 + Math.random() * 0.5;
      P.size[i] = 0.08 + Math.random() * 0.08;
      P.shape[i] = 0;
      P.gravity[i] = -4;
    }
  }

  /**
   * Draw a throwaway frame that exercises every program, blend mode and target, so drivers finish
   * compiling pipelines during loading instead of hitching on the first hit, open note or star power.
   */
  warmUp(beats: BeatList): void {
    const notes = noteListOf([
      { time: 0.1, mask: 1, type: 0, endTime: 0.6 },
      { time: 0.3, mask: 2, type: 1, sp: 0 },
      { time: 0.5, mask: 4, type: 2 },
      { time: 0.7, mask: 0, type: 0, endTime: 1.1 },
      { time: 0.9, mask: 8, type: 0, endTime: 1.5 },
    ]);
    const state: RenderState = {
      time: 0.2, dt: 0.016, speed: 11, notes,
      noteState: new Uint8Array([1, 0, 0, 2, 1]), spBroken: new Uint8Array(1),
      sustainHeld: new Uint8Array([1, 0, 0, 0, 0]), sustainDrop: new Float32Array([NaN, NaN, NaN, NaN, 0.1]), sustainMask: 1,
      beats, frets: 1, laneHit: new Float32Array(5).fill(1), laneWrong: new Float32Array(5).fill(1),
      spActive: false, multiplier: 4, missPulse: 1, whammy: 0.5, lefty: false, solo: true, beatPulse: 1, theme: DEFAULT_RENDER_THEME, skin: this.skin,
    };
    this.hitBurst(1, false);
    this.render(state);
    state.spActive = true;
    this.render(state);
    // the inked look takes other branches of the same programs
    state.spActive = false;
    state.theme = { ...DEFAULT_RENDER_THEME, light: true, ink: 1, board: 0, railColor: [0.01, 0.01, 0.01] };
    this.render(state);
    state.theme = { ...DEFAULT_RENDER_THEME, board: 1, railColor: [0.55, 0.53, 0.5] };
    this.render(state);
    this.particles.count = 0;
    this.gl.finish();
  }

  // ---------------------------------------------------------------- frame

  render(s: RenderState): void {
    const gl = this.gl;
    this.lefty = s.lefty;
    this.time = s.time;
    this.setSkin(s.skin);
    this.inkGems = s.theme.ink > 0.5 && s.skin.style === 5 ? 1 : 0;
    this.inkCol = s.theme.inkColor;
    this.resize();
    this.particles.update(s.dt);

    const fbo = this.msFbo ?? this.scene!.fbo;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);

    this.drawBackground(s);
    this.drawHighway(s);
    this.drawBeats(s);
    this.fillNotes(s);
    this.drawSustains();
    this.drawButtons(s);
    this.drawGems();
    this.drawParticles();

    if (this.msFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scene!.fbo);
      gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    this.post(s);
  }

  private uniforms(p: Program) {
    const gl = this.gl;
    gl.useProgram(p.prog);
    if (p.u.u_vp) gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
    if (p.u.u_len) gl.uniform1f(p.u.u_len, LEN);
    if (p.u.u_time) gl.uniform1f(p.u.u_time, this.time);
    if (p.u.u_cam) gl.uniform3fv(p.u.u_cam, this.cam);
    if (p.u.u_colors) gl.uniform3fv(p.u.u_colors, this.colorsFlat);
    if (p.u.u_style) gl.uniform1f(p.u.u_style, this.skin.style);
    if (p.u.u_half) gl.uniform1f(p.u.u_half, HALF);
    if (p.u.u_ink) gl.uniform1f(p.u.u_ink, this.inkGems);
    if (p.u.u_inkCol) gl.uniform3f(p.u.u_inkCol, this.inkCol[0], this.inkCol[1], this.inkCol[2]);
    if (p.u.u_dpr) gl.uniform1f(p.u.u_dpr, this.width / Math.max(1, this.cssW));
    if (p.u.u_openL) gl.uniform1f(p.u.u_openL, HALF - 0.28 - OPEN_R);
  }

  private drawBackground(s: RenderState) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const p = this.pBg;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTex);
    gl.uniform1i(p.u.u_tex, 0);
    this.uploadVideo();
    gl.uniform1f(p.u.u_hasTex, this.bgTex ? 1 : 0);
    gl.uniform1f(p.u.u_lod, this.bgLod);
    gl.uniform1f(p.u.u_bright, this.bgBright);
    const th = s.theme;
    gl.uniform1f(p.u.u_light, th.light ? 1 : 0);
    gl.uniform3f(p.u.u_top, th.bgTop[0], th.bgTop[1], th.bgTop[2]);
    gl.uniform3f(p.u.u_bottom, th.bgBottom[0], th.bgBottom[1], th.bgBottom[2]);
    gl.uniform1f(p.u.u_art, th.art);
    gl.uniform1f(p.u.u_grid, th.grid);
    gl.uniform1f(p.u.u_pattern, th.pattern);
    gl.uniform1f(p.u.u_flat, th.ink);
    const screenAspect = this.cssW / Math.max(1, this.cssH);
    const r = screenAspect / this.bgAspect;
    gl.uniform2f(p.u.u_cover, r > 1 ? 1 : r, r > 1 ? 1 / r : 1);
    gl.uniform1f(p.u.u_time, s.time);
    gl.uniform1f(p.u.u_beat, s.beatPulse);
    gl.uniform3fv(p.u.u_tint, s.spActive ? TINT_SP : TINT_NONE);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawHighway(s: RenderState) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.pHighway;
    this.uniforms(p);
    gl.uniform1f(p.u.u_speed, s.speed);
    const th = s.theme;
    // rails: steel or ink when the theme fixes their colour, otherwise coloured by multiplier
    if (s.spActive) gl.uniform3fv(p.u.u_rail, RAIL_SP);
    else if (th.railColor) gl.uniform3f(p.u.u_rail, th.railColor[0], th.railColor[1], th.railColor[2]);
    else gl.uniform3fv(p.u.u_rail, RAIL_COLORS[Math.min(4, s.multiplier)]);
    gl.uniform1f(p.u.u_railMode, railMode(th));
    gl.uniform1f(p.u.u_board, th.board);
    gl.uniform1f(p.u.u_sp, s.spActive ? 1 : 0);
    gl.uniform1f(p.u.u_miss, s.missPulse);
    gl.uniform1f(p.u.u_solo, s.solo ? 1 : 0);
    const tint = th.highwayTint;
    gl.uniform3f(p.u.u_tint, tint[0], tint[1], tint[2]);
    gl.uniform3f(p.u.u_hwFar, th.hwFar[0], th.hwFar[1], th.hwFar[2]);
    gl.uniform3f(p.u.u_hwNear, th.hwNear[0], th.hwNear[1], th.hwNear[2]);
    gl.uniform3f(p.u.u_laneLine, th.laneLine[0], th.laneLine[1], th.laneLine[2]);
    gl.uniform3f(p.u.u_strike, th.strike[0], th.strike[1], th.strike[2]);
    const lanes = this.lanes;
    const laneCol = this.laneCol;
    for (let i = 0; i < 5; i++) {
      const slot = this.lefty ? 4 - i : i;
      lanes[slot] = this.buttonPress[i];
      const col = this.skin.colors[i];
      laneCol[slot * 3] = col[0];
      laneCol[slot * 3 + 1] = col[1];
      laneCol[slot * 3 + 2] = col[2];
    }
    gl.uniform1fv(p.u.u_lanes, lanes);
    gl.uniform3fv(p.u.u_laneCol, laneCol);
    gl.bindVertexArray(this.highwayVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawBeats(s: RenderState) {
    const gl = this.gl;
    const inst = this.beatLines.inst;
    inst.count = 0;
    const tMin = s.time - BEHIND / s.speed;
    const tMax = s.time + LEN / s.speed;
    const B = s.beats;
    for (let i = lowerBound(B.time, B.length, tMin); i < B.length && B.time[i] <= tMax; i++) {
      const o = inst.push();
      if (o < 0) break;
      const d = inst.data;
      const measure = B.kind[i] === 0;
      d[o] = -(B.time[i] - s.time) * s.speed;
      d[o + 1] = measure ? 0.045 : 0.022;
      d[o + 2] = measure ? 0.55 : 0.2;
      d[o + 3] = 0;
    }
    if (!inst.count) return;
    inst.upload();
    // Premultiplied: with alpha 0 this is additive glow, with alpha > 0 lines paint over (light highways).
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const p = this.pBeat;
    this.uniforms(p);
    const th = s.theme;
    const glowSp = s.spActive && th.ink < 0.5;
    if (glowSp) gl.uniform3fv(p.u.u_col, BEAT_SP);
    else gl.uniform3f(p.u.u_col, th.beat[0], th.beat[1], th.beat[2]);
    gl.uniform1f(p.u.u_over, glowSp ? 0 : th.beatOver);
    gl.uniform1f(p.u.u_mode, railMode(th));
    gl.bindVertexArray(this.beatLines.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, inst.count);
  }

  private fillNotes(s: RenderState) {
    const gems = this.gems.inst;
    const opens = this.opens.inst;
    const sus = this.sustains.inst;
    gems.count = opens.count = sus.count = 0;
    const notes = s.notes;
    const speed = s.speed;
    const t = s.time;
    const tMax = t + LEN / speed;
    const tBehind = t - BEHIND / speed;

    // Sustains can start well before the visible window, so walk back a little.
    const T = notes.time;
    let i = lowerBound(T, notes.length, tBehind - 8);
    for (; i < notes.length && T[i] <= tMax; i++) {
      const time = T[i];
      const endTime = notes.endTime[i];
      const mask = notes.mask[i];
      const type = notes.type[i];
      const spIdx = notes.sp[i];
      const st = s.noteState[i];
      const sp = spIdx >= 0 && !s.spBroken[spIdx];

      if (endTime > time && endTime >= tBehind) {
        let z0 = -(time - t) * speed;
        let state = 0;
        let draw = true;
        if (st === HIT) {
          if (s.sustainHeld[i]) {
            z0 = 0;
            state = 1;
          } else if (!Number.isNaN(s.sustainDrop[i])) {
            z0 = Math.min(-(s.sustainDrop[i] - t) * speed, BEHIND);
            state = 2;
          } else draw = false;
        } else if (st === MISSED) state = 2;
        const z1 = Math.max(-(endTime - t) * speed, -LEN);
        if (draw && z0 > z1) {
          for (let lane = 0; lane < 5; lane++) {
            if (mask !== 0 && !(mask & (1 << lane))) continue;
            const o = sus.push();
            if (o < 0) break;
            const d = sus.data;
            d[o] = mask === 0 ? 0 : this.laneX(lane);
            d[o + 1] = z0;
            d[o + 2] = z1;
            d[o + 3] = mask === 0 ? HALF - 0.4 : SUSTAIN_W;
            d[o + 4] = mask === 0 ? 5 : lane;
            d[o + 5] = state;
            d[o + 6] = s.whammy;
            d[o + 7] = sp ? 1 : 0;
            if (mask === 0) break;
          }
        }
      }

      if (time < tBehind || st === HIT) continue;
      const z = -(time - t) * speed;
      const flags = (sp ? 1 : 0) + (st === MISSED ? 2 : 0);
      if (mask === 0) {
        const o = opens.push();
        if (o < 0) continue;
        const d = opens.data;
        d[o] = 0;
        d[o + 1] = 0;
        d[o + 2] = z;
        d[o + 3] = 1;
        d[o + 4] = 5;
        d[o + 5] = type === HOPO ? 1 : 3;
        d[o + 6] = flags;
        d[o + 7] = 0;
      } else {
        for (let lane = 0; lane < 5; lane++) {
          if (!(mask & (1 << lane))) continue;
          const o = gems.push();
          if (o < 0) break;
          const d = gems.data;
          d[o] = this.laneX(lane);
          d[o + 1] = 0;
          d[o + 2] = z;
          d[o + 3] = 1;
          d[o + 4] = lane;
          d[o + 5] = type === TAP ? 2 : type === HOPO ? 1 : 0;
          d[o + 6] = flags;
          d[o + 7] = 0;
        }
      }
    }
  }

  private drawSustains() {
    const gl = this.gl;
    const inst = this.sustains.inst;
    if (!inst.count) return;
    inst.upload();
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.uniforms(this.pSustain);
    gl.bindVertexArray(this.sustains.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, this.stripVerts, inst.count);
    gl.depthMask(true);
  }

  private drawButtons(s: RenderState) {
    const gl = this.gl;
    const inst = this.buttons.inst;
    inst.count = 0;
    const k = 1 - Math.exp(-s.dt * 40);
    for (let lane = 0; lane < 5; lane++) {
      const pressed = s.frets & (1 << lane) ? 1 : 0;
      this.buttonPress[lane] += (pressed - this.buttonPress[lane]) * k;
      const holding = s.sustainMask & (1 << lane) ? 1 : 0;
      const o = inst.push();
      const d = inst.data;
      d[o] = this.laneX(lane);
      d[o + 1] = lane;
      d[o + 2] = this.buttonPress[lane];
      d[o + 3] = s.laneHit[lane];
      d[o + 4] = s.laneWrong[lane];
      d[o + 5] = holding;
      d[o + 6] = 0;
      d[o + 7] = 0;
    }
    inst.upload();
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.uniforms(this.pButton);
    gl.bindVertexArray(this.buttons.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.buttons.count, inst.count);
  }

  private drawGems() {
    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    const p = this.pGem;
    this.uniforms(p);
    gl.uniform1f(p.u.u_hopoScale, this.skin.hopoScale);
    // Blended so distant gems fade into whatever is behind them (light themes included).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawMesh(this.gems);
    this.drawMesh(this.opens);
  }

  private drawMesh(mesh: Mesh) {
    if (!mesh.inst.count) return;
    const gl = this.gl;
    mesh.inst.upload();
    gl.bindVertexArray(mesh.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.count, mesh.inst.count);
  }

  private drawParticles() {
    const gl = this.gl;
    const P = this.particles;
    const inst = this.sprites.inst;
    inst.count = 0;
    for (let i = 0; i < P.count; i++) {
      const o = inst.push();
      if (o < 0) break;
      const d = inst.data;
      const lifeT = P.life[i] / P.maxLife[i];
      d[o] = P.pos[i * 3];
      d[o + 1] = P.pos[i * 3 + 1];
      d[o + 2] = P.pos[i * 3 + 2];
      d[o + 3] = P.size[i] * (P.shape[i] === 1 ? 1 + (1 - lifeT) * 0.6 : 0.5 + lifeT * 0.5);
      d[o + 4] = P.col[i * 3];
      d[o + 5] = P.col[i * 3 + 1];
      d[o + 6] = P.col[i * 3 + 2];
      d[o + 7] = P.shape[i] === 1 ? lifeT * lifeT : lifeT;
      d[o + 8] = 1;
      d[o + 9] = P.shape[i] === 1 ? 1.8 : 1;
      d[o + 10] = P.shape[i];
      d[o + 11] = 0;
    }
    if (!inst.count) return;
    inst.upload();
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const p = this.pParticle;
    this.uniforms(p);
    gl.uniform3fv(p.u.u_right, this.right);
    gl.uniform3fv(p.u.u_up, this.up);
    gl.bindVertexArray(this.sprites.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, inst.count);
  }

  private fullscreen(p: Program, tex: WebGLTexture, t: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : this.width, t ? t.h : this.height);
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(p.u.u_src ?? p.u.u_scene, 0);
    gl.bindVertexArray(this.emptyVao);
  }

  private post(s: RenderState) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const scene = this.scene!;
    const B = this.bloom;
    if (B.length) {
      this.fullscreen(this.pBright, scene.tex, B[0]);
      gl.uniform2f(this.pBright.u.u_texel, 1 / scene.w, 1 / scene.h);
      // A light background sits near 1.0 and must not bloom; the neon on the highway still does.
      // The dome look is authored to sit at its design colours, so only real emission (pressed wheels, star power, held sustains) blooms.
      const dome = s.skin.style === 5;
      gl.uniform1f(this.pBright.u.u_threshold, s.theme.light ? (this.hdr ? 1.35 : 0.95) : dome ? (this.hdr ? 1.5 : 0.95) : this.hdr ? 1.0 : 0.75);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (let i = 1; i < B.length; i++) {
        this.fullscreen(this.pDown, B[i - 1].tex, B[i]);
        gl.uniform2f(this.pDown.u.u_texel, 1 / B[i - 1].w, 1 / B[i - 1].h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = B.length - 1; i > 0; i--) {
        this.fullscreen(this.pUp, B[i].tex, B[i - 1]);
        gl.uniform2f(this.pUp.u.u_texel, 1 / B[i].w, 1 / B[i].h);
        gl.uniform1f(this.pUp.u.u_weight, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    const p = this.pComposite;
    this.fullscreen(p, scene.tex, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, B.length ? B[0].tex : scene.tex);
    gl.uniform1i(p.u.u_bloom, 1);
    gl.uniform1f(p.u.u_bloomAmt, B.length ? s.theme.bloom : 0);
    // the Classic board keeps the page dark: its screen-edge flood and drain are toned down
    gl.uniform1f(p.u.u_miss, s.missPulse * (s.theme.board > 0.5 ? 0.45 : 1));
    gl.uniform1f(p.u.u_sp, s.spActive ? (s.theme.board > 0.5 ? 0.3 : 1) : 0);
    gl.uniform1f(p.u.u_vignette, s.theme.vignette);
    gl.uniform1f(p.u.u_scan, s.theme.scanlines);
    gl.uniform1f(p.u.u_flat, s.theme.ink);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.markDirty);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** How the highway draws its rails, beat and strike lines: 0 glow, 1 steel, 2 ink. */
function railMode(th: RenderTheme): number {
  return th.railColor ? (th.ink > 0.5 ? 2 : 1) : 0;
}

/** Used for rare, fixed-value particles only (constants do not need boxing). */
function setParticle(P: Particles, i: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, shape: number, gravity: number) {
  const i3 = i * 3;
  P.pos[i3] = x;
  P.pos[i3 + 1] = y;
  P.pos[i3 + 2] = z;
  P.vel[i3] = vx;
  P.vel[i3 + 1] = vy;
  P.vel[i3 + 2] = vz;
  P.maxLife[i] = P.life[i] = life;
  P.size[i] = size;
  P.shape[i] = shape;
  P.gravity[i] = gravity;
}

/** First index in a sorted array whose value is >= t. */
function lowerBound(a: Float64Array, n: number, t: number): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
