// ─── Procedural mob skins (Minecraft-style pixel textures via canvas) ────────
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseFill(ctx: Ctx, x0: number, y0: number, w: number, h: number, colors: string[], rnd: () => number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
}

function px(ctx: Ctx, x: number, y: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

export interface MobSkins {
  head: THREE.CanvasTexture;   // includes face on front
  body: THREE.CanvasTexture;
  limb: THREE.CanvasTexture;
  extra?: THREE.CanvasTexture; // e.g. snout, beak
}

const skinCache = new Map<string, MobSkins>();

function tex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** eyes: two 1x2-ish dark eyes on head front */
function eyes(ctx: Ctx, y: number, left: number, right: number, color: string, w = 2, h = 2): void {
  ctx.fillStyle = color;
  ctx.fillRect(left, y, w, h);
  ctx.fillRect(right, y, w, h);
}

export function getMobSkins(type: string): MobSkins {
  const cached = skinCache.get(type);
  if (cached) return cached;
  let skins: MobSkins;
  // sheep color variants: "sheep:white" | "sheep:light_gray" | ... (default white)
  if (type.startsWith('sheep')) {
    const color = type.split(':')[1] ?? 'white';
    skins = buildSheep(color);
  } else
  switch (type) {
    case 'pig': skins = buildPig(); break;
    case 'cow': skins = buildCow(); break;
    case 'sheep': skins = buildSheep('white'); break;
    case 'chicken': skins = buildChicken(); break;
    case 'zombie': skins = buildZombie(); break;
    case 'creeper': skins = buildCreeper(); break;
    case 'skeleton': skins = buildSkeleton(); break;
    case 'spider': skins = buildSpider(); break;
    case 'enderman': skins = buildEnderman(); break;
    case 'villager': skins = buildVillager(); break;
    case 'mooshroom': skins = buildMooshroom(); break;
    case 'golem': skins = buildGolem(); break;
    default: skins = buildPig();
  }
  skinCache.set(type, skins);
  return skins;
}

// ── PIG ──────────────────────────────────────────────────────────────────────
function buildPig(): MobSkins {
  const rnd = seeded(101);
  const pink = ['#f0a2a2', '#e89696', '#f4adad', '#e08d8d'];
  // head 16x16 with face on front (we use whole texture per face; draw face centrally)
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, pink, rnd);
  eyes(ctx, 6, 3, 11, '#1a1a1a');
  // snout
  ctx.fillStyle = '#d87c7c';
  ctx.fillRect(5, 9, 6, 4);
  ctx.fillStyle = '#b06060';
  px(ctx, 6, 10, '#6a3a3a'); px(ctx, 9, 10, '#6a3a3a');
  px(ctx, 6, 11, '#6a3a3a'); px(ctx, 9, 11, '#6a3a3a');

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, pink, rnd);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, pink, rnd);
  ctx.fillStyle = '#d87c7c';
  ctx.fillRect(0, 14, 8, 2);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── COW ──────────────────────────────────────────────────────────────────────
function buildCow(): MobSkins {
  const rnd = seeded(202);
  const brown = ['#6e4a32', '#5d3d28', '#7a5438', '#664530'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, brown, rnd);
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(4, 10, 8, 6); // muzzle
  eyes(ctx, 5, 2, 12, '#1a1a1a');
  ctx.fillStyle = '#c8b8a8';
  px(ctx, 6, 12, '#a89888'); px(ctx, 9, 12, '#a89888');
  // white patch on forehead
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(6, 1, 4, 3);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, brown, rnd);
  // white patches
  ctx.fillStyle = '#e8e4dc';
  ctx.fillRect(2, 3, 5, 4);
  ctx.fillRect(10, 9, 4, 5);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, brown, rnd);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(0, 14, 8, 2);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── SHEEP (color variants: white, light_gray, gray, brown, black) ───────────
const SHEEP_WOOL_PALETTES: Record<string, string[]> = {
  white: ['#f0f0f0', '#e8e8e8', '#f8f8f8', '#e0e0e0'],
  light_gray: ['#c8c8c8', '#bcbcbc', '#d2d2d2', '#b2b2b2'],
  gray: ['#8a8a8a', '#7e7e7e', '#969696', '#727272'],
  brown: ['#8a6a4a', '#7c5e40', '#9a7a56', '#6a5034'],
  black: ['#3a3a3a', '#303030', '#444444', '#2a2a2a'],
};

