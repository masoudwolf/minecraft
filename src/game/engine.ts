// ─── Game engine: orchestrates renderer, world, player, UI bridge ────────────
import * as THREE from 'three';
import { World } from './world/world';
import { Player, type HotbarSlot, PLAYER_AIR_MAX } from './player';
import { BLOCK, getBlockDef, isLiquid, containerOf, isWaterId, waterLevel, isWheatCrop, nextWheatStage, isSapling, isCake, nextCakeStage, isDoorId, isDoorOpenId, doorClosedId, doorOpenIdOf, doorUpper, bedHead, facingDir, TORCH_WALL_PX, TORCH_WALL_NX, TORCH_WALL_PZ, TORCH_WALL_NZ, isTrapdoorId, isTrapdoorOpenId, trapdoorClosedId, trapdoorOpenIdOf, isLadderId, isGateId, isGateOpenId, gateClosedId, gateOpenIdOf, frameWall, frameRot, frameItem, packFrameMeta, isPottable } from './blocks';
import { chunkKey, CHUNK_SIZE, WORLD_HEIGHT, DAY_LENGTH } from './constants';
import { raycast, aabbIntersectsBlock, moveEntity, type RayHit } from './physics';
import { DropManager, type ItemStack, createBlockGeometry } from './entities/drops';
import { MobManager, type MobCallbacks, type SavedMob } from './entities/mobs';
import { preloadEntityTextures } from './entities/vanillaSkins';
import { BoatManager, type Boat } from './entities/boats';
import { createPlayerModel, animatePlayerModel, setPlayerModelArmor, type PlayerModelParts } from './entities/playerModel';
import { XPOrbManager } from './entities/xp';
import { AchievementManager, type AchievementDef } from './achievements';
import { getItemDef, isItemId, getToolDef, maxStack, breakInfo, isToolItem, isArmorItem, armorSlotIndex, getBowDef, isBowItem, isRodItem, getRodDef, isShearsItem, getShearsDef, isPotionItem, getPotionDef, ITEM } from './items';
import { EFFECTS } from './effects';
import { matchRecipe, freshDur, RECIPES, needsTable } from './crafting';
import { villagerTrades, tradeEpoch, villagerTradeSeed, type TradeOffer } from './trades';
import { addToSlots, isEmptySlot, emptySlot, cloneSlots } from './inventory';
import { enchantOptions, isEnchantable, unbreakingKeep, efficiencyFactor, sharpnessBonus, powerBonus, hasInfinity, lureFactor, luckBonus, fortuneChance, type EnchantOption } from './enchanting';
import { BlockEntityManager, BREW_TIME } from './blockEntities';
import { ParticleSystem } from './particles';
import { SkySystem, getTimeLabel } from './sky';
import { WeatherSystem } from './weather';
import { audio, type MaterialSound } from './audio';
import { getAtlas, getCrackTextures, tileAvgColor, getTileCanvas, getTileIconURL } from './textures/atlas';
import { getItemIconCanvas } from './items';
import { useGameStore, type GameMode, type WorldMeta } from './state';
import { GraphicsSystem } from './graphics';

/** display name for any block or item id (cheat toasts, etc.) */
function itemLabel(id: number): string {
  return isItemId(id) ? (getItemDef(id)?.name ?? `#${id}`) : (getBlockDef(id)?.name ?? `#${id}`);
}

/** cardinal direction index (0=+X, 1=-X, 2=+Z, 3=-Z) from a cell's center toward a point.
 *  Used by door/bed placement: doors hug the edge facing the player, the bed head
 *  lands one cell away from the player. */
function cardinalToward(px: number, pz: number, cx: number, cz: number): number {
  const dx = px - (cx + 0.5);
  const dz = pz - (cz + 0.5);
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 0 : 1;
  return dz > 0 ? 2 : 3;
}

const SAVE_KEY = 'voxelcraft.save'; // legacy localStorage slot (migration source)

interface SaveData {
  seed: number;
  time: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; hotbar: HotbarSlot[]; main?: HotbarSlot[]; armor?: (HotbarSlot | null)[]; selected: number; level?: number; xp?: number; effects?: { k: string; t: number; amp?: number }[] };
  edits: Record<string, Record<number, number>>;
  blockEntities?: Record<string, unknown>;
  /** per-cell orientation meta (v0.52): torch wall dir / bed half+facing / door facing+half */
  blockMeta?: Record<string, number>;
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

/** lightning bolt visual (thunderstorm strike) */
interface LightningBolt {
  group: THREE.Group;
  mats: THREE.MeshBasicMaterial[];
  t: number;
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
  /** creative hold-to-break cadence (MC: ~4 blocks/s held; 1 click = 1 block) */
  private creativeBreakCd = 0;
  private eatCooldown = 0;
  /** splash potion throw cooldown (separate from eat so throw→drink chains feel right) */
  private splashThrowCd = 0;
  private hungerRegenTimer = 0;
  private starveTimer = 0;
  private swingT = 0;
  private swingActive = false;
  private stepTimer = 0;
  private wasInWater = false;
  private wasOnGround = true;
  private prevVy = 0;
  private boats!: BoatManager;
  private ridingBoat: Boat | null = null;
  private sprintFov = 0;
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
  /** smoothed world-light factor for the 3rd-person model (night realism) */
  private playerLightF = 1;
  /** base colors of the player model's materials (armor tints) before light multiplication */
  private playerModelBaseMats = new WeakMap<THREE.Material, THREE.Color>();
  private modelWalkPhase = 0;
  private sprintFxTimer = 0;
  /** bow draw state (RMB held with bow) */
  private bowCharging = false;
  private bowCharge = 0;
  private bowDrawSoundT = 0;
  /** fishing: active bobber state (cast while holding a fishing rod) */
  private fishing: { state: 'fly' | 'float' | 'bite'; x: number; y: number; z: number; vx: number; vy: number; vz: number; nextBite: number; biteT: number } | null = null;
  private bobberMesh: THREE.Group | null = null;
  private fishLine: THREE.Line | null = null;
  /** enchanting: current table session (held item + deterministic offers) */
  private enchantTarget: { slotRef: HotbarSlot; options: EnchantOption[] } | null = null;
  private enchantEpoch = 0;
  /** latest mob callbacks (mining attack → hurt→teleport chain) */
  private mobCb: MobCallbacks | null = null;
  /** active lightning bolts (thunderstorm visuals) */
  private lightningBolts: LightningBolt[] = [];

  // inventory / crafting / containers
  private craft2: HotbarSlot[] = Array.from({ length: 4 }, () => ({ blockId: 0, count: 0 }));
  private craft9: HotbarSlot[] = Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
  private craftOut: HotbarSlot | null = null;
  private cursor: HotbarSlot | null = null;
  private invTable = false;
  private invHover: { area: 'hotbar' | 'main' | 'craft' | 'container' | 'armor'; idx: number } | null = null;
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
  // v0.50 — pre-allocated night tints for the entity lights (zero-alloc lerp targets)
  private nightSkyAmb = new THREE.Color(0.72, 0.82, 1.10);
  private nightGroundAmb = new THREE.Color(0.30, 0.36, 0.55);
  private dayGroundAmb = new THREE.Color(0.4, 0.4, 0.4);
  /** shader-pack graphics (sky/volumetric water/shadows/grass/postfx) */
  private gfx: GraphicsSystem;

  private settings = useGameStore.getState().settings;
  private storeUnsub: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // decode vanilla entity textures up front → sync tinted skins (sheep dye etc.)
    void preloadEntityTextures();
    // WebGL context with graceful fallbacks: software-GL sandboxes (llvmpipe/
    // swiftshader) reject 'high-performance' contexts — retry plain, then
    // low-power without the perf caveat, before giving up
    const attempts: THREE.WebGLRendererParameters[] = [
      { canvas, antialias: false, powerPreference: 'high-performance' },
      { canvas, antialias: false },
      { canvas, antialias: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
    ];
    let renderer: THREE.WebGLRenderer | null = null;
    for (const opts of attempts) {
      try {
        renderer = new THREE.WebGLRenderer(opts);
        break;
      } catch {
        // next fallback
      }
    }
    if (!renderer) throw new Error('WebGL is not available in this browser');
    this.renderer = renderer;
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

    // shader-pack graphics system (atmosphere, volumetric clouds, real water,
    // sun shadows, grass, post fx)
    this.gfx = new GraphicsSystem(this.renderer, this.scene, this.camera, this.sunLight);

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
      if (this.sky) this.sky.cloudsEnabled = this.settings.clouds && !this.settings.gfx.volumetricClouds;
      if (this.world) this.gfx.applySettings(this.settings);
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
    this.boats?.clear();
    this.ridingBoat = null;
    this.clearPrimedTnt();
    this.world = new World(seed, save?.edits);
    this.scene.add(this.world.group);
    this.gfx.attachWorld(this.world);
    this.gfx.applySettings(this.settings);
    this.sky = new SkySystem(this.scene, seed);
    this.sky.time = save?.time ?? DAY_LENGTH * 0.3;
    this.weather?.dispose();
    this.weather = new WeatherSystem(this.scene, seed, (wx, wz) => this.world.terrain.biomeAt(wx, wz));
    this.weather.onStrike = (sx, sy, sz) => this.spawnLightningBolt(sx, sy, sz);
    this.clearLightningBolts();
    this.drops = new DropManager(this.scene, this.world, getAtlas().texture);
    this.particles = new ParticleSystem(this.scene);
    this.mobs = new MobManager(this.scene, this.world);
    this.boats = new BoatManager(this.scene, this.world);
    if (save?.mobs && Array.isArray(save.mobs)) this.mobs.restore(save.mobs);
    this.xpOrbs = new XPOrbManager(this.scene, this.world);
    this.blockEnts = new BlockEntityManager(this.world);
    this.blockEnts.onBrewed = () => {
      this.achievements.unlock('localBrewery');
      this.showToast('Brew complete!');
    };
    this.player = new Player(this.camera);
    this.player.gameMode = save?.gameMode ?? gameMode;
    this.player.flying = save?.flying ?? false;
    this.spawnPoint = save?.spawn ?? null;
    if (this.spawnPoint) this.mobs.spawnGuard = { x: this.spawnPoint.x, z: this.spawnPoint.z, r: 20 };
    if (save?.blockEntities) this.blockEnts.load(save.blockEntities);
    if (save?.blockMeta) this.world.loadMeta(save.blockMeta);
    this.world.migrateLegacyBeds();

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
      if (save.player.effects) this.player.effects = save.player.effects.filter((e) => e && typeof e.k === 'string' && e.t > 0 && (e.amp === undefined || (typeof e.amp === 'number' && e.amp > 0)));
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
        effects: this.player.effects.length > 0 ? this.player.effects.map((e) => ({ k: e.k, t: e.t, amp: e.amp })) : undefined,
      },
      edits,
      blockEntities: this.blockEnts.serialize(),
      blockMeta: Object.keys(this.world.meta).length > 0 ? this.world.serializeMeta() : undefined,
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
    store.setCurrentWorld(null, '');
    store.setScreen('menu');
    void this.fetchWorlds();
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private lastSpaceTap = 0;

