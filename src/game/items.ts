// ─── Non-block item registry (id >= 256): food, materials, tools ─────────────
import type { BlockDef } from './blocks';
import type { EffectKind } from './effects';

export interface ToolDef {
  type: 'pickaxe' | 'axe' | 'shovel' | 'sword' | 'hoe';
  /** harvest tier: 1 wood, 2 stone, 3 iron, 1 gold (fast), 5 diamond */
  tier: number;
  /** mining speed multiplier */
  speed: number;
  /** durability (uses) */
  dur: number;
  /** attack damage vs mobs */
  dmg: number;
}

export interface ItemDef {
  id: number;
  name: string;
  /** hunger points restored when eaten (0 = not edible) */
  food?: number;
  /** tool stats (tools only) */
  tool?: ToolDef;
  /** armor stats (armor only) */
  armor?: ArmorDef;
  /** ranged weapon stats (bow only) */
  bow?: BowDef;
  /** fishing rod stats */
  rod?: RodDef;
  /** shears stats */
  shears?: ShearsDef;
  /** potion: applies this status effect when drunk (brewing system) */
  potion?: { effect: EffectKind; seconds: number };
  /** draw 16x16 pixel-art icon; returns canvas */
  icon: (ctx: CanvasRenderingContext2D) => void;
}

export interface BowDef {
  /** durability (shots) */
  dur: number;
}

/** fishing rod stats (MC rod durability 64) */
export interface RodDef {
  dur: number;
}

/** shears stats (MC shears durability 238) */
export interface ShearsDef {
  dur: number;
}

export const ITEM = {
  PORKCHOP: 256,
  BEEF: 257,
  CHICKEN_RAW: 258,
  MUTTON: 259,
  LEATHER: 260,
  FEATHER: 261,
  STICK: 262,
  COAL: 263,
  // tools 270..289
  WOOD_PICKAXE: 270,
  WOOD_AXE: 271,
  WOOD_SHOVEL: 272,
  WOOD_SWORD: 273,
  STONE_PICKAXE: 274,
  STONE_AXE: 275,
  STONE_SHOVEL: 276,
  STONE_SWORD: 277,
  IRON_PICKAXE: 278,
  IRON_AXE: 279,
  IRON_SHOVEL: 280,
  IRON_SWORD: 281,
  GOLD_PICKAXE: 282,
  GOLD_AXE: 283,
  GOLD_SHOVEL: 284,
  GOLD_SWORD: 285,
  DIAMOND_PICKAXE: 286,
  DIAMOND_AXE: 287,
  DIAMOND_SHOVEL: 288,
  DIAMOND_SWORD: 289,
  // materials
  IRON_INGOT: 290,
  GOLD_INGOT: 291,
  DIAMOND: 292,
  // cooked food (smelting)
  PORKCHOP_COOKED: 293,
  STEAK: 294,
  CHICKEN_COOKED: 295,
  MUTTON_COOKED: 296,
  // mob loot
  ROTTEN_FLESH: 297,
  STRING: 298,
  SPIDER_EYE: 299,
  ENDER_PEARL: 300,
  // armor 301..316 (4 tiers x 4 slots)
  LEATHER_HELMET: 301,
  LEATHER_CHESTPLATE: 302,
  LEATHER_LEGGINGS: 303,
  LEATHER_BOOTS: 304,
  IRON_HELMET: 305,
  IRON_CHESTPLATE: 306,
  IRON_LEGGINGS: 307,
  IRON_BOOTS: 308,
  GOLD_HELMET: 309,
  GOLD_CHESTPLATE: 310,
  GOLD_LEGGINGS: 311,
  GOLD_BOOTS: 312,
  DIAMOND_HELMET: 313,
  DIAMOND_CHESTPLATE: 314,
  DIAMOND_LEGGINGS: 315,
  DIAMOND_BOOTS: 316,
  // ranged combat + misc 317..320
  BOW: 317,
  ARROW: 318,
  BONE: 319,
  FLINT: 320,
  // farming (phase 8)
  BONEMEAL: 321,
  // farming (phase 9)
  SEEDS: 322,
  WHEAT: 323,
  BREAD: 324,
  WOOD_HOE: 325,
  STONE_HOE: 326,
  IRON_HOE: 327,
  GOLD_HOE: 328,
  DIAMOND_HOE: 329,
  // transport (phase 10)
  BOAT: 330,
  // snow golem drops
  SNOWBALL: 331,
  // ── phase 11: shears / fishing / enchanting materials ──
  SHEARS: 332,
  FISHING_ROD: 333,
  RAW_COD: 334,
  RAW_SALMON: 335,
  COOKED_COD: 336,
  COOKED_SALMON: 337,
  PAPER: 338,
  BOOK: 339,
  LAPIS_LAZULI: 340,
  // ── phase 12: buckets ──
  BUCKET: 341,
  WATER_BUCKET: 342,
  MILK_BUCKET: 343,
  // ── phase 13: brewing ──
  GLASS_BOTTLE: 344,
  WATER_BOTTLE: 345,
  SUGAR: 346,
  POTION_SPEED: 347,
  POTION_STRENGTH: 348,
  POTION_REGEN: 349,
  POTION_HASTE: 350,
  POTION_NIGHT_VISION: 351,
  POTION_WATER_BREATHING: 352,
  POTION_JUMP: 353,
  POTION_HEALING: 354,
  POTION_POISON: 355,
} as const;

// ─── armor ───────────────────────────────────────────────────────────────────
export type ArmorSlot = 'helmet' | 'chest' | 'legs' | 'boots';

export interface ArmorDef {
  slot: ArmorSlot;
  /** armor points (MC values: half-shield units, max 20 across the set) */
  points: number;
  /** durability (uses) */
  dur: number;
}

// ─── bow ─────────────────────────────────────────────────────────────────────────
const BOW_DUR = 385; // MC bow durability

/** slot index for player.armor[] storage */
export const ARMOR_SLOT_INDEX: Record<ArmorSlot, number> = { helmet: 0, chest: 1, legs: 2, boots: 3 };

/** armor stats per tier: [helmet, chest, legs, boots] points + durability (MC) */
const ARMOR_TIER_STATS: Record<string, { points: [number, number, number, number]; dur: number }> = {
  leather: { points: [1, 3, 2, 1], dur: 55 },
  iron: { points: [2, 6, 5, 2], dur: 165 },
  gold: { points: [2, 5, 3, 1], dur: 77 },
  diamond: { points: [3, 8, 6, 3], dur: 363 },
};

const ARMOR_IDS: Record<string, Record<ArmorSlot, number>> = {
  leather: { helmet: ITEM.LEATHER_HELMET, chest: ITEM.LEATHER_CHESTPLATE, legs: ITEM.LEATHER_LEGGINGS, boots: ITEM.LEATHER_BOOTS },
  iron: { helmet: ITEM.IRON_HELMET, chest: ITEM.IRON_CHESTPLATE, legs: ITEM.IRON_LEGGINGS, boots: ITEM.IRON_BOOTS },
  gold: { helmet: ITEM.GOLD_HELMET, chest: ITEM.GOLD_CHESTPLATE, legs: ITEM.GOLD_LEGGINGS, boots: ITEM.GOLD_BOOTS },
  diamond: { helmet: ITEM.DIAMOND_HELMET, chest: ITEM.DIAMOND_CHESTPLATE, legs: ITEM.DIAMOND_LEGGINGS, boots: ITEM.DIAMOND_BOOTS },
};

const ARMOR_LABEL: Record<string, string> = { leather: 'Leather', iron: 'Iron', gold: 'Golden', diamond: 'Diamond' };
const ARMOR_SLOT_LABEL: Record<ArmorSlot, string> = { helmet: 'Helmet', chest: 'Chestplate', legs: 'Leggings', boots: 'Boots' };

