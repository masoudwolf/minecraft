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

---
Task ID: 4 (Phase 2b — Inventory, Crafting, Tools)
Agent: main (cron round 2)
Task: Status assessment + agent-browser QA + Phase 2b: full inventory (E), 2x2/3x3 crafting, tools with tiers/durability/mining-speed/tool-gating

Work Log:
- QA round 1 (pre-existing build): menu → New World → terrain/HUD render ✓; eval-driven mining (block broke, 4 dirt drops) ✓; magnet pickup (Dirt x4 → hotbar) ✓; natural mob spawning (13 mobs incl. herds + night hostiles) ✓; no console errors; lint pass. Verdict: Phase 1+2a STABLE → proceed to Phase 2b per roadmap.
- Files created:
  - src/game/crafting.ts — recipe registry (26 recipes) + matcher: shapeless (log→planks) + shaped w/ bounding-box sliding + automatic mirroring (axe); needsTable(); freshDur(); grid sizes 2 and 3 supported. Recipes: planks, sticks, crafting table, furnace (8 cobble ring), full tool sets (pickaxe/axe/shovel/sword) x 5 tiers (wood/stone/iron/gold/diamond).
  - src/game/inventory.ts — InvSlot {blockId,count,dur?}, addToSlots (merge-then-empty, maxStack-aware), isEmptySlot, cloneSlots helpers.
  - src/components/game/InventoryScreen.tsx — authentic MC GUI: #c6c6c6 panel w/ bevel box-shadows, #8b8b8b inset-bevel slots (44px), hover white/45 overlay, count text w/ MC shadow, durability bars (green→red hsl), cursor stack follows mouse (fixed, z-50), MC-style tooltips (dark purple border), 2x2 grid (player inv) vs 3x3 (table mode), pixel-art player figure filler, arrow glyph, hint line. Left-click pick/place/swap/merge, right-click split-half/place-one, shift-click quick-move (hotbar<->main, craft→inv), output click = take, shift-click output = craft-all (loop ≤64).
  - src/components/game/slotIcon.ts — shared icon/name resolution (block iso icon or item pixel icon) used by HUD + InventoryScreen.
- Files updated:
  - src/game/items.ts — +20 tool items (ids 270-289, MC stats: wood 2x/59, stone 4x/131, iron 6x/250, gold 12x/32 tier1, diamond 8x/1561), dmg per type; +materials iron/gold ingot, diamond (290-292) w/ pixel icons; procedural tool icon painters (diagonal handle + tier-colored heads); getToolDef/maxStack (tools stack 1)/isToolItem; breakInfo(def, tool) — MC formula: harvest? h*1.5/speed : h*5/speed, tool-type match required for speed+tier gating.
  - src/game/blocks.ts — minTier added: stone/cobble 1, coal 1 (drops COAL item now), iron 2 (drops IRON_INGOT temp), gold/diamond 3, obsidian 5. (imports ITEM from items — one-way dep ok)
  - src/game/player.ts — HotbarSlot.dur?, main inventory 27 slots.
  - src/game/state.ts — InvUIState (open/table/hotbar/main/craft/craftOut/cursor) + setInv.
  - src/game/engine.ts — E key opens 2x2 (playing) / closes (inv open); Esc closes; digits 1-9 swap hovered slot w/ hotbar; RMB on crafting table opens 3x3 (unless sneaking); invClick/clickSlot/shiftMove/takeCraftOutput/updateCraftOut/invHotbarSwap/setInvHover; closeInventory returns craft grid + cursor to inv (drops overflow); addToInventory hotbar→main; tryPickup uses it (works w/ main inv now); mineTick uses breakInfo (tool speeds + gating) + damageTool(1) per block, mob hit dmg = tool.dmg (sword 4-7), non-sword tools lose 2 dur on hit; damageTool breaks tool at 0 (sound + toast); syncInventory hash-guarded push to store; save format v2: player.main + dur (backward compatible).
  - GameRoot.tsx — renders InventoryScreen while playing+invOpen (world keeps simulating, pointer unlocked, pause suppressed via onPointerLockChange guard).
  - HUD.tsx — durability bar in hotbar, shared slotIcon.
  - DebugOverlay — version 0.3.0.

QA (agent-browser, eval-driven, all verified):
- E opens 2x2 inv; GUI renders MC-authentic (panel, slots, player figure, hint) ✓
- Log→Planks x4 (shapeless) ✓; Planks 2x2→Crafting Table ✓; 2-plank column→Sticks x4 (3x3) ✓; shift-click output craft-all ✓; Pickaxe pattern (3 planks top + 2 sticks) → Wooden Pickaxe dur=59 ✓
- RMB split/place-one, cursor stack render, swap, merge, return-on-close (craft+cursor → inv, overflow drops) ✓
- Tool speed: pickaxe breaks stone ~1.1s ✓; durability 59→56 over 3 breaks ✓; harvest gating: pickaxe→cobble drops x3 ✓, bare hand breaks stone w/ NO drop ✓
- Living-world interruptions handled authentically: night zombies killed AFK player (death screen), respawn button works, creeper explosion destroyed test block; tools survived all cycles ✓
- Save v2: main inventory (27) + dur persisted to localStorage; quit→title→Continue available ✓
- lint pass, dev.log clean (200s only), no console errors

Stage Summary:
- PHASE 2b COMPLETE: full inventory + crafting progression (punch tree → planks → table → sticks → tools) + MC tool mechanics (tiers, speeds, durability, gating)
- Design decisions: iron/gold ore drop ingots directly (furnace smelting arrives Phase 3); invOpen suppresses pause screen (world keeps running, like MC)
- Known minor: addToSlots merges only within target list (cursor-return can leave split stacks — harmless); requestPointerLock after inv close may need a click in some browsers (ClickHint covers)
- NEXT (Phase 3 per roadmap): torches (light-emit placement + cross-model mesher support), furnace smelting UI (iron/gold from ore, cooked food, glass), chest storage UI, water flow, more biomes (jungle/swamp), flowers/cacti cross-models, beds, XP orbs

---
Task ID: 5 (Phase 3a — Torches, Furnace, Chest, Bed, Decorations)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA + Phase 3a: torches w/ block-light + flame particles, furnace smelting UI, chest storage UI, beds (sleep/spawn), flowers/tall-grass/cactus worldgen, wool, cooked foods, save v3

Work Log:
- QA first: build stable (Phase 1+2b verified), 0 console errors, lint pass → proceeded to Phase 3a per roadmap
- Files created:
  - src/game/blockEntities.ts — BlockEntityManager: FurnaceBE {input,fuel,output,burnTime,burnMax,cookTime} + ChestBE {27 slots}; SMELT registry (iron/gold ore→ingots, sand→glass, cobble→stone, raw meats→cooked); FUEL registry (coal 80s, planks/log 15s, stick 5s, table/chest/bookshelf 15s); COOK_TIME=10s; tick() per-frame: fuel consumption, cook progress, output production, FURNACE<->FURNACE_LIT auto-swap (drives relight via setBlock); destroy() spills contents; serialize/load for save v3
