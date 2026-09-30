// ─── Neon Shadow Knight: VERBATIM port of the user-provided character ────────
// Source: upload/شوالیه سایه نئونی — کاراکتر ماینکرافتی.html (three.js demo,
// USER RULE: "همه چیز شبیه چیزی که بهت دادم باشه — ویرایش تکسچر/مدل/انیمیشن
// اعمال نکن، هر چی خودش داره خوبه"). Everything is ported 1:1:
//  • the procedural canvas painter with the SAME seeded RNG (seed 11 LCG) in
//    the SAME call order → bit-identical textures for every part
//  • the main+emissive-map pair (the neon glow: eyes, armor trim, sword blade)
//  • the part hierarchy & pivots (head crest + horns, pauldrons, arm spikes,
//    alpha-cut jagged cape, glowing greatsword + its PointLight)
//  • the 4 animation modes (idle / walk / attack / hero pose) with the exact
//    curves and lerp constants
// Only adapted to the ENGINE (not the design): unit scale px = 1/16 block like
// every MC model, r186 texture colorSpace + point-light units, and the head's
// look target is the player/viewer camera instead of the demo's orbit camera.
import * as THREE from 'three';
import type { MobParts } from './mobs';

// ── seeded RNG + color helpers (VERBATIM) ────────────────────────────────────
let seed = 11;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
const cl = (v: number, a = 0, b = 255): number => Math.max(a, Math.min(b, v));
const sh = (c: number[], k: number): number[] => c.map((v) => cl(v * k));
const lt = (c: number[]): number[] => c.map((v) => v + (255 - v) * 0.6);
const css = (c: number[]): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

type PixFn = (i: number, j: number, c: number[]) => void;
interface PaintCtx {
  px: PixFn;
  gl: PixFn;
  clr: (i: number, j: number) => void;
  fl: (i: number, j: number, w: number, h: number, c: number[], v?: number, f?: PixFn) => void;
}

/** VERBATIM painter: main texture + glow (emissive) map on a Lambert material. */
function P(w: number, h: number, fn: (p: PaintCtx) => void, o?: { alphaTest?: number }): THREE.MeshLambertMaterial {
  const a = document.createElement('canvas');
  const b = document.createElement('canvas');
  a.width = b.width = w;
  a.height = b.height = h;
  const x = a.getContext('2d')!;
  const y = b.getContext('2d')!;
  y.fillStyle = '#000';
  y.fillRect(0, 0, w, h);
  const px: PixFn = (i, j, c) => { x.fillStyle = css(c); x.fillRect(i, j, 1, 1); };
  const gl: PixFn = (i, j, c) => { px(i, j, c); y.fillStyle = css(c); y.fillRect(i, j, 1, 1); };
  const clr = (i: number, j: number): void => { x.clearRect(i, j, 1, 1); y.fillStyle = '#000'; y.fillRect(i, j, 1, 1); };
  const fl = (i: number, j: number, ww: number, hh: number, c: number[], v = 0.12, f: PixFn = px): void => {
    for (let p = 0; p < ww; p++) for (let q = 0; q < hh; q++) f(i + p, j + q, sh(c, 1 + (rnd() - 0.5) * 2 * v));
  };
  fn({ px, gl, clr, fl });
  const tex = (n: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(n);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace; // canvas values are sRGB (demo displayed them raw)
    return t;
  };
  return new THREE.MeshLambertMaterial({ map: tex(a), emissive: 0xffffff, emissiveMap: tex(b), ...(o ?? {}) });
}

// ── the demo's 4 color themes (cyber / fiery / toxic / ender) ────────────────
export const KNIGHT_THEMES = ['cyber', 'fiery', 'toxic', 'ender'] as const;
export type KnightTheme = (typeof KNIGHT_THEMES)[number];
const THEME_COLORS: Record<KnightTheme, { A: number[]; B: number[] }> = {
  cyber: { A: [34, 230, 255], B: [130, 50, 240] },
  fiery: { A: [255, 130, 30], B: [190, 25, 40] },
  toxic: { A: [120, 255, 80], B: [18, 110, 90] },
  ender: { A: [240, 90, 255], B: [70, 35, 130] },
};

