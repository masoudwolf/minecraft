// ─── Chunk + World + Voxel lighting engine (sky & block light BFS) ───────────
import * as THREE from 'three';
import { BLOCK, getBlockDef, isOpaque, isWaterId, waterLevel, flowId, waterReplaceable, FLOW_MAX } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex, chunkKey, CHUNK_AREA } from '../constants';
import { TerrainGenerator } from './terrain';
import { buildChunkMesh, disposeChunkMesh, ChunkMeshes } from './mesher';
import { getAtlas } from '../textures/atlas';
import { createWaterMaterial } from '../graphics/waterGfx';
import { GLSL_SHADOW, GLSL_CUBE_SHADOW, GLSL_NOISE, GLSL_CLOUD_SHADOW } from '../graphics/glsl';

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
  /** torch positions (world coords) collected during meshing — used for flame particles */
  torches: [number, number, number][] = [];

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
  /** fluid update queue: key "x,y,z" -> due time (seconds, accumulating clock) */
  private fluidQ = new Map<string, number>();
  private fluidNow = 0;
  static readonly FLUID_DELAY = 0.28; // seconds between fluid updates per cell

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
      // resume any saved flowing water / plants (fluid queue is transient)
      if (edits) {
        for (const [idx, id] of edits) {
          if (isWaterId(id) || id === BLOCK.SUGARCANE || id === BLOCK.CACTUS) {
            const lx = idx % CHUNK_SIZE;
            const lz = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE;
            const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
            this.scheduleFluidTick(cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz, 0.5 + Math.random() * 0.5);
          }
        }
      }
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

  /** schedule a fluid update at cell (called on edits near water) */
  scheduleFluidTick(wx: number, wy: number, wz: number, delay = World.FLUID_DELAY): void {
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    const key = wx + ',' + wy + ',' + wz;
    if (!this.fluidQ.has(key)) this.fluidQ.set(key, this.fluidNow + delay);
  }

  /** schedule fluid updates around an edited cell (self + 6 neighbors) */
  wakeFluidsAround(wx: number, wy: number, wz: number): void {
    this.scheduleFluidTick(wx, wy, wz);
    for (const [dx, dy, dz] of NEIGHBORS) this.scheduleFluidTick(wx + dx, wy + dy, wz + dz);
  }

  /** process due fluid cells; budget caps work per call */
  tickFluids(dt: number, budget = 120): void {
    if (this.fluidQ.size === 0) return;
    this.fluidNow += dt;
    const due: [number, number, number][] = [];
    for (const [key, t] of this.fluidQ) {
      if (t <= this.fluidNow) {
        const [x, y, z] = key.split(',').map(Number);
        due.push([x, y, z]);
        this.fluidQ.delete(key);
        if (due.length >= budget) break;
      }
    }
    for (const [x, y, z] of due) this.fluidTickCell(x, y, z);
  }

  get fluidQueueSize(): number { return this.fluidQ.size; }

  /** one fluid update for a single cell */
  private fluidTickCell(x: number, y: number, z: number): void {
    const id = this.getBlock(x, y, z);
    if (isWaterId(id)) {
      this.tickWater(x, y, z, id);
      return;
    }
    // plant growth rides the same scheduler: sugarcane / cactus grow here
    if (id === BLOCK.SUGARCANE || id === BLOCK.CACTUS) this.tickPlant(x, y, z, id);
  }

  private tickWater(x: number, y: number, z: number, id: number): void {
    const level = waterLevel(id);
    const belowId = this.getBlock(x, y - 1, z);
    const belowFlowable = belowId === BLOCK.AIR || waterReplaceable(belowId);

    // ── infinite water: flowing cell beside 2+ sources becomes a source ──
    if (level > 0) {
      let srcNeighbors = 0;
      if (this.getBlock(x + 1, y, z) === BLOCK.WATER) srcNeighbors++;
      if (this.getBlock(x - 1, y, z) === BLOCK.WATER) srcNeighbors++;
      if (this.getBlock(x, y, z + 1) === BLOCK.WATER) srcNeighbors++;
      if (this.getBlock(x, y, z - 1) === BLOCK.WATER) srcNeighbors++;
      if (srcNeighbors >= 2) {
        this.setBlock(x, y, z, BLOCK.WATER);
        return;
      }
    }

    if (level > 0) {
      // ── recede/recompute level: fed from above (falling = level 1) or nearest neighbor+1 ──
      let best = 99;
      if (isWaterId(this.getBlock(x, y + 1, z))) best = 0; // falling column targets level 1
      const horiz: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of horiz) {
        const nId = this.getBlock(x + dx, y, z + dz);
        if (isWaterId(nId)) best = Math.min(best, waterLevel(nId));
      }
      const want = best + 1;
      if (want > FLOW_MAX) { this.setBlock(x, y, z, BLOCK.AIR); return; }
      if (want !== level) { this.setBlock(x, y, z, flowId(want)); return; }
    }

    // ── flow down first (falling column keeps level 1) ──
    if (belowFlowable) {
      if (!isWaterId(belowId) || waterLevel(belowId) > 1) {
        this.setBlock(x, y - 1, z, flowId(1));
      }
      this.scheduleFluidTick(x, y - 1, z);
      return; // falling water doesn't spread sideways mid-air (MC-like)
    }

    // ── spread horizontally when resting on solid ground / water ──
    if (level >= FLOW_MAX) return;
    const horiz: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of horiz) {
      const nx = x + dx, nz = z + dz;
      const nId = this.getBlock(nx, y, nz);
      if (isWaterId(nId)) {
        const nl = waterLevel(nId);
        if (nId !== BLOCK.WATER && nl > level + 1) {
          this.setBlock(nx, y, nz, flowId(level + 1));
          this.scheduleFluidTick(nx, y, nz);
        }
      } else if (waterReplaceable(nId)) {
        this.setBlock(nx, y, nz, flowId(level + 1));
        this.scheduleFluidTick(nx, y, nz);
      }
    }
  }

  /** grow sugarcane / cactus upward (max 3 tall) */
  private tickPlant(x: number, y: number, z: number, id: number): void {
    if (Math.random() > 0.18) return; // slow growth
    let base = y;
    while (base > 0 && this.getBlock(x, base - 1, z) === id) base--;
    if (y - base >= 2) return; // max 3 tall
    if (this.getBlock(x, y + 1, z) !== BLOCK.AIR) return;
    this.setBlock(x, y + 1, z, id);
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

    // ── fluid wake: edited cell + neighbors re-tick (water flows in/out) ──
    this.wakeFluidsAround(wx, wy, wz);

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

  /** biome name at a column (delegates to the generator; used by mob spawning) */
  biomeAt(wx: number, wz: number): string {
    return this.terrain.biomeAt(wx, wz);
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
          else if (isWaterId(id)) level = Math.max(0, level - 2);
          else if (id === BLOCK.LEAVES || id === BLOCK.SPRUCE_LEAVES || id === BLOCK.JUNGLE_LEAVES) level = Math.max(0, level - 1);
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
        if (isWaterId(nbId)) target = Math.max(0, target - 2);
        if (nbId === BLOCK.LEAVES || nbId === BLOCK.SPRUCE_LEAVES || nbId === BLOCK.JUNGLE_LEAVES) target = Math.max(0, target - 1);
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
      if (id !== BLOCK.AIR && !isWaterId(id)) return y;
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
    attribute vec3 aTint;
    attribute vec3 aNormal;
    attribute float aSway;
    varying vec2 vUv;
    varying float vShade;
    varying float vSky;
    varying float vBlock;
    varying vec3 vTint;
    varying float vFogDepth;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    uniform float uTime;
    uniform float uWave;
    uniform float uWindAmp;
    void main() {
      vUv = uv;
      vShade = aShade;
      vSky = aSky;
      vBlock = aBlock;
      vTint = aTint;
      vNormalW = aNormal;
      vec3 pos = position;
      vec4 wp0 = modelMatrix * vec4(position, 1.0);
      // ── waving foliage (shader-pack staple) ──
      // aSway: leaf cubes wobble rigidly (0.5), cross plants bend at the top
      // (0..0.9 by corner height), everything else is rigid. Phase uses WORLD
      // position so canopies/chunks desync naturally; a slow gust wave rides
      // on top so the breeze visibly travels across the terrain.
      if (aSway > 0.001 && uWindAmp > 0.001) {
        float ph = wp0.x * 0.85 + wp0.z * 0.65;
        float wnd = sin(uTime * 1.45 + ph) * 0.6 + sin(uTime * 2.55 + ph * 2.3 + wp0.x * 0.37) * 0.4;
        float gust = 0.75 + 0.45 * sin(uTime * 0.35 + wp0.z * 0.045);
        pos.x += wnd * 0.042 * aSway * uWindAmp * gust;
        pos.z += cos(uTime * 1.15 + ph * 1.6 + wp0.z * 0.41) * 0.034 * aSway * uWindAmp * gust;
      }
      if (uWave > 0.5) {
        // Wave phase MUST use world position (modelMatrix includes the chunk
        // offset): local position.x/z restart at 0 in every chunk, which made
        // phases disagree across chunk borders and tore visible seams in the
        // ocean surface (sand showing through the crack).
        // Only bob the top-surface vertices (fract(y) ≈ 0.875 for sources);
        // bottom edges stay welded to the floor/shore so no underwater gaps.
        float isTop = step(0.8, fract(position.y));
        float wave = sin(uTime * 1.6 + wp0.x * 0.9 + wp0.z * 0.7) * 0.03
                   + sin(uTime * 2.7 + wp0.x * 1.9 - wp0.z * 1.4) * 0.015;
        pos.y += (wave - 0.045) * isTop;
      }
      vec4 wp2 = modelMatrix * vec4(pos, 1.0);
      vWorldPos = wp2.xyz;
      vec4 mv = viewMatrix * wp2;
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fragmentShader = /* glsl */ `
    uniform sampler2D uAtlas;
    uniform float uSunLevel;
    uniform float uTime;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uAlphaTest;
    uniform sampler2D uShadowMap;
    uniform mat4 uShadowMatrix;
    uniform vec2 uShadowTexel;
    uniform float uShadowStrength;
    uniform float uShadowAmbient;
    // v0.50 — contour ambient (cheap sky-SH): per-face sky tint + blue-hour boost
    uniform vec3 uAmbZenith;
    uniform vec3 uAmbHorizon;
    uniform float uAmbBoost;
    uniform vec3 uSunDirW;
    uniform vec3 uSunColorW;
    uniform vec3 uTorchPos0;
    uniform vec3 uTorchPos1;
    uniform samplerCube uTorchMap0;
    uniform samplerCube uTorchMap1;
    uniform float uTorchFar0;
    uniform float uTorchFar1;
    uniform float uTorchRange0;
    uniform float uTorchRange1;
    uniform float uTorchCount;
    uniform float uTorchFlicker;
    uniform float uWaterLine;
    uniform float uCaustics;
    varying vec2 vUv;
    varying float vShade;
    varying float vSky;
    varying float vBlock;
    varying vec3 vTint;
    varying float vFogDepth;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    ${GLSL_NOISE}
    ${GLSL_SHADOW}
    ${GLSL_CUBE_SHADOW}
    ${GLSL_CLOUD_SHADOW}
    void main() {
      vec4 tex = texture2D(uAtlas, vUv);
      if (tex.a < uAlphaTest) discard;
      vec3 nrmW = normalize(vNormalW);
      float sf = 1.0;
      if (uShadowStrength > 0.001) {
        float ndl = clamp(dot(nrmW, uSunDirW), 0.0, 1.0);
        sf = gfxShadow(uShadowMap, uShadowMatrix, uShadowTexel, vWorldPos, vNormalW, ndl);
        sf = mix(1.0, sf, uShadowStrength);
      }
      // ── moving cloud shadows (BSL/SEUS staple): the same fbm the cloud dome
      // renders, projected along the light ray onto the cloud slab. Clouds
      // filter the sun, they never block it (55% floor).
      float cloudS = gfxCloudShadow(vWorldPos, uSunDirW);
      // ── v0.47 ambient split (SEUS/BSL light model) ──
      // The old code multiplied the WHOLE sky term by the shadow factor
      // (sf→ambient floor), which punished interiors twice: the voxel light
      // engine already reduced vSky for being indoors, then sf crushed what
      // was left — rooms read dim gray at noon (user report: "as if it's not
      // noon, the interior light doesn't come from the sun"). Now the DIRECT
      // sun term is shadow-gated while the AMBIENT sky-dome term follows vSky
      // alone — and vSky already encodes openings (glass/doorways let the
      // light BFS through), so rooms go bright at noon while outdoor shadows
      // keep their shape. Direct sun patches through windows read hot.
      float direct = vSky * uSunLevel * sf * cloudS;
      float ambient = vSky * uSunLevel * uShadowAmbient * cloudS * uAmbBoost;
      // v0.50 one-bounce GI proxy (Photon diffuse_lighting.glsl bounce term):
      // shadowed outdoor ground picks up light bounced off neighboring lit
      // faces — 0.055 · (1−shadow) · sky⁴ — so moonlit/daytime shadows are
      // never flat black, and the effect dies naturally indoors (sky⁴).
      float vSky2 = vSky * vSky;
      float bounce = 0.055 * (1.0 - sf) * vSky2 * vSky2 * min(uSunLevel, 1.0) * cloudS;
      float sunL = max(max(direct, ambient), bounce);
      // torch (block) light vs sun light are SEPARATE terms: the torch term is
      // modulated by the point-light cube shadow map (fences/trees/mobs cast
      // real radial shadows), and torch-dominant areas get a warm Unreal-style
      // tint while sun-dominant areas stay neutral daylight.
      float torchL = vBlock;
      if (uTorchCount > 0.5 && torchL > 0.02) {
        float ts = gfxCubeShadow(uTorchMap0, uTorchPos0, vWorldPos, vNormalW, uTorchFar0, uTorchRange0);
        if (uTorchCount > 1.5) ts = min(ts, gfxCubeShadow(uTorchMap1, uTorchPos1, vWorldPos, vNormalW, uTorchFar1, uTorchRange1));
        // 32% bounce floor: point-light shadows stay soft and warm, never black
        torchL *= mix(0.32, 1.0, ts);
        torchL *= uTorchFlicker; // candle flame flutter
      }
      // ── Photon torch-pool reshape (blocklight_color.glsl falloff family) ──
      // steep pow4 tail + quadratic fill: pools end ABRUPTLY a few blocks from
      // the flame (bl=0.5 reads 0.13, bl=0.25 reads 0.03). Against the darker
      // v0.48 night this gives the survival-horror contrast — 10:1 pool-to-
      // dark, danger reads at the edge of the light, not beyond it.
      float bl = clamp(torchL, 0.0, 1.0);
      torchL = bl * bl * bl * bl * 0.72 + bl * bl * 0.22 + bl * 0.06;
      float light = max(torchL, sunL);
      light = clamp(light, 0.045, 1.0);
      float torchW = clamp((torchL - sunL) * 1.35, 0.0, 1.0);
      vec3 lightCol = mix(vec3(1.0), vec3(1.30, 0.98, 0.60), torchW * 0.8);
      // ── v0.50 contour ambient (Complementary "contour shading" / sky-SH
      // lite): the ambient contribution is tinted per-face from the LIVE sky —
      // up faces drift toward the zenith color, walls toward the horizon, so
      // sunset paints west walls warm while east walls cool, and night ground
      // reads cold blue instead of flat gray. Weighted by how ambient-dominated
      // the pixel is (sunlit/torch pixels barely shift). Energy-neutral: the
      // tint is luminance-normalized, only its HUE varies.
      float hemi = nrmW.y * 0.5 + 0.5;
      vec3 ambTint = mix(uAmbHorizon, uAmbZenith, hemi);
      float ambLum = max(dot(ambTint, vec3(0.3333)), 0.001);
      vec3 ambTintN = ambTint * (1.0 / ambLum);
      float ambDom = clamp((ambient - max(direct, torchL)) * 2.2 + 0.35, 0.0, 1.0);
      lightCol *= mix(vec3(1.0), ambTintN, ambDom * 0.55);
      // ── sun/moon color grading of the terrain itself (BSL-style): warm
      // sunlight at sunset, cool blue moonlight at night — the sky and the
      // ground finally agree on the time of day.
      vec3 sunTintN = uSunColorW / max(max(uSunColorW.r, max(uSunColorW.g, uSunColorW.b)), 0.001);
      lightCol *= mix(vec3(1.0), sunTintN, 0.42);
      float l = pow(light, 1.15);
      // blue-shift only the SHADOWED (ambient-dominant) parts, softer than
      // before so indoor wood doesn't go gray-blue (ambient split above)
      vec3 shadowTint = mix(vec3(0.85, 0.90, 1.06), vec3(1.0), sf);
      vec3 col = tex.rgb * vTint * vShade * l * lightCol * shadowTint;
      // ── water caustics (SEUS-style) on floors beneath the water line: two
      // animated fbm layers interfere into a traveling bright web. Gated by
      // sky light (caves stay dark — no surface overhead to focus the sun)
      // and by depth, so dry ground a hair above the waterline is untouched.
      if (uCaustics > 0.5 && vSky > 0.4 && vSky < 0.94 && vWorldPos.y < uWaterLine - 0.55) {
        float depthFade = clamp((uWaterLine - vWorldPos.y) / 12.0, 0.0, 1.0);
        vec2 cp = vWorldPos.xz * 0.85;
        float c1 = fbm2(cp + vec2(uTime * 0.5, uTime * 0.34));
        float c2 = fbm2(cp * 1.7 - vec2(uTime * 0.43, uTime * 0.61));
        float caustic = smoothstep(0.52, 0.95, (c1 + c2) * 0.5);
        col *= 1.0 + caustic * 0.55 * depthFade * clamp(vSky - 0.4, 0.0, 1.0) * uSunLevel;
      }
      float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
      col = mix(col, uFogColor, fogF);
      gl_FragColor = vec4(col, tex.a);
    }
  `;

  const make = (opts: { transparent: boolean; alphaTest: number; wave: number; side: THREE.Side; depthWrite: boolean; shadowAmbient: number }): THREE.ShaderMaterial => {
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
        uWindAmp: { value: 1 },
        uTorchFlicker: { value: 1 },
        uWaterLine: { value: 40.875 },
        uCaustics: { value: 0 },
        uSunColorW: { value: new THREE.Color(1, 1, 1) },
        uCloudShadow: { value: 0 },
        uCloudWind: { value: 0 },
        uCloudCover: { value: 0.22 },
        uShadowMap: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
        uShadowStrength: { value: 0 },
        uShadowAmbient: { value: opts.shadowAmbient }, // sky-dome ambient strength (NOT shadow-gated — see v0.47 ambient split)
        uAmbZenith: { value: new THREE.Color(1, 1, 1) },
        uAmbHorizon: { value: new THREE.Color(1, 1, 1) },
        uAmbBoost: { value: 1 },
        uSunDirW: { value: new THREE.Vector3(0.5, 0.8, 0.2).normalize() },
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
      transparent: opts.transparent,
      side: opts.side,
      depthWrite: opts.depthWrite,
    });
    return m;
  };

  return {
    opaque: make({ transparent: false, alphaTest: 0.0, wave: 0, side: THREE.FrontSide, depthWrite: true, shadowAmbient: 0.56 }),
    cutout: make({ transparent: false, alphaTest: 0.5, wave: 0, side: THREE.DoubleSide, depthWrite: true, shadowAmbient: 0.66 }),
    water: createWaterMaterial(texture),
  };
}

export { CHUNK_AREA };
