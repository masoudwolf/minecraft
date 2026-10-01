'use client';

// ─── Pause menu + settings + death screen + loading + debug overlay ──────────
import { useEffect } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { slotIconUrl, slotName } from './slotIcon';
import { McButton, useMenuBackground } from './ui';
import { PROFESSION_LABELS, TRADE_EPOCH_MS, type VillagerProfession } from '@/game/trades';

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
    // a running world (currentWorldId set) → back to pause; else main menu.
    // (prevScreen is unreliable — it was overwritten by the graphics roundtrip)
    const inWorld = useGameStore.getState().currentWorldId !== null;
    useGameStore.getState().setScreen(inWorld ? 'paused' : 'menu');
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

        <button
          onClick={() => { audio.click(); useGameStore.getState().setScreen('graphics'); }}
          className="mc-btn w-full px-4 py-2.5 text-[13px] text-white"
          style={{
            fontFamily: 'var(--font-mc)',
            border: '2px solid #000',
            background: '#3c7a6a',
            boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
            textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
          }}
        >
          ✨ Graphics / گرافیک…
        </button>

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

// ─── Villager trade panel (MC trading GUI style) ─────────────────────────────
const PANEL_BG = '#c6c6c6';
const SLOT_BG = '#8b8b8b';

export function TradePanel() {
  // Escape closes (engine also handles while locked; this covers unlocked clicks)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); getEngine()?.closeTrade(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // v0.57: profession from the store (set by openTrade) → bilingual header + restock hint
  const prof = useGameStore((s) => s.tradeProfession);
  const label = prof && prof in PROFESSION_LABELS ? PROFESSION_LABELS[prof as VillagerProfession] : null;
  const restockMin = Math.max(1, Math.ceil((TRADE_EPOCH_MS - (Date.now() % TRADE_EPOCH_MS)) / 60000));

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center" onMouseDown={(e) => e.stopPropagation()}>
      {/* dim world slightly */}
      <div className="absolute inset-0 bg-black/25" onMouseDown={() => getEngine()?.closeTrade()} />

      {/* panel */}
      <div
        className="relative z-10 w-[min(94vw,470px)] p-4"
        style={{
          background: PANEL_BG,
          border: '2px solid #000',
          boxShadow: 'inset 3px 3px 0 #ffffff, inset -3px -3px 0 #555555, 0 0 0 2px rgba(0,0,0,0.5)',
        }}
      >
        {/* ── header: villager face + title ── */}
        <div className="mb-3 flex items-center gap-3">
          <div
            className="relative h-10 w-10 shrink-0 border-2 border-black bg-[#c8a07a]"
            style={{ boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.3)' }}
            aria-hidden
          >
            <div className="absolute left-[20%] top-[30%] h-[9%] w-[60%] bg-[#5c4428]" />
            <div className="absolute left-[24%] top-[42%] h-[14%] w-[13%] bg-[#3a7a34]" />
            <div className="absolute right-[24%] top-[42%] h-[14%] w-[13%] bg-[#3a7a34]" />
            <div className="absolute left-[42%] top-[46%] h-[30%] w-[16%] bg-[#a8845e]" />
            <div className="absolute bottom-[10%] left-[36%] h-[7%] w-[28%] bg-[#8a6848]" />
          </div>
          <div className="min-w-0">
            <div className="text-[15px]" style={{ fontFamily: 'var(--font-mc)', color: '#3f3f3f' }}>
              {label ? `${label.en} Villager · ${label.fa}` : 'Villager · روستایی'}
            </div>
            <div className="text-[10px] text-[#5a5a5a]" style={{ fontFamily: 'var(--font-mc)' }}>
              Hmmm! Take a look at my wares… · نگاهی به اجناس من بنداز
            </div>
            <div className="mt-0.5 text-[9px] text-[#7a7a7a]" style={{ fontFamily: 'var(--font-mc)' }}>
              Stock rotates every 5 min · restock in ~{restockMin} min · بازپرستی تا {restockMin} دقیقه
            </div>
          </div>
        </div>

        {/* ── trade rows (per-villager stock, rotates every 5 min — MC restock) ── */}
        <div className="flex flex-col gap-[6px]">
          {(getEngine()?.getTradeOffers() ?? []).map((offer, i) => {
            const giveIcon = slotIconUrl(offer.give.id);
            const getIcon = slotIconUrl(offer.get.id);
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-2 py-2"
                style={{ boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff', background: '#8b8b8b' }}
              >
                {/* give slot */}
                <div
                  className="relative flex h-[40px] w-[40px] shrink-0 items-center justify-center"
                  style={{ background: SLOT_BG, boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
                  title={slotName(offer.give.id)}
                >
                  {giveIcon && <img src={giveIcon} alt={slotName(offer.give.id)} className="h-[32px] w-[32px] object-contain" style={{ imageRendering: 'pixelated' }} />}
                  <span className="absolute bottom-0 right-0.5 text-[11px] font-bold text-white" style={{ textShadow: '1px 1px 0 #000' }}>
                    {offer.give.count}
                  </span>
                </div>
                {/* arrow */}
                <div aria-hidden className="text-xl leading-none text-[#3f3f3f]">→</div>
                {/* get slot */}
                <div
                  className="relative flex h-[40px] w-[40px] shrink-0 items-center justify-center"
                  style={{ background: SLOT_BG, boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff' }}
                  title={slotName(offer.get.id)}
                >
                  {getIcon && <img src={getIcon} alt={slotName(offer.get.id)} className="h-[32px] w-[32px] object-contain" style={{ imageRendering: 'pixelated' }} />}
                  <span className="absolute bottom-0 right-0.5 text-[11px] font-bold text-white" style={{ textShadow: '1px 1px 0 #000' }}>
                    {offer.get.count}
                  </span>
                </div>
                <div className="min-w-0 flex-1 truncate text-[11px] text-[#2a2a2a]" style={{ fontFamily: 'var(--font-mc)' }}>
                  {slotName(offer.get.id)}
                </div>
                <button
                  className="mc-btn shrink-0 px-3 py-1.5 text-[11px] text-white"
                  style={{
                    fontFamily: 'var(--font-mc)',
                    border: '2px solid #000',
                    background: '#5d7a3c',
                    boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
                    textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
                  }}
                  onClick={() => { audio.click(); getEngine()?.executeTrade(i); }}
                >
                  Trade
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-center text-[10px] text-[#5a5a5a]" style={{ fontFamily: 'var(--font-mc)' }}>
          Esc to close · خروج با Esc
        </div>
      </div>
    </div>
  );
}
