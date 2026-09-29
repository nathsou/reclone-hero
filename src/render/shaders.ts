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
 * Studio skin: image-based light from an analytic photo studio, and reflection rays traced for real
 * against the other gems (as spheres, from u_gems) and the highway plane. Needs u_colors declared.
 */
const STUDIO_COMMON = `
uniform vec4 u_gems[32];   // x, y (sphere centre), z, colour index (+8 for star power)
uniform int u_gemCount;
const float GEM_R = 0.3;

float panel(float az, float el, float az0, float el0, float w, float h, float soft) {
  vec2 q = abs(vec2(az - az0, el - el0)) - vec2(w, h);
  return 1.0 - smoothstep(-soft, soft, max(q.x, q.y));
}

// A dark room: a big softbox over the far end of the highway, strip lights on both sides, a warm
// kicker behind the player. Roughness blurs the panels (and spreads their energy).
vec3 studioEnv(vec3 d, float rough) {
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
vec3 studioBoard(vec3 q) {
  if (abs(q.x) > 2.65 || q.z < -26.0 || q.z > 3.0) return vec3(0.003);
  float d = abs(fract(q.x) - 0.5);
  float line = (1.0 - smoothstep(0.0, 0.03, d)) * step(abs(q.x), 2.0);
  return vec3(0.012, 0.011, 0.012) + vec3(0.05) * line + vec3(0.4, 0.38, 0.35) * exp(-abs(q.z) * 12.0) * step(abs(q.x), 2.5);
}

// Nearest gem along a ray, ignoring the one the ray leaves from.
int studioHit(vec3 p, vec3 r, out float tHit) {
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

vec3 studioGemSeen(int i, vec3 n, vec3 r) {
  float w = u_gems[i].w;
  vec3 col = w >= 7.5 ? u_colors[6] : u_colors[int(w)];
  return col * (0.1 + 0.95 * max(n.y, 0.0)) + studioEnv(reflect(r, n), 0.15) * 0.05;
}

// Follow a reflected ray: other gems first, then the highway, then the room.
vec3 studioTrace(vec3 p, vec3 r, float rough) {
  float t;
  int hit = studioHit(p, r, t);
  float tPlane = r.y < -1e-4 ? -p.y / r.y : 1e9;
  if (hit >= 0 && t < tPlane) return studioGemSeen(hit, normalize(p + r * t - u_gems[hit].xyz), r);
  if (tPlane < 1e8) return studioBoard(p + r * tPlane);
  return studioEnv(r, rough);
}

float schlick(float f0, float cosT) {
  return f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
}
`;

/**
 * Liquid Glass: what is behind a surface (u_grab, a copy of the frame so far) seen through it, bent by
 * its normal, with each colour channel bent by a slightly different amount (dispersion).
 */
