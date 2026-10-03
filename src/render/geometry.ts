// Procedural meshes. Vertex layout for lit meshes: position(3) normal(3) region(1).

type ProfileSeg = { from: [number, number]; to: [number, number]; region: number };

/**
 * Revolve an (r, y) profile around the Y axis. zScale squashes the result front-to-back.
 * With `faceted`, each radial slice gets one flat normal (cut-gem look) instead of a smooth one.
 * With `smooth`, normals are averaged across joints inside a region (no visible rings on domes).
 * With `stretch`, the solid becomes a stadium: the profile is swept around a segment of half length
 * `stretch` along X instead of around a point (open-note bars with rounded ends).
 */
function lathe(segs: ProfileSeg[], radial: number, zScale: number, faceted = false, stretch = 0, smooth = false): Float32Array {
  const out: number[] = [];
  // slices: start angle, end angle, x offset at the start, x offset at the end
  const slices: [number, number, number, number][] = [];
  if (stretch > 0) {
    const h = Math.max(2, radial >> 1);
    for (let j = 0; j < h; j++) slices.push([-Math.PI / 2 + (j / h) * Math.PI, -Math.PI / 2 + ((j + 1) / h) * Math.PI, stretch, stretch]);
    slices.push([Math.PI / 2, Math.PI / 2, stretch, -stretch]);
    for (let j = 0; j < h; j++) slices.push([Math.PI / 2 + (j / h) * Math.PI, Math.PI / 2 + ((j + 1) / h) * Math.PI, -stretch, -stretch]);
    slices.push([Math.PI * 1.5, Math.PI * 1.5, -stretch, stretch]);
  } else {
    for (let j = 0; j < radial; j++) slices.push([(j / radial) * Math.PI * 2, ((j + 1) / radial) * Math.PI * 2, 0, 0]);
  }
  const prof = segs.map((seg) => {
    const [r0, y0] = seg.from;
    const [r1, y1] = seg.to;
    const nr = -(y1 - y0);
    const ny = r1 - r0;
    const l = Math.hypot(nr, ny) || 1;
    return [nr / l, ny / l];
  });
  const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  /** profile normal at the start (0) or end (1) of segment k */
  const profNormal = (k: number, end: 0 | 1): [number, number] => {
    let [nr, ny] = prof[k];
    if (smooth) {
      const o = end ? k + 1 : k - 1;
      if (o >= 0 && o < segs.length && segs[o].region === segs[k].region && (end ? same(segs[k].to, segs[o].from) : same(segs[k].from, segs[o].to))) {
        nr += prof[o][0];
        ny += prof[o][1];
        const l = Math.hypot(nr, ny) || 1;
        nr /= l;
        ny /= l;
      }
    }
    return [nr, ny];
  };
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    const [r0, y0] = seg.from;
    const [r1, y1] = seg.to;
    const nA = profNormal(k, 0);
    const nB = profNormal(k, 1);
    for (const [a0, a1, x0, x1] of slices) {
      const mid = (a0 + a1) / 2;
      const v = (r: number, y: number, a: number, xo: number, n: [number, number]) => {
        const c = Math.cos(faceted ? mid : a);
        const s = Math.sin(faceted ? mid : a);
        // normal of a squashed surface: scale the z component inversely
        let nx = n[0] * c;
        let nz = (n[0] * s) / zScale;
        const nl = Math.hypot(nx, n[1], nz) || 1;
        nx /= nl;
        nz /= nl;
        out.push(r * Math.cos(a) + xo, y, r * Math.sin(a) * zScale, nx, n[1] / nl, nz, seg.region);
      };
      v(r0, y0, a0, x0, nA);
      v(r1, y1, a0, x0, nB);
      v(r1, y1, a1, x1, nB);
      v(r0, y0, a0, x0, nA);
      v(r1, y1, a1, x1, nB);
      v(r0, y0, a1, x1, nA);
    }
  }
  return new Float32Array(out);
}

