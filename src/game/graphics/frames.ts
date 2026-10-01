// ─── FrameManager: item-frame display sprites (v0.55 Showcase & Décor) ───────
// Item frames render their wood ring inside the chunk mesh (mesher 'itemframe'
// model), but the DISPLAYED item is an arbitrary block/item id whose icon is a
// runtime canvas — not an atlas tile — so it can't live in chunk geometry.
// Instead the mesher collects frame anchors (chunk.frames, torch-style) and
// this manager rebuilds one textured plane per filled frame after every remesh.
//
// Lifecycle mirrors GrassManager: keyed by chunk, rebuilt in onChunkMeshed,
// removed on chunk unload (engine unload sweep → gfx.onChunkUnloaded), cleared
// on world teardown. Textures/materials are cached per displayed id and shared
// across all frames so the per-frame ambient tint is one write per material.
import * as THREE from 'three';
import type { Chunk, World } from '../world/world';
import { BLOCK, getBlockDef, frameWall, frameRot, frameItem } from '../blocks';
import { getTileCanvas } from '../textures/atlas';
import { getItemIconCanvas } from '../items';

const S = 1 / 16;
/** displayed item plane size (11/16 cell, MC frame items read ~that big) */
const PLANE = 11 / 16;
/** distance from the cell center toward the wall — sits the item just in
 *  front of the 1/16 ring panel (panel face at 1/16 from wall, item at 3/16) */
const INSET = 5 * S;

export class FrameManager {
  private scene: THREE.Scene;
  private groups = new Map<string, THREE.Group>();
  private texCache = new Map<number, THREE.CanvasTexture>();
  private matCache = new Map<number, THREE.MeshBasicMaterial>();
  private ambient = 1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Night Vision lift — the engine feeds this next to grass.nvValue */
  nvLift = 0;

  /** (re)build the display sprites for one chunk after its mesh rebuild */
  updateChunk(chunk: Chunk, world: World): void {
    const key = `${chunk.cx},${chunk.cz}`;
    this.removeChunk(chunk.cx, chunk.cz);
    if (chunk.frames.length === 0) return;
    const group = new THREE.Group();
    for (const [ax, ay, az] of chunk.frames) {
      const bx = Math.floor(ax), by = Math.floor(ay), bz = Math.floor(az);
      const id = world.getBlock(bx, by, bz);
      if (id !== BLOCK.ITEM_FRAME) continue; // stale anchor (block changed mid-tick)
      const meta = world.getMeta(bx, by, bz);
      const stored = frameItem(meta);
      if (!stored) continue; // empty frame — ring only
      const mat = this.matFor(stored);
      if (!mat) continue;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE), mat);
      // orient toward the room, sit just proud of the ring panel
      const wall = frameWall(meta);
      if (wall === 1) { mesh.position.set(ax + INSET, ay, az); mesh.rotation.y = -Math.PI / 2; }       // wall +X
      else if (wall === 2) { mesh.position.set(ax - INSET, ay, az); mesh.rotation.y = Math.PI / 2; }   // wall -X
      else if (wall === 3) { mesh.position.set(ax, ay, az + INSET); mesh.rotation.y = Math.PI; }       // wall +Z
      else { mesh.position.set(ax, ay, az - INSET); }                                                   // wall -Z (default)
      // quarter turns spin around the plane's own normal (local Z after yaw)
      mesh.rotateZ(-frameRot(meta) * Math.PI / 2);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    if (group.children.length === 0) return;
    this.scene.add(group);
    this.groups.set(key, group);
  }

  /** shared texture for one displayed id (item canvas or block face tile) */
  private texFor(id: number): THREE.CanvasTexture | null {
    const cached = this.texCache.get(id);
    if (cached) return cached;
    let canvas: HTMLCanvasElement | null = null;
    if (id >= 256) {
      canvas = getItemIconCanvas(id);
    } else {
      const def = getBlockDef(id);
      if (!def) return null;
      canvas = getTileCanvas(Array.isArray(def.tiles) ? def.tiles[0] : def.tiles);
    }
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(id, tex);
    return tex;
  }

  /** shared ambient-tinted material for one displayed id */
  private matFor(id: number): THREE.MeshBasicMaterial | null {
    const cached = this.matCache.get(id);
    if (cached) return cached;
    const tex = this.texFor(id);
    if (!tex) return null;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      transparent: false,
    });
    mat.color.setScalar(this.ambient);
    this.matCache.set(id, mat);
    return mat;
  }

  /** sun-driven brightness for displayed items (entities follow the same
   *  0.2..1.0 ambient ramp the scene lights use; NV lifts the floor) */
  setAmbient(sunLevel: number): void {
    let l = 0.2 + 0.8 * sunLevel;
    if (this.nvLift > 0) l = Math.max(l, 0.62 * this.nvLift);
    l = Math.min(1, Math.max(0.08, l));
    this.ambient = l;
    for (const mat of this.matCache.values()) mat.color.setScalar(l);
  }

  removeChunk(cx: number, cz: number): void {
    const key = `${cx},${cz}`;
    const group = this.groups.get(key);
    if (!group) return;
    this.scene.remove(group);
    for (const child of group.children) {
      (child as THREE.Mesh).geometry.dispose();
    }
    this.groups.delete(key);
  }

  clear(): void {
    for (const key of Array.from(this.groups.keys())) {
      const [cx, cz] = key.split(',').map(Number);
      this.removeChunk(cx, cz);
    }
  }

  dispose(): void {
    this.clear();
    for (const tex of this.texCache.values()) tex.dispose();
    for (const mat of this.matCache.values()) mat.dispose();
    this.texCache.clear();
    this.matCache.clear();
  }
}
