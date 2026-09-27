'use client';

// ─── Main menu (Minecraft-style) ─────────────────────────────────────────────
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { McButton, Splash, useMenuBackground } from './ui';

export function MainMenu() {
  const hasSave = useGameStore((s) => s.hasSave);
  const bg = useMenuBackground();

  const start = (mode: 'new' | 'continue') => {
    audio.resume();
    audio.click();
    const engine = getEngine();
    if (!engine) return;
    if (mode === 'new') void engine.newGame();
    else void engine.continueGame();
  };

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative z-10 flex flex-col items-center px-4">
        {/* Title */}
        <div className="relative mb-2 select-none">
          <h1
            className="text-5xl md:text-7xl font-black tracking-wider text-white"
            style={{ fontFamily: 'var(--font-mc)', textShadow: '4px 4px 0 #3f3f3f, 6px 6px 0 rgba(0,0,0,0.5)' }}
          >
            VOXELCRAFT
          </h1>
          <Splash text="100% Blocks!" />
        </div>
        <p className="mb-10 text-xs md:text-sm text-[#c8c8c8]" style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
          A Minecraft-style Voxel Adventure — Three.js Edition
        </p>

        {/* Buttons */}
        <div className="flex flex-col items-center gap-3">
          {hasSave && <McButton variant="primary" onClick={() => start('continue')}>Continue World</McButton>}
          <McButton variant={hasSave ? 'default' : 'primary'} onClick={() => start('new')}>New World</McButton>
          <McButton onClick={() => { audio.click(); useGameStore.getState().setScreen('settings'); }}>Settings…</McButton>
        </div>
      </div>

      {/* footer */}
      <div className="absolute bottom-3 left-3 text-[10px] text-[#999]" style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 #000' }}>
        VoxelCraft 0.4.0 — Phase 3: Furnaces, Chests & Torches
      </div>
      <div className="absolute bottom-3 right-3 text-[10px] text-[#999]" style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 #000' }}>
        Fan project — not affiliated with Mojang
      </div>
    </div>
  );
}
