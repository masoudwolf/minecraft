// ─── Creative inventory palette: every obtainable block + item ───────────────
import { BLOCK, getBlockDef } from './blocks';
import { ITEMS, ITEM, isItemId, getItemDef } from './items';

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

// ─── Creative category tabs (MC-style) ───────────────────────────────────────
export type CreativeCat = 'all' | 'building' | 'nature' | 'functional' | 'tools' | 'food' | 'materials';

export interface CreativeTab {
  key: CreativeCat;
  label: string;
  /** representative id shown as the tab icon */
  iconId: number;
  entries: CreativeEntry[];
}

const NATURE_WORDS = ['grass', 'dirt', 'sand', 'gravel', 'log', 'leaves', 'flower', 'poppy', 'dandelion', 'cactus', 'sugarcane', 'dead bush', 'lily', 'mycelium', 'mushroom', 'water', 'ice', 'snowy', 'snow block', 'ore', 'podzol', 'clay', 'vine'];
const BUILDING_WORDS = ['stone', 'cobble', 'planks', 'brick', 'sandstone', 'glass', 'wool', 'obsidian', 'bedrock', 'bookshelf', 'quartz', 'terracotta', 'concrete', 'slab', 'stairs', 'fence', 'door', 'trapdoor'];
const FUNCTIONAL_WORDS = ['crafting', 'furnace', 'chest', 'torch', 'tnt', 'bed', 'glowstone', 'ladder', 'rail', 'boat', 'sign', 'lantern', 'jack', 'enchanting', 'brewing', 'cake'];

function classify(e: CreativeEntry): CreativeCat {
  const n = e.name.toLowerCase();
  const hit = (words: string[]): boolean => words.some((w) => n.includes(w));
  if (e.isItem) {
    const def = getItemDef(e.id)!;
    if (def.food) return 'food';
    if (def.tool || def.rod || def.shears || isItemId(e.id) && (n.includes('sword') || n.includes('bow') || n.includes('arrow') || n.includes('helmet') || n.includes('chestplate') || n.includes('leggings') || n.includes('boots'))) return 'tools';
    return 'materials';
  }
  if (hit(FUNCTIONAL_WORDS)) return 'functional';
  if (hit(NATURE_WORDS)) return 'nature';
  if (hit(BUILDING_WORDS)) return 'building';
  return 'building'; // blocks default to building (MC's first tab)
}

interface CreativeTabDef { key: CreativeCat; label: string; iconId: number }

const TAB_DEFS: CreativeTabDef[] = [
  { key: 'all', label: 'All', iconId: BLOCK.CHEST },
  { key: 'building', label: 'Building', iconId: BLOCK.PLANKS },
  { key: 'nature', label: 'Nature', iconId: BLOCK.GRASS },
  { key: 'functional', label: 'Functional', iconId: BLOCK.CRAFTING_TABLE },
  { key: 'tools', label: 'Tools & Combat', iconId: ITEM.IRON_PICKAXE },
  { key: 'food', label: 'Food', iconId: ITEM.BREAD },
  { key: 'materials', label: 'Materials', iconId: ITEM.STICK },
];

let cachedTabs: CreativeTab[] | null = null;

/** MC-style creative tabs: the full palette split into category buckets */
export function creativeTabs(): CreativeTab[] {
  if (cachedTabs) return cachedTabs;
  const palette = creativePalette();
  const buckets = new Map<CreativeCat, CreativeEntry[]>();
  for (const e of palette) {
    const c = classify(e);
    if (!buckets.has(c)) buckets.set(c, []);
    buckets.get(c)!.push(e);
  }
  cachedTabs = TAB_DEFS.map((d) => ({ ...d, entries: d.key === 'all' ? palette : (buckets.get(d.key) ?? []) }));
  return cachedTabs;
}
