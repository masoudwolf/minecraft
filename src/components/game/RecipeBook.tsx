'use client';

// ─── Recipe Book (Minecraft-style crafting guide) ────────────────────────────
// A book panel beside the crafting grid: every registered recipe, searchable,
// craftable-now entries highlighted & sorted first. Clicking a recipe shows its
// exact grid pattern + the ingredients you need (have/need counts).
import { useMemo, useState } from 'react';
import { RECIPES, needsTable, type Recipe } from '@/game/crafting';
import { isItemId } from '@/game/items';
import { useGameStore } from '@/game/state';
import { slotIconUrl, slotName } from './slotIcon';

type Cat = 'tools' | 'combat' | 'armor' | 'food' | 'brewing' | 'blocks' | 'misc';

const CAT_LABEL: Record<Cat, string> = {
  tools: 'Tools',
  combat: 'Combat',
  armor: 'Armor',
  food: 'Food',
  brewing: 'Brewing',
  blocks: 'Blocks',
  misc: 'Misc',
};
const CATS: (Cat | 'all')[] = ['all', 'tools', 'combat', 'armor', 'food', 'brewing', 'blocks', 'misc'];

const SWORD_IDS = [273, 277, 281, 285, 289];

function categoryOf(id: number): Cat {
  if (isItemId(id)) {
    // tools: pickaxe/axe/shovel 270..289 (swords → combat) + hoes 325..329
    if (id >= 270 && id <= 289 && !SWORD_IDS.includes(id)) return 'tools';
    if (id >= 325 && id <= 329) return 'tools';
    if (SWORD_IDS.includes(id) || id === 317 || id === 318) return 'combat'; // bow/arrow
    if (id >= 301 && id <= 316) return 'armor';
    if ((id >= 256 && id <= 259) || (id >= 293 && id <= 296) || id === 324) return 'food';
    // phase 13/14: glass bottle / water bottle / sugar / potions + modifiers → brewing
    if (id >= 344 && id <= 384) return 'brewing';
    return 'misc';
  }
  if (id === 70) return 'brewing'; // brewing stand
  if (id >= 71 && id <= 77) return 'food'; // cake stages
  return 'blocks';
}

