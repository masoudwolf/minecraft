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
  model?: 'cube' | 'cross' | 'torch' | 'lily' | 'stand' | 'bed' | 'door';
  /** collision + render height 0..1 for partial blocks (bed) */
  height?: number;
  /** horizontal shrink 0..1 (cake bites shrink like MC; 1 = full cell) */
  width?: number;
  /** inventory icon = flat texture tile instead of isometric cube */
  flatIcon?: boolean;
  /** block entity attached on placement (furnace/chest/brewing) */
  container?: 'furnace' | 'chest' | 'brewing';
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
  // flowing water levels 1..7 (39..45); WATER(10) = source (level 0)
  WATER_FLOW1: 39,
  WATER_FLOW2: 40,
  WATER_FLOW3: 41,
  WATER_FLOW4: 42,
  WATER_FLOW5: 43,
  WATER_FLOW6: 44,
  WATER_FLOW7: 45,
  SUGARCANE: 46,
  DEAD_BUSH: 47,
  LILY_PAD: 48,
  JUNGLE_LOG: 49,
  JUNGLE_LEAVES: 50,
  WOOL_LIGHT_GRAY: 51,
  WOOL_GRAY: 52,
  WOOL_BROWN: 53,
  WOOL_BLACK: 54,
  // ── phase 8: mushroom biome ──
  MYCELIUM: 55,
  MUSHROOM_STEM: 56,
  MUSHROOM_RED_CAP: 57,
  MUSHROOM_BROWN_CAP: 58,
  MUSHROOM_RED: 59,
  MUSHROOM_BROWN: 60,
  // ── phase 9: farming ──
  FARMLAND: 61,
  WHEAT_STAGE0: 62,
  WHEAT_STAGE1: 63,
  WHEAT_STAGE2: 64,
  WHEAT_STAGE3: 65,
  OAK_SAPLING: 66,
  SPRUCE_SAPLING: 67,
  // ── phase 11: enchanting ──
  LAPIS_ORE: 68,
  ENCHANTING_TABLE: 69,
  // ── phase 13: brewing + cake ──
  BREWING_STAND: 70,
  CAKE: 71,
  CAKE_S1: 72,
  CAKE_S2: 73,
  CAKE_S3: 74,
  CAKE_S4: 75,
  CAKE_S5: 76,
  CAKE_S6: 77,
  // ── phase 14: carpentry (doors + wood variants) ──
  DOOR_OAK: 78,
  DOOR_OAK_OPEN: 79,
  DOOR_SPRUCE: 80,
  DOOR_SPRUCE_OPEN: 81,
  DOOR_JUNGLE: 82,
  DOOR_JUNGLE_OPEN: 83,
  SPRUCE_PLANKS: 84,
  JUNGLE_PLANKS: 85,
} as const;

