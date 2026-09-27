// ─── Villager trade offers (fixed MC-style trades) ───────────────────────────
import { ITEM } from './items';
import { BLOCK } from './blocks';

export interface TradeOffer {
  give: { id: number; count: number };
  get: { id: number; count: number };
}

export const VILLAGER_TRADES: TradeOffer[] = [
  { give: { id: ITEM.COAL, count: 10 }, get: { id: ITEM.IRON_INGOT, count: 2 } },
  { give: { id: ITEM.LEATHER, count: 6 }, get: { id: ITEM.GOLD_INGOT, count: 1 } },
  { give: { id: BLOCK.COBBLESTONE, count: 24 }, get: { id: ITEM.DIAMOND, count: 1 } },
];