function buildSheep(color = 'white'): MobSkins {
  const rnd = seeded(303);
  const wool = SHEEP_WOOL_PALETTES[color] ?? SHEEP_WOOL_PALETTES.white;
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, wool, rnd);
  // wool tuft on top
  ctx.fillStyle = wool[2];
  ctx.fillRect(1, 1, 14, 4);
  // face (pinkish skin)
  ctx.fillStyle = '#d8b8a0';
  ctx.fillRect(4, 6, 8, 10);
  eyes(ctx, 9, 4, 10, '#1a1a1a');

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, wool, rnd);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 8, wool, rnd);
  noiseFill(ctx, 0, 8, 8, 8, ['#d8b8a0', '#cca890', '#e2c4ae'], rnd);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── CHICKEN ──────────────────────────────────────────────────────────────────
function buildChicken(): MobSkins {
  const rnd = seeded(404);
  const white = ['#f4f4f4', '#eaeaea', '#fcfcfc', '#e0e0e0'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, white, rnd);
  eyes(ctx, 6, 3, 11, '#1a1a1a', 2, 2);
  // beak
  ctx.fillStyle = '#e8a23c';
  ctx.fillRect(5, 9, 6, 3);
  // wattle
  ctx.fillStyle = '#c83c3c';
  ctx.fillRect(6, 12, 4, 2);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, white, rnd);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, ['#e8a23c', '#d8942f', '#f0b050'], rnd);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── ZOMBIE ───────────────────────────────────────────────────────────────────
function buildZombie(): MobSkins {
  const rnd = seeded(505);
  const green = ['#5a9c4a', '#4f8c40', '#65a854', '#488038'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, green, rnd);
  eyes(ctx, 6, 3, 11, '#101a10', 2, 2);
  // mouth
  ctx.fillStyle = '#2a3a24';
  ctx.fillRect(6, 11, 4, 2);
  // dark hair top
  ctx.fillStyle = '#2a3a24';
  ctx.fillRect(0, 0, 16, 2);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  // shirt (cyan-ish torn)
  noiseFill(ctx, 0, 0, 16, 16, ['#3a7a8c', '#326a7c', '#44889c'], rnd);
  ctx.fillStyle = '#2a5a68';
  ctx.fillRect(2, 12, 12, 4); // pants hint at bottom? keep shirt

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, green, rnd);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── CREEPER ──────────────────────────────────────────────────────────────────
function buildCreeper(): MobSkins {
  const rnd = seeded(606);
  const greens = ['#4fae4f', '#44a044', '#5cb85c', '#3c903c', '#58b458'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, greens, rnd);
  // iconic sad face (dark)
  ctx.fillStyle = '#0c1c0c';
  ctx.fillRect(3, 4, 4, 4);   // left eye
  ctx.fillRect(9, 4, 4, 4);   // right eye
  ctx.fillRect(6, 8, 4, 5);   // mouth center
  ctx.fillRect(4, 10, 2, 4);  // mouth left drop
  ctx.fillRect(10, 10, 2, 4); // mouth right drop
  ctx.fillRect(5, 9, 6, 1);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, greens, rnd);
  // mottled darker patches
  ctx.fillStyle = '#388438';
  for (let i = 0; i < 10; i++) {
    ctx.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 2, 2);
  }

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, greens, rnd);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── SPIDER ────────────────────────────────────────────────────────────────────
function buildSpider(): MobSkins {
  const rnd = seeded(808);
  const fur = ['#2c2420', '#241c18', '#38302a', '#1e1714'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, fur, rnd);
  // iconic red eyes (cluster like MC: 2 big + 4 small)
  ctx.fillStyle = '#c02020';
  ctx.fillRect(3, 5, 2, 2); ctx.fillRect(11, 5, 2, 2);
  ctx.fillStyle = '#8a1414';
  ctx.fillRect(6, 4, 1, 1); ctx.fillRect(9, 4, 1, 1);
  ctx.fillRect(5, 8, 1, 1); ctx.fillRect(10, 8, 1, 1);
  // fangs
  ctx.fillStyle = '#c8b890';
  ctx.fillRect(5, 12, 1, 2); ctx.fillRect(10, 12, 1, 2);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, fur, rnd);
  // abdomen marking (dark hourglass-ish)
  ctx.fillStyle = '#161010';
  ctx.fillRect(6, 3, 4, 3);
  ctx.fillRect(5, 7, 6, 2);
  ctx.fillRect(7, 10, 2, 3);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, fur, rnd);
  ctx.fillStyle = '#12100e';
  ctx.fillRect(0, 7, 8, 1);
  ctx.fillRect(0, 14, 8, 1);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── ENDERMAN ──────────────────────────────────────────────────────────────────
