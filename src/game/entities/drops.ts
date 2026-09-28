// ─── Item drop entities (spinning blocks + flat item sprites) ───────────────
import * as THREE from 'three';
import { getBlockDef, isLiquid } from '../blocks';
import { isItemId, getItemIconCanvas } from '../items';
import { moveEntity, type AABBEntity } from '../physics';

export interface ItemStack {
  blockId: number;
  count: number;
}

interface DropEntity extends AABBEntity {
  stack: ItemStack;
  age: number;
  pickupDelay: number;
  mesh: THREE.Mesh;
  /** smoothed world-light factor (night realism — matches terrain brightness) */
  lightF: number;
  lastAppliedF: number;
}

const DROP_SIZE = 0.25;

/** Box geometry with atlas UVs for a block (used by drops + held item) */
export function createBlockGeometry(blockId: number, size: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(size, size, size);
  const def = getBlockDef(blockId);
  if (def) {
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
    const tiles = Array.isArray(def.tiles) ? def.tiles : [def.tiles, def.tiles, def.tiles, def.tiles, def.tiles, def.tiles];
    for (let face = 0; face < 6; face++) {
      const tile = tiles[face];
      const tx = tile % 16;
      const ty = Math.floor(tile / 16);
      const inset = 0.25 / 256;
      const u0 = tx / 16 + inset, u1 = (tx + 1) / 16 - inset;
      const v1 = 1 - ty / 16 - inset, v0 = 1 - (ty + 1) / 16 + inset;
      const base = face * 4;
      uvAttr.setXY(base + 0, u0, v1);
      uvAttr.setXY(base + 1, u1, v1);
      uvAttr.setXY(base + 2, u0, v0);
      uvAttr.setXY(base + 3, u1, v0);
    }
    uvAttr.needsUpdate = true;
  }
  return geo;
}

export class DropManager {
  drops: DropEntity[] = [];
  private scene: THREE.Scene;
  private world: { getBlock(x: number, y: number, z: number): number; getLightForMesh(x: number, y: number, z: number): number };
  private geoCache = new Map<number, THREE.BoxGeometry>();
  private mat: THREE.Material;
  private itemMatCache = new Map<number, THREE.MeshLambertMaterial>();

  constructor(scene: THREE.Scene, world: { getBlock(x: number, y: number, z: number): number; getLightForMesh(x: number, y: number, z: number): number }, atlasTexture: THREE.Texture) {
    this.scene = scene;
    this.world = world;
    this.mat = new THREE.MeshLambertMaterial({ map: atlasTexture });
  }

  private geoFor(blockId: number): THREE.BoxGeometry {
    let geo = this.geoCache.get(blockId);
    if (!geo) {
      geo = createBlockGeometry(blockId, DROP_SIZE);
      this.geoCache.set(blockId, geo);
    }
    return geo;
  }

  spawn(blockId: number, x: number, y: number, z: number, count = 1): void {
    if (blockId === 0) return;
    let mesh: THREE.Mesh;
    if (isItemId(blockId)) {
      // flat sprite for non-block items
      let mat = this.itemMatCache.get(blockId);
      if (!mat) {
        const tex = new THREE.CanvasTexture(getItemIconCanvas(blockId));
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
        this.itemMatCache.set(blockId, mat);
      }
      // per-instance clone so world-light shading is individual per drop
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), mat.clone());
    } else {
      mesh = new THREE.Mesh(this.geoFor(blockId), this.mat.clone());
    }
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const e: DropEntity = {
      x, y, z,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 2.2 + Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 1.6,
      width: DROP_SIZE, height: DROP_SIZE,
      onGround: false, inWater: false,
      stack: { blockId, count },
      age: 0,
      pickupDelay: 0.5,
      mesh,
      lightF: 1,
      lastAppliedF: 1,
    };
    this.drops.push(e);
  }

  update(dt: number, playerPos: { x: number; y: number; z: number }, sunLevel: number, onPickup: (stack: ItemStack) => boolean): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.pickupDelay -= dt;

      // physics
      d.vy -= 22 * dt;
      if (isLiquid(this.world.getBlock(Math.floor(d.x), Math.floor(d.y), Math.floor(d.z)))) {
        d.vy = Math.max(d.vy, 0.4); // float up
      }
      moveEntity(this.world, d, dt);
      d.vx *= Math.pow(0.4, dt);
      d.vz *= Math.pow(0.4, dt);

      // magnet + pickup
      const dx = playerPos.x - d.x;
      const dy = (playerPos.y + 0.8) - d.y;
      const dz = playerPos.z - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.pickupDelay <= 0) {
        if (dist < 1.6 && d.age > 0.4) {
          // fly toward player
          const pull = Math.min(1, dt * 12);
          d.x += dx * pull; d.y += dy * pull; d.z += dz * pull;
        }
        if (dist < 0.5) {
          if (onPickup(d.stack)) {
            this.scene.remove(d.mesh);
            this.drops.splice(i, 1);
            continue;
          }
        }
      }

      // despawn after 5 min
      if (d.age > 300) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        continue;
      }

      // visuals: bob + spin (items also tilt)
      d.mesh.position.set(d.x, d.y + DROP_SIZE / 2 + Math.sin(d.age * 2.5) * 0.05 + DROP_SIZE * 0.2, d.z);
      d.mesh.rotation.y = d.age * 1.4;
      if (isItemId(d.stack.blockId)) d.mesh.rotation.y = Math.sin(d.age * 1.4) * 0.6;

      // world-light shading (same formula as terrain: dark at night, torch-lit areas stay bright)
      const lb = this.world.getLightForMesh(Math.floor(d.x), Math.floor(d.y + 0.4), Math.floor(d.z));
      const target = Math.max(0.1, Math.max((lb & 15) / 15, ((lb >> 4) / 15) * sunLevel));
      d.lightF += (target - d.lightF) * Math.min(1, dt * 6);
      if (Math.abs(d.lightF - d.lastAppliedF) > 0.004) {
        (d.mesh.material as THREE.MeshLambertMaterial).color.setScalar(d.lightF);
        d.lastAppliedF = d.lightF;
      }
    }
  }

  clear(): void {
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
  }
}
