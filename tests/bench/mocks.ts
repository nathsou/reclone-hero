// Minimal stand-ins for WebGL2, the DOM, Web Audio and window, so the real game loop can run in Node
// under V8 with precise heap accounting. Mocks are allocation-free on hot paths (plain functions, no
// Proxies), so any garbage measured comes from game code.

export const clock = { now: 0 };

const noop = () => undefined;

// ---------------------------------------------------------------- WebGL2
const GL_CONSTANTS = [
  'ACTIVE_UNIFORMS', 'ARRAY_BUFFER', 'BLEND', 'CLAMP_TO_EDGE', 'COLOR_ATTACHMENT0', 'COLOR_BUFFER_BIT', 'COMPILE_STATUS',
  'CULL_FACE', 'DEPTH_ATTACHMENT', 'DEPTH_BUFFER_BIT', 'DEPTH_COMPONENT24', 'DEPTH_TEST', 'DRAW_FRAMEBUFFER', 'DYNAMIC_DRAW',
  'FLOAT', 'FRAGMENT_SHADER', 'FRAMEBUFFER', 'FRAMEBUFFER_COMPLETE', 'HALF_FLOAT', 'LINEAR', 'LINEAR_MIPMAP_LINEAR',
  'LINK_STATUS', 'MAX_SAMPLES', 'MIRRORED_REPEAT', 'NEAREST', 'ONE', 'ONE_MINUS_SRC_ALPHA', 'READ_FRAMEBUFFER', 'RENDERBUFFER',
  'RGBA', 'RGBA16F', 'RGBA8', 'SRC_ALPHA', 'STATIC_DRAW', 'TEXTURE0', 'TEXTURE1', 'TEXTURE_2D', 'TEXTURE_MAG_FILTER',
  'TEXTURE_MIN_FILTER', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'TRIANGLES', 'TRIANGLE_STRIP', 'UNPACK_FLIP_Y_WEBGL',
  'UNSIGNED_BYTE', 'VERTEX_SHADER',
];
const GL_NOOPS = [
  'activeTexture', 'bindAttribLocation', 'bindBuffer', 'bindFramebuffer', 'bindRenderbuffer', 'bindTexture',
  'bindVertexArray', 'blendFunc', 'blitFramebuffer', 'bufferData', 'bufferSubData', 'clear', 'clearColor', 'compileShader',
  'deleteFramebuffer', 'deleteRenderbuffer', 'deleteTexture', 'depthMask', 'disable', 'drawArrays', 'drawArraysInstanced',
  'enable', 'enableVertexAttribArray', 'framebufferRenderbuffer', 'framebufferTexture2D', 'generateMipmap', 'linkProgram',
  'pixelStorei', 'renderbufferStorage', 'renderbufferStorageMultisample', 'texImage2D', 'texSubImage2D', 'texParameteri',
  'uniform1f', 'uniform1fv', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform3fv', 'uniform4fv', 'uniformMatrix4fv', 'useProgram', 'vertexAttribDivisor',
  'vertexAttribPointer', 'viewport', 'deleteBuffer', 'deleteProgram', 'deleteShader', 'finish',
];

export function mockGL(): Record<string, unknown> {
  const gl: Record<string, unknown> = {};
  GL_CONSTANTS.forEach((c, i) => (gl[c] = 0x1000 + i));
  for (const f of GL_NOOPS) gl[f] = noop;
  const create = () => ({});
  for (const f of ['createBuffer', 'createFramebuffer', 'createRenderbuffer', 'createTexture', 'createVertexArray']) gl[f] = create;
  gl.createShader = () => ({ src: '' });
  gl.createProgram = () => ({ shaders: [] as { src: string }[] });
  gl.shaderSource = (s: { src: string }, src: string) => (s.src = src);
  gl.attachShader = (p: { shaders: unknown[] }, s: unknown) => p.shaders.push(s);
  gl.getShaderParameter = () => true;
  gl.getProgramParameter = (p: { shaders: { src: string }[]; uniforms?: string[] }, pname: number) => {
    if (pname !== gl.ACTIVE_UNIFORMS) return true;
    const names = new Set<string>();
    for (const s of p.shaders) for (const m of s.src.matchAll(/uniform\s+\w+\s+(\w+)(\[\d+\])?/g)) names.add(m[1] + (m[2] ? '[0]' : ''));
    p.uniforms = [...names];
    return p.uniforms.length;
  };
  gl.getActiveUniform = (p: { uniforms: string[] }, i: number) => ({ name: p.uniforms[i] });
  gl.getUniformLocation = () => ({});
  gl.getShaderInfoLog = () => '';
  gl.getProgramInfoLog = () => '';
  gl.getExtension = () => ({ loseContext: noop });
  gl.getParameter = () => 4;
  gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_COMPLETE;
  return gl;
}

