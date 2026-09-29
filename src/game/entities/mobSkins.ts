// ─── Mob skins: real Minecraft vanilla entity textures + standard box UVs ───
// Rebuilt (post-reset) on top of vanillaSkins.ts. Each part carries the
// official texture and its Minecraft model box definition (texOffs + dims),
// so every face samples the exact vanilla pixels — pixel-perfect by
// construction, no hand-extracted texel data to drift out of alignment.
import * as THREE from 'three';
import { vanillaTex, tintedTex, type MobSkinPart, type BoxUVLayout } from './vanillaSkins';

export interface MobSkins {
  head: MobSkinPart;
  /** long nose (villager/witch/golem) */
  head2?: MobSkinPart;
  body: MobSkinPart;
  limb: MobSkinPart;
  /** arms when they use a different region than legs (zombie/skeleton/villager/golem) */
  limb2?: MobSkinPart;
  /** beak (chicken) */
  extra?: MobSkinPart;
  /** wattle (chicken) */
  extra2?: MobSkinPart;
  /** wings (chicken) */
  wing?: MobSkinPart;
  /** chicken legs: whole-texture orange bake (vanilla tints legs at runtime) */
  legsBaked?: MobSkinPart;
  /** sheep fleece layer (MC renders wool as an inflated second box layer) */
  fur?: { head: MobSkinPart; body: MobSkinPart; limb: MobSkinPart; inflate: number };
  /** witch hat pieces */
  hat?: MobSkinPart;
  hat1?: MobSkinPart;
  hat2?: MobSkinPart;
  hat3?: MobSkinPart;
}

function p(file: string, texW: number, texH: number, u: number, v: number, w: number, h: number, d: number): MobSkinPart {
  return { tex: vanillaTex(file), lay: { u, v, w, h, d }, texW, texH };
}

function tintP(file: string, texW: number, texH: number, color: string, strength: number, u: number, v: number, w: number, h: number, d: number): MobSkinPart {
  return { tex: tintedTex(file, color, strength), lay: { u, v, w, h, d }, texW, texH };
}

const skinCache = new Map<string, MobSkins>();

// ─── Sheep dye palette (vanilla wool colors) ─────────────────────────────────
export const SHEEP_COLORS: Record<string, string> = {
  white: '#E9ECEC',
  light_gray: '#8E8E86',
  gray: '#3E4447',
  brown: '#724728',
  black: '#141519',
};

export function getMobSkins(type: string): MobSkins {
  const cached = skinCache.get(type);
  if (cached) return cached;
  let skins: MobSkins;
  if (type.startsWith('sheep')) {
    const color = type.split(':')[1] ?? 'white';
    skins = buildSheep(color);
  } else
  switch (type) {
    case 'pig': skins = buildPig(); break;
    case 'cow': skins = buildCow('cow'); break;
    case 'mooshroom': skins = buildCow('mooshroom_red'); break;
    case 'mooshroom_brown': skins = buildCow('mooshroom_brown'); break;
    case 'chicken': skins = buildChicken(); break;
    case 'zombie': skins = buildZombie(); break;
    case 'creeper': skins = buildCreeper(); break;
    case 'skeleton': skins = buildSkeleton(); break;
    case 'spider': skins = buildSpider(); break;
    case 'enderman': skins = buildEnderman(); break;
    case 'villager': skins = buildVillager(); break;
    case 'witch': skins = buildWitch(); break;
    case 'golem': skins = buildGolem(); break;
    default: skins = buildPig();
  }
  skinCache.set(type, skins);
  return skins;
}

// ── PIG: head(0,0)8x8x8 · body(28,8)10x16x8 · leg(0,16)4x6x4 ─────────────────
function buildPig(): MobSkins {
  return {
    head: p('pig', 64, 32, 0, 0, 8, 8, 8),
    body: p('pig', 64, 32, 28, 8, 10, 16, 8),
    limb: p('pig', 64, 32, 0, 16, 4, 6, 4),
  };
}

