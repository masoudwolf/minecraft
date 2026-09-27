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
  generateChunk(cx: number, cz: number, data: Uint8Array): void {
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
    this.placeVillageStructures(data, cx, cz);

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

  /** place a village structure in this chunk (plains only, fully in-chunk): house / well / farm */
  private placeVillageStructures(data: Uint8Array, cx: number, cz: number): void {
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
      // ── house: 7x7 footprint, plank walls, log corners, glass windows, torch ──
      const ox = 2 + Math.floor(this.hash2(cx, cz, 501) * 7); // 2..8
      const oz = 2 + Math.floor(this.hash2(cx, cz, 502) * 7);
      // flatness gate
      let hMin = 999, hMax = -999;
      for (const [dx, dz] of [[0, 0], [6, 0], [0, 6], [6, 6]] as [number, number][]) {
        const h = this.heightAt(x0 + ox + dx, z0 + oz + dz);
        if (h <= SEA_LEVEL + 1) return;
        hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      if (hMax - hMin > 3) return;
      const floorY = hMax;
      const wallTop = floorY + 4;
      const setF = (lx: number, y: number, lz: number, block: number): void => {
        const idx = blockIndex(lx, y, lz);
        data[idx] = block;
      };
      const setIf = (lx: number, y: number, lz: number, block: number, replaceSolid: boolean): void => {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
        if (!replaceSolid) {
          const cur = data[blockIndex(lx, y, lz)];
          if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && cur !== BLOCK.LEAVES) return;
        }
        data[blockIndex(lx, y, lz)] = block;
      };
      // clear the volume (kill trees inside), then build
      for (let lx = 0; lx < 7; lx++)
        for (let lz = 0; lz < 7; lz++)
          for (let y = floorY + 1; y <= wallTop + 1; y++)
            setF(ox + lx, y, oz + lz, BLOCK.AIR);
      // foundation + cobble floor
      for (let lx = 0; lx < 7; lx++)
        for (let lz = 0; lz < 7; lz++) {
          setF(ox + lx, floorY, oz + lz, BLOCK.COBBLESTONE);
          const ground = this.heightAt(x0 + ox + lx, z0 + oz + lz);
          for (let y = ground; y < floorY && y > ground - 12; y++) setIf(ox + lx, y, oz + lz, BLOCK.COBBLESTONE, true);
        }
      // walls: planks with log corners
      for (let y = floorY + 1; y <= wallTop; y++) {
        for (let i = 0; i < 7; i++) {
          const isCorner = (i === 0 || i === 6);
          // -z wall (door side), +z, -x, +x
          const doorCols = i >= 3 && i <= 3;
          if (y <= floorY + 2 && doorCols) {
            setIf(ox + i, y, oz, BLOCK.AIR, true); // doorway (2 tall)
          } else {
            setIf(ox + i, y, oz, BLOCK.PLANKS, true);
          }
          setIf(ox + i, y, oz + 6, BLOCK.PLANKS, true);
          const glassRow = y === floorY + 2;
          setIf(ox, y, oz + i, glassRow && i >= 2 && i <= 4 ? BLOCK.GLASS : BLOCK.PLANKS, true);
          setIf(ox + 6, y, oz + i, glassRow && i >= 2 && i <= 4 ? BLOCK.GLASS : BLOCK.PLANKS, true);
          // corners = logs
          if (isCorner) {
            setIf(ox, y, oz, BLOCK.LOG, true);
            setIf(ox + 6, y, oz, BLOCK.LOG, true);
            setIf(ox, y, oz + 6, BLOCK.LOG, true);
            setIf(ox + 6, y, oz + 6, BLOCK.LOG, true);
          }
        }
      }
      // flat roof: spruce log rim + planks
      for (let lx = 0; lx < 7; lx++)
        for (let lz = 0; lz < 7; lz++) {
          const rim = lx === 0 || lx === 6 || lz === 0 || lz === 6;
          setIf(ox + lx, wallTop + 1, oz + lz, rim ? BLOCK.SPRUCE_LOG : BLOCK.PLANKS, true);
        }
      // interior torch on the floor (light + cozy)
      setIf(ox + 5, floorY + 1, oz + 5, BLOCK.TORCH, true);
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
          setIf(ox + dx, gy, oz + dz, trench ? BLOCK.WATER : BLOCK.DIRT, true);
          setIf(ox + dx, gy + 1, oz + dz, BLOCK.AIR, true);
          setIf(ox + dx, gy + 2, oz + dz, BLOCK.AIR, true);
          // sugarcane rows flanking the trench
          if (dz === 0 || dz === 2) {
            if (this.hash2(x0 + ox + dx, z0 + oz + dz, 507) < 0.65)
              setIf(ox + dx, gy + 1, oz + dz, BLOCK.SUGARCANE, false);
          }
        }
      // corner log posts with torches
      for (const [dx, dz] of [[0, 0], [5, 0], [0, 3], [5, 3]] as [number, number][]) {
        setIf(ox + dx, gy + 1, oz + dz, BLOCK.SPRUCE_LOG, true);
        setIf(ox + dx, gy + 2, oz + dz, BLOCK.TORCH, true);
      }
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
