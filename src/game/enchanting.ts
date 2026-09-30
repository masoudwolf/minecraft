// ─── Enchanting: registry, option generation (table GUI), effect helpers ─────
import { getToolDef, getArmorDef, isBowItem, isRodItem, getBowDef, getRodDef, isShearsItem, getShearsDef } from './items';

export interface EnchantDef {
  id: string;
  /** display name (MC style) */
  label: string;
  max: number;
  /** item families this enchant applies to */
  kinds: EnchantKind[];
  /** relative rarity weight in the table roll */
  weight: number;
}

export type EnchantKind = 'sword' | 'axe' | 'pickaxe' | 'shovel' | 'hoe' | 'armor' | 'bow' | 'rod' | 'shears';

export const ENCHANTS: Record<string, EnchantDef> = {
  sharpness: { id: 'sharpness', label: 'Sharpness', max: 3, kinds: ['sword', 'axe'], weight: 10 },
  efficiency: { id: 'efficiency', label: 'Efficiency', max: 3, kinds: ['pickaxe', 'axe', 'shovel', 'hoe'], weight: 10 },
  unbreaking: { id: 'unbreaking', label: 'Unbreaking', max: 3, kinds: ['sword', 'axe', 'pickaxe', 'shovel', 'hoe', 'armor', 'bow', 'rod', 'shears'], weight: 8 },
  protection: { id: 'protection', label: 'Protection', max: 3, kinds: ['armor'], weight: 10 },
  fortune: { id: 'fortune', label: 'Fortune', max: 2, kinds: ['pickaxe'], weight: 4 },
  power: { id: 'power', label: 'Power', max: 3, kinds: ['bow'], weight: 8 },
  infinity: { id: 'infinity', label: 'Infinity', max: 1, kinds: ['bow'], weight: 2 },
  featherFalling: { id: 'featherFalling', label: 'Feather Falling', max: 4, kinds: ['armor'], weight: 6 },
  lure: { id: 'lure', label: 'Lure', max: 2, kinds: ['rod'], weight: 6 },
  luckOfTheSea: { id: 'luckOfTheSea', label: 'Luck of the Sea', max: 2, kinds: ['rod'], weight: 4 },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export function roman(level: number): string {
  return ROMAN[Math.max(1, Math.min(5, level))];
}

/** full display line, e.g. "Sharpness III" */
export function enchantLine(id: string, level: number): string {
  const def = ENCHANTS[id];
  return (def?.label ?? id) + ' ' + roman(level);
}

/** which enchant kinds does this item id belong to */
export function enchantKindsOf(id: number): EnchantKind[] {
  const tool = getToolDef(id);
  if (tool) {
    if (tool.type === 'sword') return ['sword'];
    return [tool.type];
  }
  if (isArmorItem(id)) return ['armor'];
  if (isBowItem(id)) return ['bow'];
  if (isRodItem(id)) return ['rod'];
  if (isShearsItem(id)) return ['shears'];
  return [];
}
function isArmorItem(id: number): boolean {
  return !!getArmorDef(id);
}

/** can this item be enchanted at all */
export function isEnchantable(id: number): boolean {
  return enchantKindsOf(id).length > 0;
}

/** max total enchant weight budget per slot (keeps the table honest) */
const MAX_OPTIONS = 3;

export interface EnchantOption {
  enchId: string;
  level: number;
  /** lapis cost (1..3) */
  lapis: number;
  /** XP level cost */
  levels: number;
  label: string;
}

/** deterministic PRNG (mulberry32) so the 3 offers stay stable per seed */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + 0x7f4a7c15) | 0;
    t = (t ^ (t >>> 15)) | 0;
    t = (t + 0x2c1b3c6d) | 0;
    t = (t ^ (t >>> 12)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate the 3 table offers for an item (MC-like: top = cheap, bottom = rich).
 * Deterministic per (itemId, epoch) so the offers don't reshuffle on every render.
 */
export function enchantOptions(itemId: number, epoch: number): EnchantOption[] {
  const kinds = enchantKindsOf(itemId);
  if (kinds.length === 0) return [];
  const pool = Object.values(ENCHANTS).filter((e) => e.kinds.some((k) => kinds.includes(k)));
  if (pool.length === 0) return [];
  const rnd = mulberry32(itemId * 7919 + epoch * 104729);

  const options: EnchantOption[] = [];
  const used = new Set<string>();
  for (let i = 0; i < MAX_OPTIONS; i++) {
    // weighted pick, no duplicates within one offer set
    let ench = pool[Math.floor(rnd() * pool.length)];
    for (let tries = 0; tries < 12 && used.has(ench.id); tries++) {
      ench = pool[Math.floor(rnd() * pool.length)];
    }
    if (used.has(ench.id)) continue;
    used.add(ench.id);
    // level ramps with slot depth: top 1, middle 1-2, bottom 2-3 (capped by def.max)
    const maxLvl = ench.max;
    let level = 1;
    if (i === 1) level = 1 + Math.floor(rnd() * 2);
    else if (i === 2) level = 2 + Math.floor(rnd() * 2);
    level = Math.min(level, maxLvl);
    options.push({
      enchId: ench.id,
      level,
      lapis: i + 1,
      levels: [1, 2, 4][i] ?? 4,
      label: enchantLine(ench.id, level),
    });
  }
  return options;
}

// ─── effect helpers (called from engine/player) ──────────────────────────────

/** melee damage bonus from Sharpness (+1 per level, MC-lite) */
export function sharpnessBonus(ench: Record<string, number> | undefined): number {
  return ench?.sharpness ?? 0;
}

/** mining time multiplier from Efficiency (−30% per level on matching tools) */
export function efficiencyFactor(ench: Record<string, number> | undefined): number {
  const lvl = ench?.efficiency ?? 0;
  return Math.pow(0.7, lvl);
}

/** Unbreaking: chance a wear tick is ignored (MC: 60% + 40/(lvl+1) %) */
export function unbreakingKeep(lvl: number): boolean {
  if (lvl <= 0) return false;
  const keepChance = 0.6 + 0.4 / (lvl + 1);
  return Math.random() < keepChance;
}

/** Fortune: extra drop rolls for ores (chance per extra item) */
export function fortuneChance(lvl: number): number {
  return lvl > 0 ? lvl * 0.18 : 0;
}

/** Power: bow damage bonus (+1 per level) */
export function powerBonus(ench: Record<string, number> | undefined): number {
  return ench?.power ?? 0;
}

/** Infinity: true when the bow never consumes arrows */
export function hasInfinity(ench: Record<string, number> | undefined): boolean {
  return (ench?.infinity ?? 0) > 0;
}

/** Feather Falling: fall damage ×(1 − 12%/level, cap 4 levels → 48%) */
export function featherFallingFactor(lvl: number): number {
  return 1 - Math.min(4, lvl) * 0.12;
}

/** Lure: fishing wait multiplier (−35% per level) */
export function lureFactor(ench: Record<string, number> | undefined): number {
  const lvl = ench?.lure ?? 0;
  return Math.pow(0.65, lvl);
}

/** Luck of the Sea: treasure share bonus (+12% per level) */
export function luckBonus(ench: Record<string, number> | undefined): number {
  return (ench?.luckOfTheSea ?? 0) * 0.12;
}

/** fresh durability for any durable item id (tools/armor/bow/rod/shears) */
export function freshDurFor(id: number): number | undefined {
  if (getToolDef(id)) return getToolDef(id)?.dur ?? 0;
  if (getArmorDef(id)) return getArmorDef(id)?.dur ?? 0;
  if (getBowDef(id)) return getBowDef(id)?.dur ?? 0;
  if (getRodDef(id)) return getRodDef(id)?.dur ?? 0;
  if (getShearsDef(id)) return getShearsDef(id)?.dur ?? 0;
  return undefined;
}
