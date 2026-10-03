// GLSL ES 3.0 sources (the #version header is prepended by program()).
import { DOME_BODY, DOME_CAP, DOME_RIM, DOME_ZS, OPEN_R } from './geometry.ts';

const f = (n: number) => n.toFixed(4);

/**
 * Helpers for the Classic dome look. Its colours come from a design mock in sRGB, while the scene is
 * linear and goes through the ACES curve in the composite pass: disp() maps an sRGB colour to the scene
 * value that ends up on screen as that colour (capped so highlights do not bloom into a blob).
 */
const DOME_COMMON = `
vec3 toLin(vec3 s) { return pow(max(s, vec3(0.0)), vec3(2.2)); }
vec3 invAces(vec3 y) {
  y = clamp(y, 0.0, 0.85);
  vec3 a = 2.43 * y - 2.51;
  vec3 b = 0.59 * y - 0.03;
  vec3 c = 0.14 * y;
  vec3 x = (-b - sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
  return max(x, vec3(0.0)) / 1.05;
}
vec3 disp(vec3 s) { return invAces(toLin(s)); }
vec3 hexc(int v) { return vec3(float((v >> 16) & 255), float((v >> 8) & 255), float(v & 255)) / 255.0; }
const int FRET[5]  = int[5](0x3cf06a, 0xff3b4a, 0xffd23a, 0x3a8bff, 0xff8a1f);
const int TINT[5]  = int[5](0x8dffab, 0xff8c96, 0xffe68a, 0x8ab8ff, 0xffb870);
const int SHADE[5] = int[5](0x15803d, 0xa3162a, 0xa87f06, 0x1d4fb0, 0xb35a0c);
const int DEEP[5]  = int[5](0x0f6b2c, 0x8c1220, 0x8f6a05, 0x163f94, 0x96480a);
`;

/**
 * Crystal's surroundings: image-based light from an analytic photo studio, and reflection rays traced
 * for real against the other gems (as spheres, from u_gems) and the highway plane. Needs u_colors declared.
 */
const ROOM_COMMON = `
uniform vec4 u_gems[32];   // x, y (sphere centre), z, colour index (+8 for star power)
uniform int u_gemCount;
const float GEM_R = 0.3;

float panel(float az, float el, float az0, float el0, float w, float h, float soft) {
  vec2 q = abs(vec2(az - az0, el - el0)) - vec2(w, h);
  return 1.0 - smoothstep(-soft, soft, max(q.x, q.y));
}

// A dark room: a big softbox over the far end of the highway, strip lights on both sides, a warm
// kicker behind the player. Roughness blurs the panels (and spreads their energy).
vec3 roomEnv(vec3 d, float rough) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  float azb = atan(d.x, d.z);
  float soft = 0.03 + rough * 0.5;
  float spread = 1.0 + rough * 2.0;
  vec3 c = mix(vec3(0.004, 0.004, 0.006), vec3(0.028, 0.03, 0.036), smoothstep(-0.1, 0.9, d.y));
  c += vec3(3.8, 3.65, 3.4) * panel(az, el, 0.0, 0.95, 0.52, 0.3, soft) / spread;
  c += vec3(1.5, 1.65, 1.9) * (panel(az, el, 1.3, 0.3, 0.07, 0.32, soft) + panel(az, el, -1.3, 0.3, 0.07, 0.32, soft)) / spread;
  c += vec3(0.7, 0.45, 0.28) * panel(azb, el, 0.0, 0.12, 0.6, 0.06, soft) / spread;
  return c;
}

// The highway seen in a reflection: dark lacquer, lane lines and the strike line.
vec3 roomBoard(vec3 q) {
  if (abs(q.x) > 2.65 || q.z < -26.0 || q.z > 3.0) return vec3(0.003);
  float d = abs(fract(q.x) - 0.5);
  float line = (1.0 - smoothstep(0.0, 0.03, d)) * step(abs(q.x), 2.0);
  return vec3(0.012, 0.011, 0.012) + vec3(0.05) * line + vec3(0.4, 0.38, 0.35) * exp(-abs(q.z) * 12.0) * step(abs(q.x), 2.5);
}

// Nearest gem along a ray, ignoring the one the ray leaves from.
int roomHit(vec3 p, vec3 r, out float tHit) {
  tHit = 1e9;
  int hit = -1;
  for (int i = 0; i < 32; i++) {
    if (i >= u_gemCount) break;
    vec3 c = u_gems[i].xyz;
    vec2 dxz = p.xz - c.xz;
    if (dot(dxz, dxz) < 0.2) continue;
    vec3 oc = p - c;
    float b = dot(oc, r);
    float cc = dot(oc, oc) - GEM_R * GEM_R;
    float disc = b * b - cc;
    if (disc < 0.0 || (b > 0.0 && cc > 0.0)) continue;
    float t = -b - sqrt(disc);
    if (t > 0.0 && t < tHit) {
      tHit = t;
      hit = i;
    }
  }
  return hit;
}

vec3 roomGemSeen(int i, vec3 n, vec3 r) {
  float w = u_gems[i].w;
  vec3 col = w >= 7.5 ? u_colors[6] : u_colors[int(w)];
  return col * (0.1 + 0.95 * max(n.y, 0.0)) + roomEnv(reflect(r, n), 0.15) * 0.05;
}

// Follow a reflected ray: other gems first, then the highway, then the room.
vec3 roomTrace(vec3 p, vec3 r, float rough) {
  float t;
  int hit = roomHit(p, r, t);
  float tPlane = r.y < -1e-4 ? -p.y / r.y : 1e9;
  if (hit >= 0 && t < tPlane) return roomGemSeen(hit, normalize(p + r * t - u_gems[hit].xyz), r);
  if (tPlane < 1e8) return roomBoard(p + r * tPlane);
  return roomEnv(r, rough);
}

float schlick(float f0, float cosT) {
  return f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
}
`;

/**
 * Crystal: what is behind a surface (u_grab, a copy of the frame so far) seen through it, bent by
 * its normal, with each colour channel bent by a slightly different amount (dispersion).
 */
