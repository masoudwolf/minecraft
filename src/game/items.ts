// ─── Non-block item registry (id >= 256): food, materials, tools ─────────────
import type { BlockDef } from './blocks';

export interface ToolDef {
  type: 'pickaxe' | 'axe' | 'shovel' | 'sword';
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
  /** draw 16x16 pixel-art icon; returns canvas */
  icon: (ctx: CanvasRenderingContext2D) => void;
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
} as const;

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
        : type === 'pickaxe'
          ? Math.max(2, t.swordDmg - 2)
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

// ─── tool registry builder ────────────────────────────────────────────────────
const TOOL_IDS: Record<string, number> = {
  'wood:pickaxe': ITEM.WOOD_PICKAXE, 'wood:axe': ITEM.WOOD_AXE, 'wood:shovel': ITEM.WOOD_SHOVEL, 'wood:sword': ITEM.WOOD_SWORD,
  'stone:pickaxe': ITEM.STONE_PICKAXE, 'stone:axe': ITEM.STONE_AXE, 'stone:shovel': ITEM.STONE_SHOVEL, 'stone:sword': ITEM.STONE_SWORD,
  'iron:pickaxe': ITEM.IRON_PICKAXE, 'iron:axe': ITEM.IRON_AXE, 'iron:shovel': ITEM.IRON_SHOVEL, 'iron:sword': ITEM.IRON_SWORD,
  'gold:pickaxe': ITEM.GOLD_PICKAXE, 'gold:axe': ITEM.GOLD_AXE, 'gold:shovel': ITEM.GOLD_SHOVEL, 'gold:sword': ITEM.GOLD_SWORD,
  'diamond:pickaxe': ITEM.DIAMOND_PICKAXE, 'diamond:axe': ITEM.DIAMOND_AXE, 'diamond:shovel': ITEM.DIAMOND_SHOVEL, 'diamond:sword': ITEM.DIAMOND_SWORD,
};

const TIER_LABEL: Record<TierName, string> = { wood: 'Wooden', stone: 'Stone', iron: 'Iron', gold: 'Golden', diamond: 'Diamond' };
const TYPE_LABEL: Record<ToolDef['type'], string> = { pickaxe: 'Pickaxe', axe: 'Axe', shovel: 'Shovel', sword: 'Sword' };
const TOOL_PAINTER: Record<ToolDef['type'], (ctx: CanvasRenderingContext2D, tier: TierName) => void> = {
  pickaxe: drawPickaxe, axe: drawAxe, shovel: drawShovel, sword: drawSword,
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
/** max stack size for an item or block id */
export function maxStack(id: number): number {
  return isToolItem(id) ? 1 : 64;
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
