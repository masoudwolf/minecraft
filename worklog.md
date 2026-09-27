# 🎮 VOXELCRAFT — Minecraft-like Game (Handover / Worklog)

> **CRITICAL:** This file is the single source of truth for the whole project.
> Every agent MUST read this file before working and append a section after finishing (do NOT overwrite).
> User request (Persian): build a full Minecraft-like game — mobs, textures, tools, blocks, worlds, animations, particles, physics, menus, camera, hotkeys. Advanced graphics. Step-by-step development. Test heavily with agent-browser each round.

---

## 1. PROJECT VISION (Game Design Document)

A browser-based Minecraft clone ("VOXELCRAFT") built with **Next.js 16 + TypeScript + Three.js**, survival mode, first person, blocky voxel world. Persian-speaking user; UI in English (like real Minecraft).

### 1.1 Core Pillars
1. **Authentic Minecraft feel**: 16×16 pixel textures (procedurally generated pixel-art), blocky mobs made of boxes, cull-mesh chunks, smooth lighting + ambient occlusion, day/night cycle.
2. **Advanced graphics**: custom voxel shader (sky light + block light channels + AO per vertex), animated water with waves, fog, stars, sun/moon, blocky clouds, crack overlay while mining, particles.
3. **Full survival loop**: mine → collect drops → inventory → craft tools → fight mobs → survive nights.

### 1.2 Feature Roadmap (phases; check off as done)

**PHASE 1 — Core Engine (Session 1)** ✅ target of first build
- [ ] Procedural texture atlas (canvas pixel-art): grass/dirt/stone/cobble/sand/gravel/log/leaves/planks/glass/water/ores/bedrock/snow/bricks/TNT/crafting table/furnace/glowstone + crack stages + item icons (isometric block icons for hotbar)
- [ ] Block registry (~30 blocks) with hardness, tool, drops, light emission, transparency
- [ ] World gen: multi-biome (plains, forest, desert, snowy, mountains), caves (spaghetti+cheese), ores by depth, trees (oak+spruce), beaches, sea, bedrock
- [ ] Chunk system 16×96×16, streaming, meshing with face culling, per-vertex AO, smooth lighting
- [ ] Light engine: sky light BFS flood fill + block light (glowstone/torch), incremental add/remove on edits
- [ ] Player: AABB physics, walk/sprint/sneak/jump/swim, fall damage, pointer-lock mouse look
- [ ] Interaction: DDA raycast, hold-to-mine with crack overlay stages, place blocks, pick-block
- [ ] Item drop entities (spinning mini-blocks, magnet pickup), hotbar inventory (9 slots), block picker (Q drop, 1-9/wheel select)
- [ ] Sky: gradient fog + background lerp, sun/moon quads, stars, blocky clouds layer
- [ ] Particles: block break, landing, splash
- [ ] Audio: procedural Web Audio (dig/place/step per material, pop, hurt, splash)
- [ ] UI: main menu (Minecraft style), loading progress, pause menu, settings (render distance/FOV/sensitivity/volume/clouds), HUD (crosshair, hotbar, hearts, hunger), F3 debug overlay, death screen, save/load via localStorage
- [ ] Held block in hand with swing animation

**PHASE 2 — Mobs & Combat** (next cron rounds)
- [ ] Mob framework: box-model builder from parts, walk/limb swing animation, mob physics reuse
- [ ] Passive: pig, cow, sheep, chicken (wander AI, flee when hit, drop food/leather/wool/feather)
- [ ] Hostile: zombie (chase+melee, burns in sunlight), skeleton (arrow shooting), spider, creeper (approach → hiss → explode destroying blocks), enderman-later
- [ ] Spawn rules: hostile at night/dark, passive on grass day, caps, despawn far
- [ ] Combat: attack cooldown, knockback, damage, mob health bars via hurt flash (red tint), player damage + death
- [ ] Full inventory screen (E): 27+9 slots, drag/drop, shift-click, 2×2 crafting grid
- [ ] Crafting table (3×3) + recipes (planks, sticks, table, torches, all tools tiers, furnace, chest)
- [ ] Tools: wood/stone/iron/gold/diamond pickaxe/axe/shovel/sword/hoe, durability, mining speed multipliers, tool gating for drops
- [ ] Hunger system + food + eating anim, regen, sprint drains hunger

