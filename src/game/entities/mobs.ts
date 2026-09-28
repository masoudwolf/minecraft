// ─── Mobs: box-model entities, AI, spawning, combat ──────────────────────────
import * as THREE from 'three';
import { moveEntity, type AABBEntity } from '../physics';
import { BLOCK, isWaterId } from '../blocks';
import { getMobSkins } from './mobSkins';
import { audio } from '../audio';
import { ITEM } from '../items';

export type MobType = 'pig' | 'cow' | 'sheep' | 'chicken' | 'zombie' | 'creeper' | 'skeleton' | 'spider' | 'enderman' | 'villager' | 'mooshroom' | 'golem';

interface MobDef {
  hostile: boolean;
  width: number;
  height: number;
  health: number;
  speed: number;
  /** contact/attack damage to player */
  damage: number;
  drops: { id: number; min: number; max: number }[];
  sound: 'oink' | 'moo' | 'baa' | 'cluck' | 'groan' | 'hiss' | 'rattle' | 'spider' | 'enderman' | 'villager' | 'mooshroom' | 'golem';
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

// ─── Model builders ──────────────────────────────────────────────────────────
function partMat(tex: THREE.CanvasTexture): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: tex });
}

function boxPart(w: number, h: number, d: number, mat: THREE.MeshLambertMaterial, tag: string): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.part = tag;
  return mesh;
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

function quadruped(skins: ReturnType<typeof getMobSkins>, opts: {
  bodyW: number; bodyH: number; bodyD: number; bodyY: number;
  legW: number; legH: number;
  headS: number; headY: number; headZ: number;
  shadowR: number;
}): MobParts {
  const mats = [partMat(skins.head), partMat(skins.body), partMat(skins.limb)];
  const group = new THREE.Group();
  const body = boxPart(opts.bodyW, opts.bodyH, opts.bodyD, mats[1], 'body');
  body.position.y = opts.bodyY;
  group.add(body);
  const head = boxPart(opts.headS, opts.headS, opts.headS, mats[0], 'head');
  head.position.set(0, opts.headY, opts.headZ);
  group.add(head);
  const legs: THREE.Mesh[] = [];
  const lx = opts.bodyW / 2 - opts.legW / 2;
  const lz = opts.bodyD / 2 - opts.legW / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = boxPart(opts.legW, opts.legH, opts.legW, mats[2], 'limb');
    leg.position.set(sx * lx, opts.bodyY - opts.bodyH / 2 - opts.legH / 2, sz * lz);
    group.add(leg);
    legs.push(leg);
  }
  return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
}

function humanoid(skins: ReturnType<typeof getMobSkins>, thin = false): MobParts {
  const lw = thin ? 0.16 : 0.25;
  const aw = thin ? 0.14 : 0.22;
  const mats = [partMat(skins.head), partMat(skins.body), partMat(skins.limb)];
  const group = new THREE.Group();
  const body = boxPart(0.5, 0.72, 0.26, mats[1], 'body');
  body.position.y = 1.1;
  group.add(body);
  const head = boxPart(0.5, 0.5, 0.5, mats[0], 'head');
  head.position.y = 1.72;
  group.add(head);
  const legs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const leg = boxPart(lw, 0.74, lw, mats[2], 'limb');
    leg.position.set(sx * 0.125, 0.37, 0);
    group.add(leg);
    legs.push(leg);
  }
  const arms: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (0.25 + aw / 2), 1.42, 0);
    const arm = boxPart(aw, 0.7, aw, mats[2], 'limb');
    arm.position.y = -0.32;
    pivot.add(arm);
    group.add(pivot);
    arms.push(arm);
    (arm as unknown as { pivot: THREE.Group }).pivot = pivot;
  }
  return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
}

