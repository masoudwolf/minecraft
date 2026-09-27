// ─── XP orbs: glowing green sprites that fly to the player ──────────────────
import * as THREE from 'three';
import { isLiquid } from '../blocks';
import { moveEntity, type AABBEntity } from '../physics';

interface XPOrb extends AABBEntity {
  value: number;
  age: number;
  mesh: THREE.Sprite;
}

let orbTexture: THREE.Texture | null = null;

function getOrbTexture(): THREE.Texture {
  if (orbTexture) return orbTexture;
  // pixel-art green orb on a small canvas
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d')!;
  const core = ['#c8ffb0', '#9dff7a'];
  const mid = ['#5ce83c', '#4ed32f', '#6bf24a'];
  const edge = '#2f8a1c';
  // 8x8 circle
  const inR = (x: number, y: number, r: number): boolean => (x - 3.5) ** 2 + (y - 3.5) ** 2 <= r * r;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      if (!inR(x, y, 3.8)) continue;
      let color = edge;
      if (inR(x, y, 2.4)) color = mid[(x + y) % mid.length];
      if (inR(x, y, 1.2)) color = core[(x + y) % core.length];
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  orbTexture = tex;
  return tex;
}

export class XPOrbManager {
  orbs: XPOrb[] = [];
  private scene: THREE.Scene;
  private world: { getBlock(x: number, y: number, z: number): number };
  private mat: THREE.SpriteMaterial;

  constructor(scene: THREE.Scene, world: { getBlock(x: number, y: number, z: number): number }) {
    this.scene = scene;
    this.world = world;
    this.mat = new THREE.SpriteMaterial({ map: getOrbTexture(), transparent: true, alphaTest: 0.2, depthWrite: false });
  }

  spawn(x: number, y: number, z: number, value: number): void {
    if (value <= 0) return;
    const sprite = new THREE.Sprite(this.mat);
    const size = 0.14 + Math.min(0.12, value * 0.02);
    sprite.scale.set(size, size, 1);
    sprite.position.set(x, y, z);
    this.scene.add(sprite);
    this.orbs.push({
      x, y, z,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2.4 + Math.random() * 1.2,
      vz: (Math.random() - 0.5) * 2.4,
      width: 0.1, height: 0.1,
      onGround: false, inWater: false,
      value,
      age: 0,
      mesh: sprite,
    });
  }

  update(dt: number, playerPos: { x: number; y: number; z: number }, onAbsorb: (value: number) => void): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.age += dt;
      // physics
      o.vy -= 18 * dt;
      if (isLiquid(this.world.getBlock(Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)))) {
        o.vy = Math.max(o.vy, 0.6);
      }
      moveEntity(this.world, o, dt);
      o.vx *= Math.pow(0.35, dt);
      o.vz *= Math.pow(0.35, dt);

      // strong magnet (bigger radius than item drops)
      const dx = playerPos.x - o.x;
      const dy = (playerPos.y + 0.9) - o.y;
      const dz = playerPos.z - o.z;
      const dist = Math.hypot(dx, dy, dz);
      if (o.age > 0.35 && dist < 4.2) {
        const pull = Math.min(1, dt * (dist < 1 ? 18 : 8));
        o.x += dx * pull; o.y += dy * pull; o.z += dz * pull;
      }
      if (dist < 0.55 && o.age > 0.35) {
        onAbsorb(o.value);
        this.scene.remove(o.mesh);
        this.orbs.splice(i, 1);
        continue;
      }
      // despawn after 90s
      if (o.age > 90) {
        this.scene.remove(o.mesh);
        this.orbs.splice(i, 1);
        continue;
      }
      o.mesh.position.set(o.x, o.y + Math.sin(o.age * 3) * 0.04, o.z);
    }
  }

  clear(): void {
    for (const o of this.orbs) this.scene.remove(o.mesh);
    this.orbs = [];
  }
}
