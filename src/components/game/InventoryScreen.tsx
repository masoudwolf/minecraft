'use client';

// ─── Inventory screen (E): creative palette, 2x2 crafting, table 3x3, chest 27, furnace ─
// Minecraft-style: live 3D player preview (head tracks the cursor), recipe book,
// enchant glint + purple enchant tooltip lines.
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { getToolDef, getArmorDef, isItemId } from '@/game/items';
import { enchantLine } from '@/game/enchanting';
import { creativePalette, creativeTabs, type CreativeCat } from '@/game/creativeItems';
import type { InvSlot } from '@/game/inventory';
import { slotIconUrl, slotName } from './slotIcon';
import { InventoryPlayer3D } from './InventoryPlayer3D';
import { RecipeBook } from './RecipeBook';

type Area = 'hotbar' | 'main' | 'craft' | 'out' | 'container' | 'armor';

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
  const armor = slot && isItemId(slot.blockId) ? getArmorDef(slot.blockId) : undefined;
  const maxDur = tool?.dur ?? armor?.dur;
  const durRatio = slot && slot.dur !== undefined && maxDur ? slot.dur / maxDur : 1;
  const showDur = !!slot && slot.dur !== undefined && !!maxDur && slot.dur < maxDur;

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
      {slot?.ench && Object.keys(slot.ench).length > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(220,160,255,0.65), rgba(130,60,210,0.35))', mixBlendMode: 'screen' }}
          aria-hidden
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

/** furnace arrow with cook progress */
function CookArrow({ progress }: { progress: number }) {
  return (
    <div className="relative flex h-[24px] w-[44px] items-center" aria-hidden>
      <div className="h-[12px] w-[36px]" style={{ background: '#8b8b8b', clipPath: 'polygon(0 30%, 62% 30%, 62% 0, 100% 50%, 62% 100%, 62% 70%, 0 70%)' }} />
      <div
        className="absolute left-0 top-0 h-[12px]"
        style={{
          width: `${Math.round(progress * 36)}px`,
          marginTop: 6,
          background: '#f8f8f8',
          clipPath: 'polygon(0 30%, 62% 30%, 62% 0, 100% 50%, 62% 100%, 62% 70%, 0 70%)',
          transform: 'translateY(-6px)',
        }}
      />
    </div>
  );
}

/** furnace flame indicator (burn progress) */
function Flame({ level }: { level: number }) {
  const h = Math.round(6 + level * 10);
  return (
    <div className="relative flex h-[16px] w-[16px] items-end justify-center" aria-hidden>
      <div
        style={{
          width: 14,
          height: Math.max(2, h),
          background: level > 0
            ? 'linear-gradient(to top, #e86a17, #ffd83d)'
            : '#5a5a5a',
          clipPath: 'polygon(50% 0, 78% 28%, 100% 55%, 82% 100%, 18% 100%, 0 55%, 24% 26%)',
          opacity: level > 0 ? 1 : 0.55,
        }}
      />
    </div>
  );
}

