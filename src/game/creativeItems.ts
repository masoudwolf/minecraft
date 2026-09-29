// ─── Creative inventory palette: every obtainable block + item ───────────────
import { BLOCK, getBlockDef } from './blocks';
import { ITEMS, isItemId, getItemDef } from './items';

/** block ids offered in the creative palette (world-placeable, in registry order) */
function blockPalette(): number[] {
  const ids: number[] = [];
  for (const idStr of Object.keys(BLOCK)) {
    const id = (BLOCK as Record<string, number>)[idStr];
    if (id === BLOCK.AIR) continue;
    // skip internal flowing-water ids (creative gets the source block)
    if (id >= BLOCK.WATER_FLOW1 && id <= BLOCK.WATER_FLOW7) continue;
    if (!getBlockDef(id)) continue;
    ids.push(id);
  }
  return ids;
}

/** non-tool item ids (materials + food) */
function itemPalette(): number[] {
  const ids: number[] = [];
  for (const idStr of Object.keys(ITEMS)) {
    const id = Number(idStr); // keys are numeric ids — parse, don't re-index (re-indexing yields the ItemDef object, which failed getItemDef and emptied the palette)
    if (!Number.isFinite(id)) continue;
    if (!getItemDef(id)) continue;
    ids.push(id);
  }
  return ids;
}

export interface CreativeEntry {
  id: number;
  name: string;
  isItem: boolean;
}

let cachedPalette: CreativeEntry[] | null = null;

/** combined palette: blocks first, then materials, then food, then tools */
export function creativePalette(): CreativeEntry[] {
  if (cachedPalette) return cachedPalette;
  const out: CreativeEntry[] = [];
  for (const id of blockPalette()) {
    out.push({ id, name: getBlockDef(id)!.name, isItem: false });
  }
  for (const id of itemPalette()) {
    const def = getItemDef(id)!;
    if (def.tool) continue; // tools get their own group
    out.push({ id, name: def.name, isItem: true });
  }
  for (const id of itemPalette()) {
    const def = getItemDef(id)!;
    if (def.tool) out.push({ id, name: def.name, isItem: true });
  }
  cachedPalette = out;
  return out;
}

/** ids that cannot be picked (shouldn't happen — kept for safety) */
export function isCreativePickable(id: number): boolean {
  return getBlockDef(id) !== undefined || (isItemId(id) && getItemDef(id) !== undefined);
}
