// ─── Post-processing stack (shader-pack look): HDR render → bloom → god rays
// → ACES color grade (+ underwater wobble) → sRGB output → FXAA.
// EffectComposer defaults to HalfFloat RTs in modern three, so the HDR sun disk
// survives into bloom/god-rays exactly like SEUS-style pipelines.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSunPos: { value: new THREE.Vector2(-1, -1) },
    uStrength: { value: 0.7 },
    uSamples: { value: 40 },
    uFlare: { value: 0.55 },   // lens flare intensity (0 = off)
    uAspect: { value: 1.777 }, // screen aspect — keeps ghosts circular
    // v0.47: occlusion × facing gate for the flare overlays ONLY. The radial
    // god-ray blur stays frame-driven (bright pixels = shafts through windows
    // even when the sun disk itself is behind a wall), but the streak/ghosts/
    // halo are pure math overlays — without this gate they drew straight
    // through terrain, so a player indoors staring at a wall saw a giant sun
    // blob in the middle of the room (user report).
    uVis: { value: 1 },
    // ── volumetric light shafts (SEUS/BSL "volumetric lighting") ──
    // ray-march camera→pixel through the air, sample the SUN SHADOW MAP at
    // each step: air under a roof reads shadowed, air inside a window beam
    // reads lit — the lit/shadowed contrast along each view ray paints real
    // light shafts entering houses, dappled canopy light and horizon haze.
    uDepthTex: { value: null as THREE.Texture | null },
    uInvVP: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uLightDirW: { value: new THREE.Vector3(0, 1, 0) }, // TO the light (sun or moon)
    uVlsColor: { value: new THREE.Color(1, 1, 1) },    // light color × level
    uVls: { value: 0 },                                 // master strength (0 = off)
    uVlsSteps: { value: 10 },
    uShadowMap: { value: null as THREE.Texture | null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uHasDepth: { value: 0 }, // GLSL can't compare samplers to null — CPU flips this
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunPos;
    uniform float uStrength;
    uniform float uSamples;
    uniform float uFlare;
    uniform float uAspect;
    uniform float uVis;
    uniform sampler2D uDepthTex;
    uniform mat4 uInvVP;
    uniform vec3 uCamPos;
    uniform vec3 uLightDirW;
    uniform vec3 uVlsColor;
    uniform float uVls;
    uniform float uVlsSteps;
    uniform sampler2D uShadowMap;
    uniform mat4 uShadowMatrix;
    uniform float uHasDepth;
    varying vec2 vUv;
    float gfxUnpackDepth(vec4 c) {
      return c.r + c.g / 255.0 + c.b / 65025.0 + c.a / 16581375.0;
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // wide off-screen tolerance: indoor window/door shafts keep working even
      // when the sun disk itself is well outside the frame
      bool sunOff = uStrength <= 0.001 && uVls <= 0.001;
      if (sunOff) { gl_FragColor = base; return; }

      // ── volumetric light shafts (ray-march, shadow-map gated) ──
      vec3 col = base.rgb;
      if (uVls > 0.001 && uHasDepth > 0.5) {
        float d = texture2D(uDepthTex, vUv).x;
        vec4 wp4 = uInvVP * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vec3 wp = wp4.xyz / max(wp4.w, 1e-4);
        vec3 ray = wp - uCamPos;
        float fullDist = length(ray);
        vec3 dir = ray / max(fullDist, 1e-4);
        float march = min(fullDist, 150.0);
        float stepLen = march / max(uVlsSteps, 1.0);
        // interleaved-gradient jitter kills banding at low step counts
        float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float scat = 0.0;
        for (int i = 0; i < 16; i++) {
          if (float(i) >= uVlsSteps) break;
          vec3 p = uCamPos + dir * ((float(i) + jitter) * stepLen);
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          vec3 s = sc.xyz / max(sc.w, 1e-4);
          s = s * 0.5 + 0.5;
          float vis = 1.0;
          if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z > 0.0 && s.z < 1.0) {
            vis = step(s.z - 0.0016, gfxUnpackDepth(texture2D(uShadowMap, s.xy)));
          }
          scat += vis;
        }
        scat /= max(uVlsSteps, 1.0);
        // forward-scatter peak (Henyey-Greenstein flavor, g≈0.55) + height fade
        float phase = 0.55 + 0.45 * pow(max(dot(dir, uLightDirW), 0.0), 6.0);
        float hf = exp(-max(uCamPos.y - 42.0, 0.0) * 0.012);
        col += uVlsColor * (scat * phase * hf) * uVls;
      }

      // screen-space radial god rays — frame-driven (bright pixels along the
      // sun ray), so shafts through windows survive even with the sun off-screen
      if (uStrength > 0.001) {
        vec2 dir = (uSunPos - vUv) / max(uSamples, 1.0);
        vec2 uv = vUv;
        float w = 1.0;
        vec3 acc = vec3(0.0);
        float total = 0.0;
        for (int i = 0; i < 48; i++) {
          if (float(i) >= uSamples) break;
          uv += dir;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float lum = dot(s, vec3(0.299, 0.587, 0.114));
          float k = smoothstep(0.5, 1.9, lum);
          acc += s * k * w;
          total += w;
          w *= 0.955;
        }
        acc /= max(total, 1e-4);
        float dist = distance(vUv, uSunPos);
        float falloff = smoothstep(1.55, 0.05, dist);
        col += acc * uStrength * falloff;
      }

      // ── cinematic lens flare (BSL/Complementary style) ──
      // anamorphic horizontal streak through the sun + three ghosts chasing
      // the sun-to-center axis. v0.47: gated by uVis = voxel-raycast sun
      // occlusion × camera-facing — walls between you and the sun now kill
      // the flare, and turning away from it fades it out (user report: giant
      // sun blob indoors while staring at a wall).
      if (uFlare > 0.001 && uVis > 0.001 && uSunPos.x > -0.55 && uSunPos.x < 1.55 && uSunPos.y > -0.55 && uSunPos.y < 1.55) {
        vec2 toC = 0.5 - uSunPos;
        float vis = clamp(uStrength * 1.3, 0.0, 1.0);
        // anamorphic streak: wide horizontally, razor thin vertically
        float sy = abs(vUv.y - uSunPos.y);
        float sx = abs(vUv.x - uSunPos.x);
        float streak = exp(-sy * 130.0) * exp(-sx * 4.2);
        vec3 flare = vec3(0.42, 0.62, 1.0) * streak * 0.42;
        // ghosts along the sun↔center axis (aspect-corrected radius)
        for (int gi = 0; gi < 3; gi++) {
          float k = gi == 0 ? -0.42 : (gi == 1 ? 0.32 : 0.78);
          vec2 gp = uSunPos + toC * k;
          vec2 d2 = vec2((vUv.x - gp.x) * uAspect, vUv.y - gp.y);
          float rad = gi == 0 ? 0.055 : (gi == 1 ? 0.10 : 0.035);
          float halo = smoothstep(rad, 0.0, length(d2));
          vec3 gc = gi == 0 ? vec3(1.0, 0.72, 0.42) : (gi == 1 ? vec3(0.5, 0.85, 1.0) : vec3(1.0, 0.9, 0.62));
          flare += gc * halo * halo * (gi == 1 ? 0.10 : 0.16);
        }
        // halo ring right around the sun
        float ring = smoothstep(0.05, 0.10, dist) * smoothstep(0.30, 0.13, dist);
        flare += vec3(1.0, 0.82, 0.58) * ring * ring * 0.30;
        col += flare * uFlare * vis * uVis;
      }
      gl_FragColor = vec4(col, base.a);
    }
  `,
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.02 },
    uVignette: { value: 0.32 },
    uUnderwater: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uUnderwater;
    uniform float uTime;
    varying vec2 vUv;
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    void main() {
      vec2 uv = vUv;
      if (uUnderwater > 0.001) {
        uv.x += sin(uv.y * 22.0 + uTime * 1.5) * 0.0017 * uUnderwater;
        uv.y += cos(uv.x * 18.0 + uTime * 1.2) * 0.0014 * uUnderwater;
      }
      vec3 c = texture2D(tDiffuse, uv).rgb;
      c *= uExposure;
      c = mix(c, c * vec3(0.52, 0.80, 1.22) + vec3(0.0, 0.015, 0.05), uUnderwater * 0.75);
      c = aces(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.16) * uContrast + 0.16;
      vec2 d = vUv - 0.5;
      c *= clamp(1.0 - dot(d, d) * uVignette * 1.55, 0.0, 1.0);
      gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
    }
  `,
};