const GLASS_COMMON = `
uniform sampler2D u_grab;
uniform vec2 u_screen;
uniform float u_lightBg;   // 1 on light themes: glass reads by its tint and dark edges, not by glow
vec3 behind(vec2 off, float disp, float blur) {
  vec2 uv = gl_FragCoord.xy / u_screen;
  if (blur <= 0.0) {
    return vec3(texture(u_grab, uv + off * (1.0 - disp)).r, texture(u_grab, uv + off).g, texture(u_grab, uv + off * (1.0 + disp)).b);
  }
  // frosted: a small golden-angle disc of taps
  vec3 acc = vec3(0.0);
  vec2 aspect = vec2(u_screen.y / u_screen.x, 1.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 2.39996;
    vec2 o = off + vec2(cos(a), sin(a)) * sqrt((float(i) + 0.5) / 8.0) * blur * aspect;
    acc += vec3(texture(u_grab, uv + o * (1.0 - disp)).r, texture(u_grab, uv + o).g, texture(u_grab, uv + o * (1.0 + disp)).b);
  }
  return acc / 8.0;
}
`;

export const FULLSCREEN_VS = `
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BACKGROUND_FS = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_hasTex;
uniform vec2 u_cover;   // uv scale for "cover" fit
uniform float u_time;
uniform float u_beat;   // 0..1 pulse on each beat
uniform vec3 u_tint;
uniform float u_lod;
uniform float u_bright;
uniform float u_light;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform float u_art;
uniform float u_grid;
uniform float u_pattern;
uniform float u_flat;   // 1 = plain paper (Daylight ink): no drift, vignette or beat pulse
void main() {
  if (u_flat > 0.5) {
    o = vec4(mix(u_bottom, u_top, v_uv.y), 1.0);
    return;
  }
  vec2 uv = (v_uv - 0.5) * u_cover * (0.92 - 0.015 * u_beat) + 0.5;
  uv += vec2(sin(u_time * 0.05), cos(u_time * 0.037)) * 0.015;
  float drift = 0.5 + 0.5 * sin(v_uv.x * 3.0 + u_time * 0.1) * cos(v_uv.y * 2.0 - u_time * 0.07);
  vec3 base = mix(u_bottom, u_top, smoothstep(0.0, 1.0, v_uv.y)) * (0.9 + 0.2 * drift);
  vec3 art = vec3(0.0);
  if (u_hasTex > 0.5) {
    art = pow(textureLod(u_tex, uv, u_lod).rgb, vec3(2.2));
    float l = dot(art, vec3(0.3, 0.59, 0.11));
    art = mix(vec3(l), art, 0.8);
  }
  float vig = smoothstep(1.25, 0.3, length(v_uv - vec2(0.5, 0.45)) * 1.6);
  vec3 c;
  if (u_light > 0.5) {
    // Pale backdrop lightly tinted by the album art; the dark highway stands on it like a fretboard.
    c = mix(base, base * (0.75 + 0.5 * art), u_hasTex * u_art) + u_tint * 0.08;
    o = vec4(c * mix(0.9, 1.0, vig) * (1.0 + 0.03 * u_beat), 1.0);
    return;
  }
  c = base + art * u_bright * u_art + u_tint * 0.04;
  if (u_pattern > 0.0) {
    // Baroque damask: a faint gilded quatrefoil lattice
    vec2 q = v_uv * vec2(9.0, 6.0);
    vec2 f = fract(q) - 0.5;
    float ang = atan(f.y, f.x);
    float r = length(f);
    float petal = 0.28 + 0.08 * cos(4.0 * ang);
    float line = 1.0 - smoothstep(0.0, 0.025, abs(r - petal));
    float dot = 1.0 - smoothstep(0.03, 0.05, r);
    c += vec3(0.5, 0.33, 0.1) * (line * 0.05 + dot * 0.04) * u_pattern;
  }
  if (u_grid > 0.0) {
    // Synthwave: a striped sun sinking into a scrolling perspective grid.
    float horizon = 0.62;
    vec2 p = v_uv - vec2(0.5, horizon);
    float sunR = length(p * vec2(1.0, 1.35) - vec2(0.0, 0.1));
    float band = v_uv.y - horizon;
    float stripes = step(0.35, fract(band * 38.0)) + step(0.2, band);
    float sun = (1.0 - smoothstep(0.155, 0.16, sunR)) * step(0.0, band) * min(1.0, stripes);
    vec3 sunCol = mix(vec3(1.0, 0.12, 0.45), vec3(1.0, 0.75, 0.15), smoothstep(0.0, 0.25, band));
    c += sunCol * sun * 0.55 * u_grid;
    c += vec3(0.9, 0.1, 0.5) * exp(-abs(band) * 14.0) * 0.22 * u_grid;
    if (band < 0.0) {
      float depth = 0.12 / max(-band, 0.002);
      float gx = (v_uv.x - 0.5) * depth * 6.0;
      float gz = depth * 3.0 + u_time * 0.8;
      // distance from the nearest grid line (0.5 = on the line)
      float lx = smoothstep(0.47, 0.5, abs(fract(gx) - 0.5));
      float lz = smoothstep(0.44, 0.5, abs(fract(gz) - 0.5));
      c += vec3(1.0, 0.15, 0.75) * max(lx, lz) * 0.9 * u_grid * smoothstep(12.0, 1.5, depth) * smoothstep(0.15, 0.5, depth);
    }
  }
  o = vec4(c * vig * (1.0 + 0.12 * u_beat), 1.0);
}`;

export const HIGHWAY_VS = `
layout(location=0) in vec2 a_xz;
uniform mat4 u_vp;
out vec3 v_pos;
void main() {
  v_pos = vec3(a_xz.x, 0.0, a_xz.y);
  gl_Position = u_vp * vec4(v_pos, 1.0);
}`;