**PHASE 3 — World depth**
- [ ] Torch light sources placement, glowstone; furnace with smelting UI (iron ingot, glass, cooked food)
- [ ] Chests with storage UI
- [ ] Water flow simulation (simplified), lava + damage, fire
- [ ] More biomes: jungle, swamp, mushroom; flowers/tall grass cross-models; cacti; sugarcane
- [ ] Villages? (later/optional) — abandoned mineshafts? (optional)
- [ ] Beds to skip night, spawn point
- [ ] XP orbs + XP bar, enchanting placeholder?

**PHASE 4 — Polish & extras**
- [ ] Saving to Prisma DB via API route (multi-world), screenshots gallery?
- [ ] Creative mode toggle (fly, instant break, infinite blocks)
- [ ] Achievements/toasts, better sounds, music (procedural ambient)
- [ ] Performance: worker-based meshing (if needed), greedy meshing option
- [ ] Mobile touch controls? (optional)

### 1.3 Architecture contracts (MUST follow for consistency)

- **Route**: single route `src/app/page.tsx` (dynamic import, `ssr:false`). Everything client-side.
- **Engine files**: `src/game/**` — no React imports there; communicate via `src/game/state.ts` (zustand) ONLY.
- **UI files**: `src/components/game/*.tsx` — shadcn/tailwind styling, read state from zustand store, call `engine` methods through a singleton ref exported from `src/game/engine.ts` (`getEngine()/setEngine()`).
- **Chunk**: `CHUNK_SIZE=16`, `WORLD_HEIGHT=96`, `SEA_LEVEL=40`. Index: `x + z*16 + y*256`. Blocks `Uint8Array`, light `Uint8Array` (sky<<4|block).
- **Atlas**: 16×16 tiles of 16px = 256×256 canvas, NearestFilter, no mipmaps. Tile enum in `src/game/textures/atlas.ts`. UV inset half-texel to avoid bleeding.
- **Faces order**: [+X, −X, +Y, −Y, +Z, −Z].
- **Shader lighting**: attributes `aShade` (AO×face shade), `aSky`, `aBlock` (0..1); uniforms `uSunLevel`, `uFogColor`, `uFogNear/Far`, `uTime` (water waves). Final = tex × shade × max(block, sky×sun).
- **Items**: `{ blockId }` for blocks; item ids ≥ 256 reserved for non-block items (tools/food) — registry in `src/game/items.ts` (phase 2).
- **Save format** (localStorage key `voxelcraft.save`): `{seed, time, player:{pos,yaw,pitch,health,hunger,hotbar}, edits:{"cx,cz":{index:blockId}}}`.
- **Input**: WASD move, Space jump/swim, Shift sneak, Ctrl sprint, E inventory(phase2), Q drop, 1-9 hotbar, wheel select, F3 debug, Esc pause, LMB mine/attack, RMB place, MMB pick.
- **Day cycle**: 480s full cycle; sunLevel computed from sun angle; night = mobs spawn (phase 2).

### 1.4 QA Protocol (mandatory every round)
- `bun run lint` must pass; check `/home/z/my-project/dev.log` tail for errors.
- agent-browser: open `/`, start game, verify: menu renders → loading completes → terrain visible → HUD visible → mine block → drop appears+pickup → place block → pause menu → settings work → F3 shows stats. Screenshot each step. Check console errors.
- Performance sanity: FPS ≥ 40 in debug overlay with render distance 4.

---

## 2. WORK LOG (append-only, newest at bottom)

---
Task ID: 1
Agent: main
Task: research + worklog creation

Work Log:
- Inspected project scaffold (Next.js 16, shadcn/ui, prisma, zustand present)
- Web-searched Minecraft gameplay mechanics + voxel meshing/AO/lighting techniques
- Created this worklog with full GDD, roadmap and contracts

Stage Summary:
- Project scaffold understood; contracts defined; ready to build Phase 1

---
Task ID: 2 (Phase 1 — Core Engine)
Agent: main
Task: Build complete Phase 1 core engine: textures, world gen, chunks+lighting, player physics, interaction, sky, UI, audio, saves

