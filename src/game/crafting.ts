// ─── Crafting: recipe registry + shaped/shapeless matcher ────────────────────
import { BLOCK } from './blocks';
import { ITEM, isToolItem, isArmorItem, isBowItem, isRodItem, isShearsItem, getToolDef, getArmorDef, getBowDef, getRodDef, getShearsDef } from './items';

export interface CraftResult {
  id: number;
  count: number;
  /** bonus stacks granted on craft (cake returns the 3 empty milk buckets) */
  by?: { id: number; count: number }[];
}

interface ShapedRecipe {
  kind: 'shaped';
  w: number;
  h: number;
  /** row-major cells of block/item ids (0 = must be empty) */
  cells: number[];
  out: CraftResult;
}

interface ShapelessRecipe {
  kind: 'shapeless';
  ids: number[];
  out: CraftResult;
}

export type Recipe = ShapedRecipe | ShapelessRecipe;

const P = BLOCK.PLANKS;
const C = BLOCK.COBBLESTONE;
const S = ITEM.STICK;
const I = ITEM.IRON_INGOT;
const G = ITEM.GOLD_INGOT;
const D = ITEM.DIAMOND;
const L = ITEM.LEATHER;
const W = BLOCK.WOOL;
const ST = ITEM.STRING;
const F = ITEM.FLINT;
const FE = ITEM.FEATHER;
const O = BLOCK.OBSIDIAN;
const CANE = BLOCK.SUGARCANE;

function shaped(w: number, h: number, cells: number[], id: number, count = 1): ShapedRecipe {
  return { kind: 'shaped', w, h, cells, out: { id, count } };
}
function shapeless(ids: number[], id: number, count = 1): ShapelessRecipe {
  return { kind: 'shapeless', ids, out: { id, count } };
}

// tool recipe helper: material M + sticks S
function pickaxe(M: number, id: number): ShapedRecipe {
  return shaped(3, 3, [M, M, M, 0, S, 0, 0, S, 0], id);
}
function axe(M: number, id: number): ShapedRecipe {
  return shaped(2, 3, [M, M, M, S, 0, S], id);
}
function shovel(M: number, id: number): ShapedRecipe {
  return shaped(1, 3, [M, S, S], id);
}
function sword(M: number, id: number): ShapedRecipe {
  return shaped(1, 3, [M, M, S], id);
}
function hoe(M: number, id: number): ShapedRecipe {
  return shaped(2, 3, [M, M, 0, S, 0, S], id);
}
// armor recipe helpers: material M (MC patterns)
function helmet(M: number, id: number): ShapedRecipe {
  return shaped(3, 2, [M, M, M, M, 0, M], id);
}
function chestplate(M: number, id: number): ShapedRecipe {
  return shaped(3, 3, [M, 0, M, M, M, M, M, M, M], id);
}
function leggings(M: number, id: number): ShapedRecipe {
  return shaped(3, 3, [M, M, M, M, 0, M, M, 0, M], id);
}
function boots(M: number, id: number): ShapedRecipe {
  return shaped(3, 2, [M, 0, M, M, 0, M], id);
}