export const HIGHWAY_FS = `
in vec3 v_pos;
out vec4 o;
uniform float u_time;
uniform float u_speed;
uniform float u_len;
uniform float u_half;
uniform vec3 u_rail;
uniform float u_sp;
uniform float u_miss;
uniform float u_solo;
uniform vec3 u_tint;
uniform float u_lanes[5];
uniform vec3 u_laneCol[5];
uniform vec3 u_hwFar;
uniform vec3 u_hwNear;
uniform vec3 u_laneLine;
uniform vec3 u_strike;
uniform float u_board;     // 1 = textured Classic board
uniform float u_railMode;  // 0 glow by multiplier, 1 steel, 2 ink
uniform vec3 u_inkCol;
uniform vec3 u_cam;
uniform vec3 u_colors[8];
uniform float u_glass;     // Crystal skin: the board is a flowing glass slab
${DOME_COMMON}
${ROOM_COMMON}
${GLASS_COMMON}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float x = v_pos.x;
  float z = v_pos.z;
  float ax = abs(x);
  float track = z - u_time * u_speed;     // world position locked to the chart, scrolls with notes
  bool steel = u_railMode > 0.5 && u_railMode < 1.5;
  bool inked = u_railMode > 1.5;
  bool board = u_board > 0.5;
  float near = smoothstep(-u_len, 0.0, z);

  vec3 base = mix(u_hwFar, u_hwNear, near);
  if (board) {
    // dark board: diagonal stripes and a fine grain, both faded out where they would alias
    float diag = (x * 0.8 + track * 0.62) * 3.4;
    float stripe = smoothstep(0.42, 0.58, abs(fract(diag) - 0.5) * 2.0);
    stripe = mix(0.5, stripe, 1.0 - smoothstep(0.25, 0.6, fwidth(diag)));
    vec2 gp = vec2(x * 46.0, track * 4.0);
    float grain = hash21(floor(gp)) - 0.5;
    grain *= 1.0 - smoothstep(0.3, 0.8, fwidth(gp.x));
    base = mix(disp(hexc(0x1d1511)), disp(hexc(0x33241c)), stripe) * (1.0 + grain * 0.3);
    // the theme's far colour is darker than its near colour: keep that as the fade with distance
    base *= mix(u_hwFar.g / max(u_hwNear.g, 1e-5), 1.0, near);
  }
  if (u_glass > 0.5) {
    // A glass slab over the background: slow swells that travel with the chart and a finer ripple
    // bend what is behind it; the bevelled edges act as lenses; a light frost softens it.
    float t = u_time;
    vec2 slope = vec2(
      0.55 * sin(track * 0.55 + x * 1.3 + t * 0.7) + 0.3 * sin(track * 1.7 - x * 2.9 + t * 1.3),
      0.55 * cos(track * 0.45 - x * 0.9 + t * 0.5) + 0.3 * cos(track * 2.1 + x * 2.2 - t * 1.1)
    );
    float persp = 0.35 + 0.65 * near;
    vec2 off = vec2(slope.x, -slope.y) * 0.022 * persp;
    float bevel = smoothstep(u_half - 0.55, u_half - 0.02, ax);
    off.x -= sign(x) * bevel * bevel * 0.07 * persp;
    vec3 n = normalize(vec3(-slope.x * 0.08 - sign(x) * bevel * 0.6, 1.0, -slope.y * 0.08));
    vec3 V = normalize(u_cam - v_pos);
    vec3 R = reflect(-V, n);
    float F = schlick(0.04, max(dot(n, V), 0.0));
    vec3 seen = behind(off, 0.3 + 0.9 * bevel, 0.006 * persp);
    float lb = u_lightBg;
    // On a light background the slab is a cooler, deeper glass with edges that darken towards the bevel.
    vec3 glassTint = mix(vec3(0.9, 0.94, 1.0), vec3(0.76, 0.83, 0.93), lb);
    base = seen * glassTint * (0.92 - mix(0.1, 0.4, lb) * bevel) + vec3(0.012, 0.014, 0.018);
    // sky in the surface, and a bright rim along the bevel
    base += roomEnv(R, 0.25) * F * 0.35;
    base += vec3(1.0) * pow(bevel, 6.0) * (0.25 + 0.35 * max(R.y, 0.0));
    // light focused by the gems above: soft coloured caustics just in front of each gem
    for (int i = 0; i < 32; i++) {
      if (i >= u_gemCount) break;
      vec2 dd = v_pos.xz - u_gems[i].xz - vec2(0.0, 0.22);
      float w = u_gems[i].w;
      vec3 gc = w >= 7.5 ? u_colors[6] : u_colors[int(w)];
      float r2 = dd.x * dd.x * 6.0 + dd.y * dd.y * 10.0;
      float k = exp(-r2 * 3.0) * 0.35 + exp(-r2 * 18.0) * 0.4;
      // light boards: the caustic tints the glass instead of adding light to an already bright surface
      base = mix(base + gc * k, mix(base, base * gc * 1.6, min(1.0, k * 1.5)), lb);
    }
  }
  base *= u_tint;
  // solo sections tint the lane surface
  vec3 soloCol = inked ? vec3(0.86, 0.8, 0.93) : vec3(0.045, 0.02, 0.065);
  base = mix(base, soloCol, u_solo * 0.85);
  // alternate lane shading helps read which lane a gem is in
  float laneIdx = floor(x + 2.5);
  base *= 1.0 + (inked ? 0.0 : board ? 0.06 : 0.12) * mod(laneIdx, 2.0);
  if (!board && !inked) {
    // soft sheen that scrolls with the chart so the surface reads as moving
    base += vec3(0.012, 0.012, 0.02) * (0.5 + 0.5 * sin(track * 0.8 + x * 0.6));
  }

  // lane separators
  float d = abs(fract(x) - 0.5);
  float sep;
  if (board || inked) {
    float lw = fwidth(x);
    sep = (1.0 - smoothstep(lw * 0.4, lw * 1.4, d)) * step(ax, 2.0);
  } else {
    sep = (1.0 - smoothstep(0.0, 0.02, d)) * step(ax, 2.0);
  }
  base += u_laneLine * sep;

  // lane glow while a fret is held
  float lane = floor(x + 2.5);
  if (lane >= 0.0 && lane <= 4.0) {
    float held = u_lanes[int(lane)];
    float fall = exp(z * 0.45);
    base += u_laneCol[int(lane)] * (inked ? 0.0 : 0.07) * held * fall * (1.0 - smoothstep(0.3, 0.5, abs(fract(x + 0.5) - 0.5)));
  }

  // star power
  if (u_sp > 0.0) {
    if (board) {
      // cyan flood: strongest at the rails and towards the player
      float side = smoothstep(0.2, 1.0, ax / u_half);
      float wave = 0.5 + 0.5 * sin(track * 0.9 + sin(x * 1.3 + u_time * 2.0) * 0.8);
      vec3 flood = vec3(0.01, 0.08, 0.12) * (0.45 + 0.75 * near) * (0.55 + 0.9 * side) + vec3(0.0, 0.03, 0.05) * wave * 0.5;
      base += flood * u_sp;
    } else if (inked) {
      base = mix(base, vec3(0.76, 0.92, 0.95), 0.6 * u_sp);
    } else {
      // electric blue surface with travelling waves
      float wave = 0.5 + 0.5 * sin(track * 0.9 + sin(x * 1.3 + u_time * 2.0) * 0.8);
      float bolt = pow(0.5 + 0.5 * sin(track * 0.35 - x * 2.1 + sin(track * 1.7) * 1.5), 12.0);
      base = mix(base, vec3(0.008, 0.03, 0.07) + vec3(0.02, 0.09, 0.2) * wave * 0.5 + vec3(0.1, 0.35, 0.8) * bolt * 0.35, u_sp);
    }
  }

  // side rails
  float railD = ax - (u_half - 0.09);
  float rail = smoothstep(-0.02, 0.01, railD) * (1.0 - smoothstep(0.08, 0.1, railD));
  float glowAmt = 0.12;
  vec3 railCol;
  float railPulse = 1.0;
  if (steel) {
    // chrome: a bright line on the inner side, a dark one on the outside, cyan or red when it counts
    float t = clamp(railD / 0.09, 0.0, 1.0);
    float prof = 0.5 + 0.85 * exp(-pow((t - 0.28) / 0.2, 2.0)) + 0.18 * (1.0 - t) - 0.35 * smoothstep(0.78, 1.0, t);
    railCol = u_rail * prof * (0.96 + 0.04 * sin(track * 0.7));
    railCol = mix(railCol, vec3(1.3, 0.08, 0.06) * prof * 0.7, u_miss * 0.55);
    glowAmt = 0.015 + 0.2 * max(u_sp, u_miss * 0.5);
  } else if (inked) {
    railCol = mix(u_inkCol, vec3(0.004, 0.17, 0.27), u_sp);
    railCol = mix(railCol, vec3(0.55, 0.02, 0.03), u_miss * 0.8);
    glowAmt = 0.0;
  } else {
    railCol = mix(u_rail, vec3(1.3, 0.08, 0.06), u_miss);
    railPulse = 0.8 + 0.2 * sin(track * 1.5);
  }
  base = mix(base, railCol * railPulse, rail);
  // inner glow from the rails
  base += railCol * glowAmt * exp(-max(0.0, -railD) * 5.0) * (1.0 - rail);

  // strike line
  float strikeMask = 0.0;
  float inside = step(ax, u_half - 0.1);
  if (u_glass > 0.5) {
    // Crystal: no strike line, the glass fret rings mark it
  } else if (steel) {
    strikeMask = (1.0 - smoothstep(0.045, 0.06, abs(z))) * inside;
    float t = clamp((z + 0.06) / 0.12, 0.0, 1.0);
    base = mix(base, u_strike * (1.5 - 0.85 * t), strikeMask);
    base += u_strike * 0.25 * exp(-abs(z) * 9.0) * inside;
  } else if (inked) {
    strikeMask = (1.0 - smoothstep(0.045, 0.058, abs(z))) * inside;
    base = mix(base, u_inkCol, strikeMask);
  } else {
    float strike = exp(-abs(z) * 14.0);
    base += u_strike * strike * inside;
  }

  // fade into the distance and just behind the strike line
  float a = smoothstep(-u_len, -u_len * 0.7, z) * (1.0 - smoothstep(1.4, 3.0, z));
  float edge = 1.0 - smoothstep(u_half - 0.005, u_half, ax);
  // the Classic board is slightly see-through so the album art shows; rails, lines and strike stay solid
  float solid = clamp(rail + sep * 0.5 + strikeMask, 0.0, 1.0);
  float boardA = mix(1.0, 0.86, u_board);
  o = vec4(base, a * edge * mix(boardA, 1.0, solid));
}`;

