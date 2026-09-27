// ─── Game engine: orchestrates renderer, world, player, UI bridge ────────────
import * as THREE from 'three';
import { World } from './world/world';
import { Player, type HotbarSlot } from './player';
import { BLOCK, getBlockDef, isLiquid, containerOf, isWaterId, waterLevel } from './blocks';
import { chunkKey, CHUNK_SIZE, WORLD_HEIGHT, DAY_LENGTH } from './constants';
import { raycast, aabbIntersectsBlock, moveEntity, type RayHit } from './physics';
import { DropManager, type ItemStack, createBlockGeometry } from './entities/drops';
import { MobManager, type MobCallbacks, type SavedMob } from './entities/mobs';
import { createPlayerModel, animatePlayerModel, setPlayerModelArmor, type PlayerModelParts } from './entities/playerModel';
import { XPOrbManager } from './entities/xp';
import { AchievementManager, type AchievementDef } from './achievements';
import { getItemDef, isItemId, getToolDef, maxStack, breakInfo, isToolItem, isArmorItem, armorSlotIndex, getBowDef, isBowItem, ITEM } from './items';
import { matchRecipe, freshDur } from './crafting';
import { addToSlots, isEmptySlot, emptySlot, cloneSlots } from './inventory';
import { BlockEntityManager } from './blockEntities';
import { ParticleSystem } from './particles';
import { SkySystem, getTimeLabel } from './sky';
import { WeatherSystem } from './weather';
import { audio, type MaterialSound } from './audio';
import { getAtlas, getCrackTextures, tileAvgColor, getTileCanvas, getTileIconURL } from './textures/atlas';
import { getItemIconCanvas } from './items';
import { useGameStore, type GameMode, type WorldMeta } from './state';

const SAVE_KEY = 'voxelcraft.save'; // legacy localStorage slot (migration source)

interface SaveData {
  seed: number;
  time: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; hotbar: HotbarSlot[]; main?: HotbarSlot[]; armor?: (HotbarSlot | null)[]; selected: number; level?: number; xp?: number };
  edits: Record<string, Record<number, number>>;
  blockEntities?: Record<string, unknown>;
  spawn?: { x: number; y: number; z: number };
  achievements?: string[];
  gameMode?: GameMode;
  flying?: boolean;
  /** persisted live mobs (Phase 5) */
  mobs?: SavedMob[];
}

/** primed TNT entity (ignited block with fuse) */
interface PrimedTnt {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  fuse: number;
  t: number;
  mesh: THREE.Mesh;
  overlay: THREE.Mesh;
}

export class Game {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world!: World;
  player!: Player;
  drops!: DropManager;
  mobs!: MobManager;
  xpOrbs!: XPOrbManager;
  particles!: ParticleSystem;
  sky!: SkySystem;
  weather!: WeatherSystem;
  blockEnts!: BlockEntityManager;
  achievements = new AchievementManager();
  spawnPoint: { x: number; y: number; z: number } | null = null;
  /** DB world id currently being played (null = legacy local game) */
  currentWorldId: string | null = null;
  currentWorldName = '';
  /** transient: save failed notice shown once */
  private saveWarned = false;

  private raf = 0;
  private lastTime = 0;
  private accumulator = 0;
  private keys = new Set<string>();
  private mining = false;
  private mineProgress = 0;
  private mineTarget: RayHit | null = null;
  private placeCooldown = 0;
  private attackCooldown = 0;
  private eatCooldown = 0;
  private hungerRegenTimer = 0;
  private starveTimer = 0;
  private swingT = 0;
  private swingActive = false;
  private stepTimer = 0;
  private wasInWater = false;
  private wasOnGround = true;
  private prevVy = 0;
  private saveTimer = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fps = 60;
  private debugTimer = 0;
  private target: RayHit | null = null;
  private running = false;
  private disposed = false;
  /** camera perspective: 0 = first person, 1 = third back, 2 = third front (F5) */
  cameraMode: 0 | 1 | 2 = 0;
  private playerModel: PlayerModelParts | null = null;
  private modelWalkPhase = 0;
  private sprintFxTimer = 0;
  /** bow draw state (RMB held with bow) */
  private bowCharging = false;
  private bowCharge = 0;
  private bowDrawSoundT = 0;
  /** latest mob callbacks (mining attack → hurt→teleport chain) */
  private mobCb: MobCallbacks | null = null;

  // inventory / crafting / containers
  private craft2: HotbarSlot[] = Array.from({ length: 4 }, () => ({ blockId: 0, count: 0 }));
  private craft9: HotbarSlot[] = Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
  private craftOut: HotbarSlot | null = null;
  private cursor: HotbarSlot | null = null;
  private invTable = false;
  private invHover: { area: 'hotbar' | 'main' | 'craft' | 'container'; idx: number } | null = null;
  private lastInvHash = '';
  private containerKey: string | null = null; // "x,y,z" of open chest/furnace
  private furnaceSyncTimer = 0;
  private torchFxTimer = 0;
  private cactusTimer = 0;
  private plantScanTimer = 0;
  private lastXpSync = '';
  /** primed TNT entities (fuse burning) */
  private primedTnt: PrimedTnt[] = [];
  /** camera shake timer (explosions) */
  private shakeT = 0;

  private highlight: THREE.LineSegments;
  private crackMesh: THREE.Mesh;
  private crackMats: THREE.MeshBasicMaterial[];
  private handGroup: THREE.Group;
  private handMesh: THREE.Mesh | null = null;
  private handBlockId = -1;
  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;

