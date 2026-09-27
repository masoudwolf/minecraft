// ─── Crafting: recipe registry + shaped/shapeless matcher ────────────────────
import { BLOCK } from './blocks';
import { ITEM, isToolItem, getToolDef } from './items';

export interface CraftResult {
  id: number;
  count: number;
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
const W = BLOCK.WOOL;

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
    if (matchesAt(grid, size, recipe, minC, minR)) return { ...recipe.out };
    // try mirrored
    if (matchesAt(grid, size, mirror(recipe), minC, minR)) return { ...recipe.out };
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

/** full durability for a fresh tool (0 when not a tool) */
export function freshDur(id: number): number | undefined {
  if (!isToolItem(id)) return undefined;
  return getToolDef(id)?.dur ?? 0;
}
