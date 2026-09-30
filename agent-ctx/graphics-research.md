# Graphics Research — UE5 / Minecraft Shaders / Real-World Light Physics / Night Fear Design
Task 50-a · research-only · sources: Photon shader source (sixthsurge, fetched raw from GitHub main), Epic docs, standard photometry references.

VoxelCraft baseline (from worklog 48/49, v0.47.0): analytic scattering sky + HDR sun/moon, volumetric clouds, planar water (fresnel/waves/glints, depth aDepth tint), PCF sun shadows, cube torch shadows, screen-space god rays + ray-march VLS, bloom, ACES + smoothed auto exposure, vertex AO, cloud shadows, caustics, waving foliage, flare occlusion gating, direct/ambient indoor split. Night today: sunLevel floor 0.30 → **moon ≈ 30% of day — this is the single biggest reason night isn't scary** (big shader packs sit at 3–10%).

---

## 1. Unreal Engine 5 (from Epic docs + UE5.1+ conventions)

- **Auto exposure is EV100-based, physiologically constrained.** `exposure = exp2(-EV100)`, with light-meter constant K=12.5 (`EV100 = log2(8·L)`, L in cd/m²). UE5.1+ post-process volume: **Min EV100 = -10, Max EV100 = +20** (old Min/Max Brightness = 1.0). That's a 30-EV range — but in practice levels clamp via Exposure Compensation.
- **Adaptation is asymmetric and rate-limited**: default eye-adaptation speed ~3.0 (log-based), with separate min/max adaptation speeds; bright→dark adaptation is *slower* than dark→bright (photoreceptor bleach recovery ~seconds; dark adaptation minutes). Games override to 1.0–2.0 EV/s and clamp range to ~2–6 EV to keep "night" dark. UE also supports a **fixed EV100** mode — many stylized/horror games just lock exposure and hand-tune lights.
- **Tonemapping**: UE default is an ACES-derived filmic curve (LUT-based ACES in recent versions), applied at **EV100-relative exposure**, then film grain/vignette/DOF on top.
- **Volumetric fog** (ExponentialHeightFog with volumetric extension): physically it's an integral of scattering along the view ray with per-height exponential falloff; the "look" comes from: fog density, scattering distribution (0.5–0.9 HG anisotropy), **inscattering tinted by light color**, and volumetric shadow maps blocking the in-scatter (this is exactly what our VLS pass does — UE does it with the shadow map, same as us).
- **Virtual shadow maps**: per-light clipmap pages at 16K virtual resolution, not directly portable to WebGL2 in our budget — the lesson is *high effective shadow resolution + tight PCF filtering radius + contact-hardening*, not new passes.

Takeaway for VoxelCraft: exposure is already EV-style; what's missing is **a proper EV100 scale with asymmetric rate limits and a clamped range** (we currently lerp "target exposure from dayAmount" with no stop-based model, no min/max clamp, and no slower dark-adaptation).

## 2. Minecraft shader internals — Photon source (REAL SOURCE, fetched `raw.githubusercontent.com/sixthsurge/photon/main/shaders/...`)

