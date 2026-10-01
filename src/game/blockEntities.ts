// ─── Block entities: furnace (smelting) + chest (storage) + brewing stand ────
// Keyed by "x,y,z". Persisted in save v3.
import { BLOCK, getBlockDef, containerOf } from './blocks';
import { ITEM, isItemId, isPotionItem, getPotionDef } from './items';
import { maxStack } from './items';
import type { InvSlot } from './inventory';
import { isEmptySlot, emptySlot } from './inventory';
import type { EffectKind } from './effects';

export const COOK_TIME = 10; // seconds per item (MC)
export const BREW_TIME = 20; // seconds per brew operation (MC)

export interface FurnaceBE {
  kind: 'furnace';
  input: InvSlot;
  fuel: InvSlot;
  output: InvSlot;
  burnTime: number; // remaining burn seconds
  burnMax: number;  // total burn of current fuel piece (for UI ratio)
  cookTime: number; // progress on current item
}

export interface ChestBE {
  kind: 'chest';
  slots: InvSlot[]; // 27
}

/** brewing stand: 1 ingredient + fuel + 3 bottle slots (MC layout) */
export interface BrewingBE {
  kind: 'brewing';
  ing: InvSlot;   // ingredient (sugar, spider eye, ...)
  fuel: InvSlot;  // coal / stick / planks
  b: InvSlot[];   // 3 bottle slots (water bottles → potions)
  fuelUses: number; // remaining brew operations from the current fuel piece (0..20)
  cookT: number;    // brew progress 0..BREW_TIME
}

export type BlockEntity = FurnaceBE | ChestBE | BrewingBE;

// ─── smelting + fuel registries ───────────────────────────────────────────────
const SMELT = new Map<number, number>([
  [BLOCK.IRON_ORE, ITEM.IRON_INGOT],
  [BLOCK.GOLD_ORE, ITEM.GOLD_INGOT],
  [BLOCK.SAND, BLOCK.GLASS],
  [BLOCK.COBBLESTONE, BLOCK.STONE],
  [ITEM.PORKCHOP, ITEM.PORKCHOP_COOKED],
  [ITEM.BEEF, ITEM.STEAK],
  [ITEM.CHICKEN_RAW, ITEM.CHICKEN_COOKED],
  [ITEM.MUTTON, ITEM.MUTTON_COOKED],
  // fish (MC smelting)
  [ITEM.RAW_COD, ITEM.COOKED_COD],
  [ITEM.RAW_SALMON, ITEM.COOKED_SALMON],
]);

const FUEL = new Map<number, number>([
  [ITEM.COAL, 80],
  [BLOCK.PLANKS, 15],
  [BLOCK.LOG, 15],
  [BLOCK.SPRUCE_LOG, 15],
  [ITEM.STICK, 5],
  [BLOCK.CRAFTING_TABLE, 15],
  [BLOCK.CHEST, 15],
  [BLOCK.BOOKSHELF, 15],
]);

export function smeltResult(id: number): number | undefined {
  return SMELT.get(id);
}
export function fuelSeconds(id: number): number {
  return FUEL.get(id) ?? 0;
}

// ─── brewing registries (phase 13) ───────────────────────────────────────────
// No Nether here, so ingredients are adapted to the mobs/crops that exist.
// Water bottle + ingredient → potion (MC layout, blaze-powder fuel → coal).
const BREW_INGREDIENT = new Map<number, { effect: EffectKind; seconds: number }>([
  [ITEM.SUGAR, { effect: 'speed', seconds: 90 }],           // MC: sugar → Speed
  [ITEM.FLINT, { effect: 'strength', seconds: 90 }],        // adapted: sharp mineral → Strength
  [ITEM.BONE, { effect: 'regen', seconds: 45 }],            // adapted: bone broth → Regeneration
  [ITEM.LAPIS_LAZULI, { effect: 'haste', seconds: 90 }],    // adapted: enchanted mineral → Haste
  [BLOCK.GLOWSTONE, { effect: 'night_vision', seconds: 180 }], // MC-ish: glowstone dust → Night Vision
  [ITEM.RAW_COD, { effect: 'water_breathing', seconds: 180 }], // MC-ish: fish → Water Breathing
  [ITEM.RAW_SALMON, { effect: 'water_breathing', seconds: 180 }],
  [ITEM.FEATHER, { effect: 'jump', seconds: 90 }],          // adapted: lightness → Jump Boost
  [ITEM.GOLD_INGOT, { effect: 'healing', seconds: 0 }],     // adapted: gold → Instant Health
  [ITEM.SPIDER_EYE, { effect: 'poison', seconds: 22 }],     // MC: spider eye → Poison
]);

/** brew operations granted by one fuel piece (MC blaze powder = 20) */
const BREW_FUEL = new Map<number, number>([
  [ITEM.COAL, 20],
  [BLOCK.PLANKS, 4],
  [BLOCK.LOG, 4],
  [BLOCK.SPRUCE_LOG, 4],
  [ITEM.STICK, 2],
]);

