// ─── Graphics settings types + quality presets ────────────────────────────────

export type GfxPreset = 'potato' | 'low' | 'medium' | 'high' | 'ultra';

export interface GfxSettings {
  preset: GfxPreset;
  /** user explicitly picked a preset (skip software-GL auto-downgrade) */
  presetUser: boolean;
  /** 0.5..1 — internal resolution scale (biggest perf lever) */
  renderScale: number;
  /** master post-processing switch (potato bypasses the whole composer) */
  postfx: boolean;
  bloom: boolean;
  godRays: boolean;
  godRaysStrength: number; // 0..1.5
  fxaa: boolean;
  /** raymarched clouds (off = original blocky clouds) */
  volumetricClouds: boolean;
  /** 0..2 → march steps 8/13/20 */
  cloudQuality: number;
  /** 0 basic · 1 planar reflections · 2 ultra (hi-res RT + sharper normals) */
  waterQuality: number;
  /** 0 off · 1 1024 · 2 2048 · 3 4096 shadow map */
  shadows: number;
  /** 0..1 → blades per grass block (0..11) */
  grassDensity: number;
  /** waving foliage — leaves wobble + plants bend in the breeze (vertex wind) */
  windSway: boolean;
  exposure: number;   // 0.6..1.8
  saturation: number; // 0.4..1.6
  contrast: number;   // 0.7..1.3
  vignette: number;   // 0..1
  /** v0.49 — atmospheric haze master: scales scene fog density, volumetric
   *  shafts, radial god rays and the Purkinje night shift. 0 = crystal-clear
   *  (fog off), 1 = tuned default, 1.5 = thick. User-reported midnight/sunrise
   *  "matte" look was fog+VLS+Purkinje stacking — one knob now rules them all. */
  haze: number;       // 0..1.5
  /** v0.49 — auto performance mode: when fps stays low, quietly lower the
   *  internal render scale (never below 60%), and climb back when there is
   *  headroom. Opt-in; the manual Render Scale slider is always respected. */
  autoPerf: boolean;
}

export const DEFAULT_GFX: GfxSettings = {
  preset: 'medium',
  presetUser: false,
  renderScale: 1,
  postfx: true,
  bloom: true,
  godRays: true,
  godRaysStrength: 0.55,
  fxaa: true,
  volumetricClouds: true,
  cloudQuality: 1,
  waterQuality: 1,
  shadows: 2,
  grassDensity: 0.45,
  windSway: true,
  exposure: 1.0,
  saturation: 1.08,
  contrast: 1.02,
  vignette: 0.3,
  haze: 0.75,
  autoPerf: false,
};

/** preset bundles — applied on top, only overriding what the preset defines */
export const GFX_PRESETS: Record<GfxPreset, Partial<GfxSettings>> = {
  potato: {
    postfx: false, bloom: false, godRays: false, fxaa: false,
    volumetricClouds: false, cloudQuality: 0, waterQuality: 0, shadows: 0,
    grassDensity: 0, windSway: false, renderScale: 0.6,
  },
  low: {
    postfx: true, bloom: false, godRays: true, fxaa: true, godRaysStrength: 0.55,
    volumetricClouds: false, cloudQuality: 0, waterQuality: 0, shadows: 1,
    grassDensity: 0.25, renderScale: 0.75,
  },
  medium: {
    postfx: true, bloom: true, godRays: true, fxaa: true, godRaysStrength: 0.55,
    volumetricClouds: true, cloudQuality: 1, waterQuality: 1, shadows: 2,
    grassDensity: 0.45, renderScale: 1,
  },
  high: {
    postfx: true, bloom: true, godRays: true, fxaa: true, godRaysStrength: 0.7,
    volumetricClouds: true, cloudQuality: 2, waterQuality: 2, shadows: 3,
    grassDensity: 0.7, renderScale: 1,
  },
  ultra: {
    postfx: true, bloom: true, godRays: true, fxaa: true, godRaysStrength: 1.1,
    volumetricClouds: true, cloudQuality: 2, waterQuality: 2, shadows: 3,
    grassDensity: 1, renderScale: 1,
  },
};

export function applyPreset(gfx: GfxSettings, preset: GfxPreset): GfxSettings {
  return { ...gfx, ...GFX_PRESETS[preset], preset, presetUser: true };
}
