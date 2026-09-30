'use client';

// ─── Asset Viewer: inspect mob models & block textures (creator tool) ───────
// Rebuilt (post-reset). Mobs render with the vanilla-skin pipeline, blocks
// render with the exact same atlas/face mapping the world mesher uses — so
// what you see here is what the game renders.
//
// Model-inspection toolkit (user request):
//  • Rotate toggle — freeze the turntable for a fixed view
//  • Animation selector — Idle / Walk / per-mob specials (bow aim, provoked,
//    golem charge, chicken wing flap) mirroring the in-game animator poses
//  • Speed slider — 0× (pose freeze) .. 2× slow-mo/fast
//  • Grid / Hitbox / Pivots / Skin panel / Light BG / Reset view
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore, type Screen } from '@/game/state';
import { audio } from '@/game/audio';
import { getMobSkins } from '@/game/entities/mobSkins';
import { preloadEntityTextures, type MobSkinPart } from '@/game/entities/vanillaSkins';
import { buildMobModel, getMobDims } from '@/game/entities/mobs';
import { buildKnight, animateKnight } from '@/game/entities/knightSkin';
import { getAtlas, tileUV } from '@/game/textures/atlas';
import { BLOCKS, type BlockDef } from '@/game/blocks';

// ─── Mob catalog ─────────────────────────────────────────────────────────────
interface MobEntry { key: string; label: string; variant?: string; hostile?: boolean }
const MOB_ENTRIES: MobEntry[] = [
  { key: 'pig', label: 'Pig' },
  { key: 'cow', label: 'Cow' },
  { key: 'sheep', label: 'Sheep (White)', variant: 'white' },
  { key: 'sheep', label: 'Sheep (Light Gray)', variant: 'light_gray' },
  { key: 'sheep', label: 'Sheep (Gray)', variant: 'gray' },
  { key: 'sheep', label: 'Sheep (Brown)', variant: 'brown' },
  { key: 'sheep', label: 'Sheep (Black)', variant: 'black' },
  { key: 'chicken', label: 'Chicken' },
  { key: 'mooshroom', label: 'Mooshroom (Red)' },
  { key: 'mooshroom_brown', label: 'Mooshroom (Brown)' },
  { key: 'zombie', label: 'Zombie', hostile: true },
  { key: 'skeleton', label: 'Skeleton', hostile: true },
  { key: 'creeper', label: 'Creeper', hostile: true },
  { key: 'spider', label: 'Spider', hostile: true },
  { key: 'enderman', label: 'Enderman', hostile: true },
  { key: 'villager', label: 'Villager' },
  { key: 'witch', label: 'Witch', hostile: true },
  { key: 'golem', label: 'Iron Golem' },
  { key: 'snowgolem', label: 'Snow Golem (Pumpkin)', variant: 'pumpkin' },
  { key: 'snowgolem', label: 'Snow Golem (Sheared)', variant: 'plain' },
  { key: 'knight', label: 'Neon Knight (Cyber)', variant: 'cyber', hostile: true },
  { key: 'knight', label: 'Neon Knight (Fiery)', variant: 'fiery', hostile: true },
  { key: 'knight', label: 'Neon Knight (Toxic)', variant: 'toxic', hostile: true },
  { key: 'knight', label: 'Neon Knight (Ender)', variant: 'ender', hostile: true },
];

// ─── Animation catalog (mirrors the in-game animator poses) ──────────────────
interface AnimOpt { key: 'idle' | 'walk' | 'attack' | 'flap' | 'pose'; label: string; mobs?: string[] }
const ANIMS: AnimOpt[] = [
  { key: 'idle', label: 'Idle' },
  { key: 'walk', label: 'Walk' },
  { key: 'attack', label: 'Attack / Chase', mobs: ['skeleton', 'enderman', 'golem', 'spider', 'knight'] },
  { key: 'pose', label: 'Hero Pose', mobs: ['knight'] },
  { key: 'flap', label: 'Wing Flap (air)', mobs: ['chicken'] },
];
function animsFor(key: string): AnimOpt[] {
  return ANIMS.filter((a) => !a.mobs || a.mobs.includes(key));
}

// ─── Block catalog (all registered, in id order) ─────────────────────────────
function blockList(): BlockDef[] {
  return Object.values(BLOCKS).sort((a, b) => a.id - b.id);
}

