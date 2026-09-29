// ─── Mobs: box-model entities, AI, spawning, combat ──────────────────────────
import * as THREE from 'three';
import { moveEntity, type AABBEntity } from '../physics';
import { BLOCK, isWaterId } from '../blocks';
import { getMobSkins, type MobSkinPart, type MobSkins } from './mobSkins';
import { boxUV, type BoxUVOptions } from './vanillaSkins';
import { audio } from '../audio';
import { ITEM } from '../items';

export type MobType = 'pig' | 'cow' | 'sheep' | 'chicken' | 'zombie' | 'creeper' | 'skeleton' | 'spider' | 'enderman' | 'villager' | 'witch' | 'mooshroom' | 'golem' | 'snowgolem';

interface MobDef {
  hostile: boolean;
  width: number;
  height: number;
  health: number;
  speed: number;
  /** contact/attack damage to player */
  damage: number;
  drops: { id: number; min: number; max: number }[];
  sound: 'oink' | 'moo' | 'baa' | 'cluck' | 'groan' | 'hiss' | 'rattle' | 'spider' | 'enderman' | 'villager' | 'witch' | 'mooshroom' | 'golem';
  /** spiders are neutral in daylight (still hostile in dark / when provoked) */
  neutralInDay?: boolean;
  /** spiders climb walls when chasing */
  climbs?: boolean;
  /** endermen teleport */
  teleports?: boolean;
  builder: (skins: ReturnType<typeof getMobSkins>) => MobParts;
}

export interface MobParts {
  group: THREE.Group;
  head: THREE.Mesh;
  legs: THREE.Mesh[];
  arms: THREE.Mesh[];
  materials: THREE.MeshLambertMaterial[];
  shadow: THREE.Mesh;
}

interface Mob extends AABBEntity {
  type: MobType;
  def: MobDef;
  group: THREE.Group;
  parts: MobParts;
  health: number;
  yaw: number;
  targetYaw: number;
  state: 'idle' | 'walk' | 'flee' | 'chase';
  stateTimer: number;
  walkPhase: number;
  hurtT: number;
  attackCd: number;
  ambientCd: number;
  burnTimer: number;
  burning: boolean;
  fuse: number;          // creeper
  /** enderman: has been provoked (stared at / hit) */
  provoked: boolean;
  /** enderman teleport cooldown */
  teleportCd: number;
  /** enderman water damage tick */
  waterHurtT: number;
  /** sheep wool color variant ('' = default white) */
  variant: string;
  dead: boolean;
  deathT: number;
  wanderX: number;
  wanderZ: number;
  /** base state tint (hurt red / creeper flash / enderman purple) before world light */
  tintR: number;
  tintG: number;
  tintB: number;
  /** smoothed world-light factor applied over the base tint (night realism) */
  lightF: number;
  lastAppliedF: number;
}

/** serialized mob for world saves */
export interface SavedMob {
  type: string;
  x: number; y: number; z: number;
  health: number;
  yaw: number;
  /** sheep wool color variant (white/light_gray/gray/brown/black) */
  variant?: string;
}

interface Arrow {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  stuck: number;
  mesh: THREE.Mesh;
  /** player-shot arrow: hits mobs, sticks are pickupable */
  fromPlayer: boolean;
  /** damage on hit (player arrows) */
  dmg: number;
}

/** witch splash potion projectile */
interface Potion {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  mesh: THREE.Mesh;
}

// ─── Model builders (vanilla textures + MC box-UV mapping) ───────────────────
/** Build a box mesh textured from a vanilla skin part via standard MC box UVs.
 *  Cutout (alphaTest) so vanilla transparent texels (ribcage gaps, fleece face)
 *  render as holes instead of black; DoubleSide so thin parts show both sides. */
function boxPart(p: MobSkinPart, w: number, h: number, d: number, tag: string, opts?: BoxUVOptions): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  boxUV(geo, p.lay, p.texW, p.texH, opts);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: p.tex, alphaTest: 0.35, side: THREE.DoubleSide }));
  mesh.userData.part = tag;
  return mesh;
}

/** Collect a mesh's material(s) into the parts list (per-instance tint/light). */
function collectMats(list: THREE.MeshLambertMaterial[], mesh: THREE.Mesh): void {
  const m = mesh.material as THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
  if (Array.isArray(m)) list.push(...m);
  else list.push(m);
}

/**
 * Leg with a proper HIP PIVOT (Minecraft-style limb rigging): the pivot Group
 * sits at the hip joint (top of the leg) and the leg box hangs BELOW it, so
 * animating pivot.rotation.x swings the leg from the top — like MC. `furPart`
 * optionally adds an inflated fleece box (sheep) that rides the swing; like
 * vanilla, the fleece leg wraps only the UPPER HALF of the leg.
 */
function legPivot(p: MobSkinPart, w: number, h: number, d: number, hipX: number, hipY: number, hipZ: number, side = 0, furPart?: { part: MobSkinPart; inflate: number }): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(hipX, hipY, hipZ);
  pivot.userData.side = side;
  const leg = boxPart(p, w, h, d, 'limb');
  leg.position.y = -h / 2; // hang from the hip
  pivot.add(leg);
  if (furPart) {
    const f = furPart.inflate;
    const furH = h * 0.5 + f * 2;
    const fur = boxPart(furPart.part, w + f * 2, furH, d + f * 2, 'fur');
    leg.add(fur);
    fur.position.y = h / 2 - furH / 2 + f * 0.5; // top-aligned wrap
  }
  return pivot;
}

const solidTexCache = new Map<string, THREE.Texture>();
/** Tiny solid-color texture — lets plain-colored parts (bow, stick arms) ride
 *  the shared map+white-color material pipeline (world-light tinting safe). */
function solidTex(hex: string): THREE.Texture {
  const hit = solidTexCache.get(hex);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 2; c.height = 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  solidTexCache.set(hex, t);
  return t;
}

function cutoutMat(hex: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: solidTex(hex), alphaTest: 0.35, side: THREE.DoubleSide });
}

/** Simple boxy Minecraft-style bow: curved limbs + string. Shoots toward the
 *  belly side (-X of the group); attach with rotation.y = π/2 to shoot +Z. */
function buildBow(): THREE.Group {
  const g = new THREE.Group();
  const wood = cutoutMat('#6b4d2a');
  const woodLight = cutoutMat('#8a683c');
  const str = cutoutMat('#e8e8e8');
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), wood);
  g.add(grip);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), woodLight);
  upper.position.set(0.05, 0.2, 0);
  upper.rotation.z = 0.5;
  g.add(upper);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), woodLight);
  lower.position.set(0.05, -0.2, 0);
  lower.rotation.z = -0.5;
  g.add(lower);
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.5, 0.015), str);
  string.position.set(0.1, 0, 0);
  g.add(string);
  return g;
}

function makeShadow(radius: number, scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

function quadruped(skins: MobSkins, opts: {
  headY: number; headZ: number; headW: number; headH: number; headD: number;
  bodyY: number; bodyZ: number;
  legW: number; legH: number; legX: number; legZHind: number; legZFront: number;
  shadowR: number;
  fur?: { head: MobSkinPart; body: MobSkinPart; limb: MobSkinPart; inflate: number };
  udder?: MobSkinPart;
  horns?: MobSkinPart;
}): MobParts {
  const px = 1 / 16;
  const group = new THREE.Group();
  const mats: THREE.MeshLambertMaterial[] = [];
  // VANILLA body construction (CowModel/PigModel/SheepModel): the body box is
  // built VERTICAL (lay.w × lay.h × lay.d) with its UV cross laid out for that
  // orientation, then rotated 90° about X. Reproducing the rotation puts every
  // texel where vanilla puts it: the front region becomes the BELLY (udder
  // lands rear-under), the back region becomes the spine, top/bottom regions
  // become the chest/rump caps. Building it horizontal was the bug that
  // rendered the cow's udder on its chest under the head.
  const bl = skins.body.lay;
  const body = boxPart(skins.body, bl.w * px, bl.h * px, bl.d * px, 'body');
  body.rotation.x = Math.PI / 2;
  body.position.set(0, opts.bodyY, opts.bodyZ);
  group.add(body);
  if (opts.fur) {
    // fleece body: vanilla SheepFurModel inflate 1.75/side (+3.5px every axis);
    // same vertical+rotated construction so the UVs ride along
    const fl = opts.fur.body.lay;
    const furBody = boxPart(opts.fur.body, (fl.w + 3.5) * px, (fl.h + 3.5) * px, (fl.d + 3.5) * px, 'fur');
    furBody.rotation.x = Math.PI / 2;
    body.add(furBody);
    collectMats(mats, furBody);
  }
  if (opts.udder) {
    // vanilla CowModel udder: a 4×6×1 box ON the body part's local front face;
    // after the 90° rotation it hangs under the REAR of the belly (vanilla)
    const ul = opts.udder.lay;
    const udder = boxPart(opts.udder, ul.w * px, ul.h * px, ul.d * px, 'udder');
    udder.position.set(0, -6 * px, 5.5 * px);
    body.add(udder);
    collectMats(mats, udder);
  }
  const head = boxPart(skins.head, opts.headW, opts.headH, opts.headD, 'head');
  head.position.set(0, opts.headY, opts.headZ);
  group.add(head);
  if (opts.fur) {
    // fleece head: 6×6×6 (+0.6px/side) covering the BACK 6px of the 8px-deep
    // skin head — the skin's front 2px face plate PROTRUDES past the wool
    // (vanilla SheepFurModel geometry), so the eyes/muzzle show without any
    // transparency tricks
    const fl = opts.fur.head.lay;
    const furHead = boxPart(opts.fur.head, (fl.w + 1.2) * px, (fl.h + 1.2) * px, (fl.d + 1.2) * px, 'fur');
    furHead.position.set(0, 0, -1 * px);
    head.add(furHead);
    collectMats(mats, furHead);
  }
  if (opts.horns) {
    // vanilla cow horns: 1×3×1 boxes at the head's upper corners
    for (const sx of [-1, 1]) {
      const horn = boxPart(opts.horns, 1 * px, 3 * px, 1 * px, 'horn');
      horn.position.set(sx * 4.5 * px, 3.5 * px, 0.5 * px);
      head.add(horn);
      collectMats(mats, horn);
    }
  }
  const legs: THREE.Mesh[] = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    // vanilla hip: the pivot IS the vanilla leg pivot (body-bottom height) and
    // the leg hangs exactly to the ground — no gap, swings from the top
    const z = sz === -1 ? opts.legZFront : opts.legZHind;
    const pivot = legPivot(skins.limb, opts.legW, opts.legH, opts.legW, sx * opts.legX, opts.legH, z, sx,
      opts.fur ? { part: opts.fur.limb, inflate: opts.fur.inflate } : undefined);
    group.add(pivot);
    legs.push(pivot as unknown as THREE.Mesh);
  }
  for (const mesh of [body, head]) collectMats(mats, mesh);
  for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
  return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
}

