// ─── GraphicsSystem — facade wiring the whole shader pack into the engine ─────
// atmosphere dome · volumetric clouds · planar-reflection water · real sun
// shadows (PCF, shadow-aware voxel shaders) · instanced grass · post FX stack.
// Engine touches this class only (init/attachWorld/applySettings/update/
// onChunkMeshed/render/dispose).

import * as THREE from 'three';
import { SkySystem } from '../sky';
import type { World, Chunk } from '../world/world';
import { BLOCK, isOpaque, isWaterId } from '../blocks';
import { DAY_LENGTH, WORLD_HEIGHT } from '../constants';
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
  private legacyBodiesHidden = false;
  /** smoothed per-frame environment state (auto-exposure / wind / rain) */
  private expAdapt = 1;
  private windAmpSmooth = 1;
  private rainSmooth = 0;

  private sweepTimer = 0;
  private grassSweepTimer = 0;
  /** true when GPU reports as software renderer (llvmpipe etc.) */
  isSoftware = false;

  // ── v0.49 performance: shadow-pass throttle + on-demand reflections ────
  // The sun shadow map is a FULL extra scene render — on software GL it is
  // the single most expensive per-frame item. It only NEEDS re-rendering
  // when something changed: the shadow target (player block), the sun
  // direction, or 120 ms elapsed (mob shadows stay alive at ≥8 Hz).
  private lastShadowRun = -1;
  private lastShadowTarget = new THREE.Vector3(1e9, 0, 0);
  private lastShadowSun = new THREE.Vector3(1e9, 0, 0);
  /** QA counters — readable via window.__gfxDebug */
  shadowPasses = 0;
  reflectionRenders = 0;
  /** reflections only render when water actually exists near the camera */
  private reflNeeded = true;
  private reflScanTimer = 0;
  /** auto perf mode (opt-in): EMA-frame-time → internal scale adaptation */
  private perfFrames = 0;
  private perfTime = 0;
  private perfAdapt = 1;
  private basePR = 1;

  // ── lens-flare occlusion gate (v0.47) ──
  // The flare overlays used to draw unconditionally from the sun's screen
  // position, so standing indoors facing a wall produced a giant sun blob in
  // the middle of the room. Two CPU gates fix it: (1) a voxel DDA raycast
  // toward the light — any opaque block kills it, water/leaves attenuate;
  // (2) a camera-facing factor — the flare fades out as you turn away.
  private flareVis = 0;
  private tmpFwd = new THREE.Vector3();
  private tmpVP = new THREE.Matrix4();
  private tmpInvVP = new THREE.Matrix4();
  private tmpVlsCol = new THREE.Color();

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
    this.basePR = base;
    this.renderer.setPixelRatio(base * CLAMP(gfx.renderScale, 0.4, 1) * this.perfAdapt);
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
    // feed the same depth map to the volumetric-shafts post pass
    this.postfx?.setVlsShadow(this.shadowRT.texture, this.shadowMatrix);
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
  update(dt: number, camera: THREE.PerspectiveCamera, sky: SkySystem, playerX: number, playerY: number, playerZ: number, underwater: boolean, rain = 0): void {
    if (!this.gfx || !this.atmosphere) return;
    const gfx = this.gfx;
    this.updateReflNeed(dt);

    // retire the legacy sun/moon quads once — the atmosphere dome owns both now
    if (!this.legacyBodiesHidden) {
      this.legacyBodiesHidden = true;
      sky.setLegacyBodiesVisible(false);
    }

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
      // moonlight — Photon's REAL moon tint from source (MOON_R/G/B =
      // 0.75/0.83/1.00 ≈ #BFD4FF, ~8500K perceptual cold blue). Shader packs
      // exaggerate the blue because viewers READ "cold blue" as night.
      sunCol.set(0.75, 0.83, 1.00).multiplyScalar(0.30);
      lightDir.multiplyScalar(-1);
    }
    this.lastSunColor.setRGB(sunCol.x, sunCol.y, sunCol.z);

    this.atmosphere.update(camera, sunDir, dayAmount, sunsetAmount, storm, sky.lightningFlash, cover);
    if (this.clouds?.mesh.visible) {
      this.clouds.update(camera, dt, lightDir, this.lastSunColor, dayAmount, cover, storm);
    }

    // ── shader-pack environment sync (cloud shadows / caustics / wind / flicker)
    const cloudShadowOn = gfx.volumetricClouds && gfx.cloudQuality >= 1 ? 1 : 0;
    const cloudWind = this.clouds ? this.clouds.uniforms.uWind.value : 0;
    const t = performance.now() / 1000;
    // candle flame flutter: layered sines, never fully dies (0.90..1.10)
    const flicker = 1 + (Math.sin(t * 11.3) + Math.sin(t * 17.7) * 0.5 + Math.sin(t * 7.1) * 0.35) * 0.055;
    // breeze amplitude: calm → stormy, smoothly damped (no jump when toggling)
    const windTarget = gfx.windSway ? 1 + storm * 0.9 : 0;
    this.windAmpSmooth += (windTarget - this.windAmpSmooth) * Math.min(1, dt * 2.5);
    // rain on water: smoothed so downpours fade in/out naturally
    this.rainSmooth += (rain - this.rainSmooth) * Math.min(1, dt * 2);
    for (const m of this.voxelMats()) {
      if (m.uniforms.uWindAmp) m.uniforms.uWindAmp.value = this.windAmpSmooth;
      if (m.uniforms.uTorchFlicker) m.uniforms.uTorchFlicker.value = flicker;
      if (m.uniforms.uCaustics) m.uniforms.uCaustics.value = gfx.waterQuality >= 1 ? 1 : 0;
      if (m.uniforms.uCloudShadow) m.uniforms.uCloudShadow.value = cloudShadowOn;
      if (m.uniforms.uCloudWind) m.uniforms.uCloudWind.value = cloudWind;
      if (m.uniforms.uCloudCover) m.uniforms.uCloudCover.value = cover;
      if (m.uniforms.uRain) m.uniforms.uRain.value = this.rainSmooth;
    }
    this.grass.setEnv(this.lastSunColor, flicker, cloudShadowOn, cloudWind, cover);

    // fog snapshot for grass
    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.Fog;
      this.lastFogColor.copy(fog.color);
      this.lastFogNear = fog.near;
      this.lastFogFar = fog.far;
    }
    this.grass.update(performance.now() / 1000, sky.sunLevel, this.lastFogColor, this.lastFogNear, this.lastFogFar);

    // v0.49 — atmospheric haze master (user: midnight/sunrise looked "matte")
    // Scales EVERY airy-light effect with one slider: volumetric shafts,
    // radial god rays and the Purkinje night shift. Scene fog density is
    // handled in the engine (hazeFogParams) since it owns sky.update.
    const haze = CLAMP(gfx.haze ?? 1, 0, 1.5);

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
      // ── auto exposure (v0.48 — Photon-style exposure discipline) ──
      // Photon ships auto exposure OFF by default and hand-balances sun=7.0 vs
      // moon=0.66 instead, because an exposure that "rescues" darkness erases
      // the night. We now do the same: NO night boost (the old +0.35 lifted
      // every midnight by ~35%, which is exactly why nights never felt dark),
      // only a small sunset/underwater lift. Adaptation is asymmetric and
      // rate-limited like real photoreceptors: dark→bright 2.0/s, bright→dark
      // 1.0/s (bleach recovery is slower), and the total swing is clamped so
      // exposure can never compensate the night away.
      const expoTarget = (1 + sunsetAmount * 0.10) * (underwater ? 1.12 : 1);
      const rate = expoTarget < this.expAdapt ? 1.0 : 2.0;
      this.expAdapt += (expoTarget - this.expAdapt) * Math.min(1, dt * rate);
      this.expAdapt = Math.min(1.22, Math.max(0.92, this.expAdapt));
      this.postfx.setGrade(this.expAdapt * gfx.exposure, gfx.saturation, gfx.contrast, gfx.vignette);

      // ── Purkinje shift (Photon include/misc/purkinje_shift.glsl) ──
      // In darkness rods take over: deep shadows drift toward blue-steel
      // (scotopic peak 507nm) while warm torch pools keep their color — the
      // effect self-gates per pixel in the grade shader via scotopic luminance.
      // Fades in as the sun drops below ~-0.08 (civil twilight end).
      const purkNight = CLAMP((0.02 - sunHeight) / 0.10, 0, 1);
      this.postfx.setPurkinje(0.055 * purkNight * (1 - storm * 0.5) * Math.min(haze, 1));

      // ── flare gate: voxel occlusion × camera facing (v0.47) ──
      // Raycast from the eye toward the light through the voxel grid — walls
      // between the player and the sun/moon must kill the lens flare, and
      // turning away from it fades it (both were user-reported artifacts).
      let flareVis = 0;
      if (gfx.godRays && !underwater && dayAmount > 0.02) {
        camera.getWorldDirection(this.tmpFwd);
        const facing = CLAMP((this.tmpFwd.dot(sunDir) + 0.08) / 0.5, 0, 1);
        const facingSmooth = facing * facing * (3 - 2 * facing);
        const occl = this.sunOcclusion(camera.position, sunDir);
        flareVis = facingSmooth * occl * dayAmount;
      }
      this.flareVis = flareVis;
      this.postfx.setFlareVis(flareVis);
      // v0.49: the anamorphic streak/halos are part of the "sun wash" the user
      // flags as haze — scale them with the haze master too (0% = no flare)
      this.postfx.setFlare(gfx.godRays ? 0.55 * Math.min(haze, 1) : 0, camera.aspect);

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
          strength = onScreen ? gfx.godRaysStrength * dayBoost * (1 - storm * 0.85) * (1 - cover * 0.55) * Math.min(haze, 1.2) : 0;
        }
      }
      const samples = gfx.preset === 'ultra' || gfx.preset === 'high' ? 48 : gfx.preset === 'medium' ? 36 : 24;
      this.postfx.setSunScreen(gx, gy, strength, samples);
      this.postfx.setUnderwater(underwater ? 1 : 0, performance.now() / 1000);

      // ── volumetric light shafts (SEUS/BSL staple): ray-march camera→pixel
      // through the sun shadow map — air in a window beam reads lit, air under
      // a roof reads shadowed, so real shafts paint themselves into the room.
      if (gfx.godRays && !underwater) {
        const vlsSteps = gfx.preset === 'ultra' ? 16 : gfx.preset === 'high' ? 12 : gfx.preset === 'medium' ? 8 : 6;
        const vlsStrength = gfx.godRaysStrength * 0.5 * (1 - storm * 0.7) * (1 - cover * 0.4) * haze;
        // v0.48: night gain raised (0.5 → 0.62 floor) — moonlight shafts through
        // trees/window must READ on the darker night (they're the fear-factor
        // beauty anchor; Photon keeps visible moon shafts at its 9.4% moon)
        this.tmpVlsCol.copy(this.lastSunColor).multiplyScalar(0.62 + 0.38 * dayAmount);
        camera.updateMatrixWorld();
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        this.tmpVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.tmpInvVP.copy(this.tmpVP).invert();
        this.postfx.setVls(this.tmpInvVP, camera.position, lightDir, this.tmpVlsCol, vlsStrength, vlsSteps);
      } else {
        this.postfx.setVls(this.tmpInvVP, camera.position, lightDir, this.tmpVlsCol, 0, 1);
      }
    }
  }

  /** voxel DDA raycast toward the light — 1.0 = clear sky, 0 = fully blocked.
   *  Water and leaves attenuate (light filters through), glass barely dims. */
  private sunOcclusion(origin: THREE.Vector3, dir: THREE.Vector3): number {
    const world = this.world;
    if (!world) return 1;
    let vis = 1;
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1;
    const stepY = dir.y > 0 ? 1 : -1;
    const stepZ = dir.z > 0 ? 1 : -1;
    const invX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const invY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const invZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = dir.x !== 0 ? ((stepX > 0 ? x + 1 - origin.x : origin.x - x)) * invX : Infinity;
    let tMaxY = dir.y !== 0 ? ((stepY > 0 ? y + 1 - origin.y : origin.y - y)) * invY : Infinity;
    let tMaxZ = dir.z !== 0 ? ((stepZ > 0 ? z + 1 - origin.z : origin.z - z)) * invZ : Infinity;
    for (let i = 0; i < 260 && vis > 0.01; i++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; tMaxX += invX;
      } else if (tMaxY < tMaxZ) {
        y += stepY; tMaxY += invY;
      } else {
        z += stepZ; tMaxZ += invZ;
      }
      if (y >= WORLD_HEIGHT) break;        // above the world → open sky
      if (y < 0) return 0;                 // ray left the world downward
      const id = world.getBlock(x, y, z);
      if (id === BLOCK.AIR) continue;
      if (isOpaque(id)) return 0;          // solid wall → no flare
      if (isWaterId(id)) vis *= 0.72;      // water filters the glare
      else if (id === BLOCK.LEAVES || id === BLOCK.SPRUCE_LEAVES || id === BLOCK.JUNGLE_LEAVES) vis *= 0.62;
      else if (id === BLOCK.GLASS) vis *= 0.96;
    }
    return vis;
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

  // ── render ──────────────────────────────────────────────────────────────
  render(_dt: number): void {
    if (this.gfx && this.gfx.shadows > 0 && this.shadowRT) {
      // v0.49 throttle: skip the shadow pass when NOTHING it depicts changed.
      // The map re-renders when the player crosses a block, the sun rotates
      // ≥0.36°, or 120 ms elapsed (moving mobs keep fresh shadows either way);
      // standing still goes from 60 → ~8 shadow renders/sec with zero visible
      // difference (sun shadows crawl imperceptibly between updates).
      const nowMs = performance.now();
      const moved = this.shadowTarget.distanceToSquared(this.lastShadowTarget) > 0.001;
      const sunMoved = this.shadowLightDir.dot(this.lastShadowSun) < 0.99998;
      const stale = nowMs - this.lastShadowRun > 120;
      if (this.lastShadowRun < 0 || moved || sunMoved || stale) {
        this.runShadowPass();
        this.shadowPasses++;
        this.lastShadowRun = nowMs;
        this.lastShadowTarget.copy(this.shadowTarget);
        this.lastShadowSun.copy(this.shadowLightDir);
      }
    } else {
      // no shadow map → volumetric shafts lose their occlusion source
      this.postfx?.setVlsShadow(null, this.shadowMatrix);
    }
    const useComposer = this.gfx?.postfx === true && this.postfx !== null;
    if (useComposer && this.gfx!.waterQuality >= 1 && !this.underwaterCam && this.reflNeeded) {
      this.renderReflection();
      this.reflectionRenders++;
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
    this.perfTick(_dt);
  }

  /** every 0.5 s: does ANY loaded chunk with water sit within 96 blocks?
   *  If not, the planar-reflection pass is skipped entirely — inland gameplay
   *  pays zero for reflections (the water shader keeps its last texture and
   *  nothing on screen samples it while water is out of range). */
  private updateReflNeed(dt: number): void {
    this.reflScanTimer -= dt;
    if (this.reflScanTimer > 0) return;
    this.reflScanTimer = 0.5;
    let need = false;
    if (this.world) {
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      for (const chunk of this.world.chunks.values()) {
        if (!chunk.meshes?.water) continue;
        const dx = chunk.cx * 16 + 8 - cx;
        const dz = chunk.cz * 16 + 8 - cz;
        if (dx * dx + dz * dz < 96 * 96) { need = true; break; }
      }
    }
    this.reflNeeded = need;
  }

  /** v0.49 auto performance (opt-in): every 2 s, if avg fps dropped below 26,
   *  quietly step the internal scale down (floor 60% of the user's Render
   *  Scale) and climb back toward it when fps recovers past 54. */
  private perfTick(dt: number): void {
    if (!this.gfx?.autoPerf) {
      // toggling the feature OFF must restore the user's full render scale —
      // otherwise a dropped adapt level would stick forever at low res
      if (this.perfAdapt < 1) {
        this.perfAdapt = 1;
        if (this.gfx) {
          this.renderer.setPixelRatio(this.basePR * CLAMP(this.gfx.renderScale, 0.4, 1));
          this.resize();
        }
      }
      return;
    }
    this.perfFrames++;
    this.perfTime += dt;
    if (this.perfTime < 2) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfFrames = 0;
    this.perfTime = 0;
    const before = this.perfAdapt;
    if (fps < 26) this.perfAdapt = Math.max(0.6, this.perfAdapt - 0.06);
    else if (fps > 54) this.perfAdapt = Math.min(1, this.perfAdapt + 0.03);
    if (this.perfAdapt !== before && this.gfx) {
      this.renderer.setPixelRatio(this.basePR * CLAMP(this.gfx.renderScale, 0.4, 1) * this.perfAdapt);
      this.resize();
    }
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
