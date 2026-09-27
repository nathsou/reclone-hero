// Column-major 4x4 matrix helpers. All write into caller-owned arrays so the frame loop allocates nothing.
export type Mat4 = Float32Array;

export function perspective(out: Mat4, fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

/** View matrix looking from eye to target with +Y up. */
export function lookAt(out: Mat4, ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): Mat4 {
  let zx = ex - tx;
  let zy = ey - ty;
  let zz = ez - tz;
  let l = Math.hypot(zx, zy, zz);
  zx /= l;
  zy /= l;
  zz /= l;
  // x = up(0,1,0) × z
  let xx = zz;
  let xy = 0;
  let xz = -zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l;
  xy /= l;
  xz /= l;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * ex + xy * ey + xz * ez);
  out[13] = -(yx * ex + yy * ey + yz * ez);
  out[14] = -(zx * ex + zy * ey + zz * ez);
  out[15] = 1;
  return out;
}

export function multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

/** Project a world point to CSS pixels, writing [x, y] into out. */
export function project(m: Mat4, x: number, y: number, z: number, width: number, height: number, out: Float64Array): Float64Array {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  out[0] = ((cx / w) * 0.5 + 0.5) * width;
  out[1] = (1 - ((cy / w) * 0.5 + 0.5)) * height;
  return out;
}
