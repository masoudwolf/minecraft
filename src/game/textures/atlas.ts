// ─── Procedural pixel-art texture atlas (Minecraft style, 16px tiles) ────────
import * as THREE from 'three';

export const ATLAS_TILES = 16; // 16x16 tiles grid
export const TILE_PX = 16;
export const ATLAS_PX = ATLAS_TILES * TILE_PX;

// Deterministic PRNG so textures are stable across sessions
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** pick from color list */
function pick(rnd: () => number, colors: string[]): string {
  return colors[Math.floor(rnd() * colors.length)];
}

/** fill region with per-pixel random colors */
function noiseFill(ctx: Ctx, x0: number, y0: number, w: number, h: number, colors: string[], rnd: () => number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = pick(rnd, colors);
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
}

function px(ctx: Ctx, x: number, y: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

const GRASS_TOP = ['#79b543', '#6fa63c', '#82bd4a', '#71a93e', '#639636', '#8cc553'];
const DIRT = ['#866043', '#7a5636', '#936c4c', '#6f4f33', '#9c7555', '#7f5b3d'];
const STONE = ['#7d7d7d', '#747474', '#858585', '#6b6b6b', '#909090', '#808080'];
const SAND = ['#dbd3a0', '#d1c894', '#e3dbac', '#c9c088', '#d7cf9c'];
const SNOW = ['#f4fbfb', '#e8f2f2', '#ffffff', '#dfeaea', '#eef6f6'];
const WATER_C = [['#3059c4', 210], ['#3a68d8', 210], ['#2a52b8', 210], ['#4577e0', 205]] as [string, number][];
const LEAF = ['#3d6b22', '#457a28', '#356019', '#4d852e', '#2f5515'];
const SLEAF = ['#2e5b30', '#27502a', '#356b38', '#1f4521'];
const OBSID = ['#141221', '#2a2440', '#0c0a14', '#3a3260', '#1a1628'];

function drawOre(ctx: Ctx, tileX: number, tileY: number, colors: string[], rnd: () => number): void {
  noiseFill(ctx, tileX, tileY, TILE_PX, TILE_PX, STONE, rnd);
  const clusters = 3 + Math.floor(rnd() * 2);
  for (let c = 0; c < clusters; c++) {
    let cx = 2 + Math.floor(rnd() * 11);
    let cy = 2 + Math.floor(rnd() * 11);
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      px(ctx, tileX + cx, tileY + cy, colors[i % colors.length]);
      cx = Math.max(1, Math.min(14, cx + Math.floor(rnd() * 3) - 1));
      cy = Math.max(1, Math.min(14, cy + Math.floor(rnd() * 3) - 1));
    }
  }
}

function drawLogSide(ctx: Ctx, tx: number, ty: number, palette: string[], rnd: () => number): void {
  for (let x = 0; x < 16; x++) {
    const base = palette[Math.floor(rnd() * palette.length)];
    for (let y = 0; y < 16; y++) {
      let c = base;
      if (rnd() < 0.12) c = pick(rnd, palette);
      px(ctx, tx + x, ty + y, c);
    }
  }
}

function drawLogTop(ctx: Ctx, tx: number, ty: number, bark: string[], ringA: string, ringB: string, center: string, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, bark, rnd);
  for (let y = 2; y < 14; y++)
    for (let x = 2; x < 14; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(ctx, tx + x, ty + y, d > 4.5 ? ringB : Math.floor(d) % 2 === 0 ? ringA : ringB);
    }
  px(ctx, tx + 7, ty + 7, center); px(ctx, tx + 8, ty + 8, center);
  px(ctx, tx + 8, ty + 7, ringA); px(ctx, tx + 7, ty + 8, ringA);
}

function drawCobble(ctx: Ctx, tx: number, ty: number, rnd: () => number, mossy: boolean): void {
  ctx.fillStyle = '#4f4f4f';
  ctx.fillRect(tx, ty, 16, 16);
  const stones = ['#8c8c8c', '#7e7e7e', '#969696', '#737373', '#888888'];
  for (let cy = 0; cy < 4; cy++)
    for (let cx = 0; cx < 4; cx++) {
      const ox = cx * 4 + Math.floor(rnd() * 2) - 1;
      const oy = cy * 4 + Math.floor(rnd() * 2) - 1;
      const w = 3 + Math.floor(rnd() * 2);
      const h = 3 + Math.floor(rnd() * 2);
      const c = pick(rnd, stones);
      ctx.fillStyle = c;
      ctx.fillRect(tx + Math.max(0, ox), ty + Math.max(0, oy), w, h);
      // highlight top-left, shadow bottom-right
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(tx + Math.max(0, ox), ty + Math.max(0, oy), w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(tx + Math.max(0, ox), ty + Math.max(0, oy) + h - 1, w, 1);
    }
  if (mossy) {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16);
      px(ctx, tx + x, ty + y, rnd() < 0.5 ? '#5d7a3a' : '#4d6a30');
    }
  }
}

