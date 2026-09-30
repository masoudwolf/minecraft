// ─── Instanced grass — wind-swayed blades on every grass block, density-driven
// One InstancedMesh per chunk (built at mesh time). Blades are crossed tapered
// fans, colored by baked voxel light + biome-ish tint variation, animated by
// two sine wind layers in the vertex shader. Density slider maps 0..1 → blades.

import * as THREE from 'three';
import { BLOCK } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from '../constants';
import type { Chunk, World } from '../world/world';

const MAX_PER_CHUNK = 4096;

const VERT = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aRot;
  attribute float aScaleY;
  attribute float aTintV;
  attribute float aSkyL;
  attribute float aBlockL;
  attribute float aPhase;
  varying float vY01;
  varying float vTintV;
  varying float vLight;
  varying float vFogDepth;
  uniform float uTime;
  void main() {
    float c = cos(aRot);
    float s = sin(aRot);
    float w01 = clamp(position.y, 0.0, 1.0);
    float wind = sin(uTime * 1.9 + aOffset.x * 0.35 + aOffset.z * 0.28 + aPhase) * 0.5
               + sin(uTime * 3.4 + aOffset.x * 0.9 - aOffset.z * 0.6 + aPhase * 1.7) * 0.18;
    float sway = wind * 0.14 * w01 * w01;
    vec2 dir = vec2(c, s);
    vec2 side = vec2(-s, c);
    vec3 local = vec3(side * position.x + dir * sway * w01, position.y * aScaleY);
    vec3 world = aOffset + local;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vFogDepth = -mv.z;
    vY01 = w01;
    vTintV = aTintV;
    vLight = max(aBlockL, aSkyL);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying float vY01;
  varying float vTintV;
  varying float vLight;
  varying float vFogDepth;
  uniform float uSunLevel;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  void main() {
    float l = clamp(max(vLight * uSunLevel, 0.06), 0.0, 1.0);
    l = pow(l, 1.15);
    vec3 base = vec3(0.18, 0.34, 0.12);
    vec3 tip = mix(vec3(0.44, 0.68, 0.25), vec3(0.62, 0.66, 0.22), vTintV * 0.85);
    vec3 col = mix(base, tip, vY01) * l;
    float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
    col = mix(col, uFogColor, fogF);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeBladeGeometry(): THREE.InstancedBufferGeometry {
  // one crossed blade: 2 tapered fans (5 verts each), tip at top
  const w = 0.055;
  const px = [-w, w, -w * 0.55, w * 0.55, 0];
  const py = [0, 0, 0.52, 0.52, 1];
  const verts: number[] = [];
  const idx: number[] = [];
  for (let q = 0; q < 2; q++) {
    const base = q * 5;
    for (let i = 0; i < 5; i++) verts.push(px[i], py[i], 0);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3, base + 2, base + 3, base + 4);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.instanceCount = 0;
  return geo;
}

export class GrassManager {
  private scene: THREE.Scene;
  private meshes = new Map<string, THREE.InstancedMesh>();
  private mat: THREE.ShaderMaterial;
  density = 0.45;
  enabled = true;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSunLevel: { value: 1 },
        uFogColor: { value: new THREE.Color(0x9fc7ff) },
        uFogNear: { value: 60 },
        uFogFar: { value: 120 },
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

    const bladesPerBlock = Math.round(this.density * 11);
    if (bladesPerBlock <= 0) return;

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
            if (patch < 0.18) break;
            const lightByte = chunk.light[blockIndex(lx, y + 1, lz)];
            const skyL = (lightByte >> 4) / 15;
            const blockL = (lightByte & 15) / 15;
            if (skyL < 0.15 && blockL < 0.15) break;
            for (let b = 0; b < bladesPerBlock; b++) {
              if (offsets.length / 3 >= MAX_PER_CHUNK) break;
              const r1 = this.hash(x0 * 131 + lx * 7 + b, z0 * 197 + lz * 13 + b);
              const r2 = this.hash(z0 * 311 + lx * 17 + b, x0 * 257 + lz * 5 + b);
              const r3 = this.hash(x0 * 97 + b * 31 + lz, z0 * 53 + b * 11 + lx);
              const px = x0 + lx + 0.15 + r1 * 0.7;
              const pz = z0 + lz + 0.15 + r2 * 0.7;
              offsets.push(px, y + 1, pz);
              rots.push(r3 * Math.PI);
              scales.push(0.55 + r1 * 0.55);
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
    const geo = makeBladeGeometry();
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

  dispose(): void {
    this.clear();
    this.mat.dispose();
  }
}