/** armor pieces overlay on the tier palette (leather uses its own browns) */
const ARMOR_TIER_COLORS: Record<string, [string, string, string]> = {
  leather: ['#a5662c', '#7c4a1e', '#c4833f'],
};

function drawHelmet(ctx: CanvasRenderingContext2D, tier: string): void {
  const [main, dark, light] = ARMOR_TIER_COLORS[tier];
  px(ctx, 3, 3, main, 10, 2);
  px(ctx, 3, 5, main, 2, 3); px(ctx, 11, 5, main, 2, 3);
  px(ctx, 4, 5, light, 8, 1);
  px(ctx, 5, 6, light, 2, 1);
  px(ctx, 3, 8, dark, 2, 1); px(ctx, 11, 8, dark, 2, 1);
  px(ctx, 4, 3, dark, 8, 1);
}

function drawChestplate(ctx: CanvasRenderingContext2D, tier: string): void {
  const [main, dark, light] = ARMOR_TIER_COLORS[tier];
  // shoulders
  px(ctx, 2, 2, main, 3, 3); px(ctx, 11, 2, main, 3, 3);
  // torso
  px(ctx, 4, 3, main, 8, 9);
  px(ctx, 5, 4, light, 6, 2);
  px(ctx, 4, 11, dark, 8, 1);
  px(ctx, 7, 5, dark, 2, 6); // center seam
  px(ctx, 3, 4, dark, 1, 1); px(ctx, 12, 4, dark, 1, 1);
}

function drawLeggings(ctx: CanvasRenderingContext2D, tier: string): void {
  const [main, dark, light] = ARMOR_TIER_COLORS[tier];
  px(ctx, 3, 2, main, 10, 3); // waistband
  px(ctx, 4, 3, light, 8, 1);
  px(ctx, 3, 5, main, 4, 9); px(ctx, 9, 5, main, 4, 9); // legs
  px(ctx, 3, 13, dark, 4, 1); px(ctx, 9, 13, dark, 4, 1);
  px(ctx, 7, 2, dark, 2, 1);
}

function drawBoots(ctx: CanvasRenderingContext2D, tier: string): void {
  const [main, dark, light] = ARMOR_TIER_COLORS[tier];
  px(ctx, 2, 6, main, 4, 6); px(ctx, 10, 6, main, 4, 6); // boot shafts
  px(ctx, 1, 11, main, 5, 3); px(ctx, 10, 11, main, 5, 3); // feet
  px(ctx, 2, 7, light, 2, 2); px(ctx, 10, 7, light, 2, 2);
  px(ctx, 1, 13, dark, 5, 1); px(ctx, 10, 13, dark, 5, 1);
}

// ─── tier stats (MC values) ───────────────────────────────────────────────────
const TIER_STATS = {
  wood: { tier: 1, speed: 2, dur: 59, swordDmg: 4 },
  stone: { tier: 2, speed: 4, dur: 131, swordDmg: 5 },
  iron: { tier: 3, speed: 6, dur: 250, swordDmg: 6 },
  gold: { tier: 1, speed: 12, dur: 32, swordDmg: 4 },
  diamond: { tier: 5, speed: 8, dur: 1561, swordDmg: 7 },
} as const;

type TierName = keyof typeof TIER_STATS;

function makeTool(type: ToolDef['type'], tierName: TierName): ToolDef {
  const t = TIER_STATS[tierName];
  const dmg =
    type === 'sword'
      ? t.swordDmg
      : type === 'axe'
        ? t.swordDmg - 1
        : type === 'hoe'
          ? Math.max(1, t.swordDmg - 3)
          : Math.max(2, t.swordDmg - 2);
  return { type, tier: t.tier, speed: t.speed, dur: t.dur, dmg };
}

// ─── pixel-art helpers ────────────────────────────────────────────────────────
function noiseRect(ctx: CanvasRenderingContext2D, colors: string[], x0: number, y0: number, w: number, h: number, seed = 1): void {
  let s = seed;
  const rnd = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w = 1, h = 1): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** palette per tier: [main, dark, light] */
const TIER_COLORS: Record<TierName, [string, string, string]> = {
  wood: ['#8a683c', '#6b4d2a', '#a5824f'],
  stone: ['#9a9a9a', '#707070', '#b8b8b8'],
  iron: ['#d8d8d8', '#9c9c9c', '#f0f0f0'],
  gold: ['#f6d33c', '#c9a227', '#fce88a'],
  diamond: ['#5ce8d5', '#2fb5a8', '#a8f6ec'],
};

const HANDLE = '#6b4d2a';
const HANDLE_DARK = '#55402a';

// metal armor tiers reuse the tool tier palette (leather already set above)
ARMOR_TIER_COLORS.iron = TIER_COLORS.iron;
ARMOR_TIER_COLORS.gold = TIER_COLORS.gold;
ARMOR_TIER_COLORS.diamond = TIER_COLORS.diamond;

/** diagonal stick handle from bottom-left to (hx,hy), 2px thick */
function drawHandle(ctx: CanvasRenderingContext2D, hx: number, hy: number, len: number): void {
  for (let i = 0; i < len; i++) {
    px(ctx, hx - i, hy + i, HANDLE, 2, 1);
    px(ctx, hx - i, hy + i + 1, HANDLE_DARK, 1, 1);
  }
}

function drawPickaxe(ctx: CanvasRenderingContext2D, tier: TierName): void {
  const [main, dark, light] = TIER_COLORS[tier];
  drawHandle(ctx, 9, 5, 9); // handle from (9,5) down-left to (1,13)
  // head: arc across the top-right
  px(ctx, 5, 2, main, 7, 2);
  px(ctx, 4, 4, main, 2, 2);
  px(ctx, 12, 4, main, 2, 2);
  px(ctx, 3, 6, main, 2, 2);
  px(ctx, 13, 6, main, 2, 1);
  px(ctx, 5, 2, light, 7, 1);
  px(ctx, 4, 4, light, 1, 1);
  px(ctx, 3, 6, light, 1, 1);
  px(ctx, 5, 3, dark, 7, 1);
  px(ctx, 12, 4, dark, 2, 1);
  px(ctx, 13, 6, dark, 2, 1);
}

function drawAxe(ctx: CanvasRenderingContext2D, tier: TierName): void {
  const [main, dark, light] = TIER_COLORS[tier];
  drawHandle(ctx, 9, 5, 9);
  // head: blade on the top-right of the handle
  px(ctx, 8, 1, main, 5, 2);
  px(ctx, 6, 3, main, 7, 2);
  px(ctx, 8, 5, main, 5, 2);
  px(ctx, 12, 3, main, 2, 2);
  px(ctx, 8, 1, light, 5, 1);
  px(ctx, 6, 3, light, 2, 1);
  px(ctx, 10, 5, dark, 3, 1);
  px(ctx, 12, 3, dark, 2, 1);
}

function drawShovel(ctx: CanvasRenderingContext2D, tier: TierName): void {
  const [main, dark, light] = TIER_COLORS[tier];
  drawHandle(ctx, 9, 5, 9);
  // head: spade tip top-right
  px(ctx, 9, 1, main, 4, 1);
  px(ctx, 8, 2, main, 6, 3);
  px(ctx, 9, 5, main, 4, 1);
  px(ctx, 9, 1, light, 3, 1);
  px(ctx, 8, 2, light, 2, 1);
  px(ctx, 11, 4, dark, 3, 1);
  px(ctx, 10, 5, dark, 3, 1);
}