function drawPlanks(ctx: Ctx, tx: number, ty: number, rnd: () => number, dark: boolean): void {
  const base = dark ? ['#6b5230', '#63492b', '#735a37', '#5d4527'] : ['#a2824e', '#967847', '#ab8b55', '#8f7040'];
  for (let b = 0; b < 4; b++) {
    noiseFill(ctx, tx, ty + b * 4, 16, 3, base, rnd);
    ctx.fillStyle = dark ? '#4a3820' : '#6b5230';
    ctx.fillRect(tx, ty + b * 4 + 3, 16, 1);
    const joint = [12, 4, 9, 2][b];
    ctx.fillStyle = dark ? '#54401f' : '#7a5f3a';
    ctx.fillRect(tx + joint, ty + b * 4, 1, 3);
  }
}

function drawBricks(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.fillStyle = '#9b9186';
  ctx.fillRect(tx, ty, 16, 16);
  const bricks = ['#96513f', '#8e4a38', '#a05846', '#99503c'];
  for (let r = 0; r < 4; r++)
    for (let c = -1; c < 3; c++) {
      const x0 = c * 8 + (r % 2) * 4 + 1;
      noiseFill(ctx, tx + x0, ty + r * 4, 7, 3, bricks, rnd);
    }
}

function drawTNTSide(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, ['#db441a', '#c93a12', '#e64d20', '#d24016'], rnd);
  ctx.fillStyle = '#e6e2d5';
  ctx.fillRect(tx, ty + 5, 16, 6);
  // TNT letters
  const black = '#1a1a1a';
  // T1
  ctx.fillStyle = black;
  ctx.fillRect(tx + 2, ty + 6, 3, 1);
  ctx.fillRect(tx + 3, ty + 7, 1, 3);
  // N
  ctx.fillRect(tx + 6, ty + 6, 1, 4);
  ctx.fillRect(tx + 8, ty + 6, 1, 4);
  px(ctx, tx + 7, ty + 7, black);
  // T2
  ctx.fillRect(tx + 10, ty + 6, 3, 1);
  ctx.fillRect(tx + 11, ty + 7, 1, 3);
  // cracks
  ctx.fillStyle = '#8a2508';
  for (let i = 0; i < 5; i++) px(ctx, tx + Math.floor(rnd() * 16), ty + (rnd() < 0.5 ? Math.floor(rnd() * 5) : 11 + Math.floor(rnd() * 5)), '#8a2508');
}

function drawTNTTop(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, ['#b23212', '#a02c10', '#c23a18', '#aa3012'], rnd);
  ctx.fillStyle = '#7a7a7a';
  ctx.fillRect(tx + 5, ty + 5, 6, 6);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(tx + 6, ty + 6, 4, 4);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(tx + 7, ty + 7, 2, 2);
}

function drawFurnace(ctx: Ctx, tx: number, ty: number, front: boolean, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, ['#7a7a7a', '#6e6e6e', '#828282', '#666666', '#767676'], rnd);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(tx, ty + 15, 16, 1); ctx.fillRect(tx, ty, 16, 1);
  if (front) {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(tx + 4, ty + 8, 8, 6);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(tx + 5, ty + 9, 6, 5);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(tx + 4, ty + 7, 8, 1);
  }
}