export const BEAT_VS = `
layout(location=0) in vec2 a_uv;
layout(location=1) in vec4 i_a; // z, half thickness, brightness, -
uniform mat4 u_vp;
uniform float u_half;
out float v_b;
out float v_v;
out float v_z;
void main() {
  vec3 p = vec3(a_uv.x * (u_half - 0.12), 0.004, i_a.x + a_uv.y * i_a.y);
  v_b = i_a.z;
  v_v = a_uv.y;
  v_z = p.z;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

export const BEAT_FS = `
in float v_b;
in float v_v;
in float v_z;
out vec4 o;
uniform float u_len;
uniform vec3 u_col;
uniform float u_over;
uniform float u_mode;   // 0 soft glow, 1 steel, 2 ink
void main() {
  float prof = 1.0 - abs(v_v);
  float b = v_b;
  vec3 col = u_col;
  if (u_mode > 0.5) {
    // crisp lines; steel also shades them from bright (far edge) to dim
    prof = smoothstep(0.0, 0.3, prof);
    if (u_mode < 1.5) col *= mix(1.3, 0.62, v_v * 0.5 + 0.5);
    b = min(b * (u_mode < 1.5 ? 1.9 : 1.5), 1.0);
  }
  float a = prof * b * smoothstep(-u_len, -u_len * 0.7, v_z);
  // premultiplied: alpha 0 = additive glow, alpha a = painted over (light highways)
  o = vec4(col * a, a * u_over);
}`;

export const LIT_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_region;
layout(location=3) in vec4 i_a; // x, y, z, scale
layout(location=4) in vec4 i_b; // color index, type, flags, extra
uniform mat4 u_vp;
uniform float u_hopoScale;
uniform float u_ink;
out vec3 v_world;
out vec3 v_normal;
out vec3 v_local;
flat out float v_region;
flat out vec4 v_b;
void main() {
  float s = i_a.w;
  vec3 p = a_pos * s;
  if (i_b.y == 1.0) p *= vec3(u_hopoScale, u_hopoScale * 0.85, u_hopoScale);
  p.y *= 1.0 - 0.65 * u_ink;   // inked gems are nearly flat: a thin black edge rather than a tall wall
  // dome shadow disc: a soft shadow, or the ink look's hard drop shadow, pushed towards the camera
  if (a_region > 3.5) p.z += mix(0.04, 0.06, u_ink) * s;
  v_world = p + i_a.xyz;
  v_normal = a_normal;
  v_local = a_pos;
  v_region = a_region;
  v_b = i_b;
  gl_Position = u_vp * vec4(v_world, 1.0);
}`;