### 2.1 Sun/moon light values (`include/lighting/colors/light_color.glsl` + `settings.glsl` defaults)
- **Sun exposure**: `base_scale = 7.0 * SUN_I` (SUN_I default **1.00**); `daytime_mul = 1 + 0.5*(sunset+sunrise) + 40*blue_hour` where `blue_hour = exp(-190·(sun_dir.y+0.096)²)` → blue-hour sky boost is huge (×41) — dawn/dusk read bright through *ambient*, not direct.
- **Moon exposure**: `base_scale = 0.66 * MOON_I` × moon_phase_brightness (phase 0..1) × time_boost (up to 1.33 when moon high). **Moon = 0.66 vs sun = 7.0 → moon is 9.4% of sun (≈1/10.6, ~3.4 stops).** Compare reality (~17 stops) — shader packs compress 17 EV into ~3.5 EV but keep tonemapped contrast.
- **Moon tint**: `MOON_R/G/B = 0.75/0.83/1.00` (sRGB → ≈ #BFD4FF, perceptually ~8500–9500K, *not* the physical 4100K of real moonlight; packs exaggerate the blue because viewers read "cold blue" as night).
- **Sun tint (noon)**: 1.0/1.0/1.0; morning/evening tint `(1.05,0.84,0.93)×1.2`; blue-hour tint `(0.95,0.80,1.0)`.
- Direct light fades with `rcp(0.02)·light_dir.y` clamp and a 25% dip exactly at horizon transit.

### 2.2 Night ambient / skylight (`include/lighting/diffuse_lighting.glsl`)
- Skylight falloff is **quadratic**: `sqr(skylight)` (cave darkness grows fast).
- `get_skylight_boost()`: +50% ambient exactly in early night (the transition after sunset) — prevents a "black hole" moment.
- Cave fill light: `0.15·(1 - skylight²)` — caves never go below a 15% directional "presence" even at 0 sky light.
- Bounced light (one-bounce GI proxy): `0.033·(1-shadow)·(1-0.1·max0(n.y))·pow1_5(ao)·pow4(skylight)·BOUNCED_LIGHT_I` — shadowed faces pick up ~3% bounce, only outdoors.

### 2.3 Torch/blocklight (`blocklight_color.glsl` + settings defaults)
- **Blocklight tint R/G/B = 1.00/0.75/0.63 (sRGB ≈ #FFBFA1 ≈ 2400–2600K flame)**, `blocklight_scale = 6.0`, `emission_scale = 40`.
- Falloff: `pow8(bl) + 0.18·bl² + 0.16·dampen(bl)` → **steeper-than-linear tail**: torch pools have hard falloff edges (this is the fear-factor look: the pool ends abruptly). Plus `min(2.7·pow12(bl), 0.9)` hot core, and **-20% blocklight in daylight** (`1 - 0.2·noon·sky - 0.2·sky`) so torches look redundant at noon and vital at night.

### 2.4 Water absorption (`settings.glsl` defaults + `include/fog/water_fog_vl.glsl`)
- Seen from air: `WATER_ABSORPTION_R/G/B = 0.39 / 0.14 / 0.07` per meter, `WATER_SCATTERING = 0.01`.
- Seen from underwater: `0.20 / 0.08 / 0.04` per meter, `WATER_SCATTERING_UNDERWATER = 0.03` — **red is absorbed 5× faster than blue**; transmittance `exp(-(σa+σs)·d)`, multiple-scattering approximated by 4 iterations of `sqrt(light_transmittance)` × halved weight.
- Underwater fog is a ray march (16–25 steps, max ray 50 m) sampling the sun shadow map per step + a two-layer noise caustics function (`0.67·n(dir0·t) + 0.33·n(dir1·t)`, sharpened via `linear_step(0.4,0.5)+0.15`) modulating the in-scatter — same family as our VLS/caustics.
- Water surface normals: distance-attenuated waves; specular uses GGX; fresnel via F0=0.02.

### 2.5 Purkinje shift (`include/misc/purkinje_shift.glsl`) — Photon has it ON by default
- `intensity = 0.05·PURKINJE_SHIFT_INTENSITY` (default 1.0); gated OFF above `sun_dir.y > -0.06` (day), scaled down by blocklight `clamp01(1-blocklight)` and by underground `0.3+0.7·cube(max(skylight, eye_skylight))`.
- Algorithm: scotopic luminance via the CIE-based estimate `scotopic = xyz·(1.33·(1+(y+z)/x) - 1.68)`, rod response weights `(7.15e-5, 0.481, 0.328)` (rec2020), **final tint `vec3(0.5,0.7,1.0)`**, mix factor `exp2(-intensity⁻¹ · scotopic)` → deep shadows become blue-steel while torch pools keep warm color. Directly portable as a pure fragment-shader mix.

### 2.6 Auto exposure (`program/c4_taa_exposure.fsh/.vsh`)
- **Default is `AUTO_EXPOSURE_OFF`** — Photon hand-balances sun=7.0 vs moon=0.66 so *no exposure change is needed* ("Magic brightness adjustment so that auto exposure isn't needed"). Histogram mode exists: 32 bins, EV100 log-space, `AUTO_EXPOSURE_MIN=-1.0`, `MAX=0.0` EV, bias 0, rates **dim→bright 2.0 EV/s, bright→dim 1.0 EV/s** (adaptation to darkness is half speed — matches physiology), calibration `exp2(bias)·12.5/sensitivity/1.2`.
- Tonemapping: **ACES RRT+ODT fit with ×1.6 pre-exposure** + ODT global desaturation; alternatives Lottes/Hejl2015/Uncharted2/Ozius.

### 2.7 BSL / Complementary / SEUS PTGI (from official pages/docs)
- **SEUS PTGI**: path-traced GI + RT reflections; water "clear and fluid", foliage breathing sway — its night is famously near-black away from moon light shafts.
- **Complementary Reimagined/Unbound**: two style presets; realism comes from tight light balancing (night ~5–10% of day), detailed puddles/rain, and *contour shading* (per-face directional differentiation) rather than new passes.
- Common pack pattern we lack: **exposure-locked HDR design** — they pick *one* sun scale and *one* moon scale and let the tonemap handle the rest, rather than animating exposure through the day (exposure animation is what causes "night never feels dark").

## 3. Real-world lighting numbers (standard photometry; cross-checked with pack sources)

| Condition | Illuminance (lux) | Scene luminance (cd/m²) | EV100 | Notes |
|---|---|---|---|---|
| Direct noon sun | 100,000–120,000 | ~10,000 | ~15–16 | sun disc 1.6×10⁹ cd/m² |
| Overcast day | 1,000–10,000 | 100–1,000 | 12–13 | soft ambient only |
| Sunrise/sunset | 300–800 | 30–80 | 10–11 | sky dominates |
| Civil twilight | 3–40 | 0.3–4 | 4–7 | "blue hour" |
| **Full moon, clear** | **0.05–0.3** | **0.005–0.03** | **≈ -2…-3.5** | sun:moon ≈ 4–6·10⁵ : 1 (≈17–19 EV) |
| Quarter moon | ~0.01 | ~0.001 | ≈ -5 | |
| Starlight only | 0.0003–0.001 | 3×10⁻⁵–10⁻⁴ | ≈ -6…-7 | clear, moonless |
| Moonless overcast | ~0.0001 | 10⁻⁵ | ≈ -8 | "absolute dark" feel |
| Candle @1 m | ~10 | 1 | ~8 | flame 1850–1900 K |

- **Color temperatures**: sun 5778K (≈6500K at ground with sky), sunset 2000–3000K, **real moonlight ≈ 4100K** (reflected sun) but perceptually/gamewise rendered 7000–10000K blue; torch flame ≈ 1900–2400K; rod (scotopic) peak 507 nm vs cone (photopic) 555 nm.
- **Purkinje effect** (mesopic 0.001–3 cd/m²): blues/greens appear relatively brighter, reds darken to near-black; "blue flowers glow, red petals vanish". Photon implements exactly this with tint `(0.5,0.7,1.0)` at 5% strength.
- **Underwater attenuation (clear ocean, per meter)**: absorption at 680 nm ≈ 0.45 /m, 600 nm ≈ 0.22 /m, 550 nm ≈ 0.06 /m, 475 nm ≈ 0.005 /m. Practical bands: **red gone by ~5–10 m** (1/e at ~2.3 m), orange/yellow by ~20–30 m, green by ~50–80 m, **blue survives 100–200 m**; aphotic below 1000 m. Diffuse attenuation Kd(490) ≈ 0.02 /m open ocean → **1% light ("euphotic") depth ≈ 100–200 m**; coastal Kd ≈ 0.1–0.2 → 25–45 m. **Visibility (Secchi/horizontal)**: clear ocean 40–60 m, coastal 5–15 m, turbid < 3 m. Caustics strongest in 0–5 m depth band and scale with solar elevation.
- Game-compression rule: keep the *hue ordering* (R dies first, B last) but compress 100 m into ~10–20 m and ~17 EV into ~3–5 EV.

## 4. Night fear-factor design (survival/horror practice)

- **Ambient night level**: horror/survival titles keep open night at **1–6% of day luminance** (Valheim ~4–5× darker + desaturated; shader packs 3–10%). VoxelCraft's 30% reads as "dim day", not night.
- **Moon as a *directional pool*, not a fill light**: moonlit clearings ≈ 5–10% of day sun; everything else 1–3% with a cold tint. Contrast between pool and surroundings is what creates fear (players hug the light).
- **Torch-pool contrast**: torch ≈ 80–100% brightness with warm 1900–2600K tint, hard falloff edge (pow⁸-style tail), so torch:ambient contrast ≥ 20:1 → tunnel-vision effect. Flicker ±10% (we have ±10% already — good).
- **Exposure discipline**: cap auto-exposure at ~2–3 EV total swing and make dark-adaptation slow (1 EV/s); if exposure "rescues" night, fear disappears. Better: exposure OFF at night (Photon approach — balance values instead).
- **Desaturate + blue-shift at night, restore saturation in torch light** (Purkinje). Grain/vignette at night adds tension (cheap, optional).
- **Audio/spacing**: danger should be *visible only at the edge of the torch pool* (silhouettes at 10–15 m). This needs mobs NOT double-darkened (we fixed that in v0.45) but also moon rim-lighting so silhouettes read.

---

## ACTION LIST for VoxelCraft (ranked by impact/cost; Three.js/WebGL2-implementable)

### A. Uniform/light-value only (no new passes — do these first, they ARE the night rework)
1. **Night value overhaul (highest impact, ~1 h)**: replace sunLevel floor 0.30 with `moonI ≈ 0.07–0.10` direct + `nightAmbient ≈ 0.03–0.05` sky fill (Photon: moon 0.66/7 = 9.4% direct; skylight floor near 0). Keep current 0.30 floor only as an optional "cozy" preset; survival default = dark. Update scene ambient, fog color, god-ray VLS night gain, mob/hand tints (already normalized), water night reflection gain to match.
2. **Moon color/tint**: set moon light tint to sRGB (0.75, 0.83, 1.00) ≈ #BFD4FF and moon *sky* glow slightly blue; moon phase scales direct light 0.3–1.0 (new-moon nights nearly black = scary milestone).
3. **Purkinje shift pass (uniform-only)**: in the grade/ACES fragment, compute scotopic luminance (Photon formula `xyz·(1.33(1+(y+z)/x)−1.68)`), mix toward tint (0.5, 0.7, 1.0) with `exp2(−20·scotopic)`, gated by scene luminance + sky exposure + reduced under torch light. ~15 lines GLSL in postfx.
4. **Torch pool reshaping**: reshape torch falloff tail toward Photon's `pow8(bl)+0.18·bl²+0.16` curve + hard edge; add `−0.2·day` term so torches matter only at night; torch tint ≈ (1.0, 0.75, 0.63). Flicker stays ±10%.
5. **Torch-pool contrast setting**: "Scary Night" preset = moon 0.08, ambient 0.04, VLS night strength ↑, star brightness ↑ (stars visible at 0.1 lux), Milky Way faint; "Readable Night" preset = current 0.30.
6. **Asymmetric, clamped exposure**: replace current 1.4/s single-rate lerp with EV-style: bright→dim 1.0 EV/s, dim→bright 2.0 EV/s, total range clamp ≈ 2.5–3 EV, and *disable exposure lift entirely at night* (Photon's OFF approach) — night exposure fixed, day/sunset ±1 EV only.
7. **Blue-hour boost**: sun/sky ambient multiplier `1 + 0.5·sunset + 40·blueHour²` (Photon) → dawn/dusk are vivid and the sun-down transition drops fast into darkness (the scary "lights out" beat).
8. **Night bounce/reject**: shadowed-outdoor bounce term `0.033·(1−shadow)·pow1_5(ao)·pow4(sky)` so moonlit shadows aren't flat black; caves keep the 0.15 cave-fill (already have).
9. **Water absorption from real coefficients (uniform-only)**: use Photon-style per-meter `exp(−(σa+σs)·d)` with σa from air ≈ (0.39, 0.14, 0.07) and underwater ≈ (0.20, 0.08, 0.04), scattering 0.01/0.03 — replaces the current (0.011) single-rate depth fade; shallow band stays sandy only ≤ ~2 m, red dies by ~5 "voxel-meters", deep = pure blue-black.
10. **Night fog/sky tint**: night fog ≈ (0.02–0.04) luminance with blue tint; horizon glow only on moon side; star twinkling + Milky Way visible (already built) at the darker exposure.

### B. New pass / structural (bigger cost — queue after A is verified)
11. **Underwater fog ray-march** (Photon water_fog_vl, 12–16 steps): in-scatter from sun shadow map + caustics function + HG(0.5) phase, 4-iteration multiple-scattering approx; gives underwater light shafts and murk with depth — reuses existing DepthTexture + shadow map from v0.47.
12. **One-bounce bounce-light proxy for torches**: screen-space or neighbor-sampled second lighting pass for warm bounce around torch pools (Photon has this via LPV/Photonics; a cheap 1-tap screen-space variant gets 80% of the look).
13. **Sky SH ambient (from Photon d4a_generate_sky_sh)**: bake the analytic sky into 9 SH coefficients per frame and evaluate ambient per-normal (current: single ambient term) → sunsets tint the *ground* differently by face direction, night ground is cooler than sky. Medium cost, big material-feel gain.
14. **Noise/dither grain + subtle vignette at night** (uniform-only, postfx): raises perceived darkness without crushing shadows; strength ∝ (1 − luminance).
15. **Moon god-rays**: allow the existing VLS/god-ray pass to use moon direction with moon tint at night (partially exists; needs the new darker night values so shafts read).
16. **Contact-hardening PCF**: shadow radius shrinks with occluder distance (variance estimate of PCF taps) — the VSM "quality" look without VSM.
17. **SSAO/GTAO-lite at half-res** (deferred until perf pass): Photon uses GTAO+SSAO; on our vertex-AO baseline the marginal gain is small — only if frame budget allows after 1–10.

**Suggested order**: 1→2→4→7→10 (one evening of value tuning, transforms night), then 3+6+8, then 9, then presets 5, then queue B by perf budget.