export function InventoryScreen() {
  const inv = useGameStore((s) => s.inv);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hoverInfo, setHoverInfo] = useState<{ id: number; x: number; y: number; name: string; ench?: Record<string, number> } | null>(null);
  const [palette] = useState(() => creativePalette());
  const [tabs] = useState(() => creativeTabs());
  const [tab, setTab] = useState<CreativeCat>('all');
  const [palQuery, setPalQuery] = useState('');

  const paletteShown = useMemo(() => {
    const base = tab === 'all' ? palette : (tabs.find((t) => t.key === tab)?.entries ?? palette);
    const q = palQuery.trim().toLowerCase();
    return q ? base.filter((e) => e.name.toLowerCase().includes(q)) : base;
  }, [palette, tabs, tab, palQuery]);

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
      let ench: Record<string, number> | undefined;
      if (a === 'hotbar') { id = inv.hotbar[i]?.blockId ?? 0; ench = inv.hotbar[i]?.ench; }
      else if (a === 'main') { id = inv.main[i]?.blockId ?? 0; ench = inv.main[i]?.ench; }
      else if (a === 'craft') { id = inv.craft[i]?.blockId ?? 0; ench = inv.craft[i]?.ench; }
      else if (a === 'container') { id = inv.containerSlots[i]?.blockId ?? 0; ench = inv.containerSlots[i]?.ench; }
      else if (a === 'armor') { id = inv.armor[i]?.blockId ?? 0; ench = inv.armor[i]?.ench; }
      else if (a === 'out') { id = inv.craftOut?.blockId ?? 0; }
      setHoverInfo(id > 0 ? { id, x: mouse.x, y: mouse.y, name: slotName(id), ench } : null);
    } else {
      setHoverInfo(null);
    }
  };

  const title = inv.creative
    ? 'Creative Inventory'
    : inv.container === 'chest'
      ? 'Chest'
      : inv.container === 'furnace'
        ? 'Furnace'
        : inv.table
          ? 'Crafting Table'
          : 'Crafting';

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
        {/* ── title ── */}
        <div
          className="mb-1 text-[15px]"
          style={{ fontFamily: 'var(--font-mc)', color: '#3f3f3f' }}
        >
          {title}
        </div>

        {/* ── mode-specific top section ── */}
        {inv.creative && (
          <div className="mb-4">
            {/* MC-style category tabs + search */}
            <div className="mb-[2px] flex items-end gap-[3px]">
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    title={t.label}
                    aria-label={`Creative tab: ${t.label}`}
                    aria-pressed={active}
                    className="relative flex h-[30px] w-[36px] items-center justify-center"
                    style={{
                      background: active ? '#c6c6c6' : '#9a9a9a',
                      border: '2px solid #1d1d21',
                      borderBottom: active ? 'none' : '2px solid #1d1d21',
                      boxShadow: active
                        ? 'inset 2px 2px 0 #ffffff, inset -2px 0 0 #555555'
                        : 'inset 2px 2px 0 rgba(255,255,255,0.4), inset -2px -2px 0 rgba(0,0,0,0.35)',
                      marginBottom: active ? -2 : 0,
                      zIndex: active ? 2 : 1,
                    }}
                    onClick={() => setTab(t.key)}
                  >
                    {slotIconUrl(t.iconId) && (
                      <img
                        src={slotIconUrl(t.iconId)!}
                        alt=""
                        className="h-[22px] w-[22px]"
                        style={{ imageRendering: 'pixelated', opacity: active ? 1 : 0.72 }}
                        draggable={false}
                      />
                    )}
                  </button>
                );
              })}
              <input
                value={palQuery}
                onChange={(e) => setPalQuery(e.target.value)}
                placeholder="Search items…"
                aria-label="Search creative items"
                className="ml-1 h-[26px] w-[110px] px-1.5 text-[11px] outline-none"
                style={{ background: '#f4f4f4', border: '2px solid #1d1d21', color: '#2d2d2d', fontFamily: 'var(--font-mc)' }}
              />
              <span className="mb-[2px] ml-auto text-[10px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
                {tabs.find((t) => t.key === tab)?.label}
              </span>
            </div>

            <div
              className="mc-scrollbar max-h-[250px] overflow-y-auto"
              style={{ boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
            >
              <div className="grid gap-[2px] bg-[#8b8b8b] p-[2px]" style={{ gridTemplateColumns: 'repeat(9, 44px)', minHeight: 92 }}>
                {paletteShown.map((entry) => (
                  <div
                    key={`${entry.isItem ? 'i' : 'b'}${entry.id}`}
                    className="relative flex h-[44px] w-[44px] cursor-pointer items-center justify-center"
                    style={{ background: SLOT_BG }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      getEngine()?.creativePick(entry.id);
                    }}
                    onMouseEnter={(e) => setHoverInfo({ id: entry.id, x: e.clientX, y: e.clientY, name: entry.name })}
                    onMouseLeave={() => setHoverInfo(null)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {slotIconUrl(entry.id) && (
                      <img
                        src={slotIconUrl(entry.id)!}
                        alt={entry.name}
                        className="h-[36px] w-[36px]"
                        style={{ imageRendering: 'pixelated' }}
                        draggable={false}
                      />
                    )}
                  </div>
                ))}
                {paletteShown.length === 0 && (
                  <div className="col-span-9 p-3 text-center text-[12px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
                    Nothing matches “{palQuery}”
                  </div>
                )}
              </div>
            </div>
            {/* destroy item slot */}
            <div className="mt-3 flex items-center gap-3">
              <div
                className="relative flex h-[44px] w-[44px] cursor-pointer items-center justify-center"
                style={{ background: '#8b5a5a', boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
                title="Destroy item"
                onMouseDown={(e) => { e.preventDefault(); getEngine()?.creativeDelete(); }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 4 L20 20 M20 4 L4 20" stroke="#fff" strokeWidth="3" style={{ filter: 'drop-shadow(1px 1px 0 rgba(0,0,0,0.6))' }} />
                </svg>
              </div>
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-mc)', color: '#5a5a5a' }}>
                Click an item to grab a stack · X slot destroys
              </span>
              {/* live 3D player preview in creative mode too (MC shows it) */}
              <div
                className="ml-auto hidden items-end justify-center rounded-sm sm:flex"
                style={{
                  width: 92,
                  height: 158,
                  background: 'radial-gradient(ellipse at 50% 30%, #a9c4cf 0%, #8fa8b4 70%, #7e96a3 100%)',
                  boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
                }}
              >
                <InventoryPlayer3D width={86} />
              </div>
            </div>
          </div>
        )}

        {!inv.creative && inv.container === 'none' && (
          <div className="mb-4 flex items-start gap-3">
            {/* recipe book (Minecraft-style crafting guide) */}
            <RecipeBook tableMode={inv.table} onFill={(idx) => getEngine()?.recipeFill(idx)} />

            <div className="flex items-center gap-4">
              <div
                className="grid gap-[2px]"
                style={{ gridTemplateColumns: `repeat(${inv.table ? 3 : 2}, 44px)` }}
              >
                {(inv.table ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3]).map((realIdx, i) => (
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

              {/* live 3D player + armor column (2x2 + 3x3 table mode, like MC's grid screens) */}
              {!inv.table && (
                <div className="ml-2 flex items-start gap-3">
                  <div className="flex flex-col gap-[2px]">
                    {([0, 1, 2, 3] as const).map((i) => (
                      <Slot key={i} slot={inv.armor[i] ?? null} area="armor" idx={i} onHover={onHover} />
                    ))}
                  </div>
                  <div
                    className="flex items-end justify-center rounded-sm"
                    style={{
                      width: 118,
                      height: 196,
                      background: 'radial-gradient(ellipse at 50% 30%, #a9c4cf 0%, #8fa8b4 70%, #7e96a3 100%)',
                      boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
                    }}
                  >
                    <InventoryPlayer3D width={108} />
                  </div>
                </div>
              )}
              {inv.table && (
                <div
                  className="ml-2 hidden items-end justify-center rounded-sm sm:flex"
                  style={{
                    width: 118,
                    height: 196,
                    background: 'radial-gradient(ellipse at 50% 30%, #a9c4cf 0%, #8fa8b4 70%, #7e96a3 100%)',
                    boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
                  }}
                >
                  <InventoryPlayer3D width={108} />
                </div>
              )}
            </div>
          </div>
        )}

        {inv.container === 'chest' && (
          <div className="mb-4 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(9, 44px)' }}>
            {Array.from({ length: 27 }, (_, i) => (
              <Slot key={i} slot={inv.containerSlots[i] ?? null} area="container" idx={i} onHover={onHover} />
            ))}
          </div>
        )}

        {inv.container === 'furnace' && (
          <div className="mb-4 flex items-center justify-center gap-5 py-2">
            {/* input + flame + fuel */}
            <div className="flex flex-col items-center gap-2">
              <Slot slot={inv.containerSlots[0] ?? null} area="container" idx={0} onHover={onHover} />
              <Flame level={inv.furnace?.burn ?? 0} />
              <Slot slot={inv.containerSlots[1] ?? null} area="container" idx={1} onHover={onHover} />
            </div>

            {/* cook arrow */}
            <CookArrow progress={inv.furnace?.cook ?? 0} />

            {/* output (take-only, big) */}
            <div
              className="relative flex h-[52px] w-[52px] items-center justify-center"
              style={{ background: SLOT_BG, boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
              onMouseDown={(e) => {
                e.preventDefault();
                getEngine()?.invClick('container', 2, e.button === 2 ? 'right' : 'left', e.shiftKey);
              }}
              onMouseEnter={() => onHover('container', 2)}
              onMouseLeave={() => onHover(null, 2)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {inv.containerSlots[2] && slotIconUrl(inv.containerSlots[2].blockId) && (
                <img
                  src={slotIconUrl(inv.containerSlots[2].blockId)!}
                  alt=""
                  className="h-[42px] w-[42px]"
                  style={{ imageRendering: 'pixelated' }}
                  draggable={false}
                />
              )}
              {inv.containerSlots[2] && inv.containerSlots[2].count > 1 && (
                <span
                  className="absolute bottom-0 right-1 text-[13px] font-bold text-white"
                  style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 #3f3f3f' }}
                >
                  {inv.containerSlots[2].count}
                </span>
              )}
            </div>
          </div>
        )}

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
          {inv.creative
            ? 'Click: grab stack · Click slot: place · E: close'
            : 'Click: move · Right-click: split/place one · Shift-click: quick move · 1-9: swap · E: close'}
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

      {/* tooltip (name + purple enchant lines, MC style) */}
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
          {hoverInfo.name || slotName(hoverInfo.id)}
          {hoverInfo.ench && Object.entries(hoverInfo.ench).map(([id, lvl]) => (
            <div key={id} className="text-[12px] italic" style={{ color: '#b18aff' }}>
              {enchantLine(id, lvl)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
