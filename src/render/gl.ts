export type GL = WebGL2RenderingContext;

export interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation>;
}

function compile(gl: GL, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error(`Shader compile failed: ${log}\n${numbered}`);
  }
  return s;
}

export const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

export function program(gl: GL, vs: string, fs: string, attribs: string[] = []): Program {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, HEADER + vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, HEADER + fs));
  attribs.forEach((name, i) => gl.bindAttribLocation(prog, i, name));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  const u: Record<string, WebGLUniformLocation> = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i)!;
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, info.name)!;
  }
  return { prog, u };
}

/** Static vertex buffer bound to consecutive attribute locations. */
export function staticBuffer(gl: GL, data: Float32Array, layout: number[], firstLoc = 0): WebGLBuffer {
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const stride = layout.reduce((a, b) => a + b, 0) * 4;
  let off = 0;
  layout.forEach((size, i) => {
    gl.enableVertexAttribArray(firstLoc + i);
    gl.vertexAttribPointer(firstLoc + i, size, gl.FLOAT, false, stride, off);
    off += size * 4;
  });
  return buf;
}

/** Per-instance dynamic buffer. */
export class InstanceBuffer {
  readonly buf: WebGLBuffer;
  data: Float32Array;
  readonly floatsPer: number;
  count = 0;
  private readonly gl: GL;

  constructor(gl: GL, layout: number[], firstLoc: number, capacity: number) {
    this.gl = gl;
    this.floatsPer = layout.reduce((a, b) => a + b, 0);
    this.data = new Float32Array(this.floatsPer * capacity);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = this.floatsPer * 4;
    let off = 0;
    layout.forEach((size, i) => {
      gl.enableVertexAttribArray(firstLoc + i);
      gl.vertexAttribPointer(firstLoc + i, size, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(firstLoc + i, 1);
      off += size * 4;
    });
  }

  get capacity(): number {
    return this.data.length / this.floatsPer;
  }

  /** Returns the write offset for a new instance, or -1 when full. */
  push(): number {
    if (this.count >= this.capacity) return -1;
    return this.count++ * this.floatsPer;
  }

  upload(): void {
    if (!this.count) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * this.floatsPer);
  }
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export function colorTexture(gl: GL, w: number, h: number, hdr: boolean): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function target(gl: GL, w: number, h: number, hdr: boolean, depth = false): Target {
  const tex = colorTexture(gl, w, h, hdr);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (depth) {
    const rb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

export function deleteTarget(gl: GL, t: Target | null): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
}