function buildEnderman(): MobSkins {
  const rnd = seeded(909);
  const black = ['#161616', '#101010', '#1e1e1e', '#0c0c0c'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, black, rnd);
  // purple glowing eyes (wide, enderman style)
  ctx.fillStyle = '#cc78e8';
  ctx.fillRect(1, 6, 5, 3); ctx.fillRect(10, 6, 5, 3);
  ctx.fillStyle = '#f0bcff';
  ctx.fillRect(2, 7, 3, 1); ctx.fillRect(11, 7, 3, 1);
  // jaw line (mouth opens when provoked — drawn lighter, base state subtle)
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(5, 12, 6, 1);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, black, rnd);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, black, rnd);
  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 15, 8, 1);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── SKELETON ─────────────────────────────────────────────────────────────────
function buildSkeleton(): MobSkins {
  const rnd = seeded(707);
  const bone = ['#d8d8d0', '#cccccc', '#e4e4dc', '#c2c2ba'];
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, bone, rnd);
  eyes(ctx, 6, 3, 11, '#2a2a2a', 2, 2);
  // nose
  px(ctx, 7, 9, '#8a8a82'); px(ctx, 8, 9, '#8a8a82');
  // mouth: vertical teeth lines
  ctx.fillStyle = '#8a8a82';
  for (let x = 5; x <= 10; x += 2) ctx.fillRect(x, 11, 1, 3);

  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, bone, rnd);
  // ribcage lines
  ctx.fillStyle = '#a8a8a0';
  ctx.fillRect(2, 4, 12, 1);
  ctx.fillRect(2, 7, 12, 1);
  ctx.fillRect(2, 10, 12, 1);
  ctx.fillStyle = '#b8b8b0';
  ctx.fillRect(7, 3, 2, 10); // spine

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, bone, rnd);
  ctx.fillStyle = '#a8a8a0';
  ctx.fillRect(0, 5, 8, 1);
  ctx.fillRect(0, 10, 8, 1);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── VILLAGER (phase 8) ───────────────────────────────────────────────────────
function buildVillager(): MobSkins {
  const rnd = seeded(808);
  const skin = ['#c8a07a', '#bd9570', '#d2ab84', '#b38a66'];
  const robe = ['#7a5b3a', '#6e5133', '#856542', '#63482c'];
  // head: bald with big unibrow + green eyes + long nose shadow
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, skin, rnd);
  // unibrow
  ctx.fillStyle = '#5c4428';
  ctx.fillRect(3, 5, 10, 1);
  // eyes (green)
  ctx.fillStyle = '#3a7a34';
  ctx.fillRect(4, 6, 2, 2); ctx.fillRect(10, 6, 2, 2);
  ctx.fillStyle = '#1c1c1c';
  px(ctx, 5, 7, '#1c1c1c'); px(ctx, 10, 7, '#1c1c1c');
  // mouth
  ctx.fillStyle = '#8a6848';
  ctx.fillRect(6, 12, 4, 1);
  // nose bridge shadow down the middle
  ctx.fillStyle = '#a8845e';
  ctx.fillRect(7, 8, 2, 6);

  // body: brown robe with darker hem + belt
  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, robe, rnd);
  ctx.fillStyle = '#543d24';
  ctx.fillRect(0, 13, 16, 3); // hem
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 6, 16, 2); // robe fold highlight
  ctx.fillStyle = '#4a3620';
  ctx.fillRect(0, 9, 16, 1); // belt line

  // limb texture: robe-colored sleeves/legs
  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, robe, rnd);
  ctx.fillStyle = '#543d24';
  ctx.fillRect(0, 14, 8, 2);

  // extra: nose (single warm skin tone)
  const nose = makeCanvas(8, 8);
  ctx = nose.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 8, ['#c8a07a', '#bd9570', '#b38a66'], rnd);
  ctx.fillStyle = '#a87d58';
  ctx.fillRect(0, 6, 8, 2);

  return { head: tex(head), body: tex(body), limb: tex(limb), extra: tex(nose) };
}