export const GEM_FS = `
in vec3 v_world;
in vec3 v_normal;
in vec3 v_local;
flat in float v_region;
flat in vec4 v_b;
out vec4 o;
uniform vec3 u_colors[8];
uniform vec3 u_cam;
uniform float u_len;
uniform float u_style;   // 0 classic dome, 1 crystal
uniform float u_ink;     // 1 = flat inked look (dome only)
uniform vec3 u_inkCol;
uniform float u_dpr;
uniform float u_openL;   // half length of the straight part of the open-note bar
uniform mat4 u_view;
${DOME_COMMON}
${ROOM_COMMON}
${GLASS_COMMON}
const float ZS = ${f(DOME_ZS)};
const float RIM_R = ${f(DOME_RIM)};
const float BODY_R = ${f(DOME_BODY)};
const float CAP_R = ${f(DOME_CAP)};
const float BAR_R = ${f(OPEN_R)};

// Classic dome: skirt (0), muted rim (1), cap (2), domed body (3), shadow disc (4, ink only).
vec4 dome(vec3 N, vec3 V, vec3 L) {
  bool isOpen = v_b.x > 4.5;
  float fwGem = fwidth(length(vec2(v_local.x, v_local.z / ZS)));
  float fwBar = fwidth(length(vec2(max(abs(v_local.x) - u_openL, 0.0), v_local.z)));
  float fw = isOpen ? fwBar : fwGem;
  float fade = smoothstep(-u_len, -u_len * 0.75, v_world.z);
  int ci = min(int(v_b.x), 4);
  float type = v_b.y;          // 0 strum, 1 hopo, 2 tap, 3 open
  float flags = v_b.z;
  bool sp = mod(flags, 2.0) >= 1.0;
  bool missed = flags >= 2.0;
  float reg = v_region;
  bool skirt = reg < 0.5;
  bool rimR = reg > 0.5 && reg < 1.5;
  bool capR = reg > 1.5 && reg < 2.5;
  bool bodyR = reg > 2.5 && reg < 3.5;
  bool shadow = reg > 3.5;

  // radial coordinates in world units: r from the centre (or the bar's centre line), lp across
  vec2 lp = vec2(v_local.x, v_local.z / ZS);
  float rr = length(lp);
  float rimOut = RIM_R;
  float bodyOut = BODY_R;
  float capOut = CAP_R;
  if (isOpen) {
    lp = vec2(0.0, v_local.z);
    rr = length(vec2(max(abs(v_local.x) - u_openL, 0.0), v_local.z));
    rimOut = BAR_R;
    bodyOut = BAR_R - 0.04;
    capOut = 0.045;
    if (capR) rr = length(vec2(max(abs(v_local.x) - 0.27, 0.0), v_local.z));
  }

  if (u_ink > 0.5) {
    // Daylight ink: flat colours, a heavy outline and a black drop shadow.
    vec3 ink = u_inkCol;
    vec3 white = vec3(0.97, 0.96, 0.94);
    vec3 fretL = isOpen ? toLin(hexc(0xb04dff)) : u_colors[ci];
    if (sp) fretL = toLin(hexc(0x9fe3f2));
    if (missed) fretL = toLin(vec3(0.66, 0.64, 0.61));
    float ow = clamp(4.5 * u_dpr * fw, 0.02, 0.09);
    float lw = clamp(1.5 * u_dpr * fw, 0.006, 0.03);
    vec3 c = fretL;
    if (skirt || shadow) c = ink;
    else if (rr > rimOut - (isOpen ? min(ow, 0.05) : ow)) c = ink;
    else if (isOpen) {
      if (capR) c = mix(white, ink, smoothstep(capOut - lw * 1.4, capOut - lw * 0.4, rr));
      else if (type == 1.0) c = white;
    } else if (type == 2.0 && !missed) {
      // tap: black gem with a coloured dot
      c = mix(fretL, ink, smoothstep(0.13, 0.13 + lw, rr));
    } else {
      float ringEdge = 1.0 - smoothstep(lw * 0.5, lw, abs(rr - capOut));
      float dotEdge = 1.0 - smoothstep(lw * 0.5, lw, abs(rr - 0.115));
      if (rr < capOut) c = white;
      if (rr < 0.115) c = type == 1.0 ? white : fretL;
      c = mix(c, ink, max(ringEdge, dotEdge));
    }
    return vec4(c, fade);
  }

  if (shadow) return vec4(0.0, 0.0, 0.0, 0.55 * (1.0 - smoothstep(0.18, 0.47, rr)) * fade);

  // ---- shaded classic look, colours in sRGB as designed and mapped through disp()
  vec3 fretS = isOpen ? hexc(0xb04dff) : hexc(FRET[ci]);
  vec3 tintS = isOpen ? hexc(0xe2b0ff) : hexc(TINT[ci]);
  vec3 shadeS = isOpen ? hexc(0x7a2fd0) : hexc(SHADE[ci]);
  vec3 deepS = isOpen ? hexc(0x4a1f7a) : hexc(DEEP[ci]);
  vec3 rimS = isOpen ? hexc(0xf4ecff) : mix(hexc(0x9c978e), fretS, 0.4);
  if (sp) {
    fretS = hexc(0x9befff);
    tintS = hexc(0xdcfbff);
    shadeS = hexc(0x4fb9d6);
    deepS = hexc(0x3a9ab2);
    rimS = hexc(0xa9d6e2);
  }
  if (missed) {
    fretS = hexc(0x5a564f);
    tintS = hexc(0x8f8a82);
    shadeS = hexc(0x2f2c29);
    deepS = hexc(0x1f1d1b);
    rimS = hexc(0x6f6a63);
  }

  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 26.0);
  vec3 s;
  if (skirt) {
    s = deepS * (0.6 + 0.4 * clamp(v_local.y / 0.135, 0.0, 1.0));
  } else if (rimR) {
    s = rimS * (1.0 + 0.12 * (-lp.y / rimOut)) * (0.86 + 0.14 * smoothstep(bodyOut, bodyOut + 0.05, rr));
  } else if (bodyR) {
    vec2 bq = lp / bodyOut;
    if (isOpen) bq = vec2(0.0, lp.y / bodyOut);
    float bt = length(bq - vec2(0.0, -0.44)) / 1.3;
    if (type == 1.0 && !missed) {
      // HOPO: a white body that only picks up the fret colour at the edge (the cap hides the middle)
      float u = clamp((length(bq - vec2(0.0, -0.1)) - 0.4) / 0.6, 0.0, 1.0);
      vec3 mid = hexc(0xd9d5cd);
      s = u < 0.65 ? mix(vec3(1.0), mid, u / 0.65) : mix(mid, fretS, (u - 0.65) / 0.35 * 0.5);
    } else {
      s = bt < 0.55 ? mix(tintS, fretS, bt / 0.55) : mix(fretS, shadeS, clamp((bt - 0.55) / 0.45, 0.0, 1.0));
    }
    if (!missed) s += spec * 0.14;
  } else {
    // cap: white, dark on taps
    float ct = isOpen ? 0.4 : clamp(length(lp / capOut - vec2(-0.15, -0.35)) / 1.25, 0.0, 1.0);
    if (missed) s = mix(hexc(0x77726a), hexc(0x3d3a36), ct);
    else if (type == 2.0 && !isOpen) s = mix(hexc(0x4a4641), hexc(0x0d0c0b), ct);
    else s = mix(vec3(1.0), hexc(0xe8e4dd), pow(ct, 1.4));
    if (!missed) s += spec * 0.2;
  }
  vec3 c = disp(s);
  // star power gems glow: bloom picks the extra energy up
  if (sp && !missed) c *= 1.0 + 0.5 * (capR || bodyR ? 1.0 : 0.6);
  return vec4(c, fade);
}

// Crystal bead: refracts the highway below it (with dispersion), reflects the room and its
// neighbours, glows at the rim. HOPOs are clear with a milky core, taps are smoked glass.
vec4 glassGem(vec3 N, vec3 V) {
  bool isOpen = v_b.x > 4.5;
  int ci = min(int(v_b.x), 5);
  float type = v_b.y;
  float flags = v_b.z;
  bool sp = mod(flags, 2.0) >= 1.0;
  bool missed = flags >= 2.0;
  vec3 col = sp ? u_colors[6] : u_colors[ci];
  float fade = smoothstep(-u_len, -u_len * 0.75, v_world.z);
  float nv = max(dot(N, V), 1e-3);
  vec3 R = reflect(-V, N);
  vec2 lp = isOpen ? vec2(0.0, v_local.z / 0.16) : vec2(v_local.x, v_local.z / 0.72) / 0.43;
  float rr = clamp(length(lp), 0.0, 1.0);
  float thick = 1.0 - rr * rr;
  // screen-space lens: the bead magnifies and bends what is under it
  vec3 ns = mat3(u_view) * N;
  vec2 off = -ns.xy * (0.03 + 0.05 * thick);
  vec3 under = behind(off, 0.45, 0.0);
  vec3 tint = col / max(max(col.r, col.g), max(col.b, 1e-3));
  float lb = u_lightBg;
  // light backgrounds: deeper absorption so the colour holds up against white
  tint = pow(tint, vec3(1.0 + 1.2 * lb));
  vec3 trans;
  if (type == 1.0 && !isOpen) {
    // clear glass, milky core
    trans = under * mix(vec3(1.0), tint, 0.3) + mix(vec3(0.0), vec3(0.9, 0.9, 0.95), 1.0 - smoothstep(0.2, 0.55, rr)) * 0.8 + col * 0.1;
  } else if (type == 2.0 && !isOpen) {
    trans = under * 0.12 + col * 0.35 * smoothstep(0.55, 0.95, rr);
  } else {
    trans = under * mix(vec3(1.0), tint, 0.85) * 0.85 + col * (0.08 + 0.22 * thick);
  }
  if (sp) trans += col * (0.4 + 0.8 * thick);
  float F = schlick(0.04, nv);
  vec3 refl = roomTrace(v_world, R, 0.0);
  float glint = pow(max(dot(R, normalize(vec3(-0.35, 0.8, -0.5))), 0.0), 240.0) * 3.5;
  float rim = pow(1.0 - nv, 3.0);
  vec3 c = mix(trans, refl, F) + vec3(1.0) * glint + mix(vec3(1.0), tint, 0.5) * rim * 0.45 * (1.0 - 0.8 * lb);
  // real glass on white shows dark edges: the rim refracts the darker world around it
  c = mix(c, c * 0.3 + col * 0.06, lb * smoothstep(0.6, 0.97, rr));
  if (missed) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = vec3(l) * 0.35 + vec3(0.01);
  }
  return vec4(c, fade);
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cam - v_world);
  vec3 L = normalize(vec3(-0.3, 1.0, 0.6));
  o = u_style > 0.5 ? glassGem(N, V) : dome(N, V, L);
}`;

