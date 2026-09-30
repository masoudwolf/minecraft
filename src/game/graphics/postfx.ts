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
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      // wide off-screen tolerance: indoor window/door shafts keep working even
      // when the sun disk itself is well outside the frame
      bool sunOff = uStrength <= 0.001 || uSunPos.x < -0.55 || uSunPos.x > 1.55 || uSunPos.y < -0.55 || uSunPos.y > 1.55;
      if (sunOff) { gl_FragColor = base; return; }
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
      gl_FragColor = vec4(base.rgb + acc * uStrength * falloff, base.a);
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

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostFXOptions) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

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
  }

  /** sun screen-space position + ray strength (caller clamps to daylight) */
  setSunScreen(x: number, y: number, strength: number, samples: number): void {
    this.godRaysPass.uniforms.uSunPos.value.set(x, y);
    this.godRaysPass.uniforms.uStrength.value = strength;
    this.godRaysPass.uniforms.uSamples.value = samples;
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
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
