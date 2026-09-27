// ─── Non-block item registry (id >= 256): food, materials, tools ─────────────

export interface ItemDef {
  id: number;
  name: string;
  /** hunger points restored when eaten (0 = not edible) */
  food?: number;
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
} as const;

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
};

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

export function getItemDef(id: number): ItemDef | undefined {
  return ITEMS[id];
}
export function isItemId(id: number): boolean {
  return id >= 256;
}