export const RECIPES: Recipe[] = [
  // ── basics ──
  shapeless([BLOCK.LOG], P, 4),
  shapeless([BLOCK.SPRUCE_LOG], P, 4),
  shaped(1, 2, [P, P], S, 4),
  shaped(2, 2, [P, P, P, P], BLOCK.CRAFTING_TABLE),
  shaped(3, 3, [C, C, C, C, 0, C, C, C, C], BLOCK.FURNACE),
  shaped(3, 3, [P, P, P, P, 0, P, P, P, P], BLOCK.CHEST),
  shaped(1, 2, [ITEM.COAL, S], BLOCK.TORCH, 4),
  shaped(3, 2, [W, W, W, P, P, P], BLOCK.BED),
  shaped(2, 2, [ITEM.STRING, ITEM.STRING, ITEM.STRING, ITEM.STRING], BLOCK.WOOL),
  // ── ranged combat ──
  // bow: MC pattern (sticks diagonal, strings right column)
  shaped(3, 3, [0, S, ST, S, 0, ST, 0, S, ST], ITEM.BOW),
  // arrow: flint over stick over feather (1-wide column) → 4
  shaped(1, 3, [F, S, FE], ITEM.ARROW, 4),
  // bone meal: 1 bone → 3 (shapeless, MC ratio)
  shapeless([ITEM.BONE], ITEM.BONEMEAL, 3),
  // shears: 2 iron ingots (MC pattern, diagonal)
  shaped(2, 2, [I, 0, 0, I], ITEM.SHEARS),
  // bucket: 3 iron ingots in a V (MC pattern, needs table)
  shaped(3, 2, [I, 0, I, 0, I, 0], ITEM.BUCKET),
  // fishing rod: sticks diagonal + 2 strings on the right (MC pattern)
  shaped(3, 3, [0, 0, S, 0, S, ST, S, 0, ST], ITEM.FISHING_ROD),
  // ── enchanting (paper → book → bookshelf / table) ──
  // paper: 3 sugarcane in a row → 3 (MC)
  shaped(3, 1, [CANE, CANE, CANE], ITEM.PAPER, 3),
  // book: paper / paper / leather column (MC)
  shaped(1, 3, [ITEM.PAPER, ITEM.PAPER, L], ITEM.BOOK),
  // bookshelf: planks / books / planks (MC, needs table)
  shaped(3, 3, [P, P, P, ITEM.BOOK, ITEM.BOOK, ITEM.BOOK, P, P, P], BLOCK.BOOKSHELF),
  // enchanting table: book / diamonds / obsidian (MC pattern)
  shaped(3, 3, [0, ITEM.BOOK, 0, D, D, D, O, O, O], BLOCK.ENCHANTING_TABLE),
  // ── wooden tools ──
  pickaxe(P, ITEM.WOOD_PICKAXE),
  axe(P, ITEM.WOOD_AXE),
  shovel(P, ITEM.WOOD_SHOVEL),
  sword(P, ITEM.WOOD_SWORD),
  // ── stone tools ──
  pickaxe(C, ITEM.STONE_PICKAXE),
  axe(C, ITEM.STONE_AXE),
  shovel(C, ITEM.STONE_SHOVEL),
  sword(C, ITEM.STONE_SWORD),
  // ── iron tools ──
  pickaxe(I, ITEM.IRON_PICKAXE),
  axe(I, ITEM.IRON_AXE),
  shovel(I, ITEM.IRON_SHOVEL),
  sword(I, ITEM.IRON_SWORD),
  // ── golden tools ──
  pickaxe(G, ITEM.GOLD_PICKAXE),
  axe(G, ITEM.GOLD_AXE),
  shovel(G, ITEM.GOLD_SHOVEL),
  sword(G, ITEM.GOLD_SWORD),
  // ── diamond tools ──
  pickaxe(D, ITEM.DIAMOND_PICKAXE),
  axe(D, ITEM.DIAMOND_AXE),
  shovel(D, ITEM.DIAMOND_SHOVEL),
  sword(D, ITEM.DIAMOND_SWORD),
  // ── hoes (all tiers) ──
  hoe(P, ITEM.WOOD_HOE),
  hoe(C, ITEM.STONE_HOE),
  hoe(I, ITEM.IRON_HOE),
  hoe(G, ITEM.GOLD_HOE),
  hoe(D, ITEM.DIAMOND_HOE),
  // ── farming ──
  // bread: 3 wheat in a row (MC pattern)
  shaped(3, 1, [ITEM.WHEAT, ITEM.WHEAT, ITEM.WHEAT], ITEM.BREAD),
  // ── phase 13: brewing + cake ──
  // glass bottle: 3 glass in a row → 3 (MC)
  shaped(3, 1, [BLOCK.GLASS, BLOCK.GLASS, BLOCK.GLASS], ITEM.GLASS_BOTTLE, 3),
  // sugar: 1 sugarcane → 1 sugar (MC is 1:1)
  shapeless([BLOCK.SUGARCANE], ITEM.SUGAR, 1),
  // brewing stand: 2 sticks on a cobblestone base (blaze-rod proxy)
  shaped(3, 3, [0, ITEM.STICK, 0, 0, ITEM.STICK, 0, C, C, C], BLOCK.BREWING_STAND),
  // cake: 3 milk buckets + 2 sugar + 3 wheat (MC layout minus the egg);
  // the buckets come back as a byproduct, MC-style
  {
    kind: 'shaped',
    w: 3,
    h: 3,
    cells: [ITEM.MILK_BUCKET, ITEM.MILK_BUCKET, ITEM.MILK_BUCKET, ITEM.SUGAR, ITEM.WHEAT, ITEM.SUGAR, ITEM.WHEAT, ITEM.WHEAT, ITEM.WHEAT],
    out: { id: BLOCK.CAKE, count: 1, by: [{ id: ITEM.BUCKET, count: 3 }] },
  },
  // ── transport (phase 10) ──
  // boat: MC pattern (planks U-shape, 3x2)
  shaped(3, 2, [P, 0, P, P, P, P], ITEM.BOAT),
  // ── armor (leather / iron / gold / diamond) ──
  helmet(L, ITEM.LEATHER_HELMET),
  chestplate(L, ITEM.LEATHER_CHESTPLATE),
  leggings(L, ITEM.LEATHER_LEGGINGS),
  boots(L, ITEM.LEATHER_BOOTS),
  helmet(I, ITEM.IRON_HELMET),
  chestplate(I, ITEM.IRON_CHESTPLATE),
  leggings(I, ITEM.IRON_LEGGINGS),
  boots(I, ITEM.IRON_BOOTS),
  helmet(G, ITEM.GOLD_HELMET),
  chestplate(G, ITEM.GOLD_CHESTPLATE),
  leggings(G, ITEM.GOLD_LEGGINGS),
  boots(G, ITEM.GOLD_BOOTS),
  helmet(D, ITEM.DIAMOND_HELMET),
  chestplate(D, ITEM.DIAMOND_CHESTPLATE),
  leggings(D, ITEM.DIAMOND_LEGGINGS),
  boots(D, ITEM.DIAMOND_BOOTS),
];

