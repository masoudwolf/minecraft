// ─── Instanced grass — VANILLA-STYLE crossed tufts ───────────────────────────
// Replacement for the old "realistic tapered blades" (user verdict: not
// Minecraft-like, read as squashed flat on the ground). Each instance is now
// the classic Minecraft cross model: two upright quads with a pixelated
// grayscale tuft texture, biome-tinted vanilla green in the shader, alpha-
// cutout edges, subtle wind sway. Receives the pack's real sun shadows and
// torch cube shadows so tufts darken under trees/fences like the terrain.

import * as THREE from 'three';
import { BLOCK } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from '../constants';
import type { Chunk, World } from '../world/world';
import { GLSL_SHADOW, GLSL_CUBE_SHADOW } from './glsl';

const MAX_PER_CHUNK = 4096;

const VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRot;
  attribute float aScaleY;
  attribute float aTintV;
  attribute float aSkyL;
  attribute float aBlockL;
  attribute float aPhase;
  varying vec2 vUv;
  varying float vY01;
  varying float vTintV;
  varying float vSky;
  varying float vBlock;
  varying vec3 vWorldPos;
  varying float vFogDepth;
  uniform float uTime;
  void main() {
    vUv = uv;
    float c = cos(aRot);
    float s = sin(aRot);
    float w01 = clamp(position.y, 0.0, 1.0);
    float wind = sin(uTime * 1.6 + aOffset.x * 0.35 + aOffset.z * 0.28 + aPhase) * 0.5
               + sin(uTime * 2.9 + aOffset.x * 0.9 - aOffset.z * 0.6 + aPhase * 1.7) * 0.2;
    float sway = wind * 0.055 * w01 * w01;
    vec3 p = position;
    p.x += sway; // sway along the tuft's own axis (rotated below)
    vec3 local = vec3(c * p.x + s * p.z, p.y * aScaleY, -s * p.x + c * p.z);
    vec3 world = aOffset + local;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vFogDepth = -mv.z;
    vWorldPos = world;
    vY01 = w01;
    vTintV = aTintV;
    vSky = aSkyL;
    vBlock = aBlockL;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vY01;
  varying float vTintV;
  varying float vSky;
  varying float vBlock;
  varying vec3 vWorldPos;
  varying float vFogDepth;
  uniform sampler2D uMap;
  uniform float uSunLevel;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uSunDirW;
  uniform sampler2D uShadowMap;
  uniform mat4 uShadowMatrix;
  uniform vec2 uShadowTexel;
  uniform float uShadowStrength;
  uniform vec3 uTorchPos0;
  uniform vec3 uTorchPos1;
  uniform samplerCube uTorchMap0;
  uniform samplerCube uTorchMap1;
  uniform float uTorchFar0;
  uniform float uTorchFar1;
  uniform float uTorchRange0;
  uniform float uTorchRange1;
  uniform float uTorchCount;
  ${GLSL_SHADOW}
  ${GLSL_CUBE_SHADOW}
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    // sun shadow (up-normal: tufts are thin, only ground shading matters)
    float sf = 1.0;
    if (uShadowStrength > 0.001) {
      float ndl = clamp(uSunDirW.y, 0.0, 1.0);
      sf = gfxShadow(uShadowMap, uShadowMatrix, uShadowTexel, vWorldPos, vec3(0.0, 1.0, 0.0), ndl);
    }
    float sAmb = mix(sf, 1.0, 0.52);
    // torch light with point-light cube shadows (same formula as terrain,
    // warm Unreal-style tint when the torch dominates)
    float sunL = vSky * uSunLevel * sAmb;
    float torchL = vBlock;
    if (uTorchCount > 0.5 && torchL > 0.02) {
      float ts = gfxCubeShadow(uTorchMap0, uTorchPos0, vWorldPos, vec3(0.0, 1.0, 0.0), uTorchFar0, uTorchRange0);
      if (uTorchCount > 1.5) ts = min(ts, gfxCubeShadow(uTorchMap1, uTorchPos1, vWorldPos, vec3(0.0, 1.0, 0.0), uTorchFar1, uTorchRange1));
      torchL *= mix(0.32, 1.0, ts);
    }
    float light = clamp(max(torchL, sunL), 0.06, 1.0);
    float torchW = clamp((torchL - sunL) * 1.35, 0.0, 1.0);
    vec3 lightCol = mix(vec3(1.0), vec3(1.30, 0.98, 0.60), torchW * 0.8);
    float l = pow(light, 1.15);
    // vanilla plains-like tint with gentle per-tuft variation (darker base)
    vec3 tint = mix(vec3(0.40, 0.62, 0.22), vec3(0.54, 0.78, 0.30), vTintV);
    tint *= mix(0.82, 1.0, vY01);
    vec3 shadowTint = mix(vec3(0.80, 0.86, 1.08), vec3(1.0), sf);
    vec3 col = t.rgb * tint * l * lightCol * shadowTint;
    float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fogF);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** classic cross model: two upright quads, base slightly sunk */