function drawBookshelf(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  drawPlanks(ctx, tx, ty, rnd, false);
  const books = ['#a03b32', '#3b5ba0', '#4c7a3d', '#8a6a2f', '#6a4a8a', '#b0b0a8', '#7a2f2a'];
  for (const ry of [1, 9]) {
    let x = 1;
    while (x < 15) {
      const w = 1 + Math.floor(rnd() * 2);
      ctx.fillStyle = pick(rnd, books);
      ctx.fillRect(tx + x, ty + ry, w, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(tx + x + w, ty + ry, 1, 6);
      x += w + 1;
    }
  }
}

function drawCraftingTop(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  drawPlanks(ctx, tx, ty, rnd, false);
  ctx.fillStyle = '#5c4526';
  // border
  ctx.fillRect(tx, ty, 16, 1); ctx.fillRect(tx, ty + 15, 16, 1);
  ctx.fillRect(tx, ty, 1, 16); ctx.fillRect(tx + 15, ty, 1, 16);
  // grid
  ctx.fillStyle = '#6b5230';
  ctx.fillRect(tx + 4, ty + 1, 1, 14); ctx.fillRect(tx + 11, ty + 1, 1, 14);
  ctx.fillRect(tx + 1, ty + 4, 14, 1); ctx.fillRect(tx + 1, ty + 11, 14, 1);
}

function drawCraftingSide(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  drawPlanks(ctx, tx, ty, rnd, false);
  ctx.fillStyle = '#5c4526';
  ctx.fillRect(tx + 3, ty + 3, 10, 8);
  ctx.fillStyle = '#755a38';
  ctx.fillRect(tx + 4, ty + 4, 8, 6);
  ctx.fillStyle = '#4a3820';
  ctx.fillRect(tx + 5, ty + 5, 2, 4);
  ctx.fillRect(tx + 9, ty + 5, 2, 4);
}

function drawGrassSide(ctx: Ctx, tx: number, ty: number, snow: boolean, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, DIRT, rnd);
  const greens = snow ? SNOW : GRASS_TOP;
  for (let x = 0; x < 16; x++) {
    let depth = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) {
      px(ctx, tx + x, ty + y, pick(rnd, greens));
    }
    if (!snow) px(ctx, tx + x, ty + depth - 1, '#5d8f33');
  }
}

// ─── Atlas builder ───────────────────────────────────────────────────────────
let atlasCanvas: HTMLCanvasElement | null = null;
let atlasTexture: THREE.CanvasTexture | null = null;

