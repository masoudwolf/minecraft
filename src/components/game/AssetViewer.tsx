'use client';

// ─── Asset Viewer: inspect mob models & block textures (creator tool) ───────
// Rebuilt (post-reset). Mobs render with the vanilla-skin pipeline, blocks
// render with the exact same atlas/face mapping the world mesher uses — so
// what you see here is what the game renders.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore, type Screen } from '@/game/state';
import { audio } from '@/game/audio';
import { getMobSkins } from '@/game/entities/mobSkins';
import { preloadEntityTextures } from '@/game/entities/vanillaSkins';
import { buildMobModel, type MobParts } from '@/game/entities/mobs';
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
];

// ─── Block catalog (all registered, in id order) ─────────────────────────────
function blockList(): BlockDef[] {
  return Object.values(BLOCKS).sort((a, b) => a.id - b.id);
}

// ─── Three.js viewport (shared by both tabs) ─────────────────────────────────
interface ViewportHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  yaw: number;
  pitch: number;
  dist: number;
  targetY: number;
}

function AssetViewer() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [tab, setTab] = useState<'mobs' | 'blocks'>('mobs');
  const [mobSel, setMobSel] = useState(0);
  const [blockSel, setBlockSel] = useState(0);
  const [walking, setWalking] = useState(true);
  const [wireUV, setWireUV] = useState(false);

  const canvasHost = useRef<HTMLDivElement>(null);
  const vp = useRef<ViewportHandle | null>(null);
  const modelGroup = useRef<THREE.Group | null>(null);
  const animState = useRef({ t: 0, walking, wireUV });
  useEffect(() => {
    animState.current.walking = walking;
    animState.current.wireUV = wireUV;
  }, [walking, wireUV]);

  const blocks = useMemo(() => blockList(), []);
  const blockDef = blocks[Math.min(blockSel, blocks.length - 1)];

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

    const handle: ViewportHandle = { scene, camera, renderer, yaw: 0.6, pitch: 0.18, dist: 4.2, targetY: 1 };
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
      animState.current.t += 0.05;
      // walk animation on the current mob model
      const g = modelGroup.current;
      if (g) {
        const s = animState.current;
        const legs = g.userData.legs as THREE.Object3D[] | undefined;
        const arms = g.userData.arms as THREE.Object3D[] | undefined;
        const head = g.userData.head as THREE.Object3D | undefined;
        if (legs) {
          legs.forEach((leg, i) => {
            const pivot = (leg as unknown as { children?: THREE.Object3D[] }).children?.[0];
            const mesh = (pivot ?? leg) as THREE.Object3D & { rotation: THREE.Euler };
            mesh.rotation.x = s.walking ? Math.sin(s.t * 2.1 + (i % 2 === 0 ? 0 : Math.PI) + (i >= 2 ? Math.PI : 0)) * 0.7 : 0;
          });
        }
        if (arms) {
          arms.forEach((arm, i) => {
            const pivot = (arm as unknown as { pivot?: THREE.Group }).pivot;
            const target = pivot ?? arm;
            const side = i === 0 ? 1 : -1;
            const wing = (arm.userData as { part?: string }).part === 'wing';
            if (wing) {
              target.rotation.z = s.walking ? Math.sin(s.t * 5) * 0.16 * side : 0;
            } else {
              target.rotation.x = s.walking ? Math.sin(s.t * 2.1 + (i === 0 ? 0 : Math.PI)) * 0.45 : 0;
            }
          });
        }
        if (head) {
          // gentle idle look-around + mouse-follow flavor: head tracks slightly with yaw
          head.rotation.y = Math.sin(s.t * 0.55) * 0.22;
          head.rotation.x = Math.sin(s.t * 0.4) * 0.06;
        }
        g.rotation.y += 0.0035; // slow turntable
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
      const entry = MOB_ENTRIES[mobSel] ?? MOB_ENTRIES[0];
      const skinKey = entry.variant ? `${entry.key}:${entry.variant}` : entry.key;
      const skins = getMobSkins(skinKey);
      const parts = buildMobModel(entry.key, entry.variant);
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
        // center: legs hang from pivots; body already ~grounded
        g.add(parts.group);
        handle.targetY = entry.key === 'chicken' ? 0.45 : entry.key === 'golem' || entry.key === 'enderman' ? 1.35 : 0.85;
        handle.dist = entry.key === 'golem' ? 5 : 3.6;
      }
      void skins;
    } else if (blockDef) {
      const mesh = buildBlockMesh(blockDef);
      if (mesh) {
        g.add(mesh);
        g.userData.head = undefined;
      }
      handle.targetY = 0.5;
      handle.dist = 3.2;
    }
    handle.scene.add(g);
    modelGroup.current = g;
    (window as unknown as { __avModel?: THREE.Group }).__avModel = g; // QA hook
  }, [tab, mobSel, blockDef]);

  const entry = MOB_ENTRIES[mobSel];

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#101014]" style={{ fontFamily: 'var(--font-mc)' }}>
      {/* top bar */}
      <div className="flex items-center gap-2 border-b-2 border-black/60 bg-[#2a2a31] px-3 py-2">
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
        <div className="ml-auto flex items-center gap-2">
          {tab === 'mobs' && (
            <>
              <label className="hidden items-center gap-1 text-[10px] text-[#bbb] sm:flex">
                <input type="checkbox" checked={walking} onChange={(e) => { audio.click(); setWalking(e.target.checked); }} />
                Walk
              </label>
              <label className="hidden items-center gap-1 text-[10px] text-[#bbb] sm:flex">
                <input type="checkbox" checked={wireUV} onChange={(e) => { audio.click(); setWireUV(e.target.checked); }} />
                Wireframe
              </label>
            </>
          )}
        </div>
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
          <div className="pointer-events-none absolute bottom-2 left-2 text-[10px] text-[#888]">
            drag = orbit · wheel = zoom
          </div>
          <div className="pointer-events-none absolute right-2 top-2 border-2 border-black/40 bg-black/45 px-2 py-1 text-[11px] text-white">
            {tab === 'mobs'
              ? `${entry?.label ?? ''} — vanilla skin`
              : `${blockDef?.name ?? ''} (#${blockDef?.id})`}
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
