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
const JLEAF = ['#4fa827', '#459623', '#5cba2f', '#3a821c', '#6bcb3c'];
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
  drawPlanksPal(ctx, tx, ty, rnd, ['#a2824e', '#967847', '#ab8b55', '#8f7040'], '#6b5230', '#7a5f3a');
}

/** palette-parameterized plank drawer (oak uses the classic colors; spruce/jungle recolor) */
function drawPlanksPal(ctx: Ctx, tx: number, ty: number, rnd: () => number, base: string[], groove: string, joint: string): void {
  for (let b = 0; b < 4; b++) {
    noiseFill(ctx, tx, ty + b * 4, 16, 3, base, rnd);
    ctx.fillStyle = groove;
    ctx.fillRect(tx, ty + b * 4 + 3, 16, 1);
    const joint2 = [12, 4, 9, 2][b];
    ctx.fillStyle = joint;
    ctx.fillRect(tx + joint2, ty + b * 4, 1, 3);
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

// ─── Phase 3 tile painters ─────────────────────────────────────────────────
function drawTorchTile(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  // wooden stick (column x=7..8, y=6..15)
  for (let y = 6; y < 16; y++)
    for (let x = 7; x < 9; x++)
      px(ctx, tx + x, ty + y, rnd() < 0.3 ? '#8a683c' : '#75562f');
  px(ctx, tx + 8, ty + 8, '#5d421f'); px(ctx, tx + 8, ty + 11, '#5d421f');
  // flame
  ctx.fillStyle = '#ffd83d';
  ctx.fillRect(tx + 7, ty + 3, 2, 3);
  ctx.fillStyle = '#ff9d2e';
  ctx.fillRect(tx + 7, ty + 5, 2, 1); ctx.fillRect(tx + 6, ty + 4, 1, 1); ctx.fillRect(tx + 9, ty + 4, 1, 1);
  ctx.fillStyle = '#fff3b0';
  ctx.fillRect(tx + 7, ty + 4, 1, 1);
  px(ctx, tx + 7, ty + 2, '#fff3b0'); px(ctx, tx + 8, ty + 2, '#ff9d2e');
}

function drawFurnaceFrontOn(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  drawFurnace(ctx, tx, ty, false, rnd);
  // opening with fire
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(tx + 4, ty + 8, 8, 6);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(tx + 4, ty + 7, 8, 1);
  const fire = ['#ff9d2e', '#ffd83d', '#e86a17', '#fff3b0'];
  for (let x = 5; x < 11; x++) {
    const h = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < h; i++) px(ctx, tx + x, ty + 13 - i, pick(rnd, fire));
  }
  px(ctx, tx + 6, ty + 11, '#e86a17'); px(ctx, tx + 9, ty + 12, '#ffd83d');
}

function drawChest(ctx: Ctx, tx: number, ty: number, front: boolean, rnd: () => number): void {
  // wooden chest body
  noiseFill(ctx, tx, ty, 16, 16, ['#a5763e', '#96682f', '#b08044', '#8a5c2a', '#a97a3e'], rnd);
  // frame
  ctx.fillStyle = '#5d3f1d';
  ctx.fillRect(tx, ty, 16, 1); ctx.fillRect(tx, ty + 15, 16, 1);
  ctx.fillRect(tx, ty, 1, 16); ctx.fillRect(tx + 15, ty, 1, 16);
  ctx.fillRect(tx, ty + 6, 16, 1); // lid seam
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(tx + 1, ty + 1, 14, 1); ctx.fillRect(tx + 1, ty + 1, 1, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(tx + 1, ty + 14, 14, 1); ctx.fillRect(tx + 14, ty + 2, 1, 13);
  if (front) {
    // iron latch
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(tx + 6, ty + 4, 4, 5);
    ctx.fillStyle = '#8f8f8f';
    ctx.fillRect(tx + 6, ty + 4, 4, 1); ctx.fillRect(tx + 6, ty + 4, 1, 4);
    ctx.fillStyle = '#6a6a6a';
    ctx.fillRect(tx + 9, ty + 5, 1, 4);
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(tx + 7, ty + 6, 2, 2);
  }
}

function drawFlower(ctx: Ctx, tx: number, ty: number, petals: string[], center: string, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  // stem
  ctx.fillStyle = '#3d7a24';
  ctx.fillRect(tx + 7, ty + 8, 1, 8);
  px(ctx, tx + 6, ty + 11, '#4d8f2e'); px(ctx, tx + 9, ty + 9, '#4d8f2e');
  px(ctx, tx + 6, ty + 12, '#356a1e'); px(ctx, tx + 9, ty + 10, '#356a1e');
  // petals 2x2 cluster around (7.5, 5.5)
  const spots: [number, number][] = [[7, 3], [6, 4], [8, 4], [7, 5], [5, 5], [9, 5], [6, 6], [8, 6], [7, 7], [7, 4], [8, 5], [6, 5]];
  for (const [sx, sy] of spots) px(ctx, tx + sx, ty + sy, pick(rnd, petals));
  px(ctx, tx + 7, ty + 5, center); px(ctx, tx + 8, ty + 5, center);
}

function drawTallGrassTile(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  const greens = ['#5d9c33', '#6fae3e', '#4d8a2a', '#79bb48', '#568e30'];
  for (let i = 0; i < 9; i++) {
    let x = 2 + Math.floor(rnd() * 12);
    const h = 6 + Math.floor(rnd() * 8);
    const c = pick(rnd, greens);
    for (let j = 0; j < h; j++) {
      px(ctx, tx + x, ty + 15 - j, c);
      if (j > h * 0.55 && rnd() < 0.35) x += rnd() < 0.5 ? 1 : -1;
      x = Math.max(0, Math.min(15, x));
    }
  }
}

function drawSugarcaneTile(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  // 3 vertical stalks with joints
  const stalks = [3, 7, 11];
  for (const sx of stalks) {
    const c = pick(rnd, ['#9fca5c', '#8fbc4c', '#a9d468']);
    for (let y = 0; y < 16; y++) {
      px(ctx, tx + sx, ty + 15 - y, y % 5 === 4 ? '#7ca23b' : c);
      if (sx < 15 && rnd() < 0.7) px(ctx, tx + sx + 1, ty + 15 - y, y % 5 === 4 ? '#6f9433' : '#94c052');
    }
    // leaf blade
    const ly = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < 4; k++) px(ctx, tx + sx - 1 - k, ty + ly + k, '#7ca23b');
  }
}

function drawDeadBushTile(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  const browns = ['#96702f', '#7d5c26', '#a87f38', '#6b4e1f'];
  // central trunk + branches
  for (let y = 15; y >= 7; y--) px(ctx, tx + 7, ty + y, pick(rnd, browns));
  const branches: [number, number, number][][] = [
    [[7, 10], [5, 8], [4, 6], [3, 5]],
    [[7, 10], [9, 8], [11, 6], [12, 4]],
    [[7, 9], [6, 6], [5, 4]],
    [[7, 9], [8, 7], [10, 5]],
  ];
  for (const b of branches) {
    for (const [bx, by] of b) {
      px(ctx, tx + bx, ty + by, pick(rnd, browns));
      if (rnd() < 0.5) px(ctx, tx + bx + (bx < 7 ? -1 : 1), ty + by, pick(rnd, browns));
    }
  }
}

function drawLilyPadTile(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  ctx.clearRect(tx, ty, 16, 16);
  const greens = ['#1f7a2d', '#268c36', '#186a24', '#2f9c40'];
  // circular pad (notched like MC)
  const cx0 = 7.5, cy0 = 7.5, R = 6.5;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - cx0, dy = y - cy0;
      if (dx * dx + dy * dy <= R * R) px(ctx, tx + x, ty + y, pick(rnd, greens));
    }
  // notch (pac-man wedge toward top-right)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - cx0, dy = y - cy0;
      if (dx >= 0 && dy <= 0 && dx + (-dy) < 5) ctx.clearRect(tx + x, ty + y, 1, 1);
    }
  // veins
  for (let k = 2; k < 7; k++) px(ctx, tx + 7 + Math.floor(k * 0.6), ty + 8 - k, '#156020');
  px(ctx, tx + 6, ty + 8, '#156020'); px(ctx, tx + 9, ty + 8, '#156020');
}

