// Procedural meshes. Vertex layout for lit meshes: position(3) normal(3) region(1).

type ProfileSeg = { from: [number, number]; to: [number, number]; region: number };

/**
 * Revolve an (r, y) profile around the Y axis. zScale squashes the result front-to-back.
 * With `faceted`, each radial slice gets one flat normal (cut-gem look) instead of a smooth one.
 */
function lathe(segs: ProfileSeg[], radial: number, zScale: number, faceted = false): Float32Array {
  const out: number[] = [];
  for (const seg of segs) {
    const [r0, y0] = seg.from;
    const [r1, y1] = seg.to;
    let nr = -(y1 - y0);
    let ny = r1 - r0;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l;
    ny /= l;
    for (let j = 0; j < radial; j++) {
      const a0 = (j / radial) * Math.PI * 2;
      const a1 = ((j + 1) / radial) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const v = (r: number, y: number, a: number) => {
        const c = Math.cos(faceted ? mid : a);
        const s = Math.sin(faceted ? mid : a);
        const pc = Math.cos(a);
        const ps = Math.sin(a);
        // normal of a squashed surface: scale the z component inversely
        let nx = nr * c;
        let nz = (nr * s) / zScale;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        nz /= nl;
        out.push(r * pc, y, r * ps * zScale, nx, ny / nl, nz, seg.region);
      };
      v(r0, y0, a0);
      v(r1, y1, a0);
      v(r1, y1, a1);
      v(r0, y0, a0);
      v(r1, y1, a1);
      v(r0, y0, a1);
    }
  }
  return new Float32Array(out);
}

function chain(points: [number, number][], region: number): ProfileSeg[] {
  const segs: ProfileSeg[] = [];
  for (let i = 0; i + 1 < points.length; i++) segs.push({ from: points[i], to: points[i + 1], region });
  return segs;
}

/** Note gem: body (region 0), raised rim (1), center cap (2). */
export function gemMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.2], [0.16, 0.2]], 2),
      ...chain([[0.16, 0.2], [0.2, 0.235], [0.32, 0.235], [0.36, 0.205]], 1),
      ...chain([[0.36, 0.205], [0.42, 0.15], [0.44, 0.08], [0.42, 0.02], [0.38, 0], [0, 0]], 0),
    ],
    40,
    0.72,
  );
}

/** Strike-line fret button: outer ring (0), inner well (1). */
export function fretButtonMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.012], [0.29, 0.012]], 1),
      ...chain([[0.29, 0.012], [0.33, 0.06], [0.43, 0.065], [0.47, 0.03], [0.47, 0]], 0),
    ],
    40,
    0.72,
  );
}

/** Open note: a bar spanning all lanes. Top face is region 1. */
export function openBarMesh(halfWidth: number): Float32Array {
  const section: [number, number, number][] = [
    // z, y, region of the segment starting here
    [0.17, 0.0, 0],
    [0.21, 0.08, 0],
    [0.16, 0.16, 1],
    [-0.16, 0.16, 0],
    [-0.21, 0.08, 0],
    [-0.17, 0.0, 0],
  ];
  const out: number[] = [];
  const n = section.length;
  for (let i = 0; i < n; i++) {
    const [z0, y0, region] = section[i];
    const [z1, y1] = section[(i + 1) % n];
    let nz = y1 - y0;
    let ny = -(z1 - z0);
    const l = Math.hypot(nz, ny) || 1;
    nz /= l;
    ny /= l;
    const x0 = -halfWidth;
    const x1 = halfWidth;
    const v = (x: number, y: number, z: number) => out.push(x, y, z, 0, ny, nz, region);
    v(x0, y0, z0);
    v(x1, y0, z0);
    v(x1, y1, z1);
    v(x0, y0, z0);
    v(x1, y1, z1);
    v(x0, y1, z1);
  }
  // end caps
  for (const [x, nx] of [
    [-halfWidth, -1],
    [halfWidth, 1],
  ]) {
    for (let i = 1; i + 1 < n; i++) {
      for (const k of [0, i, i + 1]) out.push(x, section[k][1], section[k][0], nx, 0, 0, 0);
    }
  }
  return new Float32Array(out);
}

/** Triangle strip along a sustain: (s along length 0..1, u across -1..1). */
export function stripMesh(segments: number): Float32Array {
  const out: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    out.push(s, -1, s, 1);
  }
  return new Float32Array(out);
}

export const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

// ---------------------------------------------------------------- skin variants

/** Swiss: a flat disc. Regions: outer band (0), inner ring (1), centre (2). */
export function discMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.1], [0.17, 0.1]], 2),
      ...chain([[0.17, 0.1], [0.31, 0.1]], 1),
      ...chain([[0.31, 0.1], [0.43, 0.1], [0.43, 0], [0, 0]], 0),
    ],
    48,
    0.72,
  );
}