Work Log:
- Installed three@latest + @types/three + simplex-noise
- Files created (all in src/game/):
  - constants.ts — CHUNK 16x96x16, SEA 40, physics constants
  - blocks.ts — 29 blocks registry (tiles per face, hardness, drops, lightEmit, sounds)
  - textures/atlas.ts — procedural 256x256 pixel-art atlas (38 tiles), crack stages x10, isometric hotbar icons, tile avg colors; seeded PRNG
  - world/terrain.ts — biomes (plains/forest/desert/snowy/mountains), FBM heights + ridged mountains, caves (spaghetti+cheese 3D noise), ores by depth, oak+spruce trees w/ cross-chunk margin
  - world/world.ts — Chunk class, World w/ edits map, sky-light column scan + BFS flood fill (add/remove queues, cross-chunk, water/leaves attenuation), block-light BFS, incremental relight on setBlock, chunk streaming helpers
  - world/mesher.ts — culled mesher, per-vertex AO (4-sample smooth lighting), quad diagonal flip, 3 buckets: opaque/cutout/water; water top lowered to 0.875; custom ShaderMaterial (attributes aShade/aSky/aBlock; uniforms uSunLevel/uFog/uTime; wave on water)
  - physics.ts — per-axis AABB voxel collision w/ substeps, DDA raycast
  - player.ts — controller: walk/sprint(ctrl)/sneak(shift)/jump/swim, fall damage, view bob, FOV sprint boost, health/respawn
  - entities/drops.ts — item drops (mini block meshes, gravity+float, magnet pickup, merge into hotbar), createBlockGeometry shared
  - particles.ts — GPU points, block break/land/splash/hurt bursts, fade by life
  - sky.ts — day cycle 480s, sun/moon quads, 420 stars (night opacity), blocky drifting clouds (instanced, threshold 1.04, follow player), sky/fog color palette lerp + sunset tint, sunLevel 0.14..1
  - audio.ts — WebAudio synth: dig/step per material, break, place, pop, hurt, splash, click; master volume
  - state.ts — zustand store (screen router, settings persisted, HUD state, debug info)
  - engine.ts — Game class: renderer/scene/camera, streaming (data r+1, mesh budgeted 6-7ms/frame, unload r+3), mining w/ crack overlay + progress, placing, pick-block, Q drop, hand view model + swing anim, autosave 20s + on pause, localStorage save (seed+edits+player), underwater fog, death/respawn, window.__voxel QA handle
- UI (src/components/game/): GameRoot (canvas + screen router), MainMenu (dirt bg, splash), HUD (crosshair, hotbar w/ iso icons + counts, 10 pixel-hearts, hurt flash, toast, underwater tint, item name popup), Overlays (PauseMenu, SettingsScreen w/ live sliders, DeathScreen, LoadingScreen), DebugOverlay (F3), ui.tsx (McButton/Heart/Splash/menu bg)
- page.tsx: dynamic import ssr:false; layout metadata; globals.css: --font-mc, mc-slider, splashPulse keyframes

QA (agent-browser, all verified):
- Menu renders (footer overlap fixed), New World -> loading bar -> spawn on grass ✓
- Terrain/trees/water/beach render with AO + textures ✓
- Pointer lock works; mouse look verified via pitch/yaw ✓
- Mining: raycast target -> crack -> block removed -> drop spawned ✓ (eval-verified world.getBlock==0, drops==1)
- Pickup: magnet -> hotbar gained Dirt x1 ✓ (fixed crash: missing useState import in HUD)
- Placing: RMB placed dirt on grass; hotbar count 5->4 ✓; held item view shows block ✓
- Pause menu on Esc; settings sliders persist to localStorage; Back returns ✓
- F3 debug: fps/xyz/chunk/biome/facing/time/tris ✓ (facing labels fixed: yaw=0=north)
- Save/Continue: edits+inventory+position restored ✓
- Night: sunLevel 0.14, dark world; noon sun quad visible ✓
- Clouds: double-offset bug fixed; 87 instances now visible ✓
- lint passes; dev.log clean (old compile errors were pre-fix)

Stage Summary:
- PHASE 1 COMPLETE: playable Minecraft-like core loop (mine→collect→build), authentic visuals
- Known minor items for next rounds: headless FPS ~8 (software GL — likely fine on real GPU; consider worker meshing later), clouds drift wrap jump every 12 blocks, footstep sounds only
- NEXT (Phase 2 per roadmap): mobs (box models, AI, combat), hunger/food, full inventory + 2x2/3x3 crafting, tools+tiers, torch block-light placements

---
Task ID: 3 (Phase 2a — Mobs, Combat, Hunger, Items)
Agent: main (cron round 1)
Task: QA Phase 1 + build mob framework, passive/hostile mobs, combat, hunger/food, item system