/** The knight's textures are runtime-painted canvases (map + emissive glow map)
 *  — rasterize each unique one off a throwaway build, labeled by the parts
 *  that use it (dispose everything afterwards). */
function knightSkinCards(variant: string): { label: string; size: string; src: string }[] {
  const parts = buildKnight(variant);
  const seen = new Map<THREE.Texture, { fields: Set<string>; canvas: HTMLCanvasElement }>();
  parts.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const part = (mesh.userData.part as string) ?? 'part';
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of mats as THREE.MeshLambertMaterial[]) {
      const map = mm.map;
      const img = map?.image as HTMLCanvasElement | undefined;
      if (!img) continue;
      const prev = seen.get(map);
      if (prev) prev.fields.add(part);
      else seen.set(map, { fields: new Set([part]), canvas: img });
    }
  });
  const out: { label: string; size: string; src: string }[] = [];
  for (const { fields, canvas } of seen.values()) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d')!.drawImage(canvas, 0, 0);
    out.push({ label: `${[...fields].join(', ')} (+glow map)`, size: `${canvas.width}×${canvas.height}`, src: c.toDataURL() });
  }
  parts.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of mats as THREE.MeshLambertMaterial[]) {
      mm.map?.dispose();
      mm.emissiveMap?.dispose();
      mm.dispose();
    }
  });
  return out;
}

// ─── Three.js viewport (shared by both tabs) ─────────────────────────────────
interface ViewportHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  grid: THREE.GridHelper;
  yaw: number;
  pitch: number;
  dist: number;
  targetY: number;
}

function defaultCam(tab: 'mobs' | 'blocks', key?: string): { targetY: number; dist: number } {
  if (tab === 'blocks') return { targetY: 0.5, dist: 3.2 };
  if (key === 'chicken') return { targetY: 0.45, dist: 3.6 };
  if (key === 'golem') return { targetY: 1.35, dist: 5 };
  if (key === 'enderman') return { targetY: 1.35, dist: 3.6 };
  if (key === 'knight') return { targetY: 1.05, dist: 4.6 };
  return { targetY: 0.85, dist: 3.6 };
}

