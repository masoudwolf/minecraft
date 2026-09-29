// ─── Vanilla Minecraft entity skins: real textures + MC box-UV mapping ──────
// Rebuild of the skin pipeline (post-reset). Instead of hand-extracted texel
// data, every mob part is a box whose UVs are computed with Minecraft's
// STANDARD box-UV cross layout directly on the official vanilla entity
// texture. This makes skins pixel-perfect by construction and eliminates the
// whole class of texel-extraction bugs (cow udder, sheep mouth, ...).
import * as THREE from 'three';

/** MC model box definition for UV layout purposes (texture pixels / model units) */
export interface BoxUVLayout {
  /** texOffs X (px) */
  u: number;
  /** texOffs Y (px) */
  v: number;
  /** box width in MC model units (X) */
  w: number;
  /** box height in MC model units (Y) */
  h: number;
  /** box depth in MC model units (Z) */
  d: number;
}

/** A skin part = vanilla texture + its box UV layout + texture size */
export interface MobSkinPart {
  tex: THREE.Texture;
  lay: BoxUVLayout;
  texW: number;
  texH: number;
}

const loader = new THREE.TextureLoader();
loader.setPath('/textures/entity/');

const texCache = new Map<string, THREE.Texture>();

/**
 * Eagerly decode every entity texture (browser image cache). Call once at
 * startup — after this resolves, tintedTex can build its canvases
 * synchronously (no async texture swaps, which are unreliable on the GPU).
 */
const decodedImages = new Map<string, HTMLImageElement>();
export function preloadEntityTextures(files?: string[]): Promise<unknown> {
  const list = files ?? ['pig', 'cow', 'mooshroom_red', 'mooshroom_brown', 'sheep_body', 'sheep_fur', 'chicken', 'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'villager', 'iron_golem', 'witch', 'snow_golem', 'pumpkin_top', 'pumpkin_side', 'carved_pumpkin'];
  return Promise.all(
    list.map(
      (f) =>
        new Promise<void>((res) => {
          if (decodedImages.has(f)) return res();
          const img = new Image();
          img.onload = () => {
            decodedImages.set(f, img);
            res();
          };
          img.onerror = () => res(); // serve untinted rather than hanging
          img.src = `/textures/entity/${f}.png`;
        }),
    ),
  );
}

/** Load (cached) a vanilla entity texture with pixel-perfect settings. */
export function vanillaTex(file: string): THREE.Texture {
  const hit = texCache.get(file);
  if (hit) return hit;
  const tex = loader.load(`${file}.png`);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(file, tex);
  return tex;
}

function part(file: string, texW: number, texH: number, u: number, v: number, w: number, h: number, d: number): MobSkinPart {
  return { tex: vanillaTex(file), lay: { u, v, w, h, d }, texW, texH };
}

/**
 * Apply Minecraft's standard box-UV cross layout to a BoxGeometry.
 *
 * Layout (image space, y down), for box (w,h,d) at texOffs (u,v):
 *              ┌───────┬───────┐
 *              │  top  │ bottom│   (each w×d, at y v..v+d)
 *              └───────┴───────┘
 *   ┌────┬─────────┬────┬───────┐
 *   │right│  front │left│  back │   (right/left are d wide, front/back w wide)
 *   └────┴─────────┴────┴───────┘
 *
 * three.js BoxGeometry face order: +X, −X, +Y, −Y, +Z, −Z (4 verts each).
 * Mapping to our model space (+Z = model forward, entity's right = −X):
 *   +Z ← front region, −Z ← back, +X ← left(entity-left), −X ← right,
 *   +Y ← top, −Y ← bottom. Side/top UVs are oriented so texture "up"
 *   matches world "up" and textures read non-mirrored from outside.
 */
export interface BoxUVOptions {
  /** map the +Z (front) face to this transparent texture rect instead of the
   *  cross layout — used by the sheep fleece head so the real face shows. */
  frontTransparentRect?: [number, number, number, number];
}

export function boxUV(geo: THREE.BoxGeometry, lay: BoxUVLayout, texW: number, texH: number, opts?: BoxUVOptions): void {
  const { u, v, w, h, d } = lay;
  const W = texW, H = texH;
  // region rects [x, y, rw, rh] per face: px, nx, py, ny, pz, nz
  const rects: [number, number, number, number][] = [
    [u + d + w, v + d, d, h], // +X entity-left
    [u, v + d, d, h],         // −X entity-right
    [u + d, v, w, d],         // +Y top
    [u + d + w, v, w, d],     // −Y bottom
    [u + d, v + d, w, h],     // +Z front (the FACE for heads)
    [u + 2 * d + w, v + d, w, h], // −Z back
  ];
  if (opts?.frontTransparentRect) rects[4] = opts.frontTransparentRect;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  // tiny inset (in texels) so exact region EDGES never sample the neighboring
  // row/column (transparent padding next to some MC regions)
  const eps = 0.02;
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = rects[f];
    // corner UVs in image space; convert to GL space (flipY)
    const L = (rx + eps) / W, R = (rx + rw - eps) / W;
    const T = 1 - (ry + eps) / H, B = 1 - (ry + rh - eps) / H;
    // BoxGeometry per-face vertex order: TL, TR, BL, BR (u 0..1, v 1..0)
    // All faces use the straight mapping except −Y (bottom), which MC folds
    // vertically flipped relative to the region (Blockbench convention).
    let quads: [number, number][];
    if (f === 3) {
      // −Y: vertex order TL,TR,BL,BR ← region BL,BR,TL,TR
      quads = [[L, B], [R, B], [L, T], [R, T]];
    } else {
      quads = [[L, T], [R, T], [L, B], [R, B]];
    }
    for (let i = 0; i < 4; i++) {
      uvAttr.setXY(f * 4 + i, quads[i][0], quads[i][1]);
    }
  }
  uvAttr.needsUpdate = true;
}

