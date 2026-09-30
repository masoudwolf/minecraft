// ─── Shared GLSL snippets for the graphics pack (noise / shadow / helpers) ────
// Kept as strings so the sky dome, clouds, water and grass shaders all reuse
// exactly the same math (no per-material drift).

/** hash + value-noise + fbm (2D) — cheap, seam-free, deterministic */
export const GLSL_NOISE = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.03;
      a *= 0.5;
    }
    return v;
  }
  float fbm3(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = rot * p * 2.11;
      a *= 0.5;
    }
    return v;
  }
`;

/** RGBA-packed depth unpack (three.js RGBADepthPacking shadow maps) */
export const GLSL_SHADOW = /* glsl */ `
  float gfxUnpackDepth(vec4 c) {
    return c.r + c.g / 255.0 + c.b / 65025.0 + c.a / 16581375.0;
  }
  // Returns 1.0 when LIT, 0.0 when shadowed. 4-tap PCF.
  float gfxShadow(sampler2D map, mat4 shadowMat, vec2 texel, vec3 wp, vec3 nrm) {
    vec4 sc = shadowMat * vec4(wp + nrm * 0.035, 1.0);
    vec3 s = sc.xyz / sc.w;
    s = s * 0.5 + 0.5;
    if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
    if (s.z <= 0.0) return 1.0;
    float depth = s.z - 0.0015;
    float lit = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 off = vec2(
        (i == 1 ? -1.0 : (i == 2 ? 1.0 : 0.0)),
        (i == 3 ? -1.0 : (i == 1 ? 1.0 : (i == 2 ? -1.0 : 0.0)))
      ) * texel;
      float d = gfxUnpackDepth(texture2D(map, s.xy + off));
      lit += step(depth, d);
    }
    return lit * 0.25;
  }
`;