export const BUTTON_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_region;
layout(location=3) in vec4 i_a; // x, color index, pressed, hit flash
layout(location=4) in vec4 i_b; // wrong flash, sustain glow, -, -
uniform mat4 u_vp;
uniform float u_time;
uniform float u_style;
uniform float u_ink;
out vec3 v_world;
out vec3 v_normal;
out vec3 v_local;
flat out float v_region;
flat out vec4 v_a;
flat out vec4 v_b;
void main() {
  vec3 p = a_pos;
  if (u_style > 0.5) {
    // glass: the well sinks and the ring dips a hair when pressed
    p.y -= i_a.z * mix(0.006, 0.018, step(0.5, a_region));
  } else {
    // wheel: the ring and hub sink a little when pressed, the base disc sits to the front as a shadow
    p.y -= i_a.z * 0.006 * step(0.5, a_region);
    if (a_region < 0.5) {
      p.xz *= mix(1.0, 1.035, u_ink);
      p.z += mix(0.03, 0.06, u_ink);
    }
  }
  p *= 1.0 + i_a.w * 0.12;
  // wrong-fret feedback: the button shudders
  float shake = sin(u_time * 95.0) * 0.07 * i_b.x * i_b.x;
  v_world = p + vec3(i_a.x + shake, 0.0, 0.0);
  v_normal = a_normal;
  v_local = a_pos;
  v_region = a_region;
  v_a = i_a;
  v_b = i_b;
  gl_Position = u_vp * vec4(v_world, 1.0);
}`;

export const BUTTON_FS = `
in vec3 v_world;
in vec3 v_normal;
in vec3 v_local;
flat in float v_region;
flat in vec4 v_a;
flat in vec4 v_b;
out vec4 o;
uniform vec3 u_colors[8];
uniform vec3 u_cam;
uniform float u_style;
uniform float u_ink;
uniform vec3 u_inkCol;
${DOME_COMMON}
${ROOM_COMMON}
const float ZS = ${f(DOME_ZS)};