const PX = 1 / 16; // demo units are MC pixels: 16 px = 1 block
/** r186 physical light units: scale the demo's r128 intensity formula 1:1 */
const K_LIGHT = 3.55;
type MatLike = THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
const mk = (w: number, h: number, d: number, m: MatLike, x = 0, y = 0, z = 0): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * PX, h * PX, d * PX), m);
  mesh.position.set(x * PX, y * PX, z * PX);
  return mesh;
};
const gp = (x: number, y: number, z: number, ...kids: THREE.Object3D[]): THREE.Group => {
  const g = new THREE.Group();
  g.position.set(x * PX, y * PX, z * PX);
  kids.forEach((o) => g.add(o));
  return g;
};

/** Deep-collect every Lambert material (deduped) — mirrors mobs.collectMatsDeep
 *  (local copy: avoids a runtime import cycle with mobs.ts). */
function collectMats(obj: THREE.Object3D, list: THREE.MeshLambertMaterial[], seen = new Set<THREE.MeshLambertMaterial>()): void {
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) {
    const m = mesh.material as THREE.MeshLambertMaterial | THREE.MeshLambertMaterial[];
    if (Array.isArray(m)) {
      for (const mm of m) if (mm.isMeshLambertMaterial && !seen.has(mm)) { seen.add(mm); list.push(mm); }
    } else if (m.isMeshLambertMaterial && !seen.has(m)) {
      seen.add(m); list.push(m);
    }
  }
  for (const c of obj.children) collectMats(c, list, seen);
}

// ── rig + per-instance animation state (the demo's `rig` + `cur` + `tt`) ─────
export interface KnightRig {
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  cape: THREE.Group;
  torso: THREE.Group;
  sl: THREE.PointLight;
  cur: { aL: number; aR: number; lL: number; lR: number; ty: number; by: number; cp: number; hy: number; hx: number };
  tt: number;
  /** in-game swing: seconds since the swing started (-1 = not swinging) */
  swingT: number;
  swingHitDone: boolean;
}
const rigMap = new WeakMap<THREE.Object3D, KnightRig>();
export function getKnightRig(group: THREE.Object3D): KnightRig | undefined {
  return rigMap.get(group);
}

/**
 * Build the knight (VERBATIM geometry/materials; painter order preserved so
 * the seeded textures are identical to the source demo).
 */
