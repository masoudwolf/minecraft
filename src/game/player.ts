// ─── Player: controller, camera, physics state, health ───────────────────────
import * as THREE from 'three';
import { moveEntity, type AABBEntity } from './physics';
import { GRAVITY, JUMP_VELOCITY, WALK_SPEED, SPRINT_SPEED, SNEAK_SPEED, SWIM_SPEED, PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_EYE } from './constants';
import { isLadderId } from './blocks';
import { getArmorDef } from './items';
import { featherFallingFactor } from './enchanting';
import { audio } from './audio';
import type { GameMode } from './state';

/** seconds of air the player can hold underwater before drowning (vanilla: 15s) */
export const PLAYER_AIR_MAX = 15;

/** active potion status effect ({k, t} pairs, engine ticks them down) */
export interface ActiveEffect {
  k: string;
  t: number;
}

export interface HotbarSlot {
  blockId: number; // 0 = empty
  count: number;
  dur?: number; // remaining durability (tools)
  /** enchantments (e.g. { sharpness: 3 }) — preserved with the stack */
  ench?: Record<string, number>;
}

export class Player {
  entity: AABBEntity;
  yaw = 0;
  pitch = 0;

  gameMode: GameMode = 'survival';
  /** creative flight (double-tap space) */
  flying = false;
  /** cheat flag (Creator Tools): all damage() calls are ignored while true */
  godMode = false;

  health = 20;
  maxHealth = 20;
  hunger = 20;
  dead = false;

  // experience (level + progress within level)
  level = 0;
  xp = 0;

  sprinting = false;
  /** external speed multiplier (bow drawing slows the player, MC-style) */
  speedMultiplier = 1;
  sneaking = false;
  fallStartY = 0;
  bobPhase = 0;
  stepDistance = 0;
  hurtCooldown = 0;
  /** poison timer (witch splash potions); ticks 1 damage per poisonTickT while > 0 */
  poisonT = 0;
  poisonTickT = 0;

  // ── potion status effects (phase 13) ──
  /** active effects with remaining seconds; engine decrements and applies */
  effects: ActiveEffect[] = [];
  /** jump velocity multiplier (Jump Boost potion); engine sets per-frame */
  jumpMultiplier = 1;
  /** water breathing potion active — air never drains; engine sets per-frame */
  breathing = false;
  /** melee damage multiplier (Strength potion) */
  get strengthMultiplier(): number {
    return this.effects.some((e) => e.k === 'strength') ? 1.5 : 1;
  }

  // ── drowning (vanilla-style: 15s of air underwater, then 2 dmg/s) ──
  /** remaining air in seconds (max PLAYER_AIR_MAX); shown as the bubble bar */
  air = PLAYER_AIR_MAX;
  /** accumulates while drowning; 1 damage tick per second */
  drownT = 0;

  hotbar: HotbarSlot[] = Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
  /** main inventory 27 slots (hotbar is slots 0..8) */
  main: HotbarSlot[] = Array.from({ length: 27 }, () => ({ blockId: 0, count: 0 }));
  /** equipped armor: [helmet, chest, legs, boots] (null = empty) */
  armor: (HotbarSlot | null)[] = [null, null, null, null];
  selected = 0;

