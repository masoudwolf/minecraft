// ─── Chunk + World + Voxel lighting engine (sky & block light BFS) ───────────
import * as THREE from 'three';
import { BLOCK, isOpaque, getBlockDef } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex, chunkKey, CHUNK_AREA } from '../constants';
import { TerrainGenerator } from './terrain';
import { buildChunkMesh, disposeChunkMesh, ChunkMeshes } from './mesher';
import { getAtlas } from '../textures/atlas';

/** simple FIFO queue with head pointer (avoids O(n) shift) */
class LightQueue {
  private items: LightNode[] = [];
  private head = 0;
  get length(): number { return this.items.length - this.head; }
  push(n: LightNode): void { this.items.push(n); }
  shift(): LightNode | undefined {
    if (this.head >= this.items.length) return undefined;
    const n = this.items[this.head];
    this.items[this.head] = undefined as unknown as LightNode;
    this.head++;
    if (this.head > 4096 && this.head === this.items.length) {
      this.items = []; this.head = 0;
    }
    return n;
  }
  clear(): void { this.items = []; this.head = 0; }
}

export class Chunk {
  data: Uint8Array;
  light: Uint8Array;
  cx: number;
  cz: number;
  meshes: ChunkMeshes | null = null;
  needsMesh = true;
  hasData = false;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
    this.light = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  }
}

interface LightNode { x: number; y: number; z: number; level: number }

export class World {
  chunks = new Map<string, Chunk>();
  terrain: TerrainGenerator;
  edits = new Map<string, Map<number, number>>();
  group: THREE.Group;
  private materials: { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; water: THREE.ShaderMaterial };
  private skyAddQ = new LightQueue();
  private skyRemQ = new LightQueue();
  private blockAddQ = new LightQueue();
  private blockRemQ = new LightQueue();
  version = 0; // bumped on block edits (for save tracking)

  constructor(seed: number, savedEdits?: Record<string, Record<number, number>>) {
    this.terrain = new TerrainGenerator(seed);
    this.group = new THREE.Group();
    this.materials = createVoxelMaterials();
    if (savedEdits) {
      for (const key of Object.keys(savedEdits)) {
        this.edits.set(key, new Map(Object.entries(savedEdits[key]).map(([k, v]) => [Number(k), v])));
      }
    }
  }

  getMaterial(name: 'opaque' | 'cutout' | 'water'): THREE.ShaderMaterial {
    return this.materials[name];
  }

