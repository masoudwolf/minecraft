import { BLOCK, getBlockDef } from '../../src/game/blocks';
import { ITEM, getItemDef, ITEMS } from '../../src/game/items';
import { creativePalette } from '../../src/game/creativeItems';

const palette = creativePalette();
const palBlockIds = new Set(palette.filter(e => !e.isItem).map(e => e.id));
const palItemIds = new Set(palette.filter(e => e.isItem).map(e => e.id));

const missingBlocks: string[] = [];
for (const k of Object.keys(BLOCK) as (keyof typeof BLOCK)[]) {
  const id = BLOCK[k];
  if (id === BLOCK.AIR) continue;
  if (id >= BLOCK.WATER_FLOW1 && id <= BLOCK.WATER_FLOW7) continue;
  if (!getBlockDef(id)) continue;
  if (!palBlockIds.has(id)) missingBlocks.push(String(k));
}
const missingItems: string[] = [];
for (const k of Object.keys(ITEM) as (keyof typeof ITEM)[]) {
  const id = ITEM[k];
  if (!getItemDef(id)) { missingItems.push(k + ' (NO DEF)'); continue; }
  if (!palItemIds.has(id)) missingItems.push(String(k));
}
console.log(JSON.stringify({
  paletteSize: palette.length,
  blocks: palBlockIds.size,
  items: palItemIds.size,
  missingBlocks,
  missingItems,
}, null, 1));
