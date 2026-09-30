// ─── GraphicsSystem — facade wiring the whole shader pack into the engine ─────
// atmosphere dome · volumetric clouds · planar-reflection water · real sun
// shadows (PCF, shadow-aware voxel shaders) · instanced grass · post FX stack.
// Engine touches this class only (init/attachWorld/applySettings/update/
// onChunkMeshed/render/dispose).

import * as THREE from 'three';
import { SkySystem } from '../sky';
import type { World, Chunk } from '../world/world';
import { DAY_LENGTH } from '../constants';
import type { Settings } from '../state';
import { AtmosphereSky } from './atmosphere';
import { VolumetricClouds } from './cloudsVolumetric';
import { PostFX } from './postfx';
import { GrassManager } from './grass';
import { WATER_PLANE_Y } from './waterGfx';
import type { GfxSettings } from './settings';

const CLAMP = THREE.MathUtils.clamp;

export class GraphicsSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sunLight: THREE.DirectionalLight;

  atmosphere: AtmosphereSky | null = null;
  clouds: VolumetricClouds | null = null;
  grass: GrassManager;
  postfx: PostFX | null = null;

  private world: World | null = null;
  private waterMat: THREE.ShaderMaterial | null = null;
  private gfx: GfxSettings | null = null;

  // planar reflection
  private reflRT: THREE.WebGLRenderTarget | null = null;
  private mirrorCam = new THREE.PerspectiveCamera();
  private reflMatrix = new THREE.Matrix4();
  private tmpV1 = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpV3 = new THREE.Vector3();
  private tmpV4 = new THREE.Vector3();
  private tmpPlane = new THREE.Plane();
  private tmpQ = new THREE.Vector4();

  private lastSunDir = new THREE.Vector3(0, 1, 0);
  private lastSunColor = new THREE.Color(1, 1, 1);
  private lastFogColor = new THREE.Color(0x9fc7ff);
  private lastFogNear = 60;
  private lastFogFar = 130;
  private underwaterCam = false;

  private sweepTimer = 0;
  private grassSweepTimer = 0;
  /** true when GPU reports as software renderer (llvmpipe etc.) */
  isSoftware = false;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sunLight: THREE.DirectionalLight) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sunLight = sunLight;
    this.grass = new GrassManager(scene);

    // software-GL detection → default preset guard
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      this.isSoftware = /llvmpipe|swiftshader|software|ANGLE \(/i.test(gpu);
    } catch { this.isSoftware = false; }

    this.mirrorCam.layers = this.camera.layers;
  }

  // ── world wiring ────────────────────────────────────────────────────────────
  attachWorld(world: World): void {
    this.world = world;
    this.waterMat = world.getMaterial('water');
  }

  // ── settings ────────────────────────────────────────────────────────────────
  applySettings(settings: Settings): void {
    // work on a COPY — never mutate the zustand store object (the software-GL
    // downgrade used to leak into saved settings and fight the UI toggles)
    const gfx: GfxSettings = { ...settings.gfx };
    if (gfx.preset === 'medium' && !gfx.presetUser && this.isSoftware) {
      // software GL: keep the fancy look but drop heavy features automatically
      gfx.renderScale = Math.min(gfx.renderScale, 0.66);
      gfx.shadows = Math.min(gfx.shadows, 1);
      gfx.waterQuality = Math.min(gfx.waterQuality, 0);
      gfx.cloudQuality = Math.min(gfx.cloudQuality, 0);
      gfx.grassDensity = Math.min(gfx.grassDensity, 0.22);
    }
    this.gfx = gfx;

    // internal resolution scale
    const base = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(base * CLAMP(gfx.renderScale, 0.4, 1));
    this.resize();

    // post-processing
    if (gfx.postfx) {
      if (!this.postfx) {
        this.postfx = new PostFX(this.renderer, this.scene, this.camera, {
          bloom: gfx.bloom, godRays: gfx.godRays, grade: true, fxaa: gfx.fxaa,
        });
      }
      this.postfx.setBloomEnabled(gfx.bloom);
      this.postfx.setGodRaysEnabled(gfx.godRays);
      this.postfx.setFxaaEnabled(gfx.fxaa);
      this.postfx.setGrade(gfx.exposure, gfx.saturation, gfx.contrast, gfx.vignette);
    }

    // sky + clouds
    if (!this.atmosphere) this.atmosphere = new AtmosphereSky(this.scene);
    if (!this.clouds) this.clouds = new VolumetricClouds(this.scene);
    this.atmosphere.mesh.visible = true;
    this.clouds.mesh.visible = gfx.volumetricClouds;

    // shadows
    this.setShadowQuality(gfx.shadows);

    // water quality
    if (this.waterMat) {
      this.waterMat.uniforms.uWaterQ.value = gfx.waterQuality;
      this.waterMat.uniforms.uHasRefl.value = gfx.waterQuality >= 1 ? 1 : 0;
    }
    if (gfx.waterQuality >= 1) this.ensureReflRT(gfx.waterQuality);

    // grass
    if (this.grass.density !== gfx.grassDensity || !this.grass.enabled) {
      this.grass.enabled = gfx.grassDensity > 0.02;
      if (this.world) this.grass.setDensity(gfx.grassDensity, this.world);
      else this.grass.density = gfx.grassDensity;
    }
  }

  // ── shadows ─────────────────────────────────────────────────────────────────
  setShadowQuality(q: number): void {
    const sizes = [0, 1024, 2048, 4096];
    if (q <= 0) {
      this.renderer.shadowMap.enabled = false;
      this.sunLight.castShadow = false;
      this.setShadowStrength(0);
      return;
    }
    const size = sizes[q] ?? 2048;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft removed in three r186
    this.renderer.shadowMap.autoUpdate = false; // refreshed once per frame
    const sh = this.sunLight.shadow;
    if (sh.mapSize.x !== size) {
      sh.map?.dispose();
      sh.map = null;
      sh.mapSize.set(size, size);
    }
    const half = CLAMP((this.gfx?.renderScale ?? 4) * 0 + 56, 48, 96);
    const cam = sh.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = 320;
    cam.updateProjectionMatrix();
    sh.bias = -0.00035;
    sh.normalBias = 0.02;
    this.sunLight.castShadow = true;
    this.setShadowStrength(1);
    if (this.scene.getObjectById(this.sunLight.target.id) == null) this.scene.add(this.sunLight.target);
  }

  private setShadowStrength(s: number): void {
    if (this.waterMat) this.waterMat.uniforms.uShadowStrength.value = s;
  }

  // ── chunk hooks ─────────────────────────────────────────────────────────────
  onChunkMeshed(chunk: Chunk, world: World): void {
    if (this.gfx && this.gfx.grassDensity > 0.02) this.grass.updateChunk(chunk, world);
    const m = chunk.meshes;
    if (!m) return;
    const shadowsOn = this.renderer.shadowMap.enabled;
    if (m.opaque) { m.opaque.castShadow = shadowsOn; m.opaque.receiveShadow = shadowsOn; }
    if (m.cutout) { m.cutout.castShadow = shadowsOn; m.cutout.receiveShadow = shadowsOn; }
    if (m.water) { m.water.castShadow = false; m.water.receiveShadow = true; }
  }

  // ── per-frame update ────────────────────────────────────────────────────────
  update(dt: number, camera: THREE.PerspectiveCamera, sky: SkySystem, playerX: number, playerY: number, playerZ: number, underwater: boolean): void {
    if (!this.gfx || !this.atmosphere) return;
    const gfx = this.gfx;

    // sun direction (same formula as SkySystem)
    const dayFrac = sky.time / DAY_LENGTH;
    const angle = (dayFrac - 0.25) * Math.PI * 2;
    const sunDir = this.tmpV1.set(Math.cos(angle), Math.sin(angle), 0.18).normalize();
    const sunHeight = Math.sin(angle);
    const dayAmount = CLAMP((sunHeight + 0.12) / 0.32, 0, 1);
    const sunsetAmount = CLAMP(1 - Math.abs(sunHeight) / 0.28, 0, 1) * (dayAmount > 0.02 ? 1 : 0.35);
    this.lastSunDir.copy(sunDir);

    // cloud coverage: base scattered + weather
    const cover = CLAMP(0.22 + sky.weatherDarkness * 1.1, 0, 1);
    const storm = sky.weatherDarkness;

    // sun color: warm at low sun, white at noon, moon-dim at night
    const lightDir = this.tmpV4.copy(sunDir); // the ACTUAL light source (moon at night)
    const sunCol = this.tmpV2;
    const warmth = sunsetAmount;
    sunCol.set(
      1.0,
      0.92 - warmth * 0.28,
      0.82 - warmth * 0.55,
    ).multiplyScalar(0.14 + 0.86 * dayAmount * (1 - storm * 0.55));
    if (dayAmount < 0.08) {
      // moonlight — dim cool directional light from the moon's position
      sunCol.set(0.35, 0.42, 0.62).multiplyScalar(0.28);
      lightDir.multiplyScalar(-1);
    }
    this.lastSunColor.setRGB(sunCol.x, sunCol.y, sunCol.z);

    this.atmosphere.update(camera, sunDir, dayAmount, sunsetAmount, storm, sky.lightningFlash, cover);
    if (this.clouds?.mesh.visible) {
      this.clouds.update(camera, dt, lightDir, this.lastSunColor, dayAmount, cover, storm);
    }

    // fog snapshot for grass
    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.Fog;
      this.lastFogColor.copy(fog.color);
      this.lastFogNear = fog.near;
      this.lastFogFar = fog.far;
    }
    this.grass.update(performance.now() / 1000, sky.sunLevel, this.lastFogColor, this.lastFogNear, this.lastFogFar);

    // water sun/shadow uniforms
    if (this.waterMat) {
      this.waterMat.uniforms.uSunDirW.value.copy(lightDir);
      this.waterMat.uniforms.uSunColorW.value.copy(this.lastSunColor);
      if (this.renderer.shadowMap.enabled && this.sunLight.shadow.map) {
        this.waterMat.uniforms.uShadowMap.value = this.sunLight.shadow.map.texture;
        this.waterMat.uniforms.uShadowMatrix.value.copy(this.sunLight.shadow.matrix);
        const sz = this.sunLight.shadow.mapSize.x;
        (this.waterMat.uniforms.uShadowTexel.value as THREE.Vector2).set(1 / sz, 1 / sz);
      }
    }

    // shadow camera follows the player (snapped to block grid — no shimmer)
    if (this.renderer.shadowMap.enabled) {
      const px = Math.round(playerX);
      const py = Math.round(playerY);
      const pz = Math.round(playerZ);
      this.sunLight.target.position.set(px, py, pz);
      this.sunLight.target.updateMatrixWorld();
      const h = lightDir.y > 0.18 ? lightDir.y : 0.18;
      this.sunLight.position.set(px + lightDir.x * 90, py + h * 90, pz + lightDir.z * 90);
    }

    this.underwaterCam = underwater;

    // entity sweeps (cheap, throttled)
    this.sweepTimer += dt;
    if (this.sweepTimer > 0.5) {
      this.sweepTimer = 0;
      this.sweepEntities();
    }
    this.grassSweepTimer += dt;
    if (this.grassSweepTimer > 2) {
      this.grassSweepTimer = 0;
      if (this.world) this.grass.sweep(this.world);
    }

    // postfx per-frame uniforms
    if (this.postfx) {
      // sun screen position for god rays
      let gx = -1, gy = -1, strength = 0;
      if (gfx.godRays && !underwater) {
        const sd = this.tmpV3.copy(sunDir).multiplyScalar(600).add(camera.position);
        sd.project(camera);
        if (sd.z < 1) {
          gx = (sd.x + 1) / 2;
          gy = (sd.y + 1) / 2;
          const onScreen = gx > -0.15 && gx < 1.15 && gy > -0.15 && gy < 1.15;
          const dayBoost = CLAMP(sunHeight * 4 + 0.35, 0, 1); // strongest near horizon
          strength = onScreen ? gfx.godRaysStrength * dayBoost * (1 - storm * 0.85) * (1 - cover * 0.55) : 0;
        }
      }
      const samples = gfx.preset === 'ultra' || gfx.preset === 'high' ? 48 : gfx.preset === 'medium' ? 36 : 24;
      this.postfx.setSunScreen(gx, gy, strength, samples);
      this.postfx.setUnderwater(underwater ? 1 : 0, performance.now() / 1000);
    }
  }

  // ── entity shadow flags + blob-shadow suppression ──────────────────────────
  private sweepEntities(): void {
    const shadowsOn = this.renderer.shadowMap.enabled;
    const list = this.scene.children;
    for (let i = 0; i < list.length; i++) {
      const obj = list[i];
      if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points)) continue;
      // blob shadows (vanilla-style dark circles) → hide when real shadows on
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (obj instanceof THREE.Mesh && mat && (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        const geo = (obj as THREE.Mesh).geometry;
        if (geo instanceof THREE.CircleGeometry && (mat as THREE.MeshBasicMaterial).color.getHex() === 0x000000) {
          obj.visible = !shadowsOn && obj.visible !== false;
          continue;
        }
      }
      if (!(obj instanceof THREE.Mesh)) continue;
      const lm = obj.material as THREE.Material;
      if (!lm || !(lm as THREE.MeshLambertMaterial).isMeshLambertMaterial) continue;
      if (!obj.userData.__gfxShadow) {
        obj.userData.__gfxShadow = true;
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    }
  }

  // ── reflection RT ───────────────────────────────────────────────────────────
  private ensureReflRT(quality: number): void {
    const w = Math.floor(window.innerWidth * (quality >= 2 ? 0.75 : 0.5));
    const h = Math.floor(window.innerHeight * (quality >= 2 ? 0.75 : 0.5));
    if (!this.reflRT) {
      this.reflRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        depthBuffer: true,
      });
    } else if (this.reflRT.width !== w || this.reflRT.height !== h) {
      this.reflRT.setSize(w, h);
    }
  }

  private renderReflection(): void {
    if (!this.world || !this.reflRT || !this.waterMat) return;
    const cam = this.camera;

    // hide all water meshes
    for (const chunk of this.world.chunks.values()) {
      if (chunk.meshes?.water) chunk.meshes.water.visible = false;
    }

    // mirror camera about the horizontal plane y = WATER_PLANE_Y
    const n = this.tmpV1.set(0, 1, 0);
    const pos = this.tmpV2.copy(cam.position);
    const refl = this.tmpV3.copy(pos).addScaledVector(n, -2 * (pos.y - WATER_PLANE_Y));
    this.mirrorCam.position.copy(refl);
    const dir = cam.getWorldDirection(new THREE.Vector3());
    dir.y = -dir.y; // reflect view direction about the horizontal plane
    const target = refl.clone().add(dir);
    this.mirrorCam.up.set(0, 1, 0);
    this.mirrorCam.up.y = -1; // reflected up vector keeps texture orientation
    this.mirrorCam.lookAt(target);
    this.mirrorCam.fov = cam.fov;
    this.mirrorCam.aspect = cam.aspect;
    this.mirrorCam.near = cam.near;
    this.mirrorCam.far = cam.far;
    this.mirrorCam.updateProjectionMatrix();
    this.mirrorCam.updateMatrixWorld();

    // oblique near-plane clipping — everything below the water plane is cut
    this.tmpPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, WATER_PLANE_Y, 0));
    this.tmpPlane.applyMatrix4(this.mirrorCam.matrixWorldInverse);
    const clip = this.tmpPlane.normal.clone().multiplyScalar(-1);
    const constant = -this.tmpPlane.constant;
    const clipPlane = new THREE.Vector4(clip.x, clip.y, clip.z, constant);
    const pm = this.mirrorCam.projectionMatrix;
    this.tmpQ.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
    this.tmpQ.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
    this.tmpQ.z = -1;
    this.tmpQ.w = (1 + pm.elements[10]) / pm.elements[14];
    clipPlane.multiplyScalar(2 / clipPlane.dot(this.tmpQ));
    pm.elements[2] = clipPlane.x;
    pm.elements[6] = clipPlane.y;
    pm.elements[10] = clipPlane.z + 1;
    pm.elements[14] = clipPlane.w;

    // texture matrix: NDC-bias * proj * view
    this.reflMatrix.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.reflMatrix.multiply(pm);
    this.reflMatrix.multiply(this.mirrorCam.matrixWorldInverse);
    this.waterMat.uniforms.uReflMatrix.value.copy(this.reflMatrix);
    this.waterMat.uniforms.uReflMap.value = this.reflRT.texture;

    const prevRT = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.reflRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.mirrorCam);
    this.renderer.setRenderTarget(prevRT);

    // restore water visibility
    for (const chunk of this.world.chunks.values()) {
      if (chunk.meshes?.water) chunk.meshes.water.visible = true;
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  render(_dt: number): void {
    if (this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
    const useComposer = this.gfx?.postfx === true && this.postfx !== null;
    if (useComposer && this.gfx!.waterQuality >= 1 && !this.underwaterCam) {
      this.renderReflection();
    }
    // truthful triangle stats: composer passes would reset info per pass
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (useComposer) {
      this.postfx!.render(_dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.info.autoReset = true;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.postfx?.setSize(w, h);
  }

  dispose(): void {
    this.atmosphere?.dispose();
    this.clouds?.dispose();
    this.grass.dispose();
    this.postfx?.dispose();
    this.reflRT?.dispose();
  }
}