function drawSword(ctx: CanvasRenderingContext2D, tier: TierName): void {
  const [main, dark, light] = TIER_COLORS[tier];
  // blade diagonal (4,11)->(13,2), 2px wide
  for (let i = 0; i < 9; i++) {
    px(ctx, 4 + i, 11 - i, main, 2, 1);
    if (i % 2 === 0) px(ctx, 4 + i, 10 - i, light, 1, 1);
  }
  px(ctx, 13, 2, main, 2, 2);
  px(ctx, 14, 2, dark, 1, 1);
  // guard (perpendicular)
  px(ctx, 3, 9, dark, 1, 2);
  px(ctx, 4, 11, dark, 2, 1);
  px(ctx, 5, 12, dark, 1, 2);
  // handle
  px(ctx, 3, 12, HANDLE, 2, 1);
  px(ctx, 2, 13, HANDLE, 2, 1);
  px(ctx, 1, 14, HANDLE_DARK, 2, 1);
}

function drawHoe(ctx: CanvasRenderingContext2D, tier: TierName): void {
  const [main, dark, light] = TIER_COLORS[tier];
  drawHandle(ctx, 9, 5, 9);
  // bent blade: horizontal top bar + downward tip on the right
  px(ctx, 9, 2, main, 6, 2);
  px(ctx, 14, 4, main, 2, 3);
  px(ctx, 13, 2, light, 3, 1);
  px(ctx, 14, 4, light, 1, 2);
  px(ctx, 9, 3, dark, 5, 1);
  px(ctx, 15, 6, dark, 1, 1);
}

// ─── tool registry builder ────────────────────────────────────────────────────
const TOOL_IDS: Record<string, number> = {
  'wood:pickaxe': ITEM.WOOD_PICKAXE, 'wood:axe': ITEM.WOOD_AXE, 'wood:shovel': ITEM.WOOD_SHOVEL, 'wood:sword': ITEM.WOOD_SWORD,
  'stone:pickaxe': ITEM.STONE_PICKAXE, 'stone:axe': ITEM.STONE_AXE, 'stone:shovel': ITEM.STONE_SHOVEL, 'stone:sword': ITEM.STONE_SWORD,
  'iron:pickaxe': ITEM.IRON_PICKAXE, 'iron:axe': ITEM.IRON_AXE, 'iron:shovel': ITEM.IRON_SHOVEL, 'iron:sword': ITEM.IRON_SWORD,
  'gold:pickaxe': ITEM.GOLD_PICKAXE, 'gold:axe': ITEM.GOLD_AXE, 'gold:shovel': ITEM.GOLD_SHOVEL, 'gold:sword': ITEM.GOLD_SWORD,
  'diamond:pickaxe': ITEM.DIAMOND_PICKAXE, 'diamond:axe': ITEM.DIAMOND_AXE, 'diamond:shovel': ITEM.DIAMOND_SHOVEL, 'diamond:sword': ITEM.DIAMOND_SWORD,
  'wood:hoe': ITEM.WOOD_HOE, 'stone:hoe': ITEM.STONE_HOE, 'iron:hoe': ITEM.IRON_HOE, 'gold:hoe': ITEM.GOLD_HOE, 'diamond:hoe': ITEM.DIAMOND_HOE,
};

const TIER_LABEL: Record<TierName, string> = { wood: 'Wooden', stone: 'Stone', iron: 'Iron', gold: 'Golden', diamond: 'Diamond' };
const TYPE_LABEL: Record<ToolDef['type'], string> = { pickaxe: 'Pickaxe', axe: 'Axe', shovel: 'Shovel', sword: 'Sword', hoe: 'Hoe' };
const TOOL_PAINTER: Record<ToolDef['type'], (ctx: CanvasRenderingContext2D, tier: TierName) => void> = {
  pickaxe: drawPickaxe, axe: drawAxe, shovel: drawShovel, sword: drawSword, hoe: drawHoe,
};