export function brewResult(ingId: number): { effect: EffectKind; seconds: number } | undefined {
  return BREW_INGREDIENT.get(ingId);
}
export function brewFuelUses(id: number): number {
  return BREW_FUEL.get(id) ?? 0;
}
/** the potion item id for an effect kind (reverse lookup) */
const POTION_BY_EFFECT = new Map<EffectKind, number>([
  ['speed', ITEM.POTION_SPEED],
  ['strength', ITEM.POTION_STRENGTH],
  ['regen', ITEM.POTION_REGEN],
  ['haste', ITEM.POTION_HASTE],
  ['night_vision', ITEM.POTION_NIGHT_VISION],
  ['water_breathing', ITEM.POTION_WATER_BREATHING],
  ['jump', ITEM.POTION_JUMP],
  ['healing', ITEM.POTION_HEALING],
  ['poison', ITEM.POTION_POISON],
]);
export function potionItemFor(effect: EffectKind): number {
  return POTION_BY_EFFECT.get(effect) ?? 0;
}

function freshBE(kind: 'furnace' | 'chest' | 'brewing'): BlockEntity {
  if (kind === 'furnace') {
    return { kind, input: emptySlot(), fuel: emptySlot(), output: emptySlot(), burnTime: 0, burnMax: 1, cookTime: 0 };
  }
  if (kind === 'brewing') {
    return { kind, ing: emptySlot(), fuel: emptySlot(), b: [emptySlot(), emptySlot(), emptySlot()], fuelUses: 0, cookT: 0 };
  }
  return { kind, slots: Array.from({ length: 27 }, () => emptySlot()) };
}

