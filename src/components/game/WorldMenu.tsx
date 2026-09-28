'use client';

// ─── World select + create world (MC-style singleplayer flow, DB-backed) ─────
import { useEffect, useState } from 'react';
import { useGameStore, type GameMode, type WorldMeta } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { McButton, useMenuBackground } from './ui';

/** small dirt-block world thumbnail */
function WorldThumb({ seed }: { seed: number }) {
  // deterministic 3x3 grass/dirt pattern from seed
  const hues = [95, 92, 30, 28, 98, 25, 33, 90, 27];
  return (
    <div className="grid h-[44px] w-[44px] shrink-0 grid-cols-3 grid-rows-3 border-2 border-black" aria-hidden>
      {hues.map((h, i) => {
        const v = ((seed >> (i * 3)) & 7) / 7;
        return (
          <div
            key={i}
            style={{
              background: `hsl(${h + v * 8}, ${35 + v * 20}%, ${28 + v * 14}%)`,
              boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.08), inset -1px -1px 0 rgba(0,0,0,0.25)',
            }}
          />
        );
      })}
    </div>
  );
}

function formatUpdatedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function WorldSelectScreen() {
  const worlds = useGameStore((s) => s.worlds);
  const bg = useMenuBackground();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const eng = getEngine();
    void eng?.fetchWorlds().finally(() => setLoading(false));
  }, []);

  const sel = worlds.find((w) => w.id === selected) ?? null;

  const play = (w: WorldMeta) => {
    audio.click();
    const eng = getEngine();
    if (!eng) return;
    useGameStore.getState().setScreen('loading');
    void eng.loadWorld(w.id);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center py-8"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <h2
        className="relative z-10 mb-6 text-xl text-white"
        style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}
      >
        Select World
      </h2>

      {/* world list */}
      <div className="relative z-10 w-[min(92vw,560px)] flex-1 overflow-hidden border-2 border-black bg-black/45" style={{ boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.12)' }}>
        <div className="mc-scrollbar h-full max-h-[52vh] overflow-y-auto p-2">
          {loading && (
            <div className="p-6 text-center text-sm text-[#bbb]" style={{ fontFamily: 'var(--font-mc)' }}>
              Loading worlds…
            </div>
          )}
          {!loading && worlds.length === 0 && (
            <div className="p-6 text-center text-sm leading-6 text-[#bbb]" style={{ fontFamily: 'var(--font-mc)' }}>
              No worlds yet.<br />Create a new one to start playing!
            </div>
          )}
          {!loading && worlds.map((w) => (
            <button
              key={w.id}
              onClick={() => { audio.click(); setSelected(w.id); setConfirmDelete(false); setRenaming(false); }}
              onDoubleClick={() => play(w)}
              className="mb-2 flex w-full items-center gap-3 border-2 p-2 text-left transition-colors"
              style={{
                borderColor: selected === w.id ? '#fff' : '#000',
                background: selected === w.id ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.35)',
              }}
            >
              <WorldThumb seed={w.seed} />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[15px] text-white"
                  style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}
                >
                  {w.name}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
                  <span>{formatUpdatedAt(w.updatedAt)}</span>
                  <span>Seed: {w.seed}</span>
                  <span>{w.achievements.length}/12 trophies</span>
                </div>
              </div>
              <span
                className="shrink-0 px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  fontFamily: 'var(--font-mc)',
                  background: w.gameMode === 'creative' ? '#7a5a9a' : '#5d7a3c',
                  border: '1px solid #000',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
                }}
              >
                {w.gameMode}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* actions */}
      <div className="relative z-10 mt-5 flex w-[min(92vw,560px)] flex-col items-center gap-2">
        {confirmDelete && sel ? (
          <div className="w-full border-2 border-[#8a4a3c] bg-black/60 p-3 text-center">
            <div className="mb-2 text-[13px] text-[#f0d0d0]" style={{ fontFamily: 'var(--font-mc)' }}>
              Delete &quot;{sel.name}&quot; forever? (No undo!)
            </div>
            <div className="flex justify-center gap-2">
              <McButton
                variant="danger"
                width="w-40"
                onClick={() => {
                  audio.click();
                  void getEngine()?.deleteWorld(sel.id);
                  setSelected(null);
                  setConfirmDelete(false);
                }}
              >
                Delete
              </McButton>
              <McButton width="w-40" onClick={() => { audio.click(); setConfirmDelete(false); }}>Cancel</McButton>
            </div>
          </div>
        ) : renaming && sel ? (
          <div className="w-full border-2 border-[#4a7a8a] bg-black/60 p-3">
            <div className="mb-2 text-center text-[13px] text-[#d0e8f0]" style={{ fontFamily: 'var(--font-mc)' }}>
              Rename World
            </div>
            <input
              className="mc-input mb-3"
              value={renameText}
              maxLength={32}
              autoFocus
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameText.trim()) {
                  void getEngine()?.renameWorld(sel.id, renameText);
                  setRenaming(false);
                } else if (e.key === 'Escape') {
                  setRenaming(false);
                }
              }}
              aria-label="New world name"
            />
            <div className="flex justify-center gap-2">
              <McButton
                variant="primary"
                width="w-40"
                disabled={!renameText.trim()}
                onClick={() => {
                  void getEngine()?.renameWorld(sel.id, renameText);
                  setRenaming(false);
                }}
              >
                Rename
              </McButton>
              <McButton width="w-40" onClick={() => { audio.click(); setRenaming(false); }}>Cancel</McButton>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-center gap-2">
            <McButton variant="primary" disabled={!sel} onClick={() => { if (sel) play(sel); }}>Play Selected World</McButton>
            <McButton disabled={!sel} onClick={() => { audio.click(); setRenameText(sel?.name ?? ''); setRenaming(true); }}>Rename</McButton>
            <McButton disabled={!sel} onClick={() => { audio.click(); setConfirmDelete(true); }}>Delete</McButton>
          </div>
        )}
        <div className="flex w-full justify-center gap-2">
          <McButton
            onClick={() => { audio.click(); useGameStore.getState().setScreen('createWorld'); }}
          >
            Create New World
          </McButton>
          <McButton onClick={() => { audio.click(); useGameStore.getState().setScreen('menu'); }}>Cancel</McButton>
        </div>
      </div>
    </div>
  );
}

