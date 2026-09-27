// ─── Game engine: orchestrates renderer, world, player, UI bridge ────────────
import * as THREE from 'three';
import { World } from './world/world';
import { Player, type HotbarSlot } from './player';
import { BLOCK, getBlockDef, isLiquid } from './blocks';
import { chunkKey, CHUNK_SIZE, WORLD_HEIGHT, DAY_LENGTH } from './constants';
import { raycast, aabbIntersectsBlock, type RayHit } from './physics';
import { DropManager, type ItemStack, createBlockGeometry } from './entities/drops';
import { MobManager } from './entities/mobs';
import { getItemDef, isItemId, getToolDef, maxStack, breakInfo, isToolItem } from './items';
import { matchRecipe, freshDur } from './crafting';
import { addToSlots, isEmptySlot, emptySlot, cloneSlots } from './inventory';
import { ParticleSystem } from './particles';
import { SkySystem, getTimeLabel } from './sky';
import { audio, type MaterialSound } from './audio';
import { getAtlas, getCrackTextures, tileAvgColor } from './textures/atlas';
import { getItemIconCanvas } from './items';
import { useGameStore } from './state';

const SAVE_KEY = 'voxelcraft.save';

interface SaveData {
  seed: number;
  time: number;
  player: { x: number; y: number; z: number; yaw: number; pitch: number; health: number; hotbar: HotbarSlot[]; main?: HotbarSlot[]; selected: number };
  edits: Record<string, Record<number, number>>;
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
  particles!: ParticleSystem;
  sky!: SkySystem;

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

