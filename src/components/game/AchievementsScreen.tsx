'use client';

// ─── Achievements screen: MC-style trophy grid (in-game = this world, menu = all worlds) ──
import { useEffect, useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { ACHIEVEMENTS } from '@/game/achievements';
import { getTileIconURL } from '@/game/textures/atlas';
import { audio } from '@/game/audio';
import { McButton, useMenuBackground } from './ui';

export function AchievementsScreen({ source }: { source: 'menu' | 'game' }) {
  const bg = useMenuBackground();
  const worlds = useGameStore((s) => s.worlds);
  const currentWorldId = useGameStore((s) => s.currentWorldId);
  const currentWorldName = useGameStore((s) => s.currentWorldName);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('Achievements');

  useEffect(() => {
    const eng = getEngine();
    if (source === 'game' && eng) {
      // live view of the running world's achievements (async tick to avoid sync setState)
      let cancelled = false;
      const id = window.setTimeout(() => {
        if (cancelled) return;
        setUnlocked(new Set(eng.achievements.unlocked));
        setTitle(`Achievements — ${currentWorldName || 'Current World'}`);
      }, 0);
      return () => { cancelled = true; window.clearTimeout(id); };
    } else {
      // aggregate across all DB worlds
      let cancelled = false;
      void eng?.fetchWorlds().then(() => {
        if (cancelled) return;
        const list = useGameStore.getState().worlds;
        const all = new Set<string>();
        for (const w of list) for (const a of w.achievements) all.add(a);
        setUnlocked(all);
        setTitle(`Achievements — ${all.size} unlocked`);
      });
      return () => { cancelled = true; };
    }
  }, [source, currentWorldId, currentWorldName]);

  const defs = Object.values(ACHIEVEMENTS);
  const doneCount = defs.filter((d) => unlocked.has(d.id)).length;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center overflow-y-auto py-8"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 flex w-[min(94vw,600px)] flex-col items-center">
        <h2 className="mb-1 text-xl text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
          {title}
        </h2>
        <div className="mb-4 text-[12px] text-[#ffd83d]" style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
          {doneCount} / {defs.length} unlocked
          {/* progress bar */}
          <div className="mx-auto mt-2 h-3 w-56 border-2 border-black bg-black/60 p-[1px]">
            <div className="h-full bg-[#5d7a3c] transition-all" style={{ width: `${(doneCount / defs.length) * 100}%` }} />
          </div>
        </div>

        <div className="w-full border-2 border-black bg-black/45 p-3">
          {defs.map((def, i) => {
            const got = unlocked.has(def.id);
            return (
              <div
                key={def.id}
                className="mb-2 flex items-center gap-3 border-2 p-2"
                style={{
                  borderColor: got ? 'rgba(255,215,61,0.55)' : '#222',
                  background: got ? 'rgba(255,215,61,0.08)' : 'rgba(0,0,0,0.35)',
                }}
              >
                <div
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center border-2 border-black"
                  style={{ background: got ? '#c6c6c6' : '#3a3a3a' }}
                >
                  {got ? (
                    <img src={getTileIconURL(def.iconTile)} alt="" className="h-[34px] w-[34px]" style={{ imageRendering: 'pixelated' }} />
                  ) : (
                    <span className="text-lg text-[#666]" style={{ fontFamily: 'var(--font-mc)' }}>?</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className="text-[14px]"
                    style={{
                      fontFamily: 'var(--font-mc)',
                      color: got ? '#ffd83d' : '#8a8a8a',
                      textShadow: '2px 2px 0 rgba(0,0,0,0.8)',
                    }}
                  >
                    {def.title}
                  </div>
                  <div className="text-[11px] text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
                    {got ? def.desc : '???'}
                  </div>
                </div>
                {got && (
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-[#ffd83d]" style={{ fontFamily: 'var(--font-mc)' }}>
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <McButton
          className="mt-5"
          onClick={() => {
            audio.click();
            const st = useGameStore.getState();
            st.setScreen(source === 'game' ? 'paused' : 'menu');
          }}
        >
          Done
        </McButton>
      </div>
    </div>
  );
}
