// ─── Enhanced water — shader-pack style: planar reflections, wave normals,
// fresnel, HDR sun glints, shadow-aware sky light. Keeps the original attribute
// contract (aShade/aSky/aBlock/aTint + uv) and uniform names so the voxel
// pipeline (applySkyFog) keeps working unchanged.

import * as THREE from 'three';
import { GLSL_NOISE, GLSL_SHADOW } from './glsl';
import { SKY_COLOR_GLSL } from './atmosphere';

/** world Y of the reflection plane (sea-level water surface) */
export const WATER_PLANE_Y = 40.875;

const VERT = /* glsl */ `
  attribute float aShade;
  attribute float aSky;
  attribute float aBlock;
  attribute vec3 aTint;
  varying vec2 vUv;
  varying float vShade;
  varying float vSky;
  varying float vBlock;
  varying vec3 vTint;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  varying vec4 vMirrorCoord;
  uniform float uTime;
  uniform float uWave;
  uniform mat4 uReflMatrix;
  void main() {
    vUv = uv;
    vShade = aShade;
    vSky = aSky;
    vBlock = aBlock;
    vTint = aTint;
    vec3 pos = position;
    vec4 wp0 = modelMatrix * vec4(position, 1.0);
    if (uWave > 0.5) {
      // (world-space phases so chunk seams never tear — original engine rule)
      float isTop = step(0.8, fract(position.y));
      float wave = sin(uTime * 1.6 + wp0.x * 0.9 + wp0.z * 0.7) * 0.03
                 + sin(uTime * 2.7 + wp0.x * 1.9 - wp0.z * 1.4) * 0.015;
      pos.y += (wave - 0.045) * isTop;
    }
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vMirrorCoord = uReflMatrix * wp;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uSunLevel;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlphaTest;
  // reflection
  uniform float uHasRefl;
  uniform sampler2D uReflMap;
  // waves / sun
  uniform vec3 uSunDirW;
  uniform vec3 uSunColorW;
  uniform float uWaterQ;      // 0 basic · 1 reflective · 2 ultra
  uniform float uTime;
  // shadows
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform vec2 uShadowTexel;
  uniform float uShadowStrength;
  varying vec2 vUv;
  varying float vShade;
  varying float vSky;
  varying float vBlock;
  varying vec3 vTint;
  varying float vFogDepth;
  varying vec3 vWorldPos;
  varying vec4 vMirrorCoord;
  ${GLSL_NOISE}
  ${GLSL_SHADOW}
  ${SKY_COLOR_GLSL}

  // animated wave height field (world xz)
  float waveH(vec2 p) {
    float t = uTime;
    return fbm3(p * 0.9 + vec2(t * 0.6, t * 0.42))
         + fbm3(p * 2.1 - vec2(t * 0.85, t * 0.3)) * 0.5;
  }

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < uAlphaTest) discard;

    // ── animated normal from the wave height field ──
    float e = 0.16;
    vec2 p = vWorldPos.xz;
    float h0 = waveH(p);
    float hx = waveH(p + vec2(e, 0.0));
    float hz = waveH(p + vec2(0.0, e));
    float strength = mix(0.55, 1.0, clamp(uWaterQ, 0.0, 1.0));
    vec3 nrm = normalize(vec3(-(hx - h0) * strength * 2.2, 1.0, -(hz - h0) * strength * 2.2));

    // flat faces always face up (top surface); underside handled below
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    bool under = !gl_FrontFacing;

    // ── shadowed voxel sky-light ──
    // A shadow blocks the DIRECT sun, but ambient sky light still reaches the
    // surface — and a mirror keeps reflecting the sky above it regardless of
    // what stands on the shore. Water keeps 62% ambient in shadow so tree/
    // hill shadows read as gentle blue-tinted darkening, never pitch black.
    float sf = 1.0;
    if (uShadowStrength > 0.001 && !under) {
      float ndl = clamp(dot(vec3(0.0, 1.0, 0.0), uSunDirW), 0.0, 1.0);
      sf = gfxShadow(uShadowMap, uShadowMatrix, uShadowTexel, vWorldPos, vec3(0.0, 1.0, 0.0), ndl);
      sf = mix(1.0, sf, uShadowStrength);
    }
    float sunKeep = mix(sf, 1.0, 0.62);
    float light = max(vBlock, vSky * uSunLevel * sunKeep);
    light = clamp(light, 0.045, 1.0);
    float l = pow(light, 1.15);
    vec3 shadowTint = mix(vec3(0.80, 0.86, 1.08), vec3(1.0), sf);
    vec3 baseCol = mix(tex.rgb, vec3(0.16, 0.42, 0.55), 0.72) * vTint;

    vec3 col = baseCol * vShade * l * shadowTint;

    // ── reflection + fresnel + sun glint (top faces only) ──
    float fres = 0.0;
    if (!under) {
      vec3 reflDir = reflect(-viewDir, nrm);
      fres = 0.025 + 0.975 * pow(1.0 - max(dot(viewDir, nrm), 0.0), 5.0);
      fres = mix(fres, clamp(fres * 1.25, 0.0, 1.0), 0.5);

      vec3 reflCol;
      vec3 skyRefl = gfxSkyColor(reflDir, false);
      if (uHasRefl > 0.5) {
        vec2 uvR = vMirrorCoord.xy / max(vMirrorCoord.w, 1e-4);
        float distFade = clamp(90.0 / max(vFogDepth, 8.0), 0.12, 1.0);
        uvR += nrm.xz * vec2(0.055, 0.11) * distFade * (uWaterQ >= 1.5 ? 1.35 : 0.8);
        if (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0) {
          reflCol = texture2D(uReflMap, uvR).rgb;
          reflCol = mix(reflCol, skyRefl, 0.22);
          // RT-hole guard: a mirror can never be darker than faint sky
          reflCol = max(reflCol, skyRefl * 0.05);
        } else {
          reflCol = skyRefl;
        }
      } else {
        reflCol = skyRefl;
      }

      // reflections stay alive in shadow — the sky is still above the water
      float rl = max(l, 0.62);
      col = mix(col, reflCol * rl * shadowTint, clamp(fres, 0.0, 0.92));

      // HDR sun glint (feeds bloom → sparkling highlights)
      vec3 R = reflect(-viewDir, nrm);
      float shin = mix(120.0, 340.0, clamp(uWaterQ * 0.5, 0.0, 1.0));
      float spec = pow(max(dot(R, uSunDirW), 0.0), shin);
      col += uSunColorW * spec * 2.6 * uSunLevel * sf;
    } else {
      // seen from below: murkier, sky-tinted, gently lit
      col = mix(baseCol * l, vec3(0.10, 0.30, 0.46), 0.55) * vShade;
    }

    float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fogF);
    float alpha = under ? 0.92 : mix(0.78, 0.94, clamp(0.4 + fres, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

export interface WaterExtras {
  uReflMatrix: { value: THREE.Matrix4 };
  uHasRefl: { value: number };
  uReflMap: { value: THREE.Texture | null };
  uSunDirW: { value: THREE.Vector3 };
  uSunColorW: { value: THREE.Color };
  uWaterQ: { value: number };
  uShadowMap: { value: THREE.Texture | null };
  uShadowMatrix: { value: THREE.Matrix4 };
  uShadowTexel: { value: THREE.Vector2 };
  uShadowStrength: { value: number };
}

export function createWaterMaterial(texture: THREE.Texture): THREE.ShaderMaterial {
  const extras: WaterExtras = {
    uReflMatrix: { value: new THREE.Matrix4() },
    uHasRefl: { value: 0 },
    uReflMap: { value: null },
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uSunColorW: { value: new THREE.Color(1, 1, 1) },
    uWaterQ: { value: 1 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
    uShadowStrength: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uAtlas: { value: texture },
      uSunLevel: { value: 1 },
      uFogColor: { value: new THREE.Color(0x9fc7ff) },
      uFogNear: { value: 60 },
      uFogFar: { value: 120 },
      uAlphaTest: { value: 0.05 },
      uTime: { value: 0 },
      uWave: { value: 1 },
      ...extras,
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}