  // inventory / crafting
  private craft2: HotbarSlot[] = Array.from({ length: 4 }, () => ({ blockId: 0, count: 0 }));
  private craft9: HotbarSlot[] = Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 }));
  private craftOut: HotbarSlot | null = null;
  private cursor: HotbarSlot | null = null;
  private invTable = false;
  private invHover: { area: 'hotbar' | 'main' | 'craft'; idx: number } | null = null;
  private lastInvHash = '';

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
      this.sky.cloudsEnabled = this.settings.clouds;
    });

    this.bindEvents();

    // QA/debug handle (used by automated testing)
    (window as unknown as { __voxel?: Game }).__voxel = this;
  }

  // ── game start / save / load ───────────────────────────────────────────────
  async newGame(): Promise<void> {
    const seed = Math.floor(Math.random() * 2147483647);
    this.setupWorld(seed, null);
    await this.preloadSpawn();
    localStorage.removeItem(SAVE_KEY);
    useGameStore.getState().setHasSave(false);
    this.enterPlaying();
  }

  async continueGame(): Promise<void> {
    const raw = localStorage.getItem(SAVE_KEY);
    const save: SaveData | null = raw ? JSON.parse(raw) : null;
    if (!save) { await this.newGame(); return; }
    this.setupWorld(save.seed, save);
    await this.preloadSpawn();
    this.enterPlaying();
  }

  private setupWorld(seed: number, save: SaveData | null): void {
    // clear previous world if any
    if (this.world) {
      for (const key of Array.from(this.world.chunks.keys())) {
        const [cx, cz] = key.split(',').map(Number);
        this.world.unloadChunk(cx, cz);
      }
    }
    this.drops?.clear();
    this.mobs?.clear();
    this.world = new World(seed, save?.edits);
    this.scene.add(this.world.group);
    this.sky = new SkySystem(this.scene, seed);
    this.sky.time = save?.time ?? DAY_LENGTH * 0.3;
    this.drops = new DropManager(this.scene, this.world, getAtlas().texture);
    this.particles = new ParticleSystem(this.scene);
    this.mobs = new MobManager(this.scene, this.world);
    this.player = new Player(this.camera);

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
    if (save) {
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
      this.player.selected = save.player.selected;
      this.player.fallStartY = save.player.y;
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
        selected: this.player.selected,
      },
      edits,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      useGameStore.getState().setHasSave(true);
    } catch { /* quota */ }
  }

  quitToMenu(): void {
    this.saveGame();
    this.running = false;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    useGameStore.getState().setScreen('menu');
  }

  // ── input ──────────────────────────────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F3') { e.preventDefault(); useGameStore.getState().toggleDebug(); return; }
    const st = useGameStore.getState();
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
    else if (e.button === 2) { this.placeBlock(); }
    else if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) { this.mining = false; this.mineProgress = 0; }
  };

  private onWheel = (e: WheelEvent): void => {
    if (useGameStore.getState().screen !== 'playing') return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.player.selected = (this.player.selected + dir + 9) % 9;
    this.syncHUD();
    this.updateHandMesh();
  };

  private onPointerLockChange = (): void => {
    if (useGameStore.getState().inv.open) return; // inventory open: world keeps running
    if (document.pointerLockElement !== this.canvas && useGameStore.getState().screen === 'playing' && !this.player?.dead) {
      useGameStore.getState().setScreen('paused');
      this.saveGame();
    }
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

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
        this.mobs.hurtMob(hit.mob, heldTool ? heldTool.dmg : 2, kx, kz);
        this.particles.hurt(hit.mob.x, hit.mob.y, hit.mob.z);
        this.damageTool(heldTool && heldTool.type !== 'sword' ? 2 : 1);
        this.crackMesh.visible = false;
        return;
      }
    }
    if (!this.mining || !this.target) { this.crackMesh.visible = false; return; }
    // target changed? reset progress
    const t = this.target;
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
      if (harvest && dropId && dropId > 0) {
        this.drops.spawn(dropId, t.x + 0.5, t.y + 0.3, t.z + 0.5, 1);
      }
      this.damageTool(1);
      this.world.setBlock(t.x, t.y, t.z, BLOCK.AIR);
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
    // right-click on crafting table opens the 3x3 grid (unless sneaking)
    const targetId = this.world.getBlock(this.target.x, this.target.y, this.target.z);
    if (targetId === BLOCK.CRAFTING_TABLE && !this.player.sneaking) {
      this.openInventory(true);
      return;
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
    const existing = this.world.getBlock(bx, by, bz);
    if (existing !== BLOCK.AIR && !isLiquid(existing)) return;
    // don't place inside player
    if (aabbIntersectsBlock(this.player.entity, bx, by, bz)) return;
    const def = getBlockDef(slot.blockId);
    this.world.setBlock(bx, by, bz, slot.blockId);
    audio.place((def?.sound ?? 'stone') as MaterialSound);
    this.placeCooldown = 0.22;
    this.startSwing();
    slot.count--;
    if (slot.count <= 0) { slot.blockId = 0; slot.count = 0; }
    this.syncHUD();
    this.updateHandMesh();
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
    this.invTable = table;
    this.updateCraftOut();
    st.setInv({ open: true, table });
    this.syncInventory(true);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  closeInventory(): void {
    const st = useGameStore.getState();
    if (!st.inv.open) return;
    // return craft grid + cursor to inventory (drop if full)
    const p = this.player.entity;
    for (const s of this.craftGrid) {
      if (isEmptySlot(s)) continue;
      const left = this.addToInventory(s.blockId, s.count, s.dur);
      if (left > 0) this.drops.spawn(s.blockId, p.x, p.y + 1, p.z, left);
      s.blockId = 0; s.count = 0;
    }
    if (this.cursor) {
      const left = this.addToInventory(this.cursor.blockId, this.cursor.count, this.cursor.dur);
      if (left > 0) this.drops.spawn(this.cursor.blockId, p.x, p.y + 1, p.z, left);
      this.cursor = null;
    }
    this.craftOut = null;
    this.invHover = null;
    st.setInv({ open: false, cursor: null, craftOut: null, craft: [] });
    this.syncHUD(true);
    this.updateHandMesh(true);
    this.requestLock();
  }

  setInvHover(hover: { area: 'hotbar' | 'main' | 'craft'; idx: number } | null): void {
    this.invHover = hover;
  }

  private invHotbarSwap(area: 'hotbar' | 'main' | 'craft', idx: number, hotbarIdx: number): void {
    const list = area === 'hotbar' ? this.player.hotbar : area === 'main' ? this.player.main : this.craftGrid;
    if (hotbarIdx === idx && area === 'hotbar') return;
    const a = list[idx];
    list[idx] = this.player.hotbar[hotbarIdx];
    this.player.hotbar[hotbarIdx] = a;
    this.syncInventory(true);
    this.syncHUD(true);
    this.updateHandMesh();
  }

  invClick(area: 'hotbar' | 'main' | 'craft' | 'out', idx: number, button: 'left' | 'right', shift: boolean): void {
    const st = useGameStore.getState();
    if (!st.inv.open) return;
    if (area === 'out') { this.takeCraftOutput(shift); return; }
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

  private shiftMove(area: 'hotbar' | 'main' | 'craft', list: HotbarSlot[], idx: number): void {
    const slot = list[idx];
    if (isEmptySlot(slot)) return;
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
        consume();
      } else if (this.cursor.blockId === out.blockId && !isToolItem(out.blockId) && this.cursor.count + out.count <= maxStack(out.blockId)) {
        this.cursor.count += out.count;
        consume();
      } else return;
    } else {
      let guard = 0;
      while (guard++ < 64) {
        const size = this.invTable ? 3 : 2;
        const res = matchRecipe(grid.map((s) => (isEmptySlot(s) ? 0 : s.blockId)), size);
        if (!res) break;
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

  /** consume durability from held tool; breaks it at 0 */
  private damageTool(n: number): void {
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
    const hash = JSON.stringify([this.player.hotbar, this.player.main, grid, this.craftOut, this.cursor]);
    if (hash === this.lastInvHash && !force) return;
    this.lastInvHash = hash;
    st.setInv({
      hotbar: cloneSlots(this.player.hotbar),
      main: cloneSlots(this.player.main),
      craft: cloneSlots(grid),
      craftOut: this.craftOut ? { ...this.craftOut } : null,
      cursor: this.cursor ? { ...this.cursor } : null,
    });
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
    if (id > 0 && isItemId(id)) {
      const tex = new THREE.CanvasTexture(getItemIconCanvas(id));
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
    // walk sway
    const sway = Math.sin(this.player.bobPhase) * 0.012;
    this.handGroup.position.x += sway;
    this.handGroup.position.y += Math.abs(sway) * 0.8;
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
    const hash = this.player.hotbar.map((s) => s.blockId + ':' + s.count).join(',') + '|' + this.player.selected;
    if (hash !== this.lastHotbarHash || force) {
      this.lastHotbarHash = hash;
      store.setHud({
        hotbar: this.player.hotbar.map((s) => ({ ...s })),
        selected: this.player.selected,
      });
    }
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

    // ── hunger drain ──
    if (p.sprinting && (forward !== 0 || strafe !== 0)) {
      p.hunger = Math.max(0, p.hunger - 0.085 * step);
    } else if (forward !== 0 || strafe !== 0) {
      p.hunger = Math.max(0, p.hunger - 0.012 * step);
    } else {
      p.hunger = Math.max(0, p.hunger - 0.0015 * step);
    }
    if (wishJump && p.onGround) p.hunger = Math.max(0, p.hunger - 0.05);

    // void damage
    if (p.y < -8) {
      p.damage(4);
      p.entity.vy = 0;
      p.entity.y = -8;
    }

    // death
    if (p.dead) {
      useGameStore.getState().setScreen('dead');
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  private frameUpdate(dt: number): void {
    const p = this.player;

    // camera
    p.applyCamera(this.settings.fov, 8, dt);

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

    // mobs
    if (this.mobs) {
      const eyeY = p.eyeY();
      this.mobs.update(dt, {
        x: p.x, y: p.y, z: p.z,
        vx: 0, vy: 0, vz: 0,
        width: 0.6, height: 1.8,
        onGround: p.onGround, inWater: p.inWater,
        eyeY: () => eyeY,
      }, this.sky.sunLevel, {
        damagePlayer: (amount, fx, fz) => {
          if (amount <= 0) return;
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
        playerX: p.x,
        playerY: p.y,
        playerZ: p.z,
      });
    }

    // sky + fog + lighting uniforms
    this.sky.update(dt, this.camera, this.scene, 60, 130);
    this.applySkyFog();

    // hand animation
    this.animateHand(dt);

    // streaming + autosave
    this.streamChunks();
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      this.saveGame();
    }

    // underwater check for HUD
    const camBlock = this.world.getBlock(Math.floor(this.camera.position.x), Math.floor(this.camera.position.y), Math.floor(this.camera.position.z));
    const underwater = camBlock === BLOCK.WATER;
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
    });
  }

  respawn(): void {
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
    if (this.world) {
      for (const key of Array.from(this.world.chunks.keys())) {
        const [cx, cz] = key.split(',').map(Number);
        this.world.unloadChunk(cx, cz);
      }
      this.scene.remove(this.world.group);
    }
    this.particles?.dispose();
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
