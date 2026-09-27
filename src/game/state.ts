// ─── Global game state (zustand) — bridge between engine and React UI ────────
import { create } from 'zustand';

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
  hotbar: { blockId: number; count: number }[];
  selected: number;
  health: number;
  hunger: number;
  underwater: boolean;
  loadingProgress: number;
  loadingLabel: string;
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

  setScreen: (s: Screen) => void;
  setHasSave: (v: boolean) => void;
  setDebug: (d: Partial<DebugInfo>) => void;
  toggleDebug: () => void;
  updateSettings: (s: Partial<Settings>) => void;
  setHud: (h: Partial<HUDState>) => void;
  setToast: (t: string | null) => void;
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
  hud: { hotbar: Array.from({ length: 9 }, () => ({ blockId: 0, count: 0 })), selected: 0, health: 20, hunger: 20, underwater: false, loadingProgress: 0, loadingLabel: '' },
  toast: null,

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
}));

export function saveSettings(s: Settings): void {
  try { localStorage.setItem('voxelcraft.settings', JSON.stringify(s)); } catch { /* ignore */ }
}