// ── COW / MOOSHROOM: head(0,0)8x8x6 · body(18,4)12x18x10 · leg(0,16)4x12x4 ───
function buildCow(tex: string): MobSkins {
  return {
    head: p(tex, 64, 32, 0, 0, 8, 8, 6),
    body: p(tex, 64, 32, 18, 4, 12, 18, 10),
    limb: p(tex, 64, 32, 0, 16, 4, 12, 4),
  };
}

// ── SHEEP: two layers (skin + fleece) like vanilla; color = runtime tint ─────
// body model: head(0,0)6x6x6 · body(28,8)8x16x6 · leg(0,16)4x12x4
function buildSheep(color = 'white'): MobSkins {
  const dye = SHEEP_COLORS[color] ?? SHEEP_COLORS.white;
  const white = color === 'white';
  const fleeceFile = 'sheep_fur';
  const skinFile = 'sheep_body';
  return {
    // skin layer: vanilla sheep skin, lightly tinted with the dye so the
    // sheared look keeps the sheep's color (user requirement — Task 32)
    head: white ? p(skinFile, 64, 32, 0, 0, 6, 6, 6) : tintP(skinFile, 64, 32, dye, 0.4, 0, 0, 6, 6, 6),
    body: white ? p(skinFile, 64, 32, 28, 8, 8, 16, 6) : tintP(skinFile, 64, 32, dye, 0.4, 28, 8, 8, 16, 6),
    limb: white ? p(skinFile, 64, 32, 0, 16, 4, 12, 4) : tintP(skinFile, 64, 32, dye, 0.4, 0, 16, 4, 12, 4),
    fur: {
      head: white ? p(fleeceFile, 64, 32, 0, 0, 6, 6, 6) : tintP(fleeceFile, 64, 32, dye, 1, 0, 0, 6, 6, 6),
      body: white ? p(fleeceFile, 64, 32, 28, 8, 8, 16, 6) : tintP(fleeceFile, 64, 32, dye, 1, 28, 8, 8, 16, 6),
      limb: white ? p(fleeceFile, 64, 32, 0, 16, 4, 12, 4) : tintP(fleeceFile, 64, 32, dye, 1, 0, 16, 4, 12, 4),
      inflate: 0.12,
    },
  };
}

// ── CHICKEN: head(0,0)4x6x3 · body(0,9)6x8x6 · beak(14,0)4x2x2 · wattle(14,4)2x2x2
// legs are runtime-tinted orange by vanilla → baked orange texture here
function buildChicken(): MobSkins {
  const legs = tintP('chicken', 64, 32, '#E0A020', 1, 14, 16, 2, 5, 2);
  return {
    head: p('chicken', 64, 32, 0, 0, 4, 6, 3),
    body: p('chicken', 64, 32, 0, 9, 6, 8, 6),
    limb: legs,
    legsBaked: legs,
    extra: p('chicken', 64, 32, 14, 0, 4, 2, 2),
    extra2: p('chicken', 64, 32, 14, 4, 2, 2, 2),
    wing: p('chicken', 64, 32, 24, 13, 1, 8, 6),
  };
}

// ── ZOMBIE (64x64): head(0,0)8x8x8 · body(16,16)8x12x4 · leg(0,16) · arm(40,16)
function buildZombie(): MobSkins {
  return {
    head: p('zombie', 64, 64, 0, 0, 8, 8, 8),
    body: p('zombie', 64, 64, 16, 16, 8, 12, 4),
    limb: p('zombie', 64, 64, 0, 16, 4, 12, 4),
    limb2: p('zombie', 64, 64, 40, 16, 4, 12, 4),
  };
}

// ── SKELETON (64x32): same layout, thin 2x12x2 limbs ─────────────────────────
function buildSkeleton(): MobSkins {
  return {
    head: p('skeleton', 64, 32, 0, 0, 8, 8, 8),
    body: p('skeleton', 64, 32, 16, 16, 8, 12, 4),
    limb: p('skeleton', 64, 32, 0, 16, 2, 12, 2),
    limb2: p('skeleton', 64, 32, 40, 16, 2, 12, 2),
  };
}

