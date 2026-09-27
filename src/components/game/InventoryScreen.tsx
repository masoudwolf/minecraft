'use client';

// ─── Inventory screen (E): 2x2 crafting, crafting table 3x3, MC-style GUI ─────
import { useEffect, useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { getToolDef, isItemId } from '@/game/items';
import type { InvSlot } from '@/game/inventory';
import { slotIconUrl, slotName } from './slotIcon';

type Area = 'hotbar' | 'main' | 'craft' | 'out';

const PANEL_BG = '#c6c6c6';
const SLOT_BG = '#8b8b8b';

function Slot({
  slot, area, idx, onHover,
}: {
  slot: InvSlot | null;
  area: Area;
  idx: number;
  onHover: (a: Area | null, i: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const icon = slot ? slotIconUrl(slot.blockId) : null;
  const tool = slot && isItemId(slot.blockId) ? getToolDef(slot.blockId) : undefined;
  const durRatio = tool && slot && slot.dur !== undefined ? slot.dur / tool.dur : 1;
  const showDur = !!tool && !!slot && slot.dur !== undefined && slot.dur < tool.dur;

  return (
    <div
      className="relative flex h-[44px] w-[44px] items-center justify-center"
      style={{
        background: SLOT_BG,
        boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        const eng = getEngine();
        if (!eng) return;
        eng.invClick(area, idx, e.button === 2 ? 'right' : 'left', e.shiftKey);
      }}
      onMouseEnter={() => { setHovered(true); onHover(area, idx); }}
      onMouseLeave={() => { setHovered(false); onHover(null, idx); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {icon && (
        <img
          src={icon}
          alt=""
          className="h-[36px] w-[36px]"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      )}
      {slot && slot.count > 1 && (
        <span
          className="absolute bottom-[-1px] right-[1px] text-[13px] font-bold text-white"
          style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #3f3f3f' }}
        >
          {slot.count}
        </span>
      )}
      {showDur && (
        <div className="absolute bottom-[3px] left-[4px] h-[3px] w-[36px] bg-black/80">
          <div
            className="h-full"
            style={{
              width: `${Math.max(4, durRatio * 100)}%`,
              background: `hsl(${Math.round(durRatio * 115)}, 85%, 45%)`,
            }}
          />
        </div>
      )}
      {hovered && <div className="pointer-events-none absolute inset-0 bg-white/45" />}
    </div>
  );
}

export function InventoryScreen() {
  const inv = useGameStore((s) => s.inv);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      setMouse({ x: e.clientX, y: e.clientY });
    };
    const onCtx = (e: Event): void => e.preventDefault();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('contextmenu', onCtx);
    };
  }, []);

  const onHover = (a: Area | null, i: number): void => {
    const eng = getEngine();
    if (a && a !== 'out') eng?.setInvHover({ area: a, idx: i });
    else eng?.setInvHover(null);
    if (a) {
      let id = 0;
      if (a === 'hotbar') id = inv.hotbar[i]?.blockId ?? 0;
      else if (a === 'main') id = inv.main[i]?.blockId ?? 0;
      else if (a === 'craft') id = inv.craft[i]?.blockId ?? 0;
      else if (a === 'out') id = inv.craftOut?.blockId ?? 0;
      setHoverInfo(id > 0 ? { id, x: mouse.x, y: mouse.y } : null);
    } else {
      setHoverInfo(null);
    }
  };

  const craftCols = inv.table ? 3 : 2;
  const craftIdx = inv.table
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8]
    : [0, 1, 2, 3]; // craft2 row-major

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
      {/* dim world slightly */}
      <div className="absolute inset-0 bg-black/25" />

      {/* panel */}
      <div
        className="relative z-10 p-4"
        style={{
          background: PANEL_BG,
          border: '2px solid #000',
          boxShadow: 'inset 3px 3px 0 #ffffff, inset -3px -3px 0 #555555, 0 0 0 2px rgba(0,0,0,0.5)',
        }}
      >
        {/* ── crafting section ── */}
        <div
          className="mb-1 text-[15px]"
          style={{ fontFamily: 'var(--font-mc)', color: '#3f3f3f' }}
        >
          {inv.table ? 'Crafting Table' : 'Crafting'}
        </div>
        <div className="mb-4 flex items-center gap-4">
          <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${craftCols}, 44px)` }}
          >
            {craftIdx.map((realIdx, i) => (
              <Slot
                key={i}
                slot={inv.craft[realIdx] ?? null}
                area="craft"
                idx={realIdx}
                onHover={onHover}
              />
            ))}
          </div>

          {/* arrow */}
          <div className="flex flex-col items-center gap-[2px]" aria-hidden>
            <div className="h-[4px] w-[26px] bg-[#8b8b8b]" />
            <div
              className="h-0 w-0"
              style={{ borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '12px solid #8b8b8b' }}
            />
          </div>

          {/* output slot (bigger) */}
          <div
            className="relative flex h-[52px] w-[52px] items-center justify-center"
            style={{ background: SLOT_BG, boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
            onMouseDown={(e) => {
              e.preventDefault();
              getEngine()?.invClick('out', 0, e.button === 2 ? 'right' : 'left', e.shiftKey);
            }}
            onMouseEnter={() => onHover('out', 0)}
            onMouseLeave={() => onHover(null, 0)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {inv.craftOut && slotIconUrl(inv.craftOut.blockId) && (
              <img
                src={slotIconUrl(inv.craftOut.blockId)!}
                alt=""
                className="h-[42px] w-[42px]"
                style={{ imageRendering: 'pixelated' }}
                draggable={false}
              />
            )}
            {inv.craftOut && inv.craftOut.count > 1 && (
              <span
                className="absolute bottom-0 right-1 text-[13px] font-bold text-white"
                style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #3f3f3f' }}
              >
                {inv.craftOut.count}
              </span>
            )}
          </div>

          {/* player figure (2x2 mode only, fills space like MC) */}
          {!inv.table && <PlayerFigure />}
        </div>

        {/* ── main inventory 9x3 ── */}
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(9, 44px)' }}>
          {Array.from({ length: 27 }, (_, i) => (
            <Slot key={i} slot={inv.main[i] ?? null} area="main" idx={i} onHover={onHover} />
          ))}
        </div>

        {/* ── hotbar 9x1 ── */}
        <div className="mt-4 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(9, 44px)' }}>
          {Array.from({ length: 9 }, (_, i) => (
            <Slot key={i} slot={inv.hotbar[i] ?? null} area="hotbar" idx={i} onHover={onHover} />
          ))}
        </div>

        {/* hint */}
        <div className="mt-3 text-center text-[11px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
          Click: move · Right-click: split/place one · Shift-click: quick move · 1-9: swap · E: close
        </div>
      </div>

      {/* cursor stack (follows mouse) */}
      {inv.cursor && slotIconUrl(inv.cursor.blockId) && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: mouse.x - 18, top: mouse.y - 18 }}
        >
          <img
            src={slotIconUrl(inv.cursor.blockId)!}
            alt=""
            className="h-[36px] w-[36px]"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
          {inv.cursor.count > 1 && (
            <span
              className="absolute bottom-[-2px] right-[-2px] text-[13px] font-bold text-white"
              style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #3f3f3f' }}
            >
              {inv.cursor.count}
            </span>
          )}
        </div>
      )}

      {/* tooltip */}
      {hoverInfo && !inv.cursor && (
        <div
          className="pointer-events-none fixed z-50 px-2 py-1 text-[13px] text-white"
          style={{
            left: hoverInfo.x + 14,
            top: hoverInfo.y - 8,
            fontFamily: 'var(--font-mc)',
            background: 'rgba(16, 0, 16, 0.94)',
            border: '2px solid #25015b',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
          }}
        >
          {slotName(hoverInfo.id)}
        </div>
      )}
    </div>
  );
}

/** tiny pixel-art player preview (2x2 crafting layout filler) */
function PlayerFigure() {
  const rows = [
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....ssssssss....',
    '....s.ss.ss.s...',
    '....ssssssss....',
    '.....ssssss.....',
    '...tttttttttt...',
    '..tttttttttttt..',
    '..tttttttttttt..',
    '..ssttttttttss..',
    '..ssttttttttss..',
    '...pppppppppp...',
    '...pppp..pppp...',
    '...pppp..pppp...',
    '...bbbb..bbbb...',
    '...bbbb..bbbb...',
  ];
  const colors: Record<string, string> = {
    h: '#3b2a1a', // hair
    s: '#d8a17b', // skin
    t: '#2e8b74', // shirt (teal, MC-ish)
    p: '#55555f', // pants
    b: '#4a3b28', // shoes
    '.': 'transparent',
  };
  const scale = 5;
  return (
    <div className="ml-6 flex items-end" aria-hidden>
      <canvas
        width={16 * scale}
        height={16 * scale}
        style={{ imageRendering: 'pixelated' }}
        ref={(c) => {
          if (!c) return;
          const ctx = c.getContext('2d');
          if (!ctx || c.dataset.drawn) return;
          c.dataset.drawn = '1';
          rows.forEach((row, y) =>
            row.split('').forEach((ch, x) => {
              const col = colors[ch];
              if (!col || col === 'transparent') return;
              ctx.fillStyle = col;
              ctx.fillRect(x * scale, y * scale, scale, scale);
            })
          );
        }}
      />
    </div>
  );
}