// ── orientation meta (v0.52 Carpentry) ────────────────────────────────────────
// The world keeps ONE extra number per edited cell that needs facing/state
// (world.meta map, persisted in save v4 as blockMeta). Encoding:
//   TORCH: 0 = floor torch, 1..4 = wall-mounted (the wall is on the
//          torch cell's +X / -X / +Z / -Z side)
//   BED:   bits 0-1 = facing (direction feet→head), bit 2 (value 4) = head half
//   DOOR:  bits 0-1 = facing (the edge the CLOSED panel hugs),
//          bit 3 (value 8) = upper half (open state lives in the block id)
export const TORCH_FLOOR = 0;
export const TORCH_WALL_PX = 1;
export const TORCH_WALL_NX = 2;
export const TORCH_WALL_PZ = 3;
export const TORCH_WALL_NZ = 4;
/** facing index → unit direction (0=+X, 1=-X, 2=+Z, 3=-Z) */
const FACING_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export function facingDir(f: number): [number, number] {
  return FACING_DIRS[f & 3] ?? FACING_DIRS[0];
}
/** bed meta: is this cell the head (pillow) half? */
export function bedHead(meta: number): boolean {
  return (meta & 4) !== 0;
}
/** door meta: is this cell the upper half? */
export function doorUpper(meta: number): boolean {
  return (meta & 8) !== 0;
}
export function isDoorId(id: number): boolean {
  return id === BLOCK.DOOR_OAK || id === BLOCK.DOOR_OAK_OPEN || id === BLOCK.DOOR_SPRUCE || id === BLOCK.DOOR_SPRUCE_OPEN || id === BLOCK.DOOR_JUNGLE || id === BLOCK.DOOR_JUNGLE_OPEN;
}
export function isDoorOpenId(id: number): boolean {
  return id === BLOCK.DOOR_OAK_OPEN || id === BLOCK.DOOR_SPRUCE_OPEN || id === BLOCK.DOOR_JUNGLE_OPEN;
}
/** the placeable (closed) item id for any door block id */
export function doorClosedId(id: number): number {
  if (id === BLOCK.DOOR_OAK || id === BLOCK.DOOR_OAK_OPEN) return BLOCK.DOOR_OAK;
  if (id === BLOCK.DOOR_SPRUCE || id === BLOCK.DOOR_SPRUCE_OPEN) return BLOCK.DOOR_SPRUCE;
  return BLOCK.DOOR_JUNGLE;
}
/** open-state block id for a closed door id */
export function doorOpenIdOf(closedId: number): number {
  if (closedId === BLOCK.DOOR_OAK) return BLOCK.DOOR_OAK_OPEN;
  if (closedId === BLOCK.DOOR_SPRUCE) return BLOCK.DOOR_SPRUCE_OPEN;
  return BLOCK.DOOR_JUNGLE_OPEN;
}
/** which cell edge an OPEN door panel hugs (90° hinge rotation of the closed edge) */
export function doorOpenFacing(closedFacing: number): number {
  // 0(+X)→2(+Z), 2(+Z)→1(-X), 1(-X)→3(-Z), 3(-Z)→0(+X)
  return [2, 3, 1, 0][closedFacing & 3] ?? 2;
}

/** is this id any cake stage (0..6 bites eaten)? */
export function isCake(id: number): boolean {
  return id >= BLOCK.CAKE && id <= BLOCK.CAKE_S6;
}
/** number of slices already eaten (0 = whole cake) */
export function cakeBites(id: number): number {
  return isCake(id) ? id - BLOCK.CAKE : 0;
}
/** next bitten stage of a cake; null when the last slice was eaten */
export function nextCakeStage(id: number): number | null {
  if (!isCake(id) || id >= BLOCK.CAKE_S6) return null;
  return id + 1;
}

/** wheat crop growth stages (0 = sprout, 3 = mature golden) */
export function isWheatCrop(id: number): boolean {
  return id >= BLOCK.WHEAT_STAGE0 && id <= BLOCK.WHEAT_STAGE3;
}
/** next growth stage of a wheat crop (saturating at WHEAT_STAGE3) */
export function nextWheatStage(id: number): number {
  return Math.min(BLOCK.WHEAT_STAGE3, id + 1);
}
/** is this id a tree sapling? */
export function isSapling(id: number): boolean {
  return id === BLOCK.OAK_SAPLING || id === BLOCK.SPRUCE_SAPLING;
}

export const FLOW_MAX = 7;