  private onKeyDown = (e: KeyboardEvent): void => {
    // OS key auto-repeat: a HELD key fires keydown ~30x/sec. Held movement keys
    // are already in this.keys (added on the first press), so re-processing
    // repeats would only re-trigger ONE-SHOT actions — critically the creative
    // flight double-tap, which then toggled flight on/off while Space was held.
    if (e.repeat) {
      if (e.code === 'Space' || e.code === 'F3' || e.code === 'F5') e.preventDefault();
      return;
    }
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
    // trade panel open: Escape closes it
    if (st.tradeOpen && st.screen === 'playing') {
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.closeTrade(); return; }
      return;
    }
    // enchanting panel open: Escape closes it
    if (st.enchantOpen && st.screen === 'playing') {
      if (e.code === 'Escape' || e.code === 'KeyE') { e.preventDefault(); this.closeEnchant(); return; }
      return;
    }
    if (st.screen !== 'playing') return;
    this.keys.add(e.code);
    if (e.code === 'F4') {
      e.preventDefault();
      const next = !st.creatorOpen;
      useGameStore.getState().setCreatorOpen(next);
      // unlock the cursor while the panel is open (clicks must reach the UI)
      if (next && document.pointerLockElement === this.canvas) document.exitPointerLock();
      else if (!next) this.requestLock();
      return;
    }
    if (e.code === 'KeyE') { e.preventDefault(); this.openInventory(false); return; }
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) { this.player.selected = n - 1; this.syncHUD(); this.updateHandMesh(); }
    }
    if (e.code === 'KeyQ') this.dropSelected();
    // creative: double-tap space toggles flight (fresh presses only — repeats
    // are filtered above). Tap is consumed so a held key or a stray third tap
    // can't chain-toggle flight back and forth.
    if (e.code === 'Space' && this.player.isCreative) {
      const now = performance.now();
      if (now - this.lastSpaceTap < 280) {
        this.player.flying = !this.player.flying;
        if (this.player.flying) {
          // small liftoff impulse: guarantees the player rises even if Space is
          // released instantly (landing-cancel only fires while vy <= 0)
          this.player.entity.vy = Math.max(this.player.entity.vy, 3.4);
        }
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
    if (e.button === 0) { this.mining = true; this.creativeBreakCd = 0; this.startSwing(); }
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
    if (useGameStore.getState().tradeOpen) return; // villager trade panel: world keeps running
    if (useGameStore.getState().enchantOpen) return; // enchanting panel: world keeps running
    if (useGameStore.getState().creatorOpen) return; // cheat panel (F4): world keeps running
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
    this.gfx.resize();
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  /** RMB press: bow charge / villager trade / shears / fishing rod / bone meal fertilize / block interaction / place */
  private rightClick(): void {
    const st = useGameStore.getState();
    if (st.tradeOpen || st.enchantOpen || st.inv.open) return;
    const held = this.player.hotbar[this.player.selected];
    if (held && held.count > 0 && isBowItem(held.blockId)) {
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
    // villager: open the trade panel (within reach, not sneaking)
    if (this.target && !this.player.sneaking) {
      const p = this.player;
      const eye = { x: p.x, y: p.eyeY(), z: p.z };
      const dir = p.forwardVector();
      const hit = this.mobs?.raycastMob(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      if (hit && hit.mob.type === 'villager') {
        this.openTrade(hit.mob);
        return;
      }
    }
    // shears: shear a sheep in reach (drops its color's wool)
    if (held && held.count > 0 && isShearsItem(held.blockId) && this.mobs) {
      const p = this.player;
      const eye = { x: p.x, y: p.eyeY(), z: p.z };
      const dir = p.forwardVector();
      const hit = this.ridingBoat ? null : this.mobs.raycastMob(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      if (hit && hit.mob.type === 'sheep') {
        const res = this.mobs.shearSheep(hit.mob);
        if (res) {
          for (let i = 0; i < res.count; i++) this.drops.spawn(res.woolId, hit.mob.x, hit.mob.y + 0.6, hit.mob.z, 1);
          audio.shear();
          this.achievements.unlock('shearBrilliance');
          // shears wear (Unbreaking-aware like tools)
          const sdef = getShearsDef(held.blockId);
          if (sdef && !this.player.isCreative) {
            if (!unbreakingKeep(held.ench?.unbreaking ?? 0)) {
              held.dur = (held.dur ?? sdef.dur) - 1;
              if (held.dur <= 0) {
                this.player.hotbar[this.player.selected] = { blockId: 0, count: 0 };
                audio.breakBlock('glass');
                this.showToast('Your shears broke!');
                this.updateHandMesh(true);
              }
            }
          }
          this.syncHUD();
          this.syncInventory();
          this.updateHandMesh();
          this.placeCooldown = 0.3;
          this.startSwing();
          return;
        }
      }
    }
    // fishing rod: cast / reel / catch
    if (held && held.count > 0 && isRodItem(held.blockId)) {
      this.rodInteract();
      return;
    }
    // potions: drink — or THROW if it's a splash variant (MC)
    if (held && held.count > 0 && isPotionItem(held.blockId)) {
      const pd = getPotionDef(held.blockId);
      if (pd?.splash) this.throwSplashPotion(held.blockId);
      else this.drinkPotion(held.blockId);
      return;
    }
    // buckets: scoop water / milk a cow / pour water / drink milk
    if (held && held.count > 0 && this.bucketInteract(held.blockId)) {
      return;
    }
    // mount a nearby boat (before placing a new one)
    if (!this.player.sneaking && !this.ridingBoat) {
      const p = this.player;
      const dir = p.forwardVector();
      const boatHit = this.boats.raycast(p.x, p.eyeY(), p.z, dir.x, dir.y, dir.z, 3.4);
      if (boatHit) {
        this.ridingBoat = boatHit.boat;
        boatHit.boat.occupied = true;
        audio.splash();
        this.showToast('Sneak to get out');
        return;
      }
    }
    // bone meal: fertilize the target block
    if (held && held.count > 0 && held.blockId === ITEM.BONEMEAL && this.target) {
      const t = this.target;
      const targetId = this.world.getBlock(t.x, t.y, t.z);
      if (this.fertilize(t.x, t.y, t.z, targetId)) {
        held.count--;
        if (held.count <= 0) { held.blockId = 0; held.count = 0; }
        this.syncHUD();
        this.updateHandMesh();
        this.placeCooldown = 0.25;
        this.startSwing();
      }
      return;
    }
    // hoe: till grass/dirt/mycelium into farmland
    const heldTool = held && held.count > 0 && isItemId(held.blockId) ? getToolDef(held.blockId) : undefined;
    if (heldTool?.type === 'hoe' && this.target) {
      const t = this.target;
      const id = this.world.getBlock(t.x, t.y, t.z);
      const above = this.world.getBlock(t.x, t.y + 1, t.z);
      const tillable = id === BLOCK.GRASS || id === BLOCK.DIRT || id === BLOCK.MYCELIUM || id === BLOCK.SNOW_GRASS;
      if (tillable && above === BLOCK.AIR) {
        this.world.setBlock(t.x, t.y, t.z, BLOCK.FARMLAND);
        audio.dig('dirt');
        this.damageTool(1);
        this.placeCooldown = 0.25;
        this.startSwing();
        this.achievements.unlock('plowman');
      }
      return; // hoes never place blocks
    }
    // seeds: plant a wheat crop on farmland (top face)
    if (held && held.count > 0 && held.blockId === ITEM.SEEDS && this.target) {
      const t = this.target;
      if (this.world.getBlock(t.x, t.y, t.z) === BLOCK.FARMLAND && t.ny === 1) {
        const above = this.world.getBlock(t.x, t.y + 1, t.z);
        if (above === BLOCK.AIR) {
          this.world.setBlock(t.x, t.y + 1, t.z, BLOCK.WHEAT_STAGE0);
          audio.place('grass');
          this.placeCooldown = 0.22;
          this.startSwing();
          held.count--;
          if (held.count <= 0) { held.blockId = 0; held.count = 0; }
          this.syncHUD();
          this.updateHandMesh();
        }
      }
      return; // seeds never place blocks
    }
    // boat: launch onto water along the look ray
    if (held && held.count > 0 && held.blockId === ITEM.BOAT) {
      const placed = this.tryPlaceBoat();
      if (placed && !this.player.isCreative) {
        held.count--;
        if (held.count <= 0) { held.blockId = 0; held.count = 0; }
        this.syncHUD();
        this.updateHandMesh();
      }
      this.placeCooldown = 0.25;
      this.startSwing();
      return; // boat item never places blocks
    }
    this.placeBlock();
  }

  /** drop the held boat onto the first water cell along the look ray */
  private tryPlaceBoat(): boolean {
    if (this.ridingBoat) return false;
    const p = this.player;
    const eyeY = p.eyeY();
    const dir = p.forwardVector();
    for (let t = 0.5; t <= 6; t += 0.25) {
      const x = Math.floor(p.x + dir.x * t);
      const y = Math.floor(eyeY + dir.y * t);
      const z = Math.floor(p.z + dir.z * t);
      if (isWaterId(this.world.getBlock(x, y, z)) && this.world.getBlock(x, y + 1, z) === BLOCK.AIR) {
        this.boats.spawn(x + 0.5, y + 0.45, z + 0.5, Math.atan2(dir.x, dir.z));
        audio.splash();
        return true;
      }
    }
    this.showToast('Point at water to launch the boat');
    return false;
  }

  /** leave the boat: place the player on a free spot beside it */
  private dismountBoat(): void {
    const b = this.ridingBoat;
    if (!b) return;
    b.occupied = false;
    const spot = this.boats.dismountSpot(b);
    const p = this.player.entity;
    p.x = spot.x; p.y = spot.y; p.z = spot.z;
    p.vx = b.vx * 0.3; p.vy = Math.max(p.vy, 0); p.vz = b.vz * 0.3;
    this.ridingBoat = null;
    audio.splash();
  }

  /** apply bone meal to a block; returns true when consumed */
  private fertilize(x: number, y: number, z: number, id: number): boolean {
    const greens: [number, number][] = [[0.5, 0.95, 0.4], [0.65, 1, 0.5], [0.4, 0.85, 0.35]] as unknown as [number, number][];
    void greens;
    // grass: sprout tall grass + flowers around (MC-like scatter)
    if (id === BLOCK.GRASS) {
      let planted = 0;
      for (let i = 0; i < 14 && planted < 5; i++) {
        const bx = x + Math.floor(Math.random() * 5) - 2;
        const bz = z + Math.floor(Math.random() * 5) - 2;
        const by = y + 1;
        if (this.world.getBlock(bx, by, bz) !== BLOCK.AIR) continue;
        if (this.world.getBlock(bx, y, bz) !== BLOCK.GRASS) continue;
        const r = Math.random();
        const block = r < 0.72 ? BLOCK.TALL_GRASS : r < 0.86 ? BLOCK.FLOWER_RED : BLOCK.FLOWER_YELLOW;
        this.world.setBlock(bx, by, bz, block);
        planted++;
      }
      if (planted > 0) {
        this.fertilizeFx(x, y + 1, z);
        this.achievements.unlock('gardener');
        return true;
      }
      return false;
    }
    // mycelium: sprout small mushrooms
    if (id === BLOCK.MYCELIUM) {
      let planted = 0;
      for (let i = 0; i < 12 && planted < 4; i++) {
        const bx = x + Math.floor(Math.random() * 5) - 2;
        const bz = z + Math.floor(Math.random() * 5) - 2;
        const by = y + 1;
        if (this.world.getBlock(bx, by, bz) !== BLOCK.AIR) continue;
        if (this.world.getBlock(bx, y, bz) !== BLOCK.MYCELIUM) continue;
        this.world.setBlock(bx, by, bz, Math.random() < 0.5 ? BLOCK.MUSHROOM_RED : BLOCK.MUSHROOM_BROWN);
        planted++;
      }
      if (planted > 0) {
        this.fertilizeFx(x, y + 1, z);
        this.achievements.unlock('gardener');
        return true;
      }
      return false;
    }
    // small mushroom: chance to grow a giant one
    if (id === BLOCK.MUSHROOM_RED || id === BLOCK.MUSHROOM_BROWN) {
      if (Math.random() < 0.55 && this.growGiantMushroom(x, y, z, id)) {
        this.fertilizeFx(x, y, z);
        this.achievements.unlock('gardener');
        return true;
      }
      this.showToast('The mushroom refuses to grow');
      return false;
    }
    // wheat crop: advance 1-2 stages
    if (isWheatCrop(id)) {
      if (id === BLOCK.WHEAT_STAGE3) {
        this.showToast('The wheat is already ripe');
        return false;
      }
      const next = Math.min(BLOCK.WHEAT_STAGE3, nextWheatStage(id) + (Math.random() < 0.35 ? 1 : 0));
      this.world.setBlock(x, y, z, next);
      this.fertilizeFx(x, y + 0.5, z);
      return true;
    }
    // sapling: instant tree
    if (isSapling(id)) {
      if (this.growSaplingTree(x, y, z, id)) {
        this.fertilizeFx(x, y + 1, z);
        this.achievements.unlock('gardener');
        return true;
      }
      this.showToast('Not enough room to grow');
      return false;
    }
    this.showToast('Bone meal has no effect here');
    return false;
  }

  /** grow a full tree from a sapling at (x,y,z); returns false when blocked */
  private growSaplingTree(x: number, y: number, z: number, saplingId: number): boolean {
    const below = this.world.getBlock(x, y - 1, z);
    if (below !== BLOCK.GRASS && below !== BLOCK.DIRT && below !== BLOCK.SNOW_GRASS && below !== BLOCK.FARMLAND) return false;
    const isSpruce = saplingId === BLOCK.SPRUCE_SAPLING;
    const height = isSpruce ? 6 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 3);
    // trunk column must be clear
    for (let dy = 1; dy <= height + 1; dy++) {
      if (y + dy >= WORLD_HEIGHT) return false;
      const cell = this.world.getBlock(x, y + dy, z);
      if (cell !== BLOCK.AIR && !isLiquid(cell)) return false;
    }
    const log = isSpruce ? BLOCK.SPRUCE_LOG : BLOCK.LOG;
    const leaf = isSpruce ? BLOCK.SPRUCE_LEAVES : BLOCK.LEAVES;
    const topY = y + height;
    // trunk (replaces the sapling)
    this.world.setBlock(x, y, z, log);
    for (let dy = 1; dy <= height; dy++) this.world.setBlock(x, y + dy, z, log);
    if (isSpruce) {
      // conical spruce: alternating ring radii + tip
      this.setIfAir(x, topY + 1, z, leaf);
      for (let ly = topY; ly >= y + 2; ly--) {
        const layer = topY - ly;
        const r = layer % 2 === 0 ? 1 : 2;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2) continue;
            this.setIfAir(x + dx, ly, z + dz, leaf);
          }
      }
    } else {
      // oak canopy: two wide layers + two small layers (terrain.placeTree pattern)
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            this.setIfAir(x + dx, topY + dy, z + dz, leaf);
          }
      }
    }
    return true;
  }

  private fertilizeFx(x: number, y: number, z: number): void {
    audio.bonemeal();
    for (let i = 0; i < 12; i++) {
      this.particles.spawnParticle(
        x + 0.5 + (Math.random() - 0.5) * 1.6, y + Math.random() * 0.8, z + 0.5 + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8,
        [0.55, 0.9, 0.45], 0.055, 0.55, -0.6,
      );
    }
  }

  /** grow a giant mushroom from a small one (bonemeal); returns false when blocked */
  private growGiantMushroom(x: number, y: number, z: number, smallId: number): boolean {
    const below = this.world.getBlock(x, y - 1, z);
    if (below !== BLOCK.MYCELIUM && below !== BLOCK.DIRT && below !== BLOCK.GRASS) return false;
    const capId = smallId === BLOCK.MUSHROOM_BROWN ? BLOCK.MUSHROOM_BROWN_CAP : BLOCK.MUSHROOM_RED_CAP;
    const height = 4 + Math.floor(Math.random() * 3); // 4..6
    // clearance check
    for (let dy = 1; dy <= height + 1; dy++) {
      if (y + dy >= WORLD_HEIGHT) return false;
      const cell = this.world.getBlock(x, y + dy, z);
      if (cell !== BLOCK.AIR && !isLiquid(cell)) return false;
    }
    // stem (replaces the small mushroom at the base)
    this.world.setBlock(x, y, z, BLOCK.MUSHROOM_STEM);
    for (let dy = 1; dy <= height; dy++) this.world.setBlock(x, y + dy, z, BLOCK.MUSHROOM_STEM);
    const topY = y + height;
    if (smallId === BLOCK.MUSHROOM_RED) {
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          this.setIfAir(x + dx, topY, z + dz, capId);
        }
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          this.setIfAir(x + dx, topY + 1, z + dz, capId);
    } else {
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          this.setIfAir(x + dx, topY - 1, z + dz, capId);
        }
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          this.setIfAir(x + dx, topY, z + dz, capId);
      this.setIfAir(x, topY + 1, z, capId);
    }
    return true;
  }

  private setIfAir(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const cur = this.world.getBlock(x, y, z);
    if (cur === BLOCK.AIR || isLiquid(cur)) this.world.setBlock(x, y, z, id);
  }

  // ── villager trading ────────────────────────────────────────────────────────
  /** offers currently shown in the trade panel (set by openTrade) */
  private activeTrades: TradeOffer[] = [];

  openTrade(mob?: { x: number; z: number }): void {
    audio.click();
    // per-villager stock: deterministic pick from the pool, rotating every epoch (MC restock)
    const seed = mob ? villagerTradeSeed(mob.x, mob.z) : 0;
    this.activeTrades = villagerTrades(seed, tradeEpoch());
    useGameStore.getState().setTradeOpen(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  closeTrade(): void {
    const st = useGameStore.getState();
    if (!st.tradeOpen) return;
    st.setTradeOpen(false);
    if (st.screen === 'playing') this.requestLock();
  }

  /** offers shown in the trade panel (called by the UI when rendering) */
  getTradeOffers(): TradeOffer[] {
    return this.activeTrades;
  }

  /** execute a villager trade offer (validated server-side… er, engine-side) */
  executeTrade(index: number): void {
    const offer = this.activeTrades[index] ?? null;
    if (!offer) return;
    if (this.countItem(offer.give.id) < offer.give.count) {
      this.showToast('Not enough ' + this.itemLabel(offer.give.id));
      return;
    }
    this.consumeItem(offer.give.id, offer.give.count);
    const leftover = addToSlots(this.player.hotbar, offer.get.id, offer.get.count, freshDur(offer.get.id));
    if (leftover > 0) addToSlots(this.player.main, offer.get.id, leftover, freshDur(offer.get.id));
    audio.trade();
    this.achievements.unlock('trader');
    this.showToast('Traded for ' + this.itemLabel(offer.get.id) + ' ×' + offer.get.count);
    this.syncHUD();
    this.syncInventory();
  }

  private itemLabel(id: number): string {
    return isItemId(id) ? (getItemDef(id)?.name ?? 'item') : (getBlockDef(id)?.name ?? 'block');
  }

  // ── fishing (fishing rod: cast → wait → bite window → catch) ────────────────
  /** RMB with a fishing rod: cast, or reel in (catch when biting) */
  private rodInteract(): void {
    if (!this.fishing) {
      const p = this.player;
      const fwd = p.forwardVector();
      this.fishing = {
        state: 'fly',
        x: p.x + fwd.x * 0.6, y: p.eyeY() - 0.2 + fwd.y * 0.6, z: p.z + fwd.z * 0.6,
        vx: fwd.x * 11, vy: fwd.y * 11 + 2.2, vz: fwd.z * 11,
        nextBite: 0, biteT: 0,
      };
      this.ensureBobberVisual();
      audio.rodCast();
      this.startSwing();
      return;
    }
    if (this.fishing.state === 'bite') {
      this.catchFish();
    } else {
      this.endFishing();
      audio.rodReel();
    }
  }

  private ensureBobberVisual(): void {
    if (this.bobberMesh) return;
    const g = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), new THREE.MeshLambertMaterial({ color: 0xd8382e }));
    red.position.y = 0.04;
    const white = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }));
    white.position.y = -0.04;
    g.add(red, white);
    this.scene.add(g);
    this.bobberMesh = g;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.fishLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdddddd }));
    this.scene.add(this.fishLine);
  }

  private endFishing(): void {
    if (this.fishLine) {
      this.scene.remove(this.fishLine);
      this.fishLine.geometry.dispose();
      (this.fishLine.material as THREE.Material).dispose();
      this.fishLine = null;
    }
    if (this.bobberMesh) {
      this.scene.remove(this.bobberMesh);
      this.bobberMesh = null;
    }
    this.fishing = null;
  }

  private updateFishing(dt: number): void {
    const f = this.fishing;
    if (!f || !this.bobberMesh || !this.fishLine) return;
    const held = this.player.hotbar[this.player.selected];
    if (!held || held.count <= 0 || !isRodItem(held.blockId) || this.player.dead) { this.endFishing(); return; }
    const dist = Math.hypot(f.x - this.player.x, f.z - this.player.z);
    if (dist > 26) { this.endFishing(); return; }

    if (f.state === 'fly') {
      // projectile arc toward the aim point
      f.vy -= 18 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const bx = Math.floor(f.x), by = Math.floor(f.y), bz = Math.floor(f.z);
      const bid = this.world.getBlock(bx, by, bz);
      if (isWaterId(bid)) {
        f.state = 'float';
        f.y = by + 0.9;
        f.vx = 0; f.vy = 0; f.vz = 0;
        const lure = lureFactor(held.ench);
        const rain = this.weather.raining ? 0.75 : 1; // MC: rain bites faster
        f.nextBite = (5 + Math.random() * 14) * lure * rain;
        audio.rodSplash(dist);
        this.particles.burstLand(f.x, by + 1, f.z, [0.55, 0.7, 0.95], 8);
      } else if (bid !== BLOCK.AIR) {
        // snagged on land: the line snaps back (no cost)
        this.endFishing();
        return;
      }
    } else {
      // floating: bob gently; bite window after the wait
      if (f.state === 'bite') {
        f.biteT -= dt;
        if (f.biteT <= 0) {
          f.state = 'float';
          f.nextBite = 4 + Math.random() * 10; // missed — fish may return
        }
      } else {
        f.nextBite -= dt;
        if (f.nextBite <= 0) {
          f.state = 'bite';
          f.biteT = 1.4;
          audio.fishBite();
          this.particles.burstLand(f.x, f.y, f.z, [0.55, 0.7, 0.95], 5);
        }
      }
    }

    // visuals: bobber (dips while biting) + line from the rod hand
    this.bobberMesh.position.set(f.x, f.y + (f.state === 'bite' ? -0.12 : Math.sin(performance.now() / 300) * 0.02), f.z);
    this.bobberMesh.rotation.y += dt * 2;
    const p = this.player;
    const hand = new THREE.Vector3(p.x, p.eyeY() - 0.32, p.z);
    hand.x += -Math.cos(p.yaw) * 0.34 - Math.sin(p.yaw) * 0.24;
    hand.z += Math.sin(p.yaw) * 0.34 - Math.cos(p.yaw) * 0.24;
    const posAttr = this.fishLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.setXYZ(0, hand.x, hand.y, hand.z);
    posAttr.setXYZ(1, this.bobberMesh.position.x, this.bobberMesh.position.y, this.bobberMesh.position.z);
    posAttr.needsUpdate = true;
  }

  /** fish on! loot roll (fish / junk / treasure, Luck of the Sea shifts treasure) */
  private catchFish(): void {
    const f = this.fishing;
    if (!f || f.state !== 'bite') return;
    const held = this.player.hotbar[this.player.selected];
    const luck = luckBonus(held?.ench);
    const roll = Math.random();
    const treasureShare = 0.10 + luck;
    const junkShare = 0.18;
    let loot: { id: number; count: number };
    if (roll < treasureShare) {
      const t = Math.random();
      loot = t < 0.4 ? { id: ITEM.IRON_INGOT, count: 1 } : t < 0.7 ? { id: ITEM.GOLD_INGOT, count: 1 } : t < 0.85 ? { id: ITEM.ARROW, count: 3 } : t < 0.95 ? { id: ITEM.BOOK, count: 1 } : { id: ITEM.DIAMOND, count: 1 };
    } else if (roll < treasureShare + junkShare) {
      const t = Math.random();
      loot = t < 0.35 ? { id: ITEM.STICK, count: 2 } : t < 0.6 ? { id: ITEM.STRING, count: 1 } : t < 0.8 ? { id: ITEM.BONE, count: 1 } : t < 0.92 ? { id: ITEM.LEATHER, count: 1 } : { id: ITEM.ROTTEN_FLESH, count: 1 };
    } else {
      loot = Math.random() < 0.65 ? { id: ITEM.RAW_COD, count: 1 } : { id: ITEM.RAW_SALMON, count: 1 };
    }
    const left = this.addToInventory(loot.id, loot.count);
    if (left > 0) this.drops.spawn(loot.id, this.player.x, this.player.y + 1, this.player.z, left);
    this.showToast('Caught ' + this.itemLabel(loot.id) + (loot.count > 1 ? ' ×' + loot.count : ''));
    audio.fishCaught();
    this.achievements.unlock('fisherman');
    if (loot.id === ITEM.RAW_COD || loot.id === ITEM.RAW_SALMON) this.addXP(1 + Math.floor(Math.random() * 3));
    // rod durability (1 per catch, MC-style; Unbreaking works)
    if (held && !this.player.isCreative) {
      const rdef = getRodDef(held.blockId);
      if (rdef && !unbreakingKeep(held.ench?.unbreaking ?? 0)) {
        held.dur = (held.dur ?? rdef.dur) - 1;
        if (held.dur <= 0) {
          this.player.hotbar[this.player.selected] = { blockId: 0, count: 0 };
          audio.breakBlock('glass');
          this.showToast('Your fishing rod broke!');
          this.updateHandMesh(true);
        }
      }
    }
    this.endFishing();
    this.syncHUD();
    this.syncInventory();
    this.updateHandMesh();
  }

  // ── buckets: scoop / milk / pour / drink ─────────────────────────────────────
  /** RMB with any bucket. Returns true when the click was consumed. */
  private bucketInteract(id: number): boolean {
    // glass bottle: fill from a water source (MC — the water stays put)
    if (id === ITEM.GLASS_BOTTLE) {
      const w = this.waterTarget(4.2);
      if (w) {
        this.replaceHeld(ITEM.WATER_BOTTLE);
        audio.bucketFill();
        this.particles.burstLand(w.x + 0.5, w.y + 0.9, w.z + 0.5, [0.55, 0.7, 0.95], 4);
        this.placeCooldown = 0.3;
        this.startSwing();
        this.syncInventory();
        return true;
      }
      return false;
    }
    // milk: drink it (clears ALL potion effects + poison, like MC); the empty bucket comes back
    if (id === ITEM.MILK_BUCKET) {
      this.player.poisonT = 0;
      this.player.poisonTickT = 0;
      this.player.effects = []; // milk wipes every active potion effect (MC)
      audio.milkDrink();
      this.replaceHeld(ITEM.BUCKET);
      this.showToast('Effects cleared');
      this.placeCooldown = 0.35;
      this.startSwing();
      this.syncInventory();
      this.syncHUD();
      return true;
    }
    // milk a cow in reach
    if (id === ITEM.BUCKET && this.mobs) {
      const p = this.player;
      const eye = { x: p.x, y: p.eyeY(), z: p.z };
      const dir = p.forwardVector();
      const hit = this.ridingBoat ? null : this.mobs.raycastMob(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      if (hit && hit.mob.type === 'cow') {
        this.replaceHeld(ITEM.MILK_BUCKET);
        audio.milkDrink();
        this.showToast('Fresh milk!');
        this.placeCooldown = 0.35;
        this.startSwing();
        this.syncInventory();
        return true;
      }
    }
    // scoop a water source cell along the look ray (the world raycast skips
    // liquids, so buckets need their own water scan)
    if (id === ITEM.BUCKET) {
      const w = this.waterTarget(4.2);
      if (w) {
        this.world.setBlock(w.x, w.y, w.z, BLOCK.AIR);
        this.replaceHeld(ITEM.WATER_BUCKET);
        audio.bucketFill();
        this.particles.burstLand(w.x + 0.5, w.y + 0.9, w.z + 0.5, [0.55, 0.7, 0.95], 6);
        this.placeCooldown = 0.3;
        this.startSwing();
        this.syncInventory();
        return true;
      }
      return false;
    }
    // pour water: place a source at the target's adjacent cell
    if (id === ITEM.WATER_BUCKET && this.target && !this.player.sneaking) {
      const t = this.target;
      const px2 = t.x + t.nx, py2 = t.y + t.ny, pz2 = t.z + t.nz;
      if (py2 < 0 || py2 >= WORLD_HEIGHT) return false;
      const there = this.world.getBlock(px2, py2, pz2);
      const def = getBlockDef(there);
      const replaceable = there === BLOCK.AIR || (def && !def.solid && !isWaterId(there));
      if (!replaceable) return false;
      this.world.setBlock(px2, py2, pz2, BLOCK.WATER);
      this.world.scheduleFluidTick(px2, py2, pz2, 0.4);
      this.replaceHeld(ITEM.BUCKET);
      audio.bucketPour();
      this.particles.burstLand(px2 + 0.5, py2 + 0.9, pz2 + 0.5, [0.55, 0.7, 0.95], 8);
      this.placeCooldown = 0.3;
      this.startSwing();
      this.syncInventory();
      return true;
    }
    return false;
  }

  /** swap one of the held stack for a new item id (bucket flows: full ↔ empty);
   *  the produced item drops on the ground when the inventory is full (MC) */
  private replaceHeld(newId: number): void {
    const slot = this.player.hotbar[this.player.selected];
    if (slot.count > 1) {
      slot.count--;
      // try to stack into an existing pile, else a free slot, else drop it
      const left = addToSlots(this.player.hotbar, newId, 1);
      const rest = left > 0 ? addToSlots(this.player.main, newId, left) : 0;
      if (rest > 0) {
        this.drops.spawn(newId, this.player.x, this.player.y + 1, this.player.z, rest);
        this.showToast('Inventory full — item dropped');
      }
    } else {
      this.player.hotbar[this.player.selected] = { blockId: newId, count: 1 };
    }
    this.syncHUD();
    this.updateHandMesh();
  }

  // ── potions + cake (phase 13) ────────────────────────────────────────────────
  /** drink the held potion: apply its effect, return an empty bottle (MC) */
  private drinkPotion(id: number): void {
    if (this.eatCooldown > 0) return;
    const def = getPotionDef(id);
    if (!def) return;
    const p = this.player;
    const effDef = EFFECTS[def.effect];
    const amp = def.amp ?? 1;
    if (def.effect === 'healing') {
      p.heal(amp >= 2 ? 12 : 6); // Instant Health (4 hearts / 8 at tier-2)
    } else if (def.effect === 'poison') {
      p.poisonT = Math.max(p.poisonT, def.seconds);
      p.poisonAmp = Math.max(p.poisonAmp, amp);
      p.poisonTickT = 0;
    } else {
      const cur = p.effects.find((e) => e.k === def.effect);
      if (cur) {
        cur.t = Math.max(cur.t, def.seconds);
        cur.amp = Math.max(cur.amp ?? 1, amp);
      } else p.effects.push({ k: def.effect, t: def.seconds, amp: amp > 1 ? amp : undefined });
    }
    this.eatCooldown = 1.2;
    audio.milkDrink();
    this.showToast(effDef.label + (amp >= 2 ? ' II' : '') + ' · ' + effDef.fa);
    this.replaceHeld(ITEM.GLASS_BOTTLE);
    this.placeCooldown = 0.35;
    this.startSwing();
    this.syncHUD();
    this.syncInventory();
  }

  /** throw the held splash potion (MC): parabolic projectile, AoE at impact.
   *  Consumes the bottle (no glass back — MC Java behavior). */
  private throwSplashPotion(id: number): void {
    if (this.eatCooldown > 0 || this.splashThrowCd > 0) return;
    const p = this.player;
    const dir = p.forwardVector();
    this.mobs.throwPlayerPotion(p.x, p.eyeY() - 0.08, p.z, dir.x, dir.y, dir.z, 13, id);
    const slot = this.player.hotbar[this.player.selected];
    slot.count--;
    if (slot.count <= 0) this.player.hotbar[this.player.selected] = { blockId: 0, count: 0 };
    this.splashThrowCd = 0.5;
    this.eatCooldown = 0.4;
    this.startSwing();
    this.syncHUD();
    this.updateHandMesh();
  }

  /** RMB on a cake block: eat one slice (7 slices total, 2 hunger each — MC) */
  private eatCakeSlice(x: number, y: number, z: number, id: number): void {
    if (this.eatCooldown > 0) return;
    if (!this.player.isCreative && this.player.hunger >= 19.6) return; // not hungry
    this.eatCooldown = 1.0;
    this.player.hunger = Math.min(20, this.player.hunger + 2);
    audio.eat();
    this.startSwing();
    const next = nextCakeStage(id);
    if (next === null) this.world.setBlock(x, y, z, BLOCK.AIR);
    else this.world.setBlock(x, y, z, next);
    this.achievements.unlock('theLie');
    this.syncHUD();
  }

  /** first WATER SOURCE cell along the look ray; null when a solid block blocks the path first */
  private waterTarget(maxDist: number): { x: number; y: number; z: number } | null {
    const p = this.player;
    const dir = p.forwardVector();
    const step = 0.1;
    for (let d = 0.3; d <= maxDist; d += step) {
      const x = Math.floor(p.x + dir.x * d);
      const y = Math.floor(p.eyeY() + dir.y * d);
      const z = Math.floor(p.z + dir.z * d);
      const id = this.world.getBlock(x, y, z);
      if (id !== 0 && !isLiquid(id)) return null; // solid got in the way first
      if (id === BLOCK.WATER) return { x, y, z };
    }
    return null;
  }

  // ── enchanting table (MC-like: held item + 3 lapis/XP offers) ────────────────
  openEnchant(): void {
    const st = useGameStore.getState();
    if (st.screen !== 'playing' || st.inv.open || st.tradeOpen || st.enchantOpen) return;
    const slot = this.player.hotbar[this.player.selected];
    if (!slot || slot.count <= 0 || !isEnchantable(slot.blockId)) {
      this.showToast('Hold an enchantable item!');
      return;
    }
    audio.click();
    this.enchantEpoch++;
    this.enchantTarget = { slotRef: slot, options: enchantOptions(slot.blockId, this.enchantEpoch) };
    st.setEnchantOpen(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  closeEnchant(): void {
    const st = useGameStore.getState();
    if (!st.enchantOpen) return;
    st.setEnchantOpen(false);
    this.enchantTarget = null;
    if (st.screen === 'playing') this.requestLock();
  }

  /** snapshot for the panel: held item + offers + lapis/XP resources */
  getEnchantState(): { itemId: number; options: EnchantOption[]; lapis: number; xpLevel: number; canEnchant: boolean } | null {
    const t = this.enchantTarget;
    if (!t) return null;
    const held = this.player.hotbar[this.player.selected];
    if (!held || held.count <= 0) return null;
    return { itemId: held.blockId, options: t.options, lapis: this.countItem(ITEM.LAPIS_LAZULI), xpLevel: this.player.level, canEnchant: isEnchantable(held.blockId) };
  }

  /** public read of the currently held hotbar slot (enchant panel, QA) */
  getHeldSlot(): HotbarSlot | null {
    const s = this.player.hotbar[this.player.selected];
    return s && s.count > 0 ? s : null;
  }

  /** apply offer idx to the held item (lapis + XP cost; offers reroll after) */
  applyEnchant(idx: number): void {
    const t = this.enchantTarget;
    if (!t) return;
    const opt = t.options[idx];
    if (!opt) return;
    const slot = t.slotRef;
    if (!slot || slot.count <= 0) return;
    if (this.countItem(ITEM.LAPIS_LAZULI) < opt.lapis) { this.showToast('Not enough Lapis Lazuli!'); return; }
    if (this.player.level < opt.levels) { this.showToast(`Needs ${opt.levels} XP levels!`); return; }
    const cur = { ...(slot.ench ?? {}) };
    cur[opt.enchId] = Math.max(cur[opt.enchId] ?? 0, opt.level);
    slot.ench = cur;
    this.consumeItem(ITEM.LAPIS_LAZULI, opt.lapis);
    this.player.level = Math.max(0, this.player.level - opt.levels);
    audio.enchant();
    this.achievements.unlock('enchanter');
    this.showToast(opt.label + ' applied!');
    // MC rerolls the offers after each enchant
    this.enchantEpoch++;
    t.options = enchantOptions(slot.blockId, this.enchantEpoch);
    this.syncHUD(true);
    this.syncInventory(true);
    this.updateHandMesh();
  }

  // ── lightning (weather thunderstorm callback) ─────────────────────────────
  private spawnLightningBolt(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    const segments = 5;
    const totalH = 42;
    const segH = totalH / segments;
    let px = x, pz = z;
    for (let i = 0; i < segments; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
      mats.push(mat);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16 + Math.random() * 0.1, segH, 0.16 + Math.random() * 0.1), mat);
      const nx = px + (i === 0 ? 0 : (Math.random() - 0.5) * 2.2);
      const nz = pz + (i === 0 ? 0 : (Math.random() - 0.5) * 2.2);
      seg.position.set((px + nx) / 2 - x, y + segH * (i + 0.5), (pz + nz) / 2 - z);
      seg.rotation.y = Math.random() * Math.PI;
      group.add(seg);
      px = nx; pz = nz;
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    this.lightningBolts.push({ group, mats, t: 0.42 });
    // impact effects + damage
    this.particles.burstLand(x, y + 0.4, z, [1, 0.95, 0.7], 18);
    for (let i = 0; i < 8; i++) {
      this.particles.spawnParticle(
        x + (Math.random() - 0.5) * 1.4, y + 0.5 + Math.random() * 1.4, z + (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2,
        [1, 0.85, 0.35], 0.08, 0.5, -1,
      );
    }
    audio.lightningStrike(Math.hypot(this.player.x - x, this.player.z - z));
    // shockwave damage: mobs + player within 3 blocks
    if (this.mobCb) {
      for (const m of this.mobs.mobs) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - x, m.y - y, m.z - z);
        if (d < 3) this.mobs.hurtMob(m, 5, (m.x - x) / (d || 1) * 3, (m.z - z) / (d || 1) * 3, this.mobCb);
      }
    }
    const pd = Math.hypot(this.player.x - x, this.player.y - y, this.player.z - z);
    if (pd < 3.2 && !this.player.isCreative) {
      this.player.damage(Math.max(1, Math.round(6 - pd * 1.6)));
      audio.hurt();
    }
  }

  private updateLightning(dt: number): void {
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const b = this.lightningBolts[i];
      b.t -= dt;
      const flicker = b.t > 0 ? (Math.sin(b.t * 60) > -0.3 ? 0.95 : 0.25) : 0;
      for (const m of b.mats) m.opacity = Math.max(0, flicker * Math.min(1, b.t * 4));
      if (b.t <= 0) {
        this.scene.remove(b.group);
        for (const seg of b.group.children) {
          const mesh = seg as THREE.Mesh;
          mesh.geometry.dispose();
        }
        for (const m of b.mats) m.dispose();
        this.lightningBolts.splice(i, 1);
      }
    }
  }

  private clearLightningBolts(): void {
    for (const b of this.lightningBolts) {
      this.scene.remove(b.group);
      for (const seg of b.group.children) (seg as THREE.Mesh).geometry.dispose();
      for (const m of b.mats) m.dispose();
    }
    this.lightningBolts = [];
  }

  /** RMB released: fire the arrow (charge ≥ 0.14) or cancel */
  private releaseBow(): void {
    if (!this.bowCharging) return;
    this.bowCharging = false;
    const charge = this.bowCharge;
    this.bowCharge = 0;
    if (charge < 0.14) return; // too weak — cancel
    const p = this.player;
    const bowSlot = p.hotbar[p.selected];
    if (!p.isCreative) {
      if (this.countItem(ITEM.ARROW) <= 0) return;
      // Infinity: the arrow is never consumed (needs 1 in inventory)
      if (!hasInfinity(bowSlot?.ench)) this.consumeItem(ITEM.ARROW, 1);
    }
    const fwd = p.forwardVector();
    const speed = 14 + 40 * Math.min(1, charge);
    // Power: +1 dmg per level on the drawn bow
    const heldSlot = bowSlot;
    const dmg = Math.max(1, Math.round(2 + 7 * Math.min(1, charge) + powerBonus(heldSlot?.ench)));
    this.mobs.shootPlayerArrow(p.x, p.eyeY() - 0.08, p.z, fwd.x, fwd.y, fwd.z, speed, dmg);
    // bow durability
    const slot = heldSlot;
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

    // mob attack takes priority over mining (boats too)
    if (this.mining && this.attackCooldown <= 0) {
      const eye = new THREE.Vector3(this.player.x, this.player.eyeY(), this.player.z);
      const dir = this.player.forwardVector();
      const hit = this.ridingBoat ? null : this.mobs.raycastMob(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      // attacking a boat breaks it (drops the boat item)
      const boatHit = this.ridingBoat ? null : this.boats.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 3.4);
      if (boatHit && (!hit || boatHit.dist < hit.dist)) {
        this.attackCooldown = 0.42;
        this.startSwing();
        this.boats.remove(boatHit.boat);
        this.drops.spawn(ITEM.BOAT, boatHit.boat.x, boatHit.boat.y + 0.4, boatHit.boat.z, 1);
        audio.breakBlock('wood' as MaterialSound);
        this.particles.burstBlockBreak(boatHit.boat.x, boatHit.boat.y + 0.2, boatHit.boat.z, [0.54, 0.41, 0.24]);
        this.crackMesh.visible = false;
        return;
      }
      if (hit) {
        this.attackCooldown = 0.42;
        this.startSwing();
        const kx = hit.mob.x - this.player.x;
        const kz = hit.mob.z - this.player.z;
        // Sharpness: +1 dmg per level (sword/axe); Strength potion: ×1.5 (phase 13)
        const melee = ((heldTool ? heldTool.dmg : 2) + (heldTool ? sharpnessBonus(heldSlot?.ench) : 0)) * this.player.strengthMultiplier;
        const killed = this.mobs.hurtMob(hit.mob, melee, kx, kz, this.mobCb ?? undefined);
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
    // CADENCE (user report: one click broke 3-4 blocks in a burst): the old
    // code broke a block EVERY FRAME while the button was down — the raycast
    // then passed through the fresh hole and destroyed the blocks behind it.
    // MC behavior: a single click breaks exactly ONE block; holding breaks
    // continuously at ~4 blocks/s. The cooldown resets on mousedown (edge),
    // so every fresh click is instant while held-down breaking is throttled.
    if (this.player.isCreative) {
      if (this.creativeBreakCd > 0) { this.crackMesh.visible = false; return; }
      const cdef = getBlockDef(t.id);
      if (!cdef) return;
      const col = tileAvgColor(Array.isArray(cdef.tiles) ? cdef.tiles[2] : cdef.tiles);
      this.particles.burstBlockBreak(t.x, t.y, t.z, col);
      audio.breakBlock((cdef.sound ?? 'stone') as MaterialSound);
      if (containerOf(t.id)) this.blockEnts.destroy(t.x, t.y, t.z);
      const brokenMeta = this.world.getMeta(t.x, t.y, t.z);
      this.world.setBlock(t.x, t.y, t.z, BLOCK.AIR);
      this.cleanupDependents(t.x, t.y, t.z, t.id, brokenMeta, false);
      this.creativeBreakCd = 0.25;
      // pop unsupported blocks above (torch, flowers, bed, door) + plant stacks
      let py = t.y + 1;
      let guard = 0;
      while (py < WORLD_HEIGHT && guard++ < 96) {
        const aboveId = this.world.getBlock(t.x, py, t.z);
        const aboveDef = getBlockDef(aboveId);
        const isStack = aboveId === BLOCK.SUGARCANE || aboveId === BLOCK.CACTUS;
        if (!aboveDef?.needsGround && !isStack) break;
        if (containerOf(aboveId)) this.blockEnts.destroy(t.x, py, t.z);
        const popMeta = this.world.getMeta(t.x, py, t.z);
        this.world.setBlock(t.x, py, t.z, BLOCK.AIR);
        this.cleanupDependents(t.x, py, t.z, aboveId, popMeta, false);
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
    const bi = breakInfo(def, heldTool);
    // Efficiency: faster mining, but only when the held tool is the block's
    // matching class (MC behavior — a sword's Efficiency never digs faster)
    const effF = heldTool && heldSlot?.ench && heldTool.type === def.tool ? efficiencyFactor(heldSlot.ench) : 1;
    // Haste potion: −26% break time on everything (MC Haste I ≈ +30% speed; II = −41%)
    const hasteEff = this.player.effects.find((e) => e.k === 'haste');
    const hasteF = hasteEff ? (hasteEff.amp !== undefined && hasteEff.amp >= 2 ? 1.7 : 1.35) : 1;
    const time = this.instantBreak ? 0.04 : (bi.time * effF) / hasteF; // cheat: instant break
    const harvest = bi.harvest;
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
      let actualDrop = harvest && t.id === BLOCK.GRAVEL && Math.random() < 0.12 ? ITEM.FLINT : dropId;
      // leaves drop saplings (~8%, MC-style) — the tree regrowth loop
      if (harvest && t.id === BLOCK.LEAVES && Math.random() < 0.08) actualDrop = BLOCK.OAK_SAPLING;
      if (harvest && t.id === BLOCK.SPRUCE_LEAVES && Math.random() < 0.08) actualDrop = BLOCK.SPRUCE_SAPLING;
      // tall grass drops wheat seeds (~20%, MC-style foraging)
      if (harvest && t.id === BLOCK.TALL_GRASS && Math.random() < 0.2) actualDrop = ITEM.SEEDS;
      // glowstone sheds 2-4 glowstone dust instead of the block (MC);
      // 4 dust craft back into a block, so building stock isn't lost
      if (t.id === BLOCK.GLOWSTONE) {
        actualDrop = 0;
        if (harvest) {
          const dust = 2 + Math.floor(Math.random() * 3);
          for (let g = 0; g < dust; g++) this.drops.spawn(ITEM.GLOWSTONE_DUST, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
        }
      }
      if (harvest && actualDrop && actualDrop > 0) {
        this.drops.spawn(actualDrop, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
        // Fortune: chance of an extra gem (MC-lite)
        const fl = heldSlot?.ench?.fortune ?? 0;
        if (fl > 0 && (t.id === BLOCK.COAL_ORE || t.id === BLOCK.DIAMOND_ORE || t.id === BLOCK.LAPIS_ORE) && Math.random() < fortuneChance(fl)) {
          this.drops.spawn(actualDrop, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
        }
      }
      // lapis ore drops 4-8 gems (+Fortune), MC-style (the default drop is 1)
      if (harvest && t.id === BLOCK.LAPIS_ORE) {
        const fl = heldSlot?.ench?.fortune ?? 0;
        const extra = 3 + Math.floor(Math.random() * 5) + (fl > 0 ? Math.floor(Math.random() * (fl + 1)) : 0);
        for (let i2 = 0; i2 < extra; i2++) this.drops.spawn(ITEM.LAPIS_LAZULI, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
      }
      // mature wheat: grain + seeds for replanting
      if (harvest && t.id === BLOCK.WHEAT_STAGE3) {
        this.drops.spawn(ITEM.WHEAT, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
        const seeds = 1 + Math.floor(Math.random() * 2);
        for (let s = 0; s < seeds; s++) this.drops.spawn(ITEM.SEEDS, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
        this.achievements.unlock('harvest');
      }
      // XP from ores
      const oreXp = t.id === BLOCK.COAL_ORE ? 1 : t.id === BLOCK.IRON_ORE ? 1 : t.id === BLOCK.LAPIS_ORE ? 3 : t.id === BLOCK.GOLD_ORE ? 2 : t.id === BLOCK.DIAMOND_ORE ? 5 : 0;
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
      // v0.55: frames and pots spill their stored content
      const spillMeta = this.world.getMeta(t.x, t.y, t.z);
      if (harvest && t.id === BLOCK.ITEM_FRAME && frameItem(spillMeta) > 0) {
        this.drops.spawn(frameItem(spillMeta), t.x + 0.5, t.y + 0.4, t.z + 0.5, 1);
      }
      if (harvest && t.id === BLOCK.FLOWER_POT && spillMeta > 0) {
        this.drops.spawn(spillMeta, t.x + 0.5, t.y + 0.4, t.z + 0.5, 1);
      }
      const brokenMeta = this.world.getMeta(t.x, t.y, t.z);
      this.world.setBlock(t.x, t.y, t.z, BLOCK.AIR);
      this.cleanupDependents(t.x, t.y, t.z, t.id, brokenMeta, true);
      // pop unsupported blocks above (torch, flowers, bed, door) + plant stacks (sugarcane/cactus)
      let py = t.y + 1;
      let guard = 0;
      let bedFeetPopped = false;
      while (py < WORLD_HEIGHT && guard++ < 96) {
        const aboveId = this.world.getBlock(t.x, py, t.z);
        const aboveDef = getBlockDef(aboveId);
        const isStack = aboveId === BLOCK.SUGARCANE || aboveId === BLOCK.CACTUS;
        if (!aboveDef?.needsGround && !isStack) break;
        const aDrop = aboveDef && aboveDef.drop !== undefined ? aboveDef.drop : aboveId;
        if (containerOf(aboveId)) {
          for (const item of this.blockEnts.destroy(t.x, py, t.z)) {
            this.drops.spawn(item.id, t.x + 0.5, py + 0.5, t.z + 0.5, item.count);
          }
        }
        const popMeta = this.world.getMeta(t.x, py, t.z);
        // potted plant rides along when its pot pops off broken ground
        if (aboveId === BLOCK.FLOWER_POT && popMeta > 0) {
          this.drops.spawn(popMeta, t.x + 0.5, py + 0.4, t.z + 0.5, 1);
        }
        this.world.setBlock(t.x, py, t.z, BLOCK.AIR);
        this.cleanupDependents(t.x, py, t.z, aboveId, popMeta, true);
        // halves dropped by their own break path above: door uppers + bed heads
        // whose partner is gone must NOT drop twice (single-item placeables)
        let drop = aDrop;
        if (isDoorId(aboveId) && doorUpper(popMeta)) drop = 0;
        if (aboveId === BLOCK.BED) {
          if (bedHead(popMeta)) {
            // the pop loop runs bottom-up, so a feet half below was already
            // popped this pass — only a LONE head (legacy save) drops here
            if (bedFeetPopped) drop = 0;
          } else bedFeetPopped = true;
        }
        if (drop) this.drops.spawn(drop, t.x + 0.5, py + 0.3, t.z + 0.5, 1);
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
      if (targetId === BLOCK.ENCHANTING_TABLE) { this.openEnchant(); return; }
      const cont = containerOf(targetId);
      if (cont) { this.openContainer(cont, this.target.x, this.target.y, this.target.z); return; }
      if (isCake(targetId)) { this.eatCakeSlice(this.target.x, this.target.y, this.target.z, targetId); return; }
      if (targetId === BLOCK.BED) { this.sleepInBed(this.target.x, this.target.y, this.target.z); return; }
      // doors swing open/closed on right-click (sneak+use places against them)
      if (isDoorId(targetId)) { this.toggleDoor(this.target.x, this.target.y, this.target.z, targetId); return; }
      // v0.53: trapdoors + fence gates toggle the same way
      if (isTrapdoorId(targetId)) { this.toggleTrapdoor(this.target.x, this.target.y, this.target.z, targetId); return; }
      if (isGateId(targetId)) { this.toggleGate(this.target.x, this.target.y, this.target.z, targetId); return; }
      // v0.55: item frames insert/rotate/return their display item (MC right-click
      // semantics). Flower pots take a plant only with an empty hand or a
      // pottable one — anything else falls through so you can place against them.
      if (targetId === BLOCK.ITEM_FRAME) { this.useItemFrame(this.target.x, this.target.y, this.target.z); return; }
      if (targetId === BLOCK.FLOWER_POT) {
        const potHeld = this.player.hotbar[this.player.selected];
        const potHeldId = potHeld && potHeld.count > 0 ? potHeld.blockId : 0;
        if (potHeldId === 0 || isPottable(potHeldId)) { this.useFlowerPot(this.target.x, this.target.y, this.target.z); return; }
      }
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
    // ground-support requirement (torch, flowers, bed, door)
    if (def?.needsGround) {
      // wall torches (side-face click) mount on the wall instead — no ground needed
      const wallTorch = slot.blockId === BLOCK.TORCH && this.target.ny === 0;
      if (!wallTorch) {
        const below = this.world.getBlock(bx, by - 1, bz);
        const belowDef = getBlockDef(below);
        if (!belowDef?.solid) {
          this.showToast('Needs solid ground below');
          return;
        }
      }
    }
    // ── v0.55: item frames mount on side faces only (MC wall frames) ──
    if (slot.blockId === BLOCK.ITEM_FRAME) {
      if (this.target.ny !== 0) {
        this.showToast('Item frames need a wall / قاب باید روی دیوار باشد');
        return;
      }
      const frameWallDef = getBlockDef(targetId);
      if (!frameWallDef?.solid) return; // can't mount on decorations
      // ray normal points from the wall TOWARD the player (see torch note)
      const frameWallMeta = this.target.nx < 0 ? TORCH_WALL_PX : this.target.nx > 0 ? TORCH_WALL_NX : this.target.nz < 0 ? TORCH_WALL_PZ : TORCH_WALL_NZ;
      this.world.setBlock(bx, by, bz, BLOCK.ITEM_FRAME);
      this.world.setMeta(bx, by, bz, packFrameMeta(frameWallMeta, 0, 0));
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.52: wall torch — clicked a block's SIDE face: mount + lean out ──
    if (slot.blockId === BLOCK.TORCH && this.target.ny === 0) {
      const wallDef = getBlockDef(targetId);
      if (!wallDef?.solid) return; // can't mount on decorations
      // ray normal points from the wall TOWARD the player, so the wall sits on
      // the torch cell's side OPPOSITE the normal (click west face → wall on
      // the torch's +X side → TORCH_WALL_PX)
      const wallMeta = this.target.nx < 0 ? TORCH_WALL_PX : this.target.nx > 0 ? TORCH_WALL_NX : this.target.nz < 0 ? TORCH_WALL_PZ : TORCH_WALL_NZ;
      this.world.setBlock(bx, by, bz, BLOCK.TORCH);
      this.world.setMeta(bx, by, bz, wallMeta);
      this.achievements.unlock('lightItUp');
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.52: doors — two cells (lower + upper), panel hugs the player's edge ──
    if (isDoorId(slot.blockId)) {
      const belowDef = getBlockDef(this.world.getBlock(bx, by - 1, bz));
      if (!belowDef?.solid || this.world.getBlock(bx, by + 1, bz) !== BLOCK.AIR) {
        this.showToast('Doors need 2 blocks of space on solid ground');
        return;
      }
      const facing = cardinalToward(this.player.entity.x, this.player.entity.z, bx, bz);
      this.world.setBlock(bx, by, bz, slot.blockId);
      this.world.setMeta(bx, by, bz, facing);
      this.world.setBlock(bx, by + 1, bz, slot.blockId);
      this.world.setMeta(bx, by + 1, bz, facing | 8);
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.53: trapdoors — closed = 3/16 floor slab; meta records the edge the
    // OPEN panel hugs (side-click attach edge / floor-click hinge toward the
    // player / 5 = ceiling mount) ──
    if (isTrapdoorId(slot.blockId)) {
      const meta = this.target.ny > 0
        ? cardinalToward(this.player.entity.x, this.player.entity.z, bx, bz)
        : this.target.ny < 0 ? 5
        : (this.target.nx < 0 ? 0 : this.target.nx > 0 ? 1 : this.target.nz < 0 ? 2 : 3);
      this.world.setBlock(bx, by, bz, slot.blockId);
      this.world.setMeta(bx, by, bz, meta);
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.53: ladders — side faces only, flush against the clicked wall ──
    if (slot.blockId === BLOCK.LADDER) {
      if (this.target.ny !== 0 || !getBlockDef(targetId)?.solid) {
        this.showToast('Ladders need a solid wall');
        return;
      }
      const wallMeta = this.target.nx < 0 ? TORCH_WALL_PX : this.target.nx > 0 ? TORCH_WALL_NX : this.target.nz < 0 ? TORCH_WALL_PZ : TORCH_WALL_NZ;
      this.world.setBlock(bx, by, bz, BLOCK.LADDER);
      this.world.setMeta(bx, by, bz, wallMeta);
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.53: fence gates — bar perpendicular to the player's approach ──
    if (isGateId(slot.blockId)) {
      const facing = cardinalToward(this.player.entity.x, this.player.entity.z, bx, bz);
      this.world.setBlock(bx, by, bz, slot.blockId);
      this.world.setMeta(bx, by, bz, facing);
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    // ── v0.52: bed — two cells (feet here + head one cell away from the player) ──
    if (slot.blockId === BLOCK.BED) {
      const facing = cardinalToward(this.player.entity.x, this.player.entity.z, bx, bz) ^ 1;
      const [bdx, bdz] = facingDir(facing);
      const hx = bx + bdx, hz = bz + bdz;
      const headCur = this.world.getBlock(hx, by, hz);
      if (headCur !== BLOCK.AIR && !isLiquid(headCur)) {
        this.showToast('Needs 2 blocks of space');
        return;
      }
      if (!getBlockDef(this.world.getBlock(hx, by - 1, hz))?.solid) {
        this.showToast('Needs solid ground below');
        return;
      }
      if (aabbIntersectsBlock(this.player.entity, hx, by, hz)) return;
      this.world.setBlock(bx, by, bz, BLOCK.BED);
      this.world.setMeta(bx, by, bz, facing);
      this.world.setBlock(hx, by, hz, BLOCK.BED);
      this.world.setMeta(hx, by, hz, facing | 4);
      audio.place('wood');
      this.finishPlace(slot, def);
      return;
    }
    this.world.setBlock(bx, by, bz, slot.blockId);
    // attach block entity for containers
    if (def?.container) this.blockEnts.getOrCreate(bx, by, bz);
    // achievements
    if (slot.blockId === BLOCK.FURNACE) this.achievements.unlock('hotTopic');
    if (slot.blockId === BLOCK.TORCH) this.achievements.unlock('lightItUp');
    audio.place((def?.sound ?? 'stone') as MaterialSound);
    this.finishPlace(slot, def);
  }

  /** shared tail of every successful placement: cooldown, swing, item consume, HUD */
  private finishPlace(slot: HotbarSlot, def: ReturnType<typeof getBlockDef>): void {
    this.placeCooldown = 0.22;
    this.startSwing();
    if (!this.player.isCreative) {
      slot.count--;
      if (slot.count <= 0) { slot.blockId = 0; slot.count = 0; }
    }
    this.syncHUD();
    this.updateHandMesh();
    void def;
  }

  /** v0.55: right-click an item frame — insert the held item, rotate the
   *  displayed item a quarter turn (MC), or take it back with an empty hand
   *  (friendlier than MC's break-only retrieval; frame itself never drops here) */
  private useItemFrame(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    const stored = frameItem(meta);
    const held = this.player.hotbar[this.player.selected];
    const holding = !!(held && held.count > 0 && held.blockId !== 0);
    if (stored && !holding) {
      // empty hand → retrieve the displayed item
      this.world.setMeta(x, y, z, packFrameMeta(frameWall(meta), 0, 0));
      const left = this.addToInventory(stored, 1);
      if (left > 0) this.drops.spawn(stored, x + 0.5, y + 0.4, z + 0.5, left);
      audio.pop();
      this.placeCooldown = 0.25;
      this.startSwing();
      this.syncHUD();
      return;
    }
    if (stored && holding) {
      // holding anything → rotate the item a quarter turn
      const rot = (frameRot(meta) + 1) & 3;
      this.world.setMeta(x, y, z, packFrameMeta(frameWall(meta), rot, stored));
      audio.click();
      this.placeCooldown = 0.25;
      this.startSwing();
      return;
    }
    if (!stored && holding) {
      // empty frame → insert one of the held item/block
      const put = held.blockId;
      held.count--;
      if (held.count <= 0) { held.blockId = 0; held.count = 0; }
      this.world.setMeta(x, y, z, packFrameMeta(frameWall(meta), 0, put));
      audio.place('wood');
      this.placeCooldown = 0.25;
      this.startSwing();
      this.syncHUD();
      this.updateHandMesh();
    }
  }

  /** v0.55: right-click a flower pot with an empty hand (retrieve) or a
   *  pottable plant (plant/swap — MC replaces and hands back the old plant).
   *  Non-pottable items fall through to normal placement (caller gates this). */
  private useFlowerPot(x: number, y: number, z: number): void {
    const cur = this.world.getMeta(x, y, z);
    const held = this.player.hotbar[this.player.selected];
    const holding = !!(held && held.count > 0 && held.blockId !== 0 && isPottable(held.blockId));
    if (cur && !holding) {
      this.world.setMeta(x, y, z, 0);
      const left = this.addToInventory(cur, 1);
      if (left > 0) this.drops.spawn(cur, x + 0.5, y + 0.5, z + 0.5, left);
      audio.pop();
      this.placeCooldown = 0.25;
      this.startSwing();
      this.syncHUD();
      return;
    }
    if (holding) {
      const plant = held.blockId;
      held.count--;
      if (held.count <= 0) { held.blockId = 0; held.count = 0; }
      this.world.setMeta(x, y, z, plant);
      if (cur) {
        const left = this.addToInventory(cur, 1);
        if (left > 0) this.drops.spawn(cur, x + 0.5, y + 0.5, z + 0.5, left);
      }
      audio.place('grass');
      this.placeCooldown = 0.25;
      this.startSwing();
      this.syncHUD();
      this.updateHandMesh();
    }
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
  private openContainer(kind: 'furnace' | 'chest' | 'brewing', x: number, y: number, z: number): void {
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

  /** right-click a door: swing both halves open/closed (MC). Closing is denied
   *  while the player stands in the doorway (MC leaves the door open too). */
  private toggleDoor(x: number, y: number, z: number, _id: number): void {
    const meta = this.world.getMeta(x, y, z);
    const upper = doorUpper(meta);
    const ly = upper ? y - 1 : y;
    const uy = upper ? y : y + 1;
    const lowerId = this.world.getBlock(x, ly, z);
    const upperId = this.world.getBlock(x, uy, z);
    if (!isDoorId(lowerId) || !isDoorId(upperId)) return;
    const opening = !isDoorOpenId(lowerId);
    if (!opening && (aabbIntersectsBlock(this.player.entity, x, ly, z) || aabbIntersectsBlock(this.player.entity, x, uy, z))) return;
    const closed = doorClosedId(lowerId);
    const open = doorOpenIdOf(closed);
    this.world.setBlock(x, ly, z, opening ? open : closed);
    this.world.setBlock(x, uy, z, opening ? open : closed);
    audio.click();
    this.placeCooldown = 0.25;
    this.startSwing();
  }

  /** right-click a trapdoor: swing open/closed (single cell). Closing is denied
   *  only when the player's body dips into the 3/16 slab band (standing ON a
   *  closed trapdoor is fine — the panel just closes beneath the feet). */
  private toggleTrapdoor(x: number, y: number, z: number, _id: number): void {
    const id = this.world.getBlock(x, y, z);
    const opening = !isTrapdoorOpenId(id);
    if (!opening) {
      const p = this.player.entity;
      const half = p.width / 2;
      // feet genuinely INSIDE the 3/16 slab (not resting on top of it — MC
      // lets the panel close beneath feet standing on the trapdoor)
      const inBand = p.y < y + 0.16 && p.y + p.height > y;
      const inXZ = p.x + half > x && p.x - half < x + 1 && p.z + half > z && p.z - half < z + 1;
      if (inBand && inXZ) return;
    }
    const closed = trapdoorClosedId(id);
    const open = trapdoorOpenIdOf(closed);
    this.world.setBlock(x, y, z, opening ? open : closed);
    audio.click();
    this.placeCooldown = 0.25;
    this.startSwing();
  }

  /** right-click a fence gate: swing open/closed. Closing is denied while the
   *  player stands in the gate cell (same rule as doors). */
  private toggleGate(x: number, y: number, z: number, _id: number): void {
    const id = this.world.getBlock(x, y, z);
    const opening = !isGateOpenId(id);
    if (!opening && aabbIntersectsBlock(this.player.entity, x, y, z)) return;
    const closed = gateClosedId(id);
    const open = gateOpenIdOf(closed);
    this.world.setBlock(x, y, z, opening ? open : closed);
    audio.click();
    this.placeCooldown = 0.25;
    this.startSwing();
  }

  /** after removing a block: break its paired half (bed/door), pop wall torches
   *  that were mounted on its side faces. Survival mode also drops one torch
   *  per popped mount. The pair item itself drops exactly once — from the cell
   *  the player actually broke (generic def.drop path). */
  private cleanupDependents(x: number, y: number, z: number, brokenId: number, brokenMeta: number, survival: boolean): void {
    if (brokenId === BLOCK.BED) {
      const head = bedHead(brokenMeta);
      const [dx, dz] = facingDir(brokenMeta);
      const px = head ? x - dx : x + dx;
      const pz = head ? z - dz : z + dz;
      if (this.world.getBlock(px, y, pz) === BLOCK.BED) {
        this.world.setBlock(px, y, pz, BLOCK.AIR); // partner vanishes silently
      }
    }
    if (isDoorId(brokenId)) {
      const upper = doorUpper(brokenMeta);
      const py = upper ? y - 1 : y + 1;
      if (isDoorId(this.world.getBlock(x, py, z))) {
        this.world.setBlock(x, py, z, BLOCK.AIR);
      }
    }
    // v0.53: ladders hanging on the removed block's side faces pop off
    const sideCells: [number, number, number][] = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
    for (const [ax, ay, az] of sideCells) {
      const nid = this.world.getBlock(ax, ay, az);
      if (isLadderId(nid)) {
        // ladder meta uses TORCH_WALL_* numbering: the wall is on that side
        const want = (ax === x + 1) ? TORCH_WALL_NX : (ax === x - 1) ? TORCH_WALL_PX : (az === z + 1) ? TORCH_WALL_NZ : TORCH_WALL_PZ;
        if (this.world.getMeta(ax, ay, az) === want) {
          this.world.setBlock(ax, ay, az, BLOCK.AIR);
          if (survival) this.drops.spawn(BLOCK.LADDER, ax + 0.5, ay + 0.3, az + 0.5, 1);
        }
      } else if (isTrapdoorId(nid)) {
        // trapdoor meta 0..3 = attach edge direction (0=+X, 1=-X, 2=+Z, 3=-Z);
        // meta 5 (ceiling mount) and vertical pop loop handle the rest
        const m = this.world.getMeta(ax, ay, az);
        const want = (ax === x + 1) ? 1 : (ax === x - 1) ? 0 : (az === z + 1) ? 3 : 2;
        if (m < 5 && (m & 3) === want) {
          this.world.setBlock(ax, ay, az, BLOCK.AIR);
          if (survival) this.drops.spawn(trapdoorClosedId(nid), ax + 0.5, ay + 0.3, az + 0.5, 1);
        }
      } else if (nid === BLOCK.ITEM_FRAME) {
        // v0.55: wall-mounted frames pop with their wall (frameWall() uses
        // TORCH_WALL_* numbering — the wall is on the frame cell's side
        // toward the broken block). Stored item spills with it.
        const wantWall = (ax === x + 1) ? TORCH_WALL_NX : (ax === x - 1) ? TORCH_WALL_PX : (az === z + 1) ? TORCH_WALL_NZ : TORCH_WALL_PZ;
        const fm = this.world.getMeta(ax, ay, az);
        if (frameWall(fm) === wantWall) {
          const stored = frameItem(fm);
          this.world.setBlock(ax, ay, az, BLOCK.AIR);
          if (survival) {
            this.drops.spawn(BLOCK.ITEM_FRAME, ax + 0.5, ay + 0.3, az + 0.5, 1);
            if (stored) this.drops.spawn(stored, ax + 0.5, ay + 0.4, az + 0.5, 1);
          }
        }
      }
    }
    // wall torches mounted on the removed block's four side faces
    const sides: [number, number, number, number][] = [
      [x + 1, y, z, TORCH_WALL_NX], // torch east of us, wall on its -X side
      [x - 1, y, z, TORCH_WALL_PX],
      [x, y, z + 1, TORCH_WALL_NZ],
      [x, y, z - 1, TORCH_WALL_PZ],
    ];
    for (const [tx, ty, tz, want] of sides) {
      if (this.world.getBlock(tx, ty, tz) === BLOCK.TORCH && this.world.getMeta(tx, ty, tz) === want) {
        this.world.setBlock(tx, ty, tz, BLOCK.AIR);
        if (survival) this.drops.spawn(BLOCK.TORCH, tx + 0.5, ty + 0.3, tz + 0.5, 1);
      }
    }
  }

  /** right-click on bed: set spawn + skip night */
  private sleepInBed(x: number, y: number, z: number): void {
    this.spawnPoint = { x: x + 0.5, y: y + 0.6, z: z + 0.5 };
    if (this.mobs) this.mobs.spawnGuard = { x: this.spawnPoint.x, z: this.spawnPoint.z, r: 20 };
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
    const pickupCount = stack.count; // captured before mutation (toast shows the real amount)
    const leftover = this.addToInventory(stack.blockId, stack.count);
    if (leftover < stack.count) {
      audio.pop();
      this.syncHUD();
      this.syncInventory();
      const name = isItemId(stack.blockId)
        ? (getItemDef(stack.blockId)?.name ?? 'Item')
        : (getBlockDef(stack.blockId)?.name ?? 'Block');
      this.showToast(name + ' ×' + pickupCount);
      // achievements on pickup
      if (stack.blockId === BLOCK.LOG || stack.blockId === BLOCK.SPRUCE_LOG || stack.blockId === BLOCK.JUNGLE_LOG) this.achievements.unlock('getWood');
      if (stack.blockId === ITEM.IRON_INGOT) this.achievements.unlock('acquireHardware');
      if (stack.blockId === ITEM.DIAMOND) this.achievements.unlock('diamonds');
      if (stack.blockId === ITEM.LEATHER) this.achievements.unlock('cowTipper');
      if (stack.blockId === ITEM.STEAK) this.achievements.unlock('ironBelly');
      if (stack.blockId === ITEM.RAW_COD || stack.blockId === ITEM.RAW_SALMON) this.achievements.unlock('fisherman');
    }
    if (leftover === stack.count) return false;
    stack.count = leftover;
    return leftover === 0;
  }

  /** add to hotbar first, then main inventory. Returns leftover count. */
  private addToInventory(id: number, count: number, dur?: number, ench?: Record<string, number>): number {
    let left = addToSlots(this.player.hotbar, id, count, dur, ench);
    if (left > 0) left = addToSlots(this.player.main, id, left, dur, ench);
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

  /**
   * Recipe book auto-fill: lay a recipe's pattern into the crafting grid,
   * pulling the ingredients from the inventory (vanilla recipe-book behavior).
   * Current grid contents are returned to the inventory first. Returns the
   * outcome (UI toasts are handled here).
   */
  recipeFill(recipeIdx: number): 'ok' | 'missing' | 'table' | 'closed' {
    const st = useGameStore.getState();
    if (!st.inv.open || st.inv.creative || st.inv.container !== 'none') { this.showToast('Open a crafting grid first'); return 'closed'; }
    const recipe = RECIPES[recipeIdx];
    if (!recipe) return 'closed';
    if (needsTable(recipe) && !this.invTable) {
      this.showToast('Requires a Crafting Table (3×3)');
      return 'table';
    }

    // target pattern in grid coordinates (2x2 or 3x3, anchored top-left)
    const size = this.invTable ? 3 : 2;
    const pattern: number[] = new Array(size * size).fill(0);
    if (recipe.kind === 'shaped') {
      for (let r = 0; r < recipe.h; r++)
        for (let c = 0; c < recipe.w; c++)
          pattern[r * size + c] = recipe.cells[r * recipe.w + c] ?? 0;
    } else {
      recipe.ids.forEach((id, i) => { pattern[i] = id; });
    }

    // return whatever is in the grid back to the inventory (like closing it)
    for (const s of this.craftGrid) {
      if (isEmptySlot(s)) continue;
      this.addToInventory(s.blockId, s.count, s.dur);
      s.blockId = 0; s.count = 0; s.dur = undefined;
    }
    this.craftOut = null;

    // availability check across hotbar + main
    const have = new Map<number, number>();
    for (const s of [...this.player.hotbar, ...this.player.main]) {
      if (s && s.blockId > 0) have.set(s.blockId, (have.get(s.blockId) ?? 0) + s.count);
    }
    for (const id of pattern) {
      if (id > 0 && (have.get(id) ?? 0) < pattern.filter((v) => v === id).length) {
        this.showToast(`Missing ${this.itemLabel(id)}`);
        return 'missing';
      }
    }

    // place one ingredient per pattern cell (hotbar first, like vanilla)
    for (let i = 0; i < pattern.length; i++) {
      const id = pattern[i];
      if (id <= 0) continue;
      let taken = false;
      for (const list of [this.player.hotbar, this.player.main]) {
        const s = list.find((sl) => sl && sl.blockId === id && sl.count > 0);
        if (s) {
          s.count--;
          if (s.count === 0) { s.blockId = 0; s.dur = undefined; }
          taken = true;
          break;
        }
      }
      if (!taken) return 'missing';
      const cell = this.craftGrid[i];
      cell.blockId = id; cell.count = 1; cell.dur = undefined;
    }

    this.updateCraftOut();
    audio.click();
    this.syncInventory(true);
    this.syncHUD(true);
    return 'ok';
  }

  // ── cheats (Creator Tools → Cheats): fast testing hooks ─────────────────────
  /** cheat: give items straight into the inventory (works in any mode) */
  cheatGive(id: number, count: number): void {
    const left = this.addToInventory(id, count, freshDur(id));
    audio.pop();
    this.syncHUD(true);
    this.syncInventory(true);
    this.updateHandMesh();
    const given = count - left;
    this.showToast(given > 0 ? `+${given} × ${itemLabel(id)}` : 'Inventory full!');
  }

  /** cheat: restore every tool/armor/bow in hotbar + main + armor to full durability */
  cheatRepairAll(): void {
    let n = 0;
    const fix = (s: { blockId: number; dur?: number }): void => {
      const d = freshDur(s.blockId);
      if (d !== undefined && s.dur !== undefined && s.dur < d) { s.dur = d; n++; }
    };
    for (const s of this.player.hotbar) fix(s);
    for (const s of this.player.main) fix(s);
    for (const s of this.player.armor) if (s) fix(s);
    this.syncHUD(true);
    this.syncInventory(true);
    this.showToast(n > 0 ? `Repaired ${n} item${n > 1 ? 's' : ''}` : 'Nothing to repair');
  }

  /** cheat: instantly mine blocks in survival (Creator Tools toggle) */
  instantBreak = false;

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
      } else if (be.kind === 'brewing') {
        // brewing: 0 = ingredient, 1 = fuel, 2..4 = bottle slots
        const list = [be.ing, be.fuel, be.b[0], be.b[1], be.b[2]];
        if (idx < 0 || idx >= 5) return;
        if (shift) this.shiftFromContainer(list, idx);
        else this.clickSlot(list, idx, button);
        be.ing = list[0];
        be.fuel = list[1];
        be.b[0] = list[2]; be.b[1] = list[3]; be.b[2] = list[4];
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
    let left = addToSlots(this.player.hotbar, slot.blockId, slot.count, slot.dur, slot.ench);
    if (left > 0) left = addToSlots(this.player.main, slot.blockId, left, slot.dur, slot.ench);
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
      left = addToSlots(this.player.main, slot.blockId, slot.count, slot.dur, slot.ench);
    } else {
      // main/craft -> hotbar first, then main (craft items go home)
      left = addToSlots(this.player.hotbar, slot.blockId, slot.count, slot.dur, slot.ench);
      if (left > 0 && area === 'main') left = addToSlots(this.player.main, slot.blockId, left, slot.dur, slot.ench);
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
    this.craftOutBy = res?.by ?? null;
  }

  /** byproducts of the current craft output (cake → 3 empty buckets back) */
  private craftOutBy: { id: number; count: number }[] | null = null;

  /** grant a recipe's byproducts (cake returns the 3 empty milk buckets) */
  private giveByproducts(by: { id: number; count: number }[] | null | undefined): void {
    if (!by) return;
    const p = this.player.entity;
    for (const b of by) {
      const left = this.addToInventory(b.id, b.count);
      if (left > 0) this.drops.spawn(b.id, p.x, p.y + 1, p.z, left);
    }
    audio.pop();
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
      const by = this.craftOutBy;
      if (!this.cursor) {
        this.cursor = { ...out };
        this.onCrafted(out.blockId);
        consume();
        this.giveByproducts(by);
      } else if (this.cursor.blockId === out.blockId && !isToolItem(out.blockId) && this.cursor.count + out.count <= maxStack(out.blockId)) {
        this.cursor.count += out.count;
        this.onCrafted(out.blockId);
        consume();
        this.giveByproducts(by);
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
        this.giveByproducts(res.by);
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
    if (id === ITEM.BREAD) this.achievements.unlock('bakeBread');
    if (id === BLOCK.BREWING_STAND) this.achievements.unlock('localBrewery');
    if (id === BLOCK.CAKE) this.achievements.unlock('theLie');
  }

  /** consume durability from held tool; breaks it at 0 (creative: no wear) */
  private damageTool(n: number): void {
    if (this.player.isCreative) return;
    const slot = this.player.hotbar[this.player.selected];
    if (!slot || slot.count <= 0 || !isItemId(slot.blockId)) return;
    const tool = getToolDef(slot.blockId);
    if (!tool) return;
    // Unbreaking: the wear tick is ignored with MC's keep chance
    if (unbreakingKeep(slot.ench?.unbreaking ?? 0)) return;
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
      if (be) containerSlots = be.kind === 'chest' ? be.slots : be.kind === 'brewing' ? [be.ing, be.fuel, ...be.b] : [be.input, be.fuel, be.output];
    }
    const hash = JSON.stringify([this.player.hotbar, this.player.main, this.player.armor, grid, this.craftOut, this.cursor, containerSlots, this.furnaceRatios(), this.brewingRatios()]);
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
      brewing: this.brewingRatios(),
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

  private brewingRatios(): { brew: number; fuel: number } | null {
    if (!this.containerKey) return null;
    const [xs, ys, zs] = this.containerKey.split(',').map(Number);
    const be = this.blockEnts.get(+xs, +ys, +zs);
    if (!be || be.kind !== 'brewing') return null;
    return {
      brew: Math.max(0, Math.min(1, be.cookT / BREW_TIME)),
      fuel: Math.max(0, Math.min(1, be.fuelUses / 20)),
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
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      // enchanted held item: purple glint tint (matches the slot glint)
      if (slot?.ench && Object.keys(slot.ench).length > 0) mat.color.setRGB(0.85, 0.5, 1.35);
      this.handMesh = new THREE.Mesh(geo, mat);
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
      // boat rider pose: seated legs (swing anim would override)
      if (this.ridingBoat) {
        for (const leg of this.playerModel.legs) leg.rotation.x = -1.35;
      }
      // sync armor overlays (hashed inside — cheap per frame)
      const armorIds = p.armor.map((a) => (a && a.count > 0 ? a.blockId : null)) as (number | null)[];
      setPlayerModelArmor(this.playerModel, armorIds);
      // world-light shading on the 3rd-person model (playerLightF updated in
      // frameUpdate; base colors cached so armor tier tints are preserved)
      {
        const f = this.playerLightF;
        this.playerModel.group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mm of mats) {
            const lam = mm as THREE.MeshLambertMaterial;
            if (!(lam as unknown as { isMeshLambertMaterial?: boolean }).isMeshLambertMaterial) continue;
            let base = this.playerModelBaseMats.get(lam);
            if (!base) {
              base = lam.color.clone();
              this.playerModelBaseMats.set(lam, base);
            }
            lam.color.copy(base).multiplyScalar(f);
          }
        });
      }
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
              this.gfx.onChunkMeshed(chunk, this.world);
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
          this.gfx.onChunkUnloaded(cx, cz); // drop frame display sprites with the chunk
        }
      }
    }
  }

  // ── HUD sync ───────────────────────────────────────────────────────────────
  private lastHudHealth = -1;
  private lastHudHunger = -1;
  private lastHotbarHash = '';
  private lastHudEffects = '';
  /** smoothed Night Vision shader strength (0..1) */
  private nvF = 0;
  /** Regeneration potion heal accumulator */
  private regenTimer = 0;

  /** potion status effect tick (phase 13): durations, per-frame modifiers */
  private tickEffects(dt: number): void {
    const p = this.player;
    for (let i = p.effects.length - 1; i >= 0; i--) {
      p.effects[i].t -= dt;
      if (p.effects[i].t <= 0) p.effects.splice(i, 1);
    }
    p.jumpMultiplier = (() => {
      const j = p.effects.find((e) => e.k === 'jump');
      if (!j) return 1;
      return j.amp !== undefined && j.amp >= 2 ? 1.7 : 1.35;
    })();
    p.breathing = p.effects.some((e) => e.k === 'water_breathing');
    // Regeneration: +1 hp / 2s (1s at tier-2), independent of hunger (MC regen)
    const regen = p.effects.find((e) => e.k === 'regen');
    if (regen && p.health < p.maxHealth && !p.dead) {
      this.regenTimer += dt;
      if (this.regenTimer >= (regen.amp !== undefined && regen.amp >= 2 ? 1 : 2)) {
        this.regenTimer = 0;
        p.heal(1);
      }
    } else {
      this.regenTimer = 0;
    }
    // night vision: smooth the shader uniform for a gentle ramp in/out
    const nvTarget = p.effects.some((e) => e.k === 'night_vision') ? 1 : 0;
    this.nvF += (nvTarget - this.nvF) * Math.min(1, dt * 3);
    if (this.nvF < 0.004) this.nvF = 0;
  }

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
    // air/bubbles bar (only while the air isn't full, like MC shows bubbles only underwater)
    const airBubbles = Math.min(10, Math.ceil(this.player.air / 1.5));
    if (this.player.air < PLAYER_AIR_MAX - 0.01) {
      if (store.hud.air !== airBubbles || force) {
        store.setHud({ air: airBubbles });
      }
    } else if (store.hud.air !== 10) {
      store.setHud({ air: 10 });
    }
    // potion effect chips (whole-second hash → updates once per second;
    // amplifier tier is part of the hash + payload so II chips render)
    const poisonActive = this.player.poisonT > 0;
    const effHash = this.player.effects.map((e) => e.k + (e.amp !== undefined && e.amp > 1 ? '2' : '') + ':' + Math.ceil(e.t)).join(',') + (poisonActive ? '|poison:' + Math.ceil(this.player.poisonT) : '');
    if (effHash !== this.lastHudEffects || force) {
      this.lastHudEffects = effHash;
      const effs = this.player.effects.map((e) => ({ k: e.k, seconds: Math.ceil(e.t), amp: e.amp }));
      if (poisonActive) effs.push({ k: 'poison', seconds: Math.ceil(this.player.poisonT), amp: this.player.poisonAmp > 1 ? this.player.poisonAmp : undefined });
      store.setHud({ effects: effs });
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
        const [fn, ff] = this.hazeFogParams();
        this.sky.update(0, this.camera, this.scene, fn, ff);
        this.applySkyFog();
        this.gfx.update(0, this.camera, this.sky, this.player.x, this.player.y, this.player.z, false);
      }
    }

    this.gfx.render(dt);

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

    // ── boat riding: rowing input drives the boat, the player rides along ──
    if (this.ridingBoat) {
      if (wishSneak) {
        this.dismountBoat();
      } else {
        const b = this.ridingBoat;
        this.boats.update(step, this.sky?.sunLevel ?? 1, b, { forward, strafe });
        // rider follows the boat (seat slightly above the hull base)
        p.entity.x = b.x;
        p.entity.y = b.y + 0.18;
        p.entity.z = b.z;
        p.entity.vx = b.vx; p.entity.vy = b.vy; p.entity.vz = b.vz;
        p.entity.onGround = false;
        p.entity.inWater = b.inWater;
        if (p.stepDistance !== undefined) p.stepDistance = 0;
      }
    } else if (!this.ridingBoat) {
      p.moveInput({ forward, strafe }, this.world, step, wishJump, wishSneak);
    }

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

    // drowning: air drains while the head is submerged (vanilla 15s → 2 dmg/s)
    if (!p.dead) {
      const headIn = isWaterId(this.world.getBlock(Math.floor(p.x), Math.floor(p.eyeY()), Math.floor(p.z)));
      p.updateAir(step, headIn);
    }

    // death
    if (p.dead) {
      if (this.ridingBoat) this.dismountBoat();
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
    // speed compose: bow draw slowdown × Speed potion (phase 13; tier-2 = 1.4×)
    const speedEff = p.effects.find((e) => e.k === 'speed');
    p.speedMultiplier = (this.bowCharging ? 0.5 : 1) * (speedEff ? (speedEff.amp !== undefined && speedEff.amp >= 2 ? 1.4 : 1.25) : 1);
    // sprint FOV kick (MC-like): smoothly widen when sprinting
    const sprintingNow = p.sprinting && Math.hypot(p.entity.vx, p.entity.vz) > 3.2;
    this.sprintFov += ((sprintingNow ? 7 : 0) - this.sprintFov) * Math.min(1, dt * 9);
    p.applyCamera(this.settings.fov + this.sprintFov + (this.bowCharging ? -10 * this.bowCharge : 0), 8, dt);

    // player world-light factor (shared by 3rd-person model + held item):
    // local voxel light NORMALIZED by the sun factor (see mobs.ts — the raw
    // value double-darkened at night on top of the scene lights)
    if (this.world && this.sky) {
      const lb = this.world.getLightForMesh(Math.floor(p.x), Math.floor(p.y + 1.4), Math.floor(p.z));
      const local = Math.max((lb & 15) / 15, ((lb >> 4) / 15) * this.sky.sunLevel);
      // v0.48: normalize by the NEW night floor (0.10, was the old 0.30 era
      // constant) — the held item/arm stays readable in torch pools and dims
      // to moonlit levels outdoors, without collapsing to black
      const target = Math.max(0.1, Math.min(1, local / Math.max(this.sky.sunLevel, 0.10)));
      this.playerLightF += (target - this.playerLightF) * Math.min(1, dt * 6);
    }

    // held item / arm obeys world light (base color cached on the material)
    if (this.handMesh) {
      const mat = this.handMesh.material as THREE.MeshLambertMaterial;
      const ud = mat.userData as { baseC?: THREE.Color };
      if (!ud.baseC) ud.baseC = mat.color.clone();
      mat.color.copy(ud.baseC).multiplyScalar(this.playerLightF);
    }

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
    this.creativeBreakCd -= dt;
    this.eatCooldown -= dt;
    this.splashThrowCd -= dt;

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

    // poison (witch splash potions): 1 damage every 1.5s (0.75s at amp II), never lethal
    if (p.poisonT > 0) {
      p.poisonT -= dt;
      p.poisonTickT -= dt;
      if (p.poisonTickT <= 0) {
        p.poisonTickT = 1.5 / Math.max(1, p.poisonAmp);
        if (p.health > 2) {
          p.damage(1);
          audio.hurt();
        }
      }
      if (p.poisonT <= 0) {
        p.poisonTickT = 0;
        p.poisonAmp = 0;
      }
    }

    // potion status effects (phase 13): tick down, apply per-frame modifiers
    this.tickEffects(dt);

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
    // fishing bobber physics + bite timing
    this.updateFishing(dt);
    // primed TNT fuses + explosions
    this.updatePrimedTnt(dt);
    // lightning bolt visuals (thunderstorm)
    this.updateLightning(dt);
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
      // crop & sapling sweep: deterministic pass over all columns near the player
      // (random sampling almost never hits real farm plots; MC uses random ticks)
      const baseX = Math.floor(px2), baseY = Math.floor(py2), baseZ = Math.floor(pz2);
      const R = 15;
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          const bx = baseX + dx, bz = baseZ + dz;
          for (let by = baseY - 8; by <= baseY + 10; by++) {
            const id = this.world.getBlock(bx, by, bz);
            if (isWheatCrop(id) && id < BLOCK.WHEAT_STAGE3) {
              const below = this.world.getBlock(bx, by - 1, bz);
              const hydrated = below === BLOCK.FARMLAND ? this.hasAdjacentWater(bx, by - 1, bz) : false;
              if (Math.random() < (hydrated ? 0.5 : 0.22)) this.world.setBlock(bx, by, bz, nextWheatStage(id));
            } else if (isSapling(id) && Math.random() < 0.2) {
              this.growSaplingTree(bx, by, bz, id);
            }
          }
        }
    }
    this.furnaceSyncTimer += dt;
    if (this.furnaceSyncTimer > 0.3) {
      this.furnaceSyncTimer = 0;
      const iv = useGameStore.getState().inv;
      if (iv.open && (iv.container === 'furnace' || iv.container === 'brewing')) {
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
    this.drops.update(dt, p.entity, this.sky?.sunLevel ?? 1, (stack) => this.tryPickup(stack));
    this.particles.update(dt);

    // XP orbs
    this.xpOrbs.update(dt, p.entity, (value) => this.addXP(value));

    // boats drift/update when the player is not riding (riding updates in physicsStep)
    if (!this.ridingBoat) {
      this.boats.update(dt, this.sky?.sunLevel ?? 1, null, { forward: 0, strafe: 0 });
    }

    // mobs
    if (this.mobs) {
      const eyeY = p.eyeY();
      const fwd = p.forwardVector();
      this.mobCb = {
        damagePlayer: (amount, fx, fz) => {
          if (amount <= 0 || p.isCreative) return p.health; // creative: hostiles can't touch you
          p.damage(amount);
          audio.hurt();
          // knockback away from source
          const kx = p.x - fx;
          const kz = p.z - fz;
          const len = Math.hypot(kx, kz) || 1;
          p.entity.vx += (kx / len) * 6.5;
          p.entity.vz += (kz / len) * 6.5;
          p.entity.vy = Math.max(p.entity.vy, 4.2);
          return p.health; // remaining hp (0 = the hit was lethal)
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
        playerDead: p.dead,
        poisonPlayer: (seconds) => {
          if (p.isCreative || p.dead) return;
          p.poisonT = Math.max(p.poisonT, seconds);
        },
        // player splash potions: apply a status effect to the player caught in
        // the splash (movement buffs work in creative too — damage ticks no-op)
        applyEffect: (k, seconds, amp) => {
          if (p.dead) return;
          const cur = p.effects.find((e) => e.k === k);
          if (cur) {
            cur.t = Math.max(cur.t, seconds);
            cur.amp = Math.max(cur.amp ?? 1, amp ?? 1);
          } else p.effects.push({ k, t: seconds, amp: amp !== undefined && amp > 1 ? amp : undefined });
        },
        // player splash healing: Instant Health caught in the splash
        healPlayer: (n) => {
          if (!p.dead) p.heal(n);
        },
        igniteTnt: (tx, ty, tz) => this.igniteTNT(tx, ty, tz, 0.25 + Math.random() * 0.7),
        killByPlayer: (dist) => {
          if (dist >= 12) this.achievements.unlock('sniperDuel');
        },
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
    const [fogNear, fogFar] = this.hazeFogParams();
    this.sky.update(dt, this.camera, this.scene, fogNear, fogFar);
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

    // graphics pack: sky dome, clouds, water sun, shadow follow, postfx uniforms
    this.gfx.update(dt, this.camera, this.sky, this.player.x, this.player.y, this.player.z, underwater,
      this.weather ? (this.weather.raining ? this.weather.intensity : 0) : 0);

    this.syncHUD();
  }

  /** v0.49 — haze-scaled fog distances. The old hardcoded (60,130) made every
   *  view "matte" (user report: midnight haze + worst at sunrise when the fog
   *  color warms up). The haze slider stretches BOTH fog distances: 0% pushes
   *  fog far beyond the camera far plane (= off), 100% = the old tuned look,
   *  150% = thick. Weather adds up to +40% unless the slider is at 0. */
  private hazeFogParams(): [number, number] {
    const user = Math.min(1.5, Math.max(0, this.settings?.gfx?.haze ?? 1));
    const storm = this.sky?.weatherDarkness ?? 0;
    const h = user * (1 + storm * 0.4);
    const inv = 1 / Math.max(h, 0.03); // 0% → near 2000 / far 4333 → invisible
    return [60 * inv, 130 * inv];
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
      // Night Vision potion: lift the light floor inside the voxel shader
      if ('uNV' in m.uniforms) m.uniforms.uNV.value = this.nvF;
      if (underwater) {
        // v0.50: murk follows the daylight — midnight water used to swim in
        // the same bright blue fog as noon (graphics-audit finding). Noon is
        // unchanged; night dims toward the same moon-dim blue as the sky.
        const wl = 0.25 + 0.75 * this.sky.sunLevel;
        m.uniforms.uFogColor.value.setRGB(0.09 * wl, 0.24 * wl, 0.55 * wl);
        m.uniforms.uFogNear.value = 4;
        m.uniforms.uFogFar.value = 26;
      } else if (fog) {
        (m.uniforms.uFogColor.value as THREE.Color).copy(fog.color);
        m.uniforms.uFogNear.value = fog.near;
        m.uniforms.uFogFar.value = fog.far;
      }
    }
    // grass tufts share the Night Vision lift (separate material from the voxel one)
    if (this.gfx && this.gfx.grass) this.gfx.grass.nvValue = this.nvF;
    // item-frame display sprites get the same NV floor (ambient handled in gfx.update)
    if (this.gfx && this.gfx.frames) this.gfx.frames.nvLift = this.nvF;
    // entity lights follow sun
    // v0.48: lower ambient/directional floors — scene-lit entities (mobs,
    // drops, boats) follow the darker night instead of the old "dim day".
    // Daytime output is unchanged (1.0 / 0.95); midnight drops to 0.20 / 0.13
    // so silhouettes read at the edge of torch pools — survival fear factor.
    // v0.50 (graphics audit): entity light COLOR + DIRECTION now follow the
    // active source as well — mobs used to be lit white-noon at every hour
    // while the terrain around them went warm at sunset / cold blue at night.
    // The direction also used to be forced "up" at night; it now points at
    // the actual moon, matching the terrain's shadow-map light.
    this.ambient.intensity = 0.12 + this.sky.sunLevel * 0.88;
    this.sunLight.intensity = 0.05 + this.sky.sunLevel * 0.9;
    const gfxCol = this.gfx?.lastSunColor;
    if (gfxCol) {
      this.sunLight.color.copy(gfxCol);
      const lum = gfxCol.r * 0.299 + gfxCol.g * 0.587 + gfxCol.b * 0.114;
      const nightW = THREE.MathUtils.clamp((0.5 - lum) / 0.42, 0, 1);
      this.ambient.color.setRGB(1, 1, 1).lerp(this.nightSkyAmb, nightW);
      this.ambient.groundColor.copy(this.dayGroundAmb).lerp(this.nightGroundAmb, nightW);
    }
    const ld = this.gfx?.lastLightDir;
    if (ld) {
      this.sunLight.position.set(ld.x, Math.max(0.12, ld.y), ld.z).normalize().multiplyScalar(50);
    } else {
      const angle = ((this.sky.time / DAY_LENGTH) - 0.25) * Math.PI * 2;
      this.sunLight.position.set(Math.cos(angle), Math.max(0.2, Math.sin(angle)), 0.3).normalize().multiplyScalar(50);
    }
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
    if (this.sky) this.sky.cloudsEnabled = s.clouds && !s.gfx.volumetricClouds;
    if (this.world) this.gfx.applySettings(s);
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
    this.gfx.dispose();
    this.clearLightningBolts();
    this.drops?.clear();
    this.mobs?.clear();
    this.boats?.clear();
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
