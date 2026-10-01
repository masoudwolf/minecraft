// ─── Status effects (potions): registry + HUD icons ───────────────────────────
// Pure data + icon painters — no engine imports (items.ts / engine.ts both use this).

export type EffectKind =
  | 'speed'
  | 'strength'
  | 'regen'
  | 'haste'
  | 'night_vision'
  | 'water_breathing'
  | 'jump'
  | 'healing'
  | 'poison';

export interface EffectDef {
  kind: EffectKind;
  /** English label (MC parity) */
  label: string;
  /** Persian label (bilingual UI) */
  fa: string;
  /** HUD chip accent color */
  color: string;
  /** instant effects tick once and never show a timer chip (Healing) */
  instant?: boolean;
  /** 16x16 pixel-art HUD icon */
  icon: (ctx: CanvasRenderingContext2D) => void;
}

export const EFFECTS: Record<EffectKind, EffectDef> = {
  speed: {
    kind: 'speed', label: 'Speed', fa: 'سرعت', color: '#7cd4e8',
    icon: (ctx) => {
      // winged boot (MC speed icon)
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(1, 8, 5, 2); ctx.fillRect(0, 10, 3, 1);
      ctx.fillStyle = '#8a683c';
      ctx.fillRect(6, 5, 7, 4);
      ctx.fillRect(5, 9, 9, 4);
      ctx.fillStyle = '#5d4325';
      ctx.fillRect(5, 12, 9, 1);
      ctx.fillStyle = '#6a4a26';
      ctx.fillRect(7, 6, 2, 2);
    },
  },
  strength: {
    kind: 'strength', label: 'Strength', fa: 'قدرت', color: '#e07858',
    icon: (ctx) => {
      // arm flexing a fist (MC strength icon)
      ctx.fillStyle = '#d8a17b';
      ctx.fillRect(2, 4, 5, 8);
      ctx.fillRect(7, 6, 5, 6);
      ctx.fillStyle = '#b5835f';
      ctx.fillRect(2, 10, 5, 2);
      ctx.fillStyle = '#e8b890';
      ctx.fillRect(12, 5, 3, 5);
      ctx.fillStyle = '#8a5a3a';
      ctx.fillRect(2, 3, 5, 1);
    },
  },
  regen: {
    kind: 'regen', label: 'Regeneration', fa: 'بازسازی', color: '#e878a8',
    icon: (ctx) => {
      // heart (MC regen icon)
      ctx.fillStyle = '#e83a5a';
      ctx.fillRect(2, 4, 4, 3); ctx.fillRect(10, 4, 4, 3);
      ctx.fillRect(1, 6, 14, 4);
      ctx.fillRect(3, 10, 10, 2);
      ctx.fillRect(5, 12, 6, 2);
      ctx.fillRect(7, 14, 2, 1);
      ctx.fillStyle = '#ff8aa0';
      ctx.fillRect(3, 5, 2, 2);
    },
  },
  haste: {
    kind: 'haste', label: 'Haste', fa: 'شتاب', color: '#e8d05a',
    icon: (ctx) => {
      // pickaxe with motion marks (haste = faster mining)
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(4, 3, 9, 2); ctx.fillRect(3, 4, 2, 2); ctx.fillRect(12, 4, 2, 2);
      ctx.fillStyle = '#8a683c';
      ctx.fillRect(7, 5, 2, 8);
      ctx.fillStyle = '#fff06a';
      ctx.fillRect(1, 10, 3, 1); ctx.fillRect(2, 12, 3, 1);
    },
  },
  night_vision: {
    kind: 'night_vision', label: 'Night Vision', fa: 'بینایی شب', color: '#5878d8',
    icon: (ctx) => {
      // eye (MC night vision icon)
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(1, 5, 14, 6);
      ctx.fillStyle = '#c8c8d8';
      ctx.fillRect(2, 4, 12, 1); ctx.fillRect(2, 11, 12, 1);
      ctx.fillStyle = '#3868d8';
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = '#101828';
      ctx.fillRect(7, 7, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(6, 6, 1, 1);
    },
  },
  water_breathing: {
    kind: 'water_breathing', label: 'Water Breathing', fa: 'تنفس زیر آب', color: '#58a8e8',
    icon: (ctx) => {
      // bubbles (MC water breathing icon)
      ctx.fillStyle = '#58a8e8';
      ctx.fillRect(4, 3, 6, 6);
      ctx.fillStyle = '#88d0f8';
      ctx.fillRect(5, 4, 2, 2);
      ctx.fillRect(10, 8, 4, 4);
      ctx.fillStyle = '#c8ecff';
      ctx.fillRect(11, 9, 1, 1);
      ctx.fillStyle = '#3888c8';
      ctx.fillRect(3, 11, 4, 3);
    },
  },
  jump: {
    kind: 'jump', label: 'Jump Boost', fa: 'جهش', color: '#98d858',
    icon: (ctx) => {
      // springy green boot bounce (MC jump icon)
      ctx.fillStyle = '#98d858';
      ctx.fillRect(5, 3, 2, 4); ctx.fillRect(8, 2, 2, 5); ctx.fillRect(11, 3, 2, 4);
      ctx.fillStyle = '#6a4a26';
      ctx.fillRect(3, 8, 10, 4);
      ctx.fillStyle = '#4a3418';
      ctx.fillRect(3, 12, 10, 1);
      ctx.fillStyle = '#c8f0a0';
      ctx.fillRect(6, 9, 2, 1);
    },
  },
  healing: {
    kind: 'healing', label: 'Instant Health', fa: 'سلامتی فوری', color: '#f05a78',
    instant: true,
    icon: (ctx) => {
      // bright heart sparkle
      ctx.fillStyle = '#f04a68';
      ctx.fillRect(3, 4, 3, 2); ctx.fillRect(10, 4, 3, 2);
      ctx.fillRect(2, 6, 12, 3);
      ctx.fillRect(4, 9, 8, 2);
      ctx.fillRect(6, 11, 4, 2);
      ctx.fillStyle = '#ffd0d8';
      ctx.fillRect(4, 5, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(7, 2, 2, 2); ctx.fillRect(12, 9, 2, 2);
    },
  },
  poison: {
    kind: 'poison', label: 'Poison', fa: 'زهر', color: '#58a848',
    icon: (ctx) => {
      // poison bubble/droplet (MC poison icon)
      ctx.fillStyle = '#58a848';
      ctx.fillRect(6, 2, 4, 3);
      ctx.fillRect(4, 5, 8, 6);
      ctx.fillRect(5, 11, 6, 2);
      ctx.fillStyle = '#88d878';
      ctx.fillRect(6, 6, 2, 2);
      ctx.fillStyle = '#2c6828';
      ctx.fillRect(5, 13, 6, 1);
    },
  },
};

export function isEffectKind(k: string): k is EffectKind {
  return Object.prototype.hasOwnProperty.call(EFFECTS, k);
}

// ─── HUD icon cache (dataURLs, mirrors items.ts getItemIcon pattern) ─────────
const iconCache = new Map<string, string>();

export function effectIconUrl(kind: string): string {
  const cached = iconCache.get(kind);
  if (cached) return cached;
  const def = EFFECTS[kind as EffectKind];
  if (!def) return '';
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  def.icon(ctx);
  const big = document.createElement('canvas');
  big.width = 32; big.height = 32;
  const bctx = big.getContext('2d')!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(c, 0, 0, 32, 32);
  const url = big.toDataURL();
  iconCache.set(kind, url);
  return url;
}