/** is this id any kind of water (source or flowing)? */
export function isWaterId(id: number): boolean {
  return id === BLOCK.WATER || (id >= BLOCK.WATER_FLOW1 && id <= BLOCK.WATER_FLOW7);
}
/** 0 for source, 1..7 for flowing */
export function waterLevel(id: number): number {
  if (id === BLOCK.WATER) return 0;
  if (id >= BLOCK.WATER_FLOW1 && id <= BLOCK.WATER_FLOW7) return id - BLOCK.WATER_FLOW1 + 1;
  return -1;
}
/** block id for a flowing level 1..7 */
export function flowId(level: number): number {
  return BLOCK.WATER_FLOW1 + Math.max(1, Math.min(FLOW_MAX, level)) - 1;
}

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
  sugarcane: 51, dead_bush: 52, lily_pad: 53, jungle_log_side: 54, jungle_leaves: 55,
  wool_light_gray: 56, wool_gray: 57, wool_brown: 58, wool_black: 59,
  mycelium_top: 60, mycelium_side: 61, mushroom_stem: 62,
  mushroom_red: 63, mushroom_brown: 64, mushroom_red_small: 65, mushroom_brown_small: 66,
  farmland_top: 67, farmland_side: 68,
  wheat_0: 69, wheat_1: 70, wheat_2: 71, wheat_3: 72,
  oak_sapling: 73, spruce_sapling: 74,
  lapis_ore: 75, enchanting_top: 76, enchanting_side: 77,
  brew_rod: 78, brew_base: 79,
  cake_top: 80, cake_side: 81, cake_inner: 82, cake_bottom: 83,
  // ── phase 14: carpentry (bed halves + doors + wood planks) ──
  bed_blanket: 89, bed_pillow: 90,
  door_oak_top: 91, door_oak_bottom: 92,
  door_spruce_top: 93, door_spruce_bottom: 94,
  door_jungle_top: 95, door_jungle_bottom: 96,
  spruce_planks: 97, jungle_planks: 98,
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
  // v0.52: 2-block MC bed — feet half (head half = same id + head meta bit).
  // Top face uses the blanket tile; the pillow is real geometry pushed by the
  // mesher on head cells (raised 2/16 above the mattress, positioned by facing).
  [BLOCK.BED]: { id: BLOCK.BED, name: 'Bed', tiles: t(TILE.bed_side, TILE.bed_side, TILE.bed_blanket, TILE.planks, TILE.bed_side, TILE.bed_side), solid: true, opaque: false, height: 0.5625, model: 'bed', flatIcon: true, needsGround: true, hardness: 0.4, sound: 'wood' },

  // ── phase 14: carpentry — doors (thin 3/16 panel, 2 cells tall) + planks ──
  // Closed doors are solid; open doors are walk-through (open state = block id,
  // facing/upper-half live in the world meta map). Windows are cutout alpha.
  [BLOCK.DOOR_OAK]: { id: BLOCK.DOOR_OAK, name: 'Oak Door', tiles: t(TILE.door_oak_top, TILE.door_oak_top, TILE.door_oak_top, TILE.door_oak_bottom, TILE.door_oak_top, TILE.door_oak_top), solid: true, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', sound: 'wood' },
  [BLOCK.DOOR_OAK_OPEN]: { id: BLOCK.DOOR_OAK_OPEN, name: 'Oak Door', tiles: t(TILE.door_oak_top, TILE.door_oak_top, TILE.door_oak_top, TILE.door_oak_bottom, TILE.door_oak_top, TILE.door_oak_top), solid: false, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', drop: BLOCK.DOOR_OAK, sound: 'wood' },
  [BLOCK.DOOR_SPRUCE]: { id: BLOCK.DOOR_SPRUCE, name: 'Spruce Door', tiles: t(TILE.door_spruce_top, TILE.door_spruce_top, TILE.door_spruce_top, TILE.door_spruce_bottom, TILE.door_spruce_top, TILE.door_spruce_top), solid: true, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', sound: 'wood' },
  [BLOCK.DOOR_SPRUCE_OPEN]: { id: BLOCK.DOOR_SPRUCE_OPEN, name: 'Spruce Door', tiles: t(TILE.door_spruce_top, TILE.door_spruce_top, TILE.door_spruce_top, TILE.door_spruce_bottom, TILE.door_spruce_top, TILE.door_spruce_top), solid: false, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', drop: BLOCK.DOOR_SPRUCE, sound: 'wood' },
  [BLOCK.DOOR_JUNGLE]: { id: BLOCK.DOOR_JUNGLE, name: 'Jungle Door', tiles: t(TILE.door_jungle_top, TILE.door_jungle_top, TILE.door_jungle_top, TILE.door_jungle_bottom, TILE.door_jungle_top, TILE.door_jungle_top), solid: true, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', sound: 'wood' },
  [BLOCK.DOOR_JUNGLE_OPEN]: { id: BLOCK.DOOR_JUNGLE_OPEN, name: 'Jungle Door', tiles: t(TILE.door_jungle_top, TILE.door_jungle_top, TILE.door_jungle_top, TILE.door_jungle_bottom, TILE.door_jungle_top, TILE.door_jungle_top), solid: false, opaque: false, cutout: true, model: 'door', flatIcon: true, needsGround: true, hardness: 3, tool: 'axe', drop: BLOCK.DOOR_JUNGLE, sound: 'wood' },
  [BLOCK.SPRUCE_PLANKS]: { id: BLOCK.SPRUCE_PLANKS, name: 'Spruce Planks', tiles: TILE.spruce_planks, solid: true, opaque: true, hardness: 1.2, tool: 'axe', sound: 'wood' },
  [BLOCK.JUNGLE_PLANKS]: { id: BLOCK.JUNGLE_PLANKS, name: 'Jungle Planks', tiles: TILE.jungle_planks, solid: true, opaque: true, hardness: 1.2, tool: 'axe', sound: 'wood' },

  // ── phase 3b ──
  ...flowDefs(),
  [BLOCK.SUGARCANE]: { id: BLOCK.SUGARCANE, name: 'Sugarcane', tiles: TILE.sugarcane, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, hardness: 0.05, drop: BLOCK.SUGARCANE, sound: 'grass' },
  [BLOCK.DEAD_BUSH]: { id: BLOCK.DEAD_BUSH, name: 'Dead Bush', tiles: TILE.dead_bush, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, drop: null, sound: 'grass' },
  [BLOCK.LILY_PAD]: { id: BLOCK.LILY_PAD, name: 'Lily Pad', tiles: TILE.lily_pad, solid: false, opaque: false, cutout: true, model: 'lily', flatIcon: true, hardness: 0.05, sound: 'grass' },
  [BLOCK.JUNGLE_LOG]: { id: BLOCK.JUNGLE_LOG, name: 'Jungle Log', tiles: logTiles(TILE.jungle_log_side, TILE.log_top), solid: true, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood' },
  [BLOCK.JUNGLE_LEAVES]: { id: BLOCK.JUNGLE_LEAVES, name: 'Jungle Leaves', tiles: TILE.jungle_leaves, solid: true, opaque: false, cutout: true, hardness: 0.2, tool: 'sword', drop: null, sound: 'grass' },

  // ── phase 6: colored wool (sheep variants) ──
  [BLOCK.WOOL_LIGHT_GRAY]: { id: BLOCK.WOOL_LIGHT_GRAY, name: 'Light Gray Wool', tiles: TILE.wool_light_gray, solid: true, opaque: true, hardness: 0.8, sound: 'wool' },
  [BLOCK.WOOL_GRAY]: { id: BLOCK.WOOL_GRAY, name: 'Gray Wool', tiles: TILE.wool_gray, solid: true, opaque: true, hardness: 0.8, sound: 'wool' },
  [BLOCK.WOOL_BROWN]: { id: BLOCK.WOOL_BROWN, name: 'Brown Wool', tiles: TILE.wool_brown, solid: true, opaque: true, hardness: 0.8, sound: 'wool' },
  [BLOCK.WOOL_BLACK]: { id: BLOCK.WOOL_BLACK, name: 'Black Wool', tiles: TILE.wool_black, solid: true, opaque: true, hardness: 0.8, sound: 'wool' },

  // ── phase 8: mushroom biome ──
  [BLOCK.MYCELIUM]: { id: BLOCK.MYCELIUM, name: 'Mycelium', tiles: t(TILE.mycelium_side, TILE.mycelium_side, TILE.mycelium_top, TILE.dirt, TILE.mycelium_side, TILE.mycelium_side), solid: true, opaque: true, hardness: 0.6, tool: 'shovel', drop: BLOCK.DIRT, sound: 'grass' },
  [BLOCK.MUSHROOM_STEM]: { id: BLOCK.MUSHROOM_STEM, name: 'Mushroom Stem', tiles: t(TILE.mushroom_stem, TILE.mushroom_stem, TILE.mushroom_stem, TILE.mushroom_stem, TILE.mushroom_stem, TILE.mushroom_stem), solid: true, opaque: true, hardness: 0.4, tool: 'axe', sound: 'wood' },
  [BLOCK.MUSHROOM_RED_CAP]: { id: BLOCK.MUSHROOM_RED_CAP, name: 'Red Mushroom Block', tiles: TILE.mushroom_red, solid: true, opaque: true, hardness: 0.4, tool: 'axe', drop: BLOCK.MUSHROOM_RED, sound: 'wood' },
  [BLOCK.MUSHROOM_BROWN_CAP]: { id: BLOCK.MUSHROOM_BROWN_CAP, name: 'Brown Mushroom Block', tiles: TILE.mushroom_brown, solid: true, opaque: true, hardness: 0.4, tool: 'axe', drop: BLOCK.MUSHROOM_BROWN, sound: 'wood' },
  [BLOCK.MUSHROOM_RED]: { id: BLOCK.MUSHROOM_RED, name: 'Red Mushroom', tiles: TILE.mushroom_red_small, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },
  [BLOCK.MUSHROOM_BROWN]: { id: BLOCK.MUSHROOM_BROWN, name: 'Brown Mushroom', tiles: TILE.mushroom_brown_small, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },

  // ── phase 9: farming ──
  [BLOCK.FARMLAND]: { id: BLOCK.FARMLAND, name: 'Farmland', tiles: t(TILE.farmland_side, TILE.farmland_side, TILE.farmland_top, TILE.dirt, TILE.farmland_side, TILE.farmland_side), solid: true, opaque: true, hardness: 0.6, tool: 'shovel', drop: BLOCK.DIRT, sound: 'dirt' },
  [BLOCK.WHEAT_STAGE0]: { id: BLOCK.WHEAT_STAGE0, name: 'Wheat Crop', tiles: TILE.wheat_0, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.01, drop: ITEM.SEEDS, sound: 'grass' },
  [BLOCK.WHEAT_STAGE1]: { id: BLOCK.WHEAT_STAGE1, name: 'Wheat Crop', tiles: TILE.wheat_1, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.01, drop: ITEM.SEEDS, sound: 'grass' },
  [BLOCK.WHEAT_STAGE2]: { id: BLOCK.WHEAT_STAGE2, name: 'Wheat Crop', tiles: TILE.wheat_2, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.01, drop: ITEM.SEEDS, sound: 'grass' },
  [BLOCK.WHEAT_STAGE3]: { id: BLOCK.WHEAT_STAGE3, name: 'Wheat Crop', tiles: TILE.wheat_3, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.01, drop: null, sound: 'grass' },
  [BLOCK.OAK_SAPLING]: { id: BLOCK.OAK_SAPLING, name: 'Oak Sapling', tiles: TILE.oak_sapling, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },
  [BLOCK.SPRUCE_SAPLING]: { id: BLOCK.SPRUCE_SAPLING, name: 'Spruce Sapling', tiles: TILE.spruce_sapling, solid: false, opaque: false, cutout: true, model: 'cross', flatIcon: true, needsGround: true, hardness: 0.05, sound: 'grass' },

  // ── phase 11: enchanting ──
  [BLOCK.LAPIS_ORE]: { id: BLOCK.LAPIS_ORE, name: 'Lapis Ore', tiles: TILE.lapis_ore, solid: true, opaque: true, hardness: 3.0, tool: 'pickaxe', minTier: 2, drop: ITEM.LAPIS_LAZULI, sound: 'stone' },
  [BLOCK.ENCHANTING_TABLE]: { id: BLOCK.ENCHANTING_TABLE, name: 'Enchanting Table', tiles: t(TILE.enchanting_side, TILE.enchanting_side, TILE.enchanting_top, TILE.obsidian, TILE.enchanting_side, TILE.enchanting_side), solid: true, opaque: false, height: 0.75, flatIcon: true, needsGround: true, hardness: 5, tool: 'pickaxe', minTier: 1, lightEmit: 7, sound: 'stone' },

  // ── phase 13: brewing + cake ──
  [BLOCK.BREWING_STAND]: { id: BLOCK.BREWING_STAND, name: 'Brewing Stand', tiles: t(TILE.brew_rod, TILE.brew_rod, TILE.brew_base, TILE.brew_base, TILE.brew_rod, TILE.brew_rod), solid: true, opaque: false, cutout: true, model: 'stand', height: 0.875, container: 'brewing', flatIcon: true, needsGround: true, hardness: 0.6, tool: 'pickaxe', sound: 'stone' },
  // v0.52 cake fix: bite stages no longer paint BLACK notches into the
  // texture (that read as "part of the cake turned black"). MC-faithful
  // instead: every stage shares [inner | inner | top | bottom | side | side]
  // and the cake physically SHRINKS in width by 2/16 per slice (def.width),
  // exactly like Minecraft's cake model. 14/16 whole → 2/16 last slice.
  [BLOCK.CAKE]: { id: BLOCK.CAKE, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.875, flatIcon: true, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S1]: { id: BLOCK.CAKE_S1, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.75, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S2]: { id: BLOCK.CAKE_S2, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.625, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S3]: { id: BLOCK.CAKE_S3, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.5, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S4]: { id: BLOCK.CAKE_S4, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.375, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S5]: { id: BLOCK.CAKE_S5, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.25, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
  [BLOCK.CAKE_S6]: { id: BLOCK.CAKE_S6, name: 'Cake', tiles: t(TILE.cake_inner, TILE.cake_inner, TILE.cake_top, TILE.cake_bottom, TILE.cake_side, TILE.cake_side), solid: true, opaque: false, height: 0.4375, width: 0.125, needsGround: true, hardness: 0.5, drop: null, sound: 'wool' },
};

/** flowing water defs share appearance with source water */
function flowDefs(): Record<number, BlockDef> {
  const defs: Record<number, BlockDef> = {};
  for (let lvl = 1; lvl <= FLOW_MAX; lvl++) {
    const id = BLOCK.WATER_FLOW1 + lvl - 1;
    defs[id] = { id, name: 'Water', tiles: TILE.water, solid: false, opaque: false, liquid: true, hardness: 100, sound: 'dirt' };
  }
  return defs;
}

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
  return isWaterId(id);
}
/** can flowing water enter & replace this cell? */
export function waterReplaceable(id: number): boolean {
  if (id === BLOCK.AIR) return true;
  const d = BLOCKS[id];
  if (!d) return true;
  // wash away decorations: flowers, tall grass, dead bush, torches, sugarcane, lily pads
  if (d.needsGround && !d.solid) return true;
  if (id === BLOCK.SUGARCANE || id === BLOCK.LILY_PAD) return true;
  return false;
}
/** giant mushroom cap block for a small mushroom id (bonemeal growth) */
export function mushroomCapId(smallId: number): number {
  return smallId === BLOCK.MUSHROOM_BROWN ? BLOCK.MUSHROOM_BROWN_CAP : BLOCK.MUSHROOM_RED_CAP;
}
/** effective collision/render height of a block cell (1 = full cube) */
export function blockHeight(id: number): number {
  const d = BLOCKS[id];
  return d?.height ?? 1;
}
/** openable container block? (furnace incl. lit, brewing stand) */
export function containerOf(id: number): 'furnace' | 'chest' | 'brewing' | undefined {
  return BLOCKS[id]?.container;
}
