// GLSL ES 3.0 sources (the #version header is prepended by program()).

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
void main() {
  vec2 uv = (v_uv - 0.5) * u_cover * (0.92 - 0.015 * u_beat) + 0.5;
  uv += vec2(sin(u_time * 0.05), cos(u_time * 0.037)) * 0.015;
  vec3 c;
  if (u_hasTex > 0.5) {
    c = textureLod(u_tex, uv, u_lod).rgb;
    c = pow(c, vec3(2.2));
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = mix(vec3(l), c, 0.8) * u_bright;
  } else {
    float g = 0.5 + 0.5 * sin(v_uv.x * 3.0 + u_time * 0.1) * cos(v_uv.y * 2.0 - u_time * 0.07);
    c = mix(vec3(0.012, 0.01, 0.03), vec3(0.03, 0.012, 0.05), g);
  }
  c += u_tint * 0.04;
  float vig = smoothstep(1.25, 0.3, length(v_uv - vec2(0.5, 0.45)) * 1.6);
  if (u_light > 0.5) {
    // Pale, lightly tinted by the album art; the dark highway stands on it like a fretboard.
    vec3 paper = mix(vec3(0.9, 0.88, 0.96), vec3(0.8, 0.82, 0.92), v_uv.y);
    vec3 art = c / max(u_bright, 1e-3);
    c = mix(paper, paper * (0.75 + 0.5 * art), u_hasTex * 0.35) + u_tint * 0.08;
    o = vec4(c * mix(0.9, 1.0, vig) * (1.0 + 0.03 * u_beat), 1.0);
    return;
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
uniform float u_lanes[5];
uniform vec3 u_laneCol[5];


void main() {
  float x = v_pos.x;
  float z = v_pos.z;
  float ax = abs(x);
  float track = z - u_time * u_speed;     // world position locked to the chart, scrolls with notes

  vec3 base = mix(vec3(0.008, 0.008, 0.016), vec3(0.03, 0.028, 0.05), smoothstep(-u_len, 0.0, z));
  // solo sections tint the lane surface
  base = mix(base, vec3(0.045, 0.02, 0.065), u_solo * 0.85);
  // alternate lane shading helps read which lane a gem is in
  float laneIdx = floor(x + 2.5);
  base *= 1.0 + 0.12 * mod(laneIdx, 2.0);
  // soft sheen that scrolls with the chart so the surface reads as moving
  base += vec3(0.012, 0.012, 0.02) * (0.5 + 0.5 * sin(track * 0.8 + x * 0.6));

  // lane separators
  float d = abs(fract(x) - 0.5);
  float sep = (1.0 - smoothstep(0.0, 0.02, d)) * step(ax, 2.0);
  base += vec3(0.06, 0.06, 0.09) * sep;

  // lane glow while a fret is held
  float lane = floor(x + 2.5);
  if (lane >= 0.0 && lane <= 4.0) {
    float held = u_lanes[int(lane)];
    float fall = exp(z * 0.45);
    base += u_laneCol[int(lane)] * 0.07 * held * fall * (1.0 - smoothstep(0.3, 0.5, abs(fract(x + 0.5) - 0.5)));
  }

  // star power: electric blue surface with travelling waves
  if (u_sp > 0.0) {
    float wave = 0.5 + 0.5 * sin(track * 0.9 + sin(x * 1.3 + u_time * 2.0) * 0.8);
    float bolt = pow(0.5 + 0.5 * sin(track * 0.35 - x * 2.1 + sin(track * 1.7) * 1.5), 12.0);
    base = mix(base, vec3(0.008, 0.03, 0.07) + vec3(0.02, 0.09, 0.2) * wave * 0.5 + vec3(0.1, 0.35, 0.8) * bolt * 0.35, u_sp);
  }

  // side rails
  float railD = ax - (u_half - 0.09);
  float rail = smoothstep(-0.02, 0.01, railD) * (1.0 - smoothstep(0.08, 0.1, railD));
  vec3 railCol = mix(u_rail, vec3(1.3, 0.08, 0.06), u_miss);
  float railPulse = 0.8 + 0.2 * sin(track * 1.5);
  base = mix(base, railCol * railPulse, rail);
  // inner glow from the rails
  base += railCol * 0.12 * exp(-max(0.0, -railD) * 5.0) * (1.0 - rail);

  // strike line
  float strike = exp(-abs(z) * 14.0);
  base += vec3(0.5, 0.5, 0.6) * strike * 0.5 * step(ax, u_half - 0.1);

  // fade into the distance and just behind the strike line
  float a = smoothstep(-u_len, -u_len * 0.7, z) * (1.0 - smoothstep(1.4, 3.0, z));
  float edge = 1.0 - smoothstep(u_half - 0.005, u_half, ax);
  o = vec4(base, a * edge);
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
void main() {
  float a = (1.0 - abs(v_v)) * v_b * smoothstep(-u_len, -u_len * 0.7, v_z);
  o = vec4(u_col * a, 0.0);
}`;

export const LIT_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_region;
layout(location=3) in vec4 i_a; // x, y, z, scale
layout(location=4) in vec4 i_b; // color index, type, flags, extra
uniform mat4 u_vp;
uniform float u_hopoScale;
out vec3 v_world;
out vec3 v_normal;
flat out float v_region;
flat out vec4 v_b;
void main() {
  float s = i_a.w;
  vec3 p = a_pos * s;
  if (i_b.y == 1.0) p *= vec3(u_hopoScale, u_hopoScale * 0.85, u_hopoScale);
  v_world = p + i_a.xyz;
  v_normal = a_normal;
  v_region = a_region;
  v_b = i_b;
  gl_Position = u_vp * vec4(v_world, 1.0);
}`;

export const GEM_FS = `
in vec3 v_world;
in vec3 v_normal;
flat in float v_region;
flat in vec4 v_b;
out vec4 o;
uniform vec3 u_colors[8];
uniform vec3 u_cam;
uniform float u_len;
void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cam - v_world);
  vec3 L = normalize(vec3(-0.3, 1.0, 0.6));
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  int ci = int(v_b.x);
  float type = v_b.y;          // 0 strum, 1 hopo, 2 tap, 3 open
  float flags = v_b.z;
  bool sp = mod(flags, 2.0) >= 1.0;
  bool missed = flags >= 2.0;
  vec3 base = sp ? u_colors[6] : u_colors[ci];

  // Visual language: strum = white ring + black centre, HOPO = coloured ring + white centre,
  // tap = dark gem outlined in colour. Open notes are bars; star power recolours the body.
  vec3 c;
  if (v_region < 0.5) {
    vec3 body = type == 2.0 ? base * 0.08 : base;
    c = body * (0.2 + 0.65 * diff) + body * 0.18 + fres * base * 0.6;
  } else if (v_region < 1.5) {
    if (type == 0.0) c = vec3(0.95) * (0.5 + 0.5 * diff);
    else if (type == 3.0) c = base * 1.2 + vec3(0.1);
    else c = base * (type == 2.0 ? 2.6 : 1.7);
  } else {
    if (type == 1.0) c = vec3(1.5) + base * 0.2;
    else c = base * 0.04 + vec3(0.008);
  }
  c += spec * 0.7;
  if (sp) c += u_colors[6] * 0.25;

  if (missed) {
    float l = dot(c, vec3(0.3, 0.59, 0.11));
    c = vec3(l) * 0.28 + vec3(0.02);
  }
  float fade = smoothstep(-u_len, -u_len * 0.75, v_world.z);
  o = vec4(c * fade, 1.0);
}`;

export const BUTTON_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_region;
layout(location=3) in vec4 i_a; // x, color index, pressed, hit flash
layout(location=4) in vec4 i_b; // wrong flash, sustain glow, -, -
uniform mat4 u_vp;
uniform float u_time;
out vec3 v_world;
out vec3 v_normal;
flat out float v_region;
flat out vec4 v_a;
flat out vec4 v_b;
void main() {
  vec3 p = a_pos;
  p.y -= i_a.z * 0.035 * step(0.5, a_region + 0.6);
  p *= 1.0 + i_a.w * 0.12;
  // wrong-fret feedback: the button shudders
  float shake = sin(u_time * 95.0) * 0.07 * i_b.x * i_b.x;
  v_world = p + vec3(i_a.x + shake, 0.0, 0.0);
  v_normal = a_normal;
  v_region = a_region;
  v_a = i_a;
  v_b = i_b;
  gl_Position = u_vp * vec4(v_world, 1.0);
}`;

export const BUTTON_FS = `
in vec3 v_world;
in vec3 v_normal;
flat in float v_region;
flat in vec4 v_a;
flat in vec4 v_b;
out vec4 o;
uniform vec3 u_colors[8];
uniform vec3 u_cam;
void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cam - v_world);
  float diff = max(dot(N, normalize(vec3(-0.3, 1.0, 0.6))), 0.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = u_colors[int(v_a.y)];
  float pressed = v_a.z;
  float flash = v_a.w;
  float wrong = v_b.x;
  float hold = v_b.y;
  vec3 c;
  if (v_region < 0.5) {
    c = base * (0.3 + 0.5 * diff) + base * (0.25 + 0.9 * pressed + 2.5 * flash + hold * 0.8) + fres * base * 0.6;
  } else {
    float r = length(v_world.xz - vec2(v_a.x, 0.0)) / 0.29;
    vec3 well = vec3(0.02) + base * (0.08 + pressed * (1.3 - 0.6 * r) + flash * 3.0 + hold * 1.5);
    c = well;
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
out vec2 v_su;
out float v_z;
flat out vec4 v_b;
void main() {
  float z = mix(i_a.y, i_a.z, a_su.x);
  float held = i_b.y == 1.0 ? 1.0 : 0.0;
  float wob = held * (0.025 + 0.09 * i_b.z) * sin(z * 2.2 + u_time * 18.0);
  vec3 p = vec3(i_a.x + a_su.y * i_a.w + wob, 0.03, z);
  v_su = a_su;
  v_z = z;
  v_b = i_b;
  gl_Position = u_vp * vec4(p, 1.0);
}`;

export const SUSTAIN_FS = `
in vec2 v_su;
in float v_z;
flat in vec4 v_b;
out vec4 o;
uniform vec3 u_colors[8];
uniform float u_len;
uniform float u_time;
void main() {
  vec3 base = v_b.w > 0.5 ? u_colors[6] : u_colors[int(v_b.x)];
  float u = abs(v_su.y);
  float core = exp(-u * u * 7.0);
  float edge = 1.0 - smoothstep(0.75, 1.0, u);
  vec3 c;
  float state = v_b.y;
  if (state == 1.0) {
    float shimmer = 0.85 + 0.15 * sin(v_z * 6.0 - u_time * 30.0);
    c = base * (0.5 + 1.7 * core * shimmer) + vec3(0.22) * core * core;
  } else if (state == 2.0) {
    c = vec3(0.12, 0.12, 0.14) * (0.5 + core);
  } else {
    c = base * (0.25 + 0.8 * core);
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
  else a = exp(-v_c.x * v_c.x * 5.0) * smoothstep(1.0, -0.2, v_c.y) * smoothstep(-1.0, -0.6, v_c.y);
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
uniform float u_light;
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
  c = aces(c * 1.05);
  c *= 1.0 - edge * mix(0.35, 0.08, u_light);
  o = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