// Classic wheel: base disc (0), fret ring (1), well with spokes (2), hub dome (3).
vec4 wheel(vec3 N) {
  int ci = min(int(v_a.y), 4);
  float pressed = v_a.z;
  float flash = v_a.w;
  float wrong = v_b.x;
  float hold = v_b.y;
  float lit = clamp(pressed + hold + flash * 0.6, 0.0, 1.0);
  vec2 lp = vec2(v_local.x, v_local.z / ZS);
  float rr = length(lp);
  float reg = v_region;
  if (u_ink > 0.5) {
    vec3 ink = u_inkCol;
    vec3 c = ink;
    if (reg > 0.5 && reg < 1.5) {
      c = u_colors[ci];
      c = mix(c, vec3(0.97, 0.96, 0.94), lit * 0.4);
      c = mix(c, toLin(hexc(0xff3b4a)), wrong);
    } else if (reg > 2.5) {
      c = mix(ink, vec3(0.97, 0.96, 0.94), lit * (1.0 - smoothstep(0.05, 0.075, rr)));
    }
    return vec4(c, 1.0);
  }
  vec3 fretS = hexc(FRET[ci]);
  vec3 tintS = hexc(TINT[ci]);
  vec3 s;
  float emis = 1.0;
  if (reg < 0.5) {
    s = vec3(0.02);
  } else if (reg < 1.5) {
    // ring: flat when idle, a light-to-fret gradient with a strong glow when pressed
    float t = clamp(lp.y / 0.88 + 0.5, 0.0, 1.0);
    vec3 idle = fretS * (0.94 + 0.08 * (-lp.y / 0.44));
    vec3 lightS = mix(tintS, fretS, smoothstep(0.0, 0.9, t));
    s = mix(idle, lightS, lit);
    s *= 0.8 + 0.2 * N.y;
    s = mix(s, hexc(0xff3b4a), wrong);
    emis = 1.2 + 1.1 * lit + 1.6 * flash + 0.9 * wrong;
  } else if (reg < 2.5) {
    float ang = atan(lp.y, lp.x);
    float cell = fract(ang / 6.2831853 * 20.0);
    float spokes = step(cell, 0.3333) * smoothstep(0.135, 0.16, rr) * (1.0 - smoothstep(0.31, 0.335, rr));
    s = mix(hexc(0x0f0d0c), hexc(0x2a2725), spokes);
    s = mix(s, hexc(0x0a0908), smoothstep(0.33, 0.35, rr));
    s += fretS * 0.05 * lit;
  } else {
    vec3 hub = mix(hexc(0x4a4641), hexc(0x0f0d0c), smoothstep(0.0, 0.13, rr));
    hub = mix(hub, mix(hexc(0x8f8a82), hexc(0x3a3633), smoothstep(0.0, 0.06, rr)), 1.0 - smoothstep(0.05, 0.065, rr));
    s = hub;
  }
  return vec4(disp(s) * emis, 1.0);
}

uniform float u_lightBg;

// Crystal: a tinted glass ring and a clear well that floods with colour when pressed.
vec4 glassButton(vec3 N) {
  int ci = min(int(v_a.y), 4);
  vec3 col = u_colors[ci];
  float lit = clamp(v_a.z + v_b.y + v_a.w * 0.7, 0.0, 1.0);
  float wrong = v_b.x;
  vec3 V = normalize(u_cam - v_world);
  vec3 R = reflect(-V, N);
  float nv = max(dot(N, V), 1e-3);
  float F = schlick(0.04, nv);
  float rim = pow(1.0 - nv, 3.0);
  vec3 env = roomTrace(v_world + vec3(0.0, 0.02, 0.0), R, 0.1);
  if (v_region < 0.5) {
    float lb = u_lightBg;
    vec3 c = col * (mix(0.3, 0.55, lb) + 0.5 * lit + 1.5 * v_a.w) + env * F + vec3(1.0) * rim * 0.5 * (1.0 - 0.7 * lb);
    c = mix(c, vec3(1.2, 0.08, 0.06), wrong * 0.7);
    return vec4(c, mix(0.78, 0.95, lb) + 0.2 * lit);
  }
  float r = length(vec2(v_local.x, v_local.z / 0.72)) / 0.27;
  vec3 c = col * lit * (1.6 - r) + env * F;
  return vec4(c, 0.12 + 0.75 * lit + F);
}