// ── MOOSHROOM (phase 8): red cow with white patches ─────────────────────────
function buildMooshroom(): MobSkins {
  const rnd = seeded(909);
  const red = ['#a83226', '#9c2c20', '#b43a2c', '#90281e'];
  // head with white muzzle patch
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, red, rnd);
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(3, 10, 10, 6); // muzzle
  eyes(ctx, 5, 2, 11, '#1a1a1a');
  ctx.fillStyle = '#c8b8b0';
  px(ctx, 5, 12, '#c8b8b0'); px(ctx, 10, 12, '#c8b8b0');
  px(ctx, 5, 13, '#c8b8b0'); px(ctx, 10, 13, '#c8b8b0');
  // small white patch on forehead
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(6, 2, 4, 2);

  // body: red with big white patches
  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, red, rnd);
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(2, 2, 5, 4);
  ctx.fillRect(10, 7, 4, 5);
  ctx.fillRect(4, 11, 3, 3);
  ctx.fillRect(11, 1, 3, 2);

  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, red, rnd);
  ctx.fillStyle = '#8a6a5a';
  ctx.fillRect(0, 14, 8, 2);
  // one patched leg
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(4, 4, 3, 5);

  return { head: tex(head), body: tex(body), limb: tex(limb) };
}

// ── IRON GOLEM (phase 9): massive pale-metal defender with vines ────────────
function buildGolem(): MobSkins {
  const rnd = seeded(1010);
  const iron = ['#d8d4c8', '#ccc8ba', '#e0dcd0', '#c2beae', '#d4d0c2'];
  // head: pale metal face + deep-set eyes + brow
  const head = makeCanvas(16, 16);
  let ctx = head.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, iron, rnd);
  // brow ridge shadow
  ctx.fillStyle = '#a8a498';
  ctx.fillRect(2, 5, 12, 1);
  // eyes (dark, deep-set)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(4, 6, 2, 2);
  ctx.fillRect(10, 6, 2, 2);
  // nose shadow strip between the eyes
  ctx.fillStyle = '#b0aca0';
  ctx.fillRect(7, 6, 2, 6);
  // rust speckles
  for (let i = 0; i < 5; i++) {
    px(ctx, 2 + Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 13), '#a67a52');
  }

  // body: pale metal plates with cracks + vine detail on chest
  const body = makeCanvas(16, 16);
  ctx = body.getContext('2d')!;
  noiseFill(ctx, 0, 0, 16, 16, iron, rnd);
  // plate seams
  ctx.fillStyle = '#a8a498';
  ctx.fillRect(0, 4, 16, 1);
  ctx.fillRect(0, 10, 16, 1);
  // cracks
  ctx.fillStyle = '#8e8a7c';
  px(ctx, 3, 6, '#8e8a7c'); px(ctx, 4, 7, '#8e8a7c'); px(ctx, 4, 8, '#8e8a7c');
  px(ctx, 11, 11, '#8e8a7c'); px(ctx, 12, 12, '#8e8a7c');
  // vines (green strands creeping over the chest)
  ctx.fillStyle = '#4c8a32';
  px(ctx, 1, 2, '#4c8a32'); px(ctx, 2, 3, '#4c8a32'); px(ctx, 2, 4, '#3a7026');
  px(ctx, 13, 8, '#4c8a32'); px(ctx, 14, 9, '#3a7026'); px(ctx, 13, 10, '#4c8a32');
  px(ctx, 7, 13, '#4c8a32'); px(ctx, 8, 14, '#3a7026');
  // rust patches
  for (let i = 0; i < 4; i++) {
    px(ctx, 2 + Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 12), '#a67a52');
  }

  // limb: metal arms/legs with vine wraps
  const limb = makeCanvas(8, 16);
  ctx = limb.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 16, iron, rnd);
  ctx.fillStyle = '#a8a498';
  ctx.fillRect(0, 5, 8, 1);
  ctx.fillRect(0, 11, 8, 1);
  ctx.fillStyle = '#4c8a32';
  px(ctx, 2, 8, '#4c8a32'); px(ctx, 3, 8, '#3a7026'); px(ctx, 5, 9, '#4c8a32');
  ctx.fillStyle = '#a67a52';
  px(ctx, 6, 3, '#a67a52'); px(ctx, 1, 13, '#a67a52');

  // extra: nose (long pale-metal strip, darker tip)
  const nose = makeCanvas(8, 8);
  ctx = nose.getContext('2d')!;
  noiseFill(ctx, 0, 0, 8, 8, ['#c8c4b6', '#bebaac', '#d2cec0'], rnd);
  ctx.fillStyle = '#9a9688';
  ctx.fillRect(0, 6, 8, 2);

  return { head: tex(head), body: tex(body), limb: tex(limb), extra: tex(nose) };
}