function humanoid(skins: MobSkins, thin = false): MobParts {
  const lw = thin ? 0.16 : 0.25;
  const aw = thin ? 0.14 : 0.22;
  const group = new THREE.Group();
  const mats: THREE.MeshLambertMaterial[] = [];
  const body = boxPart(skins.body, 0.5, 0.72, 0.26, 'body');
  body.position.y = 1.1;
  group.add(body);
  const head = boxPart(skins.head, 0.5, 0.5, 0.5, 'head');
  head.position.y = 1.72;
  group.add(head);
  const legs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pivot = legPivot(skins.limb, lw, 0.74, lw, sx * 0.125, 0.74, 0, sx);
    group.add(pivot);
    legs.push(pivot as unknown as THREE.Mesh);
  }
  const arms: THREE.Mesh[] = [];
  const armPart = skins.limb2 ?? skins.limb;
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (0.25 + aw / 2), 1.42, 0);
    const arm = boxPart(armPart, aw, 0.7, aw, 'limb');
    arm.position.y = -0.32;
    pivot.add(arm);
    group.add(pivot);
    arms.push(arm);
    (arm as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
  }
  for (const mesh of [body, head]) collectMats(mats, mesh);
  for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
  for (const arm of arms) collectMats(mats, arm);
  return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
}

// ─── Mob definitions ─────────────────────────────────────────────────────────
/** Standalone model builder (Asset Viewer / QA): no world needed. */
export function buildMobModel(type: string, variant?: string): MobParts | null {
  const base = (type === 'mooshroom_brown' ? 'mooshroom' : type) as MobType;
  const def = MOB_DEFS[base];
  if (!def) return null;
  const skins = getMobSkins(variant ? `${type}:${variant}` : type);
  const parts = def.builder(skins);
  return parts;
}

