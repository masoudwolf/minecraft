// ─── Global game state (zustand) — bridge between engine and React UI ────────
import { create } from 'zustand';
import type { InvSlot } from './inventory';

export type Screen = 'menu' | 'worlds' | 'createWorld' | 'achievements' | 'loading' | 'playing' | 'paused' | 'settings' | 'dead';

export type GameMode = 'survival' | 'creative';

/** world list entry (metadata only — full data fetched on load) */
export interface WorldMeta {
  id: string;
  name: string;
  gameMode: GameMode;
  seed: number;
  updatedAt: string;
  achievements: string[];
}

export interface DebugInfo {
  fps: number;
  x: number; y: number; z: number;
  chunkX: number; chunkZ: number;
  biome: string;
  facing: string;
  targetBlock: string;
  chunks: number;
  mobs: number;
  time: string;
  tris: number;
  mode?: string;
  flying?: boolean;
}

export interface Settings {
  renderDistance: number; // chunks
  fov: number;
  sensitivity: number;
  volume: number;
  clouds: boolean;
  showFps: boolean;
  /** F5 camera perspective, persisted (0 first / 1 third-back / 2 third-front) */
  cameraMode: number;
}

export interface HUDState {
  hotbar: { blockId: number; count: number; dur?: number }[];
  selected: number;
  health: number;
  hunger: number;
  underwater: boolean;
  loadingProgress: number;
  loadingLabel: string;
  /** XP bar above hotbar */
  xpLevel: number;
  xpProgress: number; // 0..1
  /** current game mode (creative hides survival bars) */
  gameMode: GameMode;
  /** creative flight active */
  flying: boolean;
  /** total armor points (0..20) for the armor bar */
  armor: number;
}

/** snapshot pushed by engine for the inventory screen */
export interface InvUIState {
  open: boolean;
  table: boolean; // 3x3 crafting table mode
  hotbar: InvSlot[];
  main: InvSlot[];
  craft: InvSlot[]; // 4 (2x2) or 9 (3x3)
  craftOut: InvSlot | null;
  cursor: InvSlot | null;
  /** open container: none = plain inventory, chest = 27 slots, furnace = [input,fuel,output] */
  container: 'none' | 'chest' | 'furnace';
  containerSlots: InvSlot[];
  /** furnace progress ratios (burn 0..1, cook 0..1) */
  furnace: { burn: number; cook: number } | null;
  /** creative item palette open (replaces crafting grid) */
  creative: boolean;
  /** equipped armor slots [helmet, chest, legs, boots] */
  armor: (InvSlot | null)[];
}

interface GameStore {
  screen: Screen;
  prevScreen: Screen;
  hasSave: boolean;
  debug: DebugInfo;
  debugVisible: boolean;
  settings: Settings;
  hud: HUDState;
  toast: string | null;
  inv: InvUIState;
  /** MC-style advancement popup (top-right) */
  advancement: { title: string; desc: string; icon: string } | null;
  /** known worlds (menu list) */
  worlds: WorldMeta[];
  /** id of the world currently being played */
  currentWorldId: string | null;
  currentWorldName: string;

  setScreen: (s: Screen) => void;
  setHasSave: (v: boolean) => void;
  setDebug: (d: Partial<DebugInfo>) => void;
  toggleDebug: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  setHud: (h: Partial<HUDState>) => void;
  setToast: (t: string | null) => void;
  setInv: (inv: Partial<InvUIState>) => void;
  setAdvancement: (a: { title: string; desc: string; icon: string } | null) => void;
  setWorlds: (w: WorldMeta[]) => void;
  setCurrentWorld: (id: string | null, name: string) => void;
}

const DEFAULT_SETTINGS: Settings = {
  renderDistance: 4,
  fov: 75,
  sensitivity: 1,
  volume: 0.7,
  clouds: true,
  showFps: false,
  cameraMode: 0,
};

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem('voxelcraft.settings');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export const useGameStore = create<GameStore>((set) => ({
  screen: 'menu',
  prevScreen: 'menu',
  hasSave: false,
  debug: { fps: 0, x: 0, y: 0, z: 0, chunkX: 0, chunkZ: 0, biome: 'plains', facing: 'north', targetBlock: '—', chunks: 0, mobs: 0, time: '06:00', tris: 0 },
  debugVisible: false,
  settings: loadSettings(),
  hud: { hotbar: Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 })), selected: 0, health: 20, hunger: 20, underwater: false, loadingProgress: 0, loadingLabel: '', xpLevel: 0, xpProgress: 0, gameMode: 'survival' as GameMode, flying: false, armor: 0 },
  toast: null,
  inv: { open: false, table: false, hotbar: [], main: [], craft: [], craftOut: null, cursor: null, container: 'none', containerSlots: [], furnace: null, creative: false, armor: [null, null, null, null] },
  advancement: null,
  worlds: [],
  currentWorldId: null,
  currentWorldName: '',

  setScreen: (s) => set((st) => ({ screen: s, prevScreen: st.screen })),
  setHasSave: (v) => set({ hasSave: v }),
  setDebug: (d) => set((st) => ({ debug: { ...st.debug, ...d } })),
  toggleDebug: () => set((st) => ({ debugVisible: !st.debugVisible })),
  updateSettings: (s) => set((st) => {
    const settings = { ...st.settings, ...s };
    try { localStorage.setItem('voxelcraft.settings', JSON.stringify(settings)); } catch { /* ignore */ }
    return { settings };
  }),
  setHud: (h) => set((st) => ({ hud: { ...st.hud, ...h } })),
  setToast: (t) => set({ toast: t }),
  setInv: (inv) => set((st) => ({ inv: { ...st.inv, ...inv } })),
  setAdvancement: (a) => set({ advancement: a }),
  setWorlds: (w) => set({ worlds: w }),
  setCurrentWorld: (id, name) => set({ currentWorldId: id, currentWorldName: name }),
}));

export function saveSettings(s: Settings): void {
  try { localStorage.setItem('voxelcraft.settings', JSON.stringify(s)); } catch { /* ignore */ }
}