export function buildKnight(theme = 'cyber'): MobParts {
  seed = 11; // demo resets the seed every build → deterministic textures
  const th = THEME_COLORS[theme] ?? THEME_COLORS.cyber;
  const A = th.A;
  const B = th.B;
  const L = lt(A);
  const al = (k: number): number[] => sh(A, k);
  const D = [36, 38, 56], E = [22, 23, 36], M = [112, 120, 146], N2 = [62, 66, 88], Y = [244, 192, 62], K = [14, 14, 20], BT = [86, 54, 34];

  // ── head ──
  const hs = P(8, 8, ({ fl, gl }) => { fl(0, 0, 8, 8, D); fl(0, 0, 8, 1, E); fl(0, 1, 8, 1, M, .1); for (let i = 2; i < 6; i++) gl(i, 4, al(.75)); });
  const hf = P(8, 8, ({ fl, gl, px }) => {
    fl(0, 0, 8, 8, D); fl(0, 0, 8, 1, E); fl(0, 1, 8, 1, M, .1); gl(3, 1, A); gl(4, 1, A); fl(1, 2, 6, 3, [8, 8, 14], .04);
    [1, 2, 5, 6].forEach((i) => { gl(i, 2, al(.3)); gl(i, 4, al(.3)); });
    gl(1, 3, A); gl(2, 3, L); gl(5, 3, L); gl(6, 3, A);
    fl(0, 5, 8, 3, [28, 30, 44], .08); fl(1, 5, 6, 1, [54, 58, 80], .06); px(2, 6, [236, 236, 242]); px(5, 6, [236, 236, 242]);
  });
  const hb = P(8, 8, ({ fl, gl }) => {
    fl(0, 0, 8, 8, D); fl(0, 0, 8, 1, E); fl(0, 1, 8, 1, M, .1);
    [[2, 3], [5, 3], [3, 4], [4, 4], [3, 5], [4, 5], [2, 6], [5, 6]].forEach(([i, j]) => gl(i, j, al(.85)));
  });
  const ht = P(8, 8, ({ fl }) => fl(0, 0, 8, 8, D, .14));
  const hd = P(8, 8, ({ fl }) => fl(0, 0, 8, 8, E));
  const cm = P(4, 4, ({ fl, gl }) => fl(0, 0, 4, 4, A, .25, gl));
  const hm = P(2, 6, ({ fl, gl }) => { fl(0, 0, 2, 6, M, .1); fl(0, 0, 2, 2, A, .15, gl); });

  const horn = (s: number): THREE.Mesh => {
    const h = mk(1.4, 5, 1.4, hm, s * 4.7, 7.2, 0);
    h.rotation.z = -s * .55;
    h.userData.part = 'horn';
    return h;
  };
  const headBox = mk(8, 8, 8, [hs, hs, ht, hd, hf, hb], 0, 4, 0);
  headBox.userData.part = 'head';
  const crest = mk(1.6, 2.6, 6.5, cm, 0, 9.1, -.5);
  crest.userData.part = 'crest';
  const head = gp(0, 24, 0, headBox, crest, horn(1), horn(-1));
  head.userData.part = 'headPivot';

  // ── body ──
  const bf = P(8, 12, ({ fl, gl, px }) => {
    fl(0, 0, 8, 12, D); fl(0, 0, 8, 2, B, .14); fl(1, 2, 6, 6, N2, .09);
    for (let i = 1; i < 7; i++) px(i, 2, sh(M, 1.05));
    for (let j = 3; j < 8; j++) { px(1, j, M); px(6, j, M); }
    fl(2, 3, 4, 4, al(.35), .04, gl); fl(3, 4, 2, 2, L, 0, gl);
    gl(3, 7, al(.7)); gl(4, 7, al(.7));
    fl(0, 8, 8, 2, BT, .1); fl(3, 8, 2, 2, Y, .08); fl(0, 10, 8, 2, E, .1);
    [1, 6].forEach((i) => { gl(i, 10, al(.6)); gl(i, 11, al(.6)); });
  });
  const bb = P(8, 12, ({ fl, gl }) => {
    fl(0, 0, 8, 12, D); fl(0, 0, 8, 2, B, .14);
    for (let j = 3; j < 10; j++) { gl(3, j, al(.45)); gl(4, j, al(.45)); }
    fl(0, 10, 8, 2, E, .1);
  });
  const bs = P(4, 12, ({ fl, gl }) => {
    fl(0, 0, 4, 12, D); fl(0, 0, 4, 2, B, .14); fl(0, 8, 4, 2, BT, .1);
    gl(1, 4, al(.5)); gl(2, 4, al(.5));
  });
  const bt = P(8, 4, ({ fl }) => fl(0, 0, 8, 4, B, .14));
  const body = mk(8, 12, 4, [bs, bs, bt, hd, bf, bb], 0, 18, 0);
  body.userData.part = 'body';

  // ── arms + pauldrons ──
  const am = P(4, 12, ({ fl, gl, px }) => {
    fl(0, 0, 4, 12, D); fl(0, 0, 4, 2, M, .1);
    for (let j = 3; j < 7; j++) gl(1, j, al(.7));
    for (let i = 0; i < 4; i++) gl(i, 7, al(.8));
    fl(0, 8, 4, 3, N2, .08); px(1, 9, M); px(2, 9, M); fl(0, 11, 4, 1, K);
  });
  const at = P(4, 4, ({ fl }) => fl(0, 0, 4, 4, D));
  const ab = P(4, 4, ({ fl }) => fl(0, 0, 4, 4, K));
  const pm = P(6, 3, ({ fl, gl }) => { fl(0, 0, 6, 3, M, .12); fl(0, 2, 6, 1, N2, .08); gl(2, 1, A); gl(3, 1, A); });
  const arm = (x: number, s: number): { g: THREE.Group; box: THREE.Mesh } => {
    const spike = mk(1, 2.4, 1, hm, s * .7, 2.6, 0);
    spike.rotation.z = -s * .3;
    spike.userData.part = 'spike';
    const box = mk(4, 12, 4, [am, am, at, ab, am, am], 0, -6, 0);
    box.userData.part = 'limb';
    const pd = mk(5, 2.6, 5, pm, s * .7, .4, 0);
    pd.userData.part = 'pauldron';
    const g = gp(x, 24, 0, box, pd, spike);
    (box.userData as { limbPivot?: THREE.Group }).limbPivot = g;
    return { g, box };
  };

  // ── legs ──
  const lm = P(4, 12, ({ fl, gl }) => {
    fl(0, 0, 4, 5, D);
    for (let j = 0; j < 5; j++) gl(0, j, al(.5));
    fl(0, 5, 4, 2, M, .1); gl(1, 5, A); gl(2, 5, A);
    fl(0, 7, 4, 2, E); fl(0, 9, 4, 2, [46, 48, 64], .08);
    for (let i = 0; i < 4; i++) gl(i, 9, al(.8));
    fl(0, 11, 4, 1, K);
  });
  const lu = P(4, 4, ({ fl }) => fl(0, 0, 4, 4, D));
  const leg = (x: number): { g: THREE.Group; box: THREE.Mesh } => {
    const box = mk(4, 12, 4, [lm, lm, lu, ab, lm, lm], 0, -6, 0);
    box.userData.part = 'limb';
    const g = gp(x, 12, 0, box);
    (box.userData as { limbPivot?: THREE.Group }).limbPivot = g;
    return { g, box };
  };

  // ── cape (jagged hem via alpha test) ──
  const cp = P(8, 14, ({ fl, gl, clr }) => {
    for (let j = 0; j < 14; j++) {
      fl(0, j, 8, 1, sh(B, 1 - j * .035), .1);
      gl(0, j, al(.6)); gl(7, j, al(.6));
    }
    [[3, 4], [4, 4], [2, 5], [3, 5], [4, 5], [5, 5], [3, 6], [4, 6]].forEach(([i, j]) => gl(i, j, A));
    [2, 0, 1, 3, 1, 0, 2, 1].forEach((h, i) => { for (let j = 14 - h; j < 14; j++) clr(i, j); });
  }, { alphaTest: .5 });
  const capeBox = mk(8, 14, .6, cp, 0, -7, -.3);
  capeBox.userData.part = 'cape';
  const cape = gp(0, 23.5, -2.3, capeBox);

  // ── glowing sword (+ its neon point light) ──
  const bm = P(2, 8, ({ fl, gl }) => { fl(0, 0, 2, 8, A, .12, gl); for (let j = 0; j < 8; j++) gl(0, j, L); });
  const gm = P(4, 2, ({ fl }) => fl(0, 0, 4, 2, Y, .1));
  const rm = P(2, 4, ({ fl }) => fl(0, 0, 2, 4, BT, .12));
  // demo: PointLight(color, .9, 45) under r128 legacy falloff — r186 physical
  // units need intensity×~3.5 + decay 1 for the SAME visual glow
  const sl = new THREE.PointLight(0xffffff, .9 * K_LIGHT, 45, 1);
  sl.color.set(css(A));
  sl.position.set(0, 10, 0);
  const handle = mk(1.2, 3.6, 1.2, rm); handle.userData.part = 'sword';
  const guard = mk(5, 1, 1.6, gm, 0, 2.3, 0); guard.userData.part = 'sword';
  const blade = mk(1.5, 15, .5, bm, 0, 10.4, 0); blade.userData.part = 'sword';
  const pommel = mk(1.8, 1.2, 1.8, gm, 0, -2.4, 0); pommel.userData.part = 'sword';
  const sw = gp(0, -11, 1.2, handle, guard, blade, pommel, sl);
  sw.rotation.x = Math.PI / 2;

  const armR = arm(-6, -1);
  const armL = arm(6, 1);
  armR.g.add(sw);
  const torso = gp(0, 0, 0, body, head, armL.g, armR.g, cape);
  const legL = leg(2);
  const legR = leg(-2);
  const ch = new THREE.Group();
  ch.add(legL.g, legR.g, torso);

  rigMap.set(ch, {
    legL: legL.g, legR: legR.g, armL: armL.g, armR: armR.g,
    head, cape, torso, sl,
    cur: { aL: 0, aR: -.75, lL: 0, lR: 0, ty: 0, by: 0, cp: .1, hy: 0, hx: 0 },
    tt: 0, swingT: -1, swingHitDone: true,
  });

  const mats: THREE.MeshLambertMaterial[] = [];
  collectMats(ch, mats);
  return {
    group: ch,
    head: head as unknown as THREE.Mesh,
    legs: [legL.g, legR.g] as unknown as THREE.Mesh[],
    arms: [armL.box, armR.box],
    materials: mats,
    shadow: null as unknown as THREE.Mesh,
  };
}