const MOB_DEFS: Record<MobType, MobDef> = {
  pig: {
    hostile: false, width: 0.9, height: 0.9, health: 10, speed: 1.1, damage: 0,
    drops: [{ id: ITEM.PORKCHOP, min: 1, max: 2 }], sound: 'oink',
    builder: (s) => {
      // vanilla PigModel: head 8³ pivot(0,12,−6) · body 10×16×8 rotated ·
      // legs 4×6×4 pivot 18px · snout 4×3×1 protruding 1px in front of the face
      const parts = quadruped(s, { headY: 0.75, headZ: 0.625, headW: 0.5, headH: 0.5, headD: 0.5, bodyY: 0.625, bodyZ: 0, legW: 0.25, legH: 0.375, legX: 0.1875, legZHind: -0.4375, legZFront: 0.3125, shadowR: 0.45 });
      if (s.snout) {
        const snout = boxPart(s.snout, 0.25, 0.1875, 0.0625, 'snout');
        snout.position.set(0, -0.09375, 0.28125);
        parts.head.add(snout);
        collectMats(parts.materials, snout);
      }
      return parts;
    },
  },
  cow: {
    hostile: false, width: 0.9, height: 1.4, health: 10, speed: 1.0, damage: 0,
    drops: [{ id: ITEM.BEEF, min: 1, max: 2 }, { id: ITEM.LEATHER, min: 0, max: 2 }], sound: 'moo',
    // vanilla CowModel: head 8×8×6 + 1×3×1 horns · body 12×18×10 rotated (with
    // the udder box hanging under the rear belly) · legs 4×12×4 pivot 12px
    builder: (s) => quadruped(s, { headY: 1.25, headZ: 0.6875, headW: 0.5, headH: 0.5, headD: 0.375, bodyY: 1.0625, bodyZ: -0.0625, legW: 0.25, legH: 0.75, legX: 0.25, legZHind: -0.4375, legZFront: 0.375, shadowR: 0.5, udder: s.udder, horns: s.horns }),
  },
  sheep: {
    hostile: false, width: 0.9, height: 1.3, health: 8, speed: 1.05, damage: 0,
    drops: [{ id: ITEM.MUTTON, min: 1, max: 2 }, { id: BLOCK.WOOL, min: 1, max: 2 }], sound: 'baa',
    // vanilla SheepModel: head 6×6×8 (face plate protrudes past the wool) ·
    // body 8×16×6 rotated · legs 4×12×4 · fleece layer (see quadruped)
    builder: (s) => quadruped(s, { headY: 1.1875, headZ: 0.625, headW: 0.375, headH: 0.375, headD: 0.5, bodyY: 0.9375, bodyZ: 0, legW: 0.25, legH: 0.75, legX: 0.1875, legZHind: -0.4375, legZFront: 0.3125, shadowR: 0.48, fur: s.fur }),
  },
  chicken: {
    hostile: false, width: 0.4, height: 0.7, health: 4, speed: 0.9, damage: 0,
    drops: [{ id: ITEM.CHICKEN_RAW, min: 1, max: 1 }, { id: ITEM.FEATHER, min: 0, max: 2 }], sound: 'cluck',
    // proper BIPEDAL bird: 2 legs (not the quadruped's 4!), 3D beak + wattle,
    // side wings that flap while airborne (MC chicken)
    builder: (s) => {
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 0.38, 0.38, 0.5, 'body');
      body.position.y = 0.5;
      group.add(body);
      const head = boxPart(s.head, 0.26, 0.26, 0.26, 'head');
      head.position.set(0, 0.78, 0.3);
      group.add(head);
      // 3D beak + red wattle: CHILDREN OF THE HEAD (they follow head bob/turn,
      // vanilla-style) — beak protrudes from the face, wattle hangs below it
      const beak = boxPart(s.extra!, 0.12, 0.07, 0.09, 'beak');
      beak.position.set(0, 0.01, 0.155);
      head.add(beak);
      const wattle = boxPart(s.extra2!, 0.08, 0.1, 0.05, 'wattle');
      wattle.position.set(0, -0.075, 0.145);
      head.add(wattle);
      // TWO legs with hip pivots slightly INSIDE the body (top-hidden swing)
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = legPivot(s.legsBaked ?? s.limb, 0.06, 0.41, 0.06, sx * 0.06, 0.41, 0.07, sx);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      // wings folded at the sides — exposed via parts.arms so the animator
      // can flap them while the chicken is airborne
      const arms: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * (0.19 + 0.03), 0.62, 0);
        pivot.userData.side = sx;
        const wing = boxPart(s.wing ?? s.body, 0.06, 0.28, 0.36, 'wing');
        wing.position.y = -0.14;
        pivot.add(wing);
        group.add(pivot);
        arms.push(wing);
        (wing as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
      }
      for (const mesh of [body, head, beak, wattle]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      for (const wing of arms) collectMats(mats, wing);
      return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  zombie: {
    hostile: true, width: 0.6, height: 1.95, health: 20, speed: 1.9, damage: 3,
    drops: [{ id: ITEM.ROTTEN_FLESH, min: 1, max: 2 }], sound: 'groan',
    builder: (s) => humanoid(s),
  },
  creeper: {
    hostile: true, width: 0.6, height: 1.7, health: 20, speed: 1.6, damage: 0,
    drops: [], sound: 'hiss',
    builder: (s) => {
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 0.5, 0.78, 0.32, 'body');
      body.position.y = 0.76;
      group.add(body);
      const head = boxPart(s.head, 0.52, 0.52, 0.52, 'head');
      head.position.y = 1.42;
      group.add(head);
      const legs: THREE.Mesh[] = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const pivot = legPivot(s.limb, 0.24, 0.38, 0.24, sx * 0.14, 0.38, sz * 0.18, sx);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      for (const mesh of [body, head]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  skeleton: {
    hostile: true, width: 0.6, height: 1.95, health: 20, speed: 1.7, damage: 0,
    drops: [
      { id: ITEM.ARROW, min: 0, max: 2 },
      { id: ITEM.BONE, min: 0, max: 2 },
    ], sound: 'rattle',
    builder: (s) => {
      const parts = humanoid(s, true);
      // vanilla skeleton carries a BOW in the right hand; the animator raises
      // that arm when aiming (state === 'chase')
      const bow = buildBow();
      bow.position.set(0, -0.5, 0.05);
      bow.rotation.y = Math.PI / 2;
      const rightArm = parts.arms[1];
      rightArm.add(bow);
      for (const child of bow.children) collectMats(parts.materials, child as THREE.Mesh);
      const pv = (rightArm as unknown as { limbPivot?: THREE.Group }).limbPivot;
      if (pv) pv.userData.bowArm = true;
      return parts;
    },
  },
  spider: {
    hostile: true, width: 1.25, height: 0.9, health: 16, speed: 2.15, damage: 2,
    drops: [{ id: ITEM.STRING, min: 1, max: 2 }, { id: ITEM.SPIDER_EYE, min: 0, max: 1 }], sound: 'spider',
    neutralInDay: true, climbs: true,
    // VANILLA SpiderModel (from 1.20 source): thorax 6³ + abdomen 10×8×12 +
    // head 8³ (face at (32,4)) + 8 SINGLE-BOX legs 16×2×2 (region (18,0))
    // fanned ±45°/±22.5° and tilted down 45°/33°
    builder: (s) => {
      const px = 1 / 16;
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const thorax = boxPart(s.thorax!, 6 * px, 6 * px, 6 * px, 'thorax');
      thorax.position.set(0, 0.5625, 0);
      group.add(thorax);
      const abdomen = boxPart(s.body, 10 * px, 8 * px, 12 * px, 'body');
      abdomen.position.set(0, 0.5625, -0.5625);
      group.add(abdomen);
      const head = boxPart(s.head, 0.5, 0.5, 0.5, 'head');
      head.position.set(0, 0.5625, 0.4375);
      group.add(head);
      // legs: vanilla pivots (±4px, 15px, z 2/1/0/−1), yRot fan + zRot tilt
      // (converted: our rotY/rotZ = −MC rotY/rotZ); walk phases stored for the
      // animator (hind 0, midHind π, midFront π/2, front 3π/2)
      const legDefs = [
        { z: 2, y: Math.PI / 4, zr: -Math.PI / 4, phase: 0 },
        { z: 1, y: Math.PI / 8, zr: -0.58119464, phase: Math.PI },
        { z: 0, y: -Math.PI / 8, zr: -0.58119464, phase: Math.PI / 2 },
        { z: -1, y: -Math.PI / 4, zr: -Math.PI / 4, phase: (3 * Math.PI) / 2 },
      ];
      const legs: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        const isRight = side === -1; // right legs extend −X (vanilla box(−15,…))
        for (const d of legDefs) {
          const pivot = new THREE.Group();
          pivot.position.set(side * 0.25, 0.5625, -d.z * px);
          const baseY = isRight ? -d.y : d.y;
          const baseZ = isRight ? -d.zr : d.zr;
          pivot.rotation.y = baseY;
          pivot.rotation.z = baseZ;
          pivot.userData.baseY = baseY;
          pivot.userData.baseZ = baseZ;
          pivot.userData.phase = d.phase;
          pivot.userData.side = isRight ? 1 : -1;
          const leg = boxPart(s.limb, 16 * px, 2 * px, 2 * px, 'limb');
          leg.position.set(isRight ? -7 * px : 7 * px, 0, 0);
          pivot.add(leg);
          group.add(pivot);
          legs.push(pivot as unknown as THREE.Mesh);
        }
      }
      for (const mesh of [thorax, abdomen, head]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  enderman: {
    hostile: true, width: 0.55, height: 2.75, health: 40, speed: 2.9, damage: 4,
    drops: [{ id: ITEM.ENDER_PEARL, min: 1, max: 1 }], sound: 'enderman',
    teleports: true, neutralInDay: true,
    // VANILLA EndermanModel (from 1.20 source): body 8×12×4 at (32,16), head 8³
    // + inner hat layer 8³ (−0.5) whose texels fill the head's transparent
    // mouth rows (the vanilla jaw look), limbs 2×30×2 at (56,0) — 30px long
    builder: (s) => {
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 0.5, 0.75, 0.25, 'body');
      body.position.y = 2.0;
      group.add(body);
      const head = boxPart(s.head, 0.5, 0.5, 0.5, 'head');
      head.position.y = 2.5625;
      group.add(head);
      if (s.head2) {
        const inner = boxPart(s.head2, 0.4375, 0.4375, 0.4375, 'hat');
        head.add(inner);
        collectMats(mats, inner);
      }
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = legPivot(s.limb, 0.125, 1.8125, 0.125, sx * 0.125, 1.8125, 0, sx);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      const arms: THREE.Mesh[] = [];
      const armPart = s.limb2 ?? s.limb;
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.3125, 2.25, 0);
        const arm = boxPart(armPart, 0.125, 1.875, 0.125, 'limb');
        arm.position.y = -0.8125;
        pivot.add(arm);
        group.add(pivot);
        arms.push(arm);
        (arm as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
      }
      for (const mesh of [body, head]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      for (const arm of arms) collectMats(mats, arm);
      return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  villager: {
    hostile: false, width: 0.6, height: 1.95, health: 20, speed: 0.85, damage: 0,
    drops: [], sound: 'villager',
    // VANILLA VillagerModel: robe torso + head 8×10×8 + nose child + FOLDED
    // ARMS — one assembly (two 4×8×4 arm boxes + 8×4×4 bridge, region (44,22)
    // / (40,38)) rotated −0.75 rad forward so the hands clasp in front; robe
    // legs (0,22) 4×12×4
    builder: (s) => {
      const px = 1 / 16;
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 0.5, 0.75, 0.375, 'body');
      body.position.y = 1.125;
      group.add(body);
      const head = boxPart(s.head, 0.5, 0.625, 0.5, 'head');
      head.position.y = 1.8125;
      group.add(head);
      const nose = boxPart(s.head2!, 0.125, 0.25, 0.125, 'nose');
      nose.position.set(0, -0.375, 0.3125);
      head.add(nose);
      const armsG = new THREE.Group();
      armsG.position.set(0, 1.3125, 0.0625);
      armsG.rotation.x = -0.75;
      group.add(armsG);
      const armL = boxPart(s.limb2!, 0.25, 0.5, 0.25, 'arm');
      armL.position.set(-0.375, -0.125, 0);
      armsG.add(armL);
      const armR = boxPart(s.limb2!, 0.25, 0.5, 0.25, 'arm');
      armR.position.set(0.375, -0.125, 0);
      armsG.add(armR);
      const bridge = boxPart(s.armBridge!, 0.5, 0.25, 0.25, 'arm');
      bridge.position.set(0, -0.25, 0);
      armsG.add(bridge);
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = legPivot(s.limb, 0.25, 0.75, 0.25, sx * 0.125, 0.75, 0, sx);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      for (const mesh of [body, head, nose, armL, armR, bridge]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  witch: {
    hostile: true, width: 0.6, height: 1.95, health: 26, speed: 1.5, damage: 0,
    drops: [
      { id: ITEM.STICK, min: 0, max: 2 },
      { id: ITEM.SPIDER_EYE, min: 0, max: 1 },
    ], sound: 'witch',
    // ranged caster: keeps distance and lobs splash potions (poison on hit)
    // VANILLA WitchModel: villager layout (folded arms!) + nested hat chain
    // brim(0,64)10×2×10 → hat2(0,76)7×4×7 → hat3(0,87)4×4×4 → tip(0,95)1×2×1,
    // each tier tilted a bit more (the bent hat), + a wart on the nose
    builder: (s) => {
      const px = 1 / 16;
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 0.5, 0.75, 0.375, 'body');
      body.position.y = 1.125;
      group.add(body);
      const head = boxPart(s.head, 0.5, 0.625, 0.5, 'head');
      head.position.y = 1.8125;
      group.add(head);
      const nose = boxPart(s.head2!, 0.125, 0.25, 0.125, 'nose');
      nose.position.set(0, -0.375, 0.3125);
      head.add(nose);
      if (s.mole) {
        const mole = boxPart(s.mole, 0.75 * px, 0.75 * px, 0.75 * px, 'mole');
        mole.position.set(0.5 * px, -2.5 * px, 1.25 * px);
        nose.add(mole);
        collectMats(mats, mole);
      }
      // folded arms (vanilla villager assembly)
      const armsG = new THREE.Group();
      armsG.position.set(0, 1.3125, 0.0625);
      armsG.rotation.x = -0.75;
      group.add(armsG);
      const armL = boxPart(s.limb2!, 0.25, 0.5, 0.25, 'arm');
      armL.position.set(-0.375, -0.125, 0);
      armsG.add(armL);
      const armR = boxPart(s.limb2!, 0.25, 0.5, 0.25, 'arm');
      armR.position.set(0.375, -0.125, 0);
      armsG.add(armR);
      const bridge = boxPart(s.armBridge!, 0.5, 0.25, 0.25, 'arm');
      bridge.position.set(0, -0.25, 0);
      armsG.add(bridge);
      // hat chain (vanilla pivots/rotations, converted to our axes)
      const brim = boxPart(s.hat!, 0.625, 0.125, 0.625, 'hat');
      brim.position.set(0, 4.03125 * px, 0);
      head.add(brim);
      const hat2G = new THREE.Group();
      hat2G.position.set(-3.25 * px, 9.03125 * px, 3 * px);
      hat2G.rotation.set(-0.05235988, 0, -0.02617994);
      head.add(hat2G);
      const tier2 = boxPart(s.hat1!, 0.4375, 0.25, 0.4375, 'hat');
      tier2.position.set(3.5 * px, -2 * px, -3.5 * px);
      hat2G.add(tier2);
      const hat3G = new THREE.Group();
      hat3G.position.set(1.75 * px, 4 * px, -2 * px);
      hat3G.rotation.set(-0.10471976, 0, -0.05235988);
      hat2G.add(hat3G);
      const tier3 = boxPart(s.hat2!, 0.25, 0.25, 0.25, 'hat');
      tier3.position.set(2 * px, -2 * px, -2 * px);
      hat3G.add(tier3);
      const hat4G = new THREE.Group();
      hat4G.position.set(1.75 * px, 2 * px, -2 * px);
      hat4G.rotation.set(-0.20943952, 0, -0.10471976);
      hat3G.add(hat4G);
      const tip = boxPart(s.hat3!, 1.5 * px, 2.5 * px, 1.5 * px, 'hat');
      tip.position.set(0.5 * px, -1 * px, -0.5 * px);
      hat4G.add(tip);
      // robe legs (0,22)
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = legPivot(s.limb, 0.25, 0.75, 0.25, sx * 0.125, 0.75, 0, sx);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      for (const mesh of [body, head, nose, armL, armR, bridge, brim, tier2, tier3, tip]) collectMats(mats, mesh);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  mooshroom: {
    hostile: false, width: 0.9, height: 1.4, health: 10, speed: 1.0, damage: 0,
    drops: [{ id: ITEM.BEEF, min: 1, max: 2 }, { id: ITEM.LEATHER, min: 0, max: 2 }], sound: 'mooshroom',
    // same vanilla CowModel geometry as the cow (udder box included)
    builder: (s) => quadruped(s, { headY: 1.25, headZ: 0.6875, headW: 0.5, headH: 0.5, headD: 0.375, bodyY: 1.0625, bodyZ: -0.0625, legW: 0.25, legH: 0.75, legX: 0.25, legZHind: -0.4375, legZFront: 0.375, shadowR: 0.5, udder: s.udder, horns: s.horns }),
  },
  golem: {
    // village defender: passive to players, hunts hostile mobs (MC iron golem)
    hostile: false, width: 1.3, height: 2.7, health: 100, speed: 1.35, damage: 0,
    drops: [{ id: ITEM.IRON_INGOT, min: 3, max: 5 }], sound: 'golem',
    // VANILLA IronGolemModel (from 1.20 source): torso 18×12×11 + hip skirt
    // 9×5×6(+0.5) · head 8×10×8 + nose child · arms 4×30×6 hanging from the
    // spine with 13px offset · legs 6×16×5 pivoting at the body BOTTOM (13px)
    builder: (s) => {
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const body = boxPart(s.body, 1.125, 0.75, 0.6875, 'body');
      body.position.set(0, 1.6875, 0.03125);
      group.add(body);
      if (s.skirt) {
        const skirt = boxPart(s.skirt, 0.625, 0.375, 0.4375, 'skirt');
        skirt.position.set(0, 1.15625, 0);
        group.add(skirt);
        collectMats(mats, skirt);
      }
      const head = boxPart(s.head, 0.5, 0.625, 0.5, 'head');
      head.position.set(0, 2.375, 0.21875);
      group.add(head);
      const nose = boxPart(s.head2!, 0.125, 0.25, 0.125, 'nose');
      nose.position.set(0, -0.25, 0.3125);
      head.add(nose);
      const arms: THREE.Mesh[] = [];
      for (const [sx, part] of [[-1, s.armL ?? s.limb2 ?? s.limb], [1, s.limb2 ?? s.limb]] as const) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.6875, 1.9375, 0);
        const arm = boxPart(part, 0.25, 1.875, 0.375, 'limb');
        arm.position.y = -0.78125;
        pivot.add(arm);
        group.add(pivot);
        arms.push(arm);
        (arm as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
      }
      const legs: THREE.Mesh[] = [];
      for (const [sx, part] of [[-1, s.legL ?? s.limb], [1, s.limb]] as const) {
        const pivot = new THREE.Group();
        pivot.position.set(sx === -1 ? -0.25 : 0.3125, 0.8125, 0);
        const leg = boxPart(part, 0.375, 1.0, 0.3125, 'limb');
        leg.position.set(-0.03125, -0.3125, 0.03125);
        pivot.add(leg);
        group.add(pivot);
        legs.push(pivot as unknown as THREE.Mesh);
      }
      for (const mesh of [body, head, nose]) collectMats(mats, mesh);
      for (const arm of arms) collectMats(mats, arm);
      for (const pv of legs) for (const child of (pv as unknown as THREE.Group).children) collectMats(mats, child as THREE.Mesh);
      return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  snowgolem: {
    // buildable snow golem (MC): VANILLA SnowGolemModel — lower body 12³ (the
    // wide snow base), upper body 10³, head 8³ (−0.5, coal face / carved
    // pumpkin), two stick arms (32,0) 12×2×2 angled down-outward. NO legs.
    // variant 'pumpkin' (default) wears the carved pumpkin; 'plain' is sheared.
    hostile: false, width: 0.7, height: 1.75, health: 4, speed: 0.8, damage: 0,
    drops: [{ id: ITEM.SNOWBALL, min: 0, max: 15 }], sound: 'golem',
    builder: (s) => {
      const px = 1 / 16;
      const group = new THREE.Group();
      const mats: THREE.MeshLambertMaterial[] = [];
      const lower = boxPart(s.lower ?? s.body, 0.75, 0.75, 0.75, 'body');
      lower.position.set(0, 0.375, 0);
      group.add(lower);
      const body = boxPart(s.body, 0.625, 0.625, 0.625, 'body');
      body.position.set(0, 1.0, 0);
      group.add(body);
      const head = boxPart(s.head, 0.4375, 0.4375, 0.4375, 'head');
      head.position.set(0, 1.5, 0);
      group.add(head);
      // stick arms: vanilla rotZ 1.0 → droop down-outward from the upper body
      const arms: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.3125, 1.125, -sx * 0.0625);
        pivot.rotation.z = -sx * 1.0;
        const arm = boxPart(s.armStick!, 0.75, 0.125, 0.125, 'arm');
        arm.position.set(sx * 0.3125, -0.0625, 0);
        pivot.add(arm);
        group.add(pivot);
        arms.push(arm);
        (arm as unknown as { limbPivot: THREE.Group }).limbPivot = pivot;
      }
      for (const mesh of [lower, body, head]) collectMats(mats, mesh);
      for (const arm of arms) collectMats(mats, arm);
      return { group, head, legs: [], arms, materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
};

// ─── Ray vs AABB (slab method) ───────────────────────────────────────────────
export interface MobHit { mob: Mob; dist: number }

function rayAABB(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, e: AABBEntity, maxDist: number): number | null {
  const half = e.width / 2;
  const minX = e.x - half, maxX = e.x + half;
  const minY = e.y, maxY = e.y + e.height;
  const minZ = e.z - half, maxZ = e.z + half;
  let tmin = 0;
  let tmax = maxDist;
  for (const [o, d, min, max] of [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < min || o > max) return null;
    } else {
      let t1 = (min - o) / d;
      let t2 = (max - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

// ─── MobManager ──────────────────────────────────────────────────────────────
export interface MobCallbacks {
  damagePlayer: (amount: number, fromX: number, fromZ: number) => void;
  /** witch splash potion: apply poison for N seconds (ticks 1 dmg / 1.5s, non-lethal) */
  poisonPlayer?: (seconds: number) => void;
  spawnDrop: (itemId: number, x: number, y: number, z: number) => void;
  spawnXP: (x: number, y: number, z: number, value: number) => void;
  explodeParticles: (x: number, y: number, z: number) => void;
  deathParticles: (x: number, y: number, z: number) => void;
  fireParticle: (x: number, y: number, z: number) => void;
  /** purple burst for enderman teleport (both ends) */
  teleportParticles: (x: number, y: number, z: number) => void;
  /** unit forward vector of the player's look direction (enderman stare check) */
  playerForward: { x: number; y: number; z: number };
  playerX: number;
  playerY: number;
  playerZ: number;
  /** creative players are ignored by hostile AI (like MC) */
  playerCreative: boolean;
  /** explosions chain-ignite TNT blocks in the blast (engine primes them) */
  igniteTnt?: (x: number, y: number, z: number) => void;
  /** a player arrow killed a mob — arg: distance from shooter (achievements) */
  killByPlayer?: (dist: number) => void;
}

export class MobManager {
  mobs: Mob[] = [];
  arrows: Arrow[] = [];
  potions: Potion[] = [];
  private scene: THREE.Scene;
  private world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void; getLight(x: number, y: number, z: number): number; getLightForMesh(x: number, y: number, z: number): number; biomeAt?(x: number, z: number): string };
  private spawnTimer = 0;
  private arrowMat: THREE.MeshLambertMaterial;
  private playerArrowMat: THREE.MeshLambertMaterial;
  private potionMat: THREE.MeshLambertMaterial;
  private time = 0;
  /** most recent callbacks (for hurt→teleport outside update loop) */
  private lastCb: MobCallbacks | null = null;

  constructor(scene: THREE.Scene, world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void; getLight(x: number, y: number, z: number): number; getLightForMesh(x: number, y: number, z: number): number; biomeAt?(x: number, z: number): string }) {
    this.scene = scene;
    this.world = world;
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    this.playerArrowMat = new THREE.MeshLambertMaterial({ color: 0xc8a06a });
    this.potionMat = new THREE.MeshLambertMaterial({ color: 0xa44fd8, transparent: true, opacity: 0.92 });
  }

  get count(): number {
    return this.mobs.length;
  }

  /** QA/testing helper: force-spawn a mob at position (variant for sheep) */
  debugSpawn(type: MobType, x: number, y: number, z: number, variant = ''): Mob | null {
    return this.spawn(type, x, y, z, variant);
  }

  clear(): void {
    for (const m of this.mobs) {
      this.scene.remove(m.group);
      this.scene.remove(m.parts.shadow);
    }
    this.mobs = [];
    for (const a of this.arrows) this.scene.remove(a.mesh);
    this.arrows = [];
    for (const p of this.potions) this.scene.remove(p.mesh);
    this.potions = [];
  }

  /** raycast mobs for attacks; returns nearest hit within reach */
  raycastMob(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, reach: number): MobHit | null {
    let best: MobHit | null = null;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = rayAABB(ox, oy, oz, dx, dy, dz, m, reach);
      if (t !== null && (!best || t < best.dist)) best = { mob: m, dist: t };
    }
    return best;
  }

  /** serialize live mobs for the world save (excludes dying) */
  serialize(): SavedMob[] {
    const out: SavedMob[] = [];
    for (const m of this.mobs) {
      if (m.dead) continue;
      out.push({
        type: m.type,
        x: +m.x.toFixed(2), y: +m.y.toFixed(2), z: +m.z.toFixed(2),
        health: Math.max(1, Math.round(m.health)),
        yaw: +m.yaw.toFixed(2),
        ...(m.variant ? { variant: m.variant } : {}),
      });
      if (out.length >= 28) break;
    }
    return out;
  }

  /** restore mobs from a save; suppresses the spawn burst right after */
  restore(list: SavedMob[]): void {
    for (const s of list) {
      if (!(s.type in MOB_DEFS)) continue;
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
      const m = this.spawn(s.type as MobType, s.x, s.y, s.z, s.variant ?? '');
      if (m) {
        m.health = Math.max(1, Math.min(m.def.health, Math.round(s.health)));
        m.yaw = Number.isFinite(s.yaw) ? s.yaw : m.yaw;
        m.targetYaw = m.yaw;
      }
    }
    this.spawnTimer = 6;
  }

  private spawn(type: MobType, x: number, y: number, z: number, variant = ''): Mob | null {
    const def = MOB_DEFS[type];
    const skinKey = variant && (type === 'sheep' || type === 'snowgolem') ? `${type}:${variant}` : type;
    const skins = getMobSkins(skinKey);
    const parts = def.builder(skins);
    // per-instance material clones so hurt tint is individual (array-aware: heads
    // use [plain×4, face] material arrays)
    const cloned = parts.materials.map((mm) => mm.clone());
    const mapping = new Map<THREE.Material, THREE.Material>();
    parts.materials.forEach((mm, i2) => mapping.set(mm, cloned[i2]));
    parts.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mm) => mapping.get(mm) ?? mm);
      } else if (mapping.has(mesh.material as THREE.Material)) {
        mesh.material = mapping.get(mesh.material) as THREE.Material;
      }
    });
    parts.materials = cloned;
    this.scene.add(parts.group);
    const shadow = makeShadow(def.width * 0.55, this.scene);
    const mob: Mob = {
      type, def,
      x, y, z, vx: 0, vy: 0, vz: 0,
      width: def.width, height: def.height,
      onGround: false, inWater: false,
      group: parts.group, parts,
      health: def.health,
      yaw: Math.random() * Math.PI * 2,
      targetYaw: 0,
      state: 'idle',
      stateTimer: 1 + Math.random() * 3,
      walkPhase: 0,
      hurtT: 0, attackCd: 0, ambientCd: 3 + Math.random() * 6,
      burnTimer: 0, burning: false,
      fuse: -1, dead: false, deathT: 0,
      provoked: false, teleportCd: 0, waterHurtT: 0,
      variant: type === 'sheep' ? (variant || 'white') : type === 'snowgolem' ? (variant || 'pumpkin') : '',
      wanderX: x, wanderZ: z,
      tintR: 1, tintG: 1, tintB: 1,
      lightF: 1, lastAppliedF: 1,
    };
    mob.targetYaw = mob.yaw;
    parts.shadow = shadow;
    this.mobs.push(mob);
    return mob;
  }

  private trySpawnMob(playerX: number, playerY: number, playerZ: number, sunLevel: number, passiveCount: number, hostileCount: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 26;
    const x = Math.floor(playerX + Math.cos(angle) * dist) + 0.5;
    const z = Math.floor(playerZ + Math.sin(angle) * dist) + 0.5;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    // find surface
    let sy = -1;
    for (let y = 95; y > 2; y--) {
      const id = this.world.getBlock(cx, y, cz);
      if (id !== 0 && !isWaterId(id)) {
        sy = y;
        break;
      }
    }
    if (sy < 3) return;
    const above = this.world.getBlock(cx, sy + 1, cz);
    const above2 = this.world.getBlock(cx, sy + 2, cz);
    if (above !== 0 || above2 !== 0) return;
    const groundId = this.world.getBlock(cx, sy, cz);
    if (isWaterId(groundId)) return;

    const l = this.world.getLight(cx, sy + 1, cz);
    if (l < 0) return;
    const skyL = l >> 4;
    const blkL = l & 15;
    const effLight = Math.max(blkL, skyL * sunLevel);

    // villagers live on village grounds (planks / cobblestone); mooshrooms on mycelium
    if (groundId === BLOCK.PLANKS || groundId === BLOCK.COBBLESTONE) {
      // swamp planks/cobble = witch hut grounds: keep a witch around (day or night)
      if (this.world.biomeAt?.(cx, cz) === 'swamp') {
        const witchCount = this.mobs.filter((m2) => m2.type === 'witch').length;
        if (witchCount < 1 && Math.random() < 0.3) {
          this.spawn('witch', x, sy + 1, z);
        }
        return;
      }
      // iron golem: at most one patrolling each village chunk roll
      const golemCount = this.mobs.filter((m2) => m2.type === 'golem').length;
      if (golemCount < 1 && Math.random() < 0.22 && skyL >= 9 && sunLevel > 0.55) {
        this.spawn('golem', x, sy + 1, z);
        return;
      }
      const villagerCount = this.mobs.filter((m) => m.type === 'villager').length;
      if (villagerCount < 5 && skyL >= 9 && sunLevel > 0.55) {
        const herd = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < herd; i++) this.spawn('villager', x + (Math.random() - 0.5) * 2, sy + 1, z + (Math.random() - 0.5) * 2);
      }
      return;
    }
    if (groundId === BLOCK.MYCELIUM) {
      const passiveNow = passiveCount + this.mobs.filter((m) => m.type === 'mooshroom').length;
      if (passiveNow < 12 && skyL >= 9 && sunLevel > 0.55) {
        const herd = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < herd; i++) this.spawn('mooshroom', x + (Math.random() - 0.5) * 3, sy + 1, z + (Math.random() - 0.5) * 3);
      }
      return;
    }

    const wantHostile = hostileCount < 12 && (effLight < 6);
    const wantPassive = passiveCount < 10 && skyL >= 9 && sunLevel > 0.55 && (groundId === BLOCK.GRASS || groundId === BLOCK.SNOW_GRASS);

    if (wantHostile && (!wantPassive || Math.random() < 0.65)) {
      const roll = Math.random();
      const isSwamp = this.world.biomeAt?.(cx, cz) === 'swamp';
      const type: MobType = roll < 0.32 ? 'zombie' : roll < 0.58 ? 'skeleton' : roll < 0.74 ? 'creeper' : roll < 0.86 ? 'spider' : roll < 0.95 && isSwamp ? 'witch' : 'enderman';
      this.spawn(type, x, sy + 1, z);
    } else if (wantPassive) {
      const roll = Math.random();
      // snowy ground → snow golems (pumpkin-headed, occasionally sheared)
      if (groundId === BLOCK.SNOW_GRASS && roll < 0.3) {
        this.spawn('snowgolem', x, sy + 1, z, Math.random() < 0.85 ? 'pumpkin' : 'plain');
        return;
      }
      const type: MobType = roll < 0.3 ? 'pig' : roll < 0.55 ? 'sheep' : roll < 0.8 ? 'cow' : 'chicken';
      // spawn small herd for passive
      const herd = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < herd; i++) {
        this.spawn(type, x + (Math.random() - 0.5) * 3, sy + 1, z + (Math.random() - 0.5) * 3, type === 'sheep' ? pickSheepVariant() : '');
      }
    }
  }

  hurtMob(mob: Mob, dmg: number, kx: number, kz: number, cb?: MobCallbacks): boolean {
    if (mob.dead) return false;
    mob.health -= dmg;
    mob.hurtT = 0.4;
    const len = Math.hypot(kx, kz) || 1;
    mob.vx += (kx / len) * 7;
    mob.vz += (kz / len) * 7;
    mob.vy = Math.max(mob.vy, 4.4);
    audio.mobHurt(mob.def.sound);
    if (mob.def.hostile) {
      mob.state = 'chase';
      if (mob.type === 'spider' || mob.type === 'enderman') mob.provoked = true;
    } else if (mob.type === 'golem') {
      // golems never flee — they stoically keep patrolling
      mob.state = 'idle';
    } else {
      mob.state = 'flee';
      mob.stateTimer = 4;
      mob.wanderX = mob.x + (mob.x - kx) * 10;
      mob.wanderZ = mob.z + (mob.z - kz) * 10;
    }
    // endermen often warp away when hurt (MC behavior)
    const ecb = cb ?? this.lastCb;
    if (mob.type === 'enderman' && !mob.dead && ecb && Math.random() < 0.55) {
      this.teleportNear(mob, mob.x, mob.z, 7, 15, ecb);
    }
    if (mob.health <= 0) {
      mob.dead = true;
      mob.deathT = 0.45;
      if (mob.type === 'creeper' && mob.fuse >= 0) mob.fuse = -1;
      return true;
    }
    return false;
  }

  /** enderman teleport: find a valid surface spot within [minR,maxR] of (cx,cz) */
  private teleportNear(m: Mob, cx: number, cz: number, minR: number, maxR: number, cb: MobCallbacks): boolean {
    const ox = m.x, oy = m.y, oz = m.z;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const x = Math.floor(cx + Math.cos(a) * r);
      const z = Math.floor(cz + Math.sin(a) * r);
      let sy = -1;
      for (let y = 95; y > 2; y--) {
        const id = this.world.getBlock(x, y, z);
        if (id !== 0 && !isWaterId(id)) { sy = y; break; }
      }
      if (sy < 3) continue;
      // head room for full height
      const top = Math.ceil(m.def.height);
      let clear = true;
      for (let yy = sy + 1; yy <= sy + top; yy++) {
        if (this.world.getBlock(x, yy, z) !== 0) { clear = false; break; }
      }
      if (!clear) continue;
      m.x = x + 0.5; m.y = sy + 1; m.z = z + 0.5;
      m.vx = 0; m.vy = 0; m.vz = 0;
      m.state = 'idle'; m.stateTimer = 1;
      cb.teleportParticles(ox, oy + m.height * 0.4, oz);
      cb.teleportParticles(m.x, m.y + m.height * 0.4, m.z);
      audio.enderTeleport();
      return true;
    }
    return false;
  }

  /** effective light (0..15) at a mob's position */
  private lightAt(m: Mob, sunLevel: number): number {
    const l = this.world.getLight(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z));
    if (l < 0) return 15;
    return Math.max(l & 15, (l >> 4) * sunLevel);
  }

  /** creeper explosion */
  private explode(x: number, y: number, z: number, cb: MobCallbacks): void {
    audio.boom();
    const R = 2.6;
    for (let bx = Math.floor(x - R); bx <= Math.floor(x + R); bx++)
      for (let by = Math.floor(y - R); by <= Math.floor(y + R); by++)
        for (let bz = Math.floor(z - R); bz <= Math.floor(z + R); bz++) {
          const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
          if (d > R) continue;
          const id = this.world.getBlock(bx, by, bz);
          if (id !== 0 && id !== BLOCK.BEDROCK && id !== BLOCK.WATER) {
            // chain reaction: TNT in the blast primes instead of vanishing
            if (id === BLOCK.TNT) {
              cb.igniteTnt?.(bx, by, bz);
              continue;
            }
            this.world.setBlock(bx, by, bz, 0);
          }
        }
    // damage nearby mobs (chain) + player
    for (const m of this.mobs) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - x, m.y - y, m.z - z);
      if (d < R * 2 && m.type !== 'creeper') {
        this.hurtMob(m, Math.max(1, Math.round(14 * (1 - d / (R * 2)))), m.x - x, m.z - z, cb);
      }
    }
    const pd = Math.hypot(cb.playerX - x, cb.playerY - y, cb.playerZ - z);
    if (pd < R * 2) {
      cb.damagePlayer(Math.max(1, Math.round(16 * (1 - pd / (R * 2)))), x, z);
    }
    cb.explodeParticles(x, y, z);
  }

  update(dt: number, player: AABBEntity & { eyeY(): number }, sunLevel: number, cb: MobCallbacks): void {
    this.time += dt;
    this.lastCb = cb;
    // ── spawning ──
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      let passive = 0, hostile = 0;
      for (const m of this.mobs) {
        if (m.def.hostile) hostile++; else passive++;
      }
      if (this.mobs.length < 22 && Math.random() < 0.5) {
        this.trySpawnMob(player.x, player.y, player.z, sunLevel, passive, hostile);
      }
    }

    // ── mobs ──
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const distToPlayer = Math.hypot(player.x - m.x, player.y - m.y, player.z - m.z);

      // despawn far / invalid: NaN or below-world positions never heal on their
      // own and NaN breaks the distance check (NaN > 64 === false), so mobs that
      // glitch out would otherwise persist forever
      if (
        distToPlayer > 64 ||
        !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z) ||
        m.y < -20
      ) {
        this.scene.remove(m.group);
        this.scene.remove(m.parts.shadow);
        this.mobs.splice(i, 1);
        continue;
      }

      // death animation
      if (m.dead) {
        m.deathT -= dt;
        m.group.rotation.z = Math.min(Math.PI / 2, m.group.rotation.z + dt * 6);
        this.setTint(m, 1, 0.35, 0.35);
        if (m.deathT <= 0) {
          for (const drop of m.def.drops) {
            const n = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
            // sheep drop wool matching their color variant
            const dropId = m.type === 'sheep' && drop.id === BLOCK.WOOL ? sheepWoolId(m.variant) : drop.id;
            for (let d = 0; d < n; d++) {
              cb.spawnDrop(dropId, m.x, m.y + 0.4, m.z);
            }
          }
          cb.spawnXP(m.x, m.y + 0.4, m.z, m.def.hostile ? 5 : 1 + Math.floor(Math.random() * 3));
          cb.deathParticles(m.x, m.y + m.height / 2, m.z);
          this.scene.remove(m.group);
          this.scene.remove(m.parts.shadow);
          this.mobs.splice(i, 1);
        }
        continue;
      }

      // hurt tint decay
      if (m.hurtT > 0) {
        m.hurtT -= dt;
        this.setTint(m, 1, 0.35, 0.35);
        if (m.hurtT <= 0) this.setTint(m, 1, 1, 1);
      }

      // ambient sound
      m.ambientCd -= dt;
      if (m.ambientCd <= 0 && distToPlayer < 18) {
        m.ambientCd = 5 + Math.random() * 9;
        audio.mobAmbient(m.def.sound, distToPlayer);
      }

      // ── AI ──
      m.attackCd -= dt;
      m.stateTimer -= dt;
      let moveSpeed = 0;
      let wantX = 0, wantZ = 0;

      // creative players are invisible to hostile AI: treat hostiles as passive wanderers
      const hostileActive = m.def.hostile && !cb.playerCreative;

      if (m.type === 'golem') {
        // ── iron golem: patrol, and charge the nearest hostile mob ──
        let prey: Mob | null = null;
        let preyDist = 11;
        for (const o of this.mobs) {
          if (o.dead || !o.def.hostile) continue;
          const d = Math.hypot(o.x - m.x, o.y - m.y, o.z - m.z);
          if (d < preyDist) { preyDist = d; prey = o; }
        }
        if (prey) {
          m.state = 'chase';
          const dx = prey.x - m.x;
          const dz = prey.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed;
          if (preyDist < 2.4 && m.attackCd <= 0) {
            m.attackCd = 1.5;
            // hammer blow: heavy damage + MC-style launch into the air
            this.hurtMob(prey, 9, dx, dz, cb);
            if (!prey.dead) {
              prey.vy = 8.5;
              prey.vx += (dx / len) * 5;
              prey.vz += (dz / len) * 5;
            }
            audio.golemSmash(preyDist);
            cb.explodeParticles(m.x + (dx / len) * 1.4, m.y + 1.9, m.z + (dz / len) * 1.4);
          }
        } else {
          // patrol: villager-style wander
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 4; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.45; }
          }
        }
      } else if (!hostileActive) {
        // passive
        if (m.state === 'flee') {
          const dx = m.x - player.x;
          const dz = m.z - player.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed * 1.7;
          if (m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
        } else if (m.state === 'walk') {
          const dx = m.wanderX - m.x;
          const dz = m.wanderZ - m.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.8 || m.stateTimer <= 0) {
            m.state = 'idle';
            m.stateTimer = 2 + Math.random() * 4;
          } else {
            wantX = dx / len; wantZ = dz / len;
            moveSpeed = m.def.speed;
          }
        } else {
          if (m.stateTimer <= 0) {
            m.state = 'walk';
            m.stateTimer = 4 + Math.random() * 5;
            const a = Math.random() * Math.PI * 2;
            const r = 3 + Math.random() * 6;
            m.wanderX = m.x + Math.cos(a) * r;
            m.wanderZ = m.z + Math.sin(a) * r;
          }
        }
      } else if (m.type === 'zombie') {
        // burn in sunlight
        this.updateBurning(m, dt, sunLevel, cb);
        if (distToPlayer < 24) {
          m.state = 'chase';
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed;
          if (distToPlayer < 1.7 && m.attackCd <= 0) {
            m.attackCd = 1.1;
            cb.damagePlayer(m.def.damage, m.x, m.z);
            audio.zombieAttack();
          }
        } else {
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.55; }
          }
        }
      } else if (m.type === 'skeleton') {
        this.updateBurning(m, dt, sunLevel, cb);
        if (distToPlayer < 17) {
          m.state = 'chase';
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          // keep distance ~8
          if (distToPlayer > 9.5) { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed; }
          else if (distToPlayer < 6) { wantX = -dx / len; wantZ = -dz / len; moveSpeed = m.def.speed * 0.8; }
          else {
            // strafe
            wantX = -dz / len * 0.6; wantZ = dx / len * 0.6;
            moveSpeed = m.def.speed * 0.5;
          }
          if (m.attackCd <= 0 && distToPlayer < 15) {
            m.attackCd = 2.2;
            this.shootArrow(m, player);
          }
        } else {
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.55; }
          }
        }
      } else if (m.type === 'witch') {
        // ranged caster: hold 5.5-9.5 blocks, strafe, lob splash potions
        if (distToPlayer < 15 && !cb.playerCreative) {
          m.state = 'chase';
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          if (distToPlayer > 9.5) { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed; }
          else if (distToPlayer < 5.5) { wantX = -dx / len; wantZ = -dz / len; moveSpeed = m.def.speed * 0.75; }
          else {
            wantX = -dz / len * 0.55; wantZ = dx / len * 0.55;
            moveSpeed = m.def.speed * 0.45;
          }
          if (m.attackCd <= 0 && distToPlayer < 14) {
            m.attackCd = 2.8;
            this.throwPotion(m, player);
          }
        } else {
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.55; }
          }
        }
      } else if (m.type === 'spider') {
        // spiders are neutral in bright light unless provoked (MC behavior)
        const light = this.lightAt(m, sunLevel);
        const aggressive = (m.provoked || light < 8) && !cb.playerCreative;
        if (aggressive && distToPlayer < 20) {
          m.state = 'chase';
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed;
          if (distToPlayer < 2.1 && m.attackCd <= 0) {
            m.attackCd = 1.2;
            cb.damagePlayer(m.def.damage, m.x, m.z);
            audio.zombieAttack();
          }
        } else {
          if (m.state === 'chase') { m.state = 'idle'; m.stateTimer = 2; }
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.5; }
          }
        }
      } else if (m.type === 'enderman') {
        // water burns endermen — take damage + warp out
        if (m.inWater) {
          m.waterHurtT += dt;
          if (m.waterHurtT > 1) {
            m.waterHurtT = 0;
            this.hurtMob(m, 1, 0, 0.01, cb);
          }
          if (!m.dead && Math.random() < 0.6) {
            this.teleportNear(m, cb.playerX, cb.playerZ, 8, 16, cb);
          }
        }
        if (m.dead) continue;
        // stare provocation: player looking at the enderman within ~13° cone
        if (!m.provoked && !cb.playerCreative) {
          const dx = m.x - cb.playerX;
          const dy = (m.y + m.height * 0.85) - (cb.playerY + 1.62);
          const dz = m.z - cb.playerZ;
          const len = Math.hypot(dx, dy, dz);
          if (len < 26 && len > 0.5) {
            const dot = (dx * cb.playerForward.x + dy * cb.playerForward.y + dz * cb.playerForward.z) / len;
            if (dot > 0.975) {
              m.provoked = true;
              m.teleportCd = 2;
              audio.enderStare();
            }
          }
        }
        if (m.provoked && !cb.playerCreative) {
          m.state = 'chase';
          m.teleportCd -= dt;
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed;
          if (distToPlayer < 2.2 && m.attackCd <= 0) {
            m.attackCd = 1.0;
            cb.damagePlayer(m.def.damage, m.x, m.z);
            audio.zombieAttack();
          }
          // reposition closer via warp when far
          if (m.teleportCd <= 0 && distToPlayer > 9) {
            m.teleportCd = 4 + Math.random() * 3;
            this.teleportNear(m, player.x, player.z, 4, 8, cb);
          }
        } else {
          m.teleportCd -= dt;
          if (m.teleportCd <= 0) {
            m.teleportCd = 12 + Math.random() * 14;
            // endermen dislike daylight — occasionally warp away
            if (sunLevel > 0.8 && Math.random() < 0.5) {
              this.teleportNear(m, m.x, m.z, 8, 18, cb);
            }
          }
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.4; }
          }
        }
      } else if (m.type === 'creeper') {
        if (m.fuse >= 0) {
          // fused: flash + wait
          m.fuse += dt;
          const flash = Math.sin(m.fuse * 22) > 0 ? 1 : 0;
          this.setTint(m, 1, 1 + flash * 1.2, 1 + flash * 1.2);
          if (distToPlayer > 5) {
            m.fuse = -1;
            this.setTint(m, 1, 1, 1);
          } else if (m.fuse > 1.5) {
            this.explode(m.x, m.y + 0.8, m.z, cb);
            this.scene.remove(m.group);
            this.scene.remove(m.parts.shadow);
            this.mobs.splice(i, 1);
            continue;
          }
        } else if (distToPlayer < 13) {
          m.state = 'chase';
          const dx = player.x - m.x;
          const dz = player.z - m.z;
          const len = Math.hypot(dx, dz) || 1;
          wantX = dx / len; wantZ = dz / len;
          moveSpeed = m.def.speed;
          if (distToPlayer < 2.4) {
            m.fuse = 0;
            audio.fuseHiss();
          }
        } else {
          wanderAI(m, dt);
          if (m.state === 'walk') {
            const dx = m.wanderX - m.x;
            const dz = m.wanderZ - m.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.8 || m.stateTimer <= 0) { m.state = 'idle'; m.stateTimer = 2 + Math.random() * 3; }
            else { wantX = dx / len; wantZ = dz / len; moveSpeed = m.def.speed * 0.55; }
          }
        }
      }

      // ── movement + physics ──
      const prevX = m.x, prevZ = m.z;
      if (moveSpeed > 0) {
        m.vx += (wantX * moveSpeed - m.vx) * Math.min(1, dt * 8);
        m.vz += (wantZ * moveSpeed - m.vz) * Math.min(1, dt * 8);
        m.targetYaw = Math.atan2(wantX, wantZ);
      } else {
        m.vx *= Math.pow(0.02, dt);
        m.vz *= Math.pow(0.02, dt);
      }
      m.vy -= 32 * dt;
      if (m.type === 'chicken') m.vy = Math.max(m.vy, -3.2);
      moveEntity(this.world, m, dt);

      // jump when blocked — spiders climb instead (even mid-wall while chasing)
      if (moveSpeed > 0) {
        const blockedXZ = Math.hypot(m.x - prevX, m.z - prevZ) < moveSpeed * dt * 0.3;
        if (blockedXZ) {
          if (m.def.climbs && m.state === 'chase') {
            m.vy = Math.max(m.vy, m.onGround ? 3.6 : 2.8);
          } else if (m.onGround) {
            m.vy = 8.4;
          }
        }
      }
      if (m.inWater) {
        m.vy = Math.max(m.vy, 1.8); // swim up
      }

      // ── visuals ──
      // smooth yaw
      let dyaw = m.targetYaw - m.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      m.yaw += dyaw * Math.min(1, dt * 8);
      m.group.position.set(m.x, m.y, m.z);
      m.group.rotation.y = m.yaw;

      // walk animation
      const hSpeed = Math.hypot(m.vx, m.vz);
      m.walkPhase += hSpeed * dt * 3.2;
      const swing = Math.sin(m.walkPhase * 2.4) * Math.min(1, hSpeed / m.def.speed) * 0.65;
      const legs = m.parts.legs;
      if (m.type === 'spider') {
        // vanilla SpiderModel scuttle: per-leg phase (hind 0, midHind π,
        // midFront π/2, front 3π/2), ySway = −cos(2ωt+φ)·0.4·amt (mirrored per
        // side), zBob = |sin(ωt+φ)|·0.4·amt — around the vanilla base pose
        const amt = Math.min(1, hSpeed / m.def.speed);
        for (let li = 0; li < legs.length; li++) {
          const pivot = legs[li] as unknown as THREE.Object3D & { userData: { baseY?: number; baseZ?: number; phase?: number; side?: number } };
          const ud = pivot.userData;
          const ph = ud.phase ?? 0;
          const sd = ud.side ?? 1;
          const ySway = -Math.cos(m.walkPhase * 1.3324 + ph) * 0.4 * amt * sd;
          const zBob = Math.abs(Math.sin(m.walkPhase * 0.6662 + ph) * 0.4) * amt * sd;
          pivot.rotation.y = (ud.baseY ?? 0) + ySway;
          pivot.rotation.z = (ud.baseZ ?? 0) + zBob;
        }
      } else if (legs.length === 4) {
        legs[0].rotation.x = swing;
        legs[3].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing;
      } else if (legs.length >= 2) {
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
      }
      // arms: zombie reaches forward; enderman hangs/swings (raised when provoked);
      // chicken wings flap while airborne
      for (const arm of m.parts.arms) {
        const pivot = (arm as unknown as { limbPivot?: THREE.Group }).limbPivot;
        if (!pivot) continue;
        if (m.type === 'chicken') {
          // wings fold against the body on the ground; flap fast while falling
          // (slow-fall glide). side -1 left / +1 right → mirror the z rotation
          const side = ((pivot.userData.side as number) || 1);
          const flap = !m.onGround ? Math.sin(this.time * 26) * 0.85 : 0;
          pivot.rotation.z = side * flap;
          pivot.rotation.x = 0;
          continue;
        }
        if (m.type === 'zombie') {
          pivot.rotation.x = -Math.PI / 2 + Math.sin(m.walkPhase * 2.4) * 0.12;
          pivot.rotation.z = Math.sin(m.walkPhase * 1.2) * 0.06;
        } else if (m.type === 'skeleton') {
          // bow arm raises to aim while chasing; the other swings gently
          const aiming = m.state === 'chase';
          if (pivot.userData.bowArm) {
            pivot.rotation.x = aiming ? -1.35 : Math.sin(m.walkPhase * 2.4) * 0.2;
            pivot.rotation.z = 0;
          } else {
            pivot.rotation.x = Math.sin(m.walkPhase * 2.4 + Math.PI) * (aiming ? 0.08 : 0.35);
            pivot.rotation.z = 0;
          }
        } else if (m.type === 'golem') {
          // heavy pendulum sway; raised when charging a target
          const raised = m.state === 'chase' ? -1.2 : 0;
          pivot.rotation.x = raised + Math.sin(m.walkPhase * 2.4 + (pivot === (m.parts.arms[0] as unknown as { limbPivot?: THREE.Group }).limbPivot ? 0 : Math.PI)) * 0.3;
          pivot.rotation.z = Math.sin(m.walkPhase * 1.2) * 0.05;
        } else if (m.type === 'enderman') {
          if (m.provoked) {
            pivot.rotation.x = -1.15 + Math.sin(m.walkPhase * 2.4) * 0.1;
            pivot.rotation.z = Math.sin(m.walkPhase * 1.2) * 0.04;
          } else {
            pivot.rotation.x = Math.sin(m.walkPhase * 2.4) * 0.35;
            pivot.rotation.z = 0;
          }
        }
      }
      // head bob
      m.parts.head.rotation.y = Math.sin(this.time * 0.7 + m.walkPhase) * 0.14;
      // enderman glows purple when provoked
      if (m.type === 'enderman' && m.hurtT <= 0) {
        if (m.provoked) this.setTint(m, 1, 0.72, 1.12);
        else this.setTint(m, 1, 1, 1);
      }

      // ── world-light shading: entities obey voxel light (night realism) ──
      // same formula as the terrain shader: brightness = max(blockLight, skyLight × sunLevel).
      // Mobs go dark on the surface at night, stay visible near torches, and are
      // near-black in unlit caves — instead of glowing under scene lights.
      {
        const lb = this.world.getLightForMesh(Math.floor(m.x), Math.floor(m.y + m.height * 0.7), Math.floor(m.z));
        const target = Math.max(0.1, Math.max((lb & 15) / 15, ((lb >> 4) / 15) * sunLevel));
        m.lightF += (target - m.lightF) * Math.min(1, dt * 6);
        if (Math.abs(m.lightF - m.lastAppliedF) > 0.004) {
          const f = m.lightF;
          for (const mm of m.parts.materials) mm.color.setRGB(m.tintR * f, m.tintG * f, m.tintB * f);
          m.lastAppliedF = f;
        }
      }

      // shadow
      m.parts.shadow.position.set(m.x, m.y + 0.03, m.z);
      const shadowScale = m.onGround ? 1 : Math.max(0.4, 1 - Math.min(1, Math.abs(m.vy) * 0.06));
      m.parts.shadow.scale.setScalar(shadowScale);

      // burning visual
      if (m.burning && Math.random() < dt * 12) {
        cb.fireParticle(m.x + (Math.random() - 0.5) * 0.5, m.y + Math.random() * m.height, m.z + (Math.random() - 0.5) * 0.5);
      }
    }

    // ── arrows ──
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0 || a.stuck > (a.fromPlayer ? 45 : 0.8)) {
        this.scene.remove(a.mesh);
        this.arrows.splice(i, 1);
        continue;
      }
      if (a.stuck > 0) {
        a.stuck += dt;
        // stuck player arrows are pickupable: walk near them to collect
        if (a.fromPlayer && a.stuck > 0.8) {
          const dxp = a.x - player.x, dyp = a.y - (player.y + player.height * 0.5), dzp = a.z - player.z;
          if (Math.hypot(dxp, dyp, dzp) < 1.5) {
            cb.spawnDrop(ITEM.ARROW, a.x, a.y, a.z);
            this.scene.remove(a.mesh);
            this.arrows.splice(i, 1);
            continue;
          }
        }
        continue;
      }
      // substepped movement so fast arrows can't tunnel through mobs/blocks
      const speedLen = Math.hypot(a.vx, a.vy, a.vz);
      const steps = Math.max(1, Math.ceil((speedLen * dt) / 0.45));
      const sdt = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        a.vy -= 18 * sdt;
        const nx = a.x + a.vx * sdt;
        const ny = a.y + a.vy * sdt;
        const nz = a.z + a.vz * sdt;
        // block hit
        const bid = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (bid !== 0) {
          a.stuck = 0.001;
          audio.arrowHit();
          done = true;
          break;
        }
        a.x = nx; a.y = ny; a.z = nz;
        if (a.fromPlayer) {
          // mob hit: point-in-expanded-AABB test per mob
          for (const m of this.mobs) {
            if (m.dead) continue;
            if (
              a.x > m.x - m.width / 2 - 0.15 && a.x < m.x + m.width / 2 + 0.15 &&
              a.y > m.y - 0.1 && a.y < m.y + m.height + 0.1 &&
              a.z > m.z - m.width / 2 - 0.15 && a.z < m.z + m.width / 2 + 0.15
            ) {
              const klen = Math.hypot(a.vx, a.vz) || 1;
              const shooterDist = Math.hypot(a.x - cb.playerX, a.y - cb.playerY, a.z - cb.playerZ);
              this.hurtMob(m, a.dmg, (a.vx / klen) * 4.5, (a.vz / klen) * 4.5, cb);
              // hurtMob sets dead=true immediately on lethal damage
              if (m.dead) cb.killByPlayer?.(shooterDist);
              a.life = 0;
              done = true;
              break;
            }
          }
          if (done) break;
        } else {
          // player hit
          const px = player.x, py = player.y + player.height * 0.5, pz = player.z;
          if (Math.hypot(a.x - px, a.y - py, a.z - pz) < 0.75) {
            cb.damagePlayer(3, a.x - a.vx, a.z - a.vz);
            a.life = 0;
            done = true;
            break;
          }
        }
      }
      if (done) continue;
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
    }

    // ── witch potions ──
    for (let i = this.potions.length - 1; i >= 0; i--) {
      const po = this.potions[i];
      po.life -= dt;
      po.vy -= 16 * dt;
      // substepped so fast potions can't tunnel through blocks
      const sp = Math.hypot(po.vx, po.vy, po.vz);
      const steps = Math.max(1, Math.ceil((sp * dt) / 0.4));
      const sdt = dt / steps;
      let shattered = false;
      for (let s = 0; s < steps && !shattered; s++) {
        po.x += po.vx * sdt;
        po.y += po.vy * sdt;
        po.z += po.vz * sdt;
        const bid = this.world.getBlock(Math.floor(po.x), Math.floor(po.y), Math.floor(po.z));
        if (bid !== 0 && !isWaterId(bid)) shattered = true;
      }
      const pd = Math.hypot(po.x - player.x, po.y - (player.y + 0.9), po.z - player.z);
      if (pd < 1.1) shattered = true; // direct hit
      if (shattered || po.life <= 0) {
        this.scene.remove(po.mesh);
        this.potions.splice(i, 1);
        if (shattered) {
          const shatterDist = Math.hypot(po.x - cb.playerX, po.y - cb.playerY, po.z - cb.playerZ);
          audio.potionShatter(shatterDist);
          cb.teleportParticles(po.x, po.y + 0.2, po.z); // purple magic splash
          // splash radius 2.6: damage + poison (MC splash lingering area)
          const pDist = Math.hypot(po.x - player.x, po.y - (player.y + 0.9), po.z - player.z);
          if (pDist < 2.6 && !cb.playerCreative) {
            cb.damagePlayer(Math.max(1, Math.round(4 * (1 - pDist / 2.6))), po.x, po.z);
            cb.poisonPlayer?.(4.5);
          }
        }
        continue;
      }
      po.mesh.position.set(po.x, po.y, po.z);
      po.mesh.rotation.x += dt * 7;
      po.mesh.rotation.z += dt * 4;
    }
  }

  /** witch lob: arc a splash potion toward the player */
  private throwPotion(m: Mob, player: AABBEntity & { eyeY(): number }): void {
    const ox = m.x, oy = m.y + 1.5, oz = m.z;
    const tx = player.x, ty = player.y + 0.9, tz = player.z;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const speed = 10;
    const lead = dist / speed;
    const vx = dx / dist * speed + (Math.random() - 0.5) * 0.7;
    const vz = dz / dist * speed + (Math.random() - 0.5) * 0.7;
    const vy = dy / dist * speed + lead * 8 + 1.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), this.potionMat);
    mesh.position.set(ox, oy, oz);
    this.scene.add(mesh);
    this.potions.push({ x: ox, y: oy, z: oz, vx, vy, vz, life: 6, mesh });
    audio.potionThrow(dist);
  }

  private updateBurning(m: Mob, dt: number, sunLevel: number, cb: MobCallbacks): void {
    const lx = Math.floor(m.x);
    const ly = Math.floor(m.y + 1);
    const lz = Math.floor(m.z);
    const light = this.world.getLight(lx, ly, lz);
    const skyL = light < 0 ? 0 : light >> 4;
    const inSunlight = skyL === 15 && sunLevel > 0.82;
    if (inSunlight) {
      m.burnTimer += dt;
      m.burning = true;
      if (m.burnTimer > 1) {
        m.burnTimer = 0;
        this.hurtMob(m, 1, 0, 0.01, cb);
      }
    } else {
      m.burning = false;
      m.burnTimer = 0;
    }
  }

  private shootArrow(m: Mob, player: AABBEntity & { eyeY(): number }): void {
    const ox = m.x;
    const oy = m.y + 1.5;
    const oz = m.z;
    const tx = player.x;
    const ty = player.eyeY() - 0.2;
    const tz = player.z;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const dist = Math.hypot(dx, dy, dz);
    const speed = 18;
    const lead = dist / speed;
    const vx = dx / dist * speed + (Math.random() - 0.5) * 1.2;
    const vy = dy / dist * speed + lead * 9 + (Math.random() - 0.5) * 0.8;
    const vz = dz / dist * speed + (Math.random() - 0.5) * 1.2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), this.arrowMat);
    mesh.position.set(ox, oy, oz);
    this.scene.add(mesh);
    this.arrows.push({ x: ox, y: oy, z: oz, vx, vy, vz, life: 8, stuck: 0, mesh, fromPlayer: false, dmg: 0 });
    audio.bowShoot(dist);
  }

  /** per-mob state tint (hurt red / creeper flash / enderman purple) × world light */
  private setTint(m: Mob, r: number, g: number, b: number): void {
    m.tintR = r; m.tintG = g; m.tintB = b;
    const f = m.lightF;
    for (const mm of m.parts.materials) mm.color.setRGB(r * f, g * f, b * f);
    m.lastAppliedF = f;
  }

  /** player-shot arrow (from bow). dx,dy,dz = unit direction. */
  shootPlayerArrow(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.6), this.playerArrowMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.arrows.push({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 20, stuck: 0, mesh, fromPlayer: true, dmg });
    audio.bowShoot(0);
  }
}