  private settings = useGameStore.getState().settings;
  private storeUnsub: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 900);

    // entity lighting (Lambert drops / hand)
    this.ambient = new THREE.HemisphereLight(0xffffff, 0x666666, 0.9);
    this.scene.add(this.ambient);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sunLight.position.set(0.4, 1, 0.3);
    this.scene.add(this.sunLight);

    // block highlight wireframe
    const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.highlight = new THREE.LineSegments(hlGeo, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // crack overlay
    const cracks = getCrackTextures();
    this.crackMats = cracks.map((tex) => new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMats[0]);
    this.crackMesh.visible = false;
    this.scene.add(this.crackMesh);

    // hand (held item)
    this.handGroup = new THREE.Group();
    this.camera.add(this.handGroup);
    this.scene.add(this.camera);

    // settings subscription
    this.storeUnsub = useGameStore.subscribe((state) => {
      this.settings = state.settings;
      audio.setVolume(this.settings.volume);
      this.applySkyFog();
      if (this.sky) this.sky.cloudsEnabled = this.settings.clouds;
    });
    // restore persisted F5 camera mode
    if (this.settings.cameraMode === 1 || this.settings.cameraMode === 2) {
      this.cameraMode = this.settings.cameraMode;
    }

    // achievement popup bridge
    this.achievements.setCallback((a: AchievementDef) => {
      audio.achievement();
      const store = useGameStore.getState();
      store.setAdvancement({ title: a.title, desc: a.desc, icon: getTileIconURL(a.iconTile) });
      window.setTimeout(() => {
        if (useGameStore.getState().advancement?.title === a.title) {
          useGameStore.getState().setAdvancement(null);
        }
      }, 4500);
    });

    this.bindEvents();

    // QA/debug handle (used by automated testing)
    (window as unknown as { __voxel?: Game }).__voxel = this;
  }

  // ── game start / save / load ───────────────────────────────────────────────
  /** legacy entry: create a fresh DB world with defaults */
  async newGame(): Promise<void> {
    await this.createWorld('New World', 'survival');
  }

  /** create a persistent world in the DB, then play it */
  async createWorld(name: string, gameMode: GameMode, seed?: number): Promise<void> {
    const store = useGameStore.getState();
    try {
      const res = await fetch('/api/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gameMode, seed }),
      });
      if (!res.ok) throw new Error('create failed');
      const { world } = (await res.json()) as { world: { id: string; name: string; seed: number } };
      this.currentWorldId = world.id;
      this.currentWorldName = world.name;
      store.setCurrentWorld(world.id, world.name);
      this.setupWorld(world.seed, null, gameMode);
      await this.preloadSpawn();
      this.enterPlaying();
      this.saveGame(); // persist spawn baseline immediately
    } catch (err) {
      console.error('createWorld failed', err);
      // offline fallback: play a local-only world
      const s = seed ?? Math.floor(Math.random() * 2147483647);
      this.currentWorldId = null;
      this.currentWorldName = name;
      store.setCurrentWorld(null, name);
      this.setupWorld(s, null, gameMode);
      await this.preloadSpawn();
      this.enterPlaying();
    }
  }

  /** load a DB world and play it */
  async loadWorld(id: string): Promise<void> {
    const store = useGameStore.getState();
    try {
      const res = await fetch(`/api/worlds/${id}`);
      if (!res.ok) throw new Error('load failed');
      const { world } = (await res.json()) as { world: { id: string; name: string; gameMode: GameMode; seed: number; time: number; data: string } };
      let save: SaveData | null = null;
      try { save = JSON.parse(world.data) as SaveData; } catch { save = null; }
      if (save) save.gameMode = world.gameMode;
      this.currentWorldId = world.id;
      this.currentWorldName = world.name;
      store.setCurrentWorld(world.id, world.name);
      this.setupWorld(world.seed, save, world.gameMode);
      if (save) this.sky.time = save.time ?? this.sky.time;
      await this.preloadSpawn();
      this.enterPlaying();
    } catch (err) {
      console.error('loadWorld failed', err);
      this.showToast('Failed to load world');
      useGameStore.getState().setScreen('menu');
    }
  }

  /** one-time migration: legacy localStorage save → DB world (singleton-guarded) */
  private migratePromise: Promise<void> | null = null;
  async migrateLocalSave(): Promise<void> {
    if (this.migratePromise) return this.migratePromise;
    this.migratePromise = (async (): Promise<void> => {
      try {
        const MIGRATED_FLAG = 'voxelcraft.migrated';
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw || localStorage.getItem(MIGRATED_FLAG)) return;
        localStorage.setItem(MIGRATED_FLAG, '1'); // set first — prevents duplicate worlds on race/retry
        const save = JSON.parse(raw) as SaveData & { gameMode?: GameMode };
        const res = await fetch('/api/worlds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Migrated World',
            gameMode: save.gameMode ?? 'survival',
            seed: save.seed,
            time: save.time,
            data: raw,
          }),
        });
        if (!res.ok) return;
        localStorage.removeItem(SAVE_KEY);
        console.log('[voxelcraft] migrated local save → DB world');
      } catch { /* non-fatal */ }
    })();
    return this.migratePromise;
  }

  /** refresh the world list in the store */
  async fetchWorlds(): Promise<void> {
    try {
      const res = await fetch('/api/worlds');
      if (!res.ok) return;
      const { worlds } = (await res.json()) as { worlds: (WorldMeta & { achievements: string | string[] })[] };
      useGameStore.getState().setWorlds(worlds.map((w) => ({
        id: w.id,
        name: w.name,
        gameMode: w.gameMode,
        seed: w.seed,
        updatedAt: w.updatedAt,
        achievements: Array.isArray(w.achievements) ? w.achievements : safeParseArray(w.achievements),
      })));
    } catch { /* offline */ }
  }

  async deleteWorld(id: string): Promise<void> {
    console.warn('[voxelcraft] deleteWorld called', id, new Error().stack);
    try {
      await fetch(`/api/worlds/${id}`, { method: 'DELETE' });
      await this.fetchWorlds();
    } catch { /* ignore */ }
  }

  /** rename a DB world (world select screen) */
  async renameWorld(id: string, name: string): Promise<void> {
    const clean = name.trim().slice(0, 32);
    if (!clean) return;
    try {
      await fetch(`/api/worlds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      if (this.currentWorldId === id) {
        this.currentWorldName = clean;
        useGameStore.getState().setCurrentWorld(id, clean);
      }
      await this.fetchWorlds();
      audio.click();
    } catch { /* ignore */ }
  }

  private setupWorld(seed: number, save: SaveData | null, gameMode: GameMode = 'survival'): void {
    // clear previous world if any
    if (this.world) {
      for (const key of Array.from(this.world.chunks.keys())) {
        const [cx, cz] = key.split(',').map(Number);
        this.world.unloadChunk(cx, cz);
      }
    }
    this.drops?.clear();
    this.mobs?.clear();
    this.clearPrimedTnt();
    this.world = new World(seed, save?.edits);
    this.scene.add(this.world.group);
    this.sky = new SkySystem(this.scene, seed);
    this.sky.time = save?.time ?? DAY_LENGTH * 0.3;
    this.weather?.dispose();
    this.weather = new WeatherSystem(this.scene, seed, (wx, wz) => this.world.terrain.biomeAt(wx, wz));
    this.drops = new DropManager(this.scene, this.world, getAtlas().texture);
    this.particles = new ParticleSystem(this.scene);
    this.mobs = new MobManager(this.scene, this.world);
    if (save?.mobs && Array.isArray(save.mobs)) this.mobs.restore(save.mobs);
    this.xpOrbs = new XPOrbManager(this.scene, this.world);
    this.blockEnts = new BlockEntityManager(this.world);
    this.player = new Player(this.camera);
    this.player.gameMode = save?.gameMode ?? gameMode;
    this.player.flying = save?.flying ?? false;
    this.spawnPoint = save?.spawn ?? null;
    if (save?.blockEntities) this.blockEnts.load(save.blockEntities);

    // spawn position
    let sx = 8, sz = 8;
    this.world.ensureChunk(0, 0);
    let sy = this.world.surfaceY(sx, sz);
    let attempts = 0;
    while ((sy <= 40 || sy === 0) && attempts < 24) {
      sx += 12; sz += 5; attempts++;
      this.world.ensureChunk(Math.floor(sx / CHUNK_SIZE), Math.floor(sz / CHUNK_SIZE));
      sy = this.world.surfaceY(sx, sz);
    }
    if (save?.player) {
      this.player.entity.x = save.player.x;
      this.player.entity.y = save.player.y;
      this.player.entity.z = save.player.z;
      this.player.yaw = save.player.yaw;
      this.player.pitch = save.player.pitch;
      this.player.health = save.player.health;
      this.player.hotbar = save.player.hotbar;
      this.player.main = save.player.main && save.player.main.length === 27
        ? save.player.main
        : Array.from({ length: 27 }, () => ({ blockId: 0, count: 0 }));
      this.player.armor = save.player.armor && save.player.armor.length === 4
        ? save.player.armor
        : [null, null, null, null];
      this.player.selected = save.player.selected;
      this.player.fallStartY = save.player.y;
      this.player.level = save.player.level ?? 0;
      this.player.xp = save.player.xp ?? 0;
      if (save.achievements) this.achievements.restore(save.achievements);
    } else {
      this.player.entity.x = sx + 0.5;
      this.player.entity.y = sy + 1.2;
      this.player.entity.z = sz + 0.5;
      this.player.fallStartY = this.player.entity.y;
    }
    this.updateHandMesh(true);
    this.syncHUD(true);
    this.applySkyFog();
  }

  private async preloadSpawn(): Promise<void> {
    const store = useGameStore.getState();
    store.setScreen('loading');
    const pcx = Math.floor(this.player.entity.x / CHUNK_SIZE);
    const pcz = Math.floor(this.player.entity.z / CHUNK_SIZE);
    const dataR = 2;
    const jobs: [number, number][] = [];
    for (let dx = -dataR; dx <= dataR; dx++)
      for (let dz = -dataR; dz <= dataR; dz++)
        jobs.push([pcx + dx, pcz + dz]);
    jobs.sort((a, b) => (Math.abs(a[0] - pcx) + Math.abs(a[1] - pcz)) - (Math.abs(b[0] - pcx) + Math.abs(b[1] - pcz)));

    for (let i = 0; i < jobs.length; i++) {
      this.world.ensureChunk(jobs[i][0], jobs[i][1]);
      if (i % 3 === 0) {
        const p = i / jobs.length;
        useGameStore.getState().setHud({ loadingProgress: p, loadingLabel: 'Generating world…' });
        await this.nextFrame();
      }
    }
    // mesh immediate area
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const c = this.world.getChunk(pcx + dx, pcz + dz);
        if (c) this.world.buildMesh(c);
      }
    }
    useGameStore.getState().setHud({ loadingProgress: 1, loadingLabel: 'Building terrain…' });
    await this.nextFrame();
  }

  private nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  private enterPlaying(): void {
    useGameStore.getState().setHud({ loadingProgress: 1 });
    useGameStore.getState().setScreen('playing');
    this.running = true;
    this.lastTime = performance.now();
    this.requestLock();
    if (!this.raf) this.loop();
  }

  requestLock(): void {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock();
    }
  }

  /** resume from pause (Back to Game / QA) */
  resume(): void {
    useGameStore.getState().setScreen('playing');
    this.requestLock();
  }

  saveGame(): void {
    if (!this.world || !this.player) return;
    const edits: Record<string, Record<number, number>> = {};
    for (const [key, map] of this.world.edits) {
      const obj: Record<number, number> = {};
      for (const [idx, id] of map) obj[idx] = id;
      edits[key] = obj;
    }
    const save: SaveData = {
      seed: this.world.terrain.getSeed(),
      time: this.sky.time,
      player: {
        x: this.player.entity.x, y: this.player.entity.y, z: this.player.entity.z,
        yaw: this.player.yaw, pitch: this.player.pitch,
        health: this.player.health,
        hotbar: this.player.hotbar,
        main: this.player.main,
        armor: this.player.armor,
        selected: this.player.selected,
        level: this.player.level,
        xp: this.player.xp,
      },
      edits,
      blockEntities: this.blockEnts.serialize(),
      spawn: this.spawnPoint ?? undefined,
      achievements: this.achievements.serialize(),
      gameMode: this.player.gameMode,
      flying: this.player.flying,
      mobs: this.mobs ? this.mobs.serialize() : [],
    };
    const json = JSON.stringify(save);
    try {
      localStorage.setItem(SAVE_KEY, json); // legacy mirror (offline fallback)
      useGameStore.getState().setHasSave(true);
    } catch { /* quota */ }
    // canonical store: DB (fire-and-forget, throttled by callers)
    if (this.currentWorldId) {
      void fetch(`/api/worlds/${this.currentWorldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: save.time,
          data: json,
          achievements: JSON.stringify(this.achievements.serialize()),
        }),
      }).then(() => {
        this.saveWarned = false;
        useGameStore.getState().setHasSave(true);
      }).catch(() => {
        if (!this.saveWarned) {
          this.saveWarned = true;
          this.showToast('Cloud save failed — kept local copy');
        }
      });
    }
  }

  quitToMenu(): void {
    this.saveGame();
    this.running = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    const store = useGameStore.getState();
    store.setScreen('menu');
    void this.fetchWorlds();
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private lastSpaceTap = 0;

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F3') { e.preventDefault(); useGameStore.getState().toggleDebug(); return; }
    const st = useGameStore.getState();
    if (e.code === 'F5') {
      if (st.screen === 'playing') {
        e.preventDefault(); // don't reload the page mid-game
        this.cameraMode = ((this.cameraMode + 1) % 3) as 0 | 1 | 2;
        useGameStore.getState().updateSettings({ cameraMode: this.cameraMode }); // persist F5 preference
        audio.click();
      }
      return;
    }
    if (st.inv.open && st.screen === 'playing') {
      if (e.code === 'KeyE' || e.code === 'Escape') { e.preventDefault(); this.closeInventory(); return; }
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9 && this.invHover) this.invHotbarSwap(this.invHover.area, this.invHover.idx, n - 1);
      }
      return;
    }
    if (st.screen !== 'playing') return;
    this.keys.add(e.code);
    if (e.code === 'KeyE') { e.preventDefault(); this.openInventory(false); return; }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) { this.player.selected = n - 1; this.syncHUD(); this.updateHandMesh(); }
    }
    if (e.code === 'KeyQ') this.dropSelected();
    // creative: double-tap space toggles flight
    if (e.code === 'Space' && this.player.isCreative) {
      const now = performance.now();
      if (now - this.lastSpaceTap < 280) {
        this.player.flying = !this.player.flying;
        if (this.player.flying) this.player.entity.vy = 0;
        audio.click();
        this.syncHUD(true);
        this.lastSpaceTap = 0;
      } else {
        this.lastSpaceTap = now;
      }
    }
    if (e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement !== this.canvas || useGameStore.getState().screen !== 'playing') return;
    const sens = 0.0022 * this.settings.sensitivity;
    const mx = Math.max(-60, Math.min(60, e.movementX));
    const my = Math.max(-60, Math.min(60, e.movementY));
    this.player.yaw -= mx * sens;
    this.player.pitch -= my * sens;
    this.player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.player.pitch));
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (useGameStore.getState().screen !== 'playing') return;
    if (document.pointerLockElement !== this.canvas) { this.requestLock(); return; }
    audio.resume();
    if (e.button === 0) { this.mining = true; this.startSwing(); }
    else if (e.button === 2) { this.rightClick(); }
    else if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) { this.mining = false; this.mineProgress = 0; }
    else if (e.button === 2) { this.releaseBow(); }
  };

  private onWheel = (e: WheelEvent): void => {
    if (useGameStore.getState().screen !== 'playing') return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.player.selected = (this.player.selected + dir + 9) % 9;
    this.syncHUD();
    this.updateHandMesh();
  };

  private hadLock = false;
  private lockHeldAt = 0;
  private onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked) { this.hadLock = true; this.lockHeldAt = performance.now(); return; }
    // unlocked: pause only if a real lock session just ended (>500ms).
    // flash-engage/disengage cycles (headless, alt-tab quirks) must not pause the game.
    if (useGameStore.getState().inv.open) return; // inventory open: world keeps running
    if (
      this.hadLock &&
      performance.now() - this.lockHeldAt > 500 &&
      useGameStore.getState().screen === 'playing' &&
      !this.player?.dead
    ) {
      useGameStore.getState().setScreen('paused');
      this.saveGame();
    }
    this.hadLock = false;
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  /** RMB: draw bow when held, otherwise interact/place */
  private rightClick(): void {
    const slot = this.player.hotbar[this.player.selected];
    if (slot && slot.count > 0 && isBowItem(slot.blockId)) {
      if (!this.bowCharging) {
        if (this.player.isCreative || this.countItem(ITEM.ARROW) > 0) {
          this.bowCharging = true;
          this.bowCharge = 0;
          this.bowDrawSoundT = 0;
        } else {
          this.showToast('No arrows left!');
        }
      }
      return;
    }
    this.placeBlock();
  }

  /** RMB released: fire the arrow (charge ≥ 0.14) or cancel */
  private releaseBow(): void {
    if (!this.bowCharging) return;
    this.bowCharging = false;
    const charge = this.bowCharge;
    this.bowCharge = 0;
    if (charge < 0.14) return; // too weak — cancel
    const p = this.player;
    if (!p.isCreative) {
      if (this.countItem(ITEM.ARROW) <= 0) return;
      this.consumeItem(ITEM.ARROW, 1);
    }
    const fwd = p.forwardVector();
    const speed = 14 + 40 * Math.min(1, charge);
    const dmg = Math.max(1, Math.round(2 + 7 * Math.min(1, charge)));
    this.mobs.shootPlayerArrow(p.x, p.eyeY() - 0.08, p.z, fwd.x, fwd.y, fwd.z, speed, dmg);
    // bow durability
    const slot = p.hotbar[p.selected];
    const bow = slot ? getBowDef(slot.blockId) : undefined;
    if (bow && !p.isCreative) {
      slot.dur = (slot.dur ?? bow.dur) - 1;
      if (slot.dur <= 0) {
        p.hotbar[p.selected] = { blockId: 0, count: 0 };
        audio.breakBlock('glass');
        this.showToast('Your bow broke!');
        this.updateHandMesh(true);
      }
      this.syncHUD();
      this.syncInventory();
    }
    this.startSwing();
  }

  /** total count of an item id across hotbar + main inventory */
  private countItem(id: number): number {
    let n = 0;
    for (const s of this.player.hotbar) if (s.count > 0 && s.blockId === id) n += s.count;
    for (const s of this.player.main) if (s.count > 0 && s.blockId === id) n += s.count;
    return n;
  }

  /** remove n of an item id (hotbar first), returns true when fully consumed */
  private consumeItem(id: number, n: number): boolean {
    let left = n;
    const takeFrom = (slots: HotbarSlot[]): void => {
      for (const s of slots) {
        if (left <= 0) return;
        if (s.count > 0 && s.blockId === id) {
          const take = Math.min(s.count, left);
          s.count -= take;
          left -= take;
          if (s.count <= 0) { s.blockId = 0; s.count = 0; }
        }
      }
    };
    takeFrom(this.player.hotbar);
    takeFrom(this.player.main);
    if (left < n) {
      this.syncHUD();
      this.syncInventory();
      this.updateHandMesh();
    }
    return left === 0;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  // ── interaction ────────────────────────────────────────────────────────────
  private updateTarget(): void {
    const eye = new THREE.Vector3(this.player.x, this.player.eyeY(), this.player.z);
    const dir = this.player.forwardVector();
    this.target = raycast(this.world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 4.5);
    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else {
      this.highlight.visible = false;
    }
  }

  private mineTick(dt: number): void {
    const heldSlot = this.player.hotbar[this.player.selected];
    const heldTool = heldSlot && heldSlot.count > 0 && isItemId(heldSlot.blockId)
      ? getToolDef(heldSlot.blockId)
      : undefined;

    // mob attack takes priority over mining
    if (this.mining && this.attackCooldown <= 0) {
      const eye = new THREE.Vector3(this.player.x, this.player.eyeY(), this.player.z);
      const dir = this.player.forwardVector();
      const hit = this.mobs.raycastMob(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      if (hit) {
        this.attackCooldown = 0.42;
        this.startSwing();
        const kx = hit.mob.x - this.player.x;
        const kz = hit.mob.z - this.player.z;
        const killed = this.mobs.hurtMob(hit.mob, heldTool ? heldTool.dmg : 2, kx, kz, this.mobCb ?? undefined);
        if (killed && hit.mob.def.hostile) this.achievements.unlock('monsterHunter');
        this.particles.hurt(hit.mob.x, hit.mob.y, hit.mob.z);
        this.damageTool(heldTool && heldTool.type !== 'sword' ? 2 : 1);
        this.crackMesh.visible = false;
        return;
      }
    }
    if (!this.mining || !this.target) { this.crackMesh.visible = false; return; }
    const t = this.target;
    // ── creative: instant break, no drops, no XP, no tool wear ──
    if (this.player.isCreative) {
      const cdef = getBlockDef(t.id);
      if (!cdef) return;
      const col = tileAvgColor(Array.isArray(cdef.tiles) ? cdef.tiles[2] : cdef.tiles);
      this.particles.burstBlockBreak(t.x, t.y, t.z, col);
      audio.breakBlock((cdef.sound ?? 'stone') as MaterialSound);
      if (containerOf(t.id)) this.blockEnts.destroy(t.x, t.y, t.z);
      this.world.setBlock(t.x, t.y, t.z, BLOCK.AIR);
      // pop unsupported blocks above (torch, flowers, bed) + plant stacks
      let py = t.y + 1;
      let guard = 0;
      while (py < WORLD_HEIGHT && guard++ < 96) {
        const aboveId = this.world.getBlock(t.x, py, t.z);
        const aboveDef = getBlockDef(aboveId);
        const isStack = aboveId === BLOCK.SUGARCANE || aboveId === BLOCK.CACTUS;
        if (!aboveDef?.needsGround && !isStack) break;
        if (containerOf(aboveId)) this.blockEnts.destroy(t.x, py, t.z);
        this.world.setBlock(t.x, py, t.z, BLOCK.AIR);
        py++;
      }
      this.startSwing();
      this.crackMesh.visible = false;
      return;
    }
    // target changed? reset progress
    if (!this.mineTarget || this.mineTarget.x !== t.x || this.mineTarget.y !== t.y || this.mineTarget.z !== t.z) {
      this.mineTarget = t;
      this.mineProgress = 0;
    }
    const def = getBlockDef(t.id);
    if (!def) { this.crackMesh.visible = false; return; }
    const { time, harvest } = breakInfo(def, heldTool);
    if (!Number.isFinite(time)) { this.crackMesh.visible = false; return; }
    this.mineProgress += dt / time;

    // dig sound + swing loop
    this.stepTimer += dt;
    if (this.stepTimer > 0.24) {
      this.stepTimer = 0;
      audio.dig((def.sound ?? 'stone') as MaterialSound);
      this.startSwing();
    }

    if (this.mineProgress >= 1) {
      // break!
      const col = tileAvgColor(Array.isArray(def.tiles) ? def.tiles[2] : def.tiles);
      this.particles.burstBlockBreak(t.x, t.y, t.z, col);
      audio.breakBlock((def.sound ?? 'stone') as MaterialSound);
      const dropId = def.drop === undefined ? t.id : def.drop;
      // gravel has a 12% chance to drop flint (MC-style, used for arrows)
      const actualDrop = harvest && t.id === BLOCK.GRAVEL && Math.random() < 0.12 ? ITEM.FLINT : dropId;
      if (harvest && actualDrop && actualDrop > 0) {
        this.drops.spawn(actualDrop, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
      }
      // XP from ores
      const oreXp = t.id === BLOCK.COAL_ORE ? 1 : t.id === BLOCK.IRON_ORE ? 1 : t.id === BLOCK.GOLD_ORE ? 2 : t.id === BLOCK.DIAMOND_ORE ? 5 : 0;
      if (oreXp > 0) {
        const n = 1 + Math.floor(Math.random() * oreXp);
        for (let i = 0; i < n; i++) this.xpOrbs.spawn(t.x + 0.5, t.y + 0.4, t.z + 0.5, oreXp);
      }
      this.damageTool(1);
      // container: spill contents
      if (containerOf(t.id)) {
        for (const item of this.blockEnts.destroy(t.x, t.y, t.z)) {
          this.drops.spawn(item.id, t.x + 0.5, t.y + 0.5, t.z + 0.5, item.count);
        }
      }
      this.world.setBlock(t.x, t.y, t.z, BLOCK.AIR);
      // pop unsupported blocks above (torch, flowers, bed) + plant stacks (sugarcane/cactus)
      let py = t.y + 1;
      let guard = 0;
      while (py < WORLD_HEIGHT && guard++ < 96) {
        const aboveId = this.world.getBlock(t.x, py, t.z);
        const aboveDef = getBlockDef(aboveId);
        const isStack = aboveId === BLOCK.SUGARCANE || aboveId === BLOCK.CACTUS;
        if (!aboveDef?.needsGround && !isStack) break;
        const aDrop = aboveDef && aboveDef.drop !== undefined ? aboveDef.drop : aboveId;
        if (aDrop) this.drops.spawn(aDrop, t.x + 0.5, py + 0.3, t.z + 0.5, 1);
        if (containerOf(aboveId)) {
          for (const item of this.blockEnts.destroy(t.x, py, t.z)) {
            this.drops.spawn(item.id, t.x + 0.5, py + 0.5, t.z + 0.5, item.count);
          }
        }
        this.world.setBlock(t.x, py, t.z, BLOCK.AIR);
        py++;
      }
      this.mineProgress = 0;
      this.mineTarget = null;
      this.crackMesh.visible = false;
      return;
    }
    // crack overlay
    const stage = Math.min(9, Math.floor(this.mineProgress * 10));
    this.crackMesh.material = this.crackMats[stage];
    this.crackMesh.visible = true;
    this.crackMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
  }

  private placeBlock(): void {
    if (!this.target || this.placeCooldown > 0) return;
    // ── right-click interactions on target block ──
    const targetId = this.world.getBlock(this.target.x, this.target.y, this.target.z);
    if (!this.player.sneaking) {
      if (targetId === BLOCK.CRAFTING_TABLE) { this.openInventory(true); return; }
      const cont = containerOf(targetId);
      if (cont) { this.openContainer(cont, this.target.x, this.target.y, this.target.z); return; }
      if (targetId === BLOCK.BED) { this.sleepInBed(this.target.x, this.target.y, this.target.z); return; }
      // ignite TNT with an empty hand or a non-placeable item (flint-and-steel style)
      if (targetId === BLOCK.TNT) {
        const held = this.player.hotbar[this.player.selected];
        const holdingBlock = held && held.count > 0 && !isItemId(held.blockId);
        if (!holdingBlock) {
          this.igniteTNT(this.target.x, this.target.y, this.target.z);
          this.placeCooldown = 0.3;
          this.startSwing();
          return;
        }
      }
    }
    const slot = this.player.hotbar[this.player.selected];
    if (!slot || slot.blockId === 0 || slot.count <= 0) return;
    // eating food items
    if (isItemId(slot.blockId)) {
      const itemDef = getItemDef(slot.blockId);
      if (itemDef?.food && this.player.hunger < 19.6 && this.eatCooldown <= 0) {
        this.eatCooldown = 1.4;
        this.player.hunger = Math.min(20, this.player.hunger + itemDef.food);
        audio.eat();
        window.setTimeout(() => audio.burp(), 700);
        this.startSwing();
        slot.count--;
        if (slot.count <= 0) { slot.blockId = 0; slot.count = 0; }
        this.syncHUD();
        this.updateHandMesh();
      }
      return;
    }
    const bx = this.target.x + this.target.nx;
    const by = this.target.y + this.target.ny;
    const bz = this.target.z + this.target.nz;
    if (by < 0 || by >= WORLD_HEIGHT) return;
    let existing = this.world.getBlock(bx, by, bz);
    // lily pads ride the water surface: walk up out of the water column
    if (slot.blockId === BLOCK.LILY_PAD) {
      let ly = by;
      let guard = 0;
      while (ly < WORLD_HEIGHT - 1 && isLiquid(this.world.getBlock(bx, ly, bz)) && guard++ < 32) ly++;
      const cur = this.world.getBlock(bx, ly, bz);
      const belowCell = this.world.getBlock(bx, ly - 1, bz);
      if (cur !== BLOCK.AIR || belowCell !== BLOCK.WATER) {
        this.showToast('Lily pads need still water');
        return;
      }
      this.world.setBlock(bx, ly, bz, BLOCK.LILY_PAD);
      audio.place('grass');
      this.placeCooldown = 0.22;
      this.startSwing();
      slot.count--;
      if (slot.count <= 0) { slot.blockId = 0; slot.count = 0; }
      this.syncHUD();
      this.updateHandMesh();
      return;
    }
    if (existing !== BLOCK.AIR && !isLiquid(existing)) return;
    // don't place inside player
    if (aabbIntersectsBlock(this.player.entity, bx, by, bz)) return;
    const def = getBlockDef(slot.blockId);
    // sugarcane: needs sand/grass/dirt below (with adjacent water) or another cane
    if (slot.blockId === BLOCK.SUGARCANE) {
      const below = this.world.getBlock(bx, by - 1, bz);
      const belowOk = below === BLOCK.SUGARCANE || ((below === BLOCK.SAND || below === BLOCK.GRASS || below === BLOCK.DIRT) && this.hasAdjacentWater(bx, by - 1, bz));
      if (!belowOk) {
        this.showToast('Needs sand or grass beside water');
        return;
      }
    }
    // ground-support requirement (torch, flowers, bed)
    if (def?.needsGround) {
      const below = this.world.getBlock(bx, by - 1, bz);
      const belowDef = getBlockDef(below);
      if (!belowDef?.solid) {
        this.showToast('Needs solid ground below');
        return;
      }
    }
    this.world.setBlock(bx, by, bz, slot.blockId);
    // attach block entity for containers
    if (def?.container) this.blockEnts.getOrCreate(bx, by, bz);
    // achievements
    if (slot.blockId === BLOCK.FURNACE) this.achievements.unlock('hotTopic');
    if (slot.blockId === BLOCK.TORCH) this.achievements.unlock('lightItUp');
    audio.place((def?.sound ?? 'stone') as MaterialSound);
    this.placeCooldown = 0.22;
    this.startSwing();
    if (!this.player.isCreative) {
      slot.count--;
      if (slot.count <= 0) { slot.blockId = 0; slot.count = 0; }
    }
    this.syncHUD();
    this.updateHandMesh();
  }

  /** any water block orthogonally adjacent to this cell (at same or one-below level)? */
  private hasAdjacentWater(x: number, y: number, z: number): boolean {
    const dirs: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]];
    for (const [dx, dy, dz] of dirs) {
      if (isWaterId(this.world.getBlock(x + dx, y + dy, z + dz))) return true;
    }
    return false;
  }

  // ── TNT ─────────────────────────────────────────────────────────────────────
  /** replace a TNT block with a primed entity (fuse seconds, MC = 4s) */
  igniteTNT(x: number, y: number, z: number, fuse = 3): void {
    if (this.world.getBlock(x, y, z) !== BLOCK.TNT) return;
    this.world.setBlock(x, y, z, BLOCK.AIR);
    const mesh = new THREE.Mesh(createBlockGeometry(BLOCK.TNT, 0.98), new THREE.MeshLambertMaterial({ map: getAtlas().texture }));
    const overlay = new THREE.Mesh(
      new THREE.BoxGeometry(1.04, 1.04, 1.04),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    mesh.add(overlay);
    mesh.position.set(x + 0.5, y + 0.49, z + 0.5);
    this.scene.add(mesh);
    this.primedTnt.push({ x: x + 0.5, y, z: z + 0.5, vx: 0, vy: 4.6, vz: 0, fuse, t: 0, mesh, overlay });
    audio.fuseHiss();
  }

  private clearPrimedTnt(): void {
    for (const t of this.primedTnt) {
      this.scene.remove(t.mesh);
      t.mesh.geometry.dispose();
      t.overlay.geometry.dispose();
    }
    this.primedTnt = [];
  }

  private updatePrimedTnt(dt: number): void {
    for (let i = this.primedTnt.length - 1; i >= 0; i--) {
      const t = this.primedTnt[i];
      t.t += dt;
      t.fuse -= dt;
      // physics (small AABB, bounces settle on ground)
      const e = { x: t.x, y: t.y, z: t.z, vx: t.vx, vy: t.vy, vz: t.vz, width: 0.98, height: 0.98, onGround: false, inWater: false };
      e.vy -= 24 * dt;
      moveEntity(this.world, e, dt);
      t.x = e.x; t.y = e.y; t.z = e.z;
      t.vx = e.vx * Math.pow(0.6, dt);
      t.vz = e.vz * Math.pow(0.6, dt);
      t.vy = e.vy;
      t.mesh.position.set(t.x, t.y + 0.49, t.z);
      // white flash accelerates as the fuse burns down
      const flash = Math.sin(t.t * 10) > 0 ? 0.55 : 0;
      (t.overlay.material as THREE.MeshBasicMaterial).opacity = t.fuse < 0.6 ? (Math.sin(t.t * 40) > 0 ? 0.85 : 0) : flash;
      // smoke trail
      if (Math.random() < dt * 14) {
        this.particles.spawnParticle(t.x, t.y + 1.02, t.z, (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, [0.85, 0.85, 0.85], 0.07, 0.6, -0.5);
      }
      if (t.fuse <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.overlay.geometry.dispose();
        this.primedTnt.splice(i, 1);
        this.explodeAt(t.x, t.y + 0.49, t.z, 3.8);
      }
    }
  }

  /** explosion: destroys blocks (30% drops), chain-ignites TNT, damages player + mobs */
  private explodeAt(x: number, y: number, z: number, radius: number): void {
    audio.boom();
    for (let bx = Math.floor(x - radius); bx <= Math.floor(x + radius); bx++)
      for (let by = Math.floor(y - radius); by <= Math.floor(y + radius); by++)
        for (let bz = Math.floor(z - radius); bz <= Math.floor(z + radius); bz++) {
          const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
          if (d > radius) continue;
          const id = this.world.getBlock(bx, by, bz);
          if (id === BLOCK.AIR || id === BLOCK.BEDROCK || isWaterId(id)) continue;
          // chain reaction: other TNT blocks prime with a short fuse
          if (id === BLOCK.TNT) {
            this.igniteTNT(bx, by, bz, 0.2 + Math.random() * 0.7);
            continue;
          }
          const def = getBlockDef(id);
          this.world.setBlock(bx, by, bz, BLOCK.AIR);
          if (def) {
            const dropId = def.drop === undefined ? id : def.drop;
            if (dropId && Math.random() < 0.3) this.drops.spawn(dropId, bx + 0.5, by + 0.4, bz + 0.5, 1);
          }
          // containers spill everything they held
          if (containerOf(id)) {
            for (const item of this.blockEnts.destroy(bx, by, bz)) {
              this.drops.spawn(item.id, bx + 0.5, by + 0.5, bz + 0.5, item.count);
            }
          }
        }
    // damage mobs (chain)
    if (this.mobs) {
      for (const m of [...this.mobs.mobs]) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - x, m.y - y, m.z - z);
        if (d < radius * 2) {
          this.mobs.hurtMob(m, Math.max(1, Math.round(16 * (1 - d / (radius * 2)))), m.x - x, m.z - z, this.mobCb ?? undefined);
        }
      }
    }
    // damage + knockback the player (creative immune inside damage())
    const p = this.player;
    const pd = Math.hypot(p.x - x, p.y + 0.9 - y, p.z - z);
    if (pd < radius * 2 && !p.isCreative) {
      p.damage(Math.max(1, Math.round(18 * (1 - pd / (radius * 2)))));
      audio.hurt();
      const kx = p.x - x, kz = p.z - z;
      const len = Math.hypot(kx, kz) || 1;
      p.entity.vx += (kx / len) * 8;
      p.entity.vz += (kz / len) * 8;
      p.entity.vy = Math.max(p.entity.vy, 5);
    }
    // visuals: debris bursts + dust ring + camera shake
    for (let i = 0; i < 3; i++) {
      this.particles.burstBlockBreak(x - 0.6 + i * 0.6, y, z, [0.35, 0.33, 0.3]);
    }
    this.particles.burstLand(x, y, z, [0.2, 0.2, 0.2], 26);
    this.shakeT = 0.5;
  }

  /** right-click on chest / furnace */
  private openContainer(kind: 'furnace' | 'chest', x: number, y: number, z: number): void {
    const st = useGameStore.getState();
    if (st.screen !== 'playing' || st.inv.open) return;
    const be = this.blockEnts.getOrCreate(x, y, z);
    if (!be) return;
    this.mining = false;
    this.mineProgress = 0;
    this.keys.clear();
    this.containerKey = x + ',' + y + ',' + z;
    this.invTable = false;
    this.craftOut = null;
    st.setInv({ open: true, table: false, container: kind, cursor: null, craftOut: null, craft: [] });
    this.syncInventory(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** right-click on bed: set spawn + skip night */
  private sleepInBed(x: number, y: number, z: number): void {
    this.spawnPoint = { x: x + 0.5, y: y + 0.6, z: z + 0.5 };
    const dayFrac = this.sky.time / DAY_LENGTH; // 0=midnight .25=sunrise .5=noon .75=sunset
    const night = dayFrac > 0.72 || dayFrac < 0.22;
    if (night) {
      this.sky.time = DAY_LENGTH * 0.24; // just before sunrise
      this.showToast('Spawn point set · Slept until morning');
      this.achievements.unlock('sleepTight');
    } else {
      this.showToast('Spawn point set (you can only sleep at night)');
    }
    audio.click();
  }

  private pickBlock(): void {
    if (!this.target) return;
    // find slot with this block or put in current slot
    const hotbar = this.player.hotbar;
    for (let i = 0; i < 9; i++) {
      if (hotbar[i].blockId === this.target.id && hotbar[i].count > 0) {
        this.player.selected = i;
        this.syncHUD();
        this.updateHandMesh();
        return;
      }
    }
    hotbar[this.player.selected] = { blockId: this.target.id, count: Math.max(1, hotbar[this.player.selected].count) };
    this.syncHUD();
    this.updateHandMesh();
  }

  private dropSelected(): void {
    const slot = this.player.hotbar[this.player.selected];
    if (!slot || slot.count <= 0) return;
    const eye = new THREE.Vector3(this.player.x, this.player.eyeY() - 0.3, this.player.z);
    const dir = this.player.forwardVector();
    this.drops.spawn(slot.blockId, eye.x + dir.x * 0.4, eye.y, eye.z + dir.z * 0.4, 1);
    slot.count--;
    if (slot.count <= 0) slot.blockId = 0;
    this.syncHUD();
    this.updateHandMesh();
  }

  private tryPickup(stack: ItemStack): boolean {
    const leftover = this.addToInventory(stack.blockId, stack.count);
    if (leftover < stack.count) {
      audio.pop();
      this.syncHUD();
      this.syncInventory();
      // achievements on pickup
      if (stack.blockId === BLOCK.LOG || stack.blockId === BLOCK.SPRUCE_LOG || stack.blockId === BLOCK.JUNGLE_LOG) this.achievements.unlock('getWood');
      if (stack.blockId === ITEM.IRON_INGOT) this.achievements.unlock('acquireHardware');
      if (stack.blockId === ITEM.DIAMOND) this.achievements.unlock('diamonds');
      if (stack.blockId === ITEM.LEATHER) this.achievements.unlock('cowTipper');
      if (stack.blockId === ITEM.STEAK) this.achievements.unlock('ironBelly');
    }
    if (leftover === stack.count) return false;
    stack.count = leftover;
    return leftover === 0;
  }

  /** add to hotbar first, then main inventory. Returns leftover count. */
  private addToInventory(id: number, count: number, dur?: number): number {
    let left = addToSlots(this.player.hotbar, id, count, dur);
    if (left > 0) left = addToSlots(this.player.main, id, left, dur);
    return left;
  }

  private showToast(text: string): void {
    const store = useGameStore.getState();
    store.setToast(text);
    window.setTimeout(() => {
      if (useGameStore.getState().toast === text) store.setToast(null);
    }, 1400);
  }

  // ── inventory / crafting (UI calls these) ────────────────────────────────────
  private get craftGrid(): HotbarSlot[] {
    return this.invTable ? this.craft9 : this.craft2;
  }

  openInventory(table: boolean): void {
    const st = useGameStore.getState();
    if (st.screen !== 'playing' || st.inv.open) return;
    this.mining = false;
    this.mineProgress = 0;
    this.keys.clear();
    // creative mode: E opens the creative palette (no crafting grid)
    const creative = this.player.isCreative && !table;
    this.invTable = table;
    if (!creative) this.updateCraftOut();
    st.setInv({ open: true, table, creative });
    this.syncInventory(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  closeInventory(): void {
    const st = useGameStore.getState();
    if (!st.inv.open) return;
    // return craft grid + cursor to inventory (drop if full)
    const p = this.player.entity;
    if (st.inv.container === 'none') {
      for (const s of this.craftGrid) {
        if (isEmptySlot(s)) continue;
        const left = this.addToInventory(s.blockId, s.count, s.dur);
        if (left > 0) this.drops.spawn(s.blockId, p.x, p.y + 1, p.z, left);
        s.blockId = 0; s.count = 0;
      }
    }
    if (this.cursor) {
      const left = this.addToInventory(this.cursor.blockId, this.cursor.count, this.cursor.dur);
      if (left > 0) this.drops.spawn(this.cursor.blockId, p.x, p.y + 1, p.z, left);
      this.cursor = null;
    }
    this.craftOut = null;
    this.invHover = null;
    this.containerKey = null;
    st.setInv({ open: false, cursor: null, craftOut: null, craft: [], container: 'none', containerSlots: [], furnace: null, creative: false });
    this.syncHUD(true);
    this.updateHandMesh(true);
    this.requestLock();
  }

  /** creative palette: grab a full stack of this block/item into the cursor */
  creativePick(id: number): void {
    if (!this.player.isCreative) return;
    const stack = isItemId(id)
      ? { blockId: id, count: getToolDef(id) ? 1 : 64, dur: freshDur(id) }
      : { blockId: id, count: 64 };
    this.cursor = stack;
    audio.click();
    this.syncInventory(true);
  }

  /** creative palette: destroy the cursor stack (void slot) */
  creativeDelete(): void {
    if (!this.cursor) return;
    this.cursor = null;
    audio.pop();
    this.syncInventory(true);
  }

  setInvHover(hover: { area: 'hotbar' | 'main' | 'craft' | 'container' | 'armor'; idx: number } | null): void {
    this.invHover = hover;
  }

  private invHotbarSwap(area: 'hotbar' | 'main' | 'craft' | 'container' | 'armor', idx: number, hotbarIdx: number): void {
    if (area === 'armor') return; // armor slots don't hotbar-swap
    if (area === 'container') {
      if (!this.containerKey) return;
      const [xs, ys, zs] = this.containerKey.split(',').map(Number);
      const be = this.blockEnts.get(+xs, +ys, +zs);
      if (!be) return;
      const list = be.kind === 'chest' ? be.slots : [be.input, be.fuel];
      const a = list[idx];
      list[idx] = this.player.hotbar[hotbarIdx];
      this.player.hotbar[hotbarIdx] = a;
      if (be.kind === 'furnace') { be.input = list[0]; be.fuel = list[1]; }
    } else {
      const list = area === 'hotbar' ? this.player.hotbar : area === 'main' ? this.player.main : this.craftGrid;
      if (hotbarIdx === idx && area === 'hotbar') return;
      const a = list[idx];
      list[idx] = this.player.hotbar[hotbarIdx];
      this.player.hotbar[hotbarIdx] = a;
    }
    this.syncInventory(true);
    this.syncHUD(true);
    this.updateHandMesh();
  }

  invClick(area: 'hotbar' | 'main' | 'craft' | 'out' | 'container' | 'armor', idx: number, button: 'left' | 'right', shift: boolean): void {
    const st = useGameStore.getState();
    if (!st.inv.open) return;
    if (area === 'out') { this.takeCraftOutput(shift); return; }
    if (area === 'armor') { this.armorClick(idx); return; }
    if (area === 'container') {
      const st2 = useGameStore.getState();
      if (st2.inv.container === 'furnace' && idx === 2) {
        this.takeFurnaceOutput(shift);
        return;
      }
      if (!this.containerKey) return;
      const [xs, ys, zs] = this.containerKey.split(',').map(Number);
      const be = this.blockEnts.get(+xs, +ys, +zs);
      if (!be) return;
      if (be.kind === 'chest') {
        if (idx < 0 || idx >= be.slots.length) return;
        if (shift) this.shiftFromContainer(be.slots, idx);
        else this.clickSlot(be.slots, idx, button);
      } else {
        // furnace: idx 0 = input, 1 = fuel (output handled above)
        const list = [be.input, be.fuel];
        if (idx < 0 || idx >= 2) return;
        if (shift) this.shiftFromContainer(list, idx);
        else this.clickSlot(list, idx, button);
        be.input = list[0];
        be.fuel = list[1];
      }
      this.syncInventory(true);
      this.syncHUD(true);
      this.updateHandMesh();
      return;
    }
    const list = area === 'hotbar' ? this.player.hotbar : area === 'main' ? this.player.main : this.craftGrid;
    if (idx < 0 || idx >= list.length) return;
    if (shift) {
      this.shiftMove(area, list, idx);
    } else {
      this.clickSlot(list, idx, button);
    }
    this.updateCraftOut();
    this.syncInventory(true);
    this.syncHUD(true);
    this.updateHandMesh();
  }

  /** shift-click from chest/furnace: move into player inventory */
  private shiftFromContainer(list: HotbarSlot[], idx: number): void {
    const slot = list[idx];
    if (isEmptySlot(slot)) return;
    let left = addToSlots(this.player.hotbar, slot.blockId, slot.count, slot.dur);
    if (left > 0) left = addToSlots(this.player.main, slot.blockId, left, slot.dur);
    if (left <= 0) list[idx] = emptySlot();
    else slot.count = left;
    audio.pop();
  }

  /** take items out of the furnace output slot */
  private takeFurnaceOutput(shift: boolean): void {
    if (!this.containerKey) return;
    const [xs, ys, zs] = this.containerKey.split(',').map(Number);
    const be = this.blockEnts.get(+xs, +ys, +zs);
    if (!be || be.kind !== 'furnace' || isEmptySlot(be.output)) return;
    const out = be.output;
    if (!shift) {
      if (!this.cursor) {
        this.cursor = { ...out };
        be.output = emptySlot();
      } else if (this.cursor.blockId === out.blockId && !isToolItem(out.blockId) && this.cursor.count + out.count <= maxStack(out.blockId)) {
        this.cursor.count += out.count;
        be.output = emptySlot();
      } else return;
    } else {
      let guard = 0;
      while (guard++ < 64 && !isEmptySlot(be.output)) {
        const o = be.output;
        const left = this.addToInventory(o.blockId, o.count, o.dur);
        if (left > 0) { o.count = left; break; }
        be.output = emptySlot();
        audio.pop();
      }
    }
    audio.pop();
    this.syncInventory(true);
    this.syncHUD(true);
  }

  private clickSlot(list: HotbarSlot[], idx: number, button: 'left' | 'right'): void {
    const slot = list[idx];
    const cur = this.cursor;
    if (button === 'right') {
      if (!cur) {
        if (isEmptySlot(slot)) return;
        const half = Math.ceil(slot.count / 2);
        this.cursor = { ...slot, count: half };
        slot.count -= half;
        if (slot.count <= 0) list[idx] = emptySlot();
      } else {
        if (isEmptySlot(slot)) {
          list[idx] = { blockId: cur.blockId, count: 1, dur: cur.dur };
          cur.count--;
        } else if (slot.blockId === cur.blockId && slot.count < maxStack(slot.blockId)) {
          slot.count++;
          cur.count--;
        } else return;
        if (cur.count <= 0) this.cursor = null;
      }
      return;
    }
    // left click
    if (!cur) {
      if (isEmptySlot(slot)) return;
      this.cursor = { ...slot };
      list[idx] = emptySlot();
    } else if (isEmptySlot(slot)) {
      list[idx] = { ...cur };
      this.cursor = null;
    } else if (slot.blockId === cur.blockId && !isToolItem(slot.blockId)) {
      const max = maxStack(slot.blockId);
      const take = Math.min(cur.count, max - slot.count);
      slot.count += take;
      cur.count -= take;
      if (cur.count <= 0) this.cursor = null;
    } else {
      list[idx] = { ...cur };
      this.cursor = { ...slot };
    }
  }

  /** armor slot click: place only the matching piece; empty cursor takes the piece out */
  private armorClick(idx: number): void {
    if (idx < 0 || idx >= 4) return;
    const slots = this.player.armor;
    const cur = this.cursor;
    const piece = slots[idx];
    if (!cur) {
      if (!piece) return;
      this.cursor = { ...piece };
      slots[idx] = null;
    } else {
      if (armorSlotIndex(cur.blockId) !== idx) {
        this.showToast('Wrong armor slot');
        return;
      }
      slots[idx] = { ...cur };
      this.cursor = piece ? { ...piece } : null;
    }
    audio.pop();
    this.syncInventory(true);
    this.syncHUD(true);
  }

  private shiftMove(area: 'hotbar' | 'main' | 'craft', list: HotbarSlot[], idx: number): void {
    const slot = list[idx];
    if (isEmptySlot(slot)) return;
    // auto-equip armor pieces (MC behavior; swap with whatever is worn)
    const aIdx = armorSlotIndex(slot.blockId);
    if (aIdx >= 0 && area !== 'craft') {
      const old = this.player.armor[aIdx];
      this.player.armor[aIdx] = { ...slot };
      list[idx] = old ? { ...old } : emptySlot();
      audio.pop();
      this.syncHUD(true);
      return;
    }
    let left: number;
    if (area === 'hotbar') {
      left = addToSlots(this.player.main, slot.blockId, slot.count, slot.dur);
    } else {
      // main/craft -> hotbar first, then main (craft items go home)
      left = addToSlots(this.player.hotbar, slot.blockId, slot.count, slot.dur);
      if (left > 0 && area === 'main') left = addToSlots(this.player.main, slot.blockId, left, slot.dur);
    }
    if (left <= 0) list[idx] = emptySlot();
    else slot.count = left;
  }

  private updateCraftOut(): void {
    const grid = this.craftGrid;
    const size = this.invTable ? 3 : 2;
    const ids = grid.map((s) => (isEmptySlot(s) ? 0 : s.blockId));
    const res = matchRecipe(ids, size);
    this.craftOut = res
      ? { blockId: res.id, count: res.count, dur: freshDur(res.id) }
      : null;
  }

  private takeCraftOutput(shift: boolean): void {
    if (!this.craftOut) return;
    const grid = this.craftGrid;
    const consume = (): void => {
      for (let i = 0; i < grid.length; i++) {
        const s = grid[i];
        if (isEmptySlot(s)) continue;
        s.count--;
        if (s.count <= 0) grid[i] = emptySlot();
      }
    };
    if (!shift) {
      const out = this.craftOut;
      if (!this.cursor) {
        this.cursor = { ...out };
        this.onCrafted(out.blockId);
        consume();
      } else if (this.cursor.blockId === out.blockId && !isToolItem(out.blockId) && this.cursor.count + out.count <= maxStack(out.blockId)) {
        this.cursor.count += out.count;
        this.onCrafted(out.blockId);
        consume();
      } else return;
    } else {
      let guard = 0;
      while (guard++ < 64) {
        const size = this.invTable ? 3 : 2;
        const res = matchRecipe(grid.map((s) => (isEmptySlot(s) ? 0 : s.blockId)), size);
        if (!res) break;
        this.onCrafted(res.id);
        const left = this.addToInventory(res.id, res.count, freshDur(res.id));
        if (left > 0) {
          const p = this.player.entity;
          this.drops.spawn(res.id, p.x, p.y + 1, p.z, left);
        }
        consume();
        audio.pop();
      }
    }
    this.updateCraftOut();
    this.syncInventory(true);
    this.syncHUD(true);
  }

  /** achievements for key craft milestones */
  private onCrafted(id: number): void {
    if (id === BLOCK.CRAFTING_TABLE) this.achievements.unlock('benchmarking');
    if (id === ITEM.WOOD_PICKAXE) this.achievements.unlock('timeToMine');
    if (id === ITEM.STONE_PICKAXE) this.achievements.unlock('gettingUpgrade');
  }

  /** consume durability from held tool; breaks it at 0 (creative: no wear) */
  private damageTool(n: number): void {
    if (this.player.isCreative) return;
    const slot = this.player.hotbar[this.player.selected];
    if (!slot || slot.count <= 0 || !isItemId(slot.blockId)) return;
    const tool = getToolDef(slot.blockId);
    if (!tool) return;
    slot.dur = (slot.dur ?? tool.dur) - n;
    if (slot.dur <= 0) {
      this.player.hotbar[this.player.selected] = { blockId: 0, count: 0 };
      audio.breakBlock('glass');
      this.showToast('Your tool broke!');
      this.updateHandMesh(true);
    }
    this.syncHUD();
    this.syncInventory();
  }

  private syncInventory(force = false): void {
    const st = useGameStore.getState();
    if (!st.inv.open && !force) return;
    const grid = this.craftGrid;
    // container snapshot
    let containerSlots: HotbarSlot[] = [];
    if (this.containerKey) {
      const [xs, ys, zs] = this.containerKey.split(',').map(Number);
      const be = this.blockEnts.get(+xs, +ys, +zs);
      if (be) containerSlots = be.kind === 'chest' ? be.slots : [be.input, be.fuel, be.output];
    }
    const hash = JSON.stringify([this.player.hotbar, this.player.main, this.player.armor, grid, this.craftOut, this.cursor, containerSlots, this.furnaceRatios()]);
    if (hash === this.lastInvHash && !force) return;
    this.lastInvHash = hash;
    st.setInv({
      hotbar: cloneSlots(this.player.hotbar),
      main: cloneSlots(this.player.main),
      armor: this.player.armor.map((s) => (s ? { ...s } : null)),
      craft: cloneSlots(grid),
      craftOut: this.craftOut ? { ...this.craftOut } : null,
      cursor: this.cursor ? { ...this.cursor } : null,
      containerSlots: cloneSlots(containerSlots),
      furnace: this.furnaceRatios(),
    });
  }

  private furnaceRatios(): { burn: number; cook: number } | null {
    if (!this.containerKey) return null;
    const [xs, ys, zs] = this.containerKey.split(',').map(Number);
    const be = this.blockEnts.get(+xs, +ys, +zs);
    if (!be || be.kind !== 'furnace') return null;
    return {
      burn: be.burnMax > 0 ? Math.max(0, Math.min(1, be.burnTime / be.burnMax)) : 0,
      cook: Math.max(0, Math.min(1, be.cookTime / 10)),
    };
  }

  // ── hand model ─────────────────────────────────────────────────────────────
  private updateHandMesh(force = false): void {
    const slot = this.player?.hotbar[this.player.selected];
    const id = slot && slot.count > 0 ? slot.blockId : 0;
    if (id === this.handBlockId && !force) return;
    this.handBlockId = id;
    if (this.handMesh) {
      this.handGroup.remove(this.handMesh);
      this.handMesh.geometry.dispose();
      this.handMesh = null;
    }
    const flatDef = id > 0 && !isItemId(id) ? getBlockDef(id) : undefined;
    if (id > 0 && (isItemId(id) || flatDef?.flatIcon)) {
      const canvas = isItemId(id) ? getItemIconCanvas(id) : getTileCanvas(Array.isArray(flatDef!.tiles) ? flatDef!.tiles[0] : flatDef!.tiles);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      const geo = new THREE.PlaneGeometry(0.42, 0.42);
      this.handMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    } else if (id > 0) {
      const geo = createBlockGeometry(id, 0.42);
      this.handMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: getAtlas().texture }));
    } else {
      // arm
      const geo = new THREE.BoxGeometry(0.16, 0.16, 0.5);
      this.handMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xd8a17b }));
    }
    this.handGroup.add(this.handMesh);
  }

  /** emit flame/smoke particles from a random nearby torch */
  private spawnTorchParticles(): void {
    if (!this.world) return;
    const px2 = this.player.x, pz2 = this.player.z;
    const candidates: [number, number, number][] = [];
    for (const chunk of this.world.chunks.values()) {
      if (chunk.torches.length === 0) continue;
      const dx = chunk.cx * CHUNK_SIZE + 8 - px2;
      const dz = chunk.cz * CHUNK_SIZE + 8 - pz2;
      if (dx * dx + dz * dz > 48 * 48) continue;
      candidates.push(...chunk.torches);
    }
    if (candidates.length === 0) return;
    const [tx, ty, tz] = candidates[Math.floor(Math.random() * candidates.length)];
    if (Math.random() < 0.72) {
      // flame
      this.particles.spawnParticle(
        tx + (Math.random() - 0.5) * 0.12, ty + 0.06, tz + (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.15, 0.55 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15,
        Math.random() < 0.5 ? [1, 0.72, 0.2] : [1, 0.5, 0.1], 0.05, 0.45, -1,
      );
    } else {
      // smoke
      this.particles.spawnParticle(
        tx, ty + 0.12, tz,
        (Math.random() - 0.5) * 0.1, 0.7 + Math.random() * 0.3, (Math.random() - 0.5) * 0.1,
        [0.25, 0.25, 0.25], 0.05, 0.8, -1,
      );
    }
  }

  /** is the player overlapping any cactus block (expanded AABB)? */
  private touchingCactus(): boolean {
    const e = this.player.entity;
    const half = e.width / 2 + 0.06;
    const x0 = Math.floor(e.x - half), x1 = Math.floor(e.x + half);
    const y0 = Math.floor(e.y - 0.05), y1 = Math.floor(e.y + e.height);
    const z0 = Math.floor(e.z - half), z1 = Math.floor(e.z + half);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this.world.getBlock(x, y, z) === BLOCK.CACTUS) return true;
    return false;
  }

  private startSwing(): void {
    if (!this.swingActive) {
      this.swingActive = true;
      this.swingT = 1;
    }
  }

  private animateHand(dt: number): void {
    if (!this.handMesh) return;
    if (this.swingActive) {
      this.swingT -= dt * 4.2;
      if (this.swingT <= 0) { this.swingT = 0; this.swingActive = false; }
    }
    const s = this.swingT;
    const swingCurve = Math.sin(s * Math.PI);
    this.handGroup.position.set(0.42 - swingCurve * 0.18, -0.42 + swingCurve * 0.12, -0.65 - swingCurve * 0.18);
    this.handGroup.rotation.set(-swingCurve * 1.15, 0.62 - swingCurve * 0.5, swingCurve * 0.28);
    // bow draw: pull the bow back toward the shoulder
    if (this.bowCharging) {
      const c = this.bowCharge;
      this.handGroup.position.z += c * 0.22;
      this.handGroup.position.x += c * 0.12;
      this.handGroup.rotation.y += c * 0.25;
    }
    // walk sway
    const sway = Math.sin(this.player.bobPhase) * 0.012;
    this.handGroup.position.x += sway;
    this.handGroup.position.y += Math.abs(sway) * 0.8;
  }

  /** F5 camera modes: hand/body visibility + third-person camera placement (wall-clipped safe) */
  private updateCameraPerspective(dt: number): void {
    const p = this.player;
    if (this.cameraMode > 0) {
      if (!this.playerModel) this.playerModel = createPlayerModel(this.scene);
      const hSpeed = Math.hypot(p.entity.vx, p.entity.vz);
      const moving = Math.min(1, hSpeed / 4.3);
      if (p.entity.onGround && hSpeed > 0.4) {
        this.modelWalkPhase += dt * Math.min(9, hSpeed * 1.9);
      }
      animatePlayerModel(this.playerModel, p.x, p.y, p.z, p.yaw, p.pitch, this.modelWalkPhase, moving, p.sneaking, p.dead, 0);
      // sync armor overlays (hashed inside — cheap per frame)
      const armorIds = p.armor.map((a) => (a && a.count > 0 ? a.blockId : null)) as (number | null)[];
      setPlayerModelArmor(this.playerModel, armorIds);
      this.handGroup.visible = false;
    } else {
      if (this.playerModel) {
        this.scene.remove(this.playerModel.group);
        this.scene.remove(this.playerModel.shadow);
        this.playerModel = null;
      }
      this.handGroup.visible = true;
      return;
    }
    // reposition the camera behind (mode 1) or in front (mode 2) of the eye
    const eyeY = p.eyeY();
    const cosP = Math.cos(p.pitch);
    const back = new THREE.Vector3(
      Math.sin(p.yaw) * cosP,
      -Math.sin(p.pitch),
      Math.cos(p.yaw) * cosP,
    );
    const dist = 4;
    // start the ray slightly away from the eye so it doesn't start inside a solid block
    const originPad = 0.55;
    if (this.cameraMode === 1) {
      const hit = raycast(this.world, p.x + back.x * originPad, eyeY + back.y * originPad, p.z + back.z * originPad, back.x, back.y, back.z, dist - originPad + 0.3);
      const d = hit ? Math.max(0.9, originPad + hit.dist - 0.35) : dist;
      this.camera.position.set(p.x + back.x * d, eyeY + back.y * d, p.z + back.z * d);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = p.yaw;
      this.camera.rotation.x = p.pitch;
    } else {
      const fwd = new THREE.Vector3(-back.x, -back.y, -back.z);
      const hit = raycast(this.world, p.x + fwd.x * originPad, eyeY + fwd.y * originPad, p.z + fwd.z * originPad, fwd.x, fwd.y, fwd.z, dist - originPad + 0.3);
      const d = hit ? Math.max(0.9, originPad + hit.dist - 0.35) : dist;
      this.camera.position.set(p.x + fwd.x * d, eyeY + fwd.y * d, p.z + fwd.z * d);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = p.yaw + Math.PI;
      this.camera.rotation.x = -p.pitch;
    }
  }

  // ── chunk streaming ────────────────────────────────────────────────────────
  private streamChunks(): void {
    const R = this.settings.renderDistance;
    const pcx = Math.floor(this.player.entity.x / CHUNK_SIZE);
    const pcz = Math.floor(this.player.entity.z / CHUNK_SIZE);

    const t0 = performance.now();
    // generate data (spiral by distance), budget ~6ms
    outer:
    for (let r = 0; r <= R + 1; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const key = chunkKey(pcx + dx, pcz + dz);
          if (!this.world.chunks.has(key)) {
            this.world.ensureChunk(pcx + dx, pcz + dz);
            if (performance.now() - t0 > 6) break outer;
          }
        }
      }
    }

    // mesh chunks with all 4 neighbors' data, budget ~7ms
    const t1 = performance.now();
    outer2:
    for (let r = 0; r <= R; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const chunk = this.world.getChunk(pcx + dx, pcz + dz);
          if (chunk && chunk.hasData && chunk.needsMesh) {
            const n = this.world.getChunk(pcx + dx + 1, pcz + dz);
            const s = this.world.getChunk(pcx + dx - 1, pcz + dz);
            const e = this.world.getChunk(pcx + dx, pcz + dz + 1);
            const w = this.world.getChunk(pcx + dx, pcz + dz - 1);
            if (n?.hasData && s?.hasData && e?.hasData && w?.hasData) {
              this.world.buildMesh(chunk);
              if (performance.now() - t1 > 7) break outer2;
            }
          }
        }
      }
    }

    // unload far chunks occasionally
    if ((this.saveTimer % 5) < 0.016) {
      for (const key of Array.from(this.world.chunks.keys())) {
        const [cx, cz] = key.split(',').map(Number);
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > R + 3) {
          this.world.unloadChunk(cx, cz);
        }
      }
    }
  }

  // ── HUD sync ───────────────────────────────────────────────────────────────
  private lastHudHealth = -1;
  private lastHudHunger = -1;
  private lastHotbarHash = '';
  private syncHUD(force = false): void {
    const store = useGameStore.getState();
    const hp = Math.ceil(this.player.health);
    const hg = Math.round(this.player.hunger);
    if (hp !== this.lastHudHealth || hg !== this.lastHudHunger || force) {
      this.lastHudHealth = hp;
      this.lastHudHunger = hg;
      store.setHud({ health: hp, hunger: hg });
    }
    // game mode + flight indicator
    if (store.hud.gameMode !== this.player.gameMode || store.hud.flying !== this.player.flying) {
      store.setHud({ gameMode: this.player.gameMode, flying: this.player.flying });
    }
    const hash = this.player.hotbar.map((s) => s.blockId + ':' + s.count).join(',') + '|' + this.player.selected;
    if (hash !== this.lastHotbarHash || force) {
      this.lastHotbarHash = hash;
      store.setHud({
        hotbar: this.player.hotbar.map((s) => ({ ...s })),
        selected: this.player.selected,
      });
    }
    // XP bar
    const xpHash = this.player.level + ':' + this.player.xp.toFixed(2);
    if (xpHash !== this.lastXpSync || force) {
      this.lastXpSync = xpHash;
      store.setHud({ xpLevel: this.player.level, xpProgress: Math.max(0, Math.min(1, this.player.xp / this.xpToNext(this.player.level))) });
    }
    // armor bar
    const armorPts = this.player.armorPoints;
    if (store.hud.armor !== armorPts || force) {
      store.setHud({ armor: armorPts });
    }
  }

  private xpToNext(level: number): number {
    return 7 + level * 3;
  }

  /** absorb XP: handles level-ups (MC-lite curve: 7 + 3/level) */
  private addXP(value: number): void {
    audio.orb();
    let xp = this.player.xp + value;
    let level = this.player.level;
    let leveled = false;
    while (xp >= this.xpToNext(level)) {
      xp -= this.xpToNext(level);
      level++;
      leveled = true;
    }
    if (leveled) audio.levelUp();
    this.player.xp = xp;
    this.player.level = level;
    this.syncHUD();
  }

  // ── main loop ──────────────────────────────────────────────────────────────
  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 0.25) dt = 0.25;

    // fps
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const screen = useGameStore.getState().screen;
    const simulate = this.running && (screen === 'playing');

    if (simulate && this.player && this.world) {
      this.accumulator += dt;
      const step = 1 / 60;
      let steps = 0;
      while (this.accumulator >= step && steps < 5) {
        this.physicsStep(step);
        this.accumulator -= step;
        steps++;
      }
      this.frameUpdate(dt);
    } else {
      // still render (paused view behind menu)
      if (this.player && this.world && this.sky) {
        this.sky.update(0, this.camera, this.scene, 60, 130);
        this.applySkyFog();
      }
    }

    this.renderer.render(this.scene, this.camera);

    // debug overlay ~4Hz
    this.debugTimer += dt;
    if (this.debugTimer > 0.25 && this.player && this.world) {
      this.debugTimer = 0;
      this.updateDebug();
    }
  };

  private physicsStep(step: number): void {
    const p = this.player;
    // input direction
    let forward = 0, strafe = 0;
    if (this.keys.has('KeyW')) forward += 1;
    if (this.keys.has('KeyS')) forward -= 1;
    if (this.keys.has('KeyA')) strafe -= 1;
    if (this.keys.has('KeyD')) strafe += 1;
    const wishJump = this.keys.has('Space');
    const wishSneak = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    p.sprinting = (this.keys.has('ControlLeft') || this.keys.has('ControlRight')) && forward > 0;

    const wasInWater = p.entity.inWater;
    const wasOnGround = p.entity.onGround;
    const prevVy = p.entity.vy;

    p.moveInput({ forward, strafe }, this.world, step, wishJump, wishSneak);

    // footsteps
    if (p.entity.onGround && p.stepDistance > 2.1) {
      p.stepDistance = 0;
      const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.4), Math.floor(p.z));
      const def = getBlockDef(below);
      if (def) audio.step((def.sound ?? 'stone') as MaterialSound);
    }
    // splash
    if (!wasInWater && p.entity.inWater && prevVy < -4) {
      audio.splash();
      this.particles.splash(p.x, p.y + 0.2, p.z);
    }
    // landing particles
    if (!wasOnGround && p.entity.onGround && this.prevVy < -7) {
      const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.4), Math.floor(p.z));
      const def = getBlockDef(below);
      if (def) {
        const col = tileAvgColor(Array.isArray(def.tiles) ? def.tiles[2] : def.tiles);
        this.particles.burstLand(p.x, p.y, p.z, col, Math.min(14, Math.floor(-this.prevVy / 2)));
      }
    }
    this.wasInWater = p.entity.inWater;
    this.wasOnGround = p.entity.onGround;
    this.prevVy = p.entity.vy;

    // hurt cooldown decay
    if (p.hurtCooldown > 0) p.hurtCooldown -= step;

    // ── hunger drain (creative: none) ──
    if (!p.isCreative) {
      if (p.sprinting && (forward !== 0 || strafe !== 0)) {
        p.hunger = Math.max(0, p.hunger - 0.085 * step);
      } else if (forward !== 0 || strafe !== 0) {
        p.hunger = Math.max(0, p.hunger - 0.012 * step);
      } else {
        p.hunger = Math.max(0, p.hunger - 0.0015 * step);
      }
      if (wishJump && p.onGround) p.hunger = Math.max(0, p.hunger - 0.05);
    }

    // void damage (creative players fly, but out-of-world still resets)
    if (p.y < -8) {
      if (p.isCreative) {
        p.entity.y = -8;
        p.entity.vy = 0;
      } else {
        p.damage(4);
        p.entity.vy = 0;
        p.entity.y = -8;
      }
    }

    // cactus contact damage (creative immune)
    this.cactusTimer -= step;
    if (!p.isCreative && this.cactusTimer <= 0 && this.touchingCactus()) {
      this.cactusTimer = 0.6;
      p.damage(1);
      audio.hurt();
    }

    // death
    if (p.dead) {
      // lose XP on death (MC drops it — simplified: reset)
      p.level = 0;
      p.xp = 0;
      useGameStore.getState().setScreen('dead');
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  private frameUpdate(dt: number): void {
    const p = this.player;

    // creative: vitals stay maxed
    if (p.isCreative) {
      p.health = p.maxHealth;
      p.hunger = 20;
    }

    // camera
    p.speedMultiplier = this.bowCharging ? 0.5 : 1;
    p.applyCamera(this.settings.fov + (this.bowCharging ? -10 * this.bowCharge : 0), 8, dt);
    this.updateCameraPerspective(dt);
    // explosion camera shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = Math.max(0, this.shakeT) * 0.55;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }

    // cooldowns
    this.placeCooldown -= dt;
    this.attackCooldown -= dt;
    this.eatCooldown -= dt;

    // hunger regen / starve
    this.hungerRegenTimer += dt;
    if (this.hungerRegenTimer > 2) {
      this.hungerRegenTimer = 0;
      if (p.hunger >= 18 && p.health < p.maxHealth) {
        p.heal(1);
        p.hunger = Math.max(0, p.hunger - 0.4);
      }
    }
    this.starveTimer += dt;
    if (this.starveTimer > 3) {
      this.starveTimer = 0;
      if (p.hunger <= 0 && p.health > 2) {
        p.damage(1);
        audio.hurt();
      }
    }

    // interaction
    this.updateTarget();
    this.mineTick(dt);

    // bow drawing (charge + creak sound)
    if (this.bowCharging) {
      const slot = this.player.hotbar[this.player.selected];
      if (!slot || slot.count <= 0 || !isBowItem(slot.blockId)) {
        this.bowCharging = false;
        this.bowCharge = 0;
      } else {
        this.bowCharge = Math.min(1, this.bowCharge + dt);
        this.bowDrawSoundT -= dt;
        if (this.bowDrawSoundT <= 0 && this.bowCharge < 1) {
          audio.bowDraw();
          this.bowDrawSoundT = 0.32;
        }
      }
    }

    // block entities (furnace smelting etc.)
    this.blockEnts.tick(dt);
    // primed TNT fuses + explosions
    this.updatePrimedTnt(dt);
    // fluid simulation + plant growth
    this.world.tickFluids(dt);
    // ambient plant growth: sample random columns near the player and tick canes/cacti
    this.plantScanTimer += dt;
    if (this.plantScanTimer > 2) {
      this.plantScanTimer = 0;
      const px2 = this.player.x, py2 = this.player.y, pz2 = this.player.z;
      for (let i = 0; i < 24; i++) {
        const sx = Math.floor(px2 + (Math.random() - 0.5) * 64);
        const sz = Math.floor(pz2 + (Math.random() - 0.5) * 64);
        const sy = Math.floor(py2) + Math.floor((Math.random() - 0.3) * 8);
        const id = this.world.getBlock(sx, sy, sz);
        if (id === BLOCK.SUGARCANE || id === BLOCK.CACTUS) this.world.scheduleFluidTick(sx, sy, sz, 0.5);
      }
    }
    this.furnaceSyncTimer += dt;
    if (this.furnaceSyncTimer > 0.3) {
      this.furnaceSyncTimer = 0;
      const iv = useGameStore.getState().inv;
      if (iv.open && iv.container === 'furnace') {
        this.lastInvHash = ''; // force push (progress ratios change continuously)
        this.syncInventory();
      }
    }

    // torch flame particles
    this.torchFxTimer += dt;
    if (this.torchFxTimer > 0.12) {
      this.torchFxTimer = 0;
      this.spawnTorchParticles();
    }

    // drops + particles
    this.drops.update(dt, p.entity, (stack) => {
      const picked = this.tryPickup(stack);
      if (picked) {
        const name = isItemId(stack.blockId)
          ? (getItemDef(stack.blockId)?.name ?? 'Item')
          : (getBlockDef(stack.blockId)?.name ?? 'Block');
        this.showToast(name + ' ×' + stack.count);
      }
      return picked;
    });
    this.particles.update(dt);

    // XP orbs
    this.xpOrbs.update(dt, p.entity, (value) => this.addXP(value));

    // mobs
    if (this.mobs) {
      const eyeY = p.eyeY();
      const fwd = p.forwardVector();
      this.mobCb = {
        damagePlayer: (amount, fx, fz) => {
          if (amount <= 0 || p.isCreative) return; // creative: hostiles can't touch you
          p.damage(amount);
          audio.hurt();
          // knockback away from source
          const kx = p.x - fx;
          const kz = p.z - fz;
          const len = Math.hypot(kx, kz) || 1;
          p.entity.vx += (kx / len) * 6.5;
          p.entity.vz += (kz / len) * 6.5;
          p.entity.vy = Math.max(p.entity.vy, 4.2);
        },
        spawnDrop: (itemId, dx, dy, dz) => {
          this.drops.spawn(itemId, dx, dy, dz, 1);
        },
        spawnXP: (dx, dy, dz, value) => {
          this.xpOrbs.spawn(dx, dy, dz, value);
        },
        explodeParticles: (ex, ey, ez) => {
          for (let i = 0; i < 3; i++) {
            this.particles.burstBlockBreak(ex - 0.5 + i * 0.5, ey, ez, [0.35, 0.33, 0.3]);
          }
          this.particles.burstLand(ex, ey, ez, [0.2, 0.2, 0.2], 20);
        },
        deathParticles: (dx2, dy2, dz2) => {
          this.particles.burstLand(dx2, dy2, dz2, [0.85, 0.25, 0.25], 10);
        },
        fireParticle: (fx2, fy2, fz2) => {
          this.particles.spawnParticle(fx2, fy2, fz2, (Math.random() - 0.5) * 0.6, 1.6 + Math.random(), (Math.random() - 0.5) * 0.6, [1, 0.45, 0.1], 0.09, 0.5, -2);
        },
        teleportParticles: (tx, ty, tz) => {
          for (let i = 0; i < 14; i++) {
            this.particles.spawnParticle(
              tx + (Math.random() - 0.5) * 0.9, ty + (Math.random() - 0.5) * 1.6, tz + (Math.random() - 0.5) * 0.9,
              (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 2.6,
              Math.random() < 0.5 ? [0.62, 0.32, 0.86] : [0.84, 0.56, 0.96],
              0.06, 0.7, -0.4,
            );
          }
        },
        playerForward: { x: fwd.x, y: fwd.y, z: fwd.z },
        playerX: p.x,
        playerY: p.y,
        playerZ: p.z,
        playerCreative: p.isCreative,
        igniteTnt: (tx, ty, tz) => this.igniteTNT(tx, ty, tz, 0.25 + Math.random() * 0.7),
      };
      this.mobs.update(dt, {
        x: p.x, y: p.y, z: p.z,
        vx: 0, vy: 0, vz: 0,
        width: 0.6, height: 1.8,
        onGround: p.onGround, inWater: p.inWater,
        eyeY: () => eyeY,
      }, this.sky.sunLevel, this.mobCb);
    }

    // sprint dust particles at the player's feet
    this.sprintFxTimer -= dt;
    if (p.sprinting && p.entity.onGround && Math.hypot(p.entity.vx, p.entity.vz) > 3 && this.sprintFxTimer <= 0) {
      this.sprintFxTimer = 0.13;
      const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.4), Math.floor(p.z));
      const bdef = getBlockDef(below);
      const bc = bdef ? tileAvgColor(Array.isArray(bdef.tiles) ? bdef.tiles[2] : bdef.tiles) : [0.75, 0.75, 0.75];
      this.particles.spawnParticle(
        p.x + (Math.random() - 0.5) * 0.45, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.45,
        (Math.random() - 0.5) * 0.8 - p.entity.vx * 0.14, 1.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8 - p.entity.vz * 0.14,
        [Math.min(1, bc[0] * 0.85 + 0.15), Math.min(1, bc[1] * 0.85 + 0.15), Math.min(1, bc[2] * 0.85 + 0.15)],
        0.08, 0.45, -1,
      );
    }

    // sky + fog + lighting uniforms
    this.sky.update(dt, this.camera, this.scene, 60, 130);
    // weather (needs camera + ground height for rain collision)
    this.sky.weatherDarkness = this.weather.darkness;
    this.sky.lightningFlash = this.weather.flash;
    const camY = this.camera.position.y;
    this.weather.update(dt, this.camera.position.x, camY, this.camera.position.z, (wx, wz) => {
      const top = Math.min(WORLD_HEIGHT - 1, Math.floor(camY) + 22);
      for (let y = top; y > 0; y--) {
        const id = this.world.getBlock(wx, y, wz);
        if (id !== BLOCK.AIR && !isWaterId(id)) return y + 1;
      }
      return 0;
    });
    this.applySkyFog();

    // hand animation
    this.animateHand(dt);

    // bow charge indicator → HUD (throttled to meaningful changes)
    const st2 = useGameStore.getState();
    if (Math.abs(st2.hud.bowCharge - this.bowCharge) > 0.04 || (st2.hud.bowCharge > 0) !== this.bowCharging) {
      st2.setHud({ bowCharge: this.bowCharging ? this.bowCharge : 0 });
    }

    // streaming + autosave
    this.streamChunks();
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.saveGame();
    }

    // underwater check for HUD
    const camBlock = this.world.getBlock(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z));
    const underwater = isLiquid(camBlock);
    const st = useGameStore.getState();
    if (st.hud.underwater !== underwater) st.setHud({ underwater });

    this.syncHUD();
  }

  private applySkyFog(): void {
    if (!this.sky) return;
    const mats = [this.world?.getMaterial('opaque'), this.world?.getMaterial('cutout'), this.world?.getMaterial('water')];
    const fog = this.scene.fog as THREE.Fog | null;
    const underwater = this.world && this.camera.position && isLiquid(this.world.getBlock(
      Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z)
    ));
    for (const m of mats) {
      if (!m) continue;
      m.uniforms.uSunLevel.value = this.sky.sunLevel;
      m.uniforms.uTime.value = performance.now() / 1000;
      if (underwater) {
        m.uniforms.uFogColor.value.setRGB(0.09, 0.24, 0.55);
        m.uniforms.uFogNear.value = 4;
        m.uniforms.uFogFar.value = 26;
      } else if (fog) {
        (m.uniforms.uFogColor.value as THREE.Color).copy(fog.color);
        m.uniforms.uFogNear.value = fog.near;
        m.uniforms.uFogFar.value = fog.far;
      }
    }
    // entity lights follow sun
    this.ambient.intensity = 0.25 + this.sky.sunLevel * 0.75;
    this.sunLight.intensity = 0.15 + this.sky.sunLevel * 0.8;
    const angle = ((this.sky.time / DAY_LENGTH) - 0.25) * Math.PI * 2;
    this.sunLight.position.set(Math.cos(angle), Math.max(0.2, Math.sin(angle)), 0.3).normalize().multiplyScalar(50);
  }

  private updateDebug(): void {
    const store = useGameStore.getState();
    if (!store.debugVisible && !store.settings.showFps) return;
    const p = this.player;
    const yawDeg = ((p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    // yaw=0 looks toward -Z (north); positive yaw (mouse left) rotates toward -X (west)
    const dirs = ['north', 'north-west', 'west', 'south-west', 'south', 'south-east', 'east', 'north-east'];
    const facing = dirs[Math.round(yawDeg / 45) % 8];
    const targetName = this.target ? (getBlockDef(this.target.id)?.name ?? '—') : '—';
    store.setDebug({
      fps: this.fps,
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      chunkX: Math.floor(p.x / CHUNK_SIZE), chunkZ: Math.floor(p.z / CHUNK_SIZE),
      biome: this.world.terrain.biomeAt(Math.floor(p.x), Math.floor(p.z)),
      facing,
      targetBlock: targetName,
      chunks: this.world.chunks.size,
      mobs: this.mobs ? this.mobs.count : 0,
      time: getTimeLabel(this.sky.time),
      tris: this.renderer.info.render.triangles,
      mode: p.gameMode,
      flying: p.flying,
      weather: this.weather
        ? (this.weather.state === 'clear'
          ? 'clear'
          : `${this.weather.snowing ? 'snow' : this.weather.state}${Math.round(this.weather.intensity * 100)}%`)
        : 'clear',
    });
  }

  respawn(): void {
    // respawn at bed spawn point if set, else world spawn
    if (this.spawnPoint) {
      const sp = this.spawnPoint;
      // make sure the area is loaded
      this.world.ensureChunk(Math.floor(sp.x / CHUNK_SIZE), Math.floor(sp.z / CHUNK_SIZE));
      this.player.respawn(sp.x, sp.y + 0.4, sp.z);
      useGameStore.getState().setScreen('playing');
      this.requestLock();
      return;
    }
    // respawn at world spawn
    let sx = 8;
    const sz = 8;
    let sy = this.world.surfaceY(sx, sz);
    let attempts = 0;
    while ((sy <= 40 || sy === 0) && attempts < 12) {
      sx += 10; sy = this.world.surfaceY(sx, sz); attempts++;
    }
    this.player.respawn(sx + 0.5, sy + 1.2, sz + 0.5);
    useGameStore.getState().setScreen('playing');
    this.requestLock();
  }

  applySettings(): void {
    const s = useGameStore.getState().settings;
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    audio.setVolume(s.volume);
    if (this.sky) this.sky.cloudsEnabled = s.clouds;
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.unbindEvents();
    this.storeUnsub();
    this.clearPrimedTnt();
    if (this.world) {
      for (const key of Array.from(this.world.chunks.keys())) {
        const [cx, cz] = key.split(',').map(Number);
        this.world.unloadChunk(cx, cz);
      }
      this.scene.remove(this.world.group);
    }
    if (this.playerModel) {
      this.scene.remove(this.playerModel.group);
      this.scene.remove(this.playerModel.shadow);
      this.playerModel = null;
    }
    this.particles?.dispose();
    this.weather?.dispose();
    this.drops?.clear();
    this.mobs?.clear();
    this.renderer.dispose();
  }
}

// ─── singleton accessor for UI ───────────────────────────────────────────────
let engineInstance: Game | null = null;

export function setEngine(g: Game | null): void {
  engineInstance = g;
}

export function getEngine(): Game | null {
  return engineInstance;
}

function safeParseArray(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