export const ITEMS: Record<number, ItemDef> = {
  [ITEM.PORKCHOP]: {
    id: ITEM.PORKCHOP, name: 'Raw Porkchop', food: 3,
    icon: (ctx) => {
      noiseRect(ctx, ['#f4a2a2', '#ee8f8f', '#f7b5b5'], 3, 5, 10, 7, 11);
      noiseRect(ctx, ['#e8c9c0', '#dcb8ae'], 5, 3, 7, 3, 7);
      ctx.fillStyle = '#c97b6f';
      ctx.fillRect(3, 11, 10, 1);
    },
  },
  [ITEM.BEEF]: {
    id: ITEM.BEEF, name: 'Raw Beef', food: 3,
    icon: (ctx) => {
      noiseRect(ctx, ['#b5342c', '#a02a24', '#c4443a'], 3, 5, 11, 8, 13);
      noiseRect(ctx, ['#e8d5c8', '#dcc8ba'], 5, 4, 7, 2, 5);
      ctx.fillStyle = '#8a1f1a';
      ctx.fillRect(3, 12, 11, 1);
    },
  },
  [ITEM.CHICKEN_RAW]: {
    id: ITEM.CHICKEN_RAW, name: 'Raw Chicken', food: 2,
    icon: (ctx) => {
      noiseRect(ctx, ['#f2c9a8', '#e8bc98', '#f7d6b8'], 4, 4, 9, 9, 17);
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(11, 10, 3, 4);
      ctx.fillStyle = '#d4ccc0';
      ctx.fillRect(12, 13, 2, 1);
    },
  },
  [ITEM.MUTTON]: {
    id: ITEM.MUTTON, name: 'Raw Mutton', food: 2,
    icon: (ctx) => {
      noiseRect(ctx, ['#d86a5a', '#c95a4c', '#e07a6a'], 3, 5, 10, 8, 19);
      noiseRect(ctx, ['#f0e0d8', '#e4d0c8'], 4, 3, 8, 3, 3);
    },
  },
  [ITEM.LEATHER]: {
    id: ITEM.LEATHER, name: 'Leather',
    icon: (ctx) => {
      noiseRect(ctx, ['#9c6b3c', '#8a5c30', '#a87848'], 3, 4, 11, 9, 23);
      ctx.fillStyle = '#6e4820';
      ctx.fillRect(3, 4, 11, 1); ctx.fillRect(3, 12, 11, 1);
      ctx.fillRect(3, 4, 1, 9); ctx.fillRect(13, 4, 1, 9);
    },
  },
  [ITEM.FEATHER]: {
    id: ITEM.FEATHER, name: 'Feather',
    icon: (ctx) => {
      noiseRect(ctx, ['#f4f4f4', '#e8e8e8', '#ffffff'], 6, 2, 4, 10, 29);
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(7, 2, 1, 10);
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(6, 12, 2, 2);
    },
  },
  [ITEM.STICK]: {
    id: ITEM.STICK, name: 'Stick',
    icon: (ctx) => {
      ctx.fillStyle = '#6b4d2a';
      for (let i = 0; i < 9; i++) ctx.fillRect(4 + i, 13 - i, 2, 2);
      ctx.fillStyle = '#8a683c';
      for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 12 - i, 1, 1);
    },
  },
  [ITEM.COAL]: {
    id: ITEM.COAL, name: 'Coal',
    icon: (ctx) => {
      noiseRect(ctx, ['#2a2a2a', '#1c1c1c', '#383838'], 4, 4, 9, 9, 31);
      ctx.fillStyle = '#4a4a4a';
      ctx.fillRect(5, 5, 2, 1); ctx.fillRect(9, 8, 2, 1);
    },
  },
  [ITEM.IRON_INGOT]: {
    id: ITEM.IRON_INGOT, name: 'Iron Ingot',
    icon: (ctx) => {
      px(ctx, 4, 6, '#8c8c8c', 9, 1);
      px(ctx, 3, 7, '#c8c8c8', 11, 4);
      px(ctx, 3, 7, '#e8e8e8', 11, 2);
      px(ctx, 3, 10, '#8c8c8c', 11, 1);
      px(ctx, 4, 11, '#7a7a7a', 9, 1);
    },
  },
  [ITEM.GOLD_INGOT]: {
    id: ITEM.GOLD_INGOT, name: 'Gold Ingot',
    icon: (ctx) => {
      px(ctx, 4, 6, '#b8860b', 9, 1);
      px(ctx, 3, 7, '#f6d33c', 11, 4);
      px(ctx, 3, 7, '#fce88a', 11, 2);
      px(ctx, 3, 10, '#c9a227', 11, 1);
      px(ctx, 4, 11, '#a87f1c', 9, 1);
    },
  },
  [ITEM.DIAMOND]: {
    id: ITEM.DIAMOND, name: 'Diamond',
    icon: (ctx) => {
      px(ctx, 7, 3, '#a8f6ec', 3, 1);
      px(ctx, 5, 4, '#5ce8d5', 7, 1);
      px(ctx, 4, 5, '#5ce8d5', 9, 1);
      px(ctx, 3, 6, '#4fd8c8', 11, 2);
      px(ctx, 4, 8, '#2fb5a8', 9, 1);
      px(ctx, 5, 9, '#2fb5a8', 7, 1);
      px(ctx, 7, 10, '#23968b', 3, 1);
      px(ctx, 5, 4, '#d8fffa', 2, 2);
    },
  },
  [ITEM.PORKCHOP_COOKED]: {
    id: ITEM.PORKCHOP_COOKED, name: 'Cooked Porkchop', food: 8,
    icon: (ctx) => {
      noiseRect(ctx, ['#b5703c', '#a5622e', '#c98250'], 3, 5, 10, 7, 41);
      noiseRect(ctx, ['#d8a878', '#cc9a68'], 5, 3, 7, 3, 43);
      ctx.fillStyle = '#8a5222';
      ctx.fillRect(3, 11, 10, 1);
    },
  },
  [ITEM.STEAK]: {
    id: ITEM.STEAK, name: 'Steak', food: 8,
    icon: (ctx) => {
      noiseRect(ctx, ['#6b3a22', '#5c2f1a', '#7d482c'], 3, 5, 11, 8, 45);
      noiseRect(ctx, ['#a5764c', '#986a40'], 5, 4, 7, 2, 47);
      ctx.fillStyle = '#4a2412';
      ctx.fillRect(3, 12, 11, 1);
    },
  },
  [ITEM.CHICKEN_COOKED]: {
    id: ITEM.CHICKEN_COOKED, name: 'Cooked Chicken', food: 6,
    icon: (ctx) => {
      noiseRect(ctx, ['#c98a4a', '#bb7c3c', '#d99c5c'], 4, 4, 9, 9, 49);
      ctx.fillStyle = '#e8dcc8';
      ctx.fillRect(11, 10, 3, 4);
      ctx.fillStyle = '#c8bca8';
      ctx.fillRect(12, 13, 2, 1);
    },
  },
  [ITEM.MUTTON_COOKED]: {
    id: ITEM.MUTTON_COOKED, name: 'Cooked Mutton', food: 6,
    icon: (ctx) => {
      noiseRect(ctx, ['#9c5a34', '#8a4c28', '#ae6a40'], 3, 5, 10, 8, 51);
      noiseRect(ctx, ['#d8b088', '#cca078'], 4, 3, 8, 3, 53);
    },
  },
  [ITEM.ROTTEN_FLESH]: {
    id: ITEM.ROTTEN_FLESH, name: 'Rotten Flesh', food: 2,
    icon: (ctx) => {
      noiseRect(ctx, ['#8a5c3c', '#7a4c30', '#9c6a48'], 2, 4, 12, 9, 57);
      // rot patches
      ctx.fillStyle = '#5c7a34';
      ctx.fillRect(4, 6, 2, 2); ctx.fillRect(9, 8, 3, 2); ctx.fillRect(6, 10, 2, 1);
      ctx.fillStyle = '#6e4820';
      ctx.fillRect(2, 12, 12, 1); ctx.fillRect(2, 4, 12, 1);
    },
  },
  [ITEM.STRING]: {
    id: ITEM.STRING, name: 'String',
    icon: (ctx) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(4, 2, 1, 1); ctx.fillRect(5, 3, 1, 1); ctx.fillRect(6, 4, 1, 1);
      ctx.fillRect(7, 5, 1, 1); ctx.fillRect(8, 6, 1, 1); ctx.fillRect(9, 7, 1, 1);
      ctx.fillRect(10, 8, 1, 1); ctx.fillRect(9, 9, 1, 1); ctx.fillRect(8, 10, 1, 1);
      ctx.fillRect(7, 11, 1, 1); ctx.fillRect(6, 12, 1, 1); ctx.fillRect(5, 13, 1, 1);
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(5, 2, 1, 1); ctx.fillRect(6, 3, 1, 1); ctx.fillRect(7, 4, 1, 1);
      ctx.fillRect(8, 5, 1, 1); ctx.fillRect(9, 6, 1, 1); ctx.fillRect(10, 7, 1, 1);
    },
  },
  [ITEM.SNOWBALL]: {
    id: ITEM.SNOWBALL, name: 'Snowball',
    icon: (ctx) => {
      // round white snowball with light shading (MC style)
      ctx.fillStyle = '#f0f4f4';
      ctx.beginPath();
      ctx.arc(8, 8, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dfe8e8';
      ctx.fillRect(5, 9, 2, 2); ctx.fillRect(9, 5, 2, 2); ctx.fillRect(7, 10, 2, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 5, 2, 2); ctx.fillRect(8, 7, 1, 1);
    },
  },
  [ITEM.SPIDER_EYE]: {
    id: ITEM.SPIDER_EYE, name: 'Spider Eye',
    icon: (ctx) => {
      // red eye with slit pupil
      noiseRect(ctx, ['#a82a2a', '#962222', '#ba3a3a'], 4, 4, 8, 8, 61);
      ctx.fillStyle = '#d46a6a';
      ctx.fillRect(5, 5, 2, 2);
      ctx.fillStyle = '#1a0808';
      ctx.fillRect(7, 5, 2, 6);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(7, 4, 1, 1); ctx.fillRect(8, 11, 1, 1);
    },
  },
  [ITEM.FLINT]: {
    id: ITEM.FLINT, name: 'Flint',
    icon: (ctx) => {
      // dark angular shard
      px(ctx, 5, 3, '#3a3a3a', 5, 2);
      px(ctx, 4, 5, '#2e2e2e', 8, 3);
      px(ctx, 5, 8, '#262626', 6, 3);
      px(ctx, 6, 11, '#1e1e1e', 4, 2);
      px(ctx, 5, 4, '#4e4e4e', 2, 1);
      px(ctx, 6, 6, '#484848', 2, 2);
      px(ctx, 8, 10, '#3e3e3e', 2, 1);
      px(ctx, 4, 7, '#161616', 1, 2);
    },
  },
  [ITEM.BONE]: {
    id: ITEM.BONE, name: 'Bone',
    icon: (ctx) => {
      // diagonal bone with knob ends
      for (let i = 0; i < 7; i++) px(ctx, 5 + i, 11 - i, '#ececd8', 2, 2);
      // top-right knob (2x2 blobs)
      px(ctx, 11, 2, '#f6f6ea', 3, 2); px(ctx, 13, 4, '#f6f6ea', 2, 3);
      px(ctx, 11, 4, '#d8d8c0', 1, 1);
      // bottom-left knob
      px(ctx, 1, 11, '#f6f6ea', 2, 3); px(ctx, 3, 13, '#f6f6ea', 3, 2);
      px(ctx, 3, 11, '#d8d8c0', 1, 1);
      // shaft shading
      px(ctx, 6, 11, '#c8c8b0', 1, 1); px(ctx, 9, 8, '#c8c8b0', 1, 1);
    },
  },
  [ITEM.ARROW]: {
    id: ITEM.ARROW, name: 'Arrow',
    icon: (ctx) => {
      // diagonal shaft
      for (let i = 0; i < 8; i++) px(ctx, 4 + i, 11 - i, '#8a683c', 1, 2);
      // flint tip (top-right)
      px(ctx, 12, 2, '#3a3a3a', 2, 2);
      px(ctx, 11, 3, '#4e4e4e', 2, 1);
      px(ctx, 12, 4, '#2e2e2e', 1, 1);
      // feather fletching (bottom-left)
      px(ctx, 2, 12, '#e8e8e8', 2, 1); px(ctx, 3, 13, '#e8e8e8', 2, 1);
      px(ctx, 4, 12, '#c8c8c8', 1, 1); px(ctx, 2, 14, '#c8c8c8', 1, 1);
      px(ctx, 3, 11, '#f6f6f6', 1, 1);
    },
  },
  [ITEM.ENDER_PEARL]: {
    id: ITEM.ENDER_PEARL, name: 'Ender Pearl',
    icon: (ctx) => {
      noiseRect(ctx, ['#1a6a58', '#125446', '#227a66'], 4, 4, 8, 8, 67);
      // dark rim + teal shine
      ctx.fillStyle = '#0a3630';
      ctx.fillRect(5, 4, 6, 1); ctx.fillRect(4, 5, 1, 6); ctx.fillRect(11, 5, 1, 6); ctx.fillRect(5, 11, 6, 1);
      ctx.fillStyle = '#5ac8a8';
      ctx.fillRect(6, 6, 2, 1); ctx.fillRect(5, 7, 1, 2);
      ctx.fillStyle = '#0e4038';
      ctx.fillRect(8, 8, 2, 2);
    },
  },
  [ITEM.BONEMEAL]: {
    id: ITEM.BONEMEAL, name: 'Bone Meal',
    icon: (ctx) => {
      // white powder pile
      ctx.fillStyle = '#ececdc';
      ctx.fillRect(4, 9, 8, 4);
      ctx.fillRect(5, 7, 6, 2);
      ctx.fillRect(6, 6, 4, 1);
      ctx.fillStyle = '#d8d8c4';
      px(ctx, 5, 10, '#d8d8c4'); px(ctx, 9, 11, '#d8d8c4'); px(ctx, 7, 8, '#d8d8c4');
      ctx.fillStyle = '#c0c0a8';
      px(ctx, 6, 12, '#c0c0a8'); px(ctx, 10, 12, '#c0c0a8');
      // sparkle
      px(ctx, 8, 4, '#ffffff'); px(ctx, 5, 5, '#f6f6ea');
    },
  },
  [ITEM.SEEDS]: {
    id: ITEM.SEEDS, name: 'Wheat Seeds',
    icon: (ctx) => {
      // scattered green seeds
      const seed = (x: number, y: number, c: string): void => {
        px(ctx, x, y, c); px(ctx, x + 1, y, c); px(ctx, x, y + 1, c);
      };
      seed(3, 5, '#5da03f'); seed(8, 4, '#6db34c'); seed(12, 6, '#4c8a32');
      seed(5, 9, '#6db34c'); seed(10, 10, '#5da03f'); seed(4, 12, '#4c8a32');
      seed(11, 13, '#5da03f');
      px(ctx, 9, 6, '#7cc25a'); px(ctx, 6, 11, '#7cc25a'); px(ctx, 13, 11, '#6db34c');
    },
  },
  [ITEM.WHEAT]: {
    id: ITEM.WHEAT, name: 'Wheat',
    icon: (ctx) => {
      // three golden stalks tied together
      for (const [x, top] of [[5, 2], [8, 1], [11, 2]] as [number, number][]) {
        ctx.fillStyle = '#c9b455';
        ctx.fillRect(x, top + 4, 1, 13 - top);
        ctx.fillStyle = '#dcc25e';
        ctx.fillRect(x - 1, top, 3, 4);
        px(ctx, x, top - 1 > 0 ? top - 1 : 0, '#e8d478');
        ctx.fillStyle = '#b89b3e';
        ctx.fillRect(x - 1, top + 3, 3, 1);
      }
      ctx.fillStyle = '#9aa848';
      px(ctx, 4, 9, '#9aa848'); px(ctx, 12, 9, '#9aa848'); px(ctx, 6, 12, '#9aa848'); px(ctx, 10, 12, '#9aa848');
    },
  },
  [ITEM.BREAD]: {
    id: ITEM.BREAD, name: 'Bread', food: 5,
    icon: (ctx) => {
      // golden-brown loaf
      noiseRect(ctx, ['#b8863c', '#a8762e', '#c89650'], 2, 5, 12, 7, 71);
      // top crust dome
      noiseRect(ctx, ['#d8a860', '#cc9a52'], 3, 3, 10, 3, 73);
      // slashes
      ctx.fillStyle = '#8a5c22';
      px(ctx, 5, 4, '#8a5c22'); px(ctx, 6, 3, '#8a5c22');
      px(ctx, 9, 3, '#8a5c22'); px(ctx, 10, 4, '#8a5c22');
      // bottom rim
      ctx.fillStyle = '#8a5c22';
      ctx.fillRect(2, 11, 12, 1);
    },
  },
  [ITEM.BOAT]: {
    id: ITEM.BOAT, name: 'Boat',
    icon: (ctx) => {
      // side-view oak boat: curved hull
      // hull body
      noiseRect(ctx, ['#8a683c', '#7c5a32', '#94703f'], 2, 8, 12, 4, 81);
      // hull taper (bow right, stern left)
      ctx.fillStyle = '#8a683c';
      ctx.fillRect(1, 9, 1, 3); ctx.fillRect(14, 9, 1, 3);
      ctx.fillRect(2, 12, 12, 1);
      // rim (lighter)
      ctx.fillStyle = '#a5824f';
      ctx.fillRect(2, 7, 12, 1);
      px(ctx, 1, 8, '#a5824f'); px(ctx, 14, 8, '#a5824f');
      // bench
      ctx.fillStyle = '#6b4d2a';
      ctx.fillRect(6, 7, 4, 1);
      // plank seams
      ctx.fillStyle = '#6b4d2a';
      ctx.fillRect(2, 9, 12, 1);
      // paddle hint
      px(ctx, 11, 4, '#7c5a32', 1, 3); px(ctx, 10, 3, '#9c7848', 2, 2);
    },
  },
  [ITEM.SHEARS]: {
    id: ITEM.SHEARS, name: 'Shears',
    shears: { dur: 238 },
    icon: (ctx) => {
      // two crossing blades with bow handles (MC style)
      // blade 1 (top-left to bottom-right)
      for (let i = 0; i < 7; i++) px(ctx, 3 + i, 4 + i, '#d8d8d8', 2, 1);
      px(ctx, 3, 4, '#f0f0f0', 1, 1);
      // blade 2 (bottom-left to top-right)
      for (let i = 0; i < 7; i++) px(ctx, 3 + i, 11 - i, '#b8b8b8', 2, 1);
      px(ctx, 9, 5, '#f0f0f0', 1, 1);
      // pivot screw
      px(ctx, 7, 7, '#6e6e6e', 2, 2);
      px(ctx, 7, 7, '#9a9a9a', 1, 1);
      // handles (dark loops bottom)
      px(ctx, 2, 12, '#8a4a2a', 2, 2);
      px(ctx, 4, 13, '#6e3a20', 2, 1);
      px(ctx, 11, 12, '#8a4a2a', 2, 2);
      px(ctx, 10, 13, '#6e3a20', 2, 1);
    },
  },
  [ITEM.FISHING_ROD]: {
    id: ITEM.FISHING_ROD, name: 'Fishing Rod',
    rod: { dur: 64 },
    icon: (ctx) => {
      // diagonal rod (bottom-left to top-right)
      for (let i = 0; i < 10; i++) px(ctx, 3 + i, 12 - i, '#8a683c', 2, 1);
      for (let i = 0; i < 9; i++) px(ctx, 3 + i, 12 - i, '#9c7848', 1, 1);
      // rod tip highlight
      px(ctx, 12, 2, '#b8955c', 2, 1);
      // fishing line hanging from the tip
      px(ctx, 14, 3, '#e8e8e8', 1, 1);
      px(ctx, 14, 4, '#e8e8e8', 1, 2);
      px(ctx, 13, 6, '#e8e8e8', 1, 2);
      px(ctx, 13, 8, '#d8d8d8', 1, 2);
      // red-white bobber at the end
      px(ctx, 12, 10, '#d8382e', 2, 2);
      px(ctx, 12, 12, '#f4f4f4', 2, 1);
    },
  },
  [ITEM.RAW_COD]: {
    id: ITEM.RAW_COD, name: 'Raw Cod', food: 2,
    icon: (ctx) => {
      // gray-blue fish facing left with tail right
      noiseRect(ctx, ['#a8b5a0', '#98a592', '#b8c2ae'], 2, 5, 9, 6, 91);
      // tail
      ctx.fillStyle = '#8a9a84';
      ctx.fillRect(11, 5, 2, 1); ctx.fillRect(12, 6, 2, 4); ctx.fillRect(11, 10, 2, 1);
      // belly
      ctx.fillStyle = '#c8d0c2';
      ctx.fillRect(3, 10, 7, 1);
      // eye + gill
      px(ctx, 4, 6, '#2a2a2a', 1, 1);
      px(ctx, 3, 6, '#f4f4f4', 1, 1);
      ctx.fillStyle = '#788870';
      ctx.fillRect(7, 6, 1, 4);
      // fin
      px(ctx, 6, 4, '#8a9a84', 3, 1);
    },
  },
  [ITEM.RAW_SALMON]: {
    id: ITEM.RAW_SALMON, name: 'Raw Salmon', food: 2,
    icon: (ctx) => {
      // reddish fish facing left
      noiseRect(ctx, ['#c46a5a', '#b85a4c', '#d07a68'], 2, 5, 9, 6, 95);
      ctx.fillStyle = '#a04c40';
      ctx.fillRect(11, 5, 2, 1); ctx.fillRect(12, 6, 2, 4); ctx.fillRect(11, 10, 2, 1);
      ctx.fillStyle = '#e8a890';
      ctx.fillRect(3, 10, 7, 1);
      px(ctx, 4, 6, '#2a2a2a', 1, 1);
      px(ctx, 3, 6, '#f4f4f4', 1, 1);
      ctx.fillStyle = '#9c4838';
      ctx.fillRect(7, 6, 1, 4);
      px(ctx, 6, 4, '#a04c40', 3, 1);
    },
  },
  [ITEM.COOKED_COD]: {
    id: ITEM.COOKED_COD, name: 'Cooked Cod', food: 5,
    icon: (ctx) => {
      // toasted beige fish
      noiseRect(ctx, ['#c8a878', '#bc9a6a', '#d4b488'], 2, 5, 9, 6, 99);
      ctx.fillStyle = '#a8885a';
      ctx.fillRect(11, 5, 2, 1); ctx.fillRect(12, 6, 2, 4); ctx.fillRect(11, 10, 2, 1);
      ctx.fillStyle = '#e8d0a8';
      ctx.fillRect(3, 10, 7, 1);
      px(ctx, 4, 6, '#3a2a1a', 1, 1);
      ctx.fillStyle = '#9a7a4e';
      ctx.fillRect(7, 6, 1, 4);
      px(ctx, 6, 4, '#a8885a', 3, 1);
    },
  },
  [ITEM.COOKED_SALMON]: {
    id: ITEM.COOKED_SALMON, name: 'Cooked Salmon', food: 6,
    icon: (ctx) => {
      // roasted orange-pink fish
      noiseRect(ctx, ['#c8823c', '#bc7632', '#d49250'], 2, 5, 9, 6, 103);
      ctx.fillStyle = '#a8682c';
      ctx.fillRect(11, 5, 2, 1); ctx.fillRect(12, 6, 2, 4); ctx.fillRect(11, 10, 2, 1);
      ctx.fillStyle = '#e8b878';
      ctx.fillRect(3, 10, 7, 1);
      px(ctx, 4, 6, '#3a2a1a', 1, 1);
      ctx.fillStyle = '#9c5e26';
      ctx.fillRect(7, 6, 1, 4);
      px(ctx, 6, 4, '#a8682c', 3, 1);
    },
  },
  [ITEM.PAPER]: {
    id: ITEM.PAPER, name: 'Paper',
    icon: (ctx) => {
      // slightly crumpled white sheet
      px(ctx, 4, 3, '#f4f4f4', 8, 10);
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(4, 3, 8, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(5, 4, 6, 8);
      // fold shading
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(10, 5, 1, 6);
      ctx.fillRect(5, 11, 7, 1);
      ctx.fillStyle = '#b8b8b8';
      ctx.fillRect(3, 13, 9, 1);
    },
  },
  [ITEM.BOOK]: {
    id: ITEM.BOOK, name: 'Book',
    icon: (ctx) => {
      // red-brown cover with white pages
      px(ctx, 3, 3, '#8a4a2a', 10, 10);
      ctx.fillStyle = '#6e3a20';
      ctx.fillRect(3, 3, 10, 1);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(4, 11, 8, 1);
      // cover rim + clasp
      ctx.fillStyle = '#8a4a2a';
      ctx.fillRect(4, 4, 2, 8);
      px(ctx, 11, 7, '#d8c860', 2, 2);
      // title band
      ctx.fillStyle = '#c8b8a8';
      ctx.fillRect(7, 6, 4, 1);
    },
  },
  [ITEM.LAPIS_LAZULI]: {
    id: ITEM.LAPIS_LAZULI, name: 'Lapis Lazuli',
    icon: (ctx) => {
      // deep azure gem chunks (vanilla lapis is unmistakably blue)
      noiseRect(ctx, ['#2a52c8', '#1e42b0', '#3a64d8'], 4, 5, 8, 6, 111);
      // facets
      ctx.fillStyle = '#6a92ec';
      ctx.fillRect(5, 6, 2, 1); ctx.fillRect(9, 8, 2, 1);
      ctx.fillStyle = '#122a78';
      ctx.fillRect(7, 9, 2, 1); ctx.fillRect(4, 9, 1, 1);
      // top shard
      px(ctx, 6, 3, '#3a64d8', 3, 2);
      px(ctx, 6, 3, '#6a92ec', 1, 1);
    },
  },
  [ITEM.BUCKET]: {
    id: ITEM.BUCKET, name: 'Bucket',
    icon: (ctx) => {
      // gray metal pail (MC style)
      px(ctx, 4, 6, '#8c8c8c', 1, 2);
      px(ctx, 11, 6, '#8c8c8c', 1, 2);
      px(ctx, 3, 8, '#a8a8a8', 10, 5);
      px(ctx, 4, 13, '#7a7a7a', 8, 1);
      px(ctx, 3, 8, '#c8c8c8', 10, 1);
      px(ctx, 4, 9, '#8c8c8c', 1, 4);
      px(ctx, 11, 9, '#8c8c8c', 1, 4);
      // handle arc
      px(ctx, 5, 4, '#9c9c9c', 1, 2);
      px(ctx, 6, 3, '#9c9c9c', 4, 1);
      px(ctx, 10, 4, '#9c9c9c', 1, 2);
    },
  },
  [ITEM.WATER_BUCKET]: {
    id: ITEM.WATER_BUCKET, name: 'Water Bucket',
    icon: (ctx) => {
      // pail with water surface
      px(ctx, 4, 6, '#8c8c8c', 1, 2);
      px(ctx, 11, 6, '#8c8c8c', 1, 2);
      px(ctx, 3, 8, '#a8a8a8', 10, 5);
      px(ctx, 4, 13, '#7a7a7a', 8, 1);
      // water filling
      px(ctx, 4, 9, '#3059c4', 8, 3);
      px(ctx, 4, 9, '#3a68d8', 8, 1);
      px(ctx, 6, 10, '#4577e0', 3, 1);
      // handle arc
      px(ctx, 5, 4, '#9c9c9c', 1, 2);
      px(ctx, 6, 3, '#9c9c9c', 4, 1);
      px(ctx, 10, 4, '#9c9c9c', 1, 2);
    },
  },
  [ITEM.MILK_BUCKET]: {
    id: ITEM.MILK_BUCKET, name: 'Milk Bucket',
    icon: (ctx) => {
      // pail with milk surface
      px(ctx, 4, 6, '#8c8c8c', 1, 2);
      px(ctx, 11, 6, '#8c8c8c', 1, 2);
      px(ctx, 3, 8, '#a8a8a8', 10, 5);
      px(ctx, 4, 13, '#7a7a7a', 8, 1);
      // milk filling
      px(ctx, 4, 9, '#f4f4f4', 8, 3);
      px(ctx, 5, 10, '#ffffff', 4, 1);
      px(ctx, 10, 11, '#e0e0e0', 1, 1);
      // handle arc
      px(ctx, 5, 4, '#9c9c9c', 1, 2);
      px(ctx, 6, 3, '#9c9c9c', 4, 1);
      px(ctx, 10, 4, '#9c9c9c', 1, 2);
    },
  },
  // ── phase 13: brewing ──
  [ITEM.GLASS_BOTTLE]: {
    id: ITEM.GLASS_BOTTLE, name: 'Glass Bottle',
    icon: (ctx) => {
      // narrow neck flask, empty
      ctx.fillStyle = '#c8dce8';
      ctx.fillRect(7, 1, 2, 3);      // neck
      ctx.fillRect(6, 4, 4, 2);      // shoulder
      ctx.fillRect(4, 6, 8, 8);      // body
      ctx.fillStyle = '#e8f4f8';
      ctx.fillRect(7, 1, 1, 3);
      ctx.fillRect(5, 6, 2, 7);
      ctx.fillStyle = '#98b4c4';
      ctx.fillRect(4, 13, 8, 1);
      ctx.fillRect(11, 8, 1, 5);
      ctx.fillStyle = '#8a683c';     // cork
      ctx.fillRect(6, 0, 4, 1);
    },
  },
  [ITEM.WATER_BOTTLE]: {
    id: ITEM.WATER_BOTTLE, name: 'Water Bottle',
    icon: (ctx) => {
      ctx.fillStyle = '#c8dce8';
      ctx.fillRect(7, 1, 2, 3);
      ctx.fillRect(6, 4, 4, 2);
      ctx.fillStyle = '#3868d8';
      ctx.fillRect(4, 7, 8, 7);      // water fill
      ctx.fillStyle = '#5890e8';
      ctx.fillRect(4, 7, 8, 2);
      ctx.fillStyle = '#88b8f0';
      ctx.fillRect(5, 8, 2, 1);
      ctx.fillStyle = '#98b4c4';
      ctx.fillRect(11, 6, 1, 8);
      ctx.fillRect(4, 13, 8, 1);
      ctx.fillStyle = '#8a683c';
      ctx.fillRect(6, 0, 4, 1);
    },
  },
  [ITEM.SUGAR]: {
    id: ITEM.SUGAR, name: 'Sugar',
    icon: (ctx) => {
      // white sugar pile
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(4, 9, 8, 4);
      ctx.fillRect(5, 7, 6, 2);
      ctx.fillRect(7, 5, 2, 2);
      ctx.fillStyle = '#dcdcdc';
      ctx.fillRect(4, 12, 8, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 8, 1, 1);
      ctx.fillRect(9, 9, 1, 1);
      ctx.fillRect(5, 10, 1, 1);
    },
  },
};

// ── potions (phase 13): flask with colored liquid ──
// Shared painter so every potion icon keeps the same flask silhouette (MC style).
function drawPotion(ctx: CanvasRenderingContext2D, liquid: string, light: string, dark: string): void {
  ctx.fillStyle = '#c8dce8';
  ctx.fillRect(7, 1, 2, 3);
  ctx.fillRect(6, 4, 4, 2);
  ctx.fillStyle = liquid;
  ctx.fillRect(4, 7, 8, 7);       // liquid body
  ctx.fillRect(6, 5, 4, 2);       // liquid shoulder
  ctx.fillStyle = light;
  ctx.fillRect(5, 6, 2, 2);
  ctx.fillRect(4, 7, 2, 2);
  ctx.fillStyle = dark;
  ctx.fillRect(11, 6, 1, 8);
  ctx.fillRect(4, 13, 8, 1);
  ctx.fillRect(4, 11, 1, 2);
  ctx.fillStyle = '#8a683c';      // cork
  ctx.fillRect(6, 0, 4, 1);
  // sparkle
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8, 9, 1, 1);
  ctx.fillRect(10, 11, 1, 1);
}

