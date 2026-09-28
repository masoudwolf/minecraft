'use client';

// ─── HUD: crosshair, hotbar, hearts, toast, underwater overlay ───────────────
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/game/state';
import { isItemId, getToolDef } from '@/game/items';
import { slotIconUrl, slotName } from './slotIcon';
import { Heart } from './ui';

export function HUD() {
  const hud = useGameStore((s) => s.hud);
  const toast = useGameStore((s) => s.toast);
  const advancement = useGameStore((s) => s.advancement);
  const prevHealth = useRef(20);
  const hurtFlash = useRef<HTMLDivElement>(null);

  // hurt red flash (restart-safe, no cancellable timeout)
  useEffect(() => {
    if (hud.health < prevHealth.current && hurtFlash.current) {
      const el = hurtFlash.current;
      el.style.transition = 'none';
      el.style.opacity = '0.45';
      void el.offsetWidth; // force reflow to restart
      el.style.transition = 'opacity 0.5s ease-out';
      el.style.opacity = '0';
    }
    prevHealth.current = hud.health;
  }, [hud.health]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* underwater tint */}
      {hud.underwater && <div className="absolute inset-0 bg-[#1a4fa8]/30" />}

      {/* hurt flash */}
      <div ref={hurtFlash} className="absolute inset-0 bg-red-700 opacity-0 transition-opacity duration-200" style={{ boxShadow: 'inset 0 0 120px rgba(120,0,0,0.9)' }} />

      {/* low-health pulsing vignette (survival, ≤3 hearts) */}
      {hud.gameMode === 'survival' && hud.health > 0 && hud.health <= 6 && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(140,0,0,0.42) 100%)' }}
        />
      )}

      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-difference">
        <div className="relative h-[18px] w-[18px]">
          <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-white" />
          <div className="absolute top-1/2 left-0 w-full h-[2px] -translate-y-1/2 bg-white" />
        </div>
      </div>

      {/* bow draw charge indicator (under crosshair) */}
      {hud.bowCharge > 0 && (
        <div className="absolute left-1/2 top-1/2 mt-6 -translate-x-1/2">
          <div className="h-[6px] w-[110px] border-2 border-black/70 bg-black/40">
            <div
              className="h-full transition-[width] duration-75"
              style={{
                width: `${Math.min(100, hud.bowCharge * 100)}%`,
                background: hud.bowCharge >= 1
                  ? 'linear-gradient(90deg,#c8341f,#f4b41a)'
                  : 'linear-gradient(90deg,#8a683c,#d8c46a)',
              }}
            />
          </div>
          {hud.bowCharge >= 1 && (
            <div
              className="mt-0.5 text-center text-[10px] text-yellow-300"
              style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}
            >
              Full Draw!
            </div>
          )}
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-black/55 px-4 py-1.5 text-sm text-white"
          style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}
        >
          {toast}
        </div>
      )}

      {/* achievement advancement popup (top-right, MC style) */}
      {advancement && <AdvancementToast key={advancement.title} adv={advancement} />}

      {/* bottom bars */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        {/* XP bar (MC green, above status bars) — survival only */}
        {hud.gameMode === 'survival' && (
          <div className="relative mb-0.5 h-[7px] w-[366px]" style={{ background: 'rgba(0,0,0,0.55)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9)' }}>
            <div
              className="h-full"
              style={{
                width: `${hud.xpProgress * 100}%`,
                background: 'linear-gradient(180deg,#a4ff5e 0%,#7fdc38 45%,#5cb521 100%)',
                boxShadow: '0 0 4px rgba(140,255,80,0.55)',
              }}
            />
            {hud.xpLevel > 0 && (
              <span
                className="absolute -top-[15px] left-1/2 -translate-x-1/2 text-[13px] font-bold"
                style={{
                  fontFamily: 'var(--font-mc)',
                  color: '#80ff20',
                  textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000',
                }}
              >
                {hud.xpLevel}
              </span>
            )}
          </div>
        )}

        {/* status bars row: armor+hearts left, hunger right (like MC) — survival only */}
        {hud.gameMode === 'survival' && (
          <div className="flex w-[366px] items-end justify-between pb-0.5">
            <div className="flex flex-col gap-[1px]">
              {/* armor bar (only when wearing armor, MC style) */}
              {hud.armor > 0 && (
                <div className="mb-[1px] flex gap-[1px]">
                  {Array.from({ length: 10 }, (_, i) => {
                    const a = hud.armor - i * 2;
                    return <ArmorIcon key={i} state={a >= 2 ? 'full' : a === 1 ? 'half' : 'empty'} />;
                  })}
                </div>
              )}
              <div className="flex gap-[1px]">
                {Array.from({ length: 10 }, (_, i) => {
                  const hp = hud.health - i * 2;
                  return <Heart key={i} state={hp >= 2 ? 'full' : hp === 1 ? 'half' : 'empty'} />;
                })}
              </div>
            </div>
            <div className="flex flex-row-reverse gap-[1px]">
              {Array.from({ length: 10 }, (_, i) => {
                const hg = hud.hunger - i * 2;
                return <Drumstick key={i} state={hg >= 2 ? 'full' : hg === 1 ? 'half' : 'empty'} />;
              })}
            </div>
          </div>
        )}

        {/* creative mode indicator */}
        {hud.gameMode === 'creative' && (
          <div
            className="mb-0.5 px-2 py-[1px] text-[10px] uppercase tracking-widest"
            style={{
              fontFamily: 'var(--font-mc)',
              color: hud.flying ? '#a4ff5e' : '#d8b4fe',
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(0,0,0,0.8)',
              textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            }}
          >
            {hud.flying ? '✈ Flying — Space/Shift up/down · double-tap Space to land' : 'Creative — double-tap Space to fly'}
          </div>
        )}

        {/* hotbar */}
        <div className="flex" style={{ background: 'rgba(0,0,0,0.35)', border: '2px solid rgba(0,0,0,0.8)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15)' }}>
          {hud.hotbar.map((slot, i) => {
            const icon = slotIconUrl(slot.blockId);
            const tool = slot.blockId > 0 && isItemId(slot.blockId) ? getToolDef(slot.blockId) : undefined;
            const durRatio = tool && slot.dur !== undefined ? slot.dur / tool.dur : 1;
            const showDur = !!tool && slot.dur !== undefined && slot.dur < tool.dur;
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
                {icon && <img src={icon} alt={slotName(slot.blockId)} className="h-[36px] w-[36px]" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                {slot.count > 1 && (
                  <span
                    className="absolute bottom-0 right-0.5 text-[13px] font-bold text-white"
                    style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #000' }}
                  >
                    {slot.count}
                  </span>
                )}
                {showDur && (
                  <div className="absolute bottom-[3px] left-[3px] h-[3px] w-[34px] bg-black/80">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(5, durRatio * 100)}%`,
                        background: `hsl(${Math.round(durRatio * 115)}, 85%, 45%)`,
                      }}
                    />
                  </div>
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
  if (blockId <= 0) return null;
  const name = slotName(blockId);
  if (!name) return null;
  return <FadeText key={`${hud.selected}:${blockId}`} text={name} />;
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

/** MC-style advancement popup — dark box, yellow title, slide-in from right */
function AdvancementToast({ adv }: { adv: { title: string; desc: string; icon: string } }) {
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 20);
    const t2 = setTimeout(() => setPhase('out'), 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const x = phase === 'in' ? 'translate-x-[120%]' : phase === 'out' ? 'translate-x-[120%]' : 'translate-x-0';
  return (
    <div
      className={`absolute right-3 top-3 flex items-center gap-3 border-2 py-2 pl-2 pr-5 transition-transform duration-300 ease-out ${x}`}
      style={{
        background: 'linear-gradient(180deg,#212121 0%,#2d2d2d 100%)',
        borderColor: '#555',
        boxShadow: '0 0 0 2px #000, 0 4px 14px rgba(0,0,0,0.55)',
        fontFamily: 'var(--font-mc)',
      }}
    >
      <div
        className="flex h-[40px] w-[40px] items-center justify-center border-2"
        style={{ background: '#1a1a1a', borderColor: '#666' }}
      >
        <img src={adv.icon} alt="" className="h-[32px] w-[32px]" style={{ imageRendering: 'pixelated' }} draggable={false} />
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] font-bold" style={{ color: '#ffff55', textShadow: '2px 2px 0 #3a3a00' }}>Achievement Get!</span>
        <span className="text-[13px] text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>{adv.title}</span>
        <span className="text-[10px]" style={{ color: '#bbb' }}>{adv.desc}</span>
      </div>
    </div>
  );
}

/** pixel chestplate for armor bar (like MC armor row) */
function ArmorIcon({ state }: { state: 'full' | 'half' | 'empty' }) {
  const fill = state === 'empty' ? '#3a3a3a' : '#d8d8d8';
  const fillDark = state === 'empty' ? '#2a2a2a' : '#8a8a8a';
  return (
    <svg width={15} height={14} viewBox="0 0 15 14" className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.7)]">
      {/* shoulders */}
      <rect x={1} y={1} width={4} height={4} fill={fill} />
      <rect x={10} y={1} width={4} height={4} fill={fill} />
      {/* torso */}
      <rect x={4} y={2} width={7} height={11} fill={fill} />
      {/* shading */}
      <rect x={4} y={2} width={7} height={2} fill={state === 'empty' ? '#333333' : '#f4f4f4'} />
      <rect x={4} y={12} width={7} height={1} fill={fillDark} />
      <rect x={7} y={4} width={1} height={9} fill={fillDark} />
    </svg>
  );
}

/** pixel drumstick for hunger bar */
function Drumstick({ state }: { state: 'full' | 'half' | 'empty' }) {
  // 7x7 pixel drumstick (meat top-right, bone bottom-left)
  const meat = [
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1],
    [0, 0, 1, 1, 0],
  ];
  const cell = 2;
  return (
    <svg width={16} height={14} viewBox="0 0 16 14" className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.7)]">
      {/* bone */}
      <rect x={1} y={9} width={5} height={2} fill={state === 'empty' ? '#3a3020' : '#e8e2d0'} />
      <rect x={0} y={10} width={2} height={3} fill={state === 'empty' ? '#3a3020' : '#e8e2d0'} />
      <rect x={3} y={10} width={2} height={3} fill={state === 'empty' ? '#3a3020' : '#e8e2d0'} />
      {meat.map((row, y) =>
        row.map((v, x) =>
          v === 1 ? (
            <rect
              key={`${x}-${y}`}
              x={(x + 2) * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill={
                state === 'full' ? '#b5652a'
                  : state === 'half' ? (x >= 2 ? '#b5652a' : '#4a2a10')
                    : '#4a2a10'
              }
            />
          ) : null
        )
      )}
      {state !== 'empty' && <rect x={6} y={1} width={2} height={2} fill="#e08a4a" />}
    </svg>
  );
}
