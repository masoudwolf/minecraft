// ─── Block registry ──────────────────────────────────────────────────────────
// Face order: [+X, -X, +Y(top), -Y(bottom), +Z, -Z]
export interface BlockDef {
  id: number;
  name: string;
  /** atlas tile index per face; single number means all faces */
  tiles: number[] | number;
  solid: boolean;          // blocks movement
  opaque: boolean;         // blocks light fully & culls faces
  liquid?: boolean;        // water-like
  cutout?: boolean;        // leaves/glass — rendered with alphaTest
  hardness: number;        // seconds to break by hand
  tool?: 'pickaxe' | 'axe' | 'shovel' | 'sword';
  /** minimum tool tier required to harvest (0 = bare hands ok) */
  minTier?: number;
  drop?: number | null;    // block id dropped (default: itself)
  lightEmit?: number;      // 0..15
  sound?: 'stone' | 'dirt' | 'grass' | 'wood' | 'sand' | 'glass' | 'wool';
  /** custom render model (default cube) */
  model?: 'cube' | 'cross' | 'torch';
  /** collision + render height 0..1 for partial blocks (bed) */
  height?: number;
  /** inventory icon = flat texture tile instead of isometric cube */
  flatIcon?: boolean;
  /** block entity attached on placement (furnace/chest) */
  container?: 'furnace' | 'chest';
  /** needs solid ground below to be placed (torch, flowers) */
  needsGround?: boolean;
}

import { ITEM } from './items';

export const BLOCK = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  SAND: 6,
  GRAVEL: 7,
  LOG: 8,
  LEAVES: 9,
  WATER: 10,
  GLASS: 11,
  COAL_ORE: 12,
  IRON_ORE: 13,
  GOLD_ORE: 14,
  DIAMOND_ORE: 15,
  BEDROCK: 16,
  SNOW_GRASS: 17,
  SANDSTONE: 18,
  BRICKS: 19,
  TNT: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  GLOWSTONE: 23,
  SPRUCE_LOG: 24,
  SPRUCE_LEAVES: 25,
  SNOW_BLOCK: 26,
  BOOKSHELF: 27,
  MOSSY_COBBLE: 28,
  OBSIDIAN: 29,
  TORCH: 30,
  FURNACE_LIT: 31,
  CHEST: 32,
  FLOWER_RED: 33,
  FLOWER_YELLOW: 34,
  TALL_GRASS: 35,
  CACTUS: 36,
  WOOL: 37,
  BED: 38,
} as const;

// Atlas tile indices — filled by textures/atlas.ts (same order)
export const TILE = {
  grass_top: 0, grass_side: 1, dirt: 2, stone: 3, cobblestone: 4, planks: 5,
  sand: 6, gravel: 7, log_side: 8, log_top: 9, leaves: 10, glass: 11,
  water: 12, coal_ore: 13, iron_ore: 14, gold_ore: 15, diamond_ore: 16,
  bedrock: 17, snow: 18, grass_snow_side: 19, sandstone: 20, sandstone_top: 21,
  bricks: 22, tnt_side: 23, tnt_top: 24, crafting_top: 25, crafting_side: 26,
  crafting_front: 27, furnace_front: 28, furnace_side: 29, furnace_top: 30,
  glowstone: 31, spruce_log_side: 32, spruce_log_top: 33, spruce_leaves: 34,
  bookshelf: 35, mossy_cobble: 36, obsidian: 37,
  torch: 38, furnace_front_on: 39, chest_front: 40, chest_side: 41, chest_top: 42,
  flower_red: 43, flower_yellow: 44, tall_grass: 45, cactus_side: 46, cactus_top: 47,
  wool: 48, bed_top: 49, bed_side: 50,
} as const;

function t(...faces: number[]): number[] {
  return faces;
}
function all(tile: number): number[] {
  return [tile, tile, tile, tile, tile, tile];
}
function logTiles(sideTile: number, topTile: number): number[] {
  return [sideTile, sideTile, topTile, topTile, sideTile, sideTile];
}

