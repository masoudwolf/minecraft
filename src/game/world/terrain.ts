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

export type Biome = 'plains' | 'forest' | 'desert' | 'snowy' | 'mountains' | 'jungle' | 'swamp';

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
  treeAt(x: number, z: number): { type: 'oak' | 'spruce' | 'jungle' | 'swamp'; height: number } | null {
    const h = this.heightAt(x, z);
    if (h <= SEA_LEVEL) return null;
    const biome = this.biomeAt(x, z);
    const density = biome === 'forest' ? 0.028 : biome === 'plains' ? 0.004 : biome === 'snowy' ? 0.012 : biome === 'mountains' ? 0.006 : biome === 'jungle' ? 0.05 : biome === 'swamp' ? 0.012 : 0;
    if (density === 0) return null;
    const hash = this.hash2(x, z, 0);
    if (hash > density) return null;
    let type: 'oak' | 'spruce' | 'jungle' | 'swamp' = 'oak';
    if (biome === 'snowy') type = 'spruce';
    else if (biome === 'jungle') type = 'jungle';
    else if (biome === 'swamp') type = 'swamp';
    const hv = Math.floor(hash * 1000);
    const height = type === 'oak' ? 4 + (hv % 3)
      : type === 'spruce' ? 6 + (hv % 3)
      : type === 'jungle' ? 9 + (hv % 5)
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
          let block = BLOCK.AIR;

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

    // decorations: flowers / tall grass / cactus / dead bush (in-chunk only, 1 column wide)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = x0 + lx;
        const wz = z0 + lz;
        const dec = this.decorationAt(wx, wz);
        if (!dec) continue;
        const ground = this.heightAt(wx, wz);
        const below = data[blockIndex(lx, ground, lz)];
        const supports = below === BLOCK.GRASS || below === BLOCK.SNOW_GRASS || below === BLOCK.SAND;
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

  private setLocal(data: Uint8Array, cx: number, cz: number, wx: number, y: number, wz: number, block: BLOCK, replaceSolid: boolean): void {
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT) return;
    const idx = blockIndex(lx, y, lz);
    if (!replaceSolid && data[idx] !== BLOCK.AIR && data[idx] !== BLOCK.WATER && data[idx] !== BLOCK.LEAVES) return;
    data[idx] = block;
  }

  private placeTree(data: Uint8Array, lx: number, groundH: number, lz: number, tree: { type: 'oak' | 'spruce' | 'jungle' | 'swamp'; height: number }, cx: number, cz: number): void {
    const wx = cx * CHUNK_SIZE + lx;
    const wz = cz * CHUNK_SIZE + lz;
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

  private oreAt(x: number, y: number, z: number): BLOCK {
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