ITEMS[ITEM.POTION_SPEED] = {
  id: ITEM.POTION_SPEED, name: 'Potion of Speed',
  potion: { effect: 'speed', seconds: 90 },
  icon: (ctx) => drawPotion(ctx, '#58b8d8', '#a8e8f8', '#2c7898'),
};
ITEMS[ITEM.POTION_STRENGTH] = {
  id: ITEM.POTION_STRENGTH, name: 'Potion of Strength',
  potion: { effect: 'strength', seconds: 90 },
  icon: (ctx) => drawPotion(ctx, '#c05838', '#e8a878', '#782818'),
};
ITEMS[ITEM.POTION_REGEN] = {
  id: ITEM.POTION_REGEN, name: 'Potion of Regeneration',
  potion: { effect: 'regen', seconds: 45 },
  icon: (ctx) => drawPotion(ctx, '#e858a0', '#f8b8d8', '#982858'),
};
ITEMS[ITEM.POTION_HASTE] = {
  id: ITEM.POTION_HASTE, name: 'Potion of Haste',
  potion: { effect: 'haste', seconds: 90 },
  icon: (ctx) => drawPotion(ctx, '#d8c838', '#f8f0a8', '#888018'),
};
ITEMS[ITEM.POTION_NIGHT_VISION] = {
  id: ITEM.POTION_NIGHT_VISION, name: 'Potion of Night Vision',
  potion: { effect: 'night_vision', seconds: 180 },
  icon: (ctx) => drawPotion(ctx, '#3858c8', '#88a8f0', '#182868'),
};
ITEMS[ITEM.POTION_WATER_BREATHING] = {
  id: ITEM.POTION_WATER_BREATHING, name: 'Potion of Water Breathing',
  potion: { effect: 'water_breathing', seconds: 180 },
  icon: (ctx) => drawPotion(ctx, '#4898d8', '#98d0f8', '#185888'),
};
ITEMS[ITEM.POTION_JUMP] = {
  id: ITEM.POTION_JUMP, name: 'Potion of Jump Boost',
  potion: { effect: 'jump', seconds: 90 },
  icon: (ctx) => drawPotion(ctx, '#88c848', '#c8f0a0', '#387818'),
};
ITEMS[ITEM.POTION_HEALING] = {
  id: ITEM.POTION_HEALING, name: 'Potion of Healing',
  potion: { effect: 'healing', seconds: 0 },
  icon: (ctx) => drawPotion(ctx, '#f04868', '#f8a8b8', '#981828'),
};
ITEMS[ITEM.POTION_POISON] = {
  id: ITEM.POTION_POISON, name: 'Potion of Poison',
  potion: { effect: 'poison', seconds: 22 },
  icon: (ctx) => drawPotion(ctx, '#58a848', '#a8e088', '#186818'),
};