export interface PostFXOptions {
  bloom: boolean;
  godRays: boolean;
  grade: boolean;
  fxaa: boolean;
}

export class PostFX {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private godRaysPass: ShaderPass;
  private gradePass: ShaderPass;
  private outputPass: OutputPass;
  private fxaaPass: ShaderPass;
  active = true;
  // fixed depth attachments for the two composer buffers — RenderPass fills
  // readBuffer's depth every frame, and the VLS pass samples exactly that
  // texture (writeBuffer holds the OTHER texture, so there is never a
  // texture-attached-while-sampled feedback loop)
  private depthA: THREE.DepthTexture;
  private depthB: THREE.DepthTexture;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostFXOptions) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // scene depth plumbing for volumetric shafts
    const mkDepth = (): THREE.DepthTexture => {
      const d = new THREE.DepthTexture(1, 1);
      d.type = THREE.UnsignedIntType;
      d.format = THREE.DepthFormat;
      d.minFilter = THREE.NearestFilter;
      d.magFilter = THREE.NearestFilter;
      return d;
    };
    this.depthA = mkDepth();
    this.depthB = mkDepth();
    this.composer.renderTarget1.depthTexture = this.depthA;
    this.composer.renderTarget2.depthTexture = this.depthB;

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.30, 0.5, 0.9);
    this.bloomPass.enabled = opts.bloom;
    this.composer.addPass(this.bloomPass);

    this.godRaysPass = new ShaderPass(GodRaysShader);
    this.godRaysPass.enabled = opts.godRays;
    this.composer.addPass(this.godRaysPass);

    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.enabled = opts.grade;
    this.composer.addPass(this.gradePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.setFxaaResolution(window.innerWidth, window.innerHeight);
    this.fxaaPass.enabled = opts.fxaa;
    this.composer.addPass(this.fxaaPass);
  }

  private setFxaaResolution(w: number, h: number): void {
    const pr = this.fxaaPass.material.uniforms.resolution;
    if (pr) pr.value.set(1 / w, 1 / h);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.setFxaaResolution(w, h);
    this.bloomPass.resolution.set(w, h);
    for (const d of [this.depthA, this.depthB]) {
      d.image.width = w;
      d.image.height = h;
      d.dispose(); // force FBO re-attach at the new size
    }
  }

  /** sun screen-space position + ray strength (caller clamps to daylight) */
  setSunScreen(x: number, y: number, strength: number, samples: number): void {
    this.godRaysPass.uniforms.uSunPos.value.set(x, y);
    this.godRaysPass.uniforms.uStrength.value = strength;
    this.godRaysPass.uniforms.uSamples.value = samples;
  }

  setFlare(strength: number, aspect: number): void {
    this.godRaysPass.uniforms.uFlare.value = strength;
    this.godRaysPass.uniforms.uAspect.value = aspect;
  }

  /** flare visibility gate: voxel-raycast sun occlusion × camera facing */
  setFlareVis(v: number): void {
    this.godRaysPass.uniforms.uVis.value = v;
  }

  /** volumetric shafts: per-frame camera/light state */
  setVls(invVP: THREE.Matrix4, camPos: THREE.Vector3, lightDir: THREE.Vector3, color: THREE.Color, strength: number, steps: number): void {
    const u = this.godRaysPass.uniforms;
    u.uInvVP.value.copy(invVP);
    u.uCamPos.value.copy(camPos);
    u.uLightDirW.value.copy(lightDir);
    u.uVlsColor.value.copy(color);
    u.uVls.value = strength;
    u.uVlsSteps.value = steps;
  }

  /** shadow-map feed for the shaft march (called after runShadowPass) */
  setVlsShadow(map: THREE.Texture | null, matrix: THREE.Matrix4): void {
    const u = this.godRaysPass.uniforms;
    u.uShadowMap.value = map;
    u.uShadowMatrix.value.copy(matrix);
  }

  setGrade(exposure: number, saturation: number, contrast: number, vignette: number): void {
    this.gradePass.uniforms.uExposure.value = exposure;
    this.gradePass.uniforms.uSaturation.value = saturation;
    this.gradePass.uniforms.uContrast.value = contrast;
    this.gradePass.uniforms.uVignette.value = vignette;
  }

  setUnderwater(amount: number, time: number): void {
    this.gradePass.uniforms.uUnderwater.value = amount;
    this.gradePass.uniforms.uTime.value = time;
  }

  setBloomEnabled(v: boolean): void {
    this.bloomPass.enabled = v;
  }

  setGodRaysEnabled(v: boolean): void {
    this.godRaysPass.enabled = v;
  }

  setFxaaEnabled(v: boolean): void {
    this.fxaaPass.enabled = v;
  }

  render(dt: number): void {
    // RenderPass draws the scene into readBuffer (needsSwap=false) — its depth
    // attachment IS the current-frame scene depth; the VLS pass samples it
    // while rendering into writeBuffer (other depth texture → no feedback)
    const depth = this.composer.readBuffer?.depthTexture ?? null;
    this.godRaysPass.uniforms.uDepthTex.value = depth;
    this.godRaysPass.uniforms.uHasDepth.value = depth ? 1 : 0;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.depthA.dispose();
    this.depthB.dispose();
  }
}