  // ── Chunk management ───────────────────────────────────────────────────────
  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
      this.terrain.generateChunk(cx, cz, chunk.data);
      // apply saved edits
      const edits = this.edits.get(key);
      if (edits) for (const [idx, id] of edits) chunk.data[idx] = id;
      chunk.hasData = true;
      this.computeInitialSkyLight(chunk);
      this.seedLightBorders(chunk);
      this.processLightQueues(200000);
    }
    return chunk;
  }

  unloadChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (chunk) {
      disposeChunkMesh(chunk, this.group);
      this.chunks.delete(key);
    }
  }

  // ── Block access ───────────────────────────────────────────────────────────
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.hasData) return BLOCK.AIR;
    return chunk.data[blockIndex(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  setBlock(wx: number, wy: number, wz: number, id: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.hasData) return;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const idx = blockIndex(lx, wy, lz);
    const old = chunk.data[idx];
    if (old === id) return;
    chunk.data[idx] = id;

    const key = chunkKey(cx, cz);
    let edits = this.edits.get(key);
    if (!edits) { edits = new Map(); this.edits.set(key, edits); }
    edits.set(idx, id);
    this.version++;

    chunk.needsMesh = true;
    // neighbor chunk meshes if on border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);

    // ── light updates ──
    const oldDef = getBlockDef(old);
    const newDef = getBlockDef(id);
    const wasOpaque = isOpaque(old);
    const nowOpaque = isOpaque(id);
    if (wasOpaque && !nowOpaque) {
      // opened up: pull light from neighbors
      for (const [dx, dy, dz] of NEIGHBORS) {
        this.seedSky(wx + dx, wy + dy, wz + dz);
        this.seedBlock(wx + dx, wy + dy, wz + dz);
      }
      if (wy === WORLD_HEIGHT - 1) this.seedSky(wx, wy, wz);
    } else if (!wasOpaque && nowOpaque) {
      // blocked: remove light here
      const l = chunk.light[idx];
      const sky = l >> 4, blk = l & 15;
      chunk.light[idx] = 0;
      this.markDirty(cx, cz);
      if (sky > 0) this.skyRemQ.push({ x: wx, y: wy, z: wz, level: sky });
      if (blk > 0) this.blockRemQ.push({ x: wx, y: wy, z: wz, level: blk });
    }
    // emission changes
    const oldEmit = oldDef?.lightEmit ?? 0;
    const newEmit = newDef?.lightEmit ?? 0;
    if (oldEmit > 0 && newEmit === 0) {
      const l = chunk.light[idx];
      const blk = l & 15;
      chunk.light[idx] = l & 0xf0;
      this.blockRemQ.push({ x: wx, y: wy, z: wz, level: blk });
    }
    if (newEmit > 0) {
      const l = chunk.light[idx];
      chunk.light[idx] = (l & 0xf0) | newEmit;
      this.blockAddQ.push({ x: wx, y: wy, z: wz, level: newEmit });
    }
    // re-propagate through non-opaque replacement (e.g. water->air)
    if (!nowOpaque && !wasOpaque && old !== id) {
      this.seedSky(wx, wy, wz);
      this.seedBlock(wx, wy, wz);
    }
    this.processLightQueues(100000);
  }

  private markDirty(cx: number, cz: number): void {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.needsMesh = true;
  }

  // ── Light access ───────────────────────────────────────────────────────────
  getLight(wx: number, wy: number, wz: number): number {
    if (wy < 0) return 0;
    if (wy >= WORLD_HEIGHT) return 0xf0;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.hasData) return -1; // unknown
    return chunk.light[blockIndex(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)];
  }

  /** for meshing: unknown chunks treated as full sky (avoids black borders) */
  getLightForMesh(wx: number, wy: number, wz: number): number {
    const l = this.getLight(wx, wy, wz);
    return l < 0 ? 0xf0 : l;
  }

  private setLightRaw(wx: number, wy: number, wz: number, val: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk || !chunk.hasData) return;
    chunk.light[blockIndex(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE)] = val;
    chunk.needsMesh = true;
  }

  // ── Initial sky light (column scan) ────────────────────────────────────────
  private computeInitialSkyLight(chunk: Chunk): void {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        let level = 15;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
          const id = chunk.data[blockIndex(lx, y, lz)];
          if (isOpaque(id)) level = 0;
          else if (id === BLOCK.WATER) level = Math.max(0, level - 2);
          else if (id === BLOCK.LEAVES || id === BLOCK.SPRUCE_LEAVES) level = Math.max(0, level - 1);
          const emit = getBlockDef(id)?.lightEmit ?? 0;
          const idx = blockIndex(lx, y, lz);
          chunk.light[idx] = (level << 4) | emit;
          if (emit > 0) this.blockAddQ.push({ x: chunk.cx * CHUNK_SIZE + lx, y, z: chunk.cz * CHUNK_SIZE + lz, level: emit });
        }
      }
    }
  }

  /** enqueue sky-lit cells that can spread + pull light from neighbor chunks */
  private seedLightBorders(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const idx = blockIndex(lx, y, lz);
          const sky = chunk.light[idx] >> 4;
          if (sky > 1) {
            // enqueue if any neighbor is transparent with lower light (cave mouths, overhangs)
            const wx = x0 + lx, wz = z0 + lz;
            for (const [dx, dy, dz] of NEIGHBORS) {
              const nx = wx + dx, ny = y + dy, nz = wz + dz;
              if (ny < 0 || ny >= WORLD_HEIGHT) continue;
              const nb = this.getBlock(nx, ny, nz);
              if (isOpaque(nb)) continue;
              const nl = this.getLight(nx, ny, nz);
              const nSky = nl < 0 ? 0 : nl >> 4;
              if (nSky < sky - 1) {
                this.skyAddQ.push({ x: wx, y, z: wz, level: sky });
                break;
              }
            }
          }
        }
      }
    }
  }

  private seedSky(wx: number, wy: number, wz: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const l = this.getLight(wx, wy, wz);
    if (l < 0) return;
    const id = this.getBlock(wx, wy, wz);
    if (isOpaque(id)) return;
    const sky = l >> 4;
    if (sky > 0) this.skyAddQ.push({ x: wx, y: wy, z: wz, level: sky });
  }

  private seedBlock(wx: number, wy: number, wz: number): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const l = this.getLight(wx, wy, wz);
    if (l < 0) return;
    const id = this.getBlock(wx, wy, wz);
    if (isOpaque(id)) return;
    const blk = l & 15;
    if (blk > 0) this.blockAddQ.push({ x: wx, y: wy, z: wz, level: blk });
  }

  // ── BFS processing ─────────────────────────────────────────────────────────
  processLightQueues(maxOps: number): void {
    let ops = 0;
    // sky removal
    while (this.skyRemQ.length > 0 && ops < maxOps) {
      const n = this.skyRemQ.shift();
      if (!n) break;
      ops++;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = n.x + dx, ny = n.y + dy, nz = n.z + dz;
        const nl = this.getLight(nx, ny, nz);
        if (nl < 0) continue;
        const nSky = nl >> 4;
        if (nSky === 0) continue;
        const downward = dy === -1 && n.level === 15;
        if (nSky < n.level || (downward && nSky === 15)) {
          this.setLightRaw(nx, ny, nz, (nl & 0x0f) | (0 << 4));
          this.skyRemQ.push({ x: nx, y: ny, z: nz, level: nSky });
        } else if (nSky >= n.level) {
          this.skyAddQ.push({ x: nx, y: ny, z: nz, level: nSky });
        }
      }
    }
    // sky addition
    while (this.skyAddQ.length > 0 && ops < maxOps) {
      const n = this.skyAddQ.shift();
      if (!n) break;
      ops++;
      const cur = this.getLight(n.x, n.y, n.z);
      if (cur < 0 || (cur >> 4) > n.level) continue;
      const id = this.getBlock(n.x, n.y, n.z);
      if (isOpaque(id)) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = n.x + dx, ny = n.y + dy, nz = n.z + dz;
        const nl = this.getLight(nx, ny, nz);
        if (nl < 0) continue;
        const nbId = this.getBlock(nx, ny, nz);
        if (isOpaque(nbId)) continue;
        const nSky = nl >> 4;
        let target = n.level - 1;
        if (dy === -1 && n.level === 15) target = 15;
        if (nbId === BLOCK.WATER) target = Math.max(0, target - 2);
        if (nbId === BLOCK.LEAVES || nbId === BLOCK.SPRUCE_LEAVES) target = Math.max(0, target - 1);
        if (nSky < target) {
          this.setLightRaw(nx, ny, nz, (nl & 0x0f) | (target << 4));
          this.skyAddQ.push({ x: nx, y: ny, z: nz, level: target });
        }
      }
    }
    // block light removal
    while (this.blockRemQ.length > 0 && ops < maxOps) {
      const n = this.blockRemQ.shift();
      if (!n) break;
      ops++;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = n.x + dx, ny = n.y + dy, nz = n.z + dz;
        const nl = this.getLight(nx, ny, nz);
        if (nl < 0) continue;
        const nBlk = nl & 15;
        if (nBlk === 0) continue;
        if (nBlk < n.level) {
          this.setLightRaw(nx, ny, nz, nl & 0xf0);
          this.blockRemQ.push({ x: nx, y: ny, z: nz, level: nBlk });
        } else if (nBlk >= n.level) {
          this.blockAddQ.push({ x: nx, y: ny, z: nz, level: nBlk });
        }
      }
    }
    // block light addition
    while (this.blockAddQ.length > 0 && ops < maxOps) {
      const n = this.blockAddQ.shift();
      if (!n) break;
      ops++;
      const cur = this.getLight(n.x, n.y, n.z);
      if (cur < 0 || (cur & 15) > n.level) continue;
      const id = this.getBlock(n.x, n.y, n.z);
      if (isOpaque(id)) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nx = n.x + dx, ny = n.y + dy, nz = n.z + dz;
        const nl = this.getLight(nx, ny, nz);
        if (nl < 0) continue;
        const nbId = this.getBlock(nx, ny, nz);
        if (isOpaque(nbId)) continue;
        const nBlk = nl & 15;
        const target = n.level - 1;
        if (nBlk < target && target > 0) {
          this.setLightRaw(nx, ny, nz, (nl & 0xf0) | target);
          this.blockAddQ.push({ x: nx, y: ny, z: nz, level: target });
        }
      }
    }
  }

  // ── Meshing ────────────────────────────────────────────────────────────────
  buildMesh(chunk: Chunk): void {
    buildChunkMesh(this, chunk, this.group, this.materials);
  }

  /** topmost non-air solid y at column (for spawning) */
  surfaceY(wx: number, wz: number): number {
    for (let y = WORLD_HEIGHT - 1; y > 0; y--) {
      const id = this.getBlock(wx, y, wz);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER) return y;
    }
    return 1;
  }

  getChunkCount(): number {
    return this.chunks.size;
  }
}