export interface AtlasData {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

export function getAtlas(): AtlasData {
  if (atlasCanvas && atlasTexture) return { canvas: atlasCanvas, texture: atlasTexture };
  const canvas = makeCanvas(ATLAS_PX, ATLAS_PX);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const rnd = mulberry32(1337);

  const T = (i: number): [number, number] => [(i % ATLAS_TILES) * TILE_PX, Math.floor(i / ATLAS_TILES) * TILE_PX];

  let p = T(0); noiseFill(ctx, p[0], p[1], 16, 16, GRASS_TOP, rnd);                                    // grass_top
  p = T(1); drawGrassSide(ctx, p[0], p[1], false, rnd);                                                 // grass_side
  p = T(2); noiseFill(ctx, p[0], p[1], 16, 16, DIRT, rnd);                                              // dirt
  p = T(3); noiseFill(ctx, p[0], p[1], 16, 16, STONE, rnd);                                             // stone
  p = T(4); drawCobble(ctx, p[0], p[1], rnd, false);                                                    // cobblestone
  p = T(5); drawPlanks(ctx, p[0], p[1], rnd, false);                                                    // planks
  p = T(6); noiseFill(ctx, p[0], p[1], 16, 16, SAND, rnd);                                              // sand
  p = T(7); noiseFill(ctx, p[0], p[1], 16, 16, ['#84807d', '#7a7673', '#8d8986', '#6f6b68', '#9b9793', '#7d6f5f', '#5c5855'], rnd); // gravel
  p = T(8); drawLogSide(ctx, p[0], p[1], ['#684e30', '#5d4527', '#755a38', '#4f3a20'], rnd);            // log_side
  p = T(9); drawLogTop(ctx, p[0], p[1], ['#684e30', '#5d4527'], '#9c7f53', '#8a6f44', '#b09468', rnd);  // log_top
  p = T(10);                                                                                            // leaves
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (rnd() > 0.16) px(ctx, p[0] + x, p[1] + y, pick(rnd, LEAF));
  }
  p = T(11);                                                                                            // glass
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    ctx.fillStyle = '#e8f4f5';
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1] + 15, 16, 1);
    ctx.fillRect(p[0], p[1], 1, 16); ctx.fillRect(p[0] + 15, p[1], 1, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 5; i++) px(ctx, p[0] + 3 + i, p[1] + 2 + i, 'rgba(255,255,255,0.55)');
    for (let i = 0; i < 3; i++) px(ctx, p[0] + 9 + i, p[1] + 2 + i, 'rgba(255,255,255,0.4)');
  }
  p = T(12);                                                                                            // water
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = WATER_C[Math.floor(rnd() * WATER_C.length)];
        ctx.fillStyle = c[0];
        ctx.globalAlpha = c[1] / 255;
        ctx.fillRect(p[0] + x, p[1] + y, 1, 1);
      }
    ctx.globalAlpha = 1;
  }
  p = T(13); drawOre(ctx, p[0], p[1], ['#2e2e2e', '#1e1e1e', '#3a3a3a'], rnd);                          // coal
  p = T(14); drawOre(ctx, p[0], p[1], ['#d8af93', '#c69579', '#e3bd9e'], rnd);                          // iron
  p = T(15); drawOre(ctx, p[0], p[1], ['#fcee4b', '#e3ce3c', '#fff98a'], rnd);                          // gold
  p = T(16); drawOre(ctx, p[0], p[1], ['#5decf5', '#3ac6d8', '#8ff5fb'], rnd);                          // diamond
  p = T(17); noiseFill(ctx, p[0], p[1], 16, 16, ['#565656', '#3a3a3a', '#282828', '#6e6e6e', '#454545'], rnd); // bedrock
  p = T(18); noiseFill(ctx, p[0], p[1], 16, 16, SNOW, rnd);                                             // snow
  p = T(19); drawGrassSide(ctx, p[0], p[1], true, rnd);                                                 // grass_snow_side
  p = T(20);                                                                                            // sandstone side
  {
    noiseFill(ctx, p[0], p[1], 16, 16, SAND, rnd);
    ctx.fillStyle = 'rgba(150,140,90,0.5)';
    for (const y of [0, 4, 9, 15]) ctx.fillRect(p[0], p[1] + y, 16, 1);
  }
  p = T(21); noiseFill(ctx, p[0], p[1], 16, 16, SAND, rnd);                                             // sandstone top
  p = T(22); drawBricks(ctx, p[0], p[1], rnd);                                                          // bricks
  p = T(23); drawTNTSide(ctx, p[0], p[1], rnd);                                                         // tnt side
  p = T(24); drawTNTTop(ctx, p[0], p[1], rnd);                                                          // tnt top
  p = T(25); drawCraftingTop(ctx, p[0], p[1], rnd);                                                     // crafting top
  p = T(26); drawCraftingSide(ctx, p[0], p[1], rnd);                                                    // crafting side
  p = T(27); drawCraftingSide(ctx, p[0], p[1], rnd);                                                    // crafting front
  p = T(28); drawFurnace(ctx, p[0], p[1], true, rnd);                                                   // furnace front
  p = T(29); drawFurnace(ctx, p[0], p[1], false, rnd);                                                  // furnace side
  p = T(30); noiseFill(ctx, p[0], p[1], 16, 16, ['#6e6e6e', '#666666', '#767676', '#5e5e5e'], rnd);     // furnace top
  p = T(31);                                                                                            // glowstone
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#f9d97e', '#efc96b', '#e0b855'], rnd);
    for (let i = 0; i < 7; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      ctx.fillStyle = '#ffe9a3';
      ctx.fillRect(p[0] + x, p[1] + y, 2, 2);
    }
    for (let i = 0; i < 5; i++) px(ctx, p[0] + Math.floor(rnd() * 16), p[1] + Math.floor(rnd() * 16), '#c99b52');
  }
  p = T(32); drawLogSide(ctx, p[0], p[1], ['#3b2811', '#33220e', '#452f16', '#2b1c0b'], rnd);           // spruce log side
  p = T(33); drawLogTop(ctx, p[0], p[1], ['#3b2811', '#33220e'], '#6b4d2a', '#5d421f', '#7a5a33', rnd); // spruce log top
  p = T(34);                                                                                            // spruce leaves
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (rnd() > 0.14) px(ctx, p[0] + x, p[1] + y, pick(rnd, SLEAF));
  }
  p = T(35); drawBookshelf(ctx, p[0], p[1], rnd);                                                       // bookshelf
  p = T(36); drawCobble(ctx, p[0], p[1], rnd, true);                                                    // mossy cobble
  p = T(37); noiseFill(ctx, p[0], p[1], 16, 16, OBSID, rnd);                                            // obsidian

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  atlasCanvas = canvas;
  atlasTexture = texture;
  return { canvas, texture };
}

/** UV rect [u0, v0(bottom), u1, v1(top)] with half-texel inset */
export function tileUV(tileIndex: number): [number, number, number, number] {
  const tx = tileIndex % ATLAS_TILES;
  const ty = Math.floor(tileIndex / ATLAS_TILES);
  const inset = 0.25 / ATLAS_PX;
  const u0 = tx / ATLAS_TILES + inset;
  const u1 = (tx + 1) / ATLAS_TILES - inset;
  const v1 = 1 - ty / ATLAS_TILES - inset;
  const v0 = 1 - (ty + 1) / ATLAS_TILES + inset;
  return [u0, v0, u1, v1];
}

