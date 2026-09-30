// ─── Chunk mesher: face culling + ambient occlusion + smooth lighting ────────
import * as THREE from 'three';
import { BLOCK, getBlockDef, isOpaque, isWaterId, waterLevel } from '../blocks';
import { CHUNK_SIZE, WORLD_HEIGHT, blockIndex } from '../constants';
import { tileUV } from '../textures/atlas';
import type { World, Chunk } from './world';

export interface ChunkMeshes {
  opaque: THREE.Mesh | null;
  cutout: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

interface FaceDef {
  dir: [number, number, number];
  corners: [number, number, number][]; // BL, BR, TR, TL (viewed from outside)
  shade: number;
}

const FACES: FaceDef[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },   // +X
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },  // -X
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },    // +Y
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },  // -Y
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.82 },   // +Z
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.82 },  // -Z
];

const UV_CORNERS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.42, 0.62, 0.82, 1.0];
/** wind-sway weight per block (leaves wobble; cross plants bend at the top).
 *  The voxel vertex shader turns this into a live breeze — shader-pack
 *  "waving foliage". 0 = rigid (terrain, torches, lily pads). */
const SWAY_LEAVES = 0.5;
const SWAY_CROSS = 0.9;

/** sub-rectangle of a tile in pixel coords (y measured from top) -> uv rect [u0,v0,u1,v1] */
function tileSub(tileIndex: number, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const [tu0, tv0, tu1, tv1] = tileUV(tileIndex);
  const u0 = tu0 + (tu1 - tu0) * (x0 / 16);
  const u1 = tu0 + (tu1 - tu0) * (x1 / 16);
  const v1 = tv1 - (tv1 - tv0) * (y0 / 16); // top edge
  const v0 = tv1 - (tv1 - tv0) * (y1 / 16); // bottom edge
  return [u0, v0, u1, v1];
}

// tangent axes per face axis
const TANGENT_AXES: [number, number][] = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];

interface MeshBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  shades: number[];
  skies: number[];
  blocks: number[];
  tints: number[];
  sways: number[];
  depths: number[];
  indices: number[];
}

function newBuffers(): MeshBuffers {
  return { positions: [], normals: [], uvs: [], shades: [], skies: [], blocks: [], tints: [], sways: [], depths: [], indices: [] };
}

