'use client';

// ─── Pause menu + settings + death screen + loading + debug overlay ──────────
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { McButton, useMenuBackground } from './ui';

export function PauseMenu() {
  const hud = useGameStore((s) => s.hud);
  const currentWorldName = useGameStore((s) => s.currentWorldName);
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60">
      <h2 className="mb-1 text-2xl md:text-3xl text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
        Game Paused
      </h2>
      {currentWorldName && (
        <div className="mb-6 text-[11px] text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
          {currentWorldName} · {hud.gameMode === 'creative' ? 'Creative' : 'Survival'}
        </div>
      )}
      <div className="flex flex-col items-center gap-3">
        <McButton variant="primary" onClick={() => { audio.click(); getEngine()?.requestLock(); useGameStore.getState().setScreen('playing'); }}>
          Back to Game
        </McButton>
        <McButton onClick={() => { audio.click(); getEngine()?.saveGame(); useGameStore.getState().setScreen('achievements'); }}>
          Achievements
        </McButton>
        <McButton onClick={() => { audio.click(); getEngine()?.saveGame(); useGameStore.getState().setScreen('settings'); }}>
          Settings…
        </McButton>
        <McButton onClick={() => { audio.click(); getEngine()?.quitToMenu(); }}>
          Save &amp; Quit to Title
        </McButton>
      </div>
      <div className="mt-10 max-w-md text-center text-[11px] leading-5 text-[#bbb]" style={{ fontFamily: 'var(--font-mc)' }}>
        WASD move · SPACE jump · CTRL sprint · SHIFT sneak<br />
        {hud.gameMode === 'creative' ? 'Double-SPACE fly · instant mine · infinite blocks' : 'LMB mine · RMB place · MMB pick · Q drop · 1-9 hotbar'} · F3 debug · F5 camera
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const prevScreen = useGameStore((s) => s.prevScreen);
  const bg = useMenuBackground();

  const back = () => {
    audio.click();
    const engine = getEngine();
    engine?.applySettings();
    useGameStore.getState().setScreen(prevScreen === 'settings' ? 'menu' : prevScreen);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex w-[min(92vw,420px)] flex-col items-center gap-4 py-8">
        <h2 className="text-xl text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
          Settings
        </h2>

        <Slider
          label={`Render Distance: ${settings.renderDistance} chunks`}
          min={2} max={8} step={1} value={settings.renderDistance}
          onChange={(v) => updateSettings({ renderDistance: v })}
        />
        <Slider
          label={`FOV: ${settings.fov}°`}
          min={60} max={110} step={1} value={settings.fov}
          onChange={(v) => updateSettings({ fov: v })}
        />
        <Slider
          label={`Mouse Sensitivity: ${Math.round(settings.sensitivity * 100)}%`}
          min={0.2} max={2} step={0.05} value={settings.sensitivity}
          onChange={(v) => updateSettings({ sensitivity: v })}
        />
        <Slider
          label={`Volume: ${Math.round(settings.volume * 100)}%`}
          min={0} max={1} step={0.05} value={settings.volume}
          onChange={(v) => updateSettings({ volume: v })}
        />

        <Toggle label="Clouds" value={settings.clouds} onChange={(v) => updateSettings({ clouds: v })} />
        <Toggle label="Show FPS" value={settings.showFps} onChange={(v) => updateSettings({ showFps: v })} />

        <McButton onClick={back} className="mt-4">Done</McButton>
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="w-full px-1" style={{ fontFamily: 'var(--font-mc)' }}>
      <div className="mb-1 text-center text-[13px] text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
        {label}
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mc-slider w-full"
      />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => { audio.click(); onChange(!value); }}
      className="mc-btn w-full px-4 py-2.5 text-[13px] text-white"
      style={{
        fontFamily: 'var(--font-mc)',
        border: '2px solid #000',
        background: value ? '#5d7a3c' : '#6f6f6f',
        boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
        textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
      }}
    >
      {label}: {value ? 'ON' : 'OFF'}
    </button>
  );
}

export function DeathScreen() {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(120,0,0,0.45)' }}>
      <h2
        className="mb-2 text-4xl md:text-5xl font-black text-white"
        style={{ fontFamily: 'var(--font-mc)', textShadow: '4px 4px 0 rgba(0,0,0,0.8)' }}
      >
        You Died!
      </h2>
      <p className="mb-8 text-sm text-[#eee]" style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
        Better luck next time…
      </p>
      <div className="flex flex-col items-center gap-3">
        <McButton variant="primary" onClick={() => { audio.click(); getEngine()?.respawn(); }}>Respawn</McButton>
        <McButton onClick={() => { audio.click(); getEngine()?.quitToMenu(); }}>Title Screen</McButton>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  const progress = useGameStore((s) => s.hud.loadingProgress);
  const label = useGameStore((s) => s.hud.loadingLabel);
  const bg = useMenuBackground();
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="mb-6 text-lg text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
        {label || 'Building world…'}
      </div>
      <div className="h-4 w-72 border-2 border-white/80 bg-black/50 p-[2px]">
        <div className="h-full bg-[#5d7a3c] transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="mt-3 text-xs text-[#ccc]" style={{ fontFamily: 'var(--font-mc)' }}>
        {Math.round(progress * 100)}%
      </div>
    </div>
  );
}