// register bow
ITEMS[ITEM.BOW] = {
  id: ITEM.BOW, name: 'Bow',
  bow: { dur: BOW_DUR },
  icon: (ctx) => {
    // curved wooden limb (arc from bottom-left grip to top-right tip)
    px(ctx, 4, 3, '#8a683c', 2, 2);
    px(ctx, 6, 2, '#8a683c', 3, 1);
    px(ctx, 9, 2, '#9c7848', 2, 1);
    px(ctx, 11, 3, '#9c7848', 1, 2);
    px(ctx, 12, 5, '#8a683c', 1, 2);
    // lower limb
    px(ctx, 3, 6, '#8a683c', 1, 3);
    px(ctx, 3, 9, '#7c5a32', 1, 2);
    px(ctx, 4, 11, '#7c5a32', 1, 2);
    px(ctx, 5, 13, '#6b4d2a', 2, 1);
    px(ctx, 7, 14, '#6b4d2a', 2, 1);
    // grip
    px(ctx, 6, 7, '#5c4020', 2, 3);
    px(ctx, 5, 8, '#5c4020', 1, 2);
    // string (right side arc)
    px(ctx, 13, 3, '#e8e8e8', 1, 1);
    px(ctx, 14, 4, '#e8e8e8', 1, 2);
    px(ctx, 14, 6, '#e8e8e8', 1, 2);
    px(ctx, 14, 8, '#e8e8e8', 1, 2);
    px(ctx, 14, 10, '#e8e8e8', 1, 2);
    px(ctx, 13, 12, '#e8e8e8', 1, 1);
    px(ctx, 12, 13, '#e8e8e8', 1, 1);
    px(ctx, 10, 14, '#d8d8d8', 2, 1);
  },
};