function buildGeometry(b: MeshBuffers): THREE.BufferGeometry {
  // ── HARD PER-VERTEX INVARIANT ──────────────────────────────────────────
  // Every attribute buffer must have EXACTLY one entry per vertex. A short
  // buffer makes the GPU read out-of-bounds vertex data, which on real
  // GPUs surfaces as (0,0,0) tint/normals → random BLACK patches on the
  // LAST vertices of the chunk — and since the y-loop runs bottom-up, the
  // tail is always the HIGHEST cutout geometry: tree canopies, sugarcane
  // tops, bamboo. This bug family shipped twice:
  //   v0.44 — aNormal skipped for cross/torch/lily (black cane/lily with
  //           shadows on: garbage normals in the shadow lookup)
  //   v0.45 — aTint skipped for torch/lily (black tree tops at ANY shadow
  //           setting; breaking any block remeshed the chunk and moved the
  //           damaged tail window to a different block, so "breaking the
  //           black top of one bamboo turned another bamboo black")
  // Pad + warn so a future model type can never silently corrupt meshes.
  const vertCount = b.positions.length / 3;
  if (b.normals.length !== vertCount * 3) {
    console.warn(`[mesher] aNormal count ${b.normals.length} != ${vertCount * 3} — padded (model missing normals)`);
    while (b.normals.length < vertCount * 3) b.normals.push(0, 1, 0);
  }
  if (b.tints.length !== vertCount * 3) {
    console.warn(`[mesher] aTint count ${b.tints.length} != ${vertCount * 3} — padded white (model missing tint)`);
    while (b.tints.length < vertCount * 3) b.tints.push(1, 1, 1);
  }
  if (b.uvs.length !== vertCount * 2) {
    console.warn(`[mesher] uv count ${b.uvs.length} != ${vertCount * 2} — padded`);
    while (b.uvs.length < vertCount * 2) b.uvs.push(0, 0);
  }
  for (const [name, arr] of [['aShade', b.shades], ['aSky', b.skies], ['aBlock', b.blocks], ['aSway', b.sways], ['aDepth', b.depths]] as const) {
    if (arr.length !== vertCount) {
      console.warn(`[mesher] ${name} count ${arr.length} != ${vertCount} — padded`);
      while (arr.length < vertCount) arr.push(0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('aNormal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
  geo.setAttribute('aShade', new THREE.Float32BufferAttribute(b.shades, 1));
  geo.setAttribute('aSky', new THREE.Float32BufferAttribute(b.skies, 1));
  geo.setAttribute('aBlock', new THREE.Float32BufferAttribute(b.blocks, 1));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(b.tints, 3));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(b.sways, 1));
  geo.setAttribute('aDepth', new THREE.Float32BufferAttribute(b.depths, 1));
  geo.setIndex(b.indices);
  geo.computeBoundingSphere();
  return geo;
}

// ─── biome tints (grass tops, tall grass, oak leaves) ────────────────────────
import type { Biome } from './terrain';
const BIOME_TINTS: Record<Biome, [number, number, number]> = {
  plains: [1, 1, 1],
  forest: [0.86, 1.0, 0.84],
  jungle: [0.58, 1.0, 0.36],
  swamp: [0.6, 0.76, 0.5],
  desert: [0.88, 0.9, 0.5],
  snowy: [0.84, 0.94, 0.9],
  mountains: [0.85, 0.95, 0.88],
  mushroom: [0.72, 0.62, 0.78], // muted lavender-gray (mycelium biome has little grass)
};
const TINT_WHITE: [number, number, number] = [1, 1, 1];

/** per-biome water surface tint (swamp murky, jungle teal, snowy pale) */
const WATER_TINTS: Partial<Record<Biome, [number, number, number]>> = {
  swamp: [0.52, 0.66, 0.42],
  jungle: [0.5, 0.82, 0.72],
  snowy: [0.68, 0.84, 1.0],
  mountains: [0.7, 0.87, 1.0],
  desert: [0.55, 0.85, 0.92],
};

export function buildChunkMesh(world: World, chunk: Chunk, group: THREE.Group, materials: { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; water: THREE.ShaderMaterial }): void {
  disposeChunkMesh(chunk, group);

  const opaque = newBuffers();
  const cutout = newBuffers();
  const water = newBuffers();
  chunk.torches = [];

  const x0 = chunk.cx * CHUNK_SIZE;
  const z0 = chunk.cz * CHUNK_SIZE;

  const getB = (wx: number, wy: number, wz: number): number => world.getBlock(wx, wy, wz);
  /** biome tint for this column (cached per chunk build) */
  const tintCache = new Map<number, [number, number, number]>();
  /** water-column floor y per (lx,lz) — cached so deep oceans scan once */
  const depthCache = new Map<number, number>();
  const biomeTint = (wx: number, wz: number): [number, number, number] => {
    const key = (wx & 0xffff) << 16 | (wz & 0xffff);
    const cached = tintCache.get(key);
    if (cached) return cached;
    const t = BIOME_TINTS[world.terrain.biomeAt(wx, wz)] ?? TINT_WHITE;
    tintCache.set(key, t);
    return t;
  };

  const pushTint = (buf: MeshBuffers, t: [number, number, number]): void => {
    buf.tints.push(t[0], t[1], t[2]);
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = chunk.data[blockIndex(lx, y, lz)];
        if (id === BLOCK.AIR) continue;
        const def = getBlockDef(id);
        if (!def) continue;

        const wx = x0 + lx;
        const wz = z0 + lz;
        const isWater = isWaterId(id);
        const isCutout = !!def.cutout;
        const target = isWater ? water : isCutout ? cutout : opaque;

        // ── special model: cross (flowers, tall grass) ──
        if (def.model === 'cross') {
          const tile = Array.isArray(def.tiles) ? def.tiles[0] : def.tiles;
          const [u0, v0, u1, v1] = tileUV(tile);
          const l = world.getLightForMesh(wx, y, wz);
          const sky = (l >> 4) / 15;
          const blk = (l & 15) / 15;
          // only tall grass is biome-tinted; flowers keep their colors
          const tint = id === BLOCK.TALL_GRASS ? biomeTint(wx, wz) : TINT_WHITE;
          const quads: [number, number, number][][] = [
            [[0, 0, 0], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
            [[1, 0, 0], [0, 0, 1], [0, 1, 1], [1, 1, 0]],
          ];
          for (const quad of quads) {
            const basePos = cutout.positions.length / 3;
            for (let c = 0; c < 4; c++) {
              const cr = quad[c];
              const px2 = cr[0] === 0 ? 0.08 : 0.92;
              const pz2 = cr[2] === 0 ? 0.08 : 0.92;
              cutout.positions.push(lx + px2, y + cr[1], lz + pz2);
              // aNormal MUST stay 1:1 with positions — the voxel shadow shader
              // reads vNormalW for the sun/torch shadow lookups. Cross quads
              // used to skip normals entirely, leaving the aNormal buffer
              // SHORTER than the draw range → out-of-bounds/garbage normals →
              // random BLACK patches on cane/grass/flowers whenever shadows
              // were ON (uShadowStrength guard made it shadows-only). An up
              // normal also lifts the shadow sample 3.5cm above the thin quad
              // — no self-shadow acne, same trick as the grass tufts.
              cutout.normals.push(0, 1, 0);
              const uvc = UV_CORNERS[c];
              cutout.uvs.push(u0 + (u1 - u0) * uvc[0], v0 + (v1 - v0) * uvc[1]);
              cutout.shades.push(0.95);
              cutout.skies.push(sky);
              cutout.blocks.push(blk);
              pushTint(cutout, tint);
              // sway weight = corner height: tops bend in the breeze, roots stay
              cutout.sways.push(cr[1] * SWAY_CROSS);
            }
            cutout.indices.push(basePos, basePos + 1, basePos + 2, basePos, basePos + 2, basePos + 3);
          }
          continue;
        }

        // ── special model: torch (mini box, cropped UVs, always bright) ──
        if (def.model === 'torch') {
          chunk.torches.push([wx + 0.5, y + 0.62, wz + 0.5]);
          const tile = Array.isArray(def.tiles) ? def.tiles[0] : def.tiles;
          const a = 0.4375, b = 0.5625, h = 0.625; // 7/16..9/16 wide, 10/16 tall
          const sideUV = tileSub(tile, 7, 6, 9, 16);
          const topUV = tileSub(tile, 7, 2, 9, 4);
          const l = world.getLightForMesh(wx, y, wz);
          const sky = (l >> 4) / 15;
          const blk = Math.max((l & 15) / 15, 0.92);
          const boxFaces: { c: [number, number, number][]; uv: [number, number, number, number]; sh: number; n: [number, number, number] }[] = [
            { c: [[b, 0, b], [b, 0, a], [b, h, a], [b, h, b]], uv: sideUV, sh: 0.95, n: [1, 0, 0] },  // +X
            { c: [[a, 0, a], [a, 0, b], [a, h, b], [a, h, a]], uv: sideUV, sh: 0.95, n: [-1, 0, 0] }, // -X
            { c: [[a, h, b], [b, h, b], [b, h, a], [a, h, a]], uv: topUV, sh: 1.0, n: [0, 1, 0] },    // +Y
            { c: [[a, 0, a], [b, 0, a], [b, 0, b], [a, 0, b]], uv: sideUV, sh: 0.7, n: [0, -1, 0] },  // -Y
            { c: [[a, 0, b], [b, 0, b], [b, h, b], [a, h, b]], uv: sideUV, sh: 0.95, n: [0, 0, 1] },  // +Z
            { c: [[b, 0, a], [a, 0, a], [a, h, a], [b, h, a]], uv: sideUV, sh: 0.95, n: [0, 0, -1] }, // -Z
          ];
          for (const f of boxFaces) {
            const basePos = cutout.positions.length / 3;
            for (let c = 0; c < 4; c++) {
              const cr = f.c[c];
              cutout.positions.push(lx + cr[0], y + cr[1], lz + cr[2]);
              // real face normals — see the cross-model comment: aNormal must
              // stay 1:1 with positions or the shadow lookups read garbage
              cutout.normals.push(f.n[0], f.n[1], f.n[2]);
              const uvc = UV_CORNERS[c];
              cutout.uvs.push(f.uv[0] + (f.uv[2] - f.uv[0]) * uvc[0], f.uv[1] + (f.uv[3] - f.uv[1]) * uvc[1]);
              cutout.shades.push(f.sh);
              cutout.skies.push(sky);
              cutout.blocks.push(blk);
              // aTint MUST also stay 1:1 (v0.45 regression: missing tint made
              // the buffer run short and the chunk tail — tree tops — read
              // out-of-bounds tint = BLACK canopy patches at any graphics
              // setting). Torch texture carries its own warm color; tint white.
              pushTint(cutout, TINT_WHITE);
              cutout.sways.push(0); // torches are rigid
            }
            cutout.indices.push(basePos, basePos + 1, basePos + 2, basePos, basePos + 2, basePos + 3);
          }
          continue;
        }

        // ── special model: lily pad (flat horizontal quad near cell bottom) ──
        if (def.model === 'lily') {
          const tile = Array.isArray(def.tiles) ? def.tiles[0] : def.tiles;
          const [u0, v0, u1, v1] = tileUV(tile);
          const l = world.getLightForMesh(wx, y, wz);
          const sky = (l >> 4) / 15;
          const blk = (l & 15) / 15;
          const hY = 0.0625;
          const quad: [number, number, number][] = [[0, hY, 1], [1, hY, 1], [1, hY, 0], [0, hY, 0]];
          const basePos = cutout.positions.length / 3;
          for (let c = 0; c < 4; c++) {
            const cr = quad[c];
            cutout.positions.push(lx + cr[0], y + cr[1], lz + cr[2]);
            // up normal (lily pads are horizontal quads) — aNormal must stay
            // 1:1 with positions (see the cross-model comment: missing normals
            // = garbage shadow lookups = black lily pads when shadows are on)
            cutout.normals.push(0, 1, 0);
            const uvc = UV_CORNERS[c];
            cutout.uvs.push(u0 + (u1 - u0) * uvc[0], v0 + (v1 - v0) * uvc[1]);
            cutout.shades.push(0.96);
            cutout.skies.push(sky);
            cutout.blocks.push(blk);
            // aTint 1:1 — same invariant as the torch model above (missing
            // tint = short buffer = black chunk tail). Lilies share the cutout
            // buffer with leaves/canes, so one lily corrupted the whole tail.
            pushTint(cutout, TINT_WHITE);
            cutout.sways.push(0); // lily pads float rigid
          }
          cutout.indices.push(basePos, basePos + 1, basePos + 2, basePos, basePos + 2, basePos + 3);
          continue;
        }

        // water surface height: source 0.875, flowing levels get thinner
        const aboveId = getB(wx, y + 1, wz);
        let waterTopH = 1;
        if (isWater && !isWaterId(aboveId)) {
          waterTopH = id === BLOCK.WATER ? 0.875 : Math.max(0.12, 0.875 - waterLevel(id) * 0.105);
        }
        // ── baked water depth (v0.47): floor distance below this water cell,
        // 0 = shoreline shallow → 1 = deep. Drives the shader-pack absorption
        // gradient (sandy shallows → rich deep teal), translucent shore edges
        // and the bright waterline band — the Unreal-water look without a
        // screen-space depth pass. The y-loop runs bottom-up, so the FIRST
        // water cell of a column is the lowest one — we cache the column's
        // FLOOR y there and derive per-cell depth from it.
        let wDepth = 0;
        if (isWater) {
          const colKey = (lx << 8) | lz;
          const floorY = depthCache.get(colKey);
          if (floorY !== undefined) {
            wDepth = Math.min(1, Math.max(0, y - 1 - floorY) / 9);
          } else {
            let fy = y - 1;
            while (fy > 0 && y - fy <= 24) {
              const bid = getB(wx, fy, wz);
              if (bid !== BLOCK.AIR && !isWaterId(bid)) break;
              fy--;
            }
            depthCache.set(colKey, fy);
            wDepth = Math.min(1, Math.max(0, y - 1 - fy) / 9);
          }
        }
        // partial-height blocks (bed)
        const hTop = def.height ?? 1;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];
          const nId = getB(nx, ny, nz);

          // face visibility
          if (isWater) {
            if (nId === id) continue; // same-level water culls
            if (isOpaque(nId)) continue;
          } else if (isCutout) {
            if (nId === id) continue; // same cutout type culls
            if (isOpaque(nId)) continue;
          } else {
            if (isOpaque(nId)) continue;
            if (nId === id) continue;
          }

          // tile for this face
          const tiles = def.tiles;
          const tileIdx = Array.isArray(tiles) ? tiles[f] : tiles;
          const [u0, v0, u1, v1] = tileUV(tileIdx);

          // biome tint: grass top face + oak leaves (others white); water gets per-biome color
          const tint = isWater
            ? (WATER_TINTS[world.terrain.biomeAt(wx, wz)] ?? TINT_WHITE)
            : (id === BLOCK.GRASS && f === 2) || id === BLOCK.LEAVES
              ? biomeTint(wx, wz)
              : TINT_WHITE;

          // AO axes
          const axis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2;
          const [ua, va] = TANGENT_AXES[axis];

          const basePos = target.positions.length / 3;
          const aoLevels: number[] = [];
          const skyLevels: number[] = [];
          const blockLevels: number[] = [];

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            // world-space sample cell (the air cell in front of the face)
            let cy = y + corner[1];
            if (isWater && waterTopH !== 1 && corner[1] === 1) cy = y + waterTopH;
            else if (corner[1] === 1 && hTop !== 1) cy = y + hTop;

            target.positions.push(lx + corner[0], cy, lz + corner[2]);

            const uvc = UV_CORNERS[c];
            target.uvs.push(u0 + (u1 - u0) * uvc[0], v0 + (v1 - v0) * uvc[1]);

            // AO + smooth light: sample base cell + 2 sides + diagonal
            const t1 = [0, 0, 0];
            const t2 = [0, 0, 0];
            t1[ua] = corner[ua] * 2 - 1;
            t2[va] = corner[va] * 2 - 1;

            const bx = nx, by = ny, bz = nz;
            const s1x = bx + t1[0], s1y = by + t1[1], s1z = bz + t1[2];
            const s2x = bx + t2[0], s2y = by + t2[1], s2z = bz + t2[2];
            const ccx = bx + t1[0] + t2[0], ccy = by + t1[1] + t2[1], ccz = bz + t1[2] + t2[2];

            const s1 = isOpaque(getB(s1x, s1y, s1z)) ? 1 : 0;
            const s2 = isOpaque(getB(s2x, s2y, s2z)) ? 1 : 0;
            const cc = isOpaque(getB(ccx, ccy, ccz)) ? 1 : 0;
            const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            aoLevels.push(AO_CURVE[ao]);

            // light averaging (skip opaque cells -> use base)
            const baseL = world.getLightForMesh(bx, by, bz);
            let skySum = baseL >> 4;
            let blockSum = baseL & 15;
            let count = 1;
            const cells: [number, number, number, boolean][] = [
              [s1x, s1y, s1z, s1 === 1],
              [s2x, s2y, s2z, s2 === 1],
              [ccx, ccy, ccz, cc === 1],
            ];
            for (const [cx2, cy2, cz2, opq] of cells) {
              if (opq) continue;
              const l = world.getLightForMesh(cx2, cy2, cz2);
              skySum += l >> 4;
              blockSum += l & 15;
              count++;
            }
            skyLevels.push(skySum / count / 15);
            blockLevels.push(blockSum / count / 15);
          }

          const shade = face.shade;
          // waving foliage: leaf cubes wobble rigidly in the breeze (phase comes
          // from world position in the shader, so neighboring canopies desync)
          const sway = (id === BLOCK.LEAVES || id === BLOCK.SPRUCE_LEAVES || id === BLOCK.JUNGLE_LEAVES) ? SWAY_LEAVES : 0;
          for (let c = 0; c < 4; c++) {
            target.normals.push(face.dir[0], face.dir[1], face.dir[2]);
            target.shades.push(shade * aoLevels[c]);
            target.skies.push(skyLevels[c]);
            target.blocks.push(blockLevels[c]);
            pushTint(target, tint);
            target.sways.push(sway);
            target.depths.push(isWater ? wDepth : 0);
          }

          // flip quad diagonal for better AO interpolation
          if (aoLevels[0] + aoLevels[2] > aoLevels[1] + aoLevels[3]) {
            target.indices.push(basePos, basePos + 1, basePos + 2, basePos, basePos + 2, basePos + 3);
          } else {
            target.indices.push(basePos + 1, basePos + 2, basePos + 3, basePos + 1, basePos + 3, basePos);
          }
        }
      }
    }
  }

  chunk.meshes = { opaque: null, cutout: null, water: null };

  const makeMesh = (buf: MeshBuffers, mat: THREE.ShaderMaterial, renderOrder: number): THREE.Mesh | null => {
    if (buf.indices.length === 0) return null;
    const geo = buildGeometry(buf);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x0, 0, z0);
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.frustumCulled = true;
    group.add(mesh);
    return mesh;
  };

  chunk.meshes.opaque = makeMesh(opaque, materials.opaque, 0);
  chunk.meshes.cutout = makeMesh(cutout, materials.cutout, 0);
  chunk.meshes.water = makeMesh(water, materials.water, 2);
  chunk.needsMesh = false;
}

export function disposeChunkMesh(chunk: Chunk, group: THREE.Group): void {
  if (!chunk.meshes) return;
  for (const mesh of [chunk.meshes.opaque, chunk.meshes.cutout, chunk.meshes.water]) {
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
  }
  chunk.meshes = null;
}