function makeTuftGeometry(): THREE.InstancedBufferGeometry {
  const w = 0.42; // half-width → tuft spans ~0.84 blocks like vanilla crosses
  const verts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  // quad 0 along local X, quad 1 along local Z; corners BL,BR,TR,TL
  verts.push(-w, 0, 0, w, 0, 0, w, 1, 0, -w, 1, 0);
  verts.push(0, 0, -w, 0, 0, w, 0, 1, w, 0, 1, -w);
  uvs.push(0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1);
  idx.push(0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.instanceCount = 0;
  return geo;
}

/** 16×16 grayscale tuft texture in the vanilla tall_grass.png spirit:
 *  several 1px strands rising from the bottom with slight leans. Kept
 *  GRAYSCALE on purpose — color comes from the shader tint (vanilla
 *  colormap convention, avoids the dark double-tinted look). */
function makeTuftTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 16);
  let seed = 20240613;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const grays = ['#b3b3b3', '#a3a3a3', '#c0c0c0', '#969696', '#bdbdbd'];
  for (let i = 0; i < 11; i++) {
    let x = 1 + Math.floor(rnd() * 14);
    const h = 6 + Math.floor(rnd() * 9);
    const col = grays[Math.floor(rnd() * grays.length)];
    ctx.fillStyle = col;
    for (let j = 0; j < h; j++) {
      ctx.fillRect(x, 15 - j, 1, 1);
      if (j > h * 0.45 && rnd() < 0.4) {
        x += rnd() < 0.5 ? 1 : -1;
        x = Math.max(0, Math.min(15, x));
        ctx.fillStyle = col;
      }
      // sparse side twig on a few strands
      if (j === Math.floor(h * 0.6) && rnd() < 0.35) {
        ctx.fillRect(x + (rnd() < 0.5 ? 1 : -1), 15 - j, 1, 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class GrassManager {
  private scene: THREE.Scene;
  private meshes = new Map<string, THREE.InstancedMesh>();
  private mat: THREE.ShaderMaterial;
  private tex: THREE.CanvasTexture;
  density = 0.45;
  enabled = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tex = makeTuftTexture();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSunLevel: { value: 1 },
        uFogColor: { value: new THREE.Color(0x9fc7ff) },
        uFogNear: { value: 60 },
        uFogFar: { value: 120 },
        uMap: { value: this.tex },
        uSunDirW: { value: new THREE.Vector3(0.5, 0.8, 0.2).normalize() },
        uShadowMap: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
        uShadowStrength: { value: 0 },
        uTorchPos0: { value: new THREE.Vector3() },
        uTorchPos1: { value: new THREE.Vector3() },
        uTorchMap0: { value: null },
        uTorchMap1: { value: null },
        uTorchFar0: { value: 17 },
        uTorchFar1: { value: 17 },
        uTorchRange0: { value: 0 },
        uTorchRange1: { value: 0 },
        uTorchCount: { value: 0 },
      },
      side: THREE.DoubleSide,
      transparent: false,
    });
  }

  private hash(x: number, z: number): number {
    let h = (x * 374761393 + z * 668265263) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** (re)build the grass instancing for one chunk */
  updateChunk(chunk: Chunk, world: World): void {
    const key = `${chunk.cx},${chunk.cz}`;
    const old = this.meshes.get(key);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      this.meshes.delete(key);
    }
    if (!this.enabled || this.density < 0.02) return;

    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const offsets: number[] = [];
    const rots: number[] = [];
    const scales: number[] = [];
    const tints: number[] = [];
    const skies: number[] = [];
    const blocks: number[] = [];
    const phases: number[] = [];

    // vanilla-style TUFTS: 0..3 per block from the density slider
    // (0.45 → 1 tuft, 1.0 → 2-3), plus patchy clearings for clumps
    const tuftsPerBlock = Math.round(this.density * 2.5);
    if (tuftsPerBlock <= 0) return;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        // find the surface
        for (let y = WORLD_HEIGHT - 2; y > 0; y--) {
          const id = chunk.data[blockIndex(lx, y, lz)];
          if (id === BLOCK.AIR) continue;
          const above = chunk.data[blockIndex(lx, y + 1, lz)];
          if ((id === BLOCK.GRASS) && above === BLOCK.AIR) {
            // meadow patchiness — clumps with clearings, stable per block
            const patch = this.hash(x0 + lx, z0 + lz);
            if (patch < 0.22) break;
            const lightByte = chunk.light[blockIndex(lx, y + 1, lz)];
            const skyL = (lightByte >> 4) / 15;
            const blockL = (lightByte & 15) / 15;
            if (skyL < 0.15 && blockL < 0.15) break;
            for (let b = 0; b < tuftsPerBlock; b++) {
              if (offsets.length / 3 >= MAX_PER_CHUNK) break;
              const r1 = this.hash(x0 * 131 + lx * 7 + b, z0 * 197 + lz * 13 + b);
              const r2 = this.hash(z0 * 311 + lx * 17 + b, x0 * 257 + lz * 5 + b);
              const r3 = this.hash(x0 * 97 + b * 31 + lz, z0 * 53 + b * 11 + lx);
              const px = x0 + lx + 0.12 + r1 * 0.76;
              const pz = z0 + lz + 0.12 + r2 * 0.76;
              offsets.push(px, y + 0.98, pz);
              rots.push(r3 * Math.PI);
              scales.push(0.75 + r1 * 0.35);
              tints.push(r2);
              skies.push(skyL * 0.95);
              blocks.push(blockL);
              phases.push(r3 * Math.PI * 2);
            }
            break; // only the surface block spawns grass
          }
          if (id !== BLOCK.AIR) break; // covered by something solid
        }
      }
    }

    const count = offsets.length / 3;
    if (count === 0) return;
    const geo = makeTuftGeometry();
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(new Float32Array(rots), 1));
    geo.setAttribute('aScaleY', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
    geo.setAttribute('aTintV', new THREE.InstancedBufferAttribute(new Float32Array(tints), 1));
    geo.setAttribute('aSkyL', new THREE.InstancedBufferAttribute(new Float32Array(skies), 1));
    geo.setAttribute('aBlockL', new THREE.InstancedBufferAttribute(new Float32Array(blocks), 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
    geo.instanceCount = count;
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(x0 + CHUNK_SIZE / 2, WORLD_HEIGHT / 2, z0 + CHUNK_SIZE / 2),
      Math.sqrt(CHUNK_SIZE * CHUNK_SIZE + WORLD_HEIGHT * WORLD_HEIGHT) / 2 + 2,
    );
    const mesh = new THREE.InstancedMesh(geo, this.mat, count);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 0;
    this.meshes.set(key, mesh);
    this.scene.add(mesh);
  }

  setDensity(d: number, world: World): void {
    this.density = d;
    if (d < 0.02) {
      this.clear();
      return;
    }
    for (const chunk of world.chunks.values()) {
      if (chunk.hasData && chunk.meshes) this.updateChunk(chunk, world);
    }
  }

  /** drop grass meshes for chunks that no longer exist */
  sweep(world: World): void {
    for (const key of Array.from(this.meshes.keys())) {
      if (!world.chunks.has(key)) {
        const mesh = this.meshes.get(key)!;
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(key);
      }
    }
  }

  clear(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.clear();
  }

  update(time: number, sunLevel: number, fogColor: THREE.Color, fogNear: number, fogFar: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uSunLevel.value = sunLevel;
    (this.mat.uniforms.uFogColor.value as THREE.Color).copy(fogColor);
    this.mat.uniforms.uFogNear.value = fogNear;
    this.mat.uniforms.uFogFar.value = fogFar;
  }

  /** sun-shadow uniforms fed by GraphicsSystem (map + matrix + texel + strength) */
  setShadowUniforms(map: THREE.Texture | null, matrix: THREE.Matrix4, texel: THREE.Vector2): void {
    this.mat.uniforms.uShadowMap.value = map;
    this.mat.uniforms.uShadowMatrix.value.copy(matrix);
    this.mat.uniforms.uShadowTexel.value.copy(texel);
  }

  setShadowStrength(s: number, sunDir: THREE.Vector3): void {
    this.mat.uniforms.uShadowStrength.value = s;
    (this.mat.uniforms.uSunDirW.value as THREE.Vector3).copy(sunDir);
  }

  /** torch cube-shadow uniforms for slot 0|1 (pos=null → inactive) */
  setTorchUniforms(slot: number, pos: THREE.Vector3 | null, map: THREE.Texture | null, far: number, range: number): void {
    const u = this.mat.uniforms;
    (u[`uTorchPos${slot}`].value as THREE.Vector3).copy(pos ?? this.mat.uniforms.uTorchPos0.value);
    u[`uTorchMap${slot}`].value = map;
    u[`uTorchFar${slot}`].value = far;
    u[`uTorchRange${slot}`].value = range;
  }

  setTorchCount(n: number): void {
    this.mat.uniforms.uTorchCount.value = n;
  }

  dispose(): void {
    this.clear();
    this.mat.dispose();
    this.tex.dispose();
  }
}
