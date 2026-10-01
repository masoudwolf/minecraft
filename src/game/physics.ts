// ─── Voxel physics: AABB collision + DDA raycast ─────────────────────────────
import { isSolid, isLiquid, blockHeight, getBlockDef } from './blocks';
import { WORLD_HEIGHT } from './constants';
import type { World } from './world/world';

export interface AABBEntity {
  x: number; y: number; z: number; // position = feet center
  vx: number; vy: number; vz: number;
  width: number; height: number;
  onGround: boolean;
  inWater: boolean;
}

/** minimal voxel access needed by physics (World satisfies this) */
export interface VoxelAccess {
  getBlock(x: number, y: number, z: number): number;
}

/** move entity with per-axis collision resolution against voxels */
export function moveEntity(world: VoxelAccess, e: AABBEntity, dt: number): void {
  const half = e.width / 2;

  // water check (feet + mid)
  e.inWater = isLiquid(world.getBlock(Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z))) ||
    isLiquid(world.getBlock(Math.floor(e.x), Math.floor(e.y + e.height * 0.5), Math.floor(e.z)));

  // integrate per axis
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy), Math.abs(e.vz)) * dt / 0.4));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    // X
    e.x += e.vx * sdt;
    if (collides(world, e, half)) {
      e.x -= e.vx * sdt;
      e.vx = 0;
    }
    // Z
    e.z += e.vz * sdt;
    if (collides(world, e, half)) {
      e.z -= e.vz * sdt;
      e.vz = 0;
    }
    // Y
    e.y += e.vy * sdt;
    if (collides(world, e, half)) {
      e.y -= e.vy * sdt;
      if (e.vy < 0) e.onGround = true;
      e.vy = 0;
    } else if (e.vy !== 0) {
      e.onGround = false;
    }
  }
}

function collides(world: VoxelAccess, e: AABBEntity, half: number): boolean {
  const x0 = Math.floor(e.x - half);
  const x1 = Math.floor(e.x + half);
  const y0 = Math.floor(e.y);
  const y1 = Math.floor(e.y + e.height);
  const z0 = Math.floor(e.z - half);
  const z1 = Math.floor(e.z + half);
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) {
        if (y < 0) return true;
        if (y >= WORLD_HEIGHT) continue;
        const id = world.getBlock(x, y, z);
        if (isSolid(id)) {
          // partial-height blocks (bed = 9/16): only collide when feet are below the top
          if (e.y >= y + blockHeight(id)) continue;
          return true;
        }
        // MC-style tall solids (fences/gates = 1.5 blocks, v0.53): the cell
        // ABOVE a tall block is blocked while the entity's feet are within the
        // extension band — so fences can't be jumped over or walked through.
        if (y > 0) {
          const below = world.getBlock(x, y - 1, z);
          const bd = getBlockDef(below);
          if (bd?.solid && bd.tall && e.y < y + bd.tall) return true;
        }
      }
  return false;
}

export interface RayHit {
  x: number; y: number; z: number;   // block hit
  nx: number; ny: number; nz: number; // face normal
  id: number;
  dist: number;
}

/** DDA voxel raycast */
export function raycast(world: VoxelAccess, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / (dx || 1e-10));
  const tDeltaY = Math.abs(1 / (dy || 1e-10));
  const tDeltaZ = Math.abs(1 / (dz || 1e-10));
  let tMaxX = tDeltaX * (dx > 0 ? x + 1 - ox : ox - x);
  let tMaxY = tDeltaY * (dy > 0 ? y + 1 - oy : oy - y);
  let tMaxZ = tDeltaZ * (dz > 0 ? z + 1 - oz : oz - z);
  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== 0 && !isLiquid(id)) {
      return { x, y, z, nx, ny, nz, id, dist: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist) return null;
  }
  return null;
}

/** would the AABB at pos intersect the given block cell? */
export function aabbIntersectsBlock(e: { x: number; y: number; z: number; width: number; height: number }, bx: number, by: number, bz: number): boolean {
  const half = e.width / 2;
  return e.x + half > bx && e.x - half < bx + 1 &&
    e.y + e.height > by && e.y < by + 1 &&
    e.z + half > bz && e.z - half < bz + 1;
}