  private camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.entity = {
      x: 0, y: 70, z: 0,
      vx: 0, vy: 0, vz: 0,
      width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
      onGround: false, inWater: false,
    };
  }

  get x(): number { return this.entity.x; }
  get y(): number { return this.entity.y; }
  get z(): number { return this.entity.z; }
  set x(v: number) { this.entity.x = v; }
  set y(v: number) { this.entity.y = v; }
  set z(v: number) { this.entity.z = v; }
  get onGround(): boolean { return this.entity.onGround; }
  get inWater(): boolean { return this.entity.inWater; }
  get vx(): number { return this.entity.vx; }
  get vz(): number { return this.entity.vz; }

  get isCreative(): boolean { return this.gameMode === 'creative'; }

  /** total armor points across equipped pieces (max 20) */
  get armorPoints(): number {
    let pts = 0;
    for (const piece of this.armor) {
      if (!piece || piece.blockId <= 0) continue;
      pts += getArmorDef(piece.blockId)?.points ?? 0;
    }
    return Math.min(20, pts);
  }

  eyeY(): number {
    return this.entity.y + (this.sneaking ? PLAYER_EYE - 0.25 : PLAYER_EYE);
  }

  applyCamera(baseFov: number, sprintFovBoost: number, dt: number): void {
    this.camera.position.set(this.x, this.eyeY(), this.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    // subtle view bob
    if (this.entity.onGround && (Math.abs(this.entity.vx) > 0.5 || Math.abs(this.entity.vz) > 0.5)) {
      this.bobPhase += dt * Math.min(9, Math.hypot(this.entity.vx, this.entity.vz) * 1.9);
      this.camera.position.y += Math.sin(this.bobPhase * 2) * 0.05;
      this.camera.position.x += Math.cos(this.bobPhase) * 0.02;
    }
    const targetFov = baseFov + (this.sprinting ? sprintFovBoost : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
  }

  forwardVector(): THREE.Vector3 {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  moveInput(
    input: { forward: number; strafe: number },
    world: { getBlock(x: number, y: number, z: number): number },
    dt: number,
    wishJump: boolean,
    wishSneak: boolean
  ): void {
    const e = this.entity;
    this.sneaking = wishSneak && e.onGround && !this.flying;
    const speed = (this.sprinting ? SPRINT_SPEED : this.sneaking ? SNEAK_SPEED : WALK_SPEED) * this.speedMultiplier;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = input.strafe * cos - input.forward * sin;
    let wz = -input.strafe * sin - input.forward * cos;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }

    // ── v0.53: ladder climbing — any body overlap with a ladder cell latches
    // on (MC behavior): movement input climbs, sneak holds, idle slides.
    // Gravity is replaced by the climb velocity while latched. ──
    const fx = Math.floor(e.x), fz = Math.floor(e.z);
    const onLadder = isLadderId(world.getBlock(fx, Math.floor(e.y + 0.4), fz)) ||
      isLadderId(world.getBlock(fx, Math.floor(e.y + 1.2), fz));

    // ── creative flight: no gravity, vertical thrust, damped glide ──
    if (this.flying && this.isCreative) {
      const flySpeed = this.sprinting ? SPRINT_SPEED * 2.1 : WALK_SPEED * 1.35;
      const accel = Math.min(1, dt * 8);
      e.vx += (wx * flySpeed - e.vx) * accel;
      e.vz += (wz * flySpeed - e.vz) * accel;
      if (wishJump) e.vy += (flySpeed * 0.9 - e.vy) * accel;
      else if (wishSneak) e.vy += (-flySpeed * 0.9 - e.vy) * accel;
      else e.vy += (0 - e.vy) * accel;
      moveEntity(world, e, dt);
      // landing cancels flight (MC behavior) — but only when actually descending
      // onto ground; freshly-toggled flight while standing has vy > 0 and must rise
      if (e.onGround && e.vy <= 0) this.flying = false;
      return;
    }

    if (onLadder) {
      const accel = Math.min(1, dt * 8);
      e.vx += (wx * WALK_SPEED * 0.55 - e.vx) * accel;
      e.vz += (wz * WALK_SPEED * 0.55 - e.vz) * accel;
      if (wishSneak && len === 0) e.vy = 0;               // sneak = hold position
      else if (len > 0 || wishJump) e.vy = 2.8;           // climb (jump also crests the top)
      else e.vy = Math.max(e.vy - 24 * dt, -2.2);         // idle = slow slide (MC −2.3)
      this.sprinting = false;
    } else if (e.inWater) {
      const accel = Math.min(1, dt * 6);
      e.vx += (wx * SWIM_SPEED - e.vx) * accel;
      e.vz += (wz * SWIM_SPEED - e.vz) * accel;
      e.vy += GRAVITY * 0.28 * dt;
      if (wishJump) e.vy = Math.min(e.vy + 30 * dt, 3.4);
      e.vy *= Math.pow(0.35, dt);
      // vanilla-like slow sink (the old uncapped -8 b/s plummet dropped the
      // player onto the lakebed instantly — MC sinks at about -1.5 b/s)
      e.vy = Math.max(e.vy, -1.8);
      this.sprinting = false;
    } else {
      const accel = e.onGround ? 10 : 2.2;
      e.vx += (wx * speed - e.vx) * Math.min(1, dt * accel);
      e.vz += (wz * speed - e.vz) * Math.min(1, dt * accel);
      e.vy += GRAVITY * dt;
      if (wishJump && e.onGround) {
        e.vy = JUMP_VELOCITY * this.jumpMultiplier;
        e.onGround = false;
      }
      e.vy = Math.max(e.vy, -60);
    }

    const wasOnGround = e.onGround;
    const prevX = e.x, prevZ = e.z;
    moveEntity(world, e, dt);

    // shore climb: pushing into a wall while in water hops like MC wading —
    // a full jump from the lakebed, a breach push while swimming at the surface
    if (e.inWater && len > 0) {
      const made = Math.hypot(e.x - prevX, e.z - prevZ);
      if (made < WALK_SPEED * dt * 0.35 && e.vy < 3.2) {
        e.vy = Math.max(e.vy, e.onGround ? JUMP_VELOCITY : 3.4);
      }
    }

    // fall damage (creative immune); Feather Falling boots soften it
    if (!e.inWater && !this.isCreative) {
      if (!wasOnGround && e.onGround) {
        const fallDist = this.fallStartY - e.y;
        if (fallDist > 3.5) {
          const raw = Math.floor(fallDist - 3);
          if (raw > 0) {
            const ff = this.armor[3]?.ench?.featherFalling ?? 0;
            const dmg = Math.max(0, Math.round(raw * featherFallingFactor(ff)));
            if (dmg > 0) this.damage(dmg);
          }
        }
        this.fallStartY = e.y;
      } else if (e.onGround) {
        this.fallStartY = e.y;
      } else if (onLadder) {
        this.fallStartY = e.y; // climbing resets the fall meter — dismount is free
      } else if (e.vy > 0) {
        this.fallStartY = e.y;
      }
    } else {
      this.fallStartY = e.y;
    }

    if (e.onGround) {
      this.stepDistance += Math.hypot(e.vx, e.vz) * dt;
    }
  }

  /** vanilla drowning: air drains while the head is submerged; at 0 → 2 dmg/s.
   *  Creative players and corpses never drown; air refills 4× faster than it drains.
   *  Water Breathing potion: air stays full while breathing == true. */
  updateAir(dt: number, headInWater: boolean): void {
    if (this.isCreative || this.dead || this.breathing) {
      this.air = PLAYER_AIR_MAX;
      this.drownT = 0;
      return;
    }
    if (headInWater) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownT += dt;
        if (this.drownT >= 1) {
          this.drownT = 0;
          this.damage(2);
        }
      }
    } else {
      this.air = Math.min(PLAYER_AIR_MAX, this.air + dt * 4);
      this.drownT = 0;
    }
  }

  damage(amount: number): void {
    if (this.isCreative || this.godMode) return; // creative + cheat god mode are invulnerable
    if (this.dead || this.hurtCooldown > 0) return;
    // armor damage reduction (MC formula: each point = 4% reduction, min 1 dmg)
    let dmg = amount;
    if (amount > 0) {
      const pts = this.armorPoints;
      if (pts > 0) dmg = Math.max(1, Math.round(amount * (1 - pts * 0.04)));
      // Protection enchant: −4% per level per enchanted piece (MC formula), capped 64%
      let prot = 0;
      for (const piece of this.armor) {
        if (!piece || piece.blockId <= 0) continue;
        prot += piece.ench?.protection ?? 0;
      }
      if (prot > 0) dmg = Math.max(1, Math.round(dmg * Math.max(0.36, 1 - Math.min(16, prot) * 0.04)));
      // armor wear: every equipped piece loses 1 durability per hit
      for (let i = 0; i < 4; i++) {
        const piece = this.armor[i];
        if (!piece || piece.blockId <= 0) continue;
        const def = getArmorDef(piece.blockId);
        if (!def) continue;
        piece.dur = (piece.dur ?? def.dur) - 1;
        if (piece.dur <= 0) {
          this.armor[i] = null;
          audio.breakBlock('glass');
        }
      }
    }
    this.health = Math.max(0, this.health - dmg);
    this.hurtCooldown = 0.5;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  respawn(x: number, y: number, z: number): void {
    this.entity.x = x; this.entity.y = y; this.entity.z = z;
    this.entity.vx = 0; this.entity.vy = 0; this.entity.vz = 0;
    this.health = this.maxHealth;
    this.hunger = 20;
    this.dead = false;
    this.flying = false;
    this.fallStartY = y;
    this.air = PLAYER_AIR_MAX;
    this.drownT = 0;
    // death clears potion effects (MC) — the old poison leak died here too
    this.effects = [];
    this.poisonT = 0;
    this.poisonTickT = 0;
    this.jumpMultiplier = 1;
    this.breathing = false;
  }
}