// register tools
for (const [key, id] of Object.entries(TOOL_IDS)) {
  const [tierName, typeName] = key.split(':') as [TierName, ToolDef['type']];
  ITEMS[id] = {
    id,
    name: `${TIER_LABEL[tierName]} ${TYPE_LABEL[typeName]}`,
    tool: makeTool(typeName, tierName),
    icon: (ctx) => TOOL_PAINTER[typeName](ctx, tierName),
  };
}

// register armor (16 pieces)
const ARMOR_PAINTER: Record<ArmorSlot, (ctx: CanvasRenderingContext2D, tier: string) => void> = {
  helmet: drawHelmet, chest: drawChestplate, legs: drawLeggings, boots: drawBoots,
};
for (const [tier, slots] of Object.entries(ARMOR_IDS)) {
  for (const slot of Object.keys(slots) as ArmorSlot[]) {
    const id = slots[slot];
    const stats = ARMOR_TIER_STATS[tier];
    ITEMS[id] = {
      id,
      name: `${ARMOR_LABEL[tier]} ${ARMOR_SLOT_LABEL[slot]}`,
      armor: {
        slot,
        points: stats.points[ARMOR_SLOT_INDEX[slot]],
        dur: stats.dur,
      },
      icon: (ctx) => ARMOR_PAINTER[slot](ctx, tier),
    };
  }
}