/** Baroque: a faceted cabochon (0) with a table (2) in a gold bezel (1). */
export function jewelMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.28], [0.15, 0.28]], 2),
      ...chain([[0.15, 0.28], [0.27, 0.25], [0.36, 0.18]], 0),
      ...chain([[0.36, 0.18], [0.385, 0.205], [0.425, 0.195], [0.45, 0.13], [0.43, 0.03], [0, 0]], 1),
    ],
    12,
    0.72,
    true,
  );
}

/** Clay: a soft rounded pebble. Body (0), shoulder (1), slightly dished top (2). */
export function pillMesh(): Float32Array {
  const edge: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    edge.push([0.34 + Math.cos(a) * 0.1, 0.12 + Math.sin(a) * 0.1]);
  }
  edge.reverse(); // from the top of the shoulder down to the widest point
  return lathe(
    [
      ...chain([[0, 0.205], [0.15, 0.215]], 2),
      ...chain([[0.15, 0.215], [0.26, 0.222], [0.34, 0.22]], 1),
      ...chain([...edge, [0.43, 0.06], [0.4, 0.015], [0.33, 0], [0, 0]], 0),
    ],
    40,
    0.72,
  );
}

type V3 = [number, number, number];
function quad(out: number[], a: V3, b: V3, c: V3, d: V3, n: V3, region: number) {
  for (const p of [a, b, c, a, c, d]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], region);
}

/** Axis-aligned box: top face given region `top`, sides region `side`. */
function box(out: number[], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, top: number, side: number) {
  quad(out, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], top);
  quad(out, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], side);
  quad(out, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], side);
  quad(out, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], side);
  quad(out, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side);
}

/** Top-face square ring between half-sizes inner and outer. */
function squareRing(out: number[], inner: number, outer: number, y: number, zs: number, region: number) {
  const o = outer;
  const i = inner;
  const n: V3 = [0, 1, 0];
  quad(out, [-o, y, -o * zs], [o, y, -o * zs], [o, y, -i * zs], [-o, y, -i * zs], n, region);
  quad(out, [-o, y, i * zs], [o, y, i * zs], [o, y, o * zs], [-o, y, o * zs], n, region);
  quad(out, [-o, y, -i * zs], [-i, y, -i * zs], [-i, y, i * zs], [-o, y, i * zs], n, region);
  quad(out, [i, y, -i * zs], [o, y, -i * zs], [o, y, i * zs], [i, y, i * zs], n, region);
}

/** Pixel: a chunky block with a bevel frame (1), body band (0) and centre square (2) on top. */
export function blockMesh(): Float32Array {
  const out: number[] = [];
  const zs = 0.72;
  const h = 0.22;
  box(out, -0.39, 0.39, 0, h - 0.001, -0.39 * zs, 0.39 * zs, 0, 0);
  squareRing(out, 0.27, 0.39, h, zs, 1);
  squareRing(out, 0.14, 0.27, h, zs, 0);
  quad(out, [-0.14, h, -0.14 * zs], [0.14, h, -0.14 * zs], [0.14, h, 0.14 * zs], [-0.14, h, 0.14 * zs], [0, 1, 0], 2);
  return new Float32Array(out);
}

// ---------------------------------------------------------------- fret buttons per skin (ring 0, well 1)

export function flatButtonMesh(): Float32Array {
  return lathe([...chain([[0, 0.006], [0.31, 0.006]], 1), ...chain([[0.31, 0.02], [0.45, 0.02], [0.45, 0]], 0)], 48, 0.72);
}

export function goldButtonMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.012], [0.28, 0.012]], 1),
      ...chain([[0.28, 0.012], [0.3, 0.05], [0.34, 0.075], [0.37, 0.055], [0.41, 0.08], [0.45, 0.065], [0.48, 0.025], [0.48, 0]], 0),
    ],
    12,
    0.72,
    true,
  );
}

export function squareButtonMesh(): Float32Array {
  const out: number[] = [];
  const zs = 0.72;
  const o = 0.45;
  const i = 0.31;
  const hh = 0.06;
  box(out, -o, o, 0, hh, -o * zs, -i * zs, 0, 0);
  box(out, -o, o, 0, hh, i * zs, o * zs, 0, 0);
  box(out, -o, -i, 0, hh, -i * zs, i * zs, 0, 0);
  box(out, i, o, 0, hh, -i * zs, i * zs, 0, 0);
  quad(out, [-i, 0.01, -i * zs], [i, 0.01, -i * zs], [i, 0.01, i * zs], [-i, 0.01, i * zs], [0, 1, 0], 1);
  return new Float32Array(out);
}

export function softButtonMesh(): Float32Array {
  const ring: [number, number][] = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI - (k / 10) * Math.PI; // left inner edge over the top to the outer edge
    ring.push([0.385 + Math.cos(a) * 0.075, Math.sin(a) * 0.07]);
  }
  return lathe([...chain([[0, 0.01], [0.31, 0.01]], 1), ...chain(ring, 0)], 40, 0.72);
}
