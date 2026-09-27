// ─── Inventory: slot types + add/stack helpers (pure operations) ─────────────
import { maxStack } from './items';

export interface InvSlot {
  blockId: number; // 0 = empty
  count: number;
  dur?: number; // remaining durability (tools)
}

export function emptySlot(): InvSlot {
  return { blockId: 0, count: 0 };
}

export function isEmptySlot(s: InvSlot | null | undefined): boolean {
  return !s || s.blockId <= 0 || s.count <= 0;
}

export function cloneSlots(list: InvSlot[]): InvSlot[] {
  return list.map((s) => ({ ...s }));
}

/** add (id,count,dur) into slot list; returns leftover count (mutates list) */
export function addToSlots(list: InvSlot[], id: number, count: number, dur?: number): number {
  const max = maxStack(id);
  if (max > 1) {
    for (const s of list) {
      if (isEmptySlot(s)) continue;
      if (s.blockId !== id || s.count >= max) continue;
      const take = Math.min(count, max - s.count);
      s.count += take;
      count -= take;
      if (count <= 0) return 0;
    }
  }
  for (let i = 0; i < list.length; i++) {
    if (!isEmptySlot(list[i])) continue;
    const take = Math.min(count, max);
    list[i] = { blockId: id, count: take, dur };
    count -= take;
    if (count <= 0) return 0;
  }
  return count;
}

/** can the whole stack be placed into slot (merge or empty)? */
export function canPlaceInto(cursor: InvSlot, slot: InvSlot): boolean {
  if (isEmptySlot(slot)) return true;
  if (slot.blockId !== cursor.blockId) return false;
  return slot.count + cursor.count <= maxStack(slot.blockId);
}