function chain(points: [number, number][], region: number): ProfileSeg[] {
  const segs: ProfileSeg[] = [];
  for (let i = 0; i + 1 < points.length; i++) segs.push({ from: points[i], to: points[i + 1], region });
  return segs;
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

// ---------------------------------------------------------------- Classic dome

/** Front-to-back squash of dome gems and wheels (the shader needs it to recover radial coordinates). */
export const DOME_ZS = 0.85;
/** Rim, body and cap radii of a dome gem. */
export const DOME_RIM = 0.43;
export const DOME_BODY = 0.365;
export const DOME_CAP = 0.19;
/** Half depth of the open-note bar and of its body. */
export const OPEN_R = 0.19;

/**
 * Classic dome gem. Regions: skirt (0), muted rim (1), white/dark cap (2), domed body (3) and a flat
 * shadow disc under everything (4, only drawn by the inked look).
 */
export function domeMesh(): Float32Array {
  // profiles run from the top centre outwards and down, so their normals point away from the solid
  const body: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const r = DOME_BODY * (i / 8);
    body.push([r, 0.176 + 0.09 * (1 - (r / DOME_BODY) ** 2)]);
  }
  return lathe(
    [
      ...chain([[0, 0.28], [0.04, 0.279], [0.1, 0.273], [0.16, 0.262], [0.185, 0.248], [0.19, 0.234]], 2),
      ...chain(body, 3),
      ...chain([[DOME_BODY, 0.176], [0.385, 0.179], [0.405, 0.175], [0.425, 0.16], [0.43, 0.135]], 1),
      ...chain([[0.43, 0.135], [0.43, 0.02], [0.415, 0]], 0),
      ...chain([[0, 0.012], [0.47, 0.012]], 4),
    ],
    48,
    DOME_ZS,
    false,
    0,
    true,
  );
}

/** Open note in the dome style: a stadium-shaped bar with the same regions as the gem. */
export function domeBarMesh(halfWidth: number): Float32Array {
  const R = OPEN_R;
  const len = halfWidth - R;
  const bar = lathe(
    [
      ...chain([[0, 0.19], [0.07, 0.186], [0.12, 0.172], [R - 0.04, 0.156]], 3),
      ...chain([[R - 0.04, 0.156], [R - 0.025, 0.155], [R - 0.005, 0.14], [R, 0.12]], 1),
      ...chain([[R, 0.12], [R, 0]], 0),
      ...chain([[0, 0.012], [R + 0.03, 0.012]], 4),
    ],
    32,
    1,
    false,
    len,
    true,
  );
  const cap = lathe(chain([[0, 0.204], [0.02, 0.202], [0.04, 0.195], [0.045, 0.184]], 2), 32, 1, false, 0.27, true);
  const all = new Float32Array(bar.length + cap.length);
  all.set(bar);
  all.set(cap, bar.length);
  return all;
}

/**
 * Wheel fret button. Regions: base disc (0), fret ring (1), well with spokes (2), hub dome (3).
 * The base is drawn a little to the front by the shader, as a shadow and as the ink outline.
 */
export function wheelMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.02], [0.47, 0.02], [0.47, 0]], 0),
      ...chain([[0.36, 0.02], [0.36, 0.052], [0.372, 0.066], [0.428, 0.066], [0.44, 0.052], [0.44, 0.02]], 1),
      ...chain([[0.13, 0.03], [0.36, 0.03]], 2),
      ...chain([[0, 0.085], [0.04, 0.082], [0.08, 0.074], [0.115, 0.055], [0.13, 0.03]], 3),
    ],
    48,
    DOME_ZS,
    false,
    0,
    true,
  );
}

// ---------------------------------------------------------------- Crystal

/** Crystal fret button: a glass ring (0) around a clear well that lights up (1). */
export function glassButtonMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.018], [0.27, 0.022]], 1),
      ...chain([[0.27, 0.022], [0.29, 0.058], [0.33, 0.074], [0.41, 0.074], [0.45, 0.055], [0.47, 0.02], [0.47, 0]], 0),
    ],
    48,
    0.72,
    false,
    0,
    true,
  );
}

/** Crystal: a smooth glass bead, one region; the shader draws the HOPO / tap markings. */
export function beadMesh(): Float32Array {
  const pts: [number, number][] = [];
  // a squashed superellipse: flat-ish top, rounded shoulder, flat bottom
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([0.43 * Math.sign(s) * Math.abs(s) ** 0.6, 0.11 + 0.15 * Math.sign(c) * Math.abs(c) ** 0.6]);
  }
  pts.push([0.43, 0.06], [0.4, 0.01], [0.34, 0], [0, 0]);
  return lathe(chain(pts, 0), 48, 0.72, false, 0, true);
}