/** grid: row-major ids (0 = empty), size 2 or 3. Returns null when no match. */
export function matchRecipe(grid: number[], size: number): CraftResult | null {
  const cells = size * size;
  if (grid.length !== cells) return null;
  const nonEmpty = grid.filter((v) => v !== 0);
  if (nonEmpty.length === 0) return null;

  // bounding box of used cells
  let minC = size, minR = size, maxC = -1, maxR = -1;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (grid[r * size + c] !== 0) {
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      }
  const bw = maxC - minC + 1;
  const bh = maxR - minR + 1;

  for (const recipe of RECIPES) {
    if (recipe.kind === 'shapeless') {
      if (nonEmpty.length !== recipe.ids.length) continue;
      const pool = [...recipe.ids];
      let ok = true;
      for (const v of nonEmpty) {
        const idx = pool.indexOf(v);
        if (idx === -1) { ok = false; break; }
        pool.splice(idx, 1);
      }
      if (ok && pool.length === 0) return { ...recipe.out };
      continue;
    }
    // shaped: bounding box must fit (2x2 grid can only make w,h <= 2)
    if (recipe.w !== bw || recipe.h !== bh) continue;
    if (bw > size || bh > size) continue;
    if (matchesAt(grid, size, recipe, minC, minR)) return { ...recipe.out, by: recipe.out.by };
    // try mirrored
    if (matchesAt(grid, size, mirror(recipe), minC, minR)) return { ...recipe.out, by: recipe.out.by };
  }
  return null;
}

function matchesAt(grid: number[], size: number, recipe: ShapedRecipe, offC: number, offR: number): boolean {
  for (let r = 0; r < recipe.h; r++)
    for (let c = 0; c < recipe.w; c++) {
      const gv = grid[(offR + r) * size + (offC + c)];
      const rv = recipe.cells[r * recipe.w + c] ?? 0;
      if (gv !== rv) return false;
    }
  return true;
}

function mirror(recipe: ShapedRecipe): ShapedRecipe {
  const cells: number[] = new Array(recipe.w * recipe.h).fill(0);
  for (let r = 0; r < recipe.h; r++)
    for (let c = 0; c < recipe.w; c++)
      cells[r * recipe.w + c] = recipe.cells[r * recipe.w + (recipe.w - 1 - c)] ?? 0;
  return { ...recipe, cells };
}

/** does this recipe require a 3x3 crafting table? */
export function needsTable(recipe: Recipe): boolean {
  return recipe.kind === 'shaped' ? recipe.w > 2 || recipe.h > 2 : recipe.ids.length > 4;
}

/** full durability for a fresh tool, bow, rod, shears or armor piece (0 when neither) */
export function freshDur(id: number): number | undefined {
  if (isToolItem(id)) return getToolDef(id)?.dur ?? 0;
  if (isArmorItem(id)) return getArmorDef(id)?.dur ?? 0;
  if (isBowItem(id)) return getBowDef(id)?.dur ?? 0;
  if (isRodItem(id)) return getRodDef(id)?.dur ?? 0;
  if (isShearsItem(id)) return getShearsDef(id)?.dur ?? 0;
  return undefined;
}
