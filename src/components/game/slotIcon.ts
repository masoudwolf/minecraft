// ─── Shared slot icon resolution (hotbar + inventory screens) ────────────────
import { getBlockDef } from '@/game/blocks';
import { isItemId, getItemIcon } from '@/game/items';
import { getBlockIcon } from '@/game/textures/atlas';

/** dataURL icon for a slot id (block = isometric render, item = pixel icon) */
export function slotIconUrl(id: number): string | null {
  if (id <= 0) return null;
  if (isItemId(id)) return getItemIcon(id) || null;
  const def = getBlockDef(id);
  if (!def) return null;
  return getBlockIcon(def.id, Array.isArray(def.tiles) ? def.tiles[2] : def.tiles, Array.isArray(def.tiles) ? def.tiles[4] : def.tiles);
}

export function slotName(id: number): string {
  if (id <= 0) return '';
  if (isItemId(id)) return getItemDefName(id);
  return getBlockDef(id)?.name ?? '';
}

import { getItemDef } from '@/game/items';
function getItemDefName(id: number): string {
  return getItemDef(id)?.name ?? '';
}