function drawCactusSide(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, ['#0f7a1e', '#0c6a19', '#128a24', '#0a5c15', '#159630'], rnd);
  // ribs
  for (const x of [1, 5, 9, 13]) {
    for (let y = 0; y < 16; y++) px(ctx, tx + x, ty + y, y % 4 === 0 ? '#0a5413' : '#0d701a');
  }
  // highlight edge
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(tx + 1, ty, 1, 16);
  // spikes
  for (let i = 0; i < 7; i++) px(ctx, tx + Math.floor(rnd() * 16), ty + Math.floor(rnd() * 16), '#d8e8c0');
}

function drawCactusTop(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  noiseFill(ctx, tx, ty, 16, 16, ['#128a24', '#0f7a1e', '#159630', '#0c6a19'], rnd);
  ctx.fillStyle = '#0a5413';
  ctx.fillRect(tx, ty, 16, 1); ctx.fillRect(tx, ty + 15, 16, 1);
  ctx.fillRect(tx, ty, 1, 16); ctx.fillRect(tx + 15, ty, 1, 16);
  ctx.fillStyle = '#35a848';
  ctx.fillRect(tx + 4, ty + 4, 8, 8);
  ctx.fillStyle = '#1c6b2a';
  ctx.fillRect(tx + 6, ty + 6, 4, 4);
  for (let i = 0; i < 5; i++) px(ctx, tx + 2 + Math.floor(rnd() * 12), ty + 2 + Math.floor(rnd() * 12), '#d8e8c0');
}

function drawWool(ctx: Ctx, tx: number, ty: number, rnd: () => number, palette?: string[]): void {
  const cols = palette ?? ['#e8e8e8', '#dcdcdc', '#f4f4f4', '#d0d0d0', '#eeeeee'];
  noiseFill(ctx, tx, ty, 16, 16, cols, rnd);
  // soft curls (bright + dark relative to base)
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(rnd() * 14), y = Math.floor(rnd() * 14);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(tx + x, ty + y, 2, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(tx + x, ty + y + 1, 2, 1);
  }
}

function drawBedTop(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  // mattress base (planks-ish white sheet)
  noiseFill(ctx, tx, ty, 16, 16, ['#b03a2e', '#a03328', '#bd4536', '#963026', '#c74e3c'], rnd);
  // blanket fold
  ctx.fillStyle = '#7a1f16';
  ctx.fillRect(tx, ty + 7, 16, 1);
  ctx.fillStyle = '#d8564a';
  ctx.fillRect(tx, ty + 8, 16, 1);
  // pillow (top third)
  noiseFill(ctx, tx + 1, ty + 1, 14, 5, ['#f2f2f2', '#e6e6e6', '#fafafa', '#dcdcdc'], rnd);
  ctx.fillStyle = '#b8b8b8';
  ctx.fillRect(tx + 1, ty + 6, 14, 1);
  px(ctx, tx + 2, ty + 2, '#ffffff'); px(ctx, tx + 3, ty + 2, '#ffffff');
  // corner stitches
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(tx, ty, 16, 1); ctx.fillRect(tx, ty, 1, 16); ctx.fillRect(tx + 15, ty, 1, 16); ctx.fillRect(tx, ty + 15, 16, 1);
}