function AssetViewer() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [tab, setTab] = useState<'mobs' | 'blocks'>('mobs');
  const [mobSel, setMobSel] = useState(0);
  const [blockSel, setBlockSel] = useState(0);
  const [wireUV, setWireUV] = useState(false);

  // new: animation + inspection controls
  const [anim, setAnim] = useState<AnimOpt['key']>('walk');
  const [speed, setSpeed] = useState(1);
  const [spin, setSpin] = useState(true);
  const [grid, setGrid] = useState(false);
  const [hitbox, setHitbox] = useState(false);
  const [pivots, setPivots] = useState(false);
  const [skinsView, setSkinsView] = useState(false);
  const [lightBg, setLightBg] = useState(false);

  const canvasHost = useRef<HTMLDivElement>(null);
  const vp = useRef<ViewportHandle | null>(null);
  const modelGroup = useRef<THREE.Group | null>(null);

  const blocks = useMemo(() => blockList(), []);
  const blockDef = blocks[Math.min(blockSel, blocks.length - 1)];
  const entry = MOB_ENTRIES[mobSel];
  const mobAnims = useMemo(() => animsFor(entry?.key ?? ''), [entry]);
  // derive (not clamp): picking a chicken-only anim then switching mob falls
  // back to Walk without any setState-in-effect
  const effAnim: AnimOpt['key'] = mobAnims.some((a) => a.key === anim) ? anim : 'walk';

  const animState = useRef({ t: 0, anim: effAnim, speed, spin, wireUV });
  useEffect(() => {
    animState.current.anim = effAnim;
    animState.current.speed = speed;
    animState.current.spin = spin;
    animState.current.wireUV = wireUV;
  }, [effAnim, speed, spin, wireUV]);

  // ── scene setup (once) ──
  useEffect(() => {
    void preloadEntityTextures(); // decoded images → sync tinted textures
    const host = canvasHost.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1c24);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    const hemi = new THREE.HemisphereLight(0xffffff, 0x888899, 0.95);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.25);
    dir.position.set(3, 6, 4);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-4, 2, -3);
    scene.add(dir2);

    // ground grid (hidden until toggled — helps judge scale/ground plane)
    const gridHelper = new THREE.GridHelper(12, 24, 0x6a6a76, 0x3a3a42);
    gridHelper.position.y = 0.002;
    gridHelper.visible = false;
    scene.add(gridHelper);

    const handle: ViewportHandle = { scene, camera, renderer, grid: gridHelper, yaw: 0.6, pitch: 0.18, dist: 4.2, targetY: 1 };
    vp.current = handle;

    // orbit controls (manual — no addon dependency)
    let dragging = false;
    let lx = 0, ly = 0;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      handle.yaw -= (e.clientX - lx) * 0.008;
      handle.pitch = Math.max(-1.2, Math.min(1.35, handle.pitch + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      el.style.cursor = 'grab';
      try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handle.dist = Math.max(1.4, Math.min(14, handle.dist + e.deltaY * 0.004));
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    let lastNow = performance.now();
    const resize = (): void => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const rdt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      const s = animState.current;
      s.t += 0.05 * s.speed;
      // mob pose — mirrors the in-game animator per animation state
      const g = modelGroup.current;
      if (g) {
        const mobKey = g.userData.mobKey as string | undefined;
        if (mobKey === 'knight') {
          // NEON KNIGHT: verbatim 8-channel animator + real dt (its lerp needs
          // seconds, not the demo clock); the head tracks the viewer camera —
          // the demo's signature head-follows-the-orbit-camera behavior
          const inner = g.children[0];
          if (inner) {
            const cpos = camera.position;
            const cosr = Math.cos(g.rotation.y);
            const sinr = Math.sin(g.rotation.y);
            const lx = cpos.x * cosr - cpos.z * sinr;
            const lz = cpos.x * sinr + cpos.z * cosr;
            animateKnight(inner, rdt * s.speed, (s.anim === 'flap' ? 'idle' : s.anim) as 'idle' | 'walk' | 'attack' | 'pose', {
              lookYaw: Math.atan2(lx, lz),
              lookPitch: Math.atan2(cpos.y - 1.75, Math.hypot(lx, lz)),
            });
          }
        } else {
          const legs = g.userData.legs as THREE.Object3D[] | undefined;
          const arms = g.userData.arms as THREE.Object3D[] | undefined;
          const head = g.userData.head as THREE.Object3D | undefined;
          const walking = s.anim === 'walk';
          if (legs) {
          const isSpider = mobKey === 'spider';
          legs.forEach((leg, i) => {
            // legs[] ARE the hip pivot groups — rotate them (top pivot, MC-style);
            // rotating the inner mesh would pivot around its middle (old bug).
            if (isSpider) {
              const ud = (leg as THREE.Object3D & { userData: { baseY?: number; baseZ?: number; phase?: number; side?: number } }).userData;
              const ph = ud.phase ?? 0;
              const sd = ud.side ?? 1;
              const amt = walking ? 0.5 : 0;
              leg.rotation.y = (ud.baseY ?? 0) + -Math.cos(s.t * 2.1 + ph) * 0.4 * amt * sd;
              leg.rotation.z = (ud.baseZ ?? 0) + Math.abs(Math.sin(s.t * 1.05 + ph) * 0.4) * amt * sd;
            } else {
              leg.rotation.x = walking ? Math.sin(s.t * 2.1 + (i % 2 === 0 ? 0 : Math.PI) + (i >= 2 ? Math.PI : 0)) * 0.7 : 0;
            }
          });
        }
        if (arms) {
          arms.forEach((arm, i) => {
            const pivot = (arm as unknown as { limbPivot?: THREE.Group }).limbPivot;
            const target = pivot ?? arm;
            const side = i === 0 ? 1 : -1;
            const part = (arm.userData as { part?: string }).part;
            // only mobs the game actually animates — others keep their build pose
            if (mobKey === 'chicken' && part === 'wing') {
              // game: sin(time*26)*0.85 → viewer t runs ≈3× slower
              target.rotation.z = s.anim === 'flap' ? Math.sin(s.t * 8.7) * 0.85 * side : 0;
              target.rotation.x = 0;
            } else if (mobKey === 'zombie') {
              target.rotation.x = -Math.PI / 2 + Math.sin(s.t * 2.4) * (walking ? 0.12 : 0.02);
              target.rotation.z = walking ? Math.sin(s.t * 1.2) * 0.06 : 0;
            } else if (mobKey === 'skeleton') {
              const bow = (target.userData as { bowArm?: boolean }).bowArm;
              if (bow) target.rotation.x = s.anim === 'attack' ? -1.35 : Math.sin(s.t * 2.4) * (walking ? 0.2 : 0.03);
              else target.rotation.x = s.anim === 'attack' ? 0.08 : Math.sin(s.t * 2.4 + Math.PI) * (walking ? 0.35 : 0.04);
              target.rotation.z = 0;
            } else if (mobKey === 'golem') {
              const raised = s.anim === 'attack' ? -1.2 : 0;
              target.rotation.x = raised + Math.sin(s.t * 2.4 + (i === 0 ? 0 : Math.PI)) * (walking ? 0.3 : 0.04);
              target.rotation.z = walking ? Math.sin(s.t * 1.2) * 0.05 : 0;
            } else if (mobKey === 'enderman') {
              if (s.anim === 'attack') {
                target.rotation.x = -1.15 + Math.sin(s.t * 2.4) * 0.1;
                target.rotation.z = Math.sin(s.t * 1.2) * 0.04;
              } else {
                target.rotation.x = Math.sin(s.t * 2.4) * (walking ? 0.35 : 0.05);
                target.rotation.z = 0;
              }
            }
          });
        }
        if (head) {
          // gentle idle look-around, always on (game keeps this too)
          head.rotation.y = Math.sin(s.t * 0.55) * 0.22;
          head.rotation.x = Math.sin(s.t * 0.4) * 0.06;
        }
        }
        if (s.spin) g.rotation.y += 0.0035; // turntable (togglable)
      }
      // camera orbit
      const { yaw, pitch, dist, targetY } = handle;
      const cy = Math.sin(pitch) * dist + targetY;
      const cd = Math.cos(pitch) * dist;
      camera.position.set(Math.sin(yaw) * cd, cy, Math.cos(yaw) * cd);
      camera.lookAt(0, targetY, 0);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      vp.current = null;
    };
  }, []);

  // ── background / grid toggles (scene-level) ──
  useEffect(() => {
    const h = vp.current;
    if (!h) return;
    (h.scene.background as THREE.Color).set(lightBg ? 0xcfcfd6 : 0x1c1c24);
    h.grid.visible = grid;
  }, [lightBg, grid]);

  // ── (re)build the displayed model ──
  useEffect(() => {
    const handle = vp.current;
    if (!handle) return;
    if (modelGroup.current) {
      handle.scene.remove(modelGroup.current);
      disposeGroup(modelGroup.current);
      modelGroup.current = null;
    }
    const g = new THREE.Group();
    if (tab === 'mobs') {
      const e = MOB_ENTRIES[mobSel] ?? MOB_ENTRIES[0];
      const skins = getMobSkins(e.variant ? `${e.key}:${e.variant}` : e.key);
      const parts = buildMobModel(e.key, e.variant);
      if (parts) {
        parts.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.userData.part = mesh.userData.part ?? 'part';
            // remember head/limb refs on the root for animation
            if (mesh.userData.part === 'head') g.userData.head = mesh;
          }
        });
        g.userData.legs = parts.legs;
        g.userData.arms = parts.arms;
        g.userData.mobKey = e.key;
        g.add(parts.group);
        const cam = defaultCam('mobs', e.key);
        handle.targetY = cam.targetY;
        handle.dist = cam.dist;
      }
      void skins;
    } else if (blockDef) {
      const mesh = buildBlockMesh(blockDef);
      if (mesh) {
        g.add(mesh);
        g.userData.head = undefined;
      }
      const cam = defaultCam('blocks');
      handle.targetY = cam.targetY;
      handle.dist = cam.dist;
    }
    handle.scene.add(g);
    modelGroup.current = g;
    (window as unknown as { __avModel?: THREE.Group }).__avModel = g; // QA hook
  }, [tab, mobSel, blockDef]);

  // ── model tooling: wireframe material flag + hitbox/pivot overlays ──
  // (re-applied on toggle / model change, after the build effect above)
  useEffect(() => {
    const g = modelGroup.current;
    if (!g) return;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        (mesh.material as THREE.MeshLambertMaterial).wireframe = wireUV;
      }
    });
    // clear previous overlays
    const old = (g.userData.overlays ?? []) as THREE.Object3D[];
    for (const o of old) {
      o.parent?.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Line & THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }
    g.userData.overlays = [];
    if (tab !== 'mobs') return;

    const overlays: THREE.Object3D[] = [];
    if (hitbox) {
      const dims = getMobDims(g.userData.mobKey as string);
      if (dims) {
        const box = new THREE.BoxGeometry(dims.w, dims.h, dims.w);
        const edges = new THREE.EdgesGeometry(box);
        box.dispose();
        const ls = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.95 }));
        ls.position.y = dims.h / 2;
        ls.renderOrder = 2;
        ls.name = 'hitbox';
        g.add(ls);
        overlays.push(ls);
      }
    }
    if (pivots) {
      // axis gizmo at every rotation origin: head, leg hips, arm shoulders —
      // top-pivot correctness is visible at a glance (Y+ = swing axis up)
      const addGizmo = (parent: THREE.Object3D | undefined, size: number): void => {
        if (!parent) return;
        const ax = new THREE.AxesHelper(size);
        ax.renderOrder = 3;
        ax.name = 'pivotGizmo';
        parent.add(ax);
        overlays.push(ax);
      };
      const head = g.userData.head as THREE.Object3D | undefined;
      addGizmo(head, 0.22);
      for (const leg of (g.userData.legs ?? []) as THREE.Object3D[]) addGizmo(leg, 0.16);
      for (const arm of (g.userData.arms ?? []) as unknown as { limbPivot?: THREE.Group }[]) addGizmo(arm?.limbPivot, 0.16);
    }
    g.userData.overlays = overlays;
  }, [tab, mobSel, blockDef, hitbox, pivots, wireUV]);

  // ── skin/texture panel: every texture the current model uses (pure data —
  // derived from the MobSkins parts, so no effects/setState involved) ──
  const skinCards = useMemo(() => {
    if (!skinsView) return [];
    const cards: { label: string; size: string; src: string }[] = [];
    const rasterize = (img: CanvasImageSource, w: number, h: number): string => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0);
      return c.toDataURL();
    };
    if (tab === 'mobs') {
      const e = MOB_ENTRIES[mobSel] ?? MOB_ENTRIES[0];
      if (e.key === 'knight') {
        // the knight paints its own canvases at runtime (no UV atlas file) —
        // rasterize the REAL map+glow textures off a throwaway build
        cards.push(...knightSkinCards(e.variant ?? 'cyber'));
        return cards;
      }
      const skins = getMobSkins(e.variant ? `${e.key}:${e.variant}` : e.key);
      const seen = new Map<THREE.Texture, { fields: string[]; part: MobSkinPart }>();
      const visit = (field: string, part?: MobSkinPart): void => {
        if (!part) return;
        const prev = seen.get(part.tex);
        if (prev) prev.fields.push(field);
        else seen.set(part.tex, { fields: [field], part });
      };
      visit('head', skins.head); visit('body', skins.body); visit('limb', skins.limb);
      visit('limb2', skins.limb2); visit('snout', skins.snout); visit('udder', skins.udder);
      visit('horns', skins.horns); visit('extra', skins.extra); visit('extra2', skins.extra2);
      visit('wing', skins.wing); visit('legsBaked', skins.legsBaked);
      visit('hat', skins.hat); visit('hat1', skins.hat1); visit('hat2', skins.hat2); visit('hat3', skins.hat3);
      if (skins.fur) {
        visit('fur.head', skins.fur.head);
        visit('fur.body', skins.fur.body);
        visit('fur.limb', skins.fur.limb);
      }
      for (const { fields, part } of seen.values()) {
        const img = part.tex.image as HTMLImageElement | HTMLCanvasElement | undefined;
        if (!img) continue;
        const src = img instanceof HTMLCanvasElement ? rasterize(img, img.width, img.height) : img.src;
        cards.push({ label: fields.join(', '), size: `${part.texW}×${part.texH}`, src });
      }
    } else if (blockDef) {
      const img = getAtlas().texture.image as HTMLCanvasElement | HTMLImageElement | undefined;
      if (img) {
        const src = img instanceof HTMLCanvasElement ? rasterize(img, img.width, img.height) : img.src;
        cards.push({ label: `${blockDef.name} — block atlas`, size: `${img.width}×${img.height}`, src });
      }
    }
    return cards;
  }, [skinsView, tab, mobSel, blockDef]);

  const resetView = (): void => {
    const h = vp.current;
    if (!h) return;
    const cam = defaultCam(tab, tab === 'mobs' ? MOB_ENTRIES[mobSel]?.key : undefined);
    h.yaw = 0.6; h.pitch = 0.18;
    h.dist = cam.dist; h.targetY = cam.targetY;
    if (modelGroup.current) modelGroup.current.rotation.y = 0;
  };

  const dims = tab === 'mobs' ? getMobDims(entry?.key ?? '') : null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#101014]" style={{ fontFamily: 'var(--font-mc)' }}>
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-black/60 bg-[#2a2a31] px-3 py-2">
        <button
          className="border-2 border-[#5a5a5a] border-b-[#2e2e2e] border-r-[#2e2e2e] bg-[#6d6d6d] px-3 py-1.5 text-xs text-white hover:bg-[#7d7d7d]"
          onClick={() => { audio.click(); setScreen('menu' as Screen); }}
        >
          ← Done
        </button>
        <div className="mx-2 text-sm text-white" style={{ textShadow: '2px 2px 0 #000' }}>Asset Viewer</div>
        <div className="flex gap-1">
          <TabBtn active={tab === 'mobs'} onClick={() => { audio.click(); setTab('mobs'); }}>Mobs</TabBtn>
          <TabBtn active={tab === 'blocks'} onClick={() => { audio.click(); setTab('blocks'); }}>Blocks</TabBtn>
        </div>
        {tab === 'mobs' && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-[10px] text-[#ccc]">
              <span className="text-[#999]">Anim</span>
              <select
                className="border-2 border-[#5a5a5a] border-b-[#2e2e2e] border-r-[#2e2e2e] bg-[#4a4a52] px-1.5 py-1 text-[11px] text-white outline-none"
                value={effAnim}
                onChange={(e) => { audio.click(); setAnim(e.target.value as AnimOpt['key']); }}
              >
                {mobAnims.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-[#ccc]">
              <span className="text-[#999]">Speed</span>
              <input
                type="range" min={0} max={2} step={0.05} value={speed}
                className="h-1 w-20 accent-[#c8a24a]"
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
              <span className="w-8 tabular-nums text-[#999]">{speed.toFixed(2)}×</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* sidebar list */}
        <div className="max-h-40 shrink-0 overflow-y-auto border-b-2 border-black/60 bg-[#232329] p-2 md:max-h-none md:w-60 md:border-b-0 md:border-r-2">
          <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
            {tab === 'mobs'
              ? MOB_ENTRIES.map((m, i) => (
                  <button
                    key={m.label}
                    className={`border-2 px-2 py-1.5 text-left text-[11px] ${i === mobSel ? 'border-white bg-[#4a4a55] text-white' : 'border-transparent bg-[#3a3a42] text-[#cfcfcf] hover:bg-[#44444e]'} ${m.hostile ? 'text-[#ff9d9d]' : ''}`}
                    style={i === mobSel ? { textShadow: '1px 1px 0 #000' } : undefined}
                    onClick={() => { audio.click(); setMobSel(i); }}
                  >
                    {m.hostile ? '⚔ ' : ''}{m.label}
                  </button>
                ))
              : blocks.map((b, i) => (
                  <button
                    key={b.id}
                    className={`border-2 px-2 py-1.5 text-left text-[11px] ${i === blockSel ? 'border-white bg-[#4a4a55] text-white' : 'border-transparent bg-[#3a3a42] text-[#cfcfcf] hover:bg-[#44444e]'}`}
                    onClick={() => { audio.click(); setBlockSel(i); }}
                  >
                    {b.name}
                  </button>
                ))}
          </div>
        </div>

        {/* viewport */}
        <div className="relative min-h-0 flex-1" ref={canvasHost}>
          {/* inspection toolbar (bottom-right) */}
          <div className="absolute bottom-2 right-2 flex max-w-[85%] flex-wrap-reverse justify-end gap-1">
            <ToolChip active={spin} label="Rotate" title="Turntable on/off — freeze the model" onClick={() => { audio.click(); setSpin((v) => !v); }} />
            <ToolChip active={grid} label="Grid" title="Ground grid (scale reference)" onClick={() => { audio.click(); setGrid((v) => !v); }} />
            <ToolChip active={skinsView} label="Skins" title="List the textures this model uses" onClick={() => { audio.click(); setSkinsView((v) => !v); }} />
            {tab === 'mobs' && (
              <>
                <ToolChip active={hitbox} label="Hitbox" title="Logical collision box (width × height)" onClick={() => { audio.click(); setHitbox((v) => !v); }} />
                <ToolChip active={pivots} label="Pivots" title="Show rotation origins (head/legs/arms)" onClick={() => { audio.click(); setPivots((v) => !v); }} />
              </>
            )}
            <ToolChip active={wireUV} label="Wireframe" title="Wireframe overlay" onClick={() => { audio.click(); setWireUV((v) => !v); }} />
            <ToolChip active={lightBg} label="Light BG" title="Light background (spot dark-on-dark issues)" onClick={() => { audio.click(); setLightBg((v) => !v); }} />
            <ToolChip active={false} label="Reset" title="Reset camera + rotation" onClick={() => { audio.click(); resetView(); }} />
          </div>

          {/* skin/texture panel (bottom-left) */}
          {skinsView && (
            <div className="absolute bottom-2 left-2 max-h-[60%] w-56 overflow-y-auto border-2 border-black/60 bg-black/70 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#9a9aa6]">Textures in use</div>
              {skinCards.length === 0 && <div className="text-[10px] text-[#777]">no textures</div>}
              <div className="flex flex-col gap-2">
                {skinCards.map((c, i) => (
                  <div key={i}>
                    <img
                      src={c.src}
                      alt={c.label}
                      className="w-full border border-[#444] bg-[#222]"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div className="mt-0.5 text-[9px] leading-tight text-[#aaa]">{c.label}</div>
                    <div className="text-[9px] leading-tight text-[#666]">{c.size}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-[#888]">
            {skinsView ? '' : 'drag = orbit · wheel = zoom'}
          </div>
          <div className="pointer-events-none absolute right-2 top-2 border-2 border-black/40 bg-black/45 px-2 py-1 text-right text-[11px] text-white">
            <div>
              {tab === 'mobs'
                ? `${entry?.label ?? ''} — vanilla skin`
                : `${blockDef?.name ?? ''} (#${blockDef?.id})`}
            </div>
            {tab === 'mobs' && dims && (
              <div className="text-[9px] text-[#9a9aa6]">
                hitbox {dims.w.toFixed(2)}×{dims.h.toFixed(2)} · anim {effAnim}
                {!spin ? ' · static' : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`border-2 px-3 py-1 text-[11px] ${active ? 'border-[#8a8a8a] border-b-[#4a4a4a] border-r-[#4a4a4a] bg-[#7d7d7d] text-white' : 'border-[#5a5a5a] border-b-[#2e2e2e] border-r-[#2e2e2e] bg-[#6d6d6d] text-[#ddd] hover:bg-[#767676]'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolChip({ active, label, title, onClick }: { active: boolean; label: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      className={`border px-2 py-1 text-[10px] backdrop-blur-sm ${active ? 'border-[#e8c15a] bg-[#8a6d2f]/90 text-[#ffe9b0]' : 'border-[#555] bg-black/55 text-[#ccc] hover:bg-black/75'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ─── Block preview cube: SAME face/tile mapping as the world mesher ──────────
// Face order [+X, −X, +Y, −Y, +Z, −Z]; tiles array follows the same order via
// the blocks registry helpers. Half-texel inset comes from tileUV itself.
function buildBlockMesh(def: BlockDef): THREE.Mesh | null {
  const atlas = getAtlas();
  const faces = Array.isArray(def.tiles) ? def.tiles : [def.tiles, def.tiles, def.tiles, def.tiles, def.tiles, def.tiles];
  const isCross = def.model === 'cross' || def.model === 'torch';
  if (isCross) {
    // flat billboard with the block's tile texture
    const [u0, v0, u1, v1] = tileUV(faces[0]);
    const geo = new THREE.PlaneGeometry(1, 1);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.5;
    return mesh;
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(faces[f] ?? faces[0]);
    // BoxGeometry per-face vertex order: TL, TR, BL, BR
    uv.setXY(f * 4 + 0, u0, v1);
    uv.setXY(f * 4 + 1, u1, v1);
    uv.setXY(f * 4 + 2, u0, v0);
    uv.setXY(f * 4 + 3, u1, v0);
  }
  uv.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: atlas.texture, ...(def.cutout ? { alphaTest: 0.5 } : {}), ...(def.id === 10 ? { transparent: true, opacity: 0.75 } : {}) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.5;
  return mesh;
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose();
    }
  });
}

export default AssetViewer;