export const NEIGHBORS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

// ─── Voxel shader materials ──────────────────────────────────────────────────
export function createVoxelMaterials(): { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; water: THREE.ShaderMaterial } {
  const { texture } = getAtlas();

  const vertexShader = /* glsl */ `
    attribute float aShade;
    attribute float aSky;
    attribute float aBlock;
    varying vec2 vUv;
    varying float vShade;
    varying float vSky;
    varying float vBlock;
    varying float vFogDepth;
    uniform float uTime;
    uniform float uWave;
    void main() {
      vUv = uv;
      vShade = aShade;
      vSky = aSky;
      vBlock = aBlock;
      vec3 pos = position;
      if (uWave > 0.5) {
        pos.y += sin(uTime * 1.6 + position.x * 0.9 + position.z * 0.7) * 0.045 - 0.05;
      }
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fragmentShader = /* glsl */ `
    uniform sampler2D uAtlas;
    uniform float uSunLevel;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uAlphaTest;
    varying vec2 vUv;
    varying float vShade;
    varying float vSky;
    varying float vBlock;
    varying float vFogDepth;
    void main() {
      vec4 tex = texture2D(uAtlas, vUv);
      if (tex.a < uAlphaTest) discard;
      float light = max(vBlock, vSky * uSunLevel);
      light = clamp(light, 0.045, 1.0);
      float l = pow(light, 1.15);
      vec3 col = tex.rgb * vShade * l;
      float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
      col = mix(col, uFogColor, fogF);
      gl_FragColor = vec4(col, tex.a);
    }
  `;

  const make = (opts: { transparent: boolean; alphaTest: number; wave: number; side: THREE.Side; depthWrite: boolean }): THREE.ShaderMaterial => {
    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: texture },
        uSunLevel: { value: 1 },
        uFogColor: { value: new THREE.Color(0x9fc7ff) },
        uFogNear: { value: 60 },
        uFogFar: { value: 120 },
        uAlphaTest: { value: opts.alphaTest },
        uTime: { value: 0 },
        uWave: { value: opts.wave },
      },
      transparent: opts.transparent,
      side: opts.side,
      depthWrite: opts.depthWrite,
    });
    return m;
  };

  return {
    opaque: make({ transparent: false, alphaTest: 0.0, wave: 0, side: THREE.FrontSide, depthWrite: true }),
    cutout: make({ transparent: false, alphaTest: 0.5, wave: 0, side: THREE.DoubleSide, depthWrite: true }),
    water: make({ transparent: true, alphaTest: 0.05, wave: 1, side: THREE.DoubleSide, depthWrite: true }),
  };
}

export { CHUNK_AREA };