// ─── queries ──────────────────────────────────────────────────────────────────
export function getItemDef(id: number): ItemDef | undefined {
  return ITEMS[id];
}
export function isItemId(id: number): boolean {
  return id >= 256;
}
export function getToolDef(id: number): ToolDef | undefined {
  return ITEMS[id]?.tool;
}
export function isToolItem(id: number): boolean {
  return !!ITEMS[id]?.tool;
}
export function getArmorDef(id: number): ArmorDef | undefined {
  return ITEMS[id]?.armor;
}
export function isArmorItem(id: number): boolean {
  return !!ITEMS[id]?.armor;
}
/** storage slot 0..3 for an armor piece, or -1 */
export function armorSlotIndex(id: number): number {
  const def = ITEMS[id]?.armor;
  return def ? ARMOR_SLOT_INDEX[def.slot] : -1;
}
export function getBowDef(id: number): BowDef | undefined {
  return ITEMS[id]?.bow;
}
export function isBowItem(id: number): boolean {
  return !!ITEMS[id]?.bow;
}
export function getRodDef(id: number): RodDef | undefined {
  return ITEMS[id]?.rod;
}
export function isRodItem(id: number): boolean {
  return !!ITEMS[id]?.rod;
}
export function getShearsDef(id: number): ShearsDef | undefined {
  return ITEMS[id]?.shears;
}
export function isShearsItem(id: number): boolean {
  return !!ITEMS[id]?.shears;
}
/** potion def for a potion item id (undefined for non-potions) */
export function getPotionDef(id: number): { effect: EffectKind; seconds: number } | undefined {
  return ITEMS[id]?.potion;
}
export function isPotionItem(id: number): boolean {
  return !!ITEMS[id]?.potion;
}
/** max stack size for an item or block id */
export function maxStack(id: number): number {
  if (id === ITEM.MILK_BUCKET) return 1; // filled buckets never stack (MC)
  if (id === ITEM.BUCKET || id === ITEM.WATER_BUCKET) return 16; // MC bucket stack size
  if (id === ITEM.WATER_BOTTLE) return 16; // water bottles stack like buckets
  if (isPotionItem(id)) return 1; // potions never stack (MC java)
  return isToolItem(id) || isArmorItem(id) || isBowItem(id) || isRodItem(id) || isShearsItem(id) ? 1 : 64;
}

// ─── mining model ─────────────────────────────────────────────────────────────
export interface BreakInfo {
  /** seconds to break */
  time: number;
  /** will the block drop its item */
  harvest: boolean;
}

export function breakInfo(def: BlockDef, tool?: ToolDef): BreakInfo {
  if (!Number.isFinite(def.hardness)) return { time: Infinity, harvest: false };
  const minTier = def.minTier ?? 0;
  let speed = 1;
  let harvest = def.tool ? minTier === 0 : true;
  if (def.tool && tool && tool.type === def.tool) {
    speed = tool.speed;
    harvest = tool.tier >= minTier;
  }
  const base = harvest ? 1.5 : 5;
  return { time: Math.max(0.05, (def.hardness * base) / speed), harvest };
}

// ─── Icon rendering (cached dataURLs) ────────────────────────────────────────
const iconCache = new Map<number, string>();

export function getItemIcon(itemId: number): string {
  const cached = iconCache.get(itemId);
  if (cached) return cached;
  const def = ITEMS[itemId];
  if (!def) return '';
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  def.icon(ctx);
  // scale up 4x for crisp display
  const big = document.createElement('canvas');
  big.width = 64; big.height = 64;
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(c, 0, 0, 64, 64);
  const url = big.toDataURL();
  iconCache.set(itemId, url);
  return url;
}

/** texture for item drop entities (flat sprite) */
const dropTexCache = new Map<number, HTMLCanvasElement>();
export function getItemIconCanvas(itemId: number): HTMLCanvasElement {
  const cached = dropTexCache.get(itemId);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  const def = ITEMS[itemId];
  if (def) def.icon(ctx);
  dropTexCache.set(itemId, c);
  return c;
}
