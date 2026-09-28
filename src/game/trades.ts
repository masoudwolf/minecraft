// ─── Villager trade offers (MC-style trades, per-villager stock rotation) ────
import { ITEM } from './items';
import { BLOCK } from './blocks';

export interface TradeOffer {
  give: { id: number; count: number };
  get: { id: number; count: number };
}

/** full trade pool a villager can draw from (Phase 10: was a fixed list of 3) */
export const VILLAGER_TRADES: TradeOffer[] = [
  { give: { id: ITEM.COAL, count: 10 }, get: { id: ITEM.IRON_INGOT, count: 2 } },
  { give: { id: ITEM.LEATHER, count: 6 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
  { give: { id: BLOCK.COBBLESTONE, count: 24 }, get: { id: ITEM.DIAMOND, count: 1 } },
  { give: { id: ITEM.WHEAT, count: 18 }, get: { id: ITEM.IRON_INGOT, count: 2 } },
  { give: { id: BLOCK.LOG, count: 12 }, get: { id: ITEM.COAL, count: 6 } },
  { give: { id: ITEM.BREAD, count: 4 }, get: { id: ITEM.LEATHER, count: 3 } },
  { give: { id: ITEM.FLINT, count: 8 }, get: { id: ITEM.IRON_INGOT, count: 1 } },
  { give: { id: ITEM.ROTTEN_FLESH, count: 14 }, get: { id: ITEM.BREAD, count: 2 } },
  { give: { id: ITEM.BONE, count: 10 }, get: { id: ITEM.ARROW, count: 8 } },
  { give: { id: ITEM.STRING, count: 8 }, get: { id: ITEM.BOW, count: 1 } },
];

/** real minutes between villager restocks (MC restocks 2×/day; we rotate every 5 min) */
export const TRADE_EPOCH_MS = 5 * 60 * 1000;

/**
 * Deterministic pick of 3 offers for a villager. `seed` should be stable per
 * villager (position hash); the epoch rotates everyone's stock together so a
 * given villager refreshes its wares every TRADE_EPOCH_MS (MC-like restock).
 */
export function villagerTrades(seed: number, epoch: number): TradeOffer[] {
  const picks: TradeOffer[] = [];
  const used = new Set<number>();
  // simple LCG so the same (seed, epoch) always yields the same trio
  let s = (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(epoch + 1, 0xc2b2ae35)) >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  while (picks.length < 3 && used.size < VILLAGER_TRADES.length) {
    const i = Math.floor(next() * VILLAGER_TRADES.length);
    if (used.has(i)) continue;
    used.add(i);
    picks.push(VILLAGER_TRADES[i]);
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
