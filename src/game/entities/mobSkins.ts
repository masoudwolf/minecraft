// ─── Mob skins: real Minecraft vanilla entity textures + standard box UVs ───
// Rebuilt (post-reset) on top of vanillaSkins.ts. Each part carries the
// official texture and its Minecraft model box definition (texOffs + dims),
// so every face samples the exact vanilla pixels — pixel-perfect by
// construction, no hand-extracted texel data to drift out of alignment.
import * as THREE from 'three';
import { vanillaTex, tintedTex, boxCrossTex, type MobSkinPart, type BoxUVLayout, type TintRegion } from './vanillaSkins';

export interface MobSkins {
  head: MobSkinPart;
  /** long nose (villager/witch/golem) OR enderman inner hat layer */
  head2?: MobSkinPart;
  /** pig snout (rendered as a child of the head, like MC) */
  snout?: MobSkinPart;
  body: MobSkinPart;
  /** spider thorax (6×6×6 neck cube between head and abdomen) */
  thorax?: MobSkinPart;
  limb: MobSkinPart;
  /** arms when they use a different region than legs (zombie/skeleton/villager/golem) */
  limb2?: MobSkinPart;
  /** villager/witch folded-arms bridge box (40,38) */
  armBridge?: MobSkinPart;
  /** golem LEFT arm/leg use their own mirrored regions */
  armL?: MobSkinPart;
  legL?: MobSkinPart;
  /** golem hip skirt (0,70) */
  skirt?: MobSkinPart;
  /** snow golem lower body (0,36) 12×12×12 */
  lower?: MobSkinPart;
  /** snow golem stick arms (32,0) 12×2×2 */
  armStick?: MobSkinPart;
  /** cow udder (52,0) 4×6×1 — a box on the body part, vanilla-style */
  udder?: MobSkinPart;
  /** cow horns (22,0) 1×3×1 */
  horns?: MobSkinPart;
  /** witch nose wart (0,0) 1×1×1 */
  mole?: MobSkinPart;
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

// ─── Sheep dye palette (vanilla DyeColor texture-diffuse colors, 1.19.4+) ───
export const SHEEP_COLORS: Record<string, string> = {
  white: '#F9F9F9',
  light_gray: '#A0A7A7',
  gray: '#595A62',
  brown: '#75502E',
  black: '#19191B',
};

export function getMobSkins(type: string): MobSkins {
  const cached = skinCache.get(type);
  if (cached) return cached;
  let skins: MobSkins;
  if (type.startsWith('sheep')) {
    const color = type.split(':')[1] ?? 'white';
    skins = buildSheep(color);
  } else if (type.startsWith('snowgolem')) {
    const variant = type.split(':')[1] ?? 'pumpkin';
    skins = buildSnowGolem(variant);
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

// ── PIG: head(0,0)8x8x8 · snout(16,16)4x3x1 · body(28,8)10x16x8 · leg(0,16)4x6x4
function buildPig(): MobSkins {
  return {
    head: p('pig', 64, 32, 0, 0, 8, 8, 8),
    snout: p('pig', 64, 32, 16, 16, 4, 3, 1),
    body: p('pig', 64, 32, 28, 8, 10, 16, 8),
    limb: p('pig', 64, 32, 0, 16, 4, 6, 4),
  };
}

// ── COW / MOOSHROOM: head(0,0)8x8x6 · body(18,4)12x18x10 · leg(0,16)4x12x4 ───
// + udder(52,0)4x6x1 (a separate box ON the body part, vanilla CowModel) and
// horns(22,0)1x3x1 on the head. The body box is VERTICAL in vanilla and
// rotated 90°X — the builder handles the rotation, we just carry the layout.
function buildCow(tex: string): MobSkins {
  return {
    head: p(tex, 64, 32, 0, 0, 8, 8, 6),
    body: p(tex, 64, 32, 18, 4, 12, 18, 10),
    limb: p(tex, 64, 32, 0, 16, 4, 12, 4),
    udder: p(tex, 64, 32, 52, 0, 4, 6, 1),
    horns: p(tex, 64, 32, 22, 0, 1, 3, 1),
  };
}

// ── SHEEP: two layers (skin + fleece) like vanilla; dye = FLEECE ONLY ───────
// VANILLA SheepModel geometry (verified from 1.20 source + texture scan):
// skin head = 6x6x8 (texOffs(0,0)) — the FRONT 2px is the face plate and it
// PROTRUDES past the wool; fleece head = 6x6x6 (sheep_fur (0,0)) covering the
// BACK 6px, shifted 2px back. That protruding face is how vanilla shows the
// sheep's eyes/muzzle — no transparency tricks. Fleece body (28,8) 8x16x6
// inflate 1.75/side; fleece legs (0,16) 4x6x4 (upper half only).
// DYEING (vanilla SheepFurLayer): the fleece layer is tinted with the sheep's
// color. USER RULE (head wool must take the dye too): the skin head also has
// WOOL texels — its top/side/back faces (sampled by the protruding rim) and
// the face plate's FOREHEAD row are wool-white in vanilla and stayed white on
// colored sheep ("پشم قسمت صورت سفیده"). For non-white variants the skin head
// gets a REGION-LIMITED tint: wool faces + forehead row take the dye, the
// face skin / eyes / muzzle stay vanilla.
const SHEEP_HEAD_WOOL_REGIONS: TintRegion[] = [
  [8, 0, 6, 8],   // head top face (6×8)
  [14, 0, 6, 8],  // head bottom face
  [0, 8, 8, 6],   // head right side
  [14, 8, 8, 6],  // head left side
  [22, 8, 6, 6],  // head back
  [8, 8, 6, 6, 'wool'], // face plate: per-texel — wool forehead + wool muzzle-frame corners take the dye; eyes/skin/nose stay vanilla
];

function buildSheep(color = 'white'): MobSkins {
  const dye = SHEEP_COLORS[color] ?? SHEEP_COLORS.white;
  const white = color === 'white';
  const fleeceFile = 'sheep_fur';
  const skinFile = 'sheep_body';
  return {
    head: white
      ? p(skinFile, 64, 32, 0, 0, 6, 6, 8)
      : { tex: tintedTex(skinFile, dye, 1, SHEEP_HEAD_WOOL_REGIONS), lay: { u: 0, v: 0, w: 6, h: 6, d: 8 }, texW: 64, texH: 32 },
    body: p(skinFile, 64, 32, 28, 8, 8, 16, 6),
    limb: p(skinFile, 64, 32, 0, 16, 4, 12, 4),
    fur: {
      head: white ? p(fleeceFile, 64, 32, 0, 0, 6, 6, 6) : tintP(fleeceFile, 64, 32, dye, 1, 0, 0, 6, 6, 6),
      body: white ? p(fleeceFile, 64, 32, 28, 8, 8, 16, 6) : tintP(fleeceFile, 64, 32, dye, 1, 28, 8, 8, 16, 6),
      limb: white ? p(fleeceFile, 64, 32, 0, 16, 4, 6, 4) : tintP(fleeceFile, 64, 32, dye, 1, 0, 16, 4, 6, 4),
      inflate: 0.03125, // fleece legs inflate 0.5px/side (vanilla)
    },
  };
}

// ── CHICKEN: head(0,0)4x6x3 · body(0,9)6x8x6 · beak(14,0)4x2x2 · wattle(14,4)2x2x2
// legs are runtime-tinted orange by vanilla → baked orange texture here
function buildChicken(): MobSkins {
  // leg region h=4: rows 16..22 opaque (row 23 of the body cross is padding)
  const legs = tintP('chicken', 64, 32, '#E0A020', 1, 14, 16, 2, 4, 2);
  return {
    head: p('chicken', 64, 32, 0, 0, 4, 6, 3),
    body: p('chicken', 64, 32, 0, 9, 6, 8, 6),
    limb: legs,
    legsBaked: legs,
    extra: p('chicken', 64, 32, 14, 0, 4, 2, 2),
    extra2: p('chicken', 64, 32, 14, 4, 2, 2, 2),
    wing: p('chicken', 64, 32, 24, 13, 1, 3, 6),
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

// ── SPIDER (vanilla SpiderModel 1.20, verified against the source): ──────────
// head(32,4)8x8x8 (red eyes front) · thorax(0,0)6x6x6 · abdomen(0,12)10x8x12 ·
// legs(18,0)16x2x2 — ONE box per leg (16 long, 2×2), 8 of them, fanned by
// yRot ±45°/±22.5° and tilted down by zRot 45°/33° (builder implements).
// The old regions (head (0,0) 8x8x6, legs (28,14)) sampled wrong texels —
// that's where "eyes on the legs" and the cut-off body came from.
function buildSpider(): MobSkins {
  return {
    head: p('spider', 64, 32, 32, 4, 8, 8, 8),
    thorax: p('spider', 64, 32, 0, 0, 6, 6, 6),
    body: p('spider', 64, 32, 0, 12, 10, 8, 12),
    limb: p('spider', 64, 32, 18, 0, 16, 2, 2),
  };
}

// ── ENDERMAN (vanilla EndermanModel 1.20, from source): head(0,0)8x8x8 with an
// inner "hat" layer(0,16)8x8x8 inflate −0.5 (the mouth shows through the head's
// transparent bottom-front rows — that IS the vanilla jaw look);
// body(32,16)8x12x4 · arms/legs(56,0)2x30x2 (30px limbs!)
function buildEnderman(): MobSkins {
  return {
    head: p('enderman', 64, 32, 0, 0, 8, 8, 8),
    head2: p('enderman', 64, 32, 0, 16, 8, 8, 8),
    body: p('enderman', 64, 32, 32, 16, 8, 12, 4),
    limb: p('enderman', 64, 32, 56, 0, 2, 30, 2),
    limb2: p('enderman', 64, 32, 56, 0, 2, 30, 2),
  };
}

// ── VILLAGER (64x64, vanilla VillagerModel from source): head(0,0)8x10x8 ·
// nose(24,0)2x4x2 · body(16,20)8x12x6 · robe legs(0,22)4x12x4 ·
// ARMS: ONE folded assembly = two 4x8x4 boxes (44,22) + bridge 8x4x4 (40,38),
// all in a group rotated x=−0.75 (the classic clasped-hands pose)
function buildVillager(): MobSkins {
  return {
    head: p('villager', 64, 64, 0, 0, 8, 10, 8),
    head2: p('villager', 64, 64, 24, 0, 2, 4, 2),
    body: p('villager', 64, 64, 16, 20, 8, 12, 6),
    limb: p('villager', 64, 64, 0, 22, 4, 12, 4),
    limb2: p('villager', 64, 64, 44, 22, 4, 8, 4),
    armBridge: p('villager', 64, 64, 40, 38, 8, 4, 4),
  };
}

// ── WITCH (64x128, vanilla WitchModel from source): villager layout exactly
// (arms = folded 4x8x4 + bridge) + nested hat chain: brim(0,64)10x2x10 →
// hat2(0,76)7x4x7 → hat3(0,87)4x4x4 → tip(0,95)1x2x1, each tilted a bit more
// (the classic bent witch hat), + a wart (mole) on the nose
function buildWitch(): MobSkins {
  return {
    head: p('witch', 64, 128, 0, 0, 8, 10, 8),
    head2: p('witch', 64, 128, 24, 0, 2, 4, 2),
    body: p('witch', 64, 128, 16, 20, 8, 12, 6),
    limb: p('witch', 64, 128, 0, 22, 4, 12, 4),
    limb2: p('witch', 64, 128, 44, 22, 4, 8, 4),
    armBridge: p('witch', 64, 128, 40, 38, 8, 4, 4),
    hat: p('witch', 64, 128, 0, 64, 10, 2, 10),
    hat1: p('witch', 64, 128, 0, 76, 7, 4, 7),
    hat2: p('witch', 64, 128, 0, 87, 4, 4, 4),
    hat3: p('witch', 64, 128, 0, 95, 1, 2, 1),
    mole: p('witch', 64, 128, 0, 0, 1, 1, 1),
  };
}

// ── IRON GOLEM (128x128, vanilla IronGolemModel from source): head(0,0)8x10x8
// + nose(24,0)2x4x2 · body(0,40)18x12x11 + hip skirt(0,70)9x5x6 inflate 0.5 ·
// arms 4x30x6 at (60,21) right / (60,58) left (box offset 13px out) ·
// legs 6x16x5 at (37,0) right / (60,0) left — NOT 6x24x6; the old (60,27) leg
// region + sunk-in pivots were why the legs went up into the body.
function buildGolem(): MobSkins {
  return {
    head: p('iron_golem', 128, 128, 0, 0, 8, 10, 8),
    head2: p('iron_golem', 128, 128, 24, 0, 2, 4, 2),
    body: p('iron_golem', 128, 128, 0, 40, 18, 12, 11),
    skirt: p('iron_golem', 128, 128, 0, 70, 9, 5, 6),
    limb: p('iron_golem', 128, 128, 37, 0, 6, 16, 5),
    legL: p('iron_golem', 128, 128, 60, 0, 6, 16, 5),
    limb2: p('iron_golem', 128, 128, 60, 21, 4, 30, 6),
    armL: p('iron_golem', 128, 128, 60, 58, 4, 30, 6),
  };
}

// ── SNOW GOLEM (64x64, vanilla SnowGolemModel from source): head(0,0)8x8x8
// inflate −0.5 (coal face on the plain variant) · upper body(0,16)10x10x10 ·
// LOWER body(0,36)12x12x12 (the wide snow base!) · stick arms(32,0)12x2x2 —
// REAL stick texture region, not a solid color. 'pumpkin' variant head: the
// carved FACE only on the FRONT (+Z) — every other face is the plain pumpkin
// side/top (like the placed carved-pumpkin block; face-on-all-sides was the
// user-reported bug).
function buildSnowGolem(variant = 'pumpkin'): MobSkins {
  const head: MobSkinPart = variant === 'plain'
    ? p('snow_golem', 64, 64, 0, 0, 8, 8, 8)
    : { tex: boxCrossTex('pumpkin_top', 'pumpkin_side', 'carved_pumpkin'), lay: { u: 0, v: 0, w: 8, h: 8, d: 8 }, texW: 64, texH: 32 };
  return {
    head,
    body: p('snow_golem', 64, 64, 0, 16, 10, 10, 10),
    lower: p('snow_golem', 64, 64, 0, 36, 12, 12, 12),
    armStick: p('snow_golem', 64, 64, 32, 0, 12, 2, 2),
    limb: p('snow_golem', 64, 64, 0, 16, 10, 10, 10), // unused (no legs)
  };
}

// re-export for mobs.ts convenience
export type { MobSkinPart, BoxUVLayout };
