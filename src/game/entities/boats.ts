// ─── Boats: rideable watercraft (phase 10) ───────────────────────────────────
// MC-style oak boat: spring-buoyancy floating, WASD rowing (W/S thrust,
// A/D turn), sneak to dismount, breaks on attack (drops the boat item).
// Custom per-axis voxel collision via moveEntity with a flat AABB.
import * as THREE from 'three';
import { isWaterId, isSolid } from '../blocks';
import { moveEntity, type AABBEntity, type VoxelAccess } from '../physics';

export interface Boat extends AABBEntity {
  yaw: number;
  group: THREE.Group;
  mats: THREE.MeshLambertMaterial[];
  /** smoothed voxel-light factor (night realism, same formula as mobs) */
  lightF: number;
  /** rowing dip/roll state */
  roll: number;
  pitch: number;
  occupied: boolean;
}

export interface BoatInput {
  forward: number;
  strafe: number;
}

/** water surface height at a column (topmost water block + source level 0.875), or NaN */
function waterSurface(world: VoxelAccess, x: number, z: number, nearY: number): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let y = Math.min(120, Math.floor(nearY) + 3); y >= Math.max(1, Math.floor(nearY) - 6); y--) {
    if (isWaterId(world.getBlock(bx, y, bz))) {
      // surface = top of this water column (assume source level when air above)
      const above = world.getBlock(bx, y + 1, bz);
      return isWaterId(above) ? y + 1.875 : y + 0.875;
    }
  }
  return NaN;
}

