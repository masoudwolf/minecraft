// ─── Global game state (zustand) — bridge between engine and React UI ────────
import { create } from 'zustand';
import type { InvSlot } from './inventory';

export type Screen = 'menu' | 'loading' | 'playing' | 'paused' | 'settings' | 'dead';

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
}

export interface Settings {
  renderDistance: number; // chunks
  fov: number;
  sensitivity: number;
  volume: number;
  clouds: boolean;
  showFps: boolean;
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

  setScreen: (s: Screen) => void;
  setHasSave: (v: boolean) => void;
  setDebug: (d: Partial<DebugInfo>) => void;
  toggleDebug: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  setHud: (h: Partial<HUDState>) => void;
  setToast: (t: string | null) => void;
  setInv: (inv: Partial<InvUIState>) => void;
  setAdvancement: (a: { title: string; desc: string; icon: string } | null) => void;
}

const DEFAULT_SETTINGS: Settings = {
  renderDistance: 4,
  fov: 75,
  sensitivity: 1,
  volume: 0.7,
  clouds: true,
  showFps: false,
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
  settings: DEFAULT_SETTINGS,
  hud: { hotbar: Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 })), selected: 0, health: 20, hunger: 20, underwater: false, loadingProgress: 0, loadingLabel: '', xpLevel: 0, xpProgress: 0 },
  toast: null,
  inv: { open: false, table: false, hotbar: [], main: [], craft: [], craftOut: null, cursor: null, container: 'none', containerSlots: [], furnace: null },
  advancement: null,

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
}));

export function saveSettings(s: Settings): void {
  try { localStorage.setItem('voxelcraft.settings', JSON.stringify(s)); } catch { /* ignore */ }
}