export function CreateWorldScreen() {
  const bg = useMenuBackground();
  const [name, setName] = useState('New World');
  const [gameMode, setGameMode] = useState<GameMode>('survival');
  const [seedText, setSeedText] = useState('');
  const [creating, setCreating] = useState(false);

  const create = () => {
    if (creating) return;
    audio.click();
    setCreating(true);
    const eng = getEngine();
    if (!eng) { setCreating(false); return; }
    const seed = seedText.trim()
      ? (Number.isFinite(Number(seedText)) ? Number(seedText) : hashString(seedText))
      : undefined;
    const finalName = name.trim() || 'New World';
    useGameStore.getState().setCurrentWorld(null, finalName);
    useGameStore.getState().setScreen('loading');
    void eng.createWorld(finalName, gameMode, seed);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto py-8"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex w-[min(92vw,480px)] flex-col items-center gap-4">
        <h2 className="text-xl text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
          Create New World
        </h2>

        <div className="w-full">
          <div className="mb-1 px-1 text-[12px] text-[#ccc]" style={{ fontFamily: 'var(--font-mc)' }}>World Name</div>
          <input
            className="mc-input"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="New World"
            aria-label="World name"
          />
        </div>

        {/* game mode toggle */}
        <button
          className="mc-btn w-full px-4 py-2.5 text-[13px] text-white"
          style={{
            fontFamily: 'var(--font-mc)',
            border: '2px solid #000',
            background: gameMode === 'creative' ? '#7a5a9a' : '#5d7a3c',
            boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
            textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
          }}
          onClick={() => { audio.click(); setGameMode((m) => (m === 'survival' ? 'creative' : 'survival')); }}
        >
          Game Mode: {gameMode === 'survival' ? 'Survival' : 'Creative'}
        </button>
        <div className="-mt-2 w-full px-1 text-[11px] leading-4 text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
          {gameMode === 'survival'
            ? 'Search for resources, craft tools, gain levels, health and hunger.'
            : 'Unlimited blocks, free flight (double-tap space), instant mining, invulnerable.'}
        </div>

        <div className="w-full">
          <div className="mb-1 px-1 text-[12px] text-[#ccc]" style={{ fontFamily: 'var(--font-mc)' }}>
            Seed for the World Generator <span className="text-[#888]">(optional)</span>
          </div>
          <input
            className="mc-input"
            value={seedText}
            maxLength={32}
            onChange={(e) => setSeedText(e.target.value)}
            placeholder="Leave blank for a random seed"
            aria-label="World seed"
          />
        </div>

        <div className="mt-2 flex gap-2">
          <McButton variant="primary" onClick={create} disabled={creating}>
            {creating ? 'Creating…' : 'Create New World'}
          </McButton>
          <McButton onClick={() => { audio.click(); useGameStore.getState().setScreen('worlds'); }}>Cancel</McButton>
        </div>
      </div>
    </div>
  );
}

/** deterministic string → int seed (like MC text seeds) */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647;
}
