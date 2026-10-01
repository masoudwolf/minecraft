// ─── Villager trades (v0.57: six professions with themed pools) ──────────────
import { ITEM } from './items';
import { BLOCK } from './blocks';

export interface TradeOffer {
  give: { id: number; count: number };
  get: { id: number; count: number };
}

/** villager professions (v0.57) — each village house type is "owned" by one,
 *  each profession carries a robe tint and its own trade pool */
export type VillagerProfession = 'farmer' | 'librarian' | 'smith' | 'brewer' | 'butcher' | 'fisherman';

export const VILLAGER_PROFESSIONS: VillagerProfession[] = [
  'farmer', 'librarian', 'smith', 'brewer', 'butcher', 'fisherman',
];

/** random profession for a naturally spawning villager */
export function pickVillagerProfession(): VillagerProfession {
  return VILLAGER_PROFESSIONS[Math.floor(Math.random() * VILLAGER_PROFESSIONS.length)];
}

/** bilingual labels for the trade panel (EN + FA, HUD-chip pattern) */
export const PROFESSION_LABELS: Record<VillagerProfession, { en: string; fa: string }> = {
  farmer: { en: 'Farmer', fa: 'کشاورز' },
  librarian: { en: 'Librarian', fa: 'کتابدار' },
  smith: { en: 'Blacksmith', fa: 'آهنگر' },
  brewer: { en: 'Cleric', fa: 'کیمیاگر' },
  butcher: { en: 'Butcher', fa: 'قصاب' },
  fisherman: { en: 'Fisherman', fa: 'ماهیگیر' },
};

/** general pool every villager can draw from (kept from the old flat list) */
const GENERAL_TRADES: TradeOffer[] = [
  { give: { id: ITEM.COAL, count: 10 }, get: { id: ITEM.IRON_INGOT, count: 2 } },
  { give: { id: BLOCK.COBBLESTONE, count: 24 }, get: { id: ITEM.DIAMOND, count: 1 } },
  { give: { id: BLOCK.LOG, count: 12 }, get: { id: ITEM.COAL, count: 6 } },
  { give: { id: ITEM.STRING, count: 8 }, get: { id: ITEM.BOW, count: 1 } },
];

/** profession-themed pools (v0.57 — the old flat list, redistributed + flavor) */
const PROFESSION_TRADES: Record<VillagerProfession, TradeOffer[]> = {
  farmer: [
    { give: { id: ITEM.WHEAT, count: 16 }, get: { id: ITEM.BREAD, count: 5 } },
    { give: { id: ITEM.LEATHER, count: 6 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
    { give: { id: ITEM.SEEDS, count: 12 }, get: { id: ITEM.BREAD, count: 2 } },
    { give: { id: ITEM.ROTTEN_FLESH, count: 14 }, get: { id: ITEM.BREAD, count: 2 } },
  ],
  librarian: [
    { give: { id: ITEM.PAPER, count: 12 }, get: { id: ITEM.BOOK, count: 1 } },
    { give: { id: ITEM.BOOK, count: 4 }, get: { id: ITEM.IRON_INGOT, count: 2 } },
    { give: { id: ITEM.BONE, count: 10 }, get: { id: ITEM.BOOK, count: 1 } },
    { give: { id: ITEM.PAPER, count: 20 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
  ],
  smith: [
    { give: { id: ITEM.FLINT, count: 8 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
    { give: { id: ITEM.IRON_INGOT, count: 5 }, get: { id: ITEM.ARROW, count: 12 } },
    { give: { id: ITEM.COAL, count: 18 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
    { give: { id: ITEM.LEATHER, count: 4 }, get: { id: ITEM.COAL, count: 6 } },
  ],
  brewer: [
    { give: { id: ITEM.SPIDER_EYE, count: 6 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
    { give: { id: ITEM.REDSTONE, count: 4 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
    { give: { id: ITEM.GLOWSTONE_DUST, count: 4 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
    { give: { id: ITEM.GLASS_BOTTLE, count: 6 }, get: { id: ITEM.BREAD, count: 2 } },
  ],
  butcher: [
    { give: { id: ITEM.PORKCHOP, count: 8 }, get: { id: ITEM.PORKCHOP_COOKED, count: 6 } },
    { give: { id: ITEM.BEEF, count: 8 }, get: { id: ITEM.MUTTON_COOKED, count: 6 } },
    { give: { id: ITEM.LEATHER, count: 7 }, get: { id: ITEM.BREAD, count: 3 } },
    { give: { id: ITEM.CHICKEN_RAW, count: 7 }, get: { id: ITEM.COAL, count: 6 } },
  ],
  fisherman: [
    { give: { id: ITEM.RAW_COD, count: 6 }, get: { id: ITEM.COOKED_COD, count: 5 } },
    { give: { id: ITEM.RAW_SALMON, count: 6 }, get: { id: ITEM.COOKED_SALMON, count: 5 } },
    { give: { id: ITEM.STRING, count: 6 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
    { give: { id: ITEM.BONE, count: 8 }, get: { id: ITEM.BREAD, count: 2 } },
  ],
};

/** real minutes between villager restocks (MC restocks 2×/day; we rotate every 5 min) */
export const TRADE_EPOCH_MS = 5 * 60 * 1000;

/**
 * Deterministic pick of 3 offers for a villager. `seed` should be stable per
 * villager (position hash); the epoch rotates everyone's stock together so a
 * given villager refreshes its wares every TRADE_EPOCH_MS (MC-like restock).
 * v0.57: `profession` weights the pool toward the villager's themed offers;
 * without one the general pool is used (legacy callers / plain villagers).
 */
export function villagerTrades(seed: number, epoch: number, profession?: VillagerProfession): TradeOffer[] {
  const pool = profession ? [...PROFESSION_TRADES[profession], ...GENERAL_TRADES] : GENERAL_TRADES;
  const picks: TradeOffer[] = [];
  const used = new Set<number>();
  // simple LCG so the same (seed, epoch) always yields the same trio
  let s = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(epoch + 1, 0xc2b2ae35)) >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  while (picks.length < 3 && used.size < pool.length) {
    const i = Math.floor(next() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(pool[i]);
  }
  return picks;
}

/** current restock epoch (rotates every TRADE_EPOCH_MS of wall-clock time) */
export function tradeEpoch(): number {
  return Math.floor(Date.now() / TRADE_EPOCH_MS);
}

/** stable per-villager seed from its world position */
export function villagerTradeSeed(x: number, z: number): number {
  return (Math.round(x * 7) * 31 + Math.round(z * 13) * 17) | 0;
}