/** count every ingredient of a recipe (id → count) */
function recipeIngredients(r: Recipe): Map<number, number> {
  const m = new Map<number, number>();
  if (r.kind === 'shaped') {
    for (const c of r.cells) if (c > 0) m.set(c, (m.get(c) ?? 0) + 1);
  } else {
    for (const id of r.ids) m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

interface BookEntry {
  recipe: Recipe;
  idx: number;
  outId: number;
  outCount: number;
  name: string;
  cat: Cat;
}

function buildEntries(): BookEntry[] {
  return RECIPES.map((recipe, idx) => ({
    recipe,
    idx,
    outId: recipe.out.id,
    outCount: recipe.out.count,
    name: slotName(recipe.out.id),
    cat: categoryOf(recipe.out.id),
  }));
}

export function RecipeBook({ tableMode, onFill }: { tableMode: boolean; onFill?: (idx: number) => void }) {
  const inv = useGameStore((s) => s.inv);
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat | 'all'>('all');
  const [selected, setSelected] = useState<BookEntry | null>(null);

  // inventory counts (hotbar + main) for craftable checks
  const have = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of [...inv.hotbar, ...inv.main]) {
      if (s && s.blockId > 0) m.set(s.blockId, (m.get(s.blockId) ?? 0) + s.count);
    }
    return m;
  }, [inv.hotbar, inv.main]);

  const entries = useMemo(() => {
    const list = buildEntries().filter((e) => {
      if (cat !== 'all' && e.cat !== cat) return false;
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    const canMake = (e: BookEntry): boolean => {
      if (!tableMode && needsTable(e.recipe)) return false;
      for (const [id, n] of recipeIngredients(e.recipe)) if ((have.get(id) ?? 0) < n) return false;
      return true;
    };
    // craftable first (MC recipe book highlights what you can make now)
    return list
      .map((e) => ({ e, ok: canMake(e) }))
      .sort((a, b) => (a.ok === b.ok ? a.e.name.localeCompare(b.e.name) : a.ok ? -1 : 1));
  }, [query, cat, have, tableMode]);

  const selectedOk = selected
    ? (tableMode || !needsTable(selected.recipe)) &&
      [...recipeIngredients(selected.recipe)].every(([id, n]) => (have.get(id) ?? 0) >= n)
    : false;

  return (
    <div className="flex" style={{ fontFamily: 'var(--font-mc)' }}>
      {/* book tab (always visible) */}
      <button
        aria-label="Toggle recipe book"
        className="relative flex h-[26px] w-[30px] items-center justify-center self-start"
        style={{
          background: open ? '#8b6d4a' : '#a3825a',
          border: '2px solid #1d1d21',
          borderRight: 'none',
          boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.25), inset -2px -2px 0 rgba(0,0,0,0.3)',
          imageRendering: 'pixelated',
        }}
        title="Recipe Book"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[13px]" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}>📖</span>
      </button>

      {open && (
        <div
          className="mr-3 flex w-[248px] gap-2 p-2"
          style={{
            background: '#c8d6c0',
            border: '2px solid #1d1d21',
            boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.55), inset -2px -2px 0 rgba(80,90,75,0.6)',
          }}
        >
          {/* left column: search + categories + recipe list */}
          <div className="flex w-full flex-col gap-1.5">
            <div className="text-[12px] font-bold" style={{ color: '#3d4a38', textShadow: '1px 1px 0 rgba(255,255,255,0.4)' }}>
              Recipe Book
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes…"
              aria-label="Search recipes"
              className="h-[24px] px-1.5 text-[11px] outline-none"
              style={{ background: '#f0f4ec', border: '2px solid #6b7a63', color: '#2d3529' }}
            />

            <div className="flex flex-wrap gap-[3px]">
              {CATS.map((c) => (
                <button
                  key={c}
                  className="px-1 py-[1px] text-[9px]"
                  style={{
                    background: cat === c ? '#5c7a4f' : '#e2e8db',
                    color: cat === c ? '#fff' : '#42503b',
                    border: '1px solid #6b7a63',
                  }}
                  onClick={() => setCat(c)}
                >
                  {c === 'all' ? 'All' : CAT_LABEL[c]}
                </button>
              ))}
            </div>

            <div
              className="mc-scrollbar max-h-[252px] min-h-[140px] overflow-y-auto p-[2px]"
              style={{ background: '#e7ecdf', border: '2px solid #6b7a63', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.15)' }}
            >
              {entries.length === 0 && (
                <div className="p-2 text-center text-[10px]" style={{ color: '#6b7a63' }}>No recipes match</div>
              )}
              <div className="grid grid-cols-5 gap-[2px]">
                {entries.map(({ e, ok }) => {
                  const icon = slotIconUrl(e.outId);
                  const isSel = selected?.idx === e.idx;
                  return (
                    <button
                      key={`${e.idx}-${e.outId}-${e.outCount}-${e.recipe.kind}`}
                      title={e.name}
                      aria-label={e.name}
                      className="relative flex h-[40px] w-[40px] items-center justify-center"
                      style={{
                        background: isSel ? '#b3c7a4' : ok ? '#f4f8ee' : '#dfe4d6',
                        border: isSel ? '2px solid #3f6b2f' : '1px solid #9aa78e',
                        opacity: ok ? 1 : 0.55,
                      }}
                      onClick={() => setSelected(isSel ? null : e)}
                    >
                      {icon && (
                        <img src={icon} alt={e.name} className="h-[32px] w-[32px]" style={{ imageRendering: 'pixelated' }} draggable={false} />
                      )}
                      {e.outCount > 1 && (
                        <span className="absolute bottom-[-1px] right-[1px] text-[10px] font-bold text-white" style={{ textShadow: '1px 1px 0 #3f3f3f' }}>
                          {e.outCount}
                        </span>
                      )}
                      {ok && <span className="absolute left-[1px] top-[1px] h-[6px] w-[6px]" style={{ background: '#59c93c', border: '1px solid #2c6b1a' }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="text-[8.5px] leading-tight" style={{ color: '#5d6b55' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, background: '#59c93c', border: '1px solid #2c6b1a', marginRight: 3, verticalAlign: 'middle' }} />
              = craftable right now · dimmed = missing ingredients{!tableMode && ' or needs a Crafting Table'}
            </div>
          </div>
        </div>
      )}

      {/* detail popover: pattern of the selected recipe */}
      {selected && (
        <div
          className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 p-3"
          style={{
            background: '#c8d6c0',
            border: '2px solid #1d1d21',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 2px 2px 0 rgba(255,255,255,0.55)',
          }}
        >
          <div className="mb-1 flex items-center justify-between gap-4">
            <span className="text-[12px] font-bold" style={{ color: '#3d4a38' }}>
              {selected.name}{selected.outCount > 1 ? ` ×${selected.outCount}` : ''}
            </span>
            <button className="px-1 text-[10px]" style={{ background: '#5c7a4f', color: '#fff' }} onClick={() => setSelected(null)} aria-label="Close recipe detail">✕</button>
          </div>
          <RecipePattern recipe={selected.recipe} />
          {!tableMode && needsTable(selected.recipe) && (
            <div className="mt-1 text-center text-[10px]" style={{ color: '#8a4a2a' }}>⚠ Requires a Crafting Table (3×3)</div>
          )}
          <div className="mt-1.5 flex flex-col gap-[2px]">
            {[...recipeIngredients(selected.recipe)].map(([id, n]) => {
              const cnt = have.get(id) ?? 0;
              return (
                <div key={id} className="flex items-center gap-1.5 text-[10px]" style={{ color: cnt >= n ? '#2c6b1a' : '#8a3a2a' }}>
                  {slotIconUrl(id) && <img src={slotIconUrl(id)!} alt="" className="h-[16px] w-[16px]" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                  <span>{slotName(id)}: {cnt}/{n}</span>
                </div>
              );
            })}
          </div>
          {selectedOk && onFill && (
            <button
              className="mt-2 w-full py-[3px] text-[11px]"
              style={{
                background: '#5c7a4f',
                color: '#fff',
                border: '2px solid #2c4a20',
                boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.3), inset -2px -2px 0 rgba(0,0,0,0.35)',
                textShadow: '1px 1px 0 #2a3a22',
              }}
              onClick={() => onFill(selected.idx)}
            >
              ⬇ Fill the {tableMode ? '3×3' : '2×2'} grid
            </button>
          )}
          {selectedOk && !onFill && (
            <div className="mt-1 text-center text-[10px]" style={{ color: '#2c6b1a' }}>
              Place the pattern in the {tableMode ? '3×3' : '2×2'} grid →
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** the crafting pattern of a recipe rendered as an MC grid */
function RecipePattern({ recipe }: { recipe: Recipe }) {
  const size = 3;
  const cells: number[] = new Array(size * size).fill(0);
  if (recipe.kind === 'shaped') {
    for (let r = 0; r < recipe.h; r++)
      for (let c = 0; c < recipe.w; c++)
        cells[r * size + c] = recipe.cells[r * recipe.w + c] ?? 0;
  } else {
    // shapeless: scatter items left-to-right in the 3×3
    recipe.ids.forEach((id, i) => { cells[i] = id; });
  }
  return (
    <div className="flex items-center gap-2">
      <div className="grid gap-[2px] p-[2px]" style={{ gridTemplateColumns: `repeat(${size}, 36px)`, background: '#e7ecdf', border: '2px solid #6b7a63' }}>
        {cells.map((id, i) => (
          <div key={i} className="flex h-[36px] w-[36px] items-center justify-center" style={{ background: '#dfe4d6', border: '1px solid #9aa78e' }}>
            {id > 0 && slotIconUrl(id) && (
              <img src={slotIconUrl(id)!} alt={slotName(id)} className="h-[30px] w-[30px]" style={{ imageRendering: 'pixelated' }} draggable={false} />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center" aria-hidden>
        <div className="h-[3px] w-[18px]" style={{ background: '#6b7a63' }} />
        <div className="h-0 w-0" style={{ borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: '9px solid #6b7a63' }} />
      </div>
      <div className="flex h-[44px] w-[44px] items-center justify-center" style={{ background: '#f4f8ee', border: '2px solid #3f6b2f' }}>
        {slotIconUrl(recipe.out.id) && (
          <img src={slotIconUrl(recipe.out.id)!} alt={slotName(recipe.out.id)} className="h-[36px] w-[36px]" style={{ imageRendering: 'pixelated' }} draggable={false} />
        )}
      </div>
    </div>
  );
}
