'use client';

// ─── Shared Minecraft-style UI primitives ────────────────────────────────────
import { useEffect, useState } from 'react';
import { TILE } from '@/game/blocks';
import { getAtlas } from '@/game/textures/atlas';

/** dirt-tile menu background dataURL (cached) */
let menuBgCache: string | null = null;
export function getMenuBackground(): string {
  if (menuBgCache) return menuBgCache;
  if (typeof document === 'undefined') return '';
  const { canvas } = getAtlas();
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const tx = (TILE.dirt % 16) * 16;
  const ty = Math.floor(TILE.dirt / 16) * 16;
  ctx.drawImage(canvas, tx, ty, 16, 16, 0, 0, 64, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, 0, 64, 64);
  menuBgCache = c.toDataURL();
  return menuBgCache;
}

export function McButton({
  children, onClick, variant = 'default', disabled = false, className = '', width = 'w-80',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
  className?: string;
  width?: string;
}) {
  const base = 'mc-btn relative select-none px-4 py-3 text-center text-white transition-all duration-75';
  const colors = {
    default: 'bg-[#6f6f6f] hover:bg-[#7f8fbf]',
    primary: 'bg-[#5d7a3c] hover:bg-[#6d8a4c]',
    danger: 'bg-[#8a4a3c] hover:bg-[#9a5a4c]',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${colors[variant]} ${width} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:translate-y-[1px]'} ${className}`}
      style={{
        border: '2px solid #000',
        boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35), 0 3px 0 rgba(0,0,0,0.5)',
        textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
        fontFamily: 'var(--font-mc)',
        letterSpacing: '0.5px',
      }}
    >
      {children}
    </button>
  );
}

/** animated splash text */
export function Splash({ text }: { text: string }) {
  return (
    <div
      className="absolute -right-6 top-1 rotate-[-18deg] text-[15px] md:text-lg text-[#ffff54] animate-[splashPulse_0.9s_ease-in-out_infinite]"
      style={{ textShadow: '2px 2px 0 rgba(60,60,0,0.9)', fontFamily: 'var(--font-mc)' }}
    >
      {text}
    </div>
  );
}

/** pixel heart for health bar */
export function Heart({ state }: { state: 'full' | 'half' | 'empty' }) {
  // 7x6 pixel heart
  const rows = [
    [0, 1, 1, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0],
  ];
  const cell = 2;
  return (
    <svg width={14} height={13} viewBox="0 0 14 13" className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.7)]">
      {rows.map((row, y) =>
        row.map((v, x) =>
          v === 1 ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill={
                state === 'full' ? '#e02f2f'
                  : state === 'half' ? (x <= 3 ? '#e02f2f' : '#3a0c0c')
                    : '#3a0c0c'
              }
            />
          ) : null
        )
      )}
      {state !== 'empty' && <rect x={cell} y={cell} width={cell} height={cell} fill="#ff8a8a" />}
    </svg>
  );
}

/** hook: menu background dataURL (lazy client init) */
export function useMenuBackground(): string {
  const [bg] = useState(() => (typeof document !== 'undefined' ? getMenuBackground() : ''));
  return bg;
}
