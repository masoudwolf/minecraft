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
import { shadowState } from './shadowState';

const CLAMP = THREE.MathUtils.clamp;
/** clear color whose RGBA-unpack reads as depth 1.0 (far) → empty texels = lit */
const SHADOW_CLEAR = new THREE.Color(1, 0, 0);

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

  // ── OWNED sun-shadow pass ────────────────────────────────────────────────
  // three r186 renders shadow maps into a DepthTexture with compareFunction
  // (sampler2DShadow) plus a color attachment holding INVERTED byte depth —
  // neither matches the RGBA-packed sampler this pack was built on, and the
  // compare-sampler variant wedges software GL. So the pack renders its OWN
  // depth pass into a color RT (32-bit packed depth, plain sampler2D).
  //
  // DEPTH MATERIALS: per-mesh instead of a single scene.overrideMaterial, so
  // cutout casters (tall grass, flowers, wheat, sugarcane, leaves) sample their
  // real texture alpha in the shadow map — a plain override turned every cross
  // plant into a SOLID X-shaped quad occluder = the "grass squashed flat on the
  // ground" shadow blobs the user reported.
  private shadowRT: THREE.WebGLRenderTarget | null = null;
  private shadowCam = new THREE.OrthographicCamera(-56, 56, 56, -56, 1, 320);
  private shadowMatrix = new THREE.Matrix4();
  private depthMatPlain = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  /** source material → alpha-aware depth material (map + alphaTest carried over) */
  private depthFor = new Map<THREE.Material, THREE.MeshDepthMaterial>();
  /** meshes swapped to depth materials this pass (restored after render) */
  private matSwaps: Array<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }> = [];
  /** top-level visibility overrides this pass (restored after render) */
  private visSwaps: Array<{ o: THREE.Object3D; v: boolean }> = [];
  private shadowTarget = new THREE.Vector3();
  private shadowLightDir = new THREE.Vector3(0.5, 0.8, 0.2).normalize();
  private tmpClearColor = new THREE.Color();

  // ── torch / dynamic point-light cube shadows ─────────────────────────────
  // The nearest 1-2 light sources (block torches from chunk.torches + scene
  // PointLights like the knight's sword) get their own 256px cube depth map;
  // the voxel shader multiplies the baked torch-light term by it, so fences /
  // trees / mobs cast real radial shadows around torches at night.
  private cubeRTs: THREE.WebGLCubeRenderTarget[] = [];
  private cubeCams: THREE.CubeCamera[] = [];
  private torchSources: Array<{ pos: THREE.Vector3; range: number; far: number }> = [];
  private scenePointLights: THREE.PointLight[] = [];
  private torchTimer = 0;
  private maxTorchShadows = 0;

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
    // dev/QA introspection hook (harmless in prod; used by agent-browser checks)
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__gfxDebug = this;
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
    shadowState.realShadows = q > 0; // mobs/engine read this to hide blob circles
    if (q <= 0) {
      if (this.shadowRT) { this.shadowRT.dispose(); this.shadowRT = null; }
      this.renderer.shadowMap.enabled = false;
      this.setShadowStrength(0);
      this.maxTorchShadows = 0;
      this.refreshChunkShadowFlags();
      return;
    }
    const size = sizes[q] ?? 2048;
    // three's own shadow pipeline stays OFF (no casting light) — shadowMap.enabled
    // only drives the vanilla blob-shadow suppression + receiver flag semantics;
    // the REAL depth map is our own pass (runShadowPass).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sunLight.castShadow = false;
    if (!this.shadowRT) {
      this.shadowRT = new THREE.WebGLRenderTarget(size, size, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
      });
    } else if (this.shadowRT.width !== size) {
      this.shadowRT.setSize(size, size);
    }
    // torch cube shadows: 1 source on High, 2 on Ultra (each = 6 tiny renders).
    // Software GL (llvmpipe) freezes intermittently inside the cube passes —
    // real GPUs get the feature, the sandbox falls back to unshadowed torches.
    this.maxTorchShadows = this.isSoftware ? 0 : (q >= 3 ? 2 : 1);
    while (this.cubeRTs.length < this.maxTorchShadows) {
      const rt = new THREE.WebGLCubeRenderTarget(384, {
        // LinearFilter: free bilinear softening of the cube penumbra (the
        // shader adds a tangent-frame 4-tap PCF on top of this)
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
      this.cubeRTs.push(rt);
      this.cubeCams.push(new THREE.CubeCamera(0.1, 24, rt));
    }
    const half = CLAMP((this.gfx?.renderScale ?? 4) * 0 + 56, 48, 96);
    const cam = this.shadowCam;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = 320;
    cam.updateProjectionMatrix();
    this.setShadowStrength(1);
    if (this.scene.getObjectById(this.sunLight.target.id) == null) this.scene.add(this.sunLight.target);
    this.refreshChunkShadowFlags();
  }

  /** re-apply caster/receiver flags to ALREADY-BUILT chunk meshes (they were
   *  flagged at mesh time — toggling shadows later leaves stale flags and the
   *  world would stop casting shadows until every chunk remeshed) */
  private refreshChunkShadowFlags(): void {
    if (!this.world) return;
    const shadowsOn = this.renderer.shadowMap.enabled;
    for (const chunk of this.world.chunks.values()) {
      const m = chunk.meshes;
      if (!m) continue;
      if (m.opaque) { m.opaque.castShadow = shadowsOn; m.opaque.receiveShadow = shadowsOn; }
      if (m.cutout) { m.cutout.castShadow = shadowsOn; m.cutout.receiveShadow = shadowsOn; }
      if (m.water) { m.water.castShadow = false; m.water.receiveShadow = true; }
    }
  }

  /** true when the object (or any descendant ≤5 levels down) wants to cast —
   *  covers top-level chunk meshes and entity Groups with mesh children
   *  (player model nests Group→pivot→Mesh at depth 2-3; depth 5 is headroom) */
  private isShadowCaster(o: THREE.Object3D, depth = 0): boolean {
    if (o.castShadow === true) return true;
    if (depth >= 5) return false;
    for (const c of o.children) {
      if (this.isShadowCaster(c, depth + 1)) return true;
    }
    return false;
  }

  /** alpha-aware depth material for a source material: cutout casters keep
   *  their texture alpha in the shadow map (cross plants / leaves / hats),
   *  everything else uses the plain packed-depth material */
  private depthMatFor(src: THREE.Material): THREE.MeshDepthMaterial {
    let d = this.depthFor.get(src);
    if (!d) {
      const lm = src as THREE.MeshLambertMaterial;
      if (lm.alphaTest > 0 && lm.map) {
        d = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          side: THREE.DoubleSide,
          map: lm.map,
          alphaTest: lm.alphaTest,
        });
      } else {
        d = this.depthMatPlain;
      }
      this.depthFor.set(src, d);
    }
    return d;
  }

  private voxelDepthSeeded = false;
  /** the voxel cutout material is a ShaderMaterial (no .map property) — seed
   *  its depth variant with the ATLAS texture + its alphaTest explicitly, so
   *  tall grass / flowers / wheat / leaves cut real holes in the shadow map
   *  instead of occluding as solid quads (the "grass squashed flat" blobs) */
  private seedVoxelDepthMats(): void {
    if (this.voxelDepthSeeded || !this.world) return;
    const cut = this.world.getMaterial('cutout');
    if (cut) {
      const atlas = cut.uniforms.uAtlas?.value as THREE.Texture | undefined;
      if (atlas) {
        this.depthFor.set(cut, new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking,
          side: THREE.DoubleSide,
          map: atlas,
          alphaTest: (cut.uniforms.uAlphaTest?.value as number) ?? 0.5,
        }));
        this.voxelDepthSeeded = true;
      }
    }
  }

  /** walk the visible part of the scene under `root`, swapping every
   *  castShadow mesh to its depth material (recorded for restore) */
  private swapToDepthMaterials(root: THREE.Object3D, parentVisible: boolean): void {
    const visible = parentVisible && root.visible;
    if (!visible) return;
    if (root instanceof THREE.Mesh && root.castShadow === true) {
      this.matSwaps.push({ mesh: root, mat: root.material });
      if (Array.isArray(root.material)) {
        root.material = root.material.map((mm) => this.depthMatFor(mm));
      } else {
        root.material = this.depthMatFor(root.material);
      }
    }
    for (const c of root.children) this.swapToDepthMaterials(c, visible);
  }

  /** stash + toggle top-level visibility so only casters render, then swap
   *  caster meshes to depth materials. Returns a restore closure. */
  private beginCasterSession(): () => void {
    this.visSwaps.length = 0;
    this.matSwaps.length = 0;
    const list = this.scene.children;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      this.visSwaps.push({ o, v: o.visible });
      o.visible = o.visible !== false && this.isShadowCaster(o);
    }
    this.swapToDepthMaterials(this.scene, true);
    const restore = (): void => {
      for (const s of this.matSwaps) s.mesh.material = s.mat;
      for (const s of this.visSwaps) s.o.visible = s.v;
    };
    return restore;
  }

  /** render the scene from the sun into our RGBA-packed depth RT */
  private runShadowPass(): void {
    if (!this.shadowRT) return;
    this.seedVoxelDepthMats();
    const cam = this.shadowCam;
    const t = this.shadowTarget;
    const d = this.shadowLightDir;
    const h = d.y > 0.18 ? d.y : 0.18;
    cam.position.set(t.x + d.x * 90, t.y + h * 90, t.z + d.z * 90);
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    cam.updateMatrixWorld();

    const prevRT = this.renderer.getRenderTarget();
    this.renderer.getClearColor(this.tmpClearColor);
    const prevClearAlpha = this.renderer.getClearAlpha();

    const restore = this.beginCasterSession();
    this.renderer.setRenderTarget(this.shadowRT);
    this.renderer.setClearColor(SHADOW_CLEAR, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, cam);

    // torch / dynamic point-light cube depth maps (same caster session — the
    // material swaps and visibility stashes stay valid for every face)
    if (this.maxTorchShadows > 0 && this.torchSources.length > 0) {
      for (let i = 0; i < this.torchSources.length && i < this.maxTorchShadows; i++) {
        const src = this.torchSources[i];
        const cube = this.cubeCams[i];
        if (!cube) continue;
        cube.position.copy(src.pos);
        cube.updateMatrixWorld();
        // the 6 face cameras are CubeCamera's children — near/far live THERE
        // (the CubeCamera wrapper has no updateProjectionMatrix of its own)
        for (const face of cube.children) {
          const fc = face as THREE.PerspectiveCamera;
          if (fc.isPerspectiveCamera) {
            fc.near = 0.1;
            fc.far = src.far;
            fc.updateProjectionMatrix();
          }
        }
        this.renderer.setRenderTarget(null);
        this.renderer.setClearColor(SHADOW_CLEAR, 0);
        cube.update(this.renderer, this.scene);
      }
    }

    restore();
    this.renderer.setClearColor(this.tmpClearColor, prevClearAlpha);
    this.renderer.setRenderTarget(prevRT);

    // texture matrix: raw proj*view — gfxShadow adds the NDC bias itself
    this.shadowMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const sz = this.shadowRT.width;
    const texel = new THREE.Vector2(1 / sz, 1 / sz);
    for (const m of this.voxelMats()) {
      m.uniforms.uShadowMap.value = this.shadowRT.texture;
      m.uniforms.uShadowMatrix.value.copy(this.shadowMatrix);
      (m.uniforms.uShadowTexel.value as THREE.Vector2).set(1 / sz, 1 / sz);
    }
    this.grass.setShadowUniforms(this.shadowRT.texture, this.shadowMatrix, texel);
    // torch cube uniforms → opaque + cutout (+ grass mat via GrassManager)
    for (let i = 0; i < 2; i++) {
      const src = this.torchSources[i];
      const active = i < this.maxTorchShadows && !!src && !!this.cubeRTs[i];
      const tex = active ? this.cubeRTs[i].texture : null;
      for (const m of this.voxelMats()) {
        if (!m.uniforms.uTorchCount) continue;
        (m.uniforms[`uTorchPos${i}`].value as THREE.Vector3).copy(src ? src.pos : this.shadowTarget);
        m.uniforms[`uTorchMap${i}`].value = tex;
        m.uniforms[`uTorchFar${i}`].value = src ? src.far : 24;
        m.uniforms[`uTorchRange${i}`].value = src ? src.range : 0;
      }
      this.grass.setTorchUniforms(i, src ? src.pos : null, tex, src ? src.far : 24, src ? src.range : 0);
    }
    for (const m of this.voxelMats()) {
      if (m.uniforms.uTorchCount) m.uniforms.uTorchCount.value = this.maxTorchShadows > 0 && this.torchSources.length > 0 ? Math.min(this.maxTorchShadows, this.torchSources.length) : 0;
    }
    this.grass.setTorchCount(this.torchSources.length > 0 ? Math.min(this.maxTorchShadows, this.torchSources.length) : 0);
  }

  private setShadowStrength(s: number): void {
    for (const m of this.voxelMats()) {
      if (m.uniforms.uShadowStrength) m.uniforms.uShadowStrength.value = s;
    }
  }

  /** all voxel materials that participate in sun shadows (terrain + water) */
  private voxelMats(): THREE.ShaderMaterial[] {
    if (!this.world) return [];
    return [
      this.world.getMaterial('opaque'),
      this.world.getMaterial('cutout'),
      this.world.getMaterial('water'),
    ].filter((m): m is THREE.ShaderMaterial => !!m);
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

    // voxel sun/shadow uniforms — sun dir + strength; the MAP itself is filled
    // by runShadowPass() every frame (terrain opaque/cutout AND water share it)
    const shadowOn = (gfx.shadows ?? 0) > 0 && this.shadowRT !== null;
    for (const m of this.voxelMats()) {
      if (m.uniforms.uSunDirW) m.uniforms.uSunDirW.value.copy(lightDir);
      if (m.uniforms.uSunColorW) m.uniforms.uSunColorW.value.copy(this.lastSunColor);
      if (m.uniforms.uShadowStrength) m.uniforms.uShadowStrength.value = shadowOn ? 1 : 0;
    }
    this.grass.setShadowStrength(shadowOn ? 1 : 0, lightDir);

    // shadow target follows the player (snapped to block grid — no shimmer)
    if (shadowOn) {
      const px = Math.round(playerX);
      const py = Math.round(playerY);
      const pz = Math.round(playerZ);
      this.shadowTarget.set(px, py, pz);
      this.shadowLightDir.copy(lightDir).normalize();
      // nearest torch/dynamic-light sources for the cube shadow slots
      this.torchTimer -= dt;
      if (this.torchTimer <= 0) {
        this.torchTimer = 0.3;
        this.pickTorchSources(playerX, playerY, playerZ);
      }
    }
    // sun light still follows the player for entity Lambert shading
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
          // wide window: shafts still work indoors when the sun sits well
          // off-screen behind a window/door (light keeps streaming through
          // the bright opening pixels toward the sun direction)
          const onScreen = gx > -0.55 && gx < 1.55 && gy > -0.55 && gy < 1.55;
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
  // RECURSIVE walk: the old version only inspected TOP-LEVEL scene children,
  // so entity Groups (player model, mob models, boats, drops) were never
  // flagged castShadow and nothing but terrain ever rendered into the depth
  // map — mobs/player kept their vanilla blob circles and cast no light-based
  // shadow at all (user report). Now every MeshLambertMaterial mesh anywhere
  // gets flagged, and scene PointLights are collected as torch-shadow sources.
  private sweepEntities(): void {
    const shadowsOn = this.renderer.shadowMap.enabled;
    this.scenePointLights.length = 0;
    const walk = (o: THREE.Object3D): void => {
      // the camera subtree holds the FIRST-PERSON HAND — it must never cast
      // (it lives at the eye position; a depth-pass entry would paint a
      // floating box shadow right under the player)
      if (o === this.camera) return;
      if (o instanceof THREE.PointLight && o.visible && this.scenePointLights.length < 8) {
        this.scenePointLights.push(o);
      }
      if (o instanceof THREE.Mesh) {
        const lm = o.material as THREE.Material | THREE.Material[];
        const first = Array.isArray(lm) ? lm[0] : lm;
        // blob shadows (vanilla-style dark circles) → hidden while real
        // shadows render (mobs.ts also consults shadowState every frame)
        if (first && (first as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
          const geo = o.geometry;
          if (geo instanceof THREE.CircleGeometry && (first as THREE.MeshBasicMaterial).color.getHex() === 0x000000) {
            o.visible = !shadowsOn && o.visible !== false;
            return;
          }
        }
        if (first && (first as THREE.MeshLambertMaterial).isMeshLambertMaterial && !o.userData.__gfxShadow) {
          o.userData.__gfxShadow = true;
          o.castShadow = true;
          o.receiveShadow = true;
        }
      }
      for (const c of o.children) walk(c);
    };
    for (const o of this.scene.children) walk(o);
  }

  /** nearest torch/point-light sources for the cube-shadow slots */
  private pickTorchSources(px: number, py: number, pz: number): void {
    this.torchSources.length = 0;
    if (this.maxTorchShadows <= 0 || !this.world) return;
    const cands: Array<{ pos: THREE.Vector3; range: number; far: number; d2: number }> = [];
    // block torches (chunk.torches is rebuilt by the mesher — always current)
    for (const chunk of this.world.chunks.values()) {
      const arr = chunk.torches;
      if (!arr || arr.length === 0) continue;
      // cheap chunk-level reject
      if (Math.abs(chunk.cx * 16 + 8 - px) > 40 || Math.abs(chunk.cz * 16 + 8 - pz) > 40) continue;
      for (const t of arr) {
        const dx = t[0] - px, dy = t[1] - py, dz = t[2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 26 * 26) cands.push({ pos: new THREE.Vector3(t[0], t[1], t[2]), range: 14, far: 17, d2 });
      }
    }
    // dynamic scene point lights (knight sword glow, future lanterns…)
    for (const l of this.scenePointLights) {
      const p = l.getWorldPosition(new THREE.Vector3());
      const d2 = p.distanceToSquared(this.tmpV1.set(px, py, pz));
      const dist = l.distance > 0 ? l.distance : 14;
      if (d2 < 26 * 26) cands.push({ pos: p, range: Math.min(dist, 20), far: Math.min(dist, 20) + 3, d2 });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < cands.length && i < this.maxTorchShadows; i++) {
      this.torchSources.push(cands[i]);
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
    if (this.gfx && this.gfx.shadows > 0 && this.shadowRT) {
      this.runShadowPass();
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
    this.shadowRT?.dispose();
    for (const rt of this.cubeRTs) rt.dispose();
    this.cubeRTs.length = 0;
    this.cubeCams.length = 0;
    for (const d of this.depthFor.values()) if (d !== this.depthMatPlain) d.dispose();
    this.depthFor.clear();
    this.depthMatPlain.dispose();
  }
}