// ─── sheep color variants (MC-ish distribution) ─────────────────────────────
const SHEEP_VARIANTS: { name: string; weight: number }[] = [
  { name: 'white', weight: 0.82 },
  { name: 'light_gray', weight: 0.05 },
  { name: 'gray', weight: 0.05 },
  { name: 'brown', weight: 0.05 },
  { name: 'black', weight: 0.03 },
];

function pickSheepVariant(): string {
  const r = Math.random();
  let acc = 0;
  for (const v of SHEEP_VARIANTS) {
    acc += v.weight;
    if (r < acc) return v.name;
  }
  return 'white';
}

function sheepWoolId(variant: string): number {
  switch (variant) {
    case 'light_gray': return BLOCK.WOOL_LIGHT_GRAY;
    case 'gray': return BLOCK.WOOL_GRAY;
    case 'brown': return BLOCK.WOOL_BROWN;
    case 'black': return BLOCK.WOOL_BLACK;
    default: return BLOCK.WOOL;
  }
}

/** idle<->walk transitions for hostile mobs far from player */
function wanderAI(m: Mob, _dt: number): void {
  void _dt;
  if (m.state === 'chase' || m.state === 'flee') {
    m.state = 'idle';
    m.stateTimer = 1 + Math.random() * 2;
  }
  if (m.state === 'idle' && m.stateTimer <= 0) {
    m.state = 'walk';
    m.stateTimer = 4 + Math.random() * 5;
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 6;
    m.wanderX = m.x + Math.cos(a) * r;
    m.wanderZ = m.z + Math.sin(a) * r;
  }
}
