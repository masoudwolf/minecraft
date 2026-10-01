// ─── Procedural terrain generation (biomes, caves, ores, trees) ──────────────
import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BLOCK } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, blockIndex } from '../constants';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Biome = 'plains' | 'forest' | 'desert' | 'snowy' | 'mountains' | 'jungle' | 'swamp' | 'mushroom';

export class TerrainGenerator {
  private n2Height: (x: number, y: number) => number;
  private n2Warp: (x: number, y: number) => number;
  private n2Temp: (x: number, y: number) => number;
  private n2Humid: (x: number, y: number) => number;
  private n2Mountains: (x: number, y: number) => number;
  private n3CaveA: (x: number, y: number, z: number) => number;
  private n3CaveB: (x: number, y: number, z: number) => number;
  private n3Cheese: (x: number, y: number, z: number) => number;
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
    const rng = mulberry32(seed);
    this.n2Height = createNoise2D(rng);
    this.n2Warp = createNoise2D(rng);
    this.n2Temp = createNoise2D(rng);
    this.n2Humid = createNoise2D(rng);
    this.n2Mountains = createNoise2D(rng);
    this.n3CaveA = createNoise3D(rng);
    this.n3CaveB = createNoise3D(rng);
    this.n3Cheese = createNoise3D(rng);
  }

  getSeed(): number {
    return this.seed;
  }

  private fbm2(n: (x: number, y: number) => number, x: number, z: number, octaves: number, freq: number, persistence = 0.5): number {
    let amp = 1, sum = 0, norm = 0, f = freq;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * f, z * f) * amp;
      norm += amp;
      amp *= persistence;
      f *= 2;
    }
    return sum / norm;
  }

  biomeAt(x: number, z: number): Biome {
    const wx = x + this.n2Warp(x * 0.004, z * 0.004) * 60;
    const temp = this.fbm2(this.n2Temp, wx, z, 2, 1 / 420);
    const humid = this.fbm2(this.n2Humid, wx, z, 2, 1 / 380);
    const m = this.fbm2(this.n2Mountains, x, z, 2, 1 / 260);
    if (m > 0.52) return 'mountains';
    // mushroom islands: rare mid-elevation warm-humid pockets (below mountain threshold)
    if (m > 0.415 && m <= 0.52 && temp > -0.05 && temp < 0.38 && humid > 0.30) return 'mushroom';
    if (temp > 0.42 && humid < 0.05) return 'desert';
    if (temp > 0.30 && humid > 0.42) return 'jungle';
    if (temp < -0.42) return 'snowy';
    if (humid > 0.18 && humid <= 0.42 && temp > -0.25 && temp < 0.35 && m <= 0.3) return 'swamp';
    if (humid > 0.12) return 'forest';
    return 'plains';
  }

  heightAt(x: number, z: number): number {
    const wx = x + this.n2Warp(x * 0.01, z * 0.01) * 15;
    const base = this.fbm2(this.n2Height, wx, z, 4, 1 / 180);
    const hills = this.fbm2(this.n2Height, wx + 500, z - 500, 3, 1 / 45);
    const m = this.fbm2(this.n2Mountains, x, z, 2, 1 / 260);
    let h = SEA_LEVEL + 2 + base * 10 + hills * 5;
    if (m > 0.42) {
      const mt = (m - 0.42) / 0.58; // 0..1
      const ridge = 1 - Math.abs(this.n2Mountains(x / 90, z / 90));
      h += mt * mt * 46 * (0.55 + ridge * 0.45);
    }
    // swamp: flatten toward sea level (leaves pools below water surface)
    const biome = this.biomeAt(x, z);
    if (biome === 'swamp') {
      h = SEA_LEVEL + (h - SEA_LEVEL) * 0.3;
      h = Math.max(SEA_LEVEL - 3, Math.round(h));
    }
    return Math.max(4, Math.min(WORLD_HEIGHT - 6, Math.round(h)));
  }

  /** deterministic hash -> 0..1 for a world column */
  private hash2(x: number, z: number, salt: number): number {
    let hash = Math.imul(x ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(z ^ 0x9e3779b9, 0x85ebca6b) ^ (this.seed + salt);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash ^= hash >>> 13;
    return (hash >>> 0) / 4294967296;
  }

  /** deterministic tree info for a column, or null */
  treeAt(x: number, z: number): { type: 'oak' | 'spruce' | 'jungle' | 'swamp' | 'mushroom_red' | 'mushroom_brown'; height: number } | null {
    const h = this.heightAt(x, z);
    if (h <= SEA_LEVEL) return null;
    const biome = this.biomeAt(x, z);
    const density = biome === 'forest' ? 0.028 : biome === 'plains' ? 0.004 : biome === 'snowy' ? 0.012 : biome === 'mountains' ? 0.006 : biome === 'jungle' ? 0.05 : biome === 'swamp' ? 0.012 : biome === 'mushroom' ? 0.016 : 0;
    if (density === 0) return null;
    const hash = this.hash2(x, z, 0);
    if (hash > density) return null;
    let type: 'oak' | 'spruce' | 'jungle' | 'swamp' | 'mushroom_red' | 'mushroom_brown' = 'oak';
    if (biome === 'snowy') type = 'spruce';
    else if (biome === 'jungle') type = 'jungle';
    else if (biome === 'swamp') type = 'swamp';
    else if (biome === 'mushroom') type = this.hash2(x, z, 9) < 0.45 ? 'mushroom_brown' : 'mushroom_red';
    const hv = Math.floor(hash * 1000);
    const height = type === 'oak' ? 4 + (hv % 3)
      : type === 'spruce' ? 6 + (hv % 3)
      : type === 'jungle' ? 9 + (hv % 5)
      : type === 'mushroom_red' ? 4 + (hv % 2)
      : type === 'mushroom_brown' ? 5 + (hv % 3)
      : 5 + (hv % 3);
    return { type, height };
  }

  /** deterministic decoration for a column: tall grass, flowers, cactus, dead bush — or null */
  decorationAt(x: number, z: number): { block: number; h: number } | null {
    const h = this.heightAt(x, z);
    if (h <= SEA_LEVEL + 1) return null; // beaches/underwater stay bare
    const biome = this.biomeAt(x, z);
    let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(z ^ 0x27d4eb2d, 0x165667b1) ^ (this.seed + 77);
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash ^= hash >>> 13;
    const r = (hash >>> 0) / 4294967296;
    if (biome === 'plains') {
      if (r < 0.010) return { block: hash & 1 ? BLOCK.FLOWER_RED : BLOCK.FLOWER_YELLOW, h: 1 };
      if (r < 0.075) return { block: BLOCK.TALL_GRASS, h: 1 };
    } else if (biome === 'forest') {
      if (r < 0.008) return { block: hash & 1 ? BLOCK.FLOWER_YELLOW : BLOCK.FLOWER_RED, h: 1 };
      if (r < 0.040) return { block: BLOCK.TALL_GRASS, h: 1 };
    } else if (biome === 'jungle') {
      if (r < 0.015) return { block: hash & 1 ? BLOCK.FLOWER_YELLOW : BLOCK.FLOWER_RED, h: 1 };
      if (r < 0.120) return { block: BLOCK.TALL_GRASS, h: 1 };
    } else if (biome === 'swamp') {
      if (r < 0.004) return { block: BLOCK.FLOWER_YELLOW, h: 1 };
      if (r < 0.050) return { block: BLOCK.TALL_GRASS, h: 1 };
      if (r < 0.058) return { block: BLOCK.DEAD_BUSH, h: 1 };
    } else if (biome === 'desert') {
      if (r < 0.006) return { block: BLOCK.CACTUS, h: 1 + (Math.abs(hash) % 3) };
      if (r < 0.012) return { block: BLOCK.DEAD_BUSH, h: 1 };
    } else if (biome === 'mushroom') {
      // small mushrooms sprout across the mycelium
      if (r < 0.020) return { block: hash & 1 ? BLOCK.MUSHROOM_RED : BLOCK.MUSHROOM_BROWN, h: 1 };
    }
    return null;
  }

  /** fill a chunk's block data */
  generateChunk(cx: number, cz: number, data: Uint8Array, metaOut?: Map<string, number>): void {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz);

        for (let y = 0; y < WORLD_HEIGHT; y++) {
          let block: number = BLOCK.AIR;

          if (y === 0 || (y < 3 && ((wx * 31 + wz * 17 + y * 7) % 3 === 0))) {
            block = BLOCK.BEDROCK;
          } else if (y < h - 3) {
            block = BLOCK.STONE;
          } else if (y < h) {
            block = biome === 'desert' ? BLOCK.SANDSTONE : BLOCK.DIRT;
          } else if (y === h) {
            if (h <= SEA_LEVEL + 1) block = biome === 'desert' ? BLOCK.SAND : BLOCK.SAND;
            else if (biome === 'desert') block = BLOCK.SAND;
            else if (biome === 'snowy') block = BLOCK.SNOW_GRASS;
            else if (biome === 'mushroom') block = BLOCK.MYCELIUM;
            else if (biome === 'mountains' && h > SEA_LEVEL + 34) block = BLOCK.SNOW_GRASS;
            else if (biome === 'mountains' && h > SEA_LEVEL + 22) block = BLOCK.STONE;
            else block = BLOCK.GRASS;
          } else if (y <= SEA_LEVEL) {
            block = BLOCK.WATER;
          }

          // caves carve stone/dirt (not bedrock, keep water above sea intact)
          if (block !== BLOCK.AIR && block !== BLOCK.BEDROCK && block !== BLOCK.WATER && y < h - 1) {
            const caveA = this.n3CaveA(wx / 60, y / 40, wz / 60);
            const caveB = this.n3CaveB(wx / 60, y / 40, wz / 60);
            const spaghetti = Math.abs(caveA) < 0.085 && Math.abs(caveB) < 0.085;
            const cheese = y < 30 && this.n3Cheese(wx / 45, y / 30, wz / 45) > 0.66;
            if (spaghetti || cheese) block = BLOCK.AIR;
          }

          // ores in stone
          if (block === BLOCK.STONE) {
            block = this.oreAt(wx, y, wz);
          }

          data[blockIndex(lx, y, lz)] = block;
        }
      }
    }

    // trees (scan margin so trees cross chunk borders)
    for (let tx = -3; tx < CHUNK_SIZE + 3; tx++) {
      for (let tz = -3; tz < CHUNK_SIZE + 3; tz++) {
        const wx = x0 + tx;
        const wz = z0 + tz;
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        const groundH = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz);
        if (biome === 'desert') continue;
        this.placeTree(data, tx, groundH, tz, tree, cx, cz);
      }
    }

    // village structures (plains): deterministic per chunk — house / well / farm
    this.placeVillageStructures(data, cx, cz, metaOut);

    // witch hut (swamp): stilted hut over a water pool, Phase 10
    this.placeWitchHut(data, cx, cz);

    // decorations: flowers / tall grass / cactus / dead bush (in-chunk only, 1 column wide)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const dec = this.decorationAt(wx, wz);
        if (!dec) continue;
        const ground = this.heightAt(wx, wz);
        const below = data[blockIndex(lx, ground, lz)];
        const supports = below === BLOCK.GRASS || below === BLOCK.SNOW_GRASS || below === BLOCK.SAND || below === BLOCK.MYCELIUM;
        if (!supports) continue;
        // place stack (cactus can be 1-3 tall), only into air
        for (let dy = 1; dy <= dec.h; dy++) {
          const y = ground + dy;
          if (y >= WORLD_HEIGHT) break;
          const idx = blockIndex(lx, y, lz);
          if (data[idx] === BLOCK.AIR) data[idx] = dec.block;
        }
      }
    }

    // water-side flora: sugarcane near water + lily pads on swamp pools
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const h = this.heightAt(wx, wz);
        const biome = this.biomeAt(wx, wz);

        // ── sugarcane: on beach-level ground with water beside, 1-3 tall ──
        if (h >= SEA_LEVEL && h <= SEA_LEVEL + 2 && h + 1 < WORLD_HEIGHT) {
          const r = this.hash2(wx, wz, 401);
          if (r < 0.035) {
            const belowId = data[blockIndex(lx, h, lz)];
            const okGround = belowId === BLOCK.SAND || belowId === BLOCK.GRASS || belowId === BLOCK.DIRT;
            if (okGround && data[blockIndex(lx, h + 1, lz)] === BLOCK.AIR) {
              // need adjacent water at same level or one below
              let water = false;
              for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
                const nx = wx + dx, nz = wz + dz;
                if (nx < x0 || nx >= x0 + CHUNK_SIZE || nz < z0 || nz >= z0 + CHUNK_SIZE) continue;
                const nh = this.heightAt(nx, nz);
                if (nh <= SEA_LEVEL) { water = true; break; } // neighbor column is water-filled
              }
              if (water) {
                const stack = 1 + Math.floor(this.hash2(wx, wz, 402) * 3); // 1..3
                for (let dy = 1; dy <= stack && h + dy < WORLD_HEIGHT; dy++) {
                  const idx = blockIndex(lx, h + dy, lz);
                  if (data[idx] === BLOCK.AIR) data[idx] = BLOCK.SUGARCANE;
                  else break;
                }
              }
            }
          }
        }

        // ── lily pads: swamp water surface ──
        if (biome === 'swamp' && h < SEA_LEVEL && SEA_LEVEL + 1 < WORLD_HEIGHT) {
          const r = this.hash2(wx, wz, 403);
          if (r < 0.10) {
            const topWater = data[blockIndex(lx, SEA_LEVEL, lz)];
            const above = data[blockIndex(lx, SEA_LEVEL + 1, lz)];
            if (topWater === BLOCK.WATER && above === BLOCK.AIR) {
              data[blockIndex(lx, SEA_LEVEL + 1, lz)] = BLOCK.LILY_PAD;
            }
          }
        }
      }
    }
  }

  private setLocal(data: Uint8Array, cx: number, cz: number, wx: number, y: number, wz: number, block: number, replaceSolid: boolean): void {
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    const idx = blockIndex(lx, y, lz);
    if (!replaceSolid && data[idx] !== BLOCK.AIR && data[idx] !== BLOCK.WATER && data[idx] !== BLOCK.LEAVES) return;
    data[idx] = block;
  }

  /** place a witch hut in this chunk (swamp only): stilted plank hut over water */
  private placeWitchHut(data: Uint8Array, cx: number, cz: number): void {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const midX = x0 + CHUNK_SIZE / 2, midZ = z0 + CHUNK_SIZE / 2;
    if (this.biomeAt(Math.floor(midX), Math.floor(midZ)) !== 'swamp') return;
    if (this.hash2(cx, cz, 600) >= 0.05) return;
    const ox = 4 + Math.floor(this.hash2(cx, cz, 601) * 5); // 4..8 → hut spans to ox+4 ≤ 12
    const oz = 4 + Math.floor(this.hash2(cx, cz, 602) * 5);
    const setIf = (lx: number, y: number, lz: number, block: number, replaceSolid: boolean): void => {
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      if (!replaceSolid) {
        const cur = data[blockIndex(lx, y, lz)];
        if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && cur !== BLOCK.LEAVES) return;
      }
      data[blockIndex(lx, y, lz)] = block;
    };
    // need a pool: center column underwater (h < SEA_LEVEL), hut floor above it
    const poolH = this.heightAt(x0 + ox + 2, z0 + oz + 2);
    if (poolH >= SEA_LEVEL) return; // not a pool
    const floorY = SEA_LEVEL + 1;
    // clear the volume (kill swamp trees inside)
    for (let lx = 0; lx < 5; lx++)
      for (let lz = 0; lz < 5; lz++)
        for (let y = floorY; y <= floorY + 4; y++)
          setIf(ox + lx, y, oz + lz, BLOCK.AIR, true);
    // stilts: spruce logs from the pool bed up to the floor at corners + center
    for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4], [2, 2]] as [number, number][]) {
      const bed = this.heightAt(x0 + ox + dx, z0 + oz + dz);
      const from = Math.min(floorY - 1, Math.max(3, bed));
      for (let y = from; y < floorY; y++) setIf(ox + dx, y, oz + dz, BLOCK.SPRUCE_LOG, true);
    }
    // plank floor 5×5
    for (let lx = 0; lx < 5; lx++)
      for (let lz = 0; lz < 5; lz++)
        setIf(ox + lx, floorY, oz + lz, BLOCK.PLANKS, true);
    // walls: perimeter 2 tall with a doorway on the -z side; log corners
    for (let y = floorY + 1; y <= floorY + 2; y++) {
      for (let i = 0; i < 5; i++) {
        const door = y <= floorY + 2 && i === 2;
        setIf(ox + i, y, oz, door ? BLOCK.AIR : BLOCK.PLANKS, true);
        setIf(ox + i, y, oz + 4, BLOCK.PLANKS, true);
        setIf(ox, y, oz + i, BLOCK.PLANKS, true);
        setIf(ox + 4, y, oz + i, BLOCK.PLANKS, true);
      }
      for (const [dx, dz] of [[0, 0], [4, 0], [0, 4], [4, 4]] as [number, number][]) {
        setIf(ox + dx, y, oz + dz, BLOCK.SPRUCE_LOG, true);
      }
    }
    // flat roof 7×7 with spruce-log rim (overhang)
    for (let lx = -1; lx <= 5; lx++)
      for (let lz = -1; lz <= 5; lz++) {
        const rim = lx === -1 || lx === 5 || lz === -1 || lz === 5;
        setIf(ox + lx, floorY + 3, oz + lz, rim ? BLOCK.SPRUCE_LOG : BLOCK.PLANKS, true);
      }
    // interior: crafting table + torch (witch's workbench)
    setIf(ox + 1, floorY + 1, oz + 3, BLOCK.CRAFTING_TABLE, true);
    setIf(ox + 3, floorY + 1, oz + 1, BLOCK.TORCH, true);
  }

  /** place a village structure in this chunk (plains only, fully in-chunk): house / well / farm */
  private placeVillageStructures(data: Uint8Array, cx: number, cz: number, metaOut?: Map<string, number>): void {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const midX = x0 + CHUNK_SIZE / 2, midZ = z0 + CHUNK_SIZE / 2;
    const midBiome = this.biomeAt(Math.floor(midX), Math.floor(midZ));
    if (midBiome !== 'plains') return;
    const v = this.hash2(cx, cz, 500);
    // spacing: skip this chunk if the previous chunk in x won the roll (avoid wall-to-wall villages)
    if (v >= 0.105) return;
    if (cx % 2 === 0 && this.hash2(cx - 1, cz, 500) < 0.105) return;

    if (v < 0.055) {
      // ── house: v0.57 six diverse building types × 4 rotations, each
      // furnished with the profession work block of the villager who
      // "owns" it (cottage / big house / library / smithy / farmstead / brewery)
      this.placeVillageHouse(data, cx, cz, x0, z0, metaOut);
      return;
    }

    if (v < 0.075) {
      // ── well: 3x3 cobble ring, water center, log posts + cobble roof ──
      const ox = 4 + Math.floor(this.hash2(cx, cz, 503) * 8);
      const oz = 4 + Math.floor(this.hash2(cx, cz, 504) * 8);
      const gy = this.heightAt(x0 + ox + 1, z0 + oz + 1);
      if (gy <= SEA_LEVEL + 1) return;
      const setIf = (lx: number, y: number, lz: number, block: number, replaceSolid: boolean): void => {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
        if (!replaceSolid) {
          const cur = data[blockIndex(lx, y, lz)];
          if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && cur !== BLOCK.LEAVES) return;
        }
        data[blockIndex(lx, y, lz)] = block;
      };
      for (let dx = 0; dx < 3; dx++)
        for (let dz = 0; dz < 3; dz++) {
          const rim = dx === 0 || dx === 2 || dz === 0 || dz === 2;
          setIf(ox + dx, gy, oz + dz, rim ? BLOCK.COBBLESTONE : BLOCK.WATER, true);
          setIf(ox + dx, gy - 1, oz + dz, BLOCK.COBBLESTONE, true);
        }
      for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]] as [number, number][]) {
        setIf(ox + dx, gy + 1, oz + dz, BLOCK.SPRUCE_LOG, true);
        setIf(ox + dx, gy + 2, oz + dz, BLOCK.SPRUCE_LOG, true);
      }
      for (let dx = 0; dx < 3; dx++)
        for (let dz = 0; dz < 3; dz++)
          setIf(ox + dx, gy + 3, oz + dz, BLOCK.COBBLESTONE, true);
      return;
    }

    // ── farm: 6x4 tilled field with water trench + sugarcane + corner torches ──
    {
      const ox = 2 + Math.floor(this.hash2(cx, cz, 505) * 8);
      const oz = 2 + Math.floor(this.hash2(cx, cz, 506) * 8);
      let hMin = 999, hMax = -999;
      for (const [dx, dz] of [[0, 0], [5, 0], [0, 3], [5, 3]] as [number, number][]) {
        const h = this.heightAt(x0 + ox + dx, z0 + oz + dz);
        if (h <= SEA_LEVEL) return;
        hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      if (hMax - hMin > 2) return;
      const gy = hMax;
      const setIf = (lx: number, y: number, lz: number, block: number, replaceSolid: boolean): void => {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
        if (!replaceSolid) {
          const cur = data[blockIndex(lx, y, lz)];
          if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && cur !== BLOCK.LEAVES) return;
        }
        data[blockIndex(lx, y, lz)] = block;
      };
      for (let dx = 0; dx < 6; dx++)
        for (let dz = 0; dz < 4; dz++) {
          const trench = dz === 1 && dx >= 1 && dx <= 4;
          setIf(ox + dx, gy, oz + dz, trench ? BLOCK.WATER : BLOCK.FARMLAND, true);
          setIf(ox + dx, gy + 1, oz + dz, BLOCK.AIR, true);
          setIf(ox + dx, gy + 2, oz + dz, BLOCK.AIR, true);
          // wheat rows on the tilled beds (mixed ripeness, deterministic)
          if (!trench && dz !== 1) {
            const h = this.hash2(x0 + ox + dx, z0 + oz + dz, 507);
            if (h < 0.72) {
              const stage = h < 0.3 ? BLOCK.WHEAT_STAGE3 : h < 0.55 ? BLOCK.WHEAT_STAGE2 : BLOCK.WHEAT_STAGE1;
              setIf(ox + dx, gy + 1, oz + dz, stage, false);
            }
          }
        }
      // corner log posts with torches
      for (const [dx, dz] of [[0, 0], [5, 0], [0, 3], [5, 3]] as [number, number][]) {
        setIf(ox + dx, gy + 1, oz + dz, BLOCK.SPRUCE_LOG, true);
        setIf(ox + dx, gy + 2, oz + dz, BLOCK.TORCH, true);
      }
    }
  }

  // ── v0.57 village houses ────────────────────────────────────────────────────
  // Six building types × 4 rotations, each themed to the villager profession
  // that "owns" it: every house gets a bed + torches + furniture, plus the
  // profession's signature work block (lectern / smithing table / composter /
  // brewing stand / cauldron / barrel). Rotation is a pure coordinate
  // transform of template-space coords, so generation stays fully
  // deterministic per chunk. Bed facing lives in the orientation-meta layer
  // (metaOut → World.meta) exactly like player-placed beds.
  private placeVillageHouse(data: Uint8Array, cx: number, cz: number, x0: number, z0: number, metaOut?: Map<string, number>): void {
    const kind = Math.floor(this.hash2(cx, cz, 508) * 6);   // building type 0..5
    const rot = Math.floor(this.hash2(cx, cz, 509) * 4);    // quarter turns
    // template footprints (tw × td) — odd rotations swap the axes
    const SIZES: [number, number][] = [[5, 5], [9, 7], [7, 9], [7, 7], [7, 6], [5, 6]];
    const [tw, td] = SIZES[kind];
    const w = rot % 2 === 0 ? tw : td;
    const d = rot % 2 === 0 ? td : tw;
    const ox = 2 + Math.floor(this.hash2(cx, cz, 501) * (CHUNK_SIZE - 3 - w));
    const oz = 2 + Math.floor(this.hash2(cx, cz, 502) * (CHUNK_SIZE - 3 - d));
    // flatness gate across the (rotated) footprint corners
    let hMin = 999, hMax = -999;
    for (const [dx, dz] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]] as [number, number][]) {
      const h = this.heightAt(x0 + ox + dx, z0 + oz + dz);
      if (h <= SEA_LEVEL + 1) return;
      hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
    }
    if (hMax - hMin > 3) return;
    const floorY = hMax;
    const wallTop = floorY + 4;

    // template-space → chunk-local rotation
    const R = (lx: number, lz: number): [number, number] => {
      if (rot === 1) return [td - 1 - lz, lx];
      if (rot === 2) return [tw - 1 - lx, td - 1 - lz];
      if (rot === 3) return [lz, tw - 1 - lx];
      return [lx, lz];
    };
    const put = (lx: number, y: number, lz: number, block: number, replaceSolid = true): void => {
      const [rx, rz] = R(lx, lz);
      const ax = ox + rx, az = oz + rz;
      if (ax < 0 || ax >= CHUNK_SIZE || az < 0 || az >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
      if (!replaceSolid) {
        const cur = data[blockIndex(ax, y, az)];
        if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && cur !== BLOCK.LEAVES) return;
      }
      data[blockIndex(ax, y, az)] = block;
    };
    const putMeta = (lx: number, lz: number, y: number, v: number): void => {
      const [rx, rz] = R(lx, lz);
      metaOut?.set((x0 + ox + rx) + ',' + y + ',' + (z0 + oz + rz), v);
    };
    // bed: feet cell + head cell + rotated facing meta (0=+X,1=-X,2=+Z,3=-Z)
    const putBed = (lx: number, lz: number, facing: number): void => {
      const rotMap = ([[0, 1, 2, 3], [2, 3, 1, 0], [1, 0, 3, 2], [3, 2, 0, 1]] as [number, number, number, number][])[rot & 3];
      const f = rotMap[facing & 3];
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dz] = dirs[f];
      put(lx, floorY + 1, lz, BLOCK.BED);
      put(lx + dx, floorY + 1, lz + dz, BLOCK.BED);
      putMeta(lx, lz, floorY + 1, f);
      putMeta(lx + dx, lz + dz, floorY + 1, f | 4);
    };

    // palette per building type
    const P = [
      { wall: BLOCK.PLANKS,        corner: BLOCK.LOG,         rim: BLOCK.SPRUCE_LOG,  deck: BLOCK.PLANKS },        // 0 cottage
      { wall: BLOCK.SPRUCE_PLANKS, corner: BLOCK.SPRUCE_LOG,  rim: BLOCK.SPRUCE_LOG,  deck: BLOCK.SPRUCE_PLANKS }, // 1 big house
      { wall: BLOCK.PLANKS,        corner: BLOCK.LOG,         rim: BLOCK.LOG,         deck: BLOCK.PLANKS },        // 2 library
      { wall: BLOCK.COBBLESTONE,   corner: BLOCK.COBBLESTONE, rim: BLOCK.COBBLESTONE, deck: BLOCK.COBBLESTONE },   // 3 smithy
      { wall: BLOCK.PLANKS,        corner: BLOCK.SPRUCE_LOG,  rim: BLOCK.SPRUCE_LOG,  deck: BLOCK.JUNGLE_PLANKS }, // 4 farmstead
      { wall: BLOCK.JUNGLE_PLANKS, corner: BLOCK.LOG,         rim: BLOCK.SPRUCE_LOG,  deck: BLOCK.JUNGLE_PLANKS }, // 5 brewery
    ][kind];
    const doorX = Math.floor(tw / 2);
    const isCornerX = (i: number): boolean => i === 0 || i === tw - 1;
    // window columns (template coords) on the ±x walls / +z wall per type
    const winXs: number[][] = [[2], [2, 3, 4], [2, 4], [3], [2], [2]];
    const winZs: number[][] = [[], [2, 4, 6], [], [3], [2, 4], []];

    // clear the volume (kill trees inside), then build
    for (let lx = 0; lx < tw; lx++)
      for (let lz = 0; lz < td; lz++)
        for (let y = floorY + 1; y <= wallTop + 1; y++)
          put(lx, y, lz, BLOCK.AIR);
    // foundation + cobble floor (keeps the villager spawn heuristic working)
    for (let lx = 0; lx < tw; lx++)
      for (let lz = 0; lz < td; lz++) {
        put(lx, floorY, lz, BLOCK.COBBLESTONE);
        const [rx, rz] = R(lx, lz);
        const ground = this.heightAt(x0 + ox + rx, z0 + oz + rz);
        for (let y = ground; y < floorY && y > ground - 12; y++) put(lx, y, lz, BLOCK.COBBLESTONE);
      }
    // walls: door hole on the -z face, windows per type, corners per palette
    for (let y = floorY + 1; y <= wallTop; y++) {
      for (let i = 0; i < tw; i++) {
        const isDoor = i === doorX && y <= floorY + 2;
        put(i, y, 0, isDoor ? BLOCK.AIR : (isCornerX(i) ? P.corner : P.wall));
        const winZ = y === floorY + 2 && winZs[kind].includes(i);
        put(i, y, td - 1, winZ ? BLOCK.GLASS : (isCornerX(i) ? P.corner : P.wall));
      }
      for (let j = 1; j < td - 1; j++) {
        const winX = y === floorY + 2 && winXs[kind].includes(j);
        const mat = winX ? BLOCK.GLASS : P.wall;
        put(0, y, j, mat);
        put(tw - 1, y, j, mat);
      }
    }
    // flat roof: rim band + deck planks
    for (let lx = 0; lx < tw; lx++)
      for (let lz = 0; lz < td; lz++) {
        const rim = isCornerX(lx) || lz === 0 || lz === td - 1;
        put(lx, wallTop + 1, lz, rim ? P.rim : P.deck);
      }

    // interior furniture (template coords; y = floorY + 1) — door faces -z
    switch (kind) {
      case 0: // cottage: bed + crafting table + torch
        putBed(3, 1, 2);           // feet (3,1) → head (3,2), facing +z
        put(1, floorY + 1, 3, BLOCK.CRAFTING_TABLE);
        put(1, floorY + 1, 1, BLOCK.TORCH);
        break;
      case 1: // big house: bed + bookshelf row + wool rug + barrel + torches
        putBed(7, 1, 2);
        put(1, floorY + 1, 5, BLOCK.BOOKSHELF);
        put(2, floorY + 1, 5, BLOCK.BOOKSHELF);
        put(3, floorY + 1, 5, BLOCK.BOOKSHELF);
        put(3, floorY + 1, 2, BLOCK.WOOL);
        put(4, floorY + 1, 2, BLOCK.WOOL);
        put(5, floorY + 1, 2, BLOCK.WOOL);
        put(7, floorY + 1, 5, BLOCK.BARREL);
        put(1, floorY + 1, 1, BLOCK.TORCH);
        put(4, floorY + 1, 4, BLOCK.TORCH);
        break;
      case 2: // library: bookshelf walls + lectern + torches
        for (let i = 1; i <= 5; i++) put(i, floorY + 1, 7, BLOCK.BOOKSHELF);
        put(1, floorY + 1, 6, BLOCK.BOOKSHELF);
        put(5, floorY + 1, 6, BLOCK.BOOKSHELF);
        put(3, floorY + 1, 4, BLOCK.LECTERN);
        put(3, floorY + 1, 2, BLOCK.WOOL);
        put(1, floorY + 1, 1, BLOCK.TORCH);
        put(5, floorY + 1, 1, BLOCK.TORCH);
        break;
      case 3: // smithy: smithing table + furnace + barrels, stone shell
        put(2, floorY + 1, 2, BLOCK.SMITHING_TABLE);
        put(4, floorY + 1, 2, BLOCK.FURNACE);
        put(1, floorY + 1, 5, BLOCK.BARREL);
        put(5, floorY + 1, 5, BLOCK.BARREL);
        put(5, floorY + 1, 1, BLOCK.TORCH);
        put(1, floorY + 1, 1, BLOCK.TORCH);
        break;
      case 4: // farmstead: composter + cauldron + bed + crafting table
        putBed(1, 1, 0);           // feet (1,1) → head (2,1), facing +x
        put(1, floorY + 1, 4, BLOCK.COMPOSTER);
        put(5, floorY + 1, 4, BLOCK.CAULDRON);
        put(3, floorY + 1, 2, BLOCK.CRAFTING_TABLE);
        put(5, floorY + 1, 1, BLOCK.TORCH);
        break;
      default: // 5 brewery: brewing stand + cauldron + barrel (cleric's hut)
        put(2, floorY + 1, 3, BLOCK.BREWING_STAND);
        put(1, floorY + 1, 1, BLOCK.CAULDRON);
        put(3, floorY + 1, 1, BLOCK.BARREL);
        put(1, floorY + 1, 4, BLOCK.TORCH);
        break;
    }
  }

  private placeTree(data: Uint8Array, lx: number, groundH: number, lz: number, tree: { type: 'oak' | 'spruce' | 'jungle' | 'swamp' | 'mushroom_red' | 'mushroom_brown'; height: number }, cx: number, cz: number): void {
    const wx = cx * CHUNK_SIZE + lx;
    const wz = cz * CHUNK_SIZE + lz;
    if (tree.type === 'mushroom_red' || tree.type === 'mushroom_brown') {
      const capId = tree.type === 'mushroom_red' ? BLOCK.MUSHROOM_RED_CAP : BLOCK.MUSHROOM_BROWN_CAP;
      const topY = groundH + tree.height;
      // stem
      for (let y = groundH + 1; y <= topY; y++)
        this.setLocal(data, cx, cz, wx, y, wz, BLOCK.MUSHROOM_STEM, true);
      if (tree.type === 'mushroom_red') {
        // red: flat 5x5 cap at top + solid dome cap layer above (MC style)
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            this.setLocal(data, cx, cz, wx + dx, topY, wz + dz, capId, false);
          }
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            this.setLocal(data, cx, cz, wx + dx, topY + 1, wz + dz, capId, false);
      } else {
        // brown: rounded cap ring around the top (MC style — cap sits ON the stem)
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            this.setLocal(data, cx, cz, wx + dx, topY - 1, wz + dz, capId, false);
          }
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            this.setLocal(data, cx, cz, wx + dx, topY, wz + dz, capId, false);
        this.setLocal(data, cx, cz, wx, topY + 1, wz, capId, false);
      }
      return;
    }
    if (tree.type === 'oak' || tree.type === 'swamp') {
      const topY = groundH + tree.height;
      for (let y = groundH + 1; y <= topY; y++)
        this.setLocal(data, cx, cz, wx, y, wz, BLOCK.LOG, true);
      // canopy (swamp: wider + flatter)
      const rBase = tree.type === 'swamp' ? 3 : 2;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? rBase : tree.type === 'swamp' ? 2 : 1;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            // swamp canopy: trim corners for rounded look
            if (tree.type === 'swamp' && Math.abs(dx) === r && Math.abs(dz) === r && r === 3) continue;
            this.setLocal(data, cx, cz, wx + dx, topY + dy, wz + dz, BLOCK.LEAVES, false);
          }
      }
    } else if (tree.type === 'jungle') {
      const topY = groundH + tree.height;
      for (let y = groundH + 1; y <= topY; y++)
        this.setLocal(data, cx, cz, wx, y, wz, BLOCK.JUNGLE_LOG, true);
      // big canopy: 2 layers of r=3, then r=2, then r=1 cap
      for (let dy = -3; dy <= 0; dy++) {
        const r = dy <= -2 ? 3 : dy === -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy < 0) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && r === 3) continue;
            this.setLocal(data, cx, cz, wx + dx, topY + dy, wz + dz, BLOCK.JUNGLE_LEAVES, false);
          }
      }
    } else {
      const topY = groundH + tree.height;
      for (let y = groundH + 1; y <= topY; y++)
        this.setLocal(data, cx, cz, wx, y, wz, BLOCK.SPRUCE_LOG, true);
      let r = 2;
      for (let y = topY + 1; y >= groundH + 3; y--) {
        const layer = topY + 1 - y;
        r = layer % 3 === 0 ? 1 : layer < 2 ? 1 : 2;
        if (y === topY + 1) r = 0;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && y <= topY) continue;
            this.setLocal(data, cx, cz, wx + dx, y, wz + dz, BLOCK.SPRUCE_LEAVES, false);
          }
      }
      this.setLocal(data, cx, cz, wx, topY + 1, wz, BLOCK.SPRUCE_LEAVES, false);
    }
  }

  private oreAt(x: number, y: number, z: number): number {
    // deterministic hash-based vein placement
    let hash = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647 ^ this.seed, 1274126177);
    hash ^= hash >>> 16;
    const r = (hash >>> 0) / 4294967296;
    const r2 = ((hash >>> 8) ^ (y * 2654435761)) >>> 0;
    if (y < 15 && r < 0.0016) return BLOCK.DIAMOND_ORE;
    if (y < 30 && r < 0.0028) return BLOCK.GOLD_ORE;
    // lapis: deeper than iron, rarer than coal (MC-ish band y<32)
    if (y < 32 && r >= 0.0028 && r < 0.0035 && (r2 & 3) === 0) return BLOCK.LAPIS_ORE;
    if (y < 56 && r < 0.0075 && (r2 & 3) === 0) return BLOCK.IRON_ORE;
    if (r < 0.011) return BLOCK.COAL_ORE;
    if (r > 0.994 && y < 40) return BLOCK.GRAVEL;
    return BLOCK.STONE;
  }

  /** find a safe spawn Y at column */
  spawnYAt(x: number, z: number): number {
    return this.heightAt(x, z) + 2;
  }
}
