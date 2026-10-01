'use client';

// ─── Graphics settings screen — shader-pack options (MC options GUI style) ────
// Every change applies LIVE: updateSettings → store → engine gfx.applySettings.
import { useGameStore } from '@/game/state';
import { getEngine } from '@/game/engine';
import { audio } from '@/game/audio';
import { applyPreset, GFX_PRESETS, type GfxPreset, type GfxSettings } from '@/game/graphics/settings';
import { McButton, useMenuBackground } from './ui';

const PRESET_LABEL: Record<GfxPreset, string> = {
  potato: 'Potato 🥔',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra ✨',
};

const PRESET_COLOR: Record<GfxPreset, string> = {
  potato: '#7a6a3c',
  low: '#6f6f6f',
  medium: '#5d7a3c',
  high: '#3c7a6a',
  ultra: '#7a5d3c',
};

export function GraphicsScreen() {
  const settings = useGameStore((s) => s.settings);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const prevScreen = useGameStore((s) => s.prevScreen);
  const bg = useMenuBackground();
  const gfx = settings.gfx;

  const setGfx = (partial: Partial<GfxSettings>) => {
    updateSettings({ gfx: { ...gfx, ...partial } });
  };

  const back = () => {
    audio.click();
    getEngine()?.applySettings();
    useGameStore.getState().setScreen('settings');
  };

  const cycle = (label: string, value: number, options: string[], onChange: (v: number) => void) => (
    <button
      onClick={() => { audio.click(); onChange((value + 1) % options.length); }}
      className="mc-btn w-full px-4 py-2.5 text-[13px] text-white"
      style={{
        fontFamily: 'var(--font-mc)',
        border: '2px solid #000',
        background: '#5d7a3c',
        boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
        textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
      }}
    >
      {label}: {options[value]}
    </button>
  );

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center overflow-y-auto"
      style={{ backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: '64px 64px', imageRendering: 'pixelated' }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 flex w-[min(94vw,520px)] flex-col items-center gap-3 py-8">
        <h2 className="text-xl text-white" style={{ fontFamily: 'var(--font-mc)', textShadow: '3px 3px 0 rgba(0,0,0,0.8)' }}>
          Graphics
        </h2>
        <div className="mb-1 text-center text-[10px] leading-4 text-[#c9c9c9]" style={{ fontFamily: 'var(--font-mc)' }}>
          تنظیمات گرافیک شیدری — تغییرات بلافاصله اعمال می‌شوند
        </div>

        {/* ── presets ── */}
        <div className="w-full px-1">
          <div className="mb-1.5 text-center text-[11px] text-[#ffd66e]" style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 #000' }}>
            Quality Preset / کیفیت کلی
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {(Object.keys(GFX_PRESETS) as GfxPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => { audio.click(); setGfx(applyPreset(gfx, p)); }}
                className="mc-btn px-2.5 py-2 text-[11px] text-white"
                style={{
                  fontFamily: 'var(--font-mc)',
                  border: `2px solid ${gfx.preset === p ? '#ffe08a' : '#000'}`,
                  background: PRESET_COLOR[p],
                  boxShadow: gfx.preset === p
                    ? 'inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.35), 0 0 8px rgba(255,224,138,0.55)'
                    : 'inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.35)',
                  textShadow: '2px 2px 0 rgba(0,0,0,0.6)',
                  opacity: gfx.preset === p ? 1 : 0.82,
                }}
              >
                {PRESET_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        {/* ── big features ── */}
        <Toggle label="Volumetric Clouds / ابر حجمی" value={gfx.volumetricClouds} onChange={(v) => setGfx({ volumetricClouds: v })} />
        {gfx.volumetricClouds && cycle('Cloud Detail', gfx.cloudQuality, ['Low', 'Medium', 'High'], (v) => setGfx({ cloudQuality: v }))}

        {cycle('Water Quality / کیفیت آب', gfx.waterQuality, ['Basic', 'Reflections', 'Ultra'], (v) => setGfx({ waterQuality: v }))}
        {cycle('Shadows / سایه‌ها', gfx.shadows, ['Off', 'Low (1K)', 'Medium (2K)', 'High (4K)'], (v) => setGfx({ shadows: v }))}

        {/* ── atmospheric haze (v0.49 — works with or without postfx) ── */}
        <Slider
          label={`Atmospheric Haze / مه آلودگی: ${gfx.haze === 0 ? 'Clear / شفاف' : `${Math.round(gfx.haze * 100)}%`}`}
          min={0} max={1.5} step={0.05} value={gfx.haze ?? 1}
          onChange={(v) => setGfx({ haze: v })}
        />
        <div className="-mt-2 text-center text-[9px] leading-3 text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
          Fog · light shafts · night tint — 0% = crystal clear view
          <br />مه و پرتوهای نور — صفر = کاملاً شفاف
        </div>

        {/* ── post fx ── */}
        <Toggle label="Post-Processing" value={gfx.postfx} onChange={(v) => setGfx({ postfx: v })} />
        {gfx.postfx && (
          <>
            <Toggle label="Bloom" value={gfx.bloom} onChange={(v) => setGfx({ bloom: v })} />
            <Toggle label="God Rays / پرتوهای خورشید" value={gfx.godRays} onChange={(v) => setGfx({ godRays: v })} />
            {gfx.godRays && (
              <Slider
                label={`God Rays Strength: ${Math.round(gfx.godRaysStrength * 100)}%`}
                min={0.1} max={1.5} step={0.05} value={gfx.godRaysStrength}
                onChange={(v) => setGfx({ godRaysStrength: v })}
              />
            )}
            <Toggle label="FXAA Anti-Aliasing" value={gfx.fxaa} onChange={(v) => setGfx({ fxaa: v })} />
          </>
        )}

        {/* ── vegetation ── */}
        <Slider
          label={`Grass Density / تراکم چمن: ${Math.round(gfx.grassDensity * 100)}%`}
          min={0} max={1} step={0.05} value={gfx.grassDensity}
          onChange={(v) => setGfx({ grassDensity: v })}
        />
        <Toggle label="Waving Foliage / تکان برگ‌ها در باد" value={gfx.windSway} onChange={(v) => setGfx({ windSway: v })} />

        {/* ── color grade ── */}
        {gfx.postfx && (
          <>
            <div className="mt-1 text-[11px] text-[#ffd66e]" style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 #000' }}>
              Color Grading / رنگ‌بندی
            </div>
            <Slider label={`Exposure: ${gfx.exposure.toFixed(2)}×`} min={0.6} max={1.8} step={0.05} value={gfx.exposure} onChange={(v) => setGfx({ exposure: v })} />
            <Slider label={`Saturation: ${Math.round(gfx.saturation * 100)}%`} min={0.4} max={1.6} step={0.02} value={gfx.saturation} onChange={(v) => setGfx({ saturation: v })} />
            <Slider label={`Contrast: ${Math.round(gfx.contrast * 100)}%`} min={0.7} max={1.3} step={0.01} value={gfx.contrast} onChange={(v) => setGfx({ contrast: v })} />
            <Slider label={`Vignette: ${Math.round(gfx.vignette * 100)}%`} min={0} max={1} step={0.05} value={gfx.vignette} onChange={(v) => setGfx({ vignette: v })} />
          </>
        )}

        {/* ── performance (v0.49 — render scale works without postfx too) ── */}
        <div className="mt-1 text-[11px] text-[#ffd66e]" style={{ fontFamily: 'var(--font-mc)', textShadow: '1px 1px 0 #000' }}>
          Performance / عملکرد
        </div>
        <Slider label={`Render Scale / مقیاس رندر: ${Math.round(gfx.renderScale * 100)}%`} min={0.4} max={1} step={0.05} value={gfx.renderScale} onChange={(v) => setGfx({ renderScale: v })} />
        <Toggle label="Auto Performance / عملکرد خودکار" value={gfx.autoPerf ?? false} onChange={(v) => setGfx({ autoPerf: v })} />
        <div className="-mt-2 text-center text-[9px] leading-3 text-[#a8a8a8]" style={{ fontFamily: 'var(--font-mc)' }}>
          Lowers render scale only when fps drops — restores it automatically
          <br />فقط زمانی که فریم پایین بیاید رزولوشن را کم می‌کند
        </div>

        <McButton onClick={back} className="mt-3">Done</McButton>
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
      <div className="mb-1 text-center text-[12px] text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
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