void main() {
  vec3 N = normalize(v_normal);
  o = u_style > 0.5 ? glassButton(N) : wheel(N);
}`;

export const SUSTAIN_VS = `
layout(location=0) in vec2 a_su;
layout(location=1) in vec4 i_a; // x, zStart, zEnd, width
layout(location=2) in vec4 i_b; // color index, state, wobble, sp
uniform mat4 u_vp;
uniform float u_time;
uniform float u_style;
out vec2 v_su;
out float v_z;
flat out vec4 v_b;
flat out vec2 v_end;
void main() {
  float z = mix(i_a.y, i_a.z, a_su.x);
  float held = i_b.y == 1.0 ? 1.0 : 0.0;
  float wob = held * (0.025 + 0.09 * i_b.z) * sin(z * 2.2 + u_time * 18.0);
  vec3 p = vec3(i_a.x + a_su.y * i_a.w + wob, 0.03, z);
  v_su = a_su;
  v_z = z;
  v_b = i_b;
  v_end = vec2(i_a.z, i_a.w);
  gl_Position = u_vp * vec4(p, 1.0);
}`;

export const SUSTAIN_FS = `
in vec2 v_su;
in float v_z;
flat in vec4 v_b;
flat in vec2 v_end;
out vec4 o;
uniform vec3 u_colors[8];
uniform float u_len;
uniform float u_time;
uniform float u_style;
uniform float u_ink;
uniform vec3 u_inkCol;
uniform float u_dpr;
uniform float u_lightBg;
${DOME_COMMON}
void main() {
  vec3 base = v_b.w > 0.5 ? u_colors[6] : u_colors[int(v_b.x)];
  float u = abs(v_su.y);
  vec3 c;
  float state = v_b.y;   // 0 upcoming, 1 held, 2 dropped/missed
  vec3 grey = vec3(0.14, 0.14, 0.16);
  if (u_style > 0.5) {
    // Crystal: a clear tube, see-through in the middle, bright at the walls where light skims it
    float state = v_b.y;
    float fade = smoothstep(-u_len, -u_len * 0.75, v_z) * (1.0 - smoothstep(0.8, 2.6, v_z));
    float wall = pow(u, 5.0);
    float crest = exp(-pow((v_su.y + 0.3) / 0.12, 2.0));
    float flow = 0.5 + 0.5 * sin(v_z * 3.0 - u_time * (state == 1.0 ? 14.0 : 4.0) + v_su.y * 2.0);
    vec3 tint = state == 2.0 ? grey : base;
    vec3 c2 = tint * (0.25 + 0.6 * wall + (state == 1.0 ? 0.9 * flow : 0.15 * flow)) + vec3(1.0) * (crest * 0.6 + wall * 0.25);
    float a = 0.28 + 0.6 * wall + 0.3 * crest + (state == 1.0 ? 0.25 : 0.0);
    // light backgrounds: a denser, darker tube so it does not wash out
    c2 = mix(c2, tint * (0.35 + 0.5 * wall) + vec3(1.0) * crest * 0.35, u_lightBg);
    a = mix(a, 0.55 + 0.4 * wall, u_lightBg);
    o = vec4(c2, a * (1.0 - smoothstep(0.9, 1.0, u)) * fade);
    return;
  }
  {
    // Classic dome: a capsule, fret colour at the edges and a bright core stripe.
    float fwu = fwidth(v_su.y);
    // rounded far end: the distance to the tip, in half-widths
    float rw = min(v_end.y, 0.13);
    float tip = clamp((rw - (v_z - v_end.x)) / rw, 0.0, 1.0);
    float ur = tip > 0.0 ? length(vec2(u, tip)) : u;
    bool sp = v_b.w > 0.5;
    bool open = v_b.x > 4.5;
    float fade = smoothstep(-u_len, -u_len * 0.75, v_z) * (1.0 - smoothstep(0.8, 2.6, v_z));
    if (u_ink > 0.5) {
      float ow = clamp(4.5 * u_dpr * fwu, 0.06, 0.45);
      vec3 fill = open ? toLin(hexc(0xb04dff)) : base;
      if (sp) fill = toLin(hexc(0x9fe3f2));
      if (state == 2.0) fill = toLin(vec3(0.66, 0.64, 0.61));
      c = ur > 1.0 - ow ? u_inkCol : fill;
      o = vec4(c, (1.0 - smoothstep(1.0 - fwu * 1.5, 1.0, ur)) * fade);
      return;
    }
    vec3 fretS = open ? hexc(0xb04dff) : pow(base, vec3(1.0 / 2.2));
    if (sp) fretS = hexc(0x5fe6ff);
    float band = 1.0 - smoothstep(0.12, 0.42, u);
    vec3 coreS = mix(vec3(1.0), fretS, 0.1) * vec3(0.96, 1.0, 0.97);
    vec3 s = mix(fretS, coreS, band);
    float glow = 1.0 + 0.25 * band;
    if (state == 1.0) {
      // held: brighter, with ripples running up the core
      float ripple = 0.5 + 0.5 * sin(v_z * 7.0 - u_time * 26.0);
      s = mix(s, vec3(1.0), band * 0.25 * ripple);
      glow = 1.35 + 0.4 * band;
    } else if (state == 2.0) {
      s = mix(hexc(0x4a4641), hexc(0x8f8a82), band);
      glow = 1.0;
    } else {
      s *= 1.0 - 0.10 * band * step(0.5, fract(v_z * 2.2));
    }
    c = disp(s) * glow;
    o = vec4(c, (1.0 - smoothstep(0.86, 1.0, ur)) * fade);
    return;
  }
}`;

export const PARTICLE_VS = `
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_a; // position, size
layout(location=2) in vec4 i_b; // rgb, alpha
layout(location=3) in vec4 i_c; // stretch x, stretch y, shape, -
uniform mat4 u_vp;
uniform vec3 u_right;
uniform vec3 u_up;
out vec2 v_c;
flat out vec4 v_b;
flat out float v_shape;
void main() {
  vec3 p = i_a.xyz + (u_right * a_corner.x * i_c.x + u_up * a_corner.y * i_c.y) * i_a.w;
  v_c = a_corner;
  v_b = i_b;
  v_shape = i_c.z;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

export const PARTICLE_FS = `
in vec2 v_c;
flat in vec4 v_b;
flat in float v_shape;
out vec4 o;
void main() {
  float r = length(v_c);
  float a;
  if (v_shape < 0.5) a = exp(-r * r * 4.0);
  else if (v_shape < 1.5) a = exp(-v_c.x * v_c.x * 5.0) * smoothstep(1.0, -0.2, v_c.y) * smoothstep(-1.0, -0.6, v_c.y);
  else a = 1.0 - smoothstep(0.8, 0.9, r);
  o = vec4(v_b.rgb * a * v_b.a, 0.0);
}`;

export const BRIGHT_FS = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_threshold;
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float knee = u_threshold * 0.5;
  float soft = clamp(br - u_threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, br - u_threshold) / max(br, 1e-4);
  return c * contrib;
}
void main() {
  vec3 c = vec3(0.0);
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
  o = vec4(prefilter(min(c * 0.25, vec3(40.0))), 1.0);
}`;

export const DOWN_FS = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 0.5;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb * 0.125;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb * 0.125;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb * 0.125;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb * 0.125;
  o = vec4(c, 1.0);
}`;

export const UP_FS = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_weight;
void main() {
  vec3 c = vec3(0.0);
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.0, -1.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, -1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 0.0)).rgb * 2.0;
  c += texture(u_src, v_uv).rgb * 4.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 0.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(-1.0, 1.0)).rgb;
  c += texture(u_src, v_uv + u_texel * vec2(0.0, 1.0)).rgb * 2.0;
  c += texture(u_src, v_uv + u_texel * vec2(1.0, 1.0)).rgb;
  o = vec4(c / 16.0 * u_weight, 1.0);
}`;

export const COMPOSITE_FS = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomAmt;
uniform float u_miss;
uniform float u_sp;
uniform float u_vignette;
uniform float u_scan;
uniform float u_flat;   // 1 = no tone curve (flat inked look: colours land on screen as authored)
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(u_scene, v_uv).rgb;
  if (u_bloomAmt > 0.0) c += texture(u_bloom, v_uv).rgb * u_bloomAmt;
  // misses briefly drain colour and pull in a red edge
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(l), u_miss * 0.45);
  vec2 d = v_uv - 0.5;
  float edge = smoothstep(0.35, 0.75, length(d * vec2(1.2, 1.0)));
  c += vec3(0.5, 0.02, 0.02) * edge * u_miss * 0.6;
  c += vec3(0.02, 0.12, 0.25) * edge * u_sp * 0.5;
  if (u_flat > 0.5) {
    // soft shoulder above 0.97 keeps hot colours from clipping without touching paper white
    vec3 over = max(c - 0.97, vec3(0.0));
    c = min(c, vec3(0.97)) + 0.03 * (1.0 - exp(-over / 0.03));
  } else {
    c = aces(c * 1.05);
  }
  c *= 1.0 - edge * u_vignette;
  // CRT scanlines (Terminal theme)
  c *= 1.0 - u_scan * 0.16 * step(0.5, fract(gl_FragCoord.y * 0.5));
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
