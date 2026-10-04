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
/** Dome gem radii: outer edge of the dark base, the silver bezel ring (inner, outer), the body, the cap. */
export const DOME_RIM = 0.445;
export const DOME_BEZEL_IN = 0.335;
export const DOME_BEZEL_OUT = 0.392;
export const DOME_BODY = 0.345;
export const DOME_CAP = 0.145;
/** Half depth of the open-note bar. */
export const OPEN_R = 0.2;
/** Half length of the straight part of the open-note cap stripe. */
export const OPEN_CAP_L = 0.75;

/** Points along a dome: y = base + rise * (1 - (r / radius)^2), from the centre out to `radius`. */
function domeCurve(radius: number, base: number, rise: number, steps: number, from = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const r = from + (radius - from) * (i / steps);
    pts.push([r, base + rise * (1 - (r / radius) ** 2)]);
  }
  return pts;
}

/**
 * Classic dome gem, built to read at a glance: a dark base (0) gives every gem a crisp outline against
 * the board, a raised silver bezel (1) catches the light around a saturated domed body (3), and a bright
 * cap (2) sits on top. A flat shadow disc (4) lies under everything.
 */
export function domeMesh(): Float32Array {
  // profiles run from the top centre outwards and down, so their normals point away from the solid
  return lathe(
    [
      ...chain(domeCurve(DOME_CAP + 0.012, 0.262, 0.05, 6), 2),
      ...chain([[DOME_CAP + 0.012, 0.262], [DOME_CAP + 0.012, 0.24]], 2),
      ...chain(domeCurve(DOME_BODY, 0.17, 0.11, 10), 3),
      ...chain([[DOME_BEZEL_IN, 0.168], [0.344, 0.186], [0.356, 0.196], [0.372, 0.196], [0.385, 0.186], [DOME_BEZEL_OUT, 0.168]], 1),
      ...chain([[DOME_BEZEL_OUT, 0.168], [0.425, 0.162], [0.44, 0.15], [DOME_RIM, 0.132], [DOME_RIM, 0.025], [0.43, 0]], 0),
      ...chain([[0, 0.012], [0.5, 0.012]], 4),
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
      ...chain(domeCurve(0.13, 0.15, 0.045, 6), 3),
      ...chain([[0.125, 0.15], [0.132, 0.168], [0.142, 0.176], [0.155, 0.176], [0.165, 0.166], [0.17, 0.15]], 1),
      ...chain([[0.17, 0.15], [0.19, 0.144], [R, 0.13], [R, 0.02], [R - 0.01, 0]], 0),
      ...chain([[0, 0.012], [R + 0.05, 0.012]], 4),
    ],
    32,
    1,
    false,
    len,
    true,
  );
  const cap = lathe(chain(domeCurve(0.05, 0.19, 0.016, 4), 2), 32, 1, false, OPEN_CAP_L, true);
  const all = new Float32Array(bar.length + cap.length);
  all.set(bar);
  all.set(cap, bar.length);
  return all;
}

// ---------------------------------------------------------------- Cone (Clone Hero style)

/** Cone gem radii: the silver base band, the top of the coloured cone, the cap. */
export const CONE_R = 0.445;
export const CONE_TOP = 0.275;
export const CONE_CAP = 0.2;

/**
 * Cone gem, after Clone Hero's: a silver base band (0) under a sloped cone of the fret colour (1), a ring
 * round the top (3) and a flat cap (2), over a shadow disc (4). The cone's slope faces the player, so the
 * colour reads from far away; the top carries the note type (matte cap in a black ring on strums, a cap
 * that glows white on HOPOs, a dark cap in a glowing ring on taps).
 */
export function coneMesh(): Float32Array {
  return lathe(
    [
      ...chain([[0, 0.292], [0.1, 0.29], [CONE_CAP - 0.02, 0.285], [CONE_CAP, 0.28]], 2),
      ...chain([[CONE_CAP, 0.28], [CONE_TOP - 0.02, 0.28], [CONE_TOP, 0.272]], 3),
      ...chain([[CONE_TOP, 0.272], [0.36, 0.185], [0.42, 0.11], [0.435, 0.085]], 1),
      ...chain([[0.435, 0.085], [CONE_R, 0.075], [CONE_R, 0.02], [0.43, 0]], 0),
      ...chain([[0, 0.012], [0.5, 0.012]], 4),
    ],
    48,
    DOME_ZS,
    false,
    0,
    true,
  );
}

/** Open note in the cone style: a bar with the gem's regions and rounded ends. */
export function coneBarMesh(halfWidth: number): Float32Array {
  const R = OPEN_R;
  return lathe(
    [
      ...chain([[0, 0.19], [0.04, 0.188], [0.06, 0.184]], 2),
      ...chain([[0.06, 0.184], [0.085, 0.184], [0.095, 0.178]], 3),
      ...chain([[0.095, 0.178], [0.16, 0.11], [0.19, 0.075]], 1),
      ...chain([[0.19, 0.075], [R, 0.065], [R, 0.015], [R - 0.01, 0]], 0),
      ...chain([[0, 0.012], [R + 0.05, 0.012]], 4),
    ],
    32,
    1,
    false,
    halfWidth - R,
    true,
  );
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

/** Crystal bead radius (before the front-to-back squash) and squash. */
export const BEAD_R = 0.43;
export const BEAD_ZS = 0.78;

/** A squashed superellipse profile: flat-ish top, rounded shoulder, flat bottom. */
function beadProfile(radius: number, height: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([radius * Math.abs(s) ** 0.6, height * 0.4 + height * 0.6 * Math.abs(c) ** 0.85]);
  }
  pts.push([radius, height * 0.22], [radius * 0.94, height * 0.03], [radius * 0.8, 0], [0, 0]);
  return pts;
}

/** Crystal: a smooth glass bead (0) over a soft shadow disc (4); the shader draws the note markings. */
export function beadMesh(): Float32Array {
  return lathe([...chain(beadProfile(BEAD_R, 0.25), 0), ...chain([[0, 0.006], [0.5, 0.006]], 4)], 48, BEAD_ZS, false, 0, true);
}

/** Crystal open note: a glass bar with the bead's profile and rounded ends. */
export function glassBarMesh(halfWidth: number): Float32Array {
  return lathe([...chain(beadProfile(OPEN_R, 0.2), 0), ...chain([[0, 0.006], [OPEN_R + 0.06, 0.006]], 4)], 32, 1, false, halfWidth - OPEN_R, true);
}