export class BoatManager {
  boats: Boat[] = [];
  private scene: THREE.Scene;
  private world: VoxelAccess;
  private hullMat: THREE.MeshLambertMaterial;
  private rimMat: THREE.MeshLambertMaterial;
  private benchMat: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, world: VoxelAccess) {
    this.scene = scene;
    this.world = world;
    this.hullMat = new THREE.MeshLambertMaterial({ color: 0x8a683c });
    this.rimMat = new THREE.MeshLambertMaterial({ color: 0xa5824f });
    this.benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4d2a });
  }

  get count(): number {
    return this.boats.length;
  }

  /** spawn a boat at (x, y, z) — y is the hull base */
  spawn(x: number, y: number, z: number, yaw = 0): Boat {
    const group = new THREE.Group();
    // per-boat material clones (tinted by voxel light; base color cached)
    const mats = [this.hullMat.clone(), this.rimMat.clone(), this.benchMat.clone()];
    for (const m of mats) (m.userData as { baseC?: THREE.Color }).baseC = m.color.clone();
    const add = (w: number, h: number, d: number, mat: THREE.MeshLambertMaterial, px: number, py: number, pz: number): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(px, py, pz);
      group.add(m);
    };
    // hull base
    add(0.95, 0.14, 1.75, mats[0], 0, 0.07, 0);
    // side walls
    add(0.12, 0.34, 1.75, mats[0], -0.47, 0.3, 0);
    add(0.12, 0.34, 1.75, mats[0], 0.47, 0.3, 0);
    // bow + stern walls
    add(0.95, 0.34, 0.14, mats[0], 0, 0.3, 0.85);
    add(0.95, 0.34, 0.14, mats[0], 0, 0.3, -0.85);
    // rim trim
    add(1.02, 0.07, 1.85, mats[1], 0, 0.5, 0);
    // bench
    add(0.85, 0.07, 0.24, mats[2], 0, 0.38, -0.25);
    // prow tips
    add(0.3, 0.2, 0.2, mats[1], 0, 0.18, 1.02);
    add(0.3, 0.2, 0.2, mats[1], 0, 0.18, -1.02);

    group.position.set(x, y, z);
    group.rotation.y = yaw;
    this.scene.add(group);
    const boat: Boat = {
      x, y, z, vx: 0, vy: 0, vz: 0,
      width: 1.25, height: 0.62,
      onGround: false, inWater: false,
      yaw, group, mats,
      lightF: 1, roll: 0, pitch: 0, occupied: false,
    };
    this.boats.push(boat);
    return boat;
  }

  remove(boat: Boat): void {
    const i = this.boats.indexOf(boat);
    if (i === -1) return;
    this.scene.remove(boat.group);
    this.boats.splice(i, 1);
  }

  clear(): void {
    for (const b of this.boats) this.scene.remove(b.group);
    this.boats = [];
  }

  /**
   * ray vs boat AABBs; nearest hit within maxDist (mounting / attack)
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { boat: Boat; dist: number } | null {
    let best: { boat: Boat; dist: number } | null = null;
    for (const b of this.boats) {
      const half = b.width / 2 + 0.15;
      const t = rayBox(ox, oy, oz, dx, dy, dz,
        b.x - half, b.y - 0.1, b.z - half,
        b.x + half, b.y + b.height + 0.25, b.z + half);
      if (t !== null && t <= maxDist && (!best || t < best.dist)) best = { boat: b, dist: t };
    }
    return best;
  }

  /**
   * physics + visuals for every boat. When `mounted` is set, rowing input
   * drives that boat; otherwise it drifts. Returns the dismount spot when the
   * rider pressed sneak (handled by the engine).
   */
  update(dt: number, sunLevel: number, mounted: Boat | null, input: BoatInput): void {
    for (const b of this.boats) {
      const surf = waterSurface(this.world, b.x, b.z, b.y);
      const inWater = Number.isFinite(surf);
      b.inWater = inWater;

      // rowing (only the mounted boat takes input)
      const isMounted = b === mounted;
      let thrust = 0, turn = 0;
      if (isMounted) {
        thrust = input.forward;
        turn = input.strafe;
      }
      if (inWater) {
        const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
        const accel = 9.5 * thrust;
        b.vx += fx * accel * dt;
        b.vz += fz * accel * dt;
        b.yaw += turn * 1.9 * dt;
        // water drag
        const drag = Math.pow(thrust !== 0 ? 0.86 : 0.42, dt);
        b.vx *= drag;
        b.vz *= drag;
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 8.2) { b.vx *= 8.2 / sp; b.vz *= 8.2 / sp; }
        // buoyancy spring toward the surface rest height
        const restY = surf - 0.28;
        b.vy += (restY - b.y) * 16 * dt;
        b.vy *= Math.pow(0.18, dt); // vertical damping (bobbing settles)
      } else {
        // on land: heavy friction (boats crawl ashore), gravity applies
        b.vy -= 26 * dt;
        const drag = Math.pow(0.06, dt);
        b.vx *= drag;
        b.vz *= drag;
      }

      const prevVy = b.vy;
      moveEntity(this.world, b, dt);
      if (b.onGround && prevVy < -6) b.vy = 0;

      // visuals: yaw, bob, lean into turns + pitch with vertical speed
      b.group.position.set(b.x, b.y, b.z);
      b.group.rotation.y = b.yaw;
      const targetRoll = isMounted ? -turn * 0.09 : 0;
      b.roll += (targetRoll - b.roll) * Math.min(1, dt * 5);
      const targetPitch = inWater ? Math.max(-0.16, Math.min(0.16, -prevVy * 0.02)) : 0;
      b.pitch += (targetPitch - b.pitch) * Math.min(1, dt * 5);
      b.group.rotation.z = b.roll;
      b.group.rotation.x = b.pitch;
      if (inWater && !isMounted) {
        // gentle idle bob when unoccupied
        b.group.position.y += Math.sin(performance.now() / 900 + b.x) * 0.025;
      }

      // world-light shading — normalized like mobs.ts (raw value double-
      // darkened at night on top of the scene lights)
      const lx = Math.floor(b.x), ly = Math.floor(b.y + 0.4), lz = Math.floor(b.z);
      const l = this.lightAt(lx, ly, lz);
      const local = Math.max((l & 15) / 15, ((l >> 4) / 15) * sunLevel);
      const target = Math.max(0.1, Math.min(1, local / Math.max(sunLevel, 0.3)));
      b.lightF += (target - b.lightF) * Math.min(1, dt * 6);
      for (const m of b.mats) {
        const ud = m.userData as { baseC?: THREE.Color };
        if (ud.baseC) m.color.copy(ud.baseC).multiplyScalar(b.lightF);
      }
    }

    // despawn far-out boats (chunk unload leaves them unreachable)
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const b = this.boats[i];
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.z) || b.y < -20) {
        this.scene.remove(b.group);
        this.boats.splice(i, 1);
      }
    }
  }

  private lightAt(x: number, y: number, z: number): number {
    const w = this.world as VoxelAccess & { getLightForMesh?: (x: number, y: number, z: number) => number };
    if (typeof w.getLightForMesh === 'function') {
      const l = w.getLightForMesh(x, y, z);
      if (l >= 0) return l;
    }
    return 0xf0; // fallback: full sky light
  }

  /** find a safe dismount position beside the boat (side first, then front/back) */
  dismountSpot(b: Boat): { x: number; y: number; z: number } {
    const perpX = Math.cos(b.yaw), perpZ = -Math.sin(b.yaw);
    const candidates: [number, number][] = [
      [b.x + perpX * 1.2, b.z + perpZ * 1.2],
      [b.x - perpX * 1.2, b.z - perpZ * 1.2],
      [b.x + Math.sin(b.yaw) * 1.6, b.z + Math.cos(b.yaw) * 1.6],
      [b.x - Math.sin(b.yaw) * 1.6, b.z - Math.cos(b.yaw) * 1.6],
    ];
    for (const [cx, cz] of candidates) {
      const bx = Math.floor(cx), bz = Math.floor(cz);
      // stand on the boat's floor level or the first solid below within 3
      for (let dy = 2; dy >= -3; dy--) {
        const y = Math.floor(b.y) + dy;
        if (isSolid(this.world.getBlock(bx, y, bz)) &&
          this.world.getBlock(bx, y + 1, bz) === 0 &&
          this.world.getBlock(bx, y + 2, bz) === 0) {
          return { x: cx, y: y + 1, z: cz };
        }
      }
    }
    return { x: b.x, y: b.y + 0.4, z: b.z }; // fallback: pop up on the boat
  }
}

/** slab-method ray vs AABB */
function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const p = [ox, oy, oz], d = [dx, dy, dz];
  const mins = [minX, minY, minZ], maxs = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (p[i] < mins[i] || p[i] > maxs[i]) return null;
    } else {
      let t1 = (mins[i] - p[i]) / d[i];
      let t2 = (maxs[i] - p[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