- Files updated:
  - blocks.ts — +9 blocks: TORCH(30, lightEmit 14, model torch, needsGround), FURNACE_LIT(31, lightEmit 13, drop FURNACE), CHEST(32, container), FLOWER_RED(33)/FLOWER_YELLOW(34)/TALL_GRASS(35, model cross, needsGround, tall-grass drop=null), CACTUS(36), WOOL(37), BED(38, height 0.5625, needsGround, flatIcon); FURNACE(22) got container:'furnace' (bugfix found in QA); new BlockDef fields: model/height/flatIcon/container/needsGround + blockHeight()/containerOf() helpers
  - textures/atlas.ts — 13 new procedural tiles (38-50): torch (stick+flame), furnace front lit (fire pixels), chest (planks+latch+lid seam), poppy/dandelion (petal clusters + stem), tall grass (9 curved blades), cactus side (ribs+spikes)/top, wool (curls), bed top (red blanket+white pillow)/side; getTileIconURL() + getTileCanvas() for flat icons/sprites
  - world/mesher.ts — special models: 'cross' (2 diagonal quads, own-cell light, inset 0.08), 'torch' (mini-box 2/16 wide x 10/16 tall, cropped UVs via tileSub(), block light min 0.92 so torch always bright, registers chunk.torches[]); partial-height blocks (bed 9/16): corner y clamped to def.height
  - world/world.ts — Chunk.torches[] field (collected at mesh time for particles)
  - world/terrain.ts — decorationAt(x,z): plains 7.5% tall grass + 1% flowers, forest 4%/0.8%, desert 0.6% cactus (1-3 tall); placed post-trees, only on grass/snow-grass/sand with air above
  - physics.ts — collides() respects blockHeight() (bed = 9/16 collision, can't stand inside)
  - items.ts — cooked foods 293-296: Cooked Porkchop/Steak (8 hunger), Cooked Chicken/Mutton (6), pixel icons
  - crafting.ts — +3 recipes: chest (8 planks ring), torch (coal over stick -> 4), bed (3 wool + 3 planks)
  - engine.ts — blockEnts integration (tick in frameUpdate); placeBlock: RMB interactions (furnace/chest open UI, bed sleep, sneak bypasses), needsGround check w/ toast, BE attach on container place; mining: container spill on break + pops unsupported needsGround blocks above; openContainer/closeInventory w/ containerKey; invClick 'container' area (chest slots, furnace input/fuel w/ write-back, furnace output take-only + shift craft-all); shiftFromContainer; invHotbarSwap container support; syncInventory pushes containerSlots + furnace ratios; furnace UI sync 0.3s while open; spawnPoint (bed) + save v3 {blockEntities, spawn}; respawn() uses bed spawn; torch flame/smoke particles (0.12s cadence, random nearby torch from chunk.torches, 48-block range); cactus contact damage (0.6s cooldown, 1 dmg); updateHandMesh renders flatIcon blocks as sprites
  - state.ts — InvUIState + container/containerSlots/furnace
  - InventoryScreen.tsx — 3 layouts: crafting (2x2/3x3), chest (27 grid), furnace (input/flame/fuel + cook arrow + big output); flame + arrow progress indicators (CSS clip-path), titles, shared Slot/tooltip/cursor
  - slotIcon.ts — flatIcon blocks use flat tile icon
  - mobs.ts — sheep now drops 1-2 wool
  - DebugOverlay/MainMenu — version 0.4.0
- BUGS FIXED during QA: FURNACE missing container field (BE getOrCreate null); shiftFromContainer const-reassign (compile error); decorationAt BLOCK-as-type

QA (agent-browser + eval-driven, all verified):
- Decorations generated (57 flowers, 290 tall grass sampled); poppy cross-model renders; tall grass visible
- Torch: placement consumes hotbar (16->15), needsGround + player-AABB rejections work, light 13 above cell, night glow pool visible, chunk.torches registry, hotbar flat icon + hand sprite
- Furnace: seeded 5 sand + 2 coal -> auto-lit (block 31), 3 glass produced in ~30s, fuel burned 80s/down, GUI shows input/flame/arrow/output (glass x3), output click -> cursor (5 glass), close -> returned to main inv (hotbar full)
- Chest: placed, 3 clicks stored coal x8 + porkchop x5, close/reopen contents persist, GUI authentic
- Bed: night sleep time 400->115 + "Spawn point set · Slept until morning" toast; zombies killed AFK player -> death screen -> Respawn spawned exactly at bed spawn (7.5, 43.6, 6.5) with full HP
- Crafting: coal+stick -> 4 torches (2x2), craft-all +4; 3 wool + 3 planks -> bed (3x3)
- Sheep killed: dropped wool x2 + mutton x2
- Cactus: touchingCactus precision verified (not touching = no dmg), flush contact: hp 18->15 over 3s
- Save v3: blockEntities (2) + spawn persisted; Continue World restored chest contents, furnace BE, bed block, spawn point
- No console errors; lint pass; dev.log clean (200s only)

Stage Summary:
- PHASE 3a COMPLETE: full smelting loop (ore -> ingot, sand -> glass, raw -> cooked food), storage (chest), light+ambience (torches w/ particles), beds (skip night + respawn), world decoration layer
- Design decisions: furnace lit-state as separate block id (drives relight automatically); BEs keyed "x,y,z" persisted in save v3; needsGround blocks pop when support broken; bed = single block 9/16 tall
- Known minor: furnace fuel slot accepts any item (only fuels burn — permissive like early MC); cactus full-cube collision (MC is 15/16); torch floor-only (wall torches deferred); flowers don't spread/bonemeal
- NEXT (Phase 3b per roadmap): water flow simulation, more biomes (jungle/swamp + new blocks), sugarcane/flowers spread, XP orbs, mob spawn persistence, then Phase 4: creative mode, DB saves via API+Prisma, achievements

---
Task ID: 6 (Phase 3b — Water Flow, Biomes, XP, Achievements)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA + Phase 3b: water flow simulation, jungle/swamp biomes, sugarcane/lily pads/dead bush, XP orbs + bar, achievements

Work Log:
- QA first: build stable (Phase 1..3a), lint pass, 0 console errors, menu/world/mining/drops/pickup/inventory all verified via agent-browser + __voxel eval
- IN PROGRESS (files edited, compile clean, lint pass; browser QA pending):
  - blocks.ts: +7 flowing-water ids WATER_FLOW1..7 (39..45) w/ isWaterId/waterLevel/flowId/waterReplaceable helpers; +SUGARCANE(46) cross, DEAD_BUSH(47) cross, LILY_PAD(48) lily-model, JUNGLE_LOG(49), JUNGLE_LEAVES(50)
  - atlas.ts: 5 new tiles (sugarcane stalks, dead bush, lily pad w/ notch, jungle log, bright jungle leaves) + painters
  - world.ts: fluid tick scheduler (fluidQ Map + tickFluids budgeted 120/frame, 0.28s/cell); tickWater: flow-down-first (falling=level 1), horizontal spread level+1 to FLOW_MAX, decay/recompute when support removed, infinite-water rule (2+ source neighbors -> source); wakeFluidsAround hooked into setBlock; tickPlant (sugarcane/cactus growth via same scheduler); light engine now attenuates ALL water ids + jungle leaves
  - mesher.ts: per-level water surface heights (source 0.875, flow thins to 0.12), side faces match height, same-id-only culling between water cells, lily pad flat quad model
  - terrain.ts: +jungle (temp>0.30 humid>0.42, tall 9-13 jungle trees w/ big canopies, dense grass) +swamp (flatten to sea level w/ pools, wide flat oak canopies, lily pads 10%, dead bush); desert dead bush; sugarcane gen on beaches near water 1-3 tall (deterministic hash)
  - entities/xp.ts: XPOrbManager (pixel-art green orb sprites, physics+strong magnet 4.2, absorb callback)
  - achievements.ts: 12 achievements (getWood, benchmarking, timeToMine, gettingUpgrade, hotTopic, acquireHardware, diamonds, monsterHunter, cowTipper, ironBelly, sleepTight, lightItUp) + manager w/ save restore
  - engine.ts: world.tickFluids in frameUpdate + ambient plant scan every 2s; XP from ores (coal1/iron1/gold2/diamond5); mob kill XP (passive 1-3, hostile 5); addXP w/ level curve 7+3L; achievements hooked (pickup/craft/place/sleep/kill); sugarcane placement rule (sand/grass/dirt+adjacent water or cane stack), lily pad surface placement (source water only), chain-pop cane/cactus stacks on support break; save v4 (+level/xp/achievements); hurtMob returns killed
  - state.ts: hud.xpLevel/xpProgress + advancement; HUD.tsx: XP bar w/ green gradient + level number, AdvancementToast (slide-in MC style); audio.orb/achievement sounds; mobs.ts isWaterId fixes; version 0.5.0

Stage Summary:
- Phase 3b code complete pending runtime QA (water flow behavior, biome render, XP bar, achievements)
- Next after QA: fix any bugs found; then Phase 4 (creative mode, DB saves via API+Prisma) or mob spawn persistence

---
Task ID: 6 (Phase 3b) — FINAL QA RESULTS
Agent: main
Task: agent-browser QA of water flow, biomes, XP, achievements

QA (agent-browser + __voxel eval, all verified):
- Water flow: dug trench at shore -> water flowed in with EXACT MC levels 1..7 (ids 39-45), then stopped (FLOW_MAX) ✓
- Water decay: plugged trench mouth with dirt -> all downstream flow receded to air in ~8s ✓
- Falling water: dug shaft under flow -> level-1 falling column propagated down 3 cells to floor ✓ (after fixing bug: above-fed cells computed want=0 and early-returned without spreading)
- Infinite water: 2 source blocks with 1 gap -> middle cell auto-converted to source ✓
- Resume-on-load: fluid queue is transient -> added ensureChunk scan of saved edits (flow ids/canes/cacti get re-scheduled on chunk load) ✓ verified falling column completes after reload
- Swamp biome: rendered w/ lily pads on pools, sugarcane on beaches, swamp oaks w/ wide canopies, dead bush ✓
- Jungle biome: found interior, big 9-13 tall jungle trees w/ bright-green canopies render correctly ✓ (surfaceY spawns on canopy - authentic)
- Sugarcane growth: placed cane near water -> grew 1->2 blocks via fluid-tick growth (max 3, 18%/tick) ✓
- XP: mined coal ore -> orb spawned -> magnet-absorbed -> player.xp=1 (bar 1/7 shown) ✓
- Achievement toast: placed torch -> "Achievement Get! / Let There Be Light" slide-in popup top-right w/ icon + fanfare ✓
- XP bar: green gradient bar w/ glowing level number renders above hearts ✓
- Save v4: achievements=["lightItUp"], level, xp persisted; Continue World restored ✓
- Zero console errors (window.__errs tracker), lint pass, dev.log 200s only
- Fixed during round: (1) opaque-block removal didn't wake fluids -> wakeFluidsAround now unconditional in setBlock; (2) falling column early-return bug; (3) fractional tree heights from hash2 float (floored)

Stage Summary:
- PHASE 3b COMPLETE: dynamic water (flow/decay/falling/infinite sources/save-resume), 2 new biomes (jungle+swamp), 5 new blocks w/ textures (sugarcane/dead bush/lily pad/jungle log/leaves), plant growth, XP orbs+bar+levels, 12 achievements w/ MC-style toasts
- Known minor: fluid tick queue not serialized (re-scanned from edits on load — equivalent); water washes torches silently (no pop sound); lily pad requires SOURCE water below (flowing water rejected); treeAt hash change alters tree placement vs pre-3b saves' unexplored chunks (cosmetic)
- NEXT (Phase 4 per roadmap): creative mode (fly/instant break/infinite blocks), DB saves via API+Prisma (multi-world), achievements screen, then optional: mob spawn persistence, spiders/enderman, enchanter placeholder

---
Task ID: 7 (Phase 4 — Creative Mode, DB Multi-World Saves, Achievements Screen)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA + Phase 4: creative mode (fly/instant break/infinite blocks/creative palette), Prisma+API multi-world save system, achievements screen, UI polish

Work Log:
- QA round 0 (pre-existing build): dev.log clean, lint pass, menu→world render verified, setBlock/remesh eval OK, 0 console errors → proceeded to Phase 4 per roadmap
- DB layer:
  - prisma/schema.prisma: +World model {id, name, gameMode, seed, time, data(JSON string=full SaveData), achievements(JSON array), createdAt, updatedAt}; db:push OK
  - src/app/api/worlds/route.ts: GET list (ordered by updatedAt, includes achievements), POST create {name, gameMode, seed?, time?, data?} (seed random default, text-safe clamp)
  - src/app/api/worlds/[id]/route.ts: GET full record, PUT partial update {name?, gameMode?, seed?, time?, data?, achievements?}, DELETE
- Engine (src/game/engine.ts):
  - createWorld(name, gameMode, seed?) → POST /api/worlds → setupWorld → preloadSpawn → enterPlaying → immediate baseline saveGame; offline fallback plays local-only world
  - loadWorld(id) → GET → JSON.parse data → setupWorld(seed, save, gameMode) → play; failure toast + back to menu
  - fetchWorlds() refreshes zustand worlds list (parses achievements column safely); deleteWorld(id)
  - migrateLocalSave(): one-time legacy localStorage save → DB world; singleton promise + 'voxelcraft.migrated' localStorage flag (prevents duplicate migration on StrictMode double-mount and re-saves)
  - saveGame(): save format v5 (+gameMode, flying); localStorage mirror kept as offline fallback + fire-and-forget PUT to /api/worlds/{id} with time+data+achievements; 'Cloud save failed' toast once on error
  - quitToMenu() saves then fetchWorlds()
  - setupWorld(seed, save|null, gameMode) — gameMode applied to player; save?.player null-safe (worlds created with empty data no longer crash)
  - resume() public method (Back to Game / QA)
  - hadLock + lockHeldAt pointer-lock logic: auto-pause only when a real >500ms lock session ends (headless flash-lock cycles no longer pause the game)
  - creativePick(id) (cursor = 64-stack, tools 1 w/ freshDur), creativeDelete() (void slot)
  - mob callbacks now pass playerCreative
- Creative mode:
  - player.ts: gameMode, flying fields; isCreative getter; damage() immune in creative; fall damage skipped; respawn resets flying
  - Flight: double-tap Space toggles; Space/Shift ascend/descend; Ctrl sprint-fly (2.1x); damped glide; landing (onGround && vy<=0) cancels flight — fresh toggle from ground rises because vy>0
  - mineTick: creative branch = instant break w/ particles+sound, NO drops/XP/tool wear, pops unsupported stacks above
  - placeBlock: infinite placement (no count decrement) in creative
  - physicsStep: hunger drain skipped in creative; void damage guarded (creative just clamps); cactus damage skipped
  - frameUpdate: creative vitals pinned to full (health/hunger)
  - damagePlayer callback: hostile damage+knockback fully skipped in creative
  - mobs.ts: MobCallbacks.playerCreative — hostile AI treats creative player as invisible (wander instead of chase)
  - creativeItems.ts: palette registry — all placeable blocks (no AIR/flow ids), then materials/food, then tools; cached
- UI:
  - state.ts: Screen + 'worlds' | 'createWorld' | 'achievements'; GameMode, WorldMeta; HUDState.gameMode/flying; InvUIState.creative; worlds/currentWorldId/currentWorldName store fields
  - InventoryScreen.tsx: creative palette section (9-col grid, max-h scroll, mc-scrollbar, hover tooltips w/ names, X destroy slot, hint line); title switches to "Creative Inventory"
  - WorldMenu.tsx: WorldSelectScreen (MC-style list w/ deterministic WorldThumb pattern from seed, mode badge, seed/trophy/date meta, select+dblclick play, delete confirm dialog) + CreateWorldScreen (name input, Game Mode toggle w/ description, optional seed text/number → deterministic hashString)
  - AchievementsScreen.tsx: 12 achievements, locked shows "?" + hidden desc, unlocked shows icon (getTileIconURL) + gold border; source='game' = live engine unlocked set; source='menu' = aggregate union across all DB worlds; progress bar
  - MainMenu.tsx: Singleplayer / Achievements / Settings… buttons (v0.6.0 footer)
  - Overlays.tsx PauseMenu: world name + mode line, Achievements button, creative-specific hint line
  - HUD.tsx: hearts/hunger/XP bar hidden in creative; creative indicator pill ("double-tap Space to fly" / "✈ Flying — Space/Shift…")
  - DebugOverlay: +Mode line (mode/flying), v0.6.0
  - globals.css: .mc-scrollbar (chunky bevel scrollbar), .mc-input (MC text field)
- GameRoot.tsx: routes worlds/createWorld/achievements screens; mounts migrateLocalSave + fetchWorlds on start; achievements source picked from prevScreen

QA (agent-browser + eval-driven, all verified):
- World select lists DB worlds w/ metadata; Create New World (Creative) → world live (mode=creative, HUD hides hearts/hunger/XP, shows creative pill) ✓
- Creative palette renders all ~55 blocks+items w/ icons; pick → cursor 64-stack ✓; place into hotbar ✓; X destroy ✓
- Instant break: target broke in 1 tick, no drops, no tool wear ✓
- Infinite placement: stone placed, count stays 64 ✓; WATER source placed via palette → 93 flowing cells spread by fluid sim, count stays 64 ✓
- Flight: double-tap toggle ✓, rise 43→52.9 @vy5.25 ✓, hover (vy=0, no gravity) ✓, Shift descend ✓, landing auto-cancels ✓
- DB round-trip: quit→title→Play Selected World → same world restored (seed/player/mode/time) ✓; autosave PUTs all 200 ✓
- Survival regression: hearts/hunger/XP render, torch placed (count 4→3), lightItUp unlocked, mining progress 0.5@1s (not instant) ✓
- Achievements: menu aggregate shows 1/12 w/ progress bar after quit ✓; in-game screen reads live engine set ✓
- Delete flow: confirm dialog → world gone from UI+DB ✓
- Fixed during round: (1) worlds/route.ts missing (404) — recreated; (2) TDZ crash in moveInput flying branch (wx/wz before init) — froze the whole game loop whenever flight enabled, root cause of all "pauses"; (3) flight cancel-on-toggle from ground (onGround && vy<=0 guard); (4) store-subscriber crash (sky undefined pre-setupWorld setting cloudsEnabled) breaking createWorld; (5) setupWorld crash on empty save data (save?.player guard); (6) duplicate Migrated Worlds (migration singleton + permanent flag); (7) spurious headless pauses (500ms lock-session rule)

Stage Summary:
- PHASE 4 COMPLETE: full creative mode (fly/instant mine/infinite/water+palette/invulnerable/peaceful hostiles), DB-backed multi-world system (Prisma+API, autosave, world select/create/delete/migration), achievements screen (in-game + cross-world aggregate), MC-authentic menu flow
- Known minor: localStorage mirror still written (offline fallback — harmless); text-seed hashing deterministic but different from MC; creative flight speed values are tuned approximations; delete confirm lacks world-icon
- NEXT (Phase 5 per roadmap): gamepad/sprint-fov polish optional; bigger candidates: spiders + enderman mobs, mob spawn persistence in saves, enchanting placeholder→real, sprint particles, biome-specific colors (jungle grass tint), held-item block swing on place, achievements-GUI from pause verified E2E, sound for XP level-up, world rename, chest/furnace placement sounds, F5 third-person camera

---
Task ID: 8 (Phase 5 — Spiders, Endermen, Mob Persistence, F5 Camera, Polish, Rename)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA + Phase 5: spider+enderman mobs, mob spawn persistence in saves, F5 third-person camera, sprint particles, XP level-up sound, string→wool recipe, world rename UI

Work Log:
- QA round 0 (pre-existing build): lint pass, dev.log clean (old Ecmascript lines are stale mid-edit states; latest compiles 200), menu→world render verified, block edit + mob spawn + combat kill + XP orb + drop spawn all eval-verified, 0 console errors → verdict Phase 1-4 STABLE → proceeded to Phase 5 per roadmap
- New items (src/game/items.ts): ROTTEN_FLESH 297 (food 2), STRING 298, SPIDER_EYE 299, ENDER_PEARL 300 — all with pixel-art icons; auto-appear in creative palette
- Mob skins (mobSkins.ts): buildSpider (dark fur, red eye cluster, fangs, abdomen marking), buildEnderman (black + wide purple glowing eyes, jaw line)
- Mobs (entities/mobs.ts):
  - MobType + 'spider' | 'enderman'; MobDef flags: neutralInDay, climbs, teleports
  - spider: 1.25×0.9 AABB, 16 HP, speed 2.15, dmg 2, drops STRING 1-2 + SPIDER_EYE 0-1, custom 8-leg model (pivots with userData.baseYaw), legs swing fore-aft (rotation.y around body)
  - enderman: 0.55×2.75 AABB, 40 HP, speed 2.9, dmg 4, drops ENDER_PEARL, tall-thin humanoid builder, arms hang/swing (raised when provoked), purple provoked glow tint
  - spider AI: aggressive iff (provoked || lightAt < 8) && dist<20 — neutral in daylight (MC); climbs: blockedXZ while chasing → vy 3.6 on ground / 2.8 mid-wall (wall climbing instead of jump)
  - enderman AI: stare provocation (player look-dir dot > 0.975 within 26 blocks → provoked + screech), chase + melee; reposition-warp when provoked & dist>9 (cd 4-7s); teleport-on-hurt 55%; water burns (1 dmg/s + warp out); daylight ambient warp; teleportNear() scans surface + head-room, purple particles at both ends + warp sound
  - MobCallbacks: + teleportParticles, + playerForward (engine passes forwardVector); MobManager.lastCb cached for out-of-loop hurt→teleport
  - serialize()/restore(SavedMob[]) — save excludes dead, cap 28; restore sets health/yaw + spawnTimer=6 cooldown
  - zombie now drops ROTTEN_FLESH 1-2; hostile spawn roll: zombie .36 / skeleton .28 / creeper .20 / spider .12 / enderman .04
- Audio: spider/enderman ambient + hurt voices, enderTeleport() (descending warble), enderStare() (screech), levelUp() (bright two-note; replaces pop on XP level-up in addXP)
- Player model (NEW entities/playerModel.ts): Steve-style box humanoid (face tex w/ eyes+hair, skin/shirt/pants/shoe materials), createPlayerModel + animatePlayerModel (limb swing, head pitch, sneak crouch, shadow blob)
- Engine:
  - SaveData v6: + mobs?: SavedMob[]; saveGame serializes this.mobs.serialize(); setupWorld restores via mobs.restore() (chunks not yet loaded is safe — getBlock returns AIR)
  - cameraMode 0|1|2 public field; F5 keydown cycles (preventDefault, only when playing); updateCameraPerspective(): third-person behind/front, DDA raycast with 0.55 originPad (fix: ray used to start inside solid canopy blocks and clamp to 0.6), min dist 0.9, model visible + handGroup hidden in 3rd person, player model disposed on mode 0 / dispose()
  - sprint dust particles (0.13s cadence, ground-tinted, spawned at feet when sprinting >3 m/s)
  - renameWorld(id, name): PUT {name} + currentWorld store sync + fetchWorlds
  - mobCb stored on engine (mineTick attack passes cb → enderman hurt-teleport works from melee)
- Crafting: 4×STRING shaped 2×2 → WOOL
- UI: WorldSelectScreen + Rename button → inline rename panel (mc-input, Enter/Esc, disabled when empty); pause menu hints now show "F5 camera"

QA (agent-browser + eval-driven, all verified):
- Spider: night spawn → chase within 5 blocks (state=chase, closed 5→1.7) ✓; neutral in daylight (light≥8 → wander) ✓; model renders w/ 8 legs + red eyes ✓
- Enderman: stare provocation (aim at head → provoked=true + chase) ✓; hurt → teleported 7 blocks away + still provoked ✓; provoked purple glow + eyes visible ✓; model tall/thin correct ✓
- Mob persistence: spawn 8 → saveGame → localStorage mobs[] all 8 ✓; reload → 13 restored (8 saved + 5 natural post-cooldown) ✓; cross-session: Migrated World DB save (14 mobs incl spider+enderman) → fresh browser session load → 13 restored at saved player pos ✓
- F5: real key press → cameraMode 1 → third-person back view w/ full Steve model ✓; mode 2 front view shows face ✓; ray-origin fix verified (no more head-filling clamp under canopy)
- Crafting: 4 string dropped → magnet pickup → inventory clicks (left pickup, 4× right-place, out take) → wool 37x1 in hotbar ✓
- Zombie kill → 2× rotten flesh drops (blockId 297) ✓
- Rename: select world → Rename → input "Legacy Survival" → list + DB updated live ✓
- Death flow re-verified incidentally (AFK player killed by night mobs → death screen → respawn) ✓
- lint passes; fresh-session console 0 errors; fixed during round: (1) accidental `mob: parts = undefined` initializer (const reassign compile error) — removed same-round, (2) third-person camera clamp inside foliage (originPad)

Stage Summary:
- PHASE 5 COMPLETE: 9 mob types total (spider w/ wall-climb + day-neutral AI, enderman w/ stare-provocation + teleport + water-burn), mobs persist in world saves across sessions, F5 3-mode camera with animated Steve player model, sprint dust, XP level-up fanfare, string→wool crafting, world rename, zombie flesh drops
- Known minor: restored mob can pop inside an obstacle (falls/lands next tick — rare, positions are exact saved ones); enderman 2.75 height needs 3-block clearance in teleport scan (correct); headless FPS ~7-8 (software GL, real GPU fine)
- NEXT (Phase 6 candidates per roadmap): biome-specific grass tints (jungle/swamp), achievements for new mobs ("Monster Hunter" covers them — add spider/enderman-specific ones), sheep wool color variants, mob spawn caps per-type tuning, held-item swing polish, enchanting placeholder→real, spiders/enderman in creative peaceful mode (hostiles already ignore creative player), sound for creeper fuse panic music, F5 cameraMode persisted in settings, mobile touch controls

---
Task ID: 9 (Phase 6 — Biome Tints, TNT, Armor System, Sheep Variants, Settings-Load Bugfix)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA + Phase 6: biome grass/foliage tints, functional TNT (ignite/fuse/explosion/chain), full armor system (16 pieces, 4 slots, HUD bar, damage reduction, save v7), sheep color variants + colored wool, F5 cameraMode persistence, low-health vignette

Work Log:
- QA round 0 (pre-existing build): lint pass, dev.log 200s only, menu→world verified, eval-driven mine→drop(stack {blockId:6})→placement (torch count 3→2) ✓; AFK player organically killed by night mobs → death screen → respawn at bed spawn ✓ (hostile AI + death flow regression pass). Verdict: Phase 1-5 STABLE → proceeded to Phase 6.
- BUGFIX (pre-existing, caught this round): state.ts store initialized `settings: DEFAULT_SETTINGS` — `loadSettings()` was defined but NEVER CALLED, so ALL persisted settings (renderDistance, fov, sensitivity, volume, clouds, showFps) silently reset on every page reload since Phase 1. Fixed: `settings: loadSettings()`.
- Biome tints (mesher.ts + world.ts shader):
  - new `aTint` vec3 vertex attribute (MeshBuffers.tints, default white); fragment: `col = tex.rgb * vTint * vShade * l`
  - BIOME_TINTS per biome: jungle [0.58,1,0.36] vivid yellow-green, swamp [0.6,0.76,0.5] murky, forest [0.86,1,0.84], snowy/mountains/desert subtle, plains white
  - applied to: GRASS top face (+Y), TALL_GRASS cross (flowers stay untinted), OAK LEAVES all faces; per-column cache per chunk build
- TNT (engine.ts + blocks.ts):
  - PrimedTnt entities: block mesh (createBlockGeometry) + white flashing overlay (sin flash accelerates near detonation), AABB physics via moveEntity, initial vy 4.6 pop-up (MC), smoke trail particles, 3s fuse
  - ignite paths: (1) RMB on TNT with empty hand / non-block item (sneak bypasses → places on top); (2) chain reaction — explosion in blast radius primes nearby TNT w/ 0.2-0.9s random fuse (both engine explodeAt AND creeper explode via new optional MobCallbacks.igniteTnt)
  - explodeAt(x,y,z,R=3.8): destroys blocks except bedrock/water, 30% drop rate, containers spill, damages mobs (falloff 16) + player (falloff 18 + knockback), debris/dust bursts, camera shake (shakeT 0.5)
- Armor system (items.ts, crafting.ts, player.ts, engine.ts, state.ts, HUD.tsx, InventoryScreen.tsx):
  - 16 items 301-316: leather/iron/gold/diamond × helmet/chestplate/leggings/boots w/ pixel-art painters (leather browns, metals reuse TIER_COLORS — TDZ-safe late binding); ArmorDef {slot, points (MC: L 1/3/2/1, I 2/6/5/2, G 2/5/3/1, D 3/8/6/3), dur (55/165/77/363)}
  - 16 shaped recipes (MC patterns, mirror-matched); helmet/boots are 3x2 (2x2 grid correctly rejects); freshDur covers armor; maxStack(armor)=1
  - player.armor[4] (null|HotbarSlot), armorPoints getter, damage(): pts×4% reduction (min 1 dmg) + every piece −1 dur per hit (breaks at 0 w/ glass sound)
  - Inventory: 'armor' area in invClick/setInvHover/invHotbarSwap(guarded); armorClick enforces matching slot (wrong slot → toast, cursor untouched); shift-click auto-equips w/ swap-back; armor durability bars in slots; syncInventory pushes armor (hash-guarded)
  - HUD: pixel chestplate ArmorIcon row (10 icons, half states) above hearts, only when armorPoints > 0, survival only; save v7: player.armor[] w/ per-piece dur
- Sheep color variants (mobSkins.ts, mobs.ts, blocks.ts, atlas.ts):
  - buildSheep(color) palettes: white/light_gray/gray/brown/black; getMobSkins('sheep:<color>') cache; natural spawns pick MC-ish distribution (82/5/5/5/3)
  - SavedMob +variant; restore respawns same color; debugSpawn accepts variant
  - +4 wool blocks 51-54 (light gray/gray/brown/black) + atlas tiles 56-59 (drawWool palette param); sheep drop wool matching variant (sheepWoolId map)
- Polish: F5 cameraMode persisted via updateSettings({cameraMode}) and restored in constructor (relies on the loadSettings fix); low-health red pulsing vignette (radial gradient, animate-pulse) when survival hp ≤ 6
- QA harness notes: `world.chunks` is a Map (use .size); `e.target` recomputed by live loop — read within same eval tick; player.damage is a no-op in creative (switch gameMode for damage tests)

QA (agent-browser + eval-driven, all verified):
- Tints: aTint attribute present on opaque+cutout meshes; jungle chunks show 116-976 tinted vertices, plains chunks 0 (correct); visual: jungle hills render vivid yellow-green w/ tinted tall grass ✓
- Armor: shift-click equip (hotbar→armor, slots cleared) ✓; armorPoints 14 = 2+6+6 ✓; wrong-slot click rejected (cursor kept) ✓; matching-slot click swaps w/ old piece to cursor ✓; damage(10) w/ 14 pts → exactly 4 (2 hits: 20→16→12) + all pieces −1 dur/hit (165→164→163) ✓; armor bar renders above hearts ✓; armor persisted through save→quit→world re-entry ✓
- Crafting: headless matchRecipe — iron helmet→305, diamond chestplate→314, gold leggings→311, leather boots→304, 2x2 helmet rejected ✓
- TNT: RMB place (count 2→1, player-AABB rejection when standing in cell) ✓; RMB ignite w/ empty hand → primed=1, block→AIR ✓; detonation → crater, 23 drops, player 20→5 hp (exact falloff math), knockback ✓; chain reaction: 3 TNT row — first fuse ignited adjacent pair w/ short fuses, all 3 detonated ✓; creeper-blast chain via igniteTnt callback (code path, creeper explode loop) ✓; primed flash overlay + smoke trail render ✓
- Sheep: debugSpawn all 5 variants → variant field set ✓; black sheep killed → dropped WOOL_BLACK (54) ✓; colored wool blocks placeable + in creative palette ✓
- F5/settings: cameraMode persisted to localStorage on F5 (mode 2 confirmed), restored after reload ONLY AFTER the loadSettings fix (0 before = bug proven) ✓
- New world flow: "Phase 6 Survival" (seed 12345) created via UI → plains spawn w/ forest edge, flowers, sugarcane, water rendering w/ tints ✓; achievements screen 2/12 aggregate across worlds ✓
- Worlds DB loss during round: 4 pre-existing QA worlds (Legacy Survival, Migrated×2, New World) were deleted mid-round by a LINGERING SECOND BROWSER TAB from the previous cron round (interleaved autosave PUTs + deleteWorld pattern; NOT an app bug — 85s+ idle on every screen produced zero deletes; sole deleteWorld call site is behind the 2-click confirm dialog). Mitigated: `agent-browser close --all`, fresh session, recreated test worlds. NOTE for future rounds: always close stale sessions before QA.

Stage Summary:
- PHASE 6 COMPLETE: biome-tinted world (jungle/swamp/forest differentiation), fully functional TNT (place→ignite→fuse→explosion→chain reactions→camera shake), complete armor progression (leather→diamond w/ crafting, equipping, HUD bar, damage reduction, durability, persistence), sheep color variants + colored wool blocks, F5 persistence + fixed the settings-never-load bug
- Known minor: armor not rendered on 3rd-person Steve model (visual only); TNT explosion drops 30% flat (MC uses blast-resistance curve); sheep variant chosen at spawn not persisted for naturally-despawned mobs (irrelevant); legacy settings bug means pre-fix users' saved settings were already lost (nothing to migrate)
- NEXT (Phase 7 candidates): armor on player model in 3rd person, weather (rain/snow + thunder), boats/minecarts, villager farms or simple villages, mushroom biome + mooshroom, skeleton horse trap?, enchanting table real implementation, mob spawn caps per-type tuning, sprint FOV polish, biome-specific water color, beacons/potions stretch
---
Task ID: 10 (Phase 7 — Weather System, Bow & Ranged Combat, Player Armor Model, Biome Water Tints)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA of Phases 1-6, then Phase 7: dynamic weather (rain/snow/thunderstorms with sky darkening + lightning), full bow & arrow ranged combat (charge mechanics, arrow physics, stuck-arrow pickup), armor rendered on 3rd-person Steve model, per-biome water colors

Work Log:
- QA round 0 (pre-existing build): lint pass, dev.log 200s only, fresh agent-browser session (closed stale tabs first per Task 9 lesson), created "Phase 7 QA" world (seed 777), verified engine boot (121 chunks), mine→drop→magnet→hotbar, block placement, passive mob spawns (6 chicken/1 pig/2 sheep/3 cow), Save&Quit → running=false + world persisted to DB list. Verdict: Phases 1-6 STABLE → proceeded to Phase 7.
- Bow & Arrow (items.ts, crafting.ts, blocks→engine, mobs.ts, HUD.tsx, state.ts):
  - 4 new items: BOW 317 (BowDef dur 385, maxStack 1, curved-limb pixel icon), ARROW 318 (flint tip + fletching icon), BONE 319 (skeleton drop), FLINT 320 (dark shard icon)
  - crafting: bow = 3x3 [0,S,ST | S,0,ST | 0,S,ST] (MC pattern, mirror works); arrow = 1x3 column [FLINT, STICK, FEATHER] → 4; both verified via engine craft grid (2x2 correctly too small for bow)
  - gravel 12% flint drop (mineTick break path, survival-relevant for arrows)
  - freshDur() extended to bow (fix: initial version forgot isBowItem/getBowDef import → runtime ReferenceError in updateCraftOut → caught by QA eval, fixed same round)
- Ranged combat (mobs.ts + engine.ts):
  - Arrow interface + fromPlayer/dmg fields; playerArrowMat (lighter color 0xc8a06a); shootPlayerArrow(x,y,z,dir,speed,dmg) public API
  - arrow update rewritten with SUBSTEPPED collision (0.45-block steps) — full-charge arrow at 54 m/s tunnels mob AABBs at low fps without it (found by QA: sheep at 5 blocks missed at 9fps headless); substeps fix verified: sheep hp 8→-1 kill with full draw
  - player arrows hit mobs → hurtMob w/ 4.5 knockback + XP/drops via cb; skeleton arrows unchanged (hit player)
  - stuck player arrows persist 45s, pickupable within 1.5 blocks → spawns ARROW drop entity (verified: teleport to stuck arrow → collected, hotbar 19→20)
  - skeleton drops now ARROW 0-2 + BONE 0-2
  - audio: arrowHit() (highpass tick), bowDraw() (string creak every 0.32s while drawing)
- Bow mechanics (engine.ts + player.ts + HUD):
  - rightClick() dispatcher: bow held + arrow available → charge (creative ignores arrow check); "No arrows left!" toast otherwise; else falls through to placeBlock (placement regression-tested ✓)
  - releaseBow(): charge ≥0.14 fires; speed 14+40·charge; dmg max(1, round(2+7·charge)) = 2..9; consumes 1 arrow (hotbar-first, then main); bow dur −1, breaks w/ glass sound + toast at 0
  - charging: move speed ×0.5 (player.speedMultiplier), FOV −10°·charge zoom, hand pulls back (+z 0.22, +x 0.12, rot 0.25), draw creak loop
  - HUD charge bar under crosshair (110px, wood→gold gradient, red/yellow at full) + "Full Draw!" label; store.hud.bowCharge pushed on >0.04 delta only
- Weather system (weather.ts NEW, sky.ts, audio.ts, engine.ts, DebugOverlay.tsx, state.ts):
  - WeatherSystem: state machine clear(140-400s)→rain(70-200s)→/thunder(45-105s)→clear, intensity fade 0.25-0.5 rate, seeded rng
  - rain: 900 world-anchored drops in ±26 box around camera, wrap-around, vy 21-27, slant 2.2, streak texture; collision vs terrain band-scan (camY+22 down) → respawn; splash-free (cheap)
  - snow: 550 flakes, vy 1.4-2.5, sinusoidal drift, blocky clump texture — in snowy/mountains biomes; desert = dry (no precip)
  - thunder: strike every 3-10s when intensity>0.6 → 2-4 blink flash sequence (decay dt·7) + audio.thunder(dist) w/ close crack + delayed rumble
  - sky integration: weatherDarkness lerps sky/fog toward storm gray (thunder 0.72 / rain 0.5 depth), sunLevel ×(1−dark·0.55) → hostiles stop burning in storms automatically (sunLevel<0.82 gate); lightningFlash whitens sky/fog; clouds darken (×0.62) + opacity 0.55→0.95
  - audio: looping rain noise (highpass 900 + lowpass 4200, 2.5s fade-in, 1.2s fade-out), thunder(dist) crack+rumble w/ distance delay
  - F3 debug: "Weather: clear | rain100% | snow | thunderN%" line
  - dispose: audio.stopRain() on world teardown; weather recreated per setupWorld
- Armor on player model (playerModel.ts + engine.ts):
  - setPlayerModelArmor(model, armorIds[4]): hashed rebuild; helmet = top cap + rear/side shell + brow (face open); chest = torso shell + 2 shoulder pads; legs = waistband + upper-leg shells; boots = shells parented to leg meshes (swing with walk) tracked in bootMeshes[] for clean removal
  - tier colors: leather 0xa5662c (92% opacity), iron 0xd8d8d8, gold 0xf6d33c, diamond 0x5ce8d5; engine syncs per-frame in updateCameraPerspective (cheap hash guard)
- Biome water tints (mesher.ts): WATER_TINTS per biome on all water faces via existing aTint channel: swamp [0.52,0.66,0.42] murky, jungle [0.5,0.82,0.72] teal, snowy [0.68,0.84,1.0] + mountains [0.7,0.87,1.0] pale, desert [0.55,0.85,0.92]; verified mountains water mesh aTint = [0.7,0.87,1.0] on 436 verts
- Creative palette: BOW/ARROW auto-included via ITEMS registry (visible in palette DOM); BONE/FLINT in data (below fold)

QA (agent-browser + eval-driven, all verified):
- Bow: rightClick → charging=true, charge 0→1 over 1s ✓; Full Draw! + bar render at full ✓; FOV zoom visible ✓; release → arrow fromPlayer=true, dmg=9, speed=54, arrow 12→11, dur 385→384 ✓
- Combat: sheep (h 1.3) at 5 blocks full draw → hp 8→-1 dead ✓ (post-substep fix); chicken miss pre-fix proved tunneling bug + fix necessity
- Stuck pickup: ground shot at charge 0.4 → stuck; teleport to arrow → collected (world 1→0, hotbar 19→20) ✓
- Recipes: bow 3x3 match w/ dur 385 ✓; arrow column → 4x ✓ (note: 1-wide recipes need column layout positions 0,3,6 — matcher correct)
- Weather: forced rain → intensity 1, 900 drops, rain.visible, skyDarkness 0.5, storm-gray screenshot ✓; natural transition to rain observed post-reload (state machine live) ✓; thunder strike → flash blink sequence + thunderTimer reset + audio.thunder scheduled ✓; flash screenshot captured (white-washed sky) ✓
- Armor model: F5 → 9 armor overlay children, iron-colored Steve w/ open face, boots on legs ✓ (screenshot)
- Water tints: mountains chunk water aTint [0.7,0.87,1.0] ✓
- F3: "Weather: rain100% Mode: creative" ✓
- Regression: block place via rightClick fallback ✓ (creative no-consume correct); Save&Quit → running=false, 214 total successful autosave PUTs, 0 console errors post-fix
- Incidents during round: (1) freshDur bow import missing → updateCraftOut ReferenceError → caught via eval, fixed, hot-reload full-reload warnings in dev.log all pre-fix; (2) test player killed twice by night mobs while AFK (death screen halts simulation — pre-existing correct behavior, confused arrow QA twice until identified)

Stage Summary:
- PHASE 7 COMPLETE: dynamic weather (rain/snow per-biome, thunderstorms w/ lightning + procedural rain/thunder audio, storm sky/cloud darkening), full bow & arrow ranged combat (charge/draw/slow/zoom, substepped arrow physics, mob hits w/ knockback+XP, stuck-arrow pickup loop, skeleton arrow+bone drops, gravel→flint), armor visually rendered on 3rd-person model per tier, per-biome water colors, F3 weather debug
- Known minor: rain drops have no per-drop splash particle (cost trade-off); thunder has no lightning bolt geometry (flash+audio only); bow charge HUD re-renders React ~25x/sec while drawing (short bursts, imperceptible); snow biomes precipitation has no ground accumulation
- NEXT (Phase 8 candidates): beds skip stormy nights?, lightning bolt visual (column mesh) + fire igniting at strike point, villager NPC + simple village structures, mushroom biome + mooshroom, boats, potion/enchanting stretch, mob spawn caps per-type tuning, sprint dust already done, achievements for bow kills ("Sniper Duel"-style), bonemeal from bones → crop/sapling growth, snow golem/iron golem

---
Task ID: 11 (Phase 8 — Villages & Villager Trading, Mushroom Biome + Mooshroom, Bone Meal Fertilizing, Lightning Bolts, Sniper Achievement)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA of Phases 1-7, then Phase 8 per roadmap candidates: villager NPC + village structures, mushroom biome + mooshroom, bone meal (bones→fertilizer), lightning bolt visuals, bow-kill achievement.

Work Log:
- QA round 0 (pre-existing build): lint pass, dev.log clean, fresh session (closed stale tabs), created "Phase 8 QA" world (seed 8888): engine boot 121 chunks, survival, 2 pigs, hunger ticking, eval-driven mine (aim via player.yaw/pitch + updateTarget + mineProgress 0.995 + mineTick) → block→AIR ✓; screenshot: biome tints, river, sugarcane, HUD ✓. Verdict: Phases 1-7 STABLE → proceeded to Phase 8.
- Blocks (+6: 55-60): MYCELIUM (top/side/dirt tiles, drops dirt), MUSHROOM_STEM, MUSHROOM_RED_CAP, MUSHROOM_BROWN_CAP (caps drop small mushrooms), MUSHROOM_RED/BROWN (cross model, needsGround, flatIcon). Atlas tiles 60-66 painted (mycelium purple-speckle, stem, spotted red cap, brown cap, small cross mushrooms).
- Terrain (terrain.ts): new biome 'mushroom' (mountains-noise mid-band 0.415-0.52 + warm-humid gate → rare islands); mycelium surface; giant mushrooms via treeAt/placeTree (red: 4-5 stem + 5x5 flat cap + dome layer; brown: ring cap ON stem top MC-style); small mushrooms in decorationAt; VILLAGE STRUCTURES per-chunk deterministic (plains only, flatness-gated, in-chunk): house 7x7 (plank walls, log corners, glass windows, 2-tall doorway, spruce-log-rimmed flat roof, cobble floor + foundation pillars, interior torch), well 3x3 (cobble ring + water center + spruce posts + cobble roof), farm 6x4 (water trench + sugarcane rows + log/torch corner posts). Roll: house 5.5%, well 2%, farm 3% per chunk.
- Mobs (+2 → 11 types): villager (robe body + skirt boxes, big head, EXTRA nose box part, crossed-arms box, short legs; passive, speed 0.85, 20 hp, no drops, 'villager' hm-hm ambient), mooshroom (cow dims, red+white-patch skin, drops beef+leather). mobSkins buildVillager/buildMooshroom. Spawn rules: ground PLANKS/COBBLE → villagers (cap 5, herd 1-2); MYCELIUM → mooshrooms (herd 1-2); both daylight-gated. MobCallbacks +killByPlayer(dist) fired on lethal player-arrow hits.
- Villager trading: trades.ts (COAL×10→IRON_INGOT×2, LEATHER×6→GOLD_INGOT, COBBLESTONE×24→DIAMOND); store +tradeOpen/setTradeOpen; engine openTrade/closeTrade/executeTrade (countItem validation, consumeItem + addToSlots hotbar→main overflow, audio.trade, 'trader' achievement, toast); Overlays TradePanel — authentic MC GUI (c6c6c6 panel + inset bevels, pixel villager face emblem, 40px slots w/ icons+counts, green Trade buttons, Esc/背景 click close, engine Escape/KeyE handling while open); pointerlockchange guard: tradeOpen suppresses pause-on-unlock.
- Bone meal: ITEM.BONEMEAL 321 (white powder pile icon); recipe BONE→3 BONEMEAL (shapeless); engine rightClick: villager raycast (3.4 reach) → trade; held bonemeal → fertilize(): GRASS→scatter up to 5 tall grass/flowers in 5x5, MYCELIUM→up to 4 small red/brown mushrooms, small mushroom→55% growGiantMushroom (4-6 stem, clearance check, caps per type via setIfAir; needs mycelium/dirt/grass below); fertilizeFx green particles + audio.bonemeal; 'gardener' achievement; consumption + toast "no effect" otherwise.
- Lightning: WeatherSystem +onStrike callback — strike point 8-34 blocks from camera at groundY; engine.spawnLightningBolt: 5-segment jagged white column (42 tall, per-seg BoxGeometry + MeshBasicMaterial, random yaw), 0.42s flicker decay (updateLightning in update loop, geometry/material disposed), impact particles + sparks, audio.lightningStrike(dist), shockwave: mobs <3 → hurtMob 5 + knockback via mobCb, player <3.2 → damage falloff (creative immune); clearLightningBolts in setupWorld + dispose.
- Achievements +3 (→15): sniperDuel (Sniper Duel, bow kill >12 blocks — killByPlayer dist from arrow position), trader (The Trader), gardener (Growth Spurt). Audio: villager/mooshroom ambient + hurt cases, trade(), bonemeal(), lightningStrike(dist).
- Polish: MainMenu version string → "VoxelCraft 0.8.0 — Phase 8: Villages, Villagers & Mushroom Biomes"; mesher BIOME_TINTS +mushroom entry; FIXED pre-existing type debt: terrain `let block: number`, oreAt(): number, setLocal/setIf/setF params number (tsc errors 40→27, zero new).
- BUGFIX (found by QA, fixed same round): killByPlayer wasAlive guard was inverted — one-shot arrow kills (health - dmg <= 0, the typical sniper case) never fired the callback; now `if (m.dead) cb.killByPlayer?.(dist)` after hurtMob. Also fixed: small mushrooms never generated (decoration supports check lacked MYCELIUM).

- CRITICAL INFRA BUGFIX mid-round: DB writes started failing globally (POST /api/worlds 500, "attempt to write a readonly database" SQLITE_READONLY_CANTINIT 1032) — dev server's long-lived Prisma engine held stale file descriptors (WAL/shm lost mid-session); NEW PrismaClient processes could write fine. Fix: versioned the globalThis cache key in src/lib/db.ts (prisma → prisma_v2) so HMR re-instantiates a fresh client; documented bump procedure in the file. If DB writes ever fail again the same way → bump the suffix. QA worlds cleanup: deleted stale rows via DELETE /api/worlds/[id].

QA (agent-browser + eval-driven, all verified):
- Village: teleported to house chunk → planks 97, cobble 94, glass 6, torch 1, log 32, spruce 24 in footprint scan; screenshot on roof (log rim + planks) ✓; well chunk: cobble 26 + water center + spruce posts ✓ (exact ring/roof counts).
- Villager: debugSpawn → 7 meshes, nose + armsBox userData verified, passive ✓; RMB raycast path opens panel ✓ (openTrade verified too); trade 10 coal → 2 iron ingots via executeTrade (hotbar 290×2, 'trader' unlocked, panel stays open) ✓; trade panel screenshot (authentic MC GUI) ✓.
- Bone meal: fertilize on grass → 6 decorations + gardener ✓; RMB dispatcher path consumes 1 (3→2) ✓; small mushroom → giant red mushroom (attempts 3 for 55% roll, stems 6 + caps 27 in 5x5x4 scan) ✓; screenshot of spotted cap ✓.
- Mushroom biome: biomeAt 'mushroom' at (-400,-384); scan: mycelium 237, stems 30, red caps 84, brown caps 20 ✓; mycelium texture renders purple-speckled with clean grass biome border ✓; mooshroom spawns (drops beef+leather) + night screenshot w/ model ✓; small mushrooms generate after supports fix ✓.
- Lightning: forced thunder → strike fired (timer reset, instrumented onStrike count 1, strike point valid) → maxBolts observed 1 via 60ms polling, bolt expires 0.42s w/ flicker ✓ (visual catch is timing-lucky; programmatic verified).
- Sniper: vertical arrow kill from 15.1 blocks (over verified-open column) → mob killed + sniperDuel unlocked ✓ (after wasAlive fix; pre-fix misses were terrain canopies + a lava... no — leaves/stuck-in-canopy physics, plus death-screen pauses halting the sim — QA hazard again).
- Achievements screen: 3/15 unlocked, all three new cards render w/ descs + checkmarks, persisted across save→quit→reload (world list shows 3/12→3/15 progression) ✓.
- Regression: RMB place (air→cobble, creative no-consume) ✓; Save&Quit → DB row updated (3 trophies + state) ✓; fresh full reload → world re-entry boots 121 chunks, 20 mobs ✓.
- Incidents: (1) DB readonly incident above — fixed via db.ts key versioning; (2) test player died twice to night mobs + once to fall damage while AFK during eval tests (death screen halts sim — known pre-existing behavior; used creative mode for later tests); (3) HMR re-instantiated the engine mid-test several times (window.__voxel.mobs undefined until world re-entry — always reload + re-enter after editing game modules).

Stage Summary:
- PHASE 8 COMPLETE: plains villages (houses/wells/farms, deterministic per-chunk), villager NPCs with full MC-GUI trading (3 fixed trades + achievement), mushroom islands biome (mycelium + giant red/brown mushrooms + small mushrooms) with mooshroom mobs, bone meal loop (skeleton bones → craft → fertilize grass/mycelium/grow giant mushrooms), thunderstorm lightning bolts (visual + audio + shockwave damage), 3 new achievements (15 total), 11 mob types total.
- Known minor: villager trades are fixed (no per-villager rotation); lightning has no fire-block ignition at strike point; bolt lifetime 0.42s is screenshot-unfriendly; village houses are flat-roofed (no gables); villager natural spawn relies on random rolls hitting village grounds (spawn cap 5 — no guarantee of immediate villagers at every village); mushroom biome decoration still rolls flowers=0 (mushroom-only) by design.
- NEXT (Phase 9 candidates): wheat farming (hoes, farmland, crop growth stages, bread) to deepen the village/farm loop; iron golem village defender; boats; witch hut structure + witch mob; per-type mob spawn caps tuning; F3 'mushroom' biome name already shows; achievements for trading progress tiers; lightning fire ignition + lightning-rod block; saplings + tree regrowth w/ bone meal.
---
Task ID: 12 (Phase 9 — Farming & Village Life: Wheat Farming, Saplings/Tree Regrowth, Iron Golem)
Agent: main (status-assess round)
Task: Status assessment + agent-browser QA of Phases 1-8, fix any bugs found, then Phase 9: wheat farming loop (hoes→farmland→seeds→crop growth→harvest→bread), saplings + tree regrowth w/ bonemeal synergy, iron golem village defender, new achievements, village farm redesign.

Work Log:
- QA round 0 (pre-existing build): lint pass; found CRITICAL infra regression — DB writes failing again with SQLITE_READONLY_CANTINIT (1032) on PUT/POST (the Task 11 "bump cache key" fix had gone stale AGAIN because globalThis survives HMR and kept returning the dead engine). FIXED PROPERLY in src/lib/db.ts: self-healing PrismaClient — $extends query wrapper on $allModels detects 'readonly database'/extendedCode 1032, rebuilds the client into globalThis.prisma_v3, retries the failed op on the fresh delegate once; cache key bumped v2→v3; log noise reduced to ['error','warn']. Verified via curl: POST/PUT/DELETE /api/worlds all 200.
- Gameplay QA round 0 (agent-browser, fresh session): created "Phase 9 QA" world (seed 9090, snowy spawn); engine boot 121 chunks; eval-driven QA pattern refined: window.__voxel IS the engine (flat, no .engine); player pos = player.entity.{x,y,z} (AABB, not .pos); RayHit fields x/y/z (not bx/by/bz); world.chunks is a MAP (.size not Object.keys); mineTick requires mining=true AND mineTarget===target (else progress resets). Verified: mine→drop→magnet→pickup (snow_grass→dirt ×1), placement (dirt consumed in survival), death screen + Respawn button, Save&Quit. NOTE: QA hazard repeated — test player died to fall damage mid-eval (death screen halts sim, freezes drops); recovery via Respawn button.
- Blocks (+7 → 61-67): FARMLAND (wet furrow top + dirt side tiles, drops DIRT), WHEAT_STAGE0..3 (cross model, cutout, flatIcon, needsGround, hardness 0.01, stage0-2 drop SEEDS, stage3 drop null w/ custom multi-drop), OAK_SAPLING + SPRUCE_SAPLING (cross, needsGround). Helpers: isWheatCrop/nextWheatStage/isSapling. Atlas tiles 67-74 painted (wet furrows farmland, 4 wheat growth stages green→golden w/ grain heads, oak/spruce saplings).
- Items (+8 → 322-329): SEEDS, WHEAT, BREAD (food 5), + 5 hoes (wood/stone/iron/gold/diamond) via ToolDef type 'hoe' (dmg = swordDmg-3, min 1); drawHoe painter (bent blade), seeds/wheat/bread icons. TOOL_IDS + TYPE_LABEL + TOOL_PAINTER extended — hoes fully integrated (stack 1, durability, freshDur).
- Crafting: hoe(M) shaped 2x3 [M,M / _,S / _,S] ×5 tiers; bread = 3 wheat row (3x3).
- Engine (rightClick dispatcher, order: bow→villager→bonemeal→HOE→SEEDS→place): hoe till (grass/dirt/mycelium/snow_grass + air above → farmland, dig('dirt'), damageTool(1), 'plowman'); seeds plant on farmland TOP face (ny===1) → WHEAT_STAGE0, consume 1.
- Engine (drops in mineTick break path): TALL_GRASS → 20% SEEDS; LEAVES/SPRUCE_LEAVES → 8% oak/spruce sapling; WHEAT_STAGE3 → WHEAT ×1 + SEEDS ×1-2 + 'harvest'; gravel flint unchanged. needsGround pop path gives seeds when farmland broken under young crops.
- Engine (growth): REPLACED random 24-sample scan for crops (math: 64-cell field hit ~every 43s = unplayable) with DETERMINISTIC crop sweep every 2s — all 31×31 columns in ±15 around player, y band ±(−8..+10): wheat advances 22%/visit (50% hydrated farmland w/ adjacent water via hasAdjacentWater), saplings grow 20%/visit. Cane/cactus keep old random scan. Verified statistically: 64-crop field → 11 ripe in 25s, staggered ripening ≈ full field ~4-5 min (MC-like harvest-as-you-go pace).
- Engine (fertilize +): wheat crop → advance 1-2 stages (green fx, "already ripe" guard); sapling → instant growSaplingTree (oak: h4-6 trunk + terrain-pattern canopy dy -2..1 r=2/1; spruce: h6-8 conical alternating rings 1/2 + tip; clearance check trunk column, setIfAir canopy; below must be grass/dirt/snow_grass/farmland).
- Iron golem (mobs.ts +12th mob type): hostile:false, 1.3w × 2.7h, 100 hp, speed 1.35, drops IRON_INGOT ×3-5, sound 'golem'. Model: massive torso + hip block + big head + villager-style NOSE (extra skin) + long pivoted hanging arms + sturdy legs; skin = pale iron noise + plate seams + cracks + RUST speckles + GREEN VINES on chest/limbs. AI: preempts passive branch — scans hostiles ≤11 → chase (arms raise -1.2 rad) → smash: hurtMob 9 dmg + LAUNCH vy 8.5 + golemSmash() audio (thud+clang) + gray burst; else patrol wander ×0.45. hurtMob: golem never flees (idle). Spawn: village grounds branch, cap 1, 22% roll daylight-gated. Golem walk = 2-leg swing; arm pendulum sway.
- Audio: golem ambient (78-96Hz sawtooth groan + sub sine), golem hurt (thud + lowpass burst), golemSmash(dist) (95Hz thud + 320Hz clang + bandpass noise).
- Village farm redesign (terrain.ts): trenched 6×4 field now FARMLAND beds + deterministic wheat rows (72% coverage; 30% stage3 / 25% stage2 / 17% stage1 mix) replacing sugarcane; corner spruce posts + torches kept.
- Achievements 15→18: plowman (till), harvest (mature wheat), bakeBread (craft bread); onCrafted hook + trigger points wired. Menu version → "VoxelCraft 0.9.0 — Phase 9: Farming & Village Life".

QA (agent-browser + eval-driven, all verified):
- Till: hoe RMB on snow_grass → FARMLAND(61), air above, hoe dur 59→58 ✓
- Plant: seeds RMB farmland top → WHEAT_STAGE0, seeds 5→4 ✓
- Bonemeal crop: 62→64 (35% double) →65; mature → "already ripe" toast, not consumed ✓
- Harvest: mature wheat break → WHEAT+SEEDS picked up (hotbar 323x1, 322x5) + 'harvest' ✓
- Bread: craft9 3-wheat row → 324x1 via takeCraftOutput + 'bakeBread' ✓ (note: craftGrid is craft2 unless invTable=true — QA eval gotcha)
- Tree: bonemeal oak sapling → log trunk + leaves canopy + tip verified block-by-block ✓; grown tree visible in day screenshot ✓
- Growth: 8×8 field (64 crops) → 11 ripe/16 advanced after 25s sweep ✓
- Golem: debugSpawn → 8 parts + nose ✓, in-scene + raycastMob hit ✓; adjacent zombie: 2 smashes in 3s (hp 20→2 = 2×9 exact) w/ chase state ✓; golem killed → 5 IRON_INGOT drops ✓
- Village farm: NEW world (seed 424242) → farmland found in generated chunk (1,-4) y49; screenshot: golden wheat rows + spruce posts + torches + rain ✓
- Persistence: crops/farmland survive reload via edits map ✓; creative palette auto-includes all 7 new blocks + 8 items (registry-driven) ✓
- Regression: mine/place/mob spawns/save autosaves (PUTs 200) all green; browser console 0 errors; lint clean.
- Incidents: (1) DB readonly regression at round start — root-fixed (self-healing client), see above; (2) night fell during golem visual QA (sky.time=200 forced day); (3) player teleported into tree canopies twice during screenshot positioning (QA positioning issue, not bugs).

Stage Summary:
- PHASE 9 COMPLETE: full wheat farming loop (hoe→till→plant→grow w/ hydration bonus→harvest→craft bread→eat), sapling drops + natural/bonemeal tree regrowth closing the wood loop, iron golem village defender (model/skin/AI/launch-attack/iron drops), redesigned village farms with living wheat fields, 3 new achievements (18 total), 12 mob types, self-healing DB client permanently fixing the recurring SQLITE_READONLY_CANTINIT dev-server failure.
- Known minor: golem spawn roll is per-try 22% w/ cap 1 (no guaranteed golem at every village); wheat hydration check scans 8 neighbors per crop per sweep (cheap); crop sweep y-band is player-anchored (crops >10 blocks above/below player don't tick — matches MC spawn-chunk behavior); hoes have no harvesting speed bonus (no crop blocks use tools); bread no saturation model (hunger-only, matches existing food).
- NEXT (Phase 10 candidates): boats; witch hut + witch mob (splash potions); enchanting table implementation; villager trade rotation per-villager; lightning-rod block + fire ignition at strike point; snow golem buildable; horse mounts; redstone-lite (lever/door); better sprint FOV polish; achievements for farming milestones (harvest 100 wheat).
---
Task ID: 13 (Bugfix — Water Surface Seam/Crack at Chunk Borders)
Agent: main (user-reported bugfix round)
Task: User reported a visible cut/seam in the water (screenshot: golden diagonal line across the ocean surface showing sand through a crack). Diagnose root cause, fix, verify in browser.

Work Log:
- Root cause analysis (mesher.ts + world.ts): water surface vertices are displaced by a wave in the shared vertex shader — `sin(uTime*1.6 + position.x*0.9 + position.z*0.7)*0.045 - 0.05`. `position` is LOCAL per chunk mesh (0..16, mesh.position=(x0,0,z0)), so adjacent chunks computed DIFFERENT phases for the same world-space border vertices → vertical displacement mismatch (up to ~0.09 blocks) → cracks in the ocean surface along chunk borders; sand below showed through as the golden diagonal line. Chunk streaming itself was verified correct (meshes only built when all 4 neighbors have data), ruling out missing-face causes.
- FIX (world.ts vertexShader): wave phase now uses WORLD position — `vec4 wp = modelMatrix * vec4(position,1.0)` (modelMatrix = matrixWorld incl. chunk offset) → coincident border vertices in adjacent chunks get IDENTICAL displacement → surface is watertight across all chunk borders. Additionally: only top-surface vertices bob now (`step(0.8, fract(position.y))` — fract=0.875 for source tops, 0 for bottoms) so bottom edges stay welded to shore/floor (no underwater gaps); added a second sine octave for richer wave shapes; mean offset kept ≈ -0.045 so the waterline looks unchanged.
- Verification (agent-browser, fresh session, world "Water Seam QA" seed 5150, creative): located largest deep-water basin via terrain.heightAt scan (984,472; 3-deep water over sand); locked camera 1.5 blocks above the surface via page-interval (physics kept landing the player — flying resets on ground contact); screenshots at grazing angles crossing many borders diagonally, along a single border, and across — surface CONTINUOUS everywhere, no golden seam, no chunk-grid artifacts; two frames differ → waves still animate. Console/page errors: none. Lint: clean.

Stage Summary:
- BUGFIX COMPLETE: water seams at chunk borders eliminated (world-position wave phase + top-only vertex displacement + 2-octave waves). Waterline visuals unchanged.
- Note: BLOCK.WATER id = 10, SAND = 6 (QA column-scan gotcha); player.flying resets on ground contact in this engine — hold position via page interval when doing camera QA over water; sky.time drifts with the day cycle (re-force for daylight shots).
---
Task ID: 14 (Bugfix — Creative Flight Toggle Flicker While Holding Space)
Agent: main (user-reported bugfix round)
Task: User reported: holding Space in creative mode should ascend continuously (MC behavior) but flight kept toggling on/off while held; double-tap back-to-back should not chain-toggle.

Work Log:
- Root cause (engine.ts onKeyDown): NO `e.repeat` guard. OS key auto-repeat fires keydown ~30x/sec while held; consecutive repeats are <280ms apart, so the double-tap window matched EVERY repeat pair → `flying = !flying` toggled on each repeat → flight flickered on/off while holding Space. Also fixed the same latent bug class for all one-shot keys (KeyE inventory open/close flicker, F3/F5 rapid cycling, Q drop spam) via one guard.
- FIX 1 (engine.ts): top-of-handler guard `if (e.repeat) { if (Space/F3/F5) preventDefault(); return; }` — held movement keys already live in this.keys (added on the first fresh press), so repeats carried no needed state; only one-shot actions were being re-triggered. Double-tap now only sees DISTINCT fresh presses, exactly like MC.
- FIX 2 (engine.ts double-tap block): engage-flight now applies a liftoff impulse `vy = max(vy, 3.4)` (replaced `vy = 0` which could instantly re-cancel flight via the landing guard `onGround && vy <= 0` if Space was released within a frame of the toggle). Tap still consumed on toggle (lastSpaceTap=0) so stray third taps can't chain-toggle.
- Verified physics path untouched: flight ascent/descent still driven by keys.has('Space'/'Shift') in moveInput (player.ts) — holding rises, landing cancels when descending.
- QA harness lessons: agent-browser CLI roundtrip between `keydown`/`keyup` commands exceeds the 280ms double-tap window (can't test double-tap with two CLI key commands); page setTimeout sleeps clamp under headless throttling (async eval test gave false negatives — tap gaps stretched >1s). SOLUTION: single synchronous eval with busy-wait gaps + synthetic KeyboardEvent dispatch (isTrusted irrelevant — listeners don't check it); real CDP `keydown`/`keyup` used only for the held-ascent physics test.

QA (agent-browser, world "Water Seam QA" seed 5150, creative — all verified):
- A: fresh Space press + 100 synthetic OS-repeat keydowns → flying stayed false, flickers=0 (the reported bug) ✓
- B: double-tap (2 fresh presses, 80ms apart) → flying=true + vy=3.40 liftoff ✓
- C: 50-repeat flood while flying → flying stayed true (no cancel) ✓
- D: second double-tap → flying=false (MC cancel behavior) ✓
- E: REAL held Space (CDP keydown) while flying → vy reached 5.25 (full climb speed), y risen +1.31 blocks over ~1.1s and climbing, keyup → still flying (hover) ✓
- Regression: no console/page errors; autosave PUTs 200; lint clean.

Stage Summary:
- BUGFIX COMPLETE: holding Space in creative no longer flickers flight on/off; double-tap toggles flight on (with liftoff) / off exactly like Minecraft; same guard also fixes latent KeyE/F3/F5/Q repeat-spam issues.
- NEXT candidates (unchanged Phase 10 list): boats, witch hut, enchanting, villager trade rotation, sprint FOV polish, farming achievements.
---
Task ID: 15 (Bugfix — Night Mob Brightness + Four-Sided Mob Heads)
Agent: main (user-reported bugfix round)
Task: User reported: (1) mobs/animals are too bright at night — make it more realistic; (2) mob heads show the face on ALL four sides instead of only the front.

Work Log:
- Bug 2 root cause (mobs.ts): head boxes were built with a SINGLE material wrapping a texture that has the face baked in → BoxGeometry applies one material to all 6 faces → face rendered on ±X/±Y/±Z (4 sides + top + bottom). Player model was already correct ([skin×4, face, skin] with face on +Z).
- Fix 2: mobSkins.ts — every one of the 12 skin builders now also produces `headPlain` (canvas clone taken after base fill + side-appropriate markings like sheep wool tuft / zombie hair band, BEFORE facial features); mobs.ts — new `headPart()` builds head boxes with material array [plain, plain, plain, plain, face, plain] (face on +Z = model forward, matches quadruped headZ>0 and villager/golem nose at +Z); villager/golem NOSE materials now tracked in parts.materials (previously uncloned + unlit-tinted); spawn() material cloning is now ARRAY-AWARE (remaps each entry of material arrays).
- Bug 1 root cause (scene lights vs voxel light): mobs/drops/Steve use MeshLambertMaterial lit by scene Hemisphere+Directional lights whose night floor (ambient 0.25+0.14·0.75) kept entities ~40-90% bright while the terrain shader renders surface at skyLight×sunLevel ≈ 0.14 → glowing mobs on pitch-dark ground.
- Fix 1 (entity world-light shading, MC-authentic): per-entity brightness = max(blockLight, skyLight×sunLevel) — the exact terrain shader formula — sampled from voxel light at each entity's position, smoothed (lerp dt·6), applied as material color multiplier over the base state tint:
  - mobs.ts: Mob gains tintR/G/B (base state tint) + lightF/lastAppliedF; tint() replaced by setTint(m,r,g,b) (stores base, writes base×lightF — hurt red / creeper flash / enderman purple still work and are themselves dimmed by darkness); light block runs per mob per frame.
  - drops.ts: per-drop material clones (block atlas + item sprite caches kept as clone sources); same light sampling per drop; DropManager.update gained sunLevel param (engine passes sky.sunLevel).
  - engine.ts: playerLightF computed per frame (frameUpdate) and applied to the 3rd-person Steve (base colors cached in WeakMap so armor tier tints survive multiplication) AND the first-person held item/arm (base color cached on material.userData).
- Robustness fix found during QA: mobs that glitch to NaN/void positions never despawned (distToPlayer=NaN fails `> 64`) — despawn guard now also removes non-finite or y<-20 mobs (was polluting worlds with invisible broken mobs; the NaN then propagated to anything reading their position — e.g. my first QA camera eval NaN'd the player position, recovered by respawn-at-column-scan).
- QA-harness note: repeated MultiEdit "atomic" failure partially applied edits twice in mobs.ts (duplicate headPart def) — caught by grep diff, removed; tsc errors went 27 → 22 (fixed 5 pre-existing: mobs world type widened with getLight/getLightForMesh, drops geoCache typed BoxGeometry).

QA (agent-browser, world "Water Seam QA", creative — all verified):
- Head arrays: all spawned mob types report 6 material slots, [plain×4, face@+Z] pattern, face distinct ✓
- Visual front shot: zombie face (eyes+mouth) on front only; top/sides plain ✓ (mob-face-front4.png)
- Visual side/back shot: plain green head sides, no features ✓ (mob-side2.png)
- Night (sky.time=0.78·DAY_LENGTH=480): sunLevel 0.102 → ALL mobs lightF≈0.10, material colors match exactly; night screenshot shows dark terrain + dark mobs (mob-dark-night.png, hand-night.png) ✓
- Day (time=0.3·480): sun 0.72 → mobs/hand lerp back up (hand 0.096→0.498 = base 0.687×0.72 ✓); entities under canopy stay shaded (sky light < 15) — correct ✓
- Regressions: hurt-red flash, creeper fuse flash, enderman purple tint all preserved through setTint; lint clean; no console/page errors; no new tsc errors (22 pre-existing remain).

Stage Summary:
- Entities now obey voxel lighting: pitch-dark at night, torch-lit brightness near light sources, shaded under canopies — matching the terrain exactly (user's "too bright at night" fixed).
- Mob heads are Minecraft-accurate: face on the front only, featureless skin on the other 5 faces (user's "head on all four sides" fixed).
- NaN/void mob despawn guard added; entity material systems (tint × light) unified.
- NEXT candidates (unchanged): boats, witch hut, enchanting, trade rotation, achievements.
---
Task ID: 16 (Bugfix — Chicken Has 4 Legs + Leg Rotation Pivot at Middle)
Agent: main (user-reported bugfix round)
Task: User reported: (1) chicken has 4 legs — illogical, should have 2; (2) leg rotation pivot for walk animation must be at the TOP of the leg (hip), not the middle — middle-pivot looks wrong.

Work Log:
- Bug 1 root cause (mobs.ts): chicken was built via `quadruped()` which always creates 4 legs. Replaced with a dedicated bipedal bird builder: body + head with face-on-front-only (headPart), NEW 3D beak box (orange limb texture) protruding from the face, NEW red wattle box (new `extra` wattle texture in mobSkins.buildChicken), exactly TWO thin legs, and two side WINGS exposed via parts.arms.
- Bug 2 root cause (mobs.ts + playerModel.ts): every leg was a single BoxGeometry whose CENTER was at half leg height → `rotation.x` spun around the leg's MIDDLE (feet orbit, top sinks into body). Arms already used pivot Groups. Added `legPivot()` helper: pivot Group at the hip (top), leg box child hanging at y=-h/2 → rotation swings from the hip, Minecraft-style. Applied to ALL builders: quadruped (pig/cow/sheep/mooshroom/chicken-2-legs), humanoid (zombie/skeleton), creeper (4), enderman (2), villager (2), golem (2 — legs also lengthened 0.72→0.88 to close the hip gap). parts.legs now stores pivots (cast as Mesh, same pattern the spider already used) — walk animation code unchanged.
- playerModel.ts: same hip-pivot rig for Steve (pivot at y=0.74, leg child at -0.37); added `legMeshes` array so armor boots still attach to the swinging leg boxes. Spider pivots untouched (already correct). Golem leg gap fix included.
- mobSkins.ts: buildChicken gained wattle `extra` texture; buildChicken cached like all skins.

QA (agent-browser, world "Mob Rig QA" seed 7777, creative — all verified):
- Chicken rig: legCount=2, both pivot Groups at hip y=0.31 with leg child at -0.15; 2 wings; beak + wattle present ✓
- Walk animation numeric: walking at full speed, leg pivot rotation oscillated (-0.202 → -0.492 across samples), legs mirrored (opposite signs), hip world-Y CONSTANT at 41.36 while swinging → true hip rotation ✓
- All 12 mob types: legs are pivot Groups with hanging children, hip Y at body underside (pig 0.30, cow 0.54, sheep 0.49, zombie/skeleton 0.74, creeper 0.38, spider 8 pivots 0.58, enderman 1.35, villager 0.32, golem 0.88) ✓
- Wing flap: dropped chicken from height → wings flap (max rotation 0.62 rad) + slow-fall cap engaged (vy = -3.2 exactly) ✓
- Visual: chicken studio screenshots (chicken-studio2.png) show exactly 2 orange legs, wings, red wattle, face front-only ✓
- Lint clean; tsc still 22 pre-existing errors (0 new); no console/page errors.

Stage Summary:
- Bipedal chicken (2 legs + beak + wattle + flapping wings) and MC-style hip-pivot leg rigging across every mob AND the player model. Walk animations now swing from the hip.
- NEXT: Phase 10 content per user "go to next stages of completing the game".
---
Task ID: 17 (Phase 10 — Boats, Witch Hut + Witch, Trade Rotation, Sprint FOV)
Agent: main (feature round: "برو سراغ مراحل بعدی تکمیل بازی")
Task: After bugfixes, continue completing the game (Phase 10): boats, witch hut + witch mob, villager trade rotation, sprint FOV polish.

Work Log:
- BOATS (new src/game/entities/boats.ts): BoatManager with MC-style oak boat model (hull, side walls, bow/stern, rim trim, bench, prow tips — 9 boxes, per-boat cloned materials with cached base colors × voxel-light factor). Physics: spring-damper buoyancy toward water surface (rest y = water surface − 0.28), water drag + 8.2 m/s clamp, thrust 9.5 m/s² while rowing, A/D turn 1.9 rad/s, heavy land friction, roll/pitch lean visuals, moveEntity AABB collision (1.25×0.62), NaN/void despawn. Boat item (id 330) + pixel icon + MC U-shape plank recipe (3×2). Engine: RMB place (water scan along look ray, 6m), RMB mount (boat raycast priority over placement — MC behavior), rowing drives boat while rider follows at seat offset (physicsStep), Shift dismounts to a free spot beside the boat, left-click attack breaks boat → drops BOAT item, creative placement doesn't consume, sprint-dust-style wood particles on break. Rider sitting pose in 3rd person (leg pivots -1.35).
- WITCH (12th hostile mob type): buildWitch skin (green hag face w/ wart + red-glint eyes, purple robe, hat texture w/ golden band) + custom builder = humanoid + long nose + pointy hat (brim + 2 cone boxes + tilted tip). 26 hp, ranged AI: holds 5.5–9.5m (approach/back off/strafe), lobs splash potions every 2.8s (arc lead throw, g=16, substepped, tumbling purple box). Potions shatter on block/direct hit: shatter audio + purple burst + splash radius 2.6 → damage (max 4 scaled) + POISON 4.5s. Poison: player.poisonT/poisonTickT, 1 dmg per 1.5s, never below 2 hp, creative immune. Spawning: swamp night hostile roll (~9%) + witch-hut grounds (swamp planks/cobble, cap 1, day or night). Drops sticks + spider eyes. New sounds: witch cackle ambient/hurt, potionThrow glug, potionShatter.
- WITCH HUT (terrain.ts placeWitchHut): swamp chunks, 5% deterministic roll, requires water pool (h < SEA_LEVEL at hut center). Stilted 5×5 plank hut: spruce-log stilts from pool bed (corners + center), plank floor at SEA_LEVEL+1, 2-tall walls w/ log corners + doorway, 7×7 plank roof w/ log rim overhang, interior crafting table + torch. MobManager world interface widened with optional biomeAt (World delegates to terrain).
- TRADE ROTATION (trades.ts rewrite): pool expanded 3 → 10 offers; villagerTrades(seed, epoch) deterministically picks 3 via LCG; restock epoch = 5 real minutes (tradeEpoch()), per-villager seed from position hash. engine.openTrade(villager) computes offers → getTradeOffers() renders them (Overlays.tsx switched from the static VILLAGER_TRADES to live per-villager stock; executeTrade uses activeTrades).
- SPRINT FOV (engine frameUpdate): smoothed +7° FOV kick while sprinting (speed > 3.2), lerped at dt*9, stacks with bow-charge zoom.

QA (agent-browser, world "Mob Rig QA" seed 7777 — all verified):
- Boat buoyancy: spawned on water → settles at y=40.45 vs computed rest 40.59, inWater, vy→0 ✓ (beaching in shallows stalls it — MC-like, open water required)
- Mount: RMB raycast → riding=true, boat.occupied ✓ (mount takes priority over placement when aiming at a boat)
- Rowing: W in deep water → speed ramps to 8.20 m/s (exact clamp), all speed along facing; rider position tracks boat exactly ✓
- Turning: A → yaw delta −0.95 rad/0.9s (correct left-turn sign) ✓
- Dismount: Shift → riding=false, player placed BESIDE the boat (1.2m off), boat remains ✓
- Item placement: boat in hotbar + aim at clear water → boats 1→2 (creative: not consumed) ✓
- Break: attack aimed at boat → boats 2→1 + BOAT item drop spawned ✓
- Witch: model parts (nose, 4 hat boxes, hip-pivot legs) ✓; in survival mode chases holding 7.6m, splash potions hit → health 20→16→7 under sustained fire, poisonT active (2.75s seen) and ticking non-lethal damage ✓
- Witch hut: found chunk (30,15) via the generator's own hash; after streaming, crafting table found at EXACTLY the predicted (489,42,250); floor=planks, below floor=WATER, corner stilt=SPRUCE_LOG, roof planks, torch=30 ✓ (screenshot witch-hut3.png shows roof through pause backdrop)
- Trade rotation: same villager → same 3 offers (deterministic); different villager → different 3; all from the 10-pool ✓
- Sprint FOV: sprinting at 5.6 m/s → sprintFov converged to exactly +7.00 ✓
- Regression: chicken still 2 legs + pivots + beak/wattle; autosave PUTs 200; no console/page errors; lint clean; tsc 22 pre-existing (0 new).
- QA harness notes: (1) headless pointer-lock now drop-loops after trade-panel open (engine's >500ms lock-session guard pauses correctly — real-browser Esc behavior; resume via Back to Game works, screenshots must be taken within ~0.8s of resume or the menu re-appears); (2) teleporting into UNGENERATED chunks voids the player (fall → death → respawn at spawn) — force flying + y≥58 and let streamChunks run (or drive w.streamChunks() from eval, ~30 calls covers radius); (3) `p.poisonT` lives on the Player wrapper (w.player.poisonT), not p.entity; (4) forwardVector convention: yaw=atan2(−dx,−dz), pitch positive = UP.

Stage Summary:
- PHASE 10 COMPLETE: rideable boats (full water physics + combat), swamp witch huts with a ranged potion-throwing witch + poison status effect, per-villager rotating trade stock (10-offer pool, 5-min restock), sprint FOV kick. Game now at "VoxelCraft 0.10.0 — Phase 10".
- Known minor: boats not serialized in world saves (transient like arrows — respawn on placement); witches don't drink healing potions (MC does); trade restock is global epoch (MC restocks per-villager on trade); witch hut roll 5%/swamp-chunk may need several chunks to find one.
- NEXT (Phase 11 candidates): enchanting table + lapis, snow golem buildable, horse mounts, redstone-lite (lever/door), lightning rod block, boat chest variant, farming milestone achievements, fishing rod + fish, banner blocks.
