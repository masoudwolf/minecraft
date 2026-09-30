'use client';

// ─── Enchanting table panel (MC GUI style): held item + 3 lapis/XP offers ────
import { useEffect, useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { slotIconUrl, slotName } from './slotIcon';
import { enchantLine, type EnchantOption } from '@/game/enchanting';

interface EnchantSnap {
  itemId: number;
  options: EnchantOption[];
  lapis: number;
  xpLevel: number;
  canEnchant: boolean;
}

export function EnchantPanel() {
  const [snap, setSnap] = useState<EnchantSnap | null>(() => snapOf());
  const [flash, setFlash] = useState(-1);

  // lightweight poll: lapis/XP/selected item can change from any side
  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapOf()), 250);
    return () => window.clearInterval(id);
  }, []);

  const apply = (i: number): void => {
    const eng = getEngine();
    if (!eng) return;
    audio.click();
    eng.applyEnchant(i);
    setSnap(snapOf());
    setFlash(i);
    window.setTimeout(() => setFlash(-1), 450);
  };

  // Escape closes (engine handles the locked case; this covers unlocked clicks)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); getEngine()?.closeEnchant(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const icon = snap ? slotIconUrl(snap.itemId) : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/25" onMouseDown={() => getEngine()?.closeEnchant()} />

      <div
        className="relative z-10 w-[min(94vw,440px)] p-4"
        style={{
          background: '#c6c6c6',
          border: '2px solid #000',
          boxShadow: 'inset 3px 3px 0 #ffffff, inset -3px -3px 0 #555555, 0 0 0 2px rgba(0,0,0,0.5)',
        }}
      >
        {/* header: table icon + resources */}
        <div className="mb-3 flex items-center gap-3">
          <div
            className="relative h-10 w-10 shrink-0 border-2 border-black bg-[#1a1424]"
            style={{ boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.25), inset -2px -2px 0 rgba(0,0,0,0.4)' }}
            aria-hidden
          >
            {slotIconUrl(69) /* ENCHANTING_TABLE block icon */ && (
              <img src={slotIconUrl(69)!} alt="" className="h-[30px] w-[30px] m-[3px]" style={{ imageRendering: 'pixelated' }} draggable={false} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px]" style={{ fontFamily: 'var(--font-mc)', color: '#3f3f3f' }}>
              Enchant
            </div>
            <div className="flex items-center gap-3 text-[10px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
              <span className={snap && snap.lapis > 0 ? 'text-[#2a52c8]' : ''}>Lapis: {snap?.lapis ?? 0}</span>
              <span className="text-[#7a9a2a]">Level: {snap?.xpLevel ?? 0}</span>
            </div>
          </div>
          {/* held item preview */}
          <div
            className="relative flex h-[44px] w-[44px] shrink-0 items-center justify-center"
            style={{ background: '#8b8b8b', boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
            title={snap ? slotName(snap.itemId) : ''}
          >
            {icon && <img src={icon} alt="" className="h-[36px] w-[36px]" style={{ imageRendering: 'pixelated' }} draggable={false} />}
          </div>
        </div>

        {/* existing enchantments on the held item */}
        {snap?.canEnchant === false && (
          <div className="mb-2 px-2 py-1 text-[11px]" style={{ fontFamily: 'var(--font-mc)', color: '#8a2a2a' }}>
            This item cannot be enchanted.
          </div>
        )}

        {/* the three offers */}
        <div className="flex flex-col gap-[6px]">
          {(snap?.options ?? []).map((opt, i) => {
            const okLapis = (snap?.lapis ?? 0) >= opt.lapis;
            const okXp = (snap?.xpLevel ?? 0) >= opt.levels;
            const enabled = okLapis && okXp;
            return (
              <button
                key={i}
                disabled={!enabled}
                onClick={() => apply(i)}
                className="flex items-center gap-3 px-2 py-2 text-left"
                style={{
                  fontFamily: 'var(--font-mc)',
                  background: flash === i ? '#b8a0e0' : enabled ? '#8b8b8b' : '#777777',
                  boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
                  border: '2px solid #1d1d21',
                  opacity: enabled ? 1 : 0.62,
                  cursor: enabled ? 'pointer' : 'not-allowed',
                }}
              >
                <span
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[13px] font-bold"
                  style={{ background: '#2a2440', color: '#c8a8ff', boxShadow: 'inset 0 0 6px rgba(200,168,255,0.5)' }}
                  aria-hidden
                >
                  ✦
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.6)' }}>
                    {opt.label}
                  </span>
                  <span className="block text-[10px]" style={{ color: '#d8d8d8' }}>
                    {opt.lapis} Lapis · {opt.levels} Level{opt.levels > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[10px]" style={{ color: !okLapis ? '#e8a8a8' : !okXp ? '#e8a8a8' : '#a4e8a4' }}>
                  {!okLapis ? 'No lapis' : !okXp ? 'Low level' : 'Ready'}
                </span>
              </button>
            );
          })}
          {snap && snap.options.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
              The table hums quietly… (no offers for this item)
            </div>
          )}
        </div>

        {/* current enchantments preview on the held item (reads live slot) */}
        <HeldEnchLines />

        <div className="mt-3 text-center text-[10px] text-[#5a5a5a]" style={{ fontFamily: 'var(--font-mc)' }}>
          Hold an item · costs Lapis + XP levels · Esc to close
        </div>
      </div>
    </div>
  );
}

function snapOf(): EnchantSnap | null {
  return getEngine()?.getEnchantState() ?? null;
}

/** live-reads the held slot's enchantments and lists them (purple, MC style) */
function HeldEnchLines() {
  const eng = getEngine();
  const st = useGameStore.getState();
  void st;
  const slot = eng?.getHeldSlot();
  const ench = slot?.ench;
  if (!ench) return null;
  const ids = Object.keys(ench);
  if (ids.length === 0) return null;
  return (
    <div className="mt-2 border-t-2 border-[#999999] pt-1.5">
      {ids.map((id) => (
        <div key={id} className="text-[11px]" style={{ fontFamily: 'var(--font-mc)', color: '#7a3fd8', textShadow: '1px 1px 0 rgba(255,255,255,0.4)' }}>
          {enchantLine(id, ench[id])}
        </div>
      ))}
    </div>
  );
}