function drawBedSide(ctx: Ctx, tx: number, ty: number, rnd: () => number): void {
  // bed frame legs (bottom half planks)
  drawPlanks(ctx, tx, ty, rnd, false);
  // red blanket covers upper area
  noiseFill(ctx, tx, ty, 16, 6, ['#b03a2e', '#a03328', '#bd4536', '#963026'], rnd);
  ctx.fillStyle = '#7a1f16';
  ctx.fillRect(tx, ty + 6, 16, 1);
  ctx.fillStyle = '#5d3f1d';
  ctx.fillRect(tx, ty, 16, 1);
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
  p = T(38); drawTorchTile(ctx, p[0], p[1], rnd);                                                       // torch
  p = T(39); drawFurnaceFrontOn(ctx, p[0], p[1], rnd);                                                  // furnace front lit
  p = T(40); drawChest(ctx, p[0], p[1], true, rnd);                                                     // chest front
  p = T(41); drawChest(ctx, p[0], p[1], false, rnd);                                                    // chest side
  p = T(42); drawChest(ctx, p[0], p[1], false, rnd);                                                    // chest top
  p = T(43); drawFlower(ctx, p[0], p[1], ['#d8382e', '#c22a22', '#e84a3e'], '#2c2c2c', rnd);            // poppy
  p = T(44); drawFlower(ctx, p[0], p[1], ['#f6d33c', '#e8c227', '#fce88a'], '#c9930f', rnd);            // dandelion
  p = T(45); drawTallGrassTile(ctx, p[0], p[1], rnd);                                                   // tall grass
  p = T(46); drawCactusSide(ctx, p[0], p[1], rnd);                                                      // cactus side
  p = T(47); drawCactusTop(ctx, p[0], p[1], rnd);                                                       // cactus top
  p = T(48); drawWool(ctx, p[0], p[1], rnd);                                                            // wool
  p = T(49); drawBedTop(ctx, p[0], p[1], rnd);                                                          // bed top
  p = T(50); drawBedSide(ctx, p[0], p[1], rnd);                                                         // bed side
  p = T(51); drawSugarcaneTile(ctx, p[0], p[1], rnd);                                                   // sugarcane
  p = T(52); drawDeadBushTile(ctx, p[0], p[1], rnd);                                                    // dead bush
  p = T(53); drawLilyPadTile(ctx, p[0], p[1], rnd);                                                     // lily pad
  p = T(54); drawLogSide(ctx, p[0], p[1], ['#7d6538', '#6e5930', '#8a7243', '#5f4d28'], rnd);           // jungle log side
  p = T(55);                                                                                            // jungle leaves
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (rnd() > 0.15) px(ctx, p[0] + x, p[1] + y, pick(rnd, JLEAF));
  }
  p = T(56); drawWool(ctx, p[0], p[1], rnd, ['#c8c8c8', '#bcbcbc', '#d2d2d2', '#b2b2b2', '#cfcfcf']);   // light gray wool
  p = T(57); drawWool(ctx, p[0], p[1], rnd, ['#8a8a8a', '#7e7e7e', '#969696', '#727272', '#909090']);   // gray wool
  p = T(58); drawWool(ctx, p[0], p[1], rnd, ['#8a6a4a', '#7c5e40', '#9a7a56', '#6a5034', '#92724e']);   // brown wool
  p = T(59); drawWool(ctx, p[0], p[1], rnd, ['#3a3a3a', '#303030', '#444444', '#282828', '#3e3e3e']);   // black wool

  // ── phase 8: mushroom biome tiles 60-66 ──
  p = T(60);                                                                                             // mycelium top
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#8a7290', '#7e687e', '#947c9a', '#74607a', '#9c849e'], rnd);
    // purple speckle threads
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15);
      px(ctx, p[0] + x, p[1] + y, '#b09ab4');
      if (rnd() > 0.5) px(ctx, p[0] + x + 1, p[1] + y, '#6a566e');
    }
  }
  p = T(61);                                                                                             // mycelium side
  {
    noiseFill(ctx, p[0], p[1], 16, 5, ['#8a7290', '#7e687e', '#947c9a', '#74607a'], rnd);
    noiseFill(ctx, p[0], p[1] + 5, 16, 11, DIRT, rnd);
    for (let i = 0; i < 5; i++) px(ctx, p[0] + Math.floor(rnd() * 16), p[1] + 5, '#9c849e');
  }
  p = T(62);                                                                                             // mushroom stem
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#d8d0c0', '#cec6b4', '#e2dacb'], rnd);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15);
      px(ctx, p[0] + x, p[1] + y, '#b8b0a0'); px(ctx, p[0] + x, p[1] + y + 1, '#c0b8a8');
    }
  }
  p = T(63);                                                                                             // red mushroom cap
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#c22a22', '#b02420', '#d13a2e'], rnd);
    // white spots
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(rnd() * 13), y = 1 + Math.floor(rnd() * 13);
      ctx.fillStyle = '#f0e8e0';
      ctx.fillRect(p[0] + x, p[1] + y, 2, 2);
      if (rnd() > 0.5) px(ctx, p[0] + x + 2, p[1] + y + 1, '#f0e8e0');
    }
  }
  p = T(64);                                                                                             // brown mushroom cap
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#9c7448', '#8e683e', '#a88154'], rnd);
    for (let i = 0; i < 8; i++) px(ctx, p[0] + Math.floor(rnd() * 16), p[1] + Math.floor(rnd() * 16), '#7a5834');
    for (let i = 0; i < 6; i++) px(ctx, p[0] + Math.floor(rnd() * 16), p[1] + Math.floor(rnd() * 16), '#c09868');
  }
  p = T(65);                                                                                             // small red mushroom
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    // stalk
    ctx.fillStyle = '#e0d8c8';
    ctx.fillRect(p[0] + 7, p[1] + 9, 2, 6);
    px(ctx, p[0] + 7, p[1] + 9, '#c8c0b0');
    // cap
    ctx.fillStyle = '#c22a22';
    ctx.fillRect(p[0] + 4, p[1] + 6, 8, 3);
    ctx.fillRect(p[0] + 5, p[1] + 5, 6, 1);
    ctx.fillStyle = '#e85048';
    ctx.fillRect(p[0] + 5, p[1] + 6, 6, 1);
    ctx.fillStyle = '#f0e8e0';
    px(ctx, p[0] + 6, p[1] + 6, '#f0e8e0'); px(ctx, p[0] + 9, p[1] + 7, '#f0e8e0');
    ctx.fillStyle = '#8a1810';
    ctx.fillRect(p[0] + 4, p[1] + 8, 8, 1);
  }
  p = T(66);                                                                                             // small brown mushroom
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(p[0] + 7, p[1] + 9, 2, 6);
    px(ctx, p[0] + 7, p[1] + 9, '#c0b8a8');
    ctx.fillStyle = '#9c7448';
    ctx.fillRect(p[0] + 5, p[1] + 6, 6, 3);
    ctx.fillRect(p[0] + 6, p[1] + 5, 4, 1);
    ctx.fillStyle = '#c09868';
    ctx.fillRect(p[0] + 6, p[1] + 6, 4, 1);
    ctx.fillStyle = '#6e4e2c';
    ctx.fillRect(p[0] + 5, p[1] + 8, 6, 1);
  }

  // ── phase 9: farming tiles 67-74 ──
  p = T(67);                                                                                             // farmland top (wet furrows)
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#4e3418', '#442c12', '#583a1e', '#3c2810'], rnd);
    // horizontal furrow grooves
    for (const y of [2, 3, 7, 8, 12, 13]) {
      for (let x = 0; x < 16; x++) {
        if (rnd() > 0.75) continue;
        px(ctx, p[0] + x, p[1] + y, '#33220c');
        if (rnd() > 0.6) px(ctx, p[0] + x, p[1] + y + 1, '#63421f');
      }
    }
    // moisture speckles
    for (let i = 0; i < 8; i++) px(ctx, p[0] + Math.floor(rnd() * 16), p[1] + Math.floor(rnd() * 16), '#2c1c0a');
  }
  p = T(68);                                                                                             // farmland side (dirt with dark rim)
  {
    noiseFill(ctx, p[0], p[1], 16, 16, DIRT, rnd);
    noiseFill(ctx, p[0], p[1], 16, 3, ['#4e3418', '#442c12', '#583a1e'], rnd);
    ctx.fillStyle = '#33220c';
    ctx.fillRect(p[0], p[1] + 3, 16, 1);
  }
  p = T(69);                                                                                             // wheat stage 0 (green sprouts)
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (const sx2 of [2, 5, 8, 11, 14]) {
      ctx.fillStyle = '#5da03f';
      ctx.fillRect(p[0] + sx2, p[1] + 11, 1, 5);
      px(ctx, p[0] + sx2 - 1, p[1] + 11, '#4c8a32');
      px(ctx, p[0] + sx2 + 1, p[1] + 12, '#6db34c');
    }
  }
  p = T(70);                                                                                             // wheat stage 1 (taller green)
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (const sx2 of [1, 4, 7, 10, 13]) {
      ctx.fillStyle = '#5da03f';
      ctx.fillRect(p[0] + sx2, p[1] + 7, 1, 9);
      px(ctx, p[0] + sx2 - 1, p[1] + 9, '#4c8a32');
      px(ctx, p[0] + sx2 + 1, p[1] + 10, '#6db34c');
      px(ctx, p[0] + sx2, p[1] + 6, '#7cc25a');
    }
  }
  p = T(71);                                                                                             // wheat stage 2 (tall, tips yellowing)
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (const sx2 of [1, 4, 7, 10, 13]) {
      ctx.fillStyle = '#7ca848';
      ctx.fillRect(p[0] + sx2, p[1] + 4, 1, 12);
      px(ctx, p[0] + sx2 - 1, p[1] + 7, '#6a9238');
      px(ctx, p[0] + sx2 + 1, p[1] + 9, '#8cb856');
      ctx.fillStyle = '#c9b84e';
      ctx.fillRect(p[0] + sx2, p[1] + 3, 1, 2);
    }
  }
  p = T(72);                                                                                             // wheat stage 3 (mature golden)
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    for (const sx2 of [1, 4, 7, 10, 13]) {
      // golden stalks
      ctx.fillStyle = '#c9b455';
      ctx.fillRect(p[0] + sx2, p[1] + 3, 1, 13);
      // grain heads
      ctx.fillStyle = '#dcc25e';
      ctx.fillRect(p[0] + sx2 - 1, p[1] + 2, 3, 4);
      ctx.fillStyle = '#b89b3e';
      ctx.fillRect(p[0] + sx2 - 1, p[1] + 5, 3, 1);
      px(ctx, p[0] + sx2, p[1] + 1, '#e8d478');
      // side leaves
      px(ctx, p[0] + sx2 - 1, p[1] + 8, '#9aa848');
      px(ctx, p[0] + sx2 + 1, p[1] + 10, '#9aa848');
    }
  }
  p = T(73);                                                                                             // oak sapling
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    // small stem
    ctx.fillStyle = '#6b4d2a';
    ctx.fillRect(p[0] + 7, p[1] + 9, 2, 7);
    // leaf clumps
    ctx.fillStyle = '#4c8a32';
    ctx.fillRect(p[0] + 4, p[1] + 6, 8, 4);
    ctx.fillRect(p[0] + 5, p[1] + 4, 6, 2);
    ctx.fillRect(p[0] + 2, p[1] + 8, 3, 2);
    ctx.fillRect(p[0] + 11, p[1] + 7, 3, 2);
    ctx.fillStyle = '#6db34c';
    px(ctx, p[0] + 6, p[1] + 5, '#6db34c'); px(ctx, p[0] + 9, p[1] + 5, '#6db34c');
    px(ctx, p[0] + 5, p[1] + 7, '#6db34c'); px(ctx, p[0] + 10, p[1] + 8, '#6db34c');
    ctx.fillStyle = '#3a7026';
    px(ctx, p[0] + 5, p[1] + 9, '#3a7026'); px(ctx, p[0] + 10, p[1] + 9, '#3a7026');
    px(ctx, p[0] + 7, p[1] + 6, '#3a7026');
  }
  p = T(74);                                                                                             // spruce sapling (conical, dark)
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    ctx.fillStyle = '#3b2811';
    ctx.fillRect(p[0] + 7, p[1] + 11, 2, 5);
    // layered dark green needles
    ctx.fillStyle = '#2c5530';
    ctx.fillRect(p[0] + 4, p[1] + 10, 8, 2);
    ctx.fillRect(p[0] + 5, p[1] + 7, 6, 2);
    ctx.fillRect(p[0] + 6, p[1] + 4, 4, 2);
    ctx.fillRect(p[0] + 7, p[1] + 2, 2, 2);
    ctx.fillStyle = '#3d7342';
    px(ctx, p[0] + 6, p[1] + 8, '#3d7342'); px(ctx, p[0] + 9, p[1] + 5, '#3d7342');
    px(ctx, p[0] + 7, p[1] + 3, '#3d7342'); px(ctx, p[0] + 5, p[1] + 11, '#3d7342');
    ctx.fillStyle = '#1e3d22';
    px(ctx, p[0] + 8, p[1] + 11, '#1e3d22'); px(ctx, p[0] + 7, p[1] + 6, '#1e3d22');
  }

  // ── phase 11: enchanting tiles 75-77 ──
  p = T(75); drawOre(ctx, p[0], p[1], ['#2a52c8', '#1e42b0', '#3a64d8'], rnd);                          // lapis ore
  p = T(76);                                                                                             // enchanting table top (open book on obsidian)
  {
    // obsidian base field
    noiseFill(ctx, p[0], p[1], 16, 16, OBSID, rnd);
    // open book: two pages with a spine
    ctx.fillStyle = '#5c1a14';
    ctx.fillRect(p[0] + 1, p[1] + 3, 14, 9);
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(p[0] + 2, p[1] + 4, 5, 7);
    ctx.fillRect(p[0] + 9, p[1] + 4, 5, 7);
    ctx.fillStyle = '#c8bca4';
    ctx.fillRect(p[0] + 7, p[1] + 4, 2, 7);
    // page text squiggles
    for (let i = 0; i < 8; i++) {
      px(ctx, p[0] + 3 + (i % 3), p[1] + 5 + i, '#a89c84');
      px(ctx, p[0] + 10 + (i % 3), p[1] + 5 + i, '#a89c84');
    }
    // magic glints
    px(ctx, p[0] + 3, p[1] + 2, '#c8a8ff'); px(ctx, p[0] + 12, p[1] + 1, '#c8a8ff');
    px(ctx, p[0] + 13, p[1] + 12, '#a888ff'); px(ctx, p[0] + 2, p[1] + 13, '#c8a8ff');
  }
  p = T(77);                                                                                             // enchanting table side (obsidian pedestal + book edge)
  {
    noiseFill(ctx, p[0], p[1], 16, 16, OBSID, rnd);
    // book edge band across the top
    ctx.fillStyle = '#5c1a14';
    ctx.fillRect(p[0], p[1], 16, 4);
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(p[0], p[1] + 1, 16, 2);
    ctx.fillStyle = '#c8bca4';
    ctx.fillRect(p[0], p[1] + 3, 16, 1);
    // diamond glow studs (MC has obsidian + diamonds in the frame)
    px(ctx, p[0] + 3, p[1] + 8, '#5decf5', 2, 2);
    px(ctx, p[0] + 11, p[1] + 11, '#5decf5', 2, 2);
    ctx.fillStyle = '#8ff5fb';
    px(ctx, p[0] + 3, p[1] + 8, '#8ff5fb'); px(ctx, p[0] + 11, p[1] + 11, '#8ff5fb');
  }

  // ── phase 13: brewing + cake tiles 78-88 ──
  // brewing stand rod (blaze-rod proxy: charred wood with ember band)
  p = T(78);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(p[0] + 6, p[1] + 1, 4, 15);
    ctx.fillStyle = '#5d4325';
    ctx.fillRect(p[0] + 6, p[1] + 1, 1, 15);
    ctx.fillStyle = '#8f6c40';
    ctx.fillRect(p[0] + 8, p[1] + 1, 1, 15);
    // ember band (magic glow)
    ctx.fillStyle = '#e88a2a';
    ctx.fillRect(p[0] + 6, p[1] + 7, 4, 2);
    ctx.fillStyle = '#ffc85a';
    ctx.fillRect(p[0] + 7, p[1] + 7, 2, 1);
  }
  // brewing stand base (dark cobble slab)
  p = T(79);
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#4c4c4c', '#444444', '#555555', '#3a3a3a'], rnd);
    ctx.fillStyle = '#5e5e5e';
    ctx.fillRect(p[0], p[1], 16, 2);
    ctx.fillStyle = '#333333';
    ctx.fillRect(p[0], p[1] + 15, 16, 1);
    // rune glints on the base
    px(ctx, p[0] + 3, p[1] + 5, '#c86af0'); px(ctx, p[0] + 11, p[1] + 9, '#c86af0');
    px(ctx, p[0] + 7, p[1] + 12, '#a84ad0');
  }
  // cake top (white frosting + red sprinkle dots)
  p = T(80);
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#f4f0e6', '#efe9dc', '#faf7f0'], rnd);
    for (const [dx, dy] of [[2, 3], [7, 2], [12, 4], [4, 8], [9, 7], [13, 10], [2, 12], [7, 12], [11, 13]] as [number, number][]) {
      px(ctx, p[0] + dx, p[1] + dy, '#c8382c', 2, 2);
      px(ctx, p[0] + dx, p[1] + dy, '#e05a4a');
    }
  }
  // cake side (frosting lip + sponge body with strawberry band)
  p = T(81);
  {
    // sponge body
    noiseFill(ctx, p[0], p[1], 16, 16, ['#d8a854', '#cf9e4a', '#e0b25e'], rnd);
    // frosting lip
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(p[0], p[1], 16, 4);
    ctx.fillStyle = '#efe9dc';
    for (const dx of [0, 3, 6, 9, 12, 15]) px(ctx, p[0] + dx, p[1] + 4, '#f4f0e6');
    // strawberry filling band
    ctx.fillStyle = '#c8382c';
    ctx.fillRect(p[0], p[1] + 7, 16, 2);
    ctx.fillStyle = '#e05a4a';
    ctx.fillRect(p[0] + 2, p[1] + 7, 2, 1);
    ctx.fillRect(p[0] + 9, p[1] + 7, 2, 1);
  }
  // cake inner cross-section (what a bite reveals: cream + sponge layers)
  p = T(82);
  {
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1] + 3, 16, 10, ['#d8a854', '#cf9e4a', '#e0b25e'], rnd);
    ctx.fillStyle = '#c8382c';
    ctx.fillRect(p[0], p[1] + 7, 16, 2);
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(p[0], p[1], 16, 3);
    ctx.fillRect(p[0], p[1] + 13, 16, 3);
  }
  // cake bottom (paper lining)
  p = T(83);
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#c8b488', '#bfa97c', '#d2bf94'], rnd);
    ctx.fillStyle = '#a89058';
    ctx.fillRect(p[0], p[1] + 15, 16, 1);
  }
  // cake bite sides 1-5: REMOVED (v0.52). The old tiles painted the bite as
  // a solid BLACK rectangle — users saw it as "part of the cake turned black".
  // Bites are now real geometry: the mesher shrinks the cake 2/16 per slice
  // (MC behavior) and the cut faces show the inner cross-section texture.

  // ── phase 14: carpentry tiles 89-98 ──
  // bed blanket (feet-half top: red blanket + fold line, no pillow)
  p = T(89);
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#b03a2e', '#a03328', '#bd4536', '#963026', '#c74e3c'], rnd);
    ctx.fillStyle = '#7a1f16';
    ctx.fillRect(p[0], p[1] + 7, 16, 1);
    ctx.fillStyle = '#d8564a';
    ctx.fillRect(p[0], p[1] + 8, 16, 1);
    // turned-down sheet edge at the foot end (bottom rows of the tile)
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(p[0], p[1] + 14, 16, 2);
    ctx.fillStyle = '#cfcabc';
    ctx.fillRect(p[0], p[1] + 13, 16, 1);
  }
  // bed pillow (soft white with a seam)
  p = T(90);
  {
    noiseFill(ctx, p[0], p[1], 16, 16, ['#f2f2f2', '#e8e8e8', '#fafafa', '#dedede'], rnd);
    ctx.fillStyle = '#c4c4c4';
    ctx.fillRect(p[0] + 1, p[1] + 7, 14, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p[0] + 2, p[1] + 2, 4, 2);
    ctx.fillRect(p[0] + 9, p[1] + 3, 3, 1);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(p[0], p[1] + 15, 16, 1);
  }
  // doors: top panel (with window) + bottom panel (plank carving), 3 woods
  const DOOR_WOODS: [string, string, string, string][] = [
    // [panel light, panel mid, panel dark, frame] — oak / spruce / jungle
    ['#b08d55', '#9a7843', '#7c5f33', '#6b5230'],
    ['#7a5b34', '#684c2a', '#523a1f', '#42301a'],
    ['#c08a5c', '#a8744a', '#8a5c38', '#6f4728'],
  ];
  const drawDoorBottom = (ti: number, w: typeof DOOR_WOODS[number]): void => {
    const q = T(ti);
    const [pl, pm, pd, fr] = w;
    noiseFill(ctx, q[0], q[1], 16, 16, [pm, pl, pm, pd], rnd);
    // frame border
    ctx.fillStyle = fr;
    ctx.fillRect(q[0], q[1], 16, 1); ctx.fillRect(q[0], q[1] + 15, 16, 1);
    ctx.fillRect(q[0], q[1], 1, 16); ctx.fillRect(q[0] + 15, q[1], 1, 16);
    // two recessed panels
    for (const ry of [2, 9]) {
      ctx.fillStyle = pd;
      ctx.fillRect(q[0] + 3, q[1] + ry, 10, 6);
      ctx.fillStyle = pl;
      ctx.fillRect(q[0] + 4, q[1] + ry, 8, 4);
      ctx.fillStyle = pm;
      ctx.fillRect(q[0] + 4, q[1] + ry + 4, 8, 1);
    }
  };
  const drawDoorTop = (ti: number, w: typeof DOOR_WOODS[number]): void => {
    const q = T(ti);
    const [pl, pm, pd, fr] = w;
    noiseFill(ctx, q[0], q[1], 16, 16, [pm, pl, pm, pd], rnd);
    ctx.fillStyle = fr;
    ctx.fillRect(q[0], q[1], 16, 1); ctx.fillRect(q[0], q[1] + 15, 16, 1);
    ctx.fillRect(q[0], q[1], 1, 16); ctx.fillRect(q[0] + 15, q[1], 1, 16);
    // window (transparent hole with glass tint pixels) — cutout pass
    ctx.clearRect(q[0] + 4, q[1] + 2, 3, 4);
    ctx.clearRect(q[0] + 9, q[1] + 2, 3, 4);
    ctx.fillStyle = 'rgba(200,228,235,0.85)';
    ctx.fillRect(q[0] + 4, q[1] + 5, 3, 1); ctx.fillRect(q[0] + 9, q[1] + 5, 3, 1);
    // lower recessed panel
    ctx.fillStyle = pd;
    ctx.fillRect(q[0] + 3, q[1] + 9, 10, 5);
    ctx.fillStyle = pl;
    ctx.fillRect(q[0] + 4, q[1] + 10, 8, 3);
    // diagonal brace
    ctx.fillStyle = fr;
    for (let i = 0; i < 6; i++) px(ctx, q[0] + 3 + i, q[1] + 14 - i, fr);
  };
  drawDoorTop(91, DOOR_WOODS[0]); drawDoorBottom(92, DOOR_WOODS[0]);   // oak
  drawDoorTop(93, DOOR_WOODS[1]); drawDoorBottom(94, DOOR_WOODS[1]);   // spruce
  drawDoorTop(95, DOOR_WOODS[2]); drawDoorBottom(96, DOOR_WOODS[2]);   // jungle
  // spruce / jungle planks
  p = T(97);
  drawPlanksPal(ctx, p[0], p[1], rnd, ['#7a5b34', '#684c2a', '#71522f', '#5d4527'], '#3e2d17', '#4a3820');
  p = T(98);
  drawPlanksPal(ctx, p[0], p[1], rnd, ['#c08a5c', '#b07d50', '#c69464', '#a8744a'], '#7c5432', '#8a5f3a');

  // ── phase 15: woodwork II tiles (trapdoors / ladder / gates / fence icons) ──
  // trapdoors: plank base + 1px frame; oak gets an X-brace lattice (MC oak
  // trapdoor), spruce horizontal slats, jungle a center stile + bars.
  const drawTrapdoor = (ti: number, w: typeof DOOR_WOODS[number], style: 'oak' | 'spruce' | 'jungle'): void => {
    const q = T(ti);
    const [pl, pm, pd, fr] = w;
    noiseFill(ctx, q[0], q[1], 16, 16, [pm, pl, pm, pd], rnd);
    // frame border
    ctx.fillStyle = fr;
    ctx.fillRect(q[0], q[1], 16, 1); ctx.fillRect(q[0], q[1] + 15, 16, 1);
    ctx.fillRect(q[0], q[1], 1, 16); ctx.fillRect(q[0] + 15, q[1], 1, 16);
    if (style === 'oak') {
      // diagonal lattice (two crossing braces) like MC oak trapdoors
      for (let i = 0; i < 14; i++) px(ctx, q[0] + 1 + i, q[1] + 1 + i, fr);
      for (let i = 0; i < 14; i++) px(ctx, q[0] + 14 - i, q[1] + 1 + i, fr);
    } else if (style === 'spruce') {
      // three horizontal slats with dark grooves
      for (const ry of [3, 7, 11]) {
        ctx.fillStyle = pd;
        ctx.fillRect(q[0] + 1, q[1] + ry, 14, 2);
        ctx.fillStyle = pl;
        ctx.fillRect(q[0] + 1, q[1] + ry + 2, 14, 1);
      }
    } else {
      // jungle: center vertical stile + two side bars
      ctx.fillStyle = fr;
      ctx.fillRect(q[0] + 7, q[1] + 1, 2, 14);
      ctx.fillStyle = pd;
      ctx.fillRect(q[0] + 2, q[1] + 3, 3, 10);
      ctx.fillRect(q[0] + 11, q[1] + 3, 3, 10);
      ctx.fillStyle = pl;
      ctx.fillRect(q[0] + 3, q[1] + 4, 1, 8);
      ctx.fillRect(q[0] + 12, q[1] + 4, 1, 8);
    }
  };
  drawTrapdoor(84, DOOR_WOODS[0], 'oak');
  drawTrapdoor(85, DOOR_WOODS[1], 'spruce');
  drawTrapdoor(86, DOOR_WOODS[2], 'jungle');
  // ladder: transparent background, two vertical rails + four rungs (cutout)
  p = T(87);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const railL = '#8a6a3c', railD = '#6b4f2a', rung = '#9a7843', rungD = '#5d4527';
    // vertical rails
    ctx.fillStyle = railL;
    ctx.fillRect(p[0] + 2, p[1], 3, 16);
    ctx.fillRect(p[0] + 11, p[1], 3, 16);
    ctx.fillStyle = railD;
    ctx.fillRect(p[0] + 4, p[1], 1, 16);
    ctx.fillRect(p[0] + 13, p[1], 1, 16);
    // rungs with a dark underline for depth
    for (const ry of [1, 6, 11]) {
      ctx.fillStyle = rung;
      ctx.fillRect(p[0] + 4, p[1] + ry, 8, 2);
      ctx.fillStyle = rungD;
      ctx.fillRect(p[0] + 4, p[1] + ry + 2, 8, 1);
    }
  }
  // fence gates: plank panel with top/bottom rails + X brace (panel texture)
  const drawGate = (ti: number, w: typeof DOOR_WOODS[number]): void => {
    const q = T(ti);
    const [pl, pm, pd, fr] = w;
    noiseFill(ctx, q[0], q[1], 16, 16, [pm, pl, pm, pd], rnd);
    // top + bottom rails
    ctx.fillStyle = fr;
    ctx.fillRect(q[0], q[1], 16, 2); ctx.fillRect(q[0], q[1] + 14, 16, 2);
    // center vertical stile
    ctx.fillStyle = pd;
    ctx.fillRect(q[0] + 7, q[1] + 2, 2, 12);
    // X brace between the rails
    ctx.fillStyle = fr;
    for (let i = 0; i < 12; i++) {
      px(ctx, q[0] + 2 + i, q[1] + 2 + i, fr);
      px(ctx, q[0] + 13 - i, q[1] + 2 + i, fr);
    }
  };
  drawGate(88, DOOR_WOODS[0]);
  drawGate(99, DOOR_WOODS[1]);
  drawGate(100, DOOR_WOODS[2]);
  // fence inventory icons: transparent bg, center post + side rail stubs
  const drawFenceIcon = (ti: number, w: typeof DOOR_WOODS[number]): void => {
    const q = T(ti);
    const [pl, pm, pd, fr] = w;
    ctx.clearRect(q[0], q[1], 16, 16);
    // center post (full height)
    noiseFill(ctx, q[0] + 6, q[1], 4, 16, [pm, pl, pm], rnd);
    ctx.fillStyle = fr;
    ctx.fillRect(q[0] + 6, q[1], 1, 16); ctx.fillRect(q[0] + 9, q[1], 1, 16);
    // rail stubs left + right at two heights
    for (const ry of [3, 10]) {
      noiseFill(ctx, q[0], q[1] + ry, 16, 3, [pm, pl, pd], rnd);
      ctx.fillStyle = fr;
      ctx.fillRect(q[0], q[1] + ry, 16, 1);
    }
  };
  drawFenceIcon(101, DOOR_WOODS[0]);
  drawFenceIcon(102, DOOR_WOODS[1]);
  drawFenceIcon(103, DOOR_WOODS[2]);

  // ── phase 16: glasswork & masonry tiles (pane icon / iron bars / wall icons) ──
  // glass pane inventory icon: transparent bg, thin glass cross (center column
  // + horizontal band) with the classic glass edge glint.
  p = T(104);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const glint = '#e6f4f5', edge = '#b7d7da', fill = 'rgba(200,232,236,0.55)', dark = '#9fc4c9';
    ctx.fillStyle = fill;
    ctx.fillRect(p[0] + 7, p[1], 2, 16);           // center column
    ctx.fillRect(p[0], p[1] + 7, 16, 2);           // horizontal band
    ctx.fillStyle = edge;
    ctx.fillRect(p[0] + 7, p[1], 1, 16); ctx.fillRect(p[0], p[1] + 7, 16, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(p[0] + 8, p[1], 1, 16); ctx.fillRect(p[0], p[1] + 8, 16, 1);
    // corner glints (glass highlight specks)
    ctx.fillStyle = glint;
    px(ctx, p[0] + 3, p[1] + 4, glint); px(ctx, p[0] + 4, p[1] + 3, glint);
    px(ctx, p[0] + 11, p[1] + 12, glint); px(ctx, p[0] + 12, p[1] + 11, glint);
  }
  // iron bars: transparent bg lattice — two vertical bars + horizontal bands
  // (MC iron bars read as dark iron with bright top highlights)
  p = T(105);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const hi = '#9aa0ad', mid = '#6f7580', dark = '#3d4149', deep = '#2a2d33';
    for (const bx of [3, 10]) {
      ctx.fillStyle = mid;
      ctx.fillRect(p[0] + bx, p[1], 3, 16);
      ctx.fillStyle = hi;                          // left highlight edge
      ctx.fillRect(p[0] + bx, p[1], 1, 16);
      ctx.fillStyle = dark;                        // right shade edge
      ctx.fillRect(p[0] + bx + 2, p[1], 1, 16);
    }
    // horizontal connector bands (top/mid/bottom)
    for (const by of [1, 7, 13]) {
      ctx.fillStyle = deep;
      ctx.fillRect(p[0], p[1] + by, 16, 2);
      ctx.fillStyle = mid;
      ctx.fillRect(p[0], p[1] + by, 16, 1);
    }
  }
  // wall inventory icons: transparent bg, wide center post + short side stubs
  // (masonry cousin of drawFenceIcon with 8/16-thick proportions)
  const drawWallIcon = (ti: number, base: 'cobble' | 'mossy' | 'brick' | 'sand'): void => {
    const q = T(ti);
    ctx.clearRect(q[0], q[1], 16, 16);
    if (base === 'cobble' || base === 'mossy') {
      const stone = ['#8a8a8a', '#7c7c7c', '#949494', '#6f6f6f'];
      const mossy = ['#7d8a6e', '#6f7d61', '#87947a', '#66735a'];
      const pal = base === 'cobble' ? stone : mossy;
      noiseFill(ctx, q[0] + 4, q[1], 8, 16, pal, rnd);
      ctx.fillStyle = '#565656';
      ctx.fillRect(q[0] + 4, q[1], 1, 16); ctx.fillRect(q[0] + 11, q[1], 1, 16);
      noiseFill(ctx, q[0], q[1] + 6, 16, 4, pal, rnd);
      ctx.fillStyle = '#565656';
      ctx.fillRect(q[0], q[1] + 6, 16, 1); ctx.fillRect(q[0], q[1] + 9, 16, 1);
      if (base === 'mossy') {                      // moss speckles
        ctx.fillStyle = '#5f7a4a';
        px(ctx, q[0] + 6, q[1] + 3, '#5f7a4a'); px(ctx, q[0] + 9, q[1] + 8, '#5f7a4a');
        px(ctx, q[0] + 2, q[1] + 7, '#5f7a4a'); px(ctx, q[0] + 13, q[1] + 8, '#5f7a4a');
      }
    } else if (base === 'brick') {
      // mini brick pattern: 4-row courses with offset joints
      ctx.fillStyle = '#9c5a4a';
      ctx.fillRect(q[0] + 4, q[1], 8, 16); ctx.fillRect(q[0], q[1] + 6, 16, 4);
      ctx.fillStyle = '#d8d0c8';
      for (const ry of [0, 4, 8, 12]) ctx.fillRect(q[0] + 4, q[1] + ry, 8, 1);
      ctx.fillRect(q[0], q[1] + 6, 16, 1); ctx.fillRect(q[0], q[1] + 10, 16, 1);
      ctx.fillStyle = '#b0aaa4';
      ctx.fillRect(q[0] + 7, q[1], 1, 4); ctx.fillRect(q[0] + 11, q[1] + 4, 1, 4);
      ctx.fillRect(q[0] + 5, q[1] + 8, 1, 2); ctx.fillRect(q[0] + 12, q[1] + 6, 1, 4);
    } else {
      // sandstone: smooth sand body + carved top band
      noiseFill(ctx, q[0] + 4, q[1], 8, 16, ['#e0d3a0', '#d6c894', '#dccfa0', '#cdbf88'], rnd);
      noiseFill(ctx, q[0], q[1] + 6, 16, 4, ['#e0d3a0', '#d6c894', '#dccfa0'], rnd);
      ctx.fillStyle = '#b3a374';
      ctx.fillRect(q[0] + 4, q[1], 1, 16); ctx.fillRect(q[0] + 11, q[1], 1, 16);
      ctx.fillRect(q[0], q[1] + 6, 16, 1); ctx.fillRect(q[0], q[1] + 9, 16, 1);
      ctx.fillStyle = '#efe6c0';
      ctx.fillRect(q[0] + 4, q[1] + 1, 8, 1); ctx.fillRect(q[0], q[1] + 7, 16, 1);
    }
  };
  drawWallIcon(106, 'cobble');
  drawWallIcon(107, 'mossy');
  drawWallIcon(108, 'brick');
  drawWallIcon(109, 'sand');

  // ── phase 17: showcase & décor tiles (item frame / flower pot) ──
  // item frame creative icon: transparent bg, square stick-frame ring with a
  // parchment inner edge (MC empty item frame reads as wood ring + tan backing)
  p = T(110);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const wood = '#9a7442', woodDark = '#6e5230', woodHi = '#b58c55';
    ctx.fillStyle = wood;
    ctx.fillRect(p[0], p[1], 16, 2); ctx.fillRect(p[0], p[1] + 14, 16, 2);
    ctx.fillRect(p[0], p[1] + 2, 2, 12); ctx.fillRect(p[0] + 14, p[1] + 2, 2, 12);
    ctx.fillStyle = woodHi;                       // top/left bevel highlight
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1], 1, 16);
    ctx.fillStyle = woodDark;                     // bottom/right bevel shade
    ctx.fillRect(p[0], p[1] + 15, 16, 1); ctx.fillRect(p[0] + 15, p[1], 1, 16);
    ctx.fillStyle = '#c9b48a';                    // tan backing lip inside the ring
    ctx.fillRect(p[0] + 2, p[1] + 2, 12, 1); ctx.fillRect(p[0] + 2, p[1] + 13, 12, 1);
    ctx.fillRect(p[0] + 2, p[1] + 2, 1, 12); ctx.fillRect(p[0] + 13, p[1] + 2, 1, 12);
  }
  // frame panel face: wood ring with a fully TRANSPARENT 12×12 center — the
  // cutout alphaTest punches the hole so the wall shows through behind the
  // displayed item sprite (matches the in-world 1/16 panel geometry)
  p = T(111);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const wood = '#9a7442', woodDark = '#6e5230', woodHi = '#b58c55';
    ctx.fillStyle = wood;
    ctx.fillRect(p[0], p[1], 16, 2); ctx.fillRect(p[0], p[1] + 14, 16, 2);
    ctx.fillRect(p[0], p[1] + 2, 2, 12); ctx.fillRect(p[0] + 14, p[1] + 2, 2, 12);
    ctx.fillStyle = woodHi;
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1], 1, 16);
    ctx.fillStyle = woodDark;
    ctx.fillRect(p[0], p[1] + 15, 16, 1); ctx.fillRect(p[0] + 15, p[1], 1, 16);
    // subtle grain speckle on the ring so it doesn't read as flat plastic
    ctx.fillStyle = woodDark;
    px(ctx, p[0] + 4, p[1] + 1, woodDark); px(ctx, p[0] + 10, p[1] + 1, woodDark);
    px(ctx, p[0] + 1, p[1] + 6, woodDark); px(ctx, p[0] + 1, p[1] + 11, woodDark);
    px(ctx, p[0] + 6, p[1] + 14, woodDark); px(ctx, p[0] + 12, p[1] + 14, woodDark);
    px(ctx, p[0] + 14, p[1] + 5, woodDark); px(ctx, p[0] + 14, p[1] + 10, woodDark);
  }
  // flower pot creative icon: terracotta V-pot silhouette (wide rim, tapered body)
  p = T(112);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const terra = '#b0693f', terraDark = '#8a4f2e', terraHi = '#c97e4e', rim = '#9c5e37';
    ctx.fillStyle = rim;                          // rim band 10/16 wide, 3px tall
    ctx.fillRect(p[0] + 3, p[1] + 3, 10, 3);
    ctx.fillStyle = terraHi; ctx.fillRect(p[0] + 3, p[1] + 3, 10, 1);
    ctx.fillStyle = terraDark; ctx.fillRect(p[0] + 3, p[1] + 5, 10, 1);
    ctx.fillStyle = terra;                        // tapered body 8/16 → 5/16
    ctx.fillRect(p[0] + 4, p[1] + 6, 8, 4);
    ctx.fillRect(p[0] + 5, p[1] + 10, 6, 3);
    ctx.fillStyle = terraHi; ctx.fillRect(p[0] + 4, p[1] + 6, 1, 7);
    ctx.fillStyle = terraDark; ctx.fillRect(p[0] + 11, p[1] + 6, 1, 7);
    ctx.fillRect(p[0] + 5, p[1] + 12, 6, 1);
    ctx.fillStyle = '#5c3a22';                    // dark soil peeking at the top
    ctx.fillRect(p[0] + 4, p[1] + 4, 8, 1);
  }
  // pot rim top: terracotta ring, transparent center — punched hole reveals
  // the dirt soil face (body top) and the plant sprite geometry inside
  p = T(113);
  {
    ctx.clearRect(p[0], p[1], 16, 16);
    const terra = '#b0693f', terraDark = '#8a4f2e', terraHi = '#c97e4e';
    ctx.fillStyle = terra;
    ctx.fillRect(p[0], p[1], 16, 2); ctx.fillRect(p[0], p[1] + 14, 16, 2);
    ctx.fillRect(p[0], p[1] + 2, 2, 12); ctx.fillRect(p[0] + 14, p[1] + 2, 2, 12);
    ctx.fillStyle = terraHi;
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1], 1, 16);
    ctx.fillStyle = terraDark;
    ctx.fillRect(p[0], p[1] + 15, 16, 1); ctx.fillRect(p[0] + 15, p[1], 1, 16);
  }
  // pot side: full-tile terracotta speckle (body sides + rim sides sample
  // horizontal bands of it via tileSub so faces aren't vertically squashed)
  p = T(114);
  {
    ctx.fillStyle = '#b0693f';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#b0693f', '#a8623a', '#ba7045', '#a05c36'], rnd);
    ctx.fillStyle = '#c97e4e';                    // faint horizontal throw-lines
    ctx.fillRect(p[0], p[1] + 4, 16, 1); ctx.fillRect(p[0], p[1] + 11, 16, 1);
    ctx.fillStyle = '#8a4f2e';
    ctx.fillRect(p[0], p[1] + 7, 16, 1);
    px(ctx, p[0] + 3, p[1] + 2, '#c97e4e'); px(ctx, p[0] + 12, p[1] + 9, '#c97e4e');
    px(ctx, p[0] + 6, p[1] + 13, '#8a4f2e'); px(ctx, p[0] + 14, p[1] + 3, '#8a4f2e');
  }

  // ── v0.57 village life: profession work-block tiles (115-126) ──
  // lectern top: dark-oak desk surface with an OPEN BOOK drawn on it — the
  // slanted top quad samples this whole tile so the book reads at no extra
  // geometry cost (librarian profession signature item)
  p = T(115);
  {
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#4a3520', '#42301d', '#523b25', '#3e2c1a'], rnd);
    // open book: two parchment pages with a spine line + scribble rows
    ctx.fillStyle = '#e8dfc4';
    ctx.fillRect(p[0] + 2, p[1] + 4, 5, 8); ctx.fillRect(p[0] + 9, p[1] + 4, 5, 8);
    ctx.fillStyle = '#d4c8a4';                    // page curvature shading
    ctx.fillRect(p[0] + 2, p[1] + 4, 1, 8); ctx.fillRect(p[0] + 13, p[1] + 4, 1, 8);
    ctx.fillRect(p[0] + 2, p[1] + 11, 5, 1); ctx.fillRect(p[0] + 9, p[1] + 11, 5, 1);
    ctx.fillStyle = '#5a4630';                    // spine + cover edge
    ctx.fillRect(p[0] + 7, p[1] + 4, 2, 8);
    ctx.fillStyle = '#8a7a5a';                    // scribble text rows
    ctx.fillRect(p[0] + 3, p[1] + 6, 3, 1); ctx.fillRect(p[0] + 10, p[1] + 6, 3, 1);
    ctx.fillRect(p[0] + 3, p[1] + 8, 3, 1); ctx.fillRect(p[0] + 10, p[1] + 8, 3, 1);
  }
  // lectern side: dark oak with vertical grain + a carved accent line
  p = T(116);
  {
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#4a3520', '#42301d', '#523b25', '#3e2c1a'], rnd);
    ctx.fillStyle = '#3a2a18';                    // vertical grain streaks
    for (let i = 0; i < 16; i += 3) ctx.fillRect(p[0] + i + (i % 2), p[1], 1, 16);
    ctx.fillStyle = '#5f4628';                    // carved decorative band
    ctx.fillRect(p[0], p[1] + 6, 16, 1);
    ctx.fillStyle = '#332414';
    ctx.fillRect(p[0], p[1] + 7, 16, 1);
  }
  // lectern base: heavier dark-oak plinth tone
  p = T(117);
  {
    ctx.fillStyle = '#3e2c1a';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#3e2c1a', '#372616', '#463320', '#332312'], rnd);
    ctx.fillStyle = '#2c1f10';
    ctx.fillRect(p[0], p[1] + 13, 16, 3);         // shadowed foot
    ctx.fillStyle = '#523b25';
    ctx.fillRect(p[0], p[1] + 2, 16, 1);
  }
  // cauldron side: dark riveted iron with rim highlight + hanging bracket
  p = T(118);
  {
    ctx.fillStyle = '#3c3c42';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#3c3c42', '#36363c', '#44444b', '#313137'], rnd);
    ctx.fillStyle = '#5a5a63';                    // rolled rim
    ctx.fillRect(p[0], p[1], 16, 2);
    ctx.fillStyle = '#6b6b75';
    ctx.fillRect(p[0], p[1], 16, 1);
    ctx.fillStyle = '#26262b';                    // body shading + foot band
    ctx.fillRect(p[0], p[1] + 13, 16, 3);
    ctx.fillStyle = '#5a5a63';                    // rivets
    px(ctx, p[0] + 3, p[1] + 4, '#5a5a63'); px(ctx, p[0] + 12, p[1] + 4, '#5a5a63');
    px(ctx, p[0] + 3, p[1] + 9, '#5a5a63'); px(ctx, p[0] + 12, p[1] + 9, '#5a5a63');
  }
  // cauldron top: iron ring with a dark open center (the hole reads as the pot mouth)
  p = T(119);
  {
    ctx.fillStyle = '#3c3c42';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#3c3c42', '#44444b', '#38383e'], rnd);
    ctx.fillStyle = '#5a5a63';
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1] + 15, 16, 1);
    ctx.fillRect(p[0], p[1], 1, 16); ctx.fillRect(p[0] + 15, p[1], 1, 16);
    ctx.fillStyle = '#1d1d21';                    // open mouth
    ctx.fillRect(p[0] + 3, p[1] + 3, 10, 10);
    ctx.fillStyle = '#26262b';
    ctx.fillRect(p[0] + 3, p[1] + 3, 10, 1);
  }
  // cauldron inner: near-black iron (inner walls + floor of the cavity)
  p = T(120);
  {
    ctx.fillStyle = '#1d1d21';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#1d1d21', '#232329', '#17171b'], rnd);
  }
  // composter top: dark compost fill — speckled rotting organic matter
  p = T(121);
  {
    ctx.fillStyle = '#3d2e1c';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#3d2e1c', '#332616', '#473621', '#2c2012'], rnd);
    ctx.fillStyle = '#55452a';                    // lighter organic flecks
    px(ctx, p[0] + 2, p[1] + 3, '#55452a'); px(ctx, p[0] + 7, p[1] + 5, '#55452a');
    px(ctx, p[0] + 12, p[1] + 2, '#55452a'); px(ctx, p[0] + 5, p[1] + 10, '#55452a');
    px(ctx, p[0] + 10, p[1] + 12, '#55452a'); px(ctx, p[0] + 13, p[1] + 8, '#55452a');
    ctx.fillStyle = '#251a0d';                    // wet patches
    px(ctx, p[0] + 4, p[1] + 6, '#251a0d'); px(ctx, p[0] + 11, p[1] + 9, '#251a0d');
  }
  // composter side: plank frame with horizontal slat gaps (wooden barrel-like frame)
  p = T(122);
  {
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#7a5a34', '#6e502e', '#856339', '#654a29'], rnd);
    ctx.fillStyle = '#4e3820';                    // slat gaps between staves
    ctx.fillRect(p[0], p[1] + 4, 16, 1);
    ctx.fillRect(p[0], p[1] + 11, 16, 1);
    ctx.fillStyle = '#8f6c3f';                    // stave highlights
    ctx.fillRect(p[0], p[1] + 1, 16, 1);
    ctx.fillRect(p[0], p[1] + 8, 16, 1);
    ctx.fillStyle = '#3a2917';                    // top/bottom frame edge
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1] + 15, 16, 1);
  }
  // smithing top: gunmetal work surface with a lighter anvil face plate
  p = T(123);
  {
    ctx.fillStyle = '#43434b';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#43434b', '#3c3c44', '#4b4b54', '#35353c'], rnd);
    ctx.fillStyle = '#5c5c66';                    // raised anvil face plate
    ctx.fillRect(p[0] + 3, p[1] + 3, 10, 10);
    ctx.fillStyle = '#6d6d78';
    ctx.fillRect(p[0] + 3, p[1] + 3, 10, 1); ctx.fillRect(p[0] + 3, p[1] + 3, 1, 10);
    ctx.fillStyle = '#2c2c32';                    // plate edge shadow
    ctx.fillRect(p[0] + 3, p[1] + 12, 10, 1); ctx.fillRect(p[0] + 12, p[1] + 3, 1, 10);
    ctx.fillStyle = '#75757f';                    // tool scorch specks
    px(ctx, p[0] + 5, p[1] + 5, '#75757f'); px(ctx, p[0] + 9, p[1] + 7, '#75757f');
    px(ctx, p[0] + 7, p[1] + 10, '#75757f');
  }
  // smithing side: dark wood legs/body with a wide metal band across the top
  p = T(124);
  {
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#4a3520', '#42301d', '#523b25'], rnd);
    ctx.fillStyle = '#5a5a63';                    // iron band
    ctx.fillRect(p[0], p[1], 16, 3);
    ctx.fillStyle = '#6d6d78';
    ctx.fillRect(p[0], p[1], 16, 1);
    ctx.fillStyle = '#33333a';
    ctx.fillRect(p[0], p[1] + 3, 16, 1);
    ctx.fillStyle = '#3a2a18';                    // leg shadows
    ctx.fillRect(p[0] + 1, p[1] + 8, 3, 8); ctx.fillRect(p[0] + 12, p[1] + 8, 3, 8);
  }
  // barrel side: vertical oak staves with two dark iron hoops (fisherman storage)
  p = T(125);
  {
    ctx.fillStyle = '#9a7442';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#9a7442', '#8f6c3c', '#a67e4a', '#866338'], rnd);
    ctx.fillStyle = '#6e5230';                    // stave gaps
    for (let i = 2; i < 16; i += 4) ctx.fillRect(p[0] + i, p[1], 1, 16);
    ctx.fillStyle = '#4a4a52';                    // iron hoops
    ctx.fillRect(p[0], p[1] + 2, 16, 2);
    ctx.fillRect(p[0], p[1] + 12, 16, 2);
    ctx.fillStyle = '#5f5f68';                    // hoop highlights
    ctx.fillRect(p[0], p[1] + 2, 16, 1);
    ctx.fillRect(p[0], p[1] + 12, 16, 1);
  }
  // barrel top: planks inside an iron hoop rim
  p = T(126);
  {
    ctx.fillStyle = '#9a7442';
    ctx.fillRect(p[0], p[1], 16, 16);
    noiseFill(ctx, p[0], p[1], 16, 16, ['#9a7442', '#a67e4a', '#8f6c3c'], rnd);
    ctx.fillStyle = '#4a4a52';                    // hoop rim
    ctx.fillRect(p[0], p[1], 16, 2); ctx.fillRect(p[0], p[1] + 14, 16, 2);
    ctx.fillRect(p[0], p[1], 2, 16); ctx.fillRect(p[0] + 14, p[1], 2, 16);
    ctx.fillStyle = '#6e5230';                    // plank seams
    ctx.fillRect(p[0] + 5, p[1] + 2, 1, 12); ctx.fillRect(p[0] + 10, p[1] + 2, 1, 12);
    ctx.fillStyle = '#5f5f68';
    ctx.fillRect(p[0], p[1], 16, 1); ctx.fillRect(p[0], p[1], 1, 16);
  }

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

// ─── Flat tile icons (for non-cube models: torch, flowers, bed…) ────────────
const tileIconCache = new Map<number, string>();
export function getTileIconURL(tileIndex: number): string {
  const cached = tileIconCache.get(tileIndex);
  if (cached) return cached;
  const S = 64;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(shadedTile(tileIndex, 1.0), 0, 0, TILE_PX, TILE_PX, 0, 0, S, S);
  const url = c.toDataURL();
  tileIconCache.set(tileIndex, url);
  return url;
}

const tileCanvasCache = new Map<number, HTMLCanvasElement>();
export function getTileCanvas(tileIndex: number): HTMLCanvasElement {
  const cached = tileCanvasCache.get(tileIndex);
  if (cached) return cached;
  const c = makeCanvas(TILE_PX, TILE_PX);
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getAtlas().canvas, (tileIndex % ATLAS_TILES) * TILE_PX, Math.floor(tileIndex / ATLAS_TILES) * TILE_PX, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  tileCanvasCache.set(tileIndex, c);
  return c;
}