// ── CREEPER: head(0,0)8x8x8 · body(16,16)8x12x4 · leg(0,16)4x6x4 ─────────────
function buildCreeper(): MobSkins {
  return {
    head: p('creeper', 64, 32, 0, 0, 8, 8, 8),
    body: p('creeper', 64, 32, 16, 16, 8, 12, 4),
    limb: p('creeper', 64, 32, 0, 16, 4, 6, 4),
  };
}

// ── SPIDER: head(0,0)8x8x8 · body(0,12)10x8x10 · leg(18,3)16x2x2 ─────────────
function buildSpider(): MobSkins {
  return {
    head: p('spider', 64, 32, 0, 0, 8, 8, 8),
    body: p('spider', 64, 32, 0, 12, 10, 8, 10),
    limb: p('spider', 64, 32, 18, 3, 16, 2, 2),
  };
}

// ── ENDERMAN: head(0,0)8x8x8 (eyes on front); body/limbs from solid black area
function buildEnderman(): MobSkins {
  return {
    head: p('enderman', 64, 32, 0, 0, 8, 8, 8),
    body: p('enderman', 64, 32, 32, 20, 8, 8, 2),
    limb: p('enderman', 64, 32, 54, 20, 2, 8, 2),
    limb2: p('enderman', 64, 32, 54, 20, 2, 8, 2),
  };
}

// ── VILLAGER (64x64): head(0,0)8x10x8 · nose(24,0)2x4x2 · body(16,20)8x12x6 ·
// leg(0,22)4x12x4 · arm(44,22)2x12x2 ─────────────────────────────────────────
function buildVillager(): MobSkins {
  return {
    head: p('villager', 64, 64, 0, 0, 8, 10, 8),
    head2: p('villager', 64, 64, 24, 0, 2, 4, 2),
    body: p('villager', 64, 64, 16, 20, 8, 12, 6),
    limb: p('villager', 64, 64, 0, 22, 4, 12, 4),
    limb2: p('villager', 64, 64, 44, 22, 2, 12, 2),
  };
}

// ── WITCH (64x128): villager layout + hat pieces from the hat texture areas ──
function buildWitch(): MobSkins {
  return {
    head: p('witch', 64, 128, 0, 0, 8, 10, 8),
    head2: p('witch', 64, 128, 24, 0, 2, 4, 2),
    body: p('witch', 64, 128, 16, 20, 8, 12, 6),
    limb: p('witch', 64, 128, 0, 22, 4, 12, 4),
    limb2: p('witch', 64, 128, 44, 22, 2, 12, 2),
    hat: p('witch', 64, 128, 0, 44, 6, 1, 6),
    hat1: p('witch', 64, 128, 26, 44, 4, 4, 4),
    hat2: p('witch', 64, 128, 44, 44, 3, 3, 3),
    hat3: p('witch', 64, 128, 54, 46, 2, 4, 2),
  };
}

// ── IRON GOLEM (128x128): head(0,0)8x10x8 · body(0,40)18x12x11 ·
// arm(60,21)4x30x2 · leg(0,70)4x8x4 ──────────────────────────────────────────
function buildGolem(): MobSkins {
  return {
    head: p('iron_golem', 128, 128, 0, 0, 8, 10, 8),
    head2: p('iron_golem', 128, 128, 10, 8, 2, 4, 2),
    body: p('iron_golem', 128, 128, 0, 40, 18, 12, 11),
    limb: p('iron_golem', 128, 128, 0, 70, 4, 8, 4),
    limb2: p('iron_golem', 128, 128, 60, 21, 4, 30, 2),
  };
}

// re-export for mobs.ts convenience
export type { MobSkinPart, BoxUVLayout };