// ─── Mob definitions ─────────────────────────────────────────────────────────
const MOB_DEFS: Record<MobType, MobDef> = {
  pig: {
    hostile: false, width: 0.9, height: 0.9, health: 10, speed: 1.1, damage: 0,
    drops: [{ id: ITEM.PORKCHOP, min: 1, max: 2 }], sound: 'oink',
    builder: (s) => quadruped(s, { bodyW: 0.62, bodyH: 0.5, bodyD: 1.0, bodyY: 0.55, legW: 0.24, legH: 0.32, headS: 0.5, headY: 0.62, headZ: 0.62, shadowR: 0.45 }),
  },
  cow: {
    hostile: false, width: 0.9, height: 1.4, health: 10, speed: 1.0, damage: 0,
    drops: [{ id: ITEM.BEEF, min: 1, max: 2 }, { id: ITEM.LEATHER, min: 0, max: 2 }], sound: 'moo',
    builder: (s) => quadruped(s, { bodyW: 0.75, bodyH: 0.62, bodyD: 1.15, bodyY: 0.85, legW: 0.24, legH: 0.55, headS: 0.5, headY: 1.05, headZ: 0.72, shadowR: 0.5 }),
  },
  sheep: {
    hostile: false, width: 0.9, height: 1.3, health: 8, speed: 1.05, damage: 0,
    drops: [{ id: ITEM.MUTTON, min: 1, max: 2 }, { id: BLOCK.WOOL, min: 1, max: 2 }], sound: 'baa',
    builder: (s) => quadruped(s, { bodyW: 0.68, bodyH: 0.58, bodyD: 1.0, bodyY: 0.78, legW: 0.22, legH: 0.5, headS: 0.42, headY: 1.02, headZ: 0.6, shadowR: 0.48 }),
  },
  chicken: {
    hostile: false, width: 0.4, height: 0.7, health: 4, speed: 0.9, damage: 0,
    drops: [{ id: ITEM.CHICKEN_RAW, min: 1, max: 1 }, { id: ITEM.FEATHER, min: 0, max: 2 }], sound: 'cluck',
    builder: (s) => {
      const p = quadruped(s, { bodyW: 0.38, bodyH: 0.38, bodyD: 0.5, bodyY: 0.5, legW: 0.08, legH: 0.3, headS: 0.26, headY: 0.78, headZ: 0.28, shadowR: 0.25 });
      return p;
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
      const mats = [partMat(s.head), partMat(s.body), partMat(s.limb)];
      const group = new THREE.Group();
      const body = boxPart(0.5, 0.78, 0.32, mats[1], 'body');
      body.position.y = 0.76;
      group.add(body);
      const head = boxPart(0.52, 0.52, 0.52, mats[0], 'head');
      head.position.y = 1.42;
      group.add(head);
      const legs: THREE.Mesh[] = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = boxPart(0.24, 0.38, 0.24, mats[2], 'limb');
        leg.position.set(sx * 0.14, 0.19, sz * 0.18);
        group.add(leg);
        legs.push(leg);
      }
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  skeleton: {
    hostile: true, width: 0.6, height: 1.95, health: 20, speed: 1.7, damage: 0,
    drops: [
      { id: ITEM.ARROW, min: 0, max: 2 },
      { id: ITEM.BONE, min: 0, max: 2 },
    ], sound: 'rattle',
    builder: (s) => humanoid(s, true),
  },
  spider: {
    hostile: true, width: 1.25, height: 0.9, health: 16, speed: 2.15, damage: 2,
    drops: [{ id: ITEM.STRING, min: 1, max: 2 }, { id: ITEM.SPIDER_EYE, min: 0, max: 1 }], sound: 'spider',
    neutralInDay: true, climbs: true,
    builder: (s) => {
      const mats = [partMat(s.head), partMat(s.body), partMat(s.limb)];
      const group = new THREE.Group();
      // abdomen (back) + thorax (front) — flat wide body
      const abdomen = boxPart(0.8, 0.45, 0.8, mats[1], 'body');
      abdomen.position.set(0, 0.55, -0.34);
      group.add(abdomen);
      const head = boxPart(0.52, 0.44, 0.5, mats[0], 'head');
      head.position.set(0, 0.55, 0.5);
      group.add(head);
      // 8 legs: 4 per side, thin boxes angled out from pivots on the body
      const legs: THREE.Mesh[] = [];
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const pivot = new THREE.Group();
          pivot.position.set(side * 0.36, 0.58, -0.42 + i * 0.26);
          // base outward yaw spread
          const baseYaw = side * (0.9 - Math.abs(i - 1.5) * 0.22);
          pivot.rotation.y = baseYaw;
          pivot.userData.baseYaw = baseYaw;
          const leg = boxPart(0.62, 0.09, 0.09, mats[2], 'limb');
          leg.position.set(side * 0.31, -0.06, 0);
          pivot.add(leg);
          // knee tip angled down
          const tip = boxPart(0.34, 0.08, 0.08, mats[2], 'limb');
          tip.position.set(side * 0.24, -0.16, 0);
          pivot.add(tip);
          group.add(pivot);
          legs.push(pivot as unknown as THREE.Mesh);
        }
      }
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  enderman: {
    hostile: true, width: 0.55, height: 2.75, health: 40, speed: 2.9, damage: 4,
    drops: [{ id: ITEM.ENDER_PEARL, min: 1, max: 1 }], sound: 'enderman',
    teleports: true, neutralInDay: true,
    builder: (s) => {
      const mats = [partMat(s.head), partMat(s.body), partMat(s.limb)];
      const group = new THREE.Group();
      const body = boxPart(0.42, 0.8, 0.26, mats[1], 'body');
      body.position.y = 1.75;
      group.add(body);
      const head = boxPart(0.46, 0.42, 0.46, mats[0], 'head');
      head.position.y = 2.44;
      group.add(head);
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const leg = boxPart(0.13, 1.35, 0.13, mats[2], 'limb');
        leg.position.set(sx * 0.11, 0.675, 0);
        group.add(leg);
        legs.push(leg);
      }
      const arms: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.29, 2.1, 0);
        const arm = boxPart(0.11, 1.25, 0.11, mats[2], 'limb');
        arm.position.y = -0.62;
        pivot.add(arm);
        group.add(pivot);
        arms.push(arm);
        (arm as unknown as { pivot: THREE.Group }).pivot = pivot;
      }
      return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  villager: {
    hostile: false, width: 0.6, height: 1.95, health: 20, speed: 0.85, damage: 0,
    drops: [], sound: 'villager',
    builder: (s) => {
      const mats = [partMat(s.head), partMat(s.body), partMat(s.limb)];
      const group = new THREE.Group();
      // robe torso
      const body = boxPart(0.56, 0.72, 0.32, mats[1], 'body');
      body.position.y = 1.08;
      group.add(body);
      // robe skirt over legs
      const skirt = boxPart(0.54, 0.42, 0.3, mats[1], 'body');
      skirt.position.y = 0.51;
      group.add(skirt);
      // head + long nose
      const head = boxPart(0.5, 0.5, 0.5, mats[0], 'head');
      head.position.y = 1.69;
      group.add(head);
      if (s.extra) {
        const nose = boxPart(0.13, 0.26, 0.11, partMat(s.extra), 'nose');
        nose.position.set(0, 1.63, 0.31);
        group.add(nose);
      }
      // crossed arms: single horizontal box on the chest
      const armsBox = boxPart(0.58, 0.16, 0.16, mats[2], 'arm');
      armsBox.position.set(0, 1.26, 0.24);
      group.add(armsBox);
      // short legs under the skirt
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const leg = boxPart(0.2, 0.32, 0.2, mats[2], 'limb');
        leg.position.set(sx * 0.12, 0.16, 0);
        group.add(leg);
        legs.push(leg);
      }
      return { group, head, legs, arms: [], materials: mats, shadow: null as unknown as THREE.Mesh };
    },
  },
  mooshroom: {
    hostile: false, width: 0.9, height: 1.4, health: 10, speed: 1.0, damage: 0,
    drops: [{ id: ITEM.BEEF, min: 1, max: 2 }, { id: ITEM.LEATHER, min: 0, max: 2 }], sound: 'mooshroom',
    builder: (s) => quadruped(s, { bodyW: 0.75, bodyH: 0.62, bodyD: 1.15, bodyY: 0.85, legW: 0.24, legH: 0.55, headS: 0.5, headY: 1.05, headZ: 0.72, shadowR: 0.5 }),
  },
  golem: {
    // village defender: passive to players, hunts hostile mobs (MC iron golem)
    hostile: false, width: 1.3, height: 2.7, health: 100, speed: 1.35, damage: 0,
    drops: [{ id: ITEM.IRON_INGOT, min: 3, max: 5 }], sound: 'golem',
    builder: (s) => {
      const mats = [partMat(s.head), partMat(s.body), partMat(s.limb)];
      const group = new THREE.Group();
      // massive torso
      const body = boxPart(1.0, 0.92, 0.55, mats[1], 'body');
      body.position.y = 1.58;
      group.add(body);
      // hip block
      const hips = boxPart(0.82, 0.3, 0.5, mats[1], 'body');
      hips.position.y = 1.02;
      group.add(hips);
      // head with long villager-style nose
      const head = boxPart(0.62, 0.56, 0.62, mats[0], 'head');
      head.position.y = 2.36;
      group.add(head);
      if (s.extra) {
        const nose = boxPart(0.18, 0.34, 0.16, partMat(s.extra), 'nose');
        nose.position.set(0, 2.26, 0.37);
        group.add(nose);
      }
      // long hanging arms with pivots (swing while walking)
      const arms: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.64, 1.95, 0);
        const arm = boxPart(0.3, 1.05, 0.3, mats[2], 'limb');
        arm.position.y = -0.5;
        pivot.add(arm);
        group.add(pivot);
        arms.push(arm);
        (arm as unknown as { pivot: THREE.Group }).pivot = pivot;
      }
      // sturdy legs
      const legs: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const leg = boxPart(0.34, 0.72, 0.34, mats[2], 'limb');
        leg.position.set(sx * 0.2, 0.36, 0);
        group.add(leg);
        legs.push(leg);
      }
      return { group, head, legs, arms, materials: mats, shadow: null as unknown as THREE.Mesh };
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
  private scene: THREE.Scene;
  private world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void };
  private spawnTimer = 0;
  private arrowMat: THREE.MeshLambertMaterial;
  private playerArrowMat: THREE.MeshLambertMaterial;
  private time = 0;
  /** most recent callbacks (for hurt→teleport outside update loop) */
  private lastCb: MobCallbacks | null = null;

  constructor(scene: THREE.Scene, world: { getBlock(x: number, y: number, z: number): number; setBlock(x: number, y: number, z: number, id: number): void }) {
    this.scene = scene;
    this.world = world;
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
    this.playerArrowMat = new THREE.MeshLambertMaterial({ color: 0xc8a06a });
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
    const skinKey = variant && type === 'sheep' ? `sheep:${variant}` : type;
    const skins = getMobSkins(skinKey);
    const parts = def.builder(skins);
    // per-instance material clones so hurt tint is individual
    const cloned = parts.materials.map((mm) => mm.clone());
    const mapping = new Map<THREE.Material, THREE.Material>();
    parts.materials.forEach((mm, i2) => mapping.set(mm, cloned[i2]));
    parts.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mapping.has(mesh.material as THREE.Material)) {
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
      variant: type === 'sheep' ? (variant || 'white') : '',
      wanderX: x, wanderZ: z,
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
      const type: MobType = roll < 0.36 ? 'zombie' : roll < 0.64 ? 'skeleton' : roll < 0.84 ? 'creeper' : roll < 0.96 ? 'spider' : 'enderman';
      this.spawn(type, x, sy + 1, z);
    } else if (wantPassive) {
      const roll = Math.random();
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

      // despawn far
      if (distToPlayer > 64) {
        this.scene.remove(m.group);
        this.scene.remove(m.parts.shadow);
        this.mobs.splice(i, 1);
        continue;
      }

      // death animation
      if (m.dead) {
        m.deathT -= dt;
        m.group.rotation.z = Math.min(Math.PI / 2, m.group.rotation.z + dt * 6);
        tint(m.parts.materials, 1, 0.35, 0.35);
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
        tint(m.parts.materials, 1, 0.35, 0.35);
        if (m.hurtT <= 0) tint(m.parts.materials, 1, 1, 1);
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
          tint(m.parts.materials, 1, 1 + flash * 1.2, 1 + flash * 1.2);
          if (distToPlayer > 5) {
            m.fuse = -1;
            tint(m.parts.materials, 1, 1, 1);
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
        // 8 sideways legs: fore-aft pivot swing (rotation.y around body) + slight bob
        const amp = 0.45 * Math.min(1, hSpeed / m.def.speed);
        for (let li = 0; li < legs.length; li++) {
          const pivot = legs[li] as unknown as THREE.Object3D & { userData: { baseYaw?: number } };
          const base = pivot.userData.baseYaw ?? 0;
          const idx = li % 4;
          const phase = m.walkPhase * 2.6 + idx * 1.5 + (li < 4 ? 0 : Math.PI * 0.5);
          pivot.rotation.y = base + Math.sin(phase) * amp;
          pivot.rotation.x = Math.cos(phase) * amp * 0.35;
        }
      } else if (legs.length === 4) {
        legs[0].rotation.x = swing;
        legs[3].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing;
      } else {
        legs[0].rotation.x = swing;
        if (legs[1]) legs[1].rotation.x = -swing;
      }
      // arms: zombie reaches forward; enderman hangs/swings (raised when provoked)
      for (const arm of m.parts.arms) {
        const pivot = (arm as unknown as { pivot?: THREE.Group }).pivot;
        if (!pivot) continue;
        if (m.type === 'zombie') {
          pivot.rotation.x = -Math.PI / 2 + Math.sin(m.walkPhase * 2.4) * 0.12;
          pivot.rotation.z = Math.sin(m.walkPhase * 1.2) * 0.06;
        } else if (m.type === 'golem') {
          // heavy pendulum sway; raised when charging a target
          const raised = m.state === 'chase' ? -1.2 : 0;
          pivot.rotation.x = raised + Math.sin(m.walkPhase * 2.4 + (pivot === (m.parts.arms[0] as unknown as { pivot?: THREE.Group }).pivot ? 0 : Math.PI)) * 0.3;
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
        if (m.provoked) tint(m.parts.materials, 1, 0.72, 1.12);
        else tint(m.parts.materials, 1, 1, 1);
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

  /** player-shot arrow (from bow). dx,dy,dz = unit direction. */
  shootPlayerArrow(x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, dmg: number): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.6), this.playerArrowMat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.arrows.push({ x, y, z, vx: dx * speed, vy: dy * speed, vz: dz * speed, life: 20, stuck: 0, mesh, fromPlayer: true, dmg });
    audio.bowShoot(0);
  }
}

function tint(mats: THREE.MeshLambertMaterial[], r: number, g: number, b: number): void {
  for (const m of mats) m.color.setRGB(r, g, b);
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