const GLASS_COMMON = `
uniform sampler2D u_grab;
uniform vec2 u_screen;
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
uniform float u_gloss;     // Studio skin: lacquered board with traced reflections and contact shadows
uniform float u_glass;     // Liquid Glass skin: the board is a flowing glass slab
${DOME_COMMON}
${STUDIO_COMMON}
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
    base = seen * vec3(0.9, 0.94, 1.0) * (0.92 - 0.1 * bevel) + vec3(0.012, 0.014, 0.018);
    // sky in the surface, and a bright rim along the bevel
    base += studioEnv(R, 0.25) * F * 0.35;
    base += vec3(1.0) * pow(bevel, 6.0) * (0.25 + 0.35 * max(R.y, 0.0));
    // light focused by the gems above: soft coloured caustics just in front of each gem
    for (int i = 0; i < 32; i++) {
      if (i >= u_gemCount) break;
      vec2 dd = v_pos.xz - u_gems[i].xz - vec2(0.0, 0.22);
      float w = u_gems[i].w;
      vec3 gc = w >= 7.5 ? u_colors[6] : u_colors[int(w)];
      float r2 = dd.x * dd.x * 6.0 + dd.y * dd.y * 10.0;
      base += gc * (exp(-r2 * 3.0) * 0.35 + exp(-r2 * 18.0) * 0.4);
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

  if (u_gloss > 0.5 && ax < u_half - 0.08) {
    // Contact shadows: each gem darkens the board under and just behind it.
    float ao = 1.0;
    for (int i = 0; i < 32; i++) {
      if (i >= u_gemCount) break;
      vec2 dd = v_pos.xz - u_gems[i].xz - vec2(0.0, 0.05);
      ao *= 1.0 - 0.6 * exp(-(dd.x * dd.x * 5.0 + dd.y * dd.y * 9.0));
    }
    base *= ao;
    // Reflections: trace the mirrored view ray into the gems. The room only adds its highlights, so
    // light boards stay light.
    vec3 V = normalize(u_cam - v_pos);
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    float F = schlick(0.035, max(V.y, 0.0));
    float t;
    int hit = studioHit(v_pos, R, t);
    if (hit >= 0) {
      vec3 q = v_pos + R * t;
      vec3 n = normalize(q - u_gems[hit].xyz);
      float w = u_gems[hit].w;
      vec3 col = w >= 7.5 ? u_colors[6] : u_colors[int(w)];
      // the gem's mirror image: soft at the silhouette, fading with distance from the surface; it
      // hides a little of the room's light, so it also reads on light boards
      float rim = smoothstep(0.0, 0.6, dot(n, -R));
      vec3 img = col * (0.25 + 0.9 * max(n.y + 0.35, 0.0)) + vec3(0.03);
      float k = clamp(F * 1.8, 0.08, 0.32) * rim * exp(-t * 1.1);
      base = base * (1.0 - 0.6 * k) + img * k;
    }
    base += studioEnv(R, 0.45) * F * 0.06;
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
  if (steel) {
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
uniform float u_style;   // 0 neon, 1 swiss, 2 baroque, 3 pixel, 4 clay, 5 classic dome
uniform float u_ink;     // 1 = flat inked look (dome only)
uniform vec3 u_inkCol;
uniform float u_dpr;
uniform float u_openL;   // half length of the straight part of the open-note bar
uniform mat4 u_view;
${DOME_COMMON}
${STUDIO_COMMON}
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

// Studio: lacquered body (0), polished bezel (1), glass lens (2); open bars use body (0) and top (1).
vec4 studio(vec3 N, vec3 V) {
  bool isOpen = v_b.x > 4.5;
  int ci = min(int(v_b.x), 5);
  float type = v_b.y;          // 0 strum, 1 hopo, 2 tap, 3 open
  float flags = v_b.z;
  bool sp = mod(flags, 2.0) >= 1.0;
  bool missed = flags >= 2.0;
  vec3 col = sp ? u_colors[6] : u_colors[ci];
  float fade = smoothstep(-u_len, -u_len * 0.75, v_world.z);
  vec3 p = v_world;
  float nv = max(dot(N, V), 1e-3);
  vec3 R = reflect(-V, N);
  float reg = v_region;
  // key light glint (the softbox's hot spot)
  float glint = pow(max(dot(R, normalize(vec3(0.0, 0.82, -0.57))), 0.0), 900.0) * 6.0;
  vec3 c;
  bool lensR = isOpen ? reg > 0.5 : reg > 1.5;
  bool bezelR = !isOpen && reg > 0.5 && reg < 1.5;
  if (bezelR) {
    // polished metal: silver, champagne on HOPOs, anodised fret colour on taps, ice on star power
    vec3 f0 = vec3(0.93, 0.91, 0.87);
    if (type == 1.0) f0 = vec3(0.96, 0.86, 0.66);
    if (type == 2.0) f0 = col * 0.9 + 0.06;
    if (sp) f0 = vec3(0.7, 0.9, 1.0);
    vec3 F = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
    c = F * studioTrace(p, R, 0.08) + glint * f0;
  } else if (lensR) {
    // glass: a dielectric reflection over light scattered in the coloured interior
    float F = schlick(0.04, nv);
    vec3 refl = studioTrace(p, R, 0.0);
    vec2 lp = isOpen ? vec2(0.0, v_local.z / 0.16) : vec2(v_local.x, v_local.z / 0.72) / 0.29;
    float depth = clamp(1.0 - length(lp), 0.0, 1.0);
    // light from the softbox refracts in and glows through the lens, brightest towards the far side
    vec3 T = refract(-V, N, 1.0 / 1.5);
    float through = 0.35 + 0.65 * smoothstep(-0.6, 0.4, -T.z);
    vec3 inner;
    if (type == 1.0) inner = mix(vec3(0.82, 0.8, 0.76), col, 0.25 + 0.5 * (1.0 - depth)) * (0.35 + 0.5 * through);
    else if (type == 2.0) inner = vec3(0.006) + col * 0.03 * depth;
    else inner = col * (0.12 + 1.15 * pow(depth, 1.4) * through);
    if (sp) inner = col * (0.6 + 2.2 * depth);
    c = mix(inner, refl, F) + glint;
  } else {
    // lacquered body with a clear coat: deep colour, sharp reflections at grazing angles
    float F = schlick(0.05, nv);
    vec3 base = type == 2.0 ? vec3(0.008) : col * 0.22;
    float wrap = 0.35 + 0.65 * max(N.y, 0.0);
    c = base * wrap + F * studioTrace(p, R, 0.15) + glint * 0.5;
  }
  if (missed) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = vec3(l) * 0.3 + vec3(0.01);
  }
  return vec4(c, fade);
}

// Liquid Glass bead: refracts the highway below it (with dispersion), reflects the room and its
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
  vec3 refl = studioTrace(v_world, R, 0.0);
  float glint = pow(max(dot(R, normalize(vec3(-0.35, 0.8, -0.5))), 0.0), 240.0) * 3.5;
  float rim = pow(1.0 - nv, 3.0);
  vec3 c = mix(trans, refl, F) + vec3(1.0) * glint + mix(vec3(1.0), tint, 0.5) * rim * 0.45;
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
  if (u_style > 6.5) {
    o = glassGem(N, V);
    return;
  }
  if (u_style > 5.5) {
    o = studio(N, V);
    return;
  }
  if (u_style > 4.5) {
    o = dome(N, V, L);
    return;
  }
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  int ci = int(v_b.x);
  float type = v_b.y;          // 0 strum, 1 hopo, 2 tap, 3 open
  float flags = v_b.z;
  bool sp = mod(flags, 2.0) >= 1.0;
  bool missed = flags >= 2.0;
  vec3 base = sp ? u_colors[6] : u_colors[ci];
  bool body = v_region < 0.5;
  bool rim = v_region > 0.5 && v_region < 1.5;

  vec3 c;
  if (u_style < 0.5) {
    // Neon: strum = white ring + black centre, HOPO = coloured ring + white centre, tap = dark gem outlined in colour.
    if (body) {
      vec3 b = type == 2.0 ? base * 0.08 : base;
      c = b * (0.2 + 0.65 * diff) + b * 0.18 + fres * base * 0.6;
    } else if (rim) {
      if (type == 0.0) c = vec3(0.95) * (0.5 + 0.5 * diff);
      else if (type == 3.0) c = base * 1.2 + vec3(0.1);
      else c = base * (type == 2.0 ? 2.6 : 1.7);
    } else {
      c = type == 1.0 ? vec3(1.5) + base * 0.2 : base * 0.04 + vec3(0.008);
    }
    c += spec * 0.7;
    if (sp) c += u_colors[6] * 0.25;
  } else if (u_style < 1.5) {
    // Swiss: flat colour, no light. Strum = solid dot, HOPO = bullseye, tap = ring.
    vec3 paper = vec3(0.9);
    if (type == 3.0 || body) c = base;
    else if (rim) c = type == 0.0 ? base : paper;
    else c = type == 2.0 ? paper : base;
    c *= N.y > 0.5 ? 1.0 : 0.6;
  } else if (u_style < 2.5) {
    // Baroque: faceted jewel in a gold bezel; pearl centre on HOPOs, onyx on taps.
    vec3 gold = vec3(0.85, 0.54, 0.16);
    if (rim) {
      c = gold * (0.15 + 0.55 * diff) + gold * pow(max(dot(reflect(-L, N), V), 0.0), 18.0) * 1.3 + fres * gold * 0.3;
    } else {
      vec3 j = (type == 2.0 && body) ? vec3(0.015) : base;
      if (!body && type == 1.0) j = vec3(0.93, 0.9, 0.84);
      float sparkle = pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * 3.0;
      c = j * (0.12 + 0.95 * diff) + j * 0.3 + sparkle + fres * j * 0.8;
    }
  } else if (u_style < 3.5) {
    // Pixel: flat blocks lit only by face direction. Strum = dark centre, HOPO = white centre, tap = hollow.
    float face = N.y > 0.5 ? 1.0 : (abs(N.x) > 0.5 ? 0.72 : 0.5);
    if (rim) c = type == 2.0 ? base : min(base * 1.35 + 0.12, vec3(1.0));
    else if (body) c = type == 2.0 ? base * 0.12 : base;
    else c = type == 1.0 ? vec3(0.98) : base * (type == 2.0 ? 0.12 : 0.3);
    c *= face;
  } else {
    // Clay: soft wrap lighting, matte, pastel. Tap = cream pebble with a coloured shoulder.
    float wrap = dot(N, L) * 0.5 + 0.5;
    vec3 cl = base;
    if (rim) cl = base * 1.06 + 0.03;
    else if (!body) cl = type == 1.0 ? vec3(0.95, 0.93, 0.9) : base * 0.82;
    if (type == 2.0 && !rim) cl = vec3(0.92, 0.9, 0.86);
    c = cl * (0.3 + 0.75 * wrap * wrap) + fres * 0.1;
  }

  if (missed) {
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = vec3(l) * 0.28 + vec3(0.02);
  }
  // Fade by transparency (not towards black) so distant notes melt into any background, light or dark.
  float fade = smoothstep(-u_len, -u_len * 0.75, v_world.z);
  o = vec4(c, fade);
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
  if (u_style > 5.5) {
    // studio and glass: the well sinks and the ring dips a hair when pressed
    p.y -= i_a.z * mix(0.006, 0.018, step(0.5, a_region));
  } else if (u_style > 4.5) {
    // wheel: the ring and hub sink a little when pressed, the base disc sits to the front as a shadow
    p.y -= i_a.z * 0.006 * step(0.5, a_region);
    if (a_region < 0.5) {
      p.xz *= mix(1.0, 1.035, u_ink);
      p.z += mix(0.03, 0.06, u_ink);
    }
  } else {
    p.y -= i_a.z * 0.035 * step(0.5, a_region + 0.6);
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
${STUDIO_COMMON}
const float ZS = ${f(DOME_ZS)};

// Studio: an anodised ring (0) reflecting the room and the incoming gems; a smoked-glass well (1)
// that fills with the fret colour when pressed.
vec4 bezelButton(vec3 N) {
  int ci = min(int(v_a.y), 4);
  vec3 col = u_colors[ci];
  float pressed = v_a.z;
  float flash = v_a.w;
  float wrong = v_b.x;
  float hold = v_b.y;
  float lit = clamp(pressed + hold + flash * 0.7, 0.0, 1.0);
  vec3 V = normalize(u_cam - v_world);
  vec3 R = reflect(-V, N);
  float nv = max(dot(N, V), 1e-3);
  vec3 c;
  if (v_region < 0.5) {
    vec3 f0 = mix(col * 0.85 + 0.05, vec3(1.0, 0.25, 0.2), wrong);
    vec3 F = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
    c = F * studioTrace(v_world + vec3(0.0, 0.02, 0.0), R, 0.28) * (1.0 + 1.5 * flash);
    c += col * (0.25 * lit + 0.8 * flash);
  } else {
    float r = length(vec2(v_local.x, v_local.z / 0.72)) / 0.27;
    float F = schlick(0.04, nv);
    vec3 glass = vec3(0.006) + col * lit * (1.8 - 1.1 * r) + col * flash * 2.5;
    glass = mix(glass, vec3(0.9, 0.02, 0.02), wrong * 0.6);
    c = mix(glass, studioTrace(v_world, R, 0.0), F);
  }
  return vec4(c, 1.0);
}

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

// Liquid Glass: a tinted glass ring and a clear well that floods with colour when pressed.
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
  vec3 env = studioTrace(v_world + vec3(0.0, 0.02, 0.0), R, 0.1);
  if (v_region < 0.5) {
    vec3 c = col * (0.3 + 0.5 * lit + 1.5 * v_a.w) + env * F + vec3(1.0) * rim * 0.5;
    c = mix(c, vec3(1.2, 0.08, 0.06), wrong * 0.7);
    return vec4(c, 0.78 + 0.2 * lit);
  }
  float r = length(vec2(v_local.x, v_local.z / 0.72)) / 0.27;
  vec3 c = col * lit * (1.6 - r) + env * F;
  return vec4(c, 0.12 + 0.75 * lit + F);
}

void main() {
  vec3 N = normalize(v_normal);
  if (u_style > 6.5) {
    o = glassButton(N);
    return;
  }
  if (u_style > 5.5) {
    o = bezelButton(N);
    return;
  }
  if (u_style > 4.5) {
    o = wheel(N);
    return;
  }
  vec3 V = normalize(u_cam - v_world);
  float diff = max(dot(N, normalize(vec3(-0.3, 1.0, 0.6))), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = u_colors[int(v_a.y)];
  float pressed = v_a.z;
  float flash = v_a.w;
  float wrong = v_b.x;
  float hold = v_b.y;
  vec3 c;
  bool ring = v_region < 0.5;
  if (u_style < 0.5) {
    if (ring) c = base * (0.3 + 0.5 * diff) + base * (0.25 + 0.9 * pressed + 2.5 * flash + hold * 0.8) + fres * base * 0.6;
    else {
      float r = length(v_world.xz - vec2(v_a.x, 0.0)) / 0.29;
      c = vec3(0.02) + base * (0.08 + pressed * (1.3 - 0.6 * r) + flash * 3.0 + hold * 1.5);
    }
  } else if (u_style < 1.5) {
    // Swiss: flat coloured ring, well fills with colour when pressed
    float lit = clamp(pressed + flash + hold, 0.0, 1.0);
    c = ring ? base * (N.y > 0.5 ? 1.0 : 0.6) : mix(vec3(0.06), base, lit) * 0.95;
  } else if (u_style < 2.5) {
    vec3 gold = vec3(0.85, 0.54, 0.16);
    if (ring) c = gold * (0.15 + 0.5 * diff) * (1.0 + 1.5 * flash) + gold * pow(max(dot(reflect(-normalize(vec3(-0.3, 1.0, 0.6)), N), V), 0.0), 18.0) * 1.2;
    else c = base * (0.4 + pressed * 0.9 + flash * 1.8 + hold * 1.0);
  } else if (u_style < 3.5) {
    float face = N.y > 0.5 ? 1.0 : 0.6;
    float lit = clamp(pressed + flash + hold, 0.0, 1.0);
    c = ring ? base * face * (0.75 + 0.25 * lit) : mix(vec3(0.03), base, lit);
  } else {
    float wrap = dot(N, normalize(vec3(-0.3, 1.0, 0.6))) * 0.5 + 0.5;
    float lit = clamp(pressed + flash * 0.8 + hold, 0.0, 1.0);
    c = ring ? base * (0.35 + 0.7 * wrap) : mix(vec3(0.85, 0.83, 0.8) * 0.35, base * 0.95, lit);
  }
  // wrong: the button goes dark with a hot red outline, distinct even on the red fret
  float outline = v_region < 0.5 ? 1.0 : 0.0;
  vec3 wrongCol = outline * vec3(2.2, 0.05, 0.03) * (0.6 + 0.4 * diff) + (1.0 - outline) * vec3(0.03, 0.0, 0.0);
  c = mix(c, wrongCol, wrong);
  o = vec4(c, 1.0);
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
  if (u_style > 2.5 && u_style < 3.5) wob = floor(wob * 25.0 + 0.5) / 25.0; // pixel: quantised wobble
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
${DOME_COMMON}
void main() {
  vec3 base = v_b.w > 0.5 ? u_colors[6] : u_colors[int(v_b.x)];
  float u = abs(v_su.y);
  float core = exp(-u * u * 7.0);
  float edge = 1.0 - smoothstep(0.75, 1.0, u);
  vec3 c;
  float state = v_b.y;   // 0 upcoming, 1 held, 2 dropped/missed
  vec3 grey = vec3(0.14, 0.14, 0.16);
  if (u_style > 6.5) {
    // Liquid Glass: a clear tube, see-through in the middle, bright at the walls where light skims it
    float state = v_b.y;
    float fade = smoothstep(-u_len, -u_len * 0.75, v_z) * (1.0 - smoothstep(0.8, 2.6, v_z));
    float wall = pow(u, 5.0);
    float crest = exp(-pow((v_su.y + 0.3) / 0.12, 2.0));
    float flow = 0.5 + 0.5 * sin(v_z * 3.0 - u_time * (state == 1.0 ? 14.0 : 4.0) + v_su.y * 2.0);
    vec3 tint = state == 2.0 ? grey : base;
    vec3 c2 = tint * (0.25 + 0.6 * wall + (state == 1.0 ? 0.9 * flow : 0.15 * flow)) + vec3(1.0) * (crest * 0.6 + wall * 0.25);
    float a = 0.28 + 0.6 * wall + 0.3 * crest + (state == 1.0 ? 0.25 : 0.0);
    o = vec4(c2, a * (1.0 - smoothstep(0.9, 1.0, u)) * fade);
    return;
  }
  if (u_style > 5.5) {
    // Studio: a glass rod lit from above, a bright specular line running down its crest
    float state = v_b.y;
    float fade = smoothstep(-u_len, -u_len * 0.75, v_z) * (1.0 - smoothstep(0.8, 2.6, v_z));
    float shade = sqrt(max(0.0, 1.0 - u * u));
    float crest = exp(-pow((v_su.y + 0.25) / 0.14, 2.0));
    vec3 body = base * (0.08 + 0.7 * shade);
    if (state == 1.0) body = base * (0.5 + 1.6 * shade) * (0.9 + 0.1 * sin(v_z * 7.0 - u_time * 26.0));
    if (state == 2.0) body = grey * 0.5 * shade;
    vec3 c2 = body + vec3(1.0, 0.98, 0.95) * crest * (state == 2.0 ? 0.08 : 0.55) + base * pow(1.0 - shade, 3.0) * 0.4;
    o = vec4(c2, (1.0 - smoothstep(0.82, 1.0, u)) * fade);
    return;
  }
  if (u_style > 4.5) {
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
  if (u_style < 0.5) {
    if (state == 1.0) {
      float shimmer = 0.85 + 0.15 * sin(v_z * 6.0 - u_time * 30.0);
      c = base * (0.5 + 1.7 * core * shimmer) + vec3(0.22) * core * core;
    } else if (state == 2.0) c = vec3(0.12, 0.12, 0.14) * (0.5 + core);
    else c = base * (0.25 + 0.8 * core);
  } else if (u_style < 1.5) {
    // Swiss: a crisp flat bar
    edge = step(u, 0.62);
    c = state == 2.0 ? grey * 2.5 : base * (state == 1.0 ? 1.0 : 0.72);
  } else if (u_style < 2.5) {
    // Baroque: gilded edges around a jewel-coloured centre
    vec3 gold = vec3(1.0, 0.66, 0.22) * (state == 2.0 ? 0.25 : 0.9);
    vec3 centre = state == 2.0 ? grey : base * (state == 1.0 ? 1.5 : 0.6);
    c = mix(centre, gold, smoothstep(0.45, 0.6, u));
    edge = 1.0 - smoothstep(0.85, 1.0, u);
  } else if (u_style < 3.5) {
    // Pixel: hard-edged stepped blocks
    edge = step(u, 0.7);
    float step8 = step(0.5, fract(v_z * 2.0));
    c = (state == 2.0 ? grey * 2.0 : base * (state == 1.0 ? 1.1 : 0.7)) * mix(0.82, 1.0, step8);
  } else {
    // Clay: a soft rounded rope
    float shade = sqrt(max(0.0, 1.0 - u * u));
    c = (state == 2.0 ? grey * 2.5 : base * (state == 1.0 ? 1.0 : 0.75)) * (0.35 + 0.7 * shade);
    edge = 1.0 - smoothstep(0.8, 1.0, u);
  }
  float fade = smoothstep(-u_len, -u_len * 0.75, v_z) * (1.0 - smoothstep(0.8, 2.6, v_z));
  o = vec4(c, edge * fade);
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
  else if (v_shape < 2.5) a = step(max(abs(v_c.x), abs(v_c.y)), 0.75);
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