Work Log:
- QA first: server 200, lint pass, engine loads (121 chunks), no console errors
- Files created:
  - src/game/items.ts — non-block item registry (id>=256): raw porkchop/beef/chicken/mutton, leather, feather, stick, coal; 16x16 pixel-art icons (cached dataURLs) + drop-sprite canvases
  - src/game/entities/mobSkins.ts — procedural mob skins (canvas): pig/cow/sheep/chicken/zombie/creeper/skeleton; each has head(face: eyes/snout/beak/mouth/ribs)+body+limb textures, NearestFilter
  - src/game/entities/mobs.ts — MobManager + Mob entities:
    * Box models via part builders (quadruped/humanoid/creeper), per-instance cloned materials (individual hurt tint), part userData tags
    * Walk animation (diagonal leg pairs, zombie arms forward with sway), head bob, smooth yaw turn
    * AI: passive idle/walk/flee(on hurt); zombie chase<24 + melee 3dmg/1.1s + knockback; skeleton keep-distance 6-9.5 + strafe + arrow projectiles (gravity, inaccuracy, hit player 3dmg); creeper chase<13 -> fuse 1.5s (white flash + hiss, aborts if player escapes) -> explosion (radius 2.6 destroys blocks except bedrock/water, damages player+mobs by distance, chain reactions)
    * Spawning: every 1.6s, 16-42 blocks from player; hostile if effective light <6 (night/caves), passive on grass/snow-grass with daylight, herd spawns, caps 12 hostile/10 passive, despawn >64
    * Sun burning: zombie/skeleton with skyLight==15 && sunLevel>0.82 take 1dmg/s + fire particles
    * Death: fall-over rotation + red tint 0.45s -> drops (porkchop/beef/mutton/leather/feather/chicken) + particles
    * Circle shadow blobs under mobs; chicken slow-fall; mobs swim up in water; auto-jump when blocked
    * Arrows: small box meshes, lookAt velocity, stuck-on-block, 8s life
- Files updated:
  - audio.ts: mobAmbient/mobHurt per species, zombieAttack, fuseHiss, boom, bowShoot, eat, burp (distance attenuation)
  - drops.ts: non-block items render as flat spinning sprites (CanvasTexture, alphaTest)
  - engine.ts: MobManager integration (setupWorld/dispose/frameUpdate callbacks incl. explosion particles + fire particles), attack-mob priority in mineTick (raycastMob within 3.4, cooldown 0.42, 2dmg hand), eating (RMB with food when hunger<19.6: +hunger, sounds, count--), hunger drain (sprint .085/s walk .012/s idle .0015 jump .05), regen (>=18 hunger: +1hp/2s, -0.4 hunger), starve (0 hunger: 1dmg/3s to 2 hearts), HUD hunger sync
  - state.ts: hud.hunger, debug.mobs
  - HUD.tsx: hunger drumstick row (pixel SVG, right side like MC), item icons in hotbar via getItemIcon, held item = flat sprite in hand
  - DebugOverlay: mobs count line, version 0.2.0
- FIXED: hurt-flash stuck bug (cancellable timeout -> reflow-restart transition)
- MobManager.debugSpawn() public QA helper added

QA (agent-browser, verified):
- Mobs render beautifully: cow (patches+face), pig (snout+eyes), sheep, chicken ✓
- Zombie killed AFK player at night -> death screen ✓ (hostile AI proof)
- Cow combat: 3 hits (10->2hp) via aimed attacks, knockback visible ✓
- Cow killed -> dropped beef(257)x2 + leather(260)x2 -> picked up into hotbar ✓
- Eating: RMB beef -> hunger 10->13, count-- ✓; beef sprite in hand ✓
- Creeper: chased -> fused -> EXPLODED: player 20->11hp, terrain crater visible, chain-killed a pig -> porkchop drop ✓
- 6 zombies burned in daylight (hp 20->15 in ~4s), one chased ✓
- Skeleton: 2 arrow hits landed (health -6) ✓
- Natural ambient spawning works (passive herds appeared in day) ✓
- Hunger bar renders (drumsticks deplete with sprint) ✓
- No console errors; lint pass; server 200

Stage Summary:
- PHASE 2a COMPLETE: living world with 7 mob types, combat, hunger/food loop
- Deferred to next rounds: full inventory screen (E) + crafting 2x2/3x3 + tools/tiers (Phase 2b), spider+enderman, sheep wool color, hold-to-eat animation, mob spawn persistence, clouds slightly darker at night
- Recommended next (Task 4): inventory UI + crafting system + tools (mining speed multipliers + tool gating), then furnace/torch Phase 3