export class BlockEntityManager {
  entities = new Map<string, BlockEntity>();
  private world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void };
  /** furnace sound/visual events for the engine */
  onLit?: (x: number, y: number, z: number) => void;

  constructor(world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void }) {
    this.world = world;
  }

  key(x: number, y: number, z: number): string {
    return x + ',' + y + ',' + z;
  }

  /** get or lazily create the BE for a container block */
  getOrCreate(x: number, y: number, z: number): BlockEntity | null {
    const kind = containerOf(this.world.getBlock(x, y, z));
    if (!kind) return null;
    const k = this.key(x, y, z);
    let be = this.entities.get(k);
    if (!be || be.kind !== kind) {
      be = freshBE(kind);
      this.entities.set(k, be);
    }
    return be;
  }

  get(x: number, y: number, z: number): BlockEntity | undefined {
    return this.entities.get(this.key(x, y, z));
  }

  /** remove + return BE contents as drop list (called when container block broken) */
  destroy(x: number, y: number, z: number): { id: number; count: number; dur?: number }[] {
    const k = this.key(x, y, z);
    const be = this.entities.get(k);
    const out: { id: number; count: number; dur?: number }[] = [];
    if (be) {
      const slots = be.kind === 'chest' ? be.slots : be.kind === 'brewing' ? [be.ing, be.fuel, ...be.b] : [be.input, be.fuel, be.output];
      for (const s of slots) {
        if (!isEmptySlot(s)) out.push({ id: s.blockId, count: s.count, dur: s.dur });
      }
      this.entities.delete(k);
    }
    return out;
  }

  /** tick all furnaces + brewing stands (call every frame with dt) */
  tick(dt: number): void {
    for (const [k, be] of this.entities) {
      if (be.kind === 'brewing') {
        this.tickBrewing(k, be, dt);
        continue;
      }
      if (be.kind !== 'furnace') continue;
      const [xs, ys, zs] = k.split(',');
      const x = +xs, y = +ys, z = +zs;
      const blockHere = this.world.getBlock(x, y, z);
      if (blockHere !== BLOCK.FURNACE && blockHere !== BLOCK.FURNACE_LIT) continue;

      const recipe = !isEmptySlot(be.input) ? smeltResult(be.input.blockId) : undefined;
      const canOutput = recipe !== undefined && (
        isEmptySlot(be.output) ||
        (be.output.blockId === recipe && be.output.count < maxStack(recipe))
      );

      const wasBurning = be.burnTime > 0;
      if (be.burnTime > 0) be.burnTime -= dt;

      if (be.burnTime <= 0 && recipe !== undefined && canOutput && !isEmptySlot(be.fuel) && fuelSeconds(be.fuel.blockId) > 0) {
        // consume one fuel piece
        be.burnMax = fuelSeconds(be.fuel.blockId);
        be.burnTime = be.burnMax;
        be.fuel.count--;
        if (be.fuel.count <= 0) be.fuel = emptySlot();
      }

      const burning = be.burnTime > 0;
      if (burning && recipe !== undefined && canOutput) {
        be.cookTime += dt;
        if (be.cookTime >= COOK_TIME) {
          be.cookTime = 0;
          const outId = recipe;
          if (isEmptySlot(be.output)) be.output = { blockId: outId, count: 1 };
          else be.output.count++;
          be.input.count--;
          if (be.input.count <= 0) be.input = emptySlot();
        }
      } else if (be.cookTime > 0) {
        be.cookTime = Math.max(0, be.cookTime - dt * 2);
      }

      // lit <-> unlit block swap
      if (burning && blockHere === BLOCK.FURNACE) {
        this.world.setBlock(x, y, z, BLOCK.FURNACE_LIT);
        this.onLit?.(x, y, z);
      } else if (!burning && blockHere === BLOCK.FURNACE_LIT) {
        this.world.setBlock(x, y, z, BLOCK.FURNACE);
      }
      void wasBurning;
    }
  }

  /** fired after a brew operation completes (engine unlocks achievements) */
  onBrewed?: () => void;

  /** one water bottle per bottle slot transforms into the ingredient's potion */
  private tickBrewing(k: string, be: BrewingBE, dt: number): void {
    const [xs, ys, zs] = k.split(',');
    const x = +xs, y = +ys, z = +zs;
    if (this.world.getBlock(x, y, z) !== BLOCK.BREWING_STAND) return;

    const recipe = !isEmptySlot(be.ing) ? brewResult(be.ing.blockId) : undefined;
    const hasBottle = be.b.some((s) => !isEmptySlot(s) && s.blockId === ITEM.WATER_BOTTLE);
    const canBrew = recipe !== undefined && hasBottle && (potionItemFor(recipe.effect) ?? 0) > 0;

    // consume a fuel piece when out of charges and there is something to brew
    if (be.fuelUses <= 0 && canBrew && !isEmptySlot(be.fuel) && brewFuelUses(be.fuel.blockId) > 0) {
      be.fuelUses = brewFuelUses(be.fuel.blockId);
      be.fuel.count--;
      if (be.fuel.count <= 0) be.fuel = emptySlot();
    }

    if (canBrew && be.fuelUses > 0) {
      be.cookT += dt;
      if (be.cookT >= BREW_TIME) {
        be.cookT = 0;
        be.fuelUses = Math.max(0, be.fuelUses - 1);
        const potionId = potionItemFor(recipe!.effect);
        for (let i = 0; i < be.b.length; i++) {
          const s = be.b[i];
          if (!isEmptySlot(s) && s.blockId === ITEM.WATER_BOTTLE) {
            be.b[i] = { blockId: potionId, count: 1 };
          }
        }
        be.ing.count--;
        if (be.ing.count <= 0) be.ing = emptySlot();
        this.onBrewed?.();
      }
    } else if (be.cookT > 0) {
      be.cookT = Math.max(0, be.cookT - dt * 2);
    }
  }

  // ── persistence ─────────────────────────────────────────────────────────────
  serialize(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, be] of this.entities) {
      if (be.kind === 'furnace') {
        out[k] = { t: 'f', i: be.input, f: be.fuel, o: be.output, b: be.burnTime, m: be.burnMax, c: be.cookTime };
      } else if (be.kind === 'brewing') {
        out[k] = { t: 'b', i: be.ing, f: be.fuel, s: be.b, u: be.fuelUses, c: be.cookT };
      } else {
        out[k] = { t: 'c', s: be.slots };
      }
    }
    return out;
  }

  load(data: Record<string, unknown>): void {
    this.entities.clear();
    for (const k of Object.keys(data)) {
      const d = data[k] as Record<string, unknown>;
      try {
        if (d.t === 'f') {
          const be: FurnaceBE = {
            kind: 'furnace',
            input: (d.i as InvSlot) ?? emptySlot(),
            fuel: (d.f as InvSlot) ?? emptySlot(),
            output: (d.o as InvSlot) ?? emptySlot(),
            burnTime: (d.b as number) ?? 0,
            burnMax: (d.m as number) ?? 1,
            cookTime: (d.c as number) ?? 0,
          };
          this.entities.set(k, be);
        } else if (d.t === 'b') {
          const slots = ((d.s as InvSlot[]) ?? []).slice(0, 3);
          while (slots.length < 3) slots.push(emptySlot());
          const be: BrewingBE = {
            kind: 'brewing',
            ing: (d.i as InvSlot) ?? emptySlot(),
            fuel: (d.f as InvSlot) ?? emptySlot(),
            b: slots,
            fuelUses: (d.u as number) ?? 0,
            cookT: (d.c as number) ?? 0,
          };
          this.entities.set(k, be);
        } else if (d.t === 'c') {
          const slots = (d.s as InvSlot[]) ?? [];
          while (slots.length < 27) slots.push(emptySlot());
          this.entities.set(k, { kind: 'chest', slots } as ChestBE);
        }
      } catch { /* skip corrupt entry */ }
    }
  }

  /** debug/QA helper: count entities by kind */
  counts(): { furnace: number; chest: number; brewing: number } {
    let f = 0, c = 0, br = 0;
    for (const be of this.entities.values()) {
      if (be.kind === 'furnace') f++; else if (be.kind === 'brewing') br++; else c++;
    }
    return { furnace: f, chest: c, brewing: br };
  }
}

/** item name for containers (used by break spill) */
export function containerLabel(id: number): string {
  return getBlockDef(id)?.name ?? (isItemId(id) ? 'Item' : 'Block');
}