// ─── Crack (mining progress) textures ────────────────────────────────────────
let crackTextures: THREE.CanvasTexture[] | null = null;

export function getCrackTextures(): THREE.CanvasTexture[] {
  if (crackTextures) return crackTextures;
  const rnd = mulberry32(4242);
  // pre-generate two crack paths
  const paths: [number, number][][] = [];
  for (let pI = 0; pI < 3; pI++) {
    const path: [number, number][] = [];
    let x = 6 + Math.floor(rnd() * 4), y = 6 + Math.floor(rnd() * 4);
    for (let i = 0; i < 40; i++) {
      path.push([x, y]);
      x = Math.max(0, Math.min(15, x + Math.floor(rnd() * 3) - 1));
      y = Math.max(0, Math.min(15, y + Math.floor(rnd() * 3) - 1));
    }
    paths.push(path);
  }
  crackTextures = [];
  for (let stage = 0; stage < 10; stage++) {
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d') as Ctx;
    const frac = (stage + 1) / 10;
    ctx.fillStyle = 'rgba(20,14,10,0.85)';
    for (const path of paths) {
      const n = Math.ceil(path.length * frac);
      for (let i = 0; i < n; i++) {
        const [x, y] = path[i];
        ctx.fillRect(x, y, 1, 1);
        if (i % 3 === 0) ctx.fillRect(x + 1, y, 1, 1);
      }
    }
    const dots = Math.floor(stage * 2.2);
    for (let i = 0; i < dots; i++) ctx.fillRect(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 1, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    crackTextures.push(tex);
  }
  return crackTextures;
}

// ─── Average tile colors (for particles) ─────────────────────────────────────
const avgCache = new Map<number, [number, number, number]>();
export function tileAvgColor(tileIndex: number): [number, number, number] {
  const cached = avgCache.get(tileIndex);
  if (cached) return cached;
  const { canvas } = getAtlas();
  const ctx = canvas.getContext('2d') as Ctx;
  const tx = (tileIndex % ATLAS_TILES) * TILE_PX;
  const ty = Math.floor(tileIndex / ATLAS_TILES) * TILE_PX;
  const data = ctx.getImageData(tx, ty, TILE_PX, TILE_PX).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  if (n === 0) n = 1;
  const result: [number, number, number] = [r / n / 255, g / n / 255, b / n / 255];
  avgCache.set(tileIndex, result);
  return result;
}

// ─── Isometric block icons for UI ────────────────────────────────────────────
const iconCache = new Map<number, string>();

function shadedTile(tileIndex: number, brightness: number): HTMLCanvasElement {
  const { canvas } = getAtlas();
  const c = makeCanvas(TILE_PX, TILE_PX);
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const tx = (tileIndex % ATLAS_TILES) * TILE_PX;
  const ty = Math.floor(tileIndex / ATLAS_TILES) * TILE_PX;
  ctx.drawImage(canvas, tx, ty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  if (brightness < 1) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  }
  return c;
}

/** Isometric block icon dataURL (like Minecraft inventory) */
export function getBlockIcon(blockId: number, topTile: number, sideTile: number): string {
  const cached = iconCache.get(blockId);
  if (cached) return cached;
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const k = 20; // half-width of the cube in px
  const ox = S / 2, oy = S / 2 + 2;
  // vertices: S=(ox,oy) front-top-center, N=(ox,oy-k), E=(ox+k,oy-k/2), W=(ox-k,oy-k/2)
  const top = shadedTile(topTile, 1.0);
  const left = shadedTile(sideTile, 0.72);
  const right = shadedTile(sideTile, 0.5);
  // Top face: origin W, u=N-W=(k,-k/2), v=S-W=(k,k/2)
  ctx.setTransform(k, -k / 2, k, k / 2, ox - k, oy - k / 2);
  ctx.drawImage(top, 0, 0, 1, 1);
  // Left face: origin W, u=S-W=(k,k/2), v=(0,k)
  ctx.setTransform(k, k / 2, 0, k, ox - k, oy - k / 2);
  ctx.drawImage(left, 0, 0, 1, 1);
  // Right face: origin S=(ox,oy), u=E-S=(k,-k/2), v=(0,k)
  ctx.setTransform(k, -k / 2, 0, k, ox, oy);
  ctx.drawImage(right, 0, 0, 1, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const url = c.toDataURL();
  iconCache.set(blockId, url);
  return url;
}