/**
 * Build a box mesh textured from a vanilla part (used by mobs.ts builders).
 * World dims may differ from the MC layout dims (proportions stay close).
 */
export function uvBox(p: MobSkinPart, w: number, h: number, d: number, opts?: BoxUVOptions): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  boxUV(geo, p.lay, p.texW, p.texH, opts);
  const mat = new THREE.MeshLambertMaterial({ map: p.tex });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.skinPart = p;
  return mesh;
}

// ─── Tinted texture variants (sheep dye colors, etc.) ────────────────────────
// Canvas-level multiply tint of a vanilla texture — used where MC tints at
// runtime (sheep fleece). SYNCHRONOUS when the image has been preloaded via
// preloadEntityTextures() (always the case in-game and in the Asset Viewer);
// before preload finishes it falls back to the untinted texture.

const tintCache = new Map<string, THREE.Texture>();

function tintCanvas(img: HTMLImageElement | HTMLCanvasElement, color: string, strength: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  if (strength < 1) {
    // blend the tint at partial strength by pre-fading the fill color toward white
    const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (m) {
      const r = Math.round(255 - (255 - parseInt(m[1], 16)) * strength);
      const g = Math.round(255 - (255 - parseInt(m[2], 16)) * strength);
      const b = Math.round(255 - (255 - parseInt(m[3], 16)) * strength);
      color = `rgb(${r},${g},${b})`;
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(img, 0, 0);
  return c;
}

function pixelTex(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Get a multiply-tinted copy of a vanilla texture (cached per file+color). */
export function tintedTex(file: string, color: string, strength = 1): THREE.Texture {
  const key = `${file}|${color}|${strength}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const img = decodedImages.get(file);
  if (!img) return vanillaTex(file); // not preloaded yet — untinted fallback
  const out = pixelTex(tintCanvas(img, color, strength));
  tintCache.set(key, out);
  return out;
}

// ─── Composite box-cross texture from block textures (snow golem pumpkin) ────
// Assembles a standard 8×8×8 box-UV cross onto one canvas: top/bottom from
// `topFile`, side faces from `sideFile`, front face from `frontFile` (the
// carved pumpkin face). Falls back to a plain side texture until preloaded.

const crossCache = new Map<string, THREE.Texture>();

export function boxCrossTex(topFile: string, sideFile: string, frontFile: string): THREE.Texture {
  const key = `${topFile}|${sideFile}|${frontFile}`;
  const hit = crossCache.get(key);
  if (hit) return hit;
  const top = decodedImages.get(topFile);
  const side = decodedImages.get(sideFile);
  const front = decodedImages.get(frontFile);
  if (!top || !side || !front) return vanillaTex(sideFile); // preload not done yet
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // box-UV cross for an 8×8×8 box at texOffs (0,0):
  ctx.drawImage(top, 8, 0);   // +Y top face (8,0) 8×8
  ctx.drawImage(top, 16, 0);  // −Y bottom face (16,0) 8×8
  ctx.drawImage(side, 0, 8);  // −X east face (0,8) 8×8
  ctx.drawImage(front, 8, 8); // +Z front face (8,8) — the carved face
  ctx.drawImage(side, 16, 8); // +X west face (16,8) 8×8
  ctx.drawImage(side, 24, 8); // −Z back face (24,8) 8×8
  const out = pixelTex(c);
  crossCache.set(key, out);
  return out;
}