export const BLOCKS: Record<number, BlockDef> = {
  [BLOCK.STONE]: { id: BLOCK.STONE, name: 'Stone', tiles: TILE.stone, solid: true, opaque: true, hardness: 1.5, tool: 'pickaxe', minTier: 1, drop: BLOCK.COBBLESTONE, sound: 'stone' },
  [BLOCK.GRASS]: { id: BLOCK.GRASS, name: 'Grass Block', tiles: t(TILE.grass_side, TILE.grass_side, TILE.grass_top, TILE.dirt, TILE.grass_side, TILE.grass_side), solid: true, opaque: true, hardness: 0.6, tool: 'shovel', drop: BLOCK.DIRT, sound: 'grass' },
  [BLOCK.DIRT]: { id: BLOCK.DIRT, name: 'Dirt', tiles: TILE.dirt, solid: true, opaque: true, hardness: 0.5, tool: 'shovel', sound: 'dirt' },
  [BLOCK.COBBLESTONE]: { id: BLOCK.COBBLESTONE, name: 'Cobblestone', tiles: TILE.cobblestone, solid: true, opaque: true, hardness: 2.0, tool: 'pickaxe', minTier: 1, sound: 'stone' },
  [BLOCK.PLANKS]: { id: BLOCK.PLANKS, name: 'Oak Planks', tiles: TILE.planks, solid: true, opaque: true, hardness: 1.2, tool: 'axe', sound: 'wood' },
  [BLOCK.SAND]: { id: BLOCK.SAND, name: 'Sand', tiles: TILE.sand, solid: true, opaque: true, hardness: 0.5, tool: 'shovel', sound: 'sand' },
  [BLOCK.GRAVEL]: { id: BLOCK.GRAVEL, name: 'Gravel', tiles: TILE.gravel, solid: true, opaque: true, hardness: 0.6, tool: 'shovel', sound: 'dirt' },
  [BLOCK.LOG]: { id: BLOCK.LOG, name: 'Oak Log', tiles: logTiles(TILE.log_side, TILE.log_top), solid: true, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood' },
  [BLOCK.LEAVES]: { id: BLOCK.LEAVES, name: 'Oak Leaves', tiles: TILE.leaves, solid: true, opaque: false, cutout: true, hardness: 0.2, tool: 'sword', drop: null, sound: 'grass' },
  [BLOCK.WATER]: { id: BLOCK.WATER, name: 'Water', tiles: TILE.water, solid: false, opaque: false, liquid: true, hardness: 100, sound: 'dirt' },
  [BLOCK.GLASS]: { id: BLOCK.GLASS, name: 'Glass', tiles: TILE.glass, solid: true, opaque: false, cutout: true, hardness: 0.4, drop: null, sound: 'glass' },
  [BLOCK.COAL_ORE]: { id: BLOCK.COAL_ORE, name: 'Coal Ore', tiles: TILE.coal_ore, solid: true, opaque: true, hardness: 2.5, tool: 'pickaxe', minTier: 1, drop: ITEM.COAL, sound: 'stone' },
  [BLOCK.IRON_ORE]: { id: BLOCK.IRON_ORE, name: 'Iron Ore', tiles: TILE.iron_ore, solid: true, opaque: true, hardness: 3.0, tool: 'pickaxe', minTier: 2, drop: ITEM.IRON_INGOT, sound: 'stone' },
  [BLOCK.GOLD_ORE]: { id: BLOCK.GOLD_ORE, name: 'Gold Ore', tiles: TILE.gold_ore, solid: true, opaque: true, hardness: 3.0, tool: 'pickaxe', minTier: 3, drop: ITEM.GOLD_INGOT, sound: 'stone' },
  [BLOCK.DIAMOND_ORE]: { id: BLOCK.DIAMOND_ORE, name: 'Diamond Ore', tiles: TILE.diamond_ore, solid: true, opaque: true, hardness: 3.5, tool: 'pickaxe', minTier: 3, drop: ITEM.DIAMOND, sound: 'stone' },
  [BLOCK.BEDROCK]: { id: BLOCK.BEDROCK, name: 'Bedrock', tiles: TILE.bedrock, solid: true, opaque: true, hardness: Infinity, sound: 'stone' },
  [BLOCK.SNOW_GRASS]: { id: BLOCK.SNOW_GRASS, name: 'Snowy Grass', tiles: t(TILE.grass_snow_side, TILE.grass_snow_side, TILE.snow, TILE.dirt, TILE.grass_snow_side, TILE.grass_snow_side), solid: true, opaque: true, hardness: 0.6, tool: 'shovel', drop: BLOCK.DIRT, sound: 'grass' },
  [BLOCK.SANDSTONE]: { id: BLOCK.SANDSTONE, name: 'Sandstone', tiles: t(TILE.sandstone, TILE.sandstone, TILE.sandstone_top, TILE.sandstone_top, TILE.sandstone, TILE.sandstone), solid: true, opaque: true, hardness: 1.6, tool: 'pickaxe', sound: 'stone' },
  [BLOCK.BRICKS]: { id: BLOCK.BRICKS, name: 'Bricks', tiles: TILE.bricks, solid: true, opaque: true, hardness: 2.0, tool: 'pickaxe', sound: 'stone' },
  [BLOCK.TNT]: { id: BLOCK.TNT, name: 'TNT', tiles: t(TILE.tnt_side, TILE.tnt_side, TILE.tnt_top, TILE.tnt_top, TILE.tnt_side, TILE.tnt_side), solid: true, opaque: true, hardness: 0.4, sound: 'grass' },
  [BLOCK.CRAFTING_TABLE]: { id: BLOCK.CRAFTING_TABLE, name: 'Crafting Table', tiles: t(TILE.crafting_side, TILE.crafting_side, TILE.crafting_top, TILE.planks, TILE.crafting_front, TILE.crafting_front), solid: true, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood' },
  [BLOCK.FURNACE]: { id: BLOCK.FURNACE, name: 'Furnace', tiles: t(TILE.furnace_side, TILE.furnace_side, TILE.furnace_top, TILE.furnace_top, TILE.furnace_front, TILE.furnace_side), solid: true, opaque: true, hardness: 2.5, tool: 'pickaxe', container: 'furnace', sound: 'stone' },
  [BLOCK.GLOWSTONE]: { id: BLOCK.GLOWSTONE, name: 'Glowstone', tiles: TILE.glowstone, solid: true, opaque: true, hardness: 0.4, lightEmit: 15, sound: 'glass' },
  [BLOCK.SPRUCE_LOG]: { id: BLOCK.SPRUCE_LOG, name: 'Spruce Log', tiles: logTiles(TILE.spruce_log_side, TILE.spruce_log_top), solid: true, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood' },
  [BLOCK.SPRUCE_LEAVES]: { id: BLOCK.SPRUCE_LEAVES, name: 'Spruce Leaves', tiles: TILE.spruce_leaves, solid: true, opaque: false, cutout: true, hardness: 0.2, tool: 'sword', drop: null, sound: 'grass' },
  [BLOCK.SNOW_BLOCK]: { id: BLOCK.SNOW_BLOCK, name: 'Snow Block', tiles: TILE.snow, solid: true, opaque: true, hardness: 0.4, tool: 'shovel', sound: 'sand' },
  [BLOCK.BOOKSHELF]: { id: BLOCK.BOOKSHELF, name: 'Bookshelf', tiles: t(TILE.bookshelf, TILE.bookshelf, TILE.planks, TILE.planks, TILE.bookshelf, TILE.bookshelf), solid: true, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood' },
  [BLOCK.MOSSY_COBBLE]: { id: BLOCK.MOSSY_COBBLE, name: 'Mossy Cobblestone', tiles: TILE.mossy_cobble, solid: true, opaque: true, hardness: 2.0, tool: 'pickaxe', sound: 'stone' },
  [BLOCK.OBSIDIAN]: { id: BLOCK.OBSIDIAN, name: 'Obsidian', tiles: TILE.obsidian, solid: true, opaque: true, hardness: 12, tool: 'pickaxe', minTier: 5, sound: 'stone' },

  // ── phase 3 ──
  [BLOCK.TORCH]: { id: BLOCK.TORCH, name: 'Torch', tiles: TILE.torch, solid: false, opaque: false, cutout: true, model: 'torch', flatIcon: true, needsGround: true, hardness: 0.05, lightEmit: 14, sound: 'wood' },
  [BLOCK.FURNACE_LIT]: { id: BLOCK.FURNACE_LIT, name: 'Furnace', tiles: t(TILE.furnace_side, TILE.furnace_side, TILE.furnace_top, TILE.furnace_top, TILE.furnace_front_on, TILE.furnace_side), solid: true, opaque: true, hardness: 2.5, tool: 'pickaxe', lightEmit: 13, drop: BLOCK.FURNACE, container: 'furnace', sound: 'stone' },
  [BLOCK.CHEST]: { id: BLOCK.CHEST, name: 'Chest', tiles: t(TILE.chest_side, TILE.chest_side, TILE.chest_top, TILE.chest_top, TILE.chest_front, TILE.chest_side), solid: true, opaque: true, hardness: 1.6, tool: 'axe', container: 'chest', sound: 'wood' },
  [BLOCK.FLOWER_RED]: { id: BLOCK.FLOWER_RED, name: 'Poppy', tiles: TILE.flower_red, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },
  [BLOCK.FLOWER_YELLOW]: { id: BLOCK.FLOWER_YELLOW, name: 'Dandelion', tiles: TILE.flower_yellow, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },
  [BLOCK.TALL_GRASS]: { id: BLOCK.TALL_GRASS, name: 'Grass', tiles: TILE.tall_grass, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, drop: null, sound: 'grass' },
  [BLOCK.CACTUS]: { id: BLOCK.CACTUS, name: 'Cactus', tiles: t(TILE.cactus_side, TILE.cactus_side, TILE.cactus_top, TILE.cactus_top, TILE.cactus_side, TILE.cactus_side), solid: true, opaque: true, hardness: 0.6, sound: 'wool' },
  [BLOCK.WOOL]: { id: BLOCK.WOOL, name: 'Wool', tiles: TILE.wool, solid: true, opaque: true, hardness: 0.8, sound: 'wool' },
  [BLOCK.BED]: { id: BLOCK.BED, name: 'Bed', tiles: t(TILE.bed_side, TILE.bed_side, TILE.bed_top, TILE.planks, TILE.bed_side, TILE.bed_side), solid: true, opaque: false, height: 0.5625, flatIcon: true, needsGround: true, hardness: 0.4, sound: 'wood' },
};

export function getBlockDef(id: number): BlockDef | undefined {
  return BLOCKS[id];
}
export function isSolid(id: number): boolean {
  const d = BLOCKS[id];
  return d ? d.solid : false;
}
export function isOpaque(id: number): boolean {
  const d = BLOCKS[id];
  return d ? d.opaque : false;
}
export function isLiquid(id: number): boolean {
  const d = BLOCKS[id];
  return d ? !!d.liquid : false;
}
/** can a raycast / light pass through */
export function isTranslucent(id: number): boolean {
  const d = BLOCKS[id];
  if (!d) return true; // air
  return !d.opaque;
}
/** does this block type cull the face of a neighbor of the same type (water-water) */
export function sameCull(id: number): boolean {
  return id === BLOCK.WATER;
}
/** effective collision/render height of a block cell (1 = full cube) */
export function blockHeight(id: number): number {
  const d = BLOCKS[id];
  return d?.height ?? 1;
}
/** openable container block? (furnace incl. lit) */
export function containerOf(id: number): 'furnace' | 'chest' | undefined {
  return BLOCKS[id]?.container;
}
