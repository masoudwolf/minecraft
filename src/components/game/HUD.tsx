'use client';

// ─── HUD: crosshair, hotbar, hearts, toast, underwater overlay ───────────────
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/game/state';
import { BLOCK, getBlockDef } from '@/game/blocks';
import { getBlockIcon } from '@/game/textures/atlas';
import { Heart } from './ui';

export function HUD() {
  const hud = useGameStore((s) => s.hud);
  const toast = useGameStore((s) => s.toast);
  const prevHealth = useRef(20);
  const hurtFlash = useRef<HTMLDivElement>(null);

  // hurt red flash
  useEffect(() => {
    if (hud.health < prevHealth.current && hurtFlash.current) {
      const el = hurtFlash.current;
      el.style.opacity = '0.45';
      const t = setTimeout(() => { el.style.opacity = '0'; }, 180);
      prevHealth.current = hud.health;
      return () => clearTimeout(t);
    }
    prevHealth.current = hud.health;
  }, [hud.health]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* underwater tint */}
      {hud.underwater && <div className="absolute inset-0 bg-[#1a4fa8]/30" />}

      {/* hurt flash */}
      <div ref={hurtFlash} className="absolute inset-0 bg-red-700 opacity-0 transition-opacity duration-200" style={{ boxShadow: 'inset 0 0 120px rgba(120,0,0,0.9)' }} />

      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
        <div className="relative h-[18px] w-[18px]">
          <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-white" />
          <div className="absolute top-1/2 left-0 w-full h-[2px] -translate-y-1/2 bg-white" />
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div
          className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-black/55 px-4 py-1.5 text-sm text-white"
          style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}
        >
          {toast}
        </div>
      )}

      {/* bottom bars */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {/* health hearts */}
        <div className="flex w-[366px] justify-start gap-[1px] pb-0.5">
          {Array.from({ length: 10 }, (_, i) => {
            const hp = hud.health - i * 2;
            return <Heart key={i} state={hp >= 2 ? 'full' : hp === 1 ? 'half' : 'empty'} />;
          })}
        </div>

        {/* hotbar */}
        <div className="flex" style={{ background: 'rgba(0,0,0,0.35)', border: '2px solid rgba(0,0,0,0.8)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15)' }}>
          {hud.hotbar.map((slot, i) => {
            const def = slot.blockId > 0 ? getBlockDef(slot.blockId) : null;
            const icon = def ? getBlockIcon(def.id, Array.isArray(def.tiles) ? def.tiles[2] : def.tiles, Array.isArray(def.tiles) ? def.tiles[4] : def.tiles) : null;
            const selected = hud.selected === i;
            return (
              <div
                key={i}
                className="relative flex h-[44px] w-[44px] items-center justify-center"
                style={{
                  border: selected ? '3px solid #fff' : '2px solid #4a4a4a',
                  outline: selected ? '2px solid #000' : undefined,
                  background: 'rgba(30,30,30,0.55)',
                  zIndex: selected ? 2 : 1,
                }}
              >
                {icon && <img src={icon} alt={def?.name} className="h-[36px] w-[36px]" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                {slot.count > 1 && (
                  <span
                    className="absolute bottom-0 right-0.5 text-[13px] font-bold text-white"
                    style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #000' }}
                  >
                    {slot.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* held item name popup (on select change) */}
      <SelectedName />
    </div>
  );
}

function SelectedName() {
  const hud = useGameStore((s) => s.hud);
  const slot = hud.hotbar[hud.selected];
  const blockId = slot?.blockId ?? 0;
  const def = blockId > 0 ? getBlockDef(blockId) : null;
  if (!def) return null;
  return <FadeText key={`${hud.selected}:${blockId}`} text={def.name} />;
}

function FadeText({ text }: { text: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div
      className="absolute bottom-[110px] left-1/2 -translate-x-1/2 text-white text-sm transition-opacity duration-300"
      style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}
    >
      {text}
    </div>
  );
}