// ── VERBATIM animator (the demo's per-frame channel lerp) ────────────────────
export interface KnightAnimOpts {
  /** yaw to the look target, RELATIVE to the mob's facing (rad; demo = camera azimuth) */
  lookYaw?: number;
  /** pitch to the look target (rad, + = target above) */
  lookPitch?: number;
  /** in-game attack phase override (seconds since swing start; demo loops on tt) */
  attackPhase?: number;
  /** fires ONCE per swing on the sword's hit frame (p ∈ 0.4..0.6) */
  onHit?: () => void;
}
export function animateKnight(
  group: THREE.Object3D,
  dt: number,
  mode: 'idle' | 'walk' | 'attack' | 'pose',
  opts: KnightAnimOpts = {},
): { hit: boolean } {
  const r = rigMap.get(group);
  if (!r) return { hit: false };
  const sin = Math.sin;
  r.tt += dt;
  const cur = r.cur;
  const g = { aL: 0, aR: -.75, lL: 0, lR: 0, ty: 0, by: 0, cp: .08 };
  let hit = 0;
  if (mode === 'idle') {
    g.aL = sin(r.tt * 2) * .06;
    g.aR = -.75 + sin(r.tt * 2 + 1) * .05;
    g.by = sin(r.tt * 2) * .2;
    g.cp = .08 + sin(r.tt * 1.6) * .05;
  } else if (mode === 'walk') {
    const w = sin(r.tt * 6);
    g.lL = w * .85;
    g.lR = -w * .85;
    g.aL = -w * .75;
    g.aR = -.75 + w * .3;
    g.by = Math.abs(w) * .5;
    g.ty = w * .12;
    g.cp = .4 + w * .12;
  } else if (mode === 'attack') {
    const p = ((opts.attackPhase ?? r.tt) % 1.5) / 1.5;
    let k: number;
    if (p < .4) { k = p / .4; g.aR = -.75 - 1.85 * k; g.ty = -.6 * k; }
    else if (p < .6) { k = (p - .4) / .2; k *= k; g.aR = -2.6 + 2.4 * k; g.ty = -.6 + 1.3 * k; hit = 1; }
    else { k = (p - .6) / .4; g.aR = -.2 - .55 * k; g.ty = .7 * (1 - k); }
    g.aL = .3; g.lL = .35; g.lR = -.35; g.cp = .45;
  } else { // pose — the demo's "hero pose"
    g.aR = -1.7; g.aL = .35; g.ty = -.25; g.lL = .2; g.lR = -.2;
    g.cp = .22 + sin(r.tt * 4) * .07;
    g.by = sin(r.tt * 1.5) * .15;
  }
  const k = Math.min(1, dt * (mode === 'attack' ? 14 : 7));
  for (const n of Object.keys(g) as (keyof typeof g)[]) cur[n] += (g[n] - cur[n]) * k;
  // head tracking (demo: `a` = camera azimuth; |a|<1.5 gate + ×.55 identical)
  const a = opts.lookYaw ?? 0;
  cur.hy += ((Math.abs(a) < 1.5 ? a * .55 : 0) - cur.hy) * Math.min(1, dt * 4);
  const hxT = opts.lookPitch !== undefined ? Math.max(-.9, Math.min(.9, -opts.lookPitch)) * .3 : 0;
  cur.hx += (hxT - cur.hx) * Math.min(1, dt * 4);
  const r2 = r;
  r2.armL.rotation.x = cur.aL;
  r2.armL.rotation.z = .05;
  r2.armR.rotation.x = cur.aR;
  r2.legL.rotation.x = cur.lL;
  r2.legR.rotation.x = cur.lR;
  r2.torso.rotation.y = cur.ty;
  // demo: [head, armL, armR].position.y = 24 + by (breathing bob)
  (r2.head.position.y) = (24 + cur.by) * PX;
  (r2.armL.position.y) = (24 + cur.by) * PX;
  (r2.armR.position.y) = (24 + cur.by) * PX;
  r2.head.rotation.set(cur.hx, cur.hy, 0);
  r2.cape.rotation.x = cur.cp;
  r2.cape.rotation.z = sin(r.tt * 3) * .05;
  r2.sl.intensity = (.9 + hit * 3.5 + sin(r.tt * 5) * .15) * K_LIGHT; // scaled demo formula
  if (hit && !r2.swingHitDone) {
    r2.swingHitDone = true;
    opts.onHit?.();
  }
  return { hit: !!hit };
}