// ---------------------------------------------------------------- DOM
class FakeClassList {
  private s = new Set<string>();
  add(c: string) { this.s.add(c); }
  remove(c: string) { this.s.delete(c); }
  toggle(c: string, on?: boolean) { if (on ?? !this.s.has(c)) this.s.add(c); else this.s.delete(c); }
  contains(c: string) { return this.s.has(c); }
}

export class FakeNode {
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  style: Record<string, unknown> = { setProperty: noop };
  classList = new FakeClassList();
  className = '';
  dataset: Record<string, string> = {};
  private _text = '';
  get textContent() { return this._text; }
  set textContent(v: string) { this._text = v; }
  get offsetWidth() { return 0; }
  get firstChild() { return this.children[0] ?? null; }
  get firstElementChild() { return this.children[0] ?? null; }
  append(...nodes: unknown[]) {
    for (const n of nodes) if (n instanceof FakeNode) { n.parent = this; this.children.push(n); }
  }
  replaceChildren(...nodes: unknown[]) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  setAttribute() {}
  addEventListener() {}
  removeAttribute() {}
  getContext() { return null; }
}

// ---------------------------------------------------------------- Web Audio
function param(v = 1) {
  return { value: v, setValueAtTime: noop, setTargetAtTime: noop, cancelScheduledValues: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop };
}
function audioNode() {
  return { gain: param(), frequency: param(20000), Q: param(), detune: param(0), type: '', connect: (x: unknown) => x, disconnect: noop };
}
class FakeAudioContext {
  sampleRate = 48000;
  state = 'running';
  destination = {};
  outputLatency = 0;
  baseLatency = 0;
  get currentTime() { return clock.now / 1000; }
  createGain = audioNode;
  createBiquadFilter = audioNode;
  createBuffer(ch: number, len: number, sr: number) {
    return { length: len, duration: len / sr, numberOfChannels: ch, sampleRate: sr, copyToChannel: noop, getChannelData: () => new Float32Array(len) };
  }
  createBufferSource() {
    return { buffer: null, detune: param(0), playbackRate: param(1), connect: (x: unknown) => x, disconnect: noop, start: noop, stop: noop };
  }
  getOutputTimestamp() {
    return { contextTime: clock.now / 1000, performanceTime: clock.now };
  }
  resume() { return Promise.resolve(); }
}

// ---------------------------------------------------------------- window
export const rafQueue: ((t: number) => void)[] = [];

export function install(): void {
  const g = globalThis as Record<string, unknown>;
  const store = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  g.Node = FakeNode;
  g.document = {
    documentElement: new FakeNode(),
    createElement: () => new FakeNode(),
    createTextNode: (data: string) => Object.assign(new FakeNode(), { data }),
    body: new FakeNode(),
  };
  g.AudioContext = FakeAudioContext;
  g.requestAnimationFrame = (cb: (t: number) => void) => (rafQueue.push(cb), rafQueue.length);
  g.cancelAnimationFrame = noop;
  const nav = g.navigator as Record<string, unknown> | undefined;
  const getGamepads = () => [null, null, null, null];
  if (nav) Object.defineProperty(nav, 'getGamepads', { value: getGamepads, configurable: true });
  else g.navigator = { getGamepads };
  g.window = Object.assign(g, {
    devicePixelRatio: 2,
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener: noop,
    removeEventListener: noop,
    setInterval: () => 0,
    clearInterval: noop,
  });
}

export function mockCanvas(gl: Record<string, unknown>) {
  const c = new FakeNode() as FakeNode & { width: number; height: number; clientWidth: number; clientHeight: number };
  c.width = c.height = 0;
  c.clientWidth = 1600;
  c.clientHeight = 900;
  (c as unknown as { getContext: () => unknown }).getContext = () => gl;
  return c;
}
