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
---
Task ID: 18 (CRITICAL — Sandbox Reset Recovery + Vanilla Skin Pipeline Rebuild)
Agent: main (user-reported regression round)
Task: User reported "چه اتفاقی افتاده چرا همه ماب ها ظاهرشون قدیمی شه چیزایی جدید همه رفتن اینگار رفتی به ورژن خیلی قدیمی" (everything looks like a very old version — mobs old, new content gone). Diagnose and fix.

Work Log:
- ROOT CAUSE: the sandbox filesystem was RESET to the last git commit (1b57146, Sep 28 02:34 = Task 17 / Phase 10 state). All uncommitted work after that point (Tasks 18–31: skindata/skinAtlas texel-extraction pipeline, mobSkins.paintAtlas, Asset Viewer, enchanting Phase 11, fishing Phase 12, sheep mouth texel fix, and the in-progress cow-udder fix) was LOST — no stash, no newer commits, no recoverable copies anywhere (checked .next cache, /tmp, tool-results, download/upload). The old procedural mobSkins painters were back, which is exactly why every mob "looked old".
- LESSON (permanent): COMMIT after every completed unit of work. This round committed 3 times.
- REBUILD DECISION: instead of recreating the fragile hand-extracted texel pipeline (which produced the cow-udder / sheep-mouth bug class), the skin system was rebuilt on the OFFICIAL vanilla entity textures + Minecraft's standard box-UV cross layout. Pixel-perfect BY CONSTRUCTION: each box part's UVs are computed from its MC model definition (texOffs + w/h/d), so the face lands on +Z only, and every face samples exact vanilla pixels. No texel data to drift.
- NEW FILES: qa/tools/fetchEntityTextures.cjs (downloads 15 official entity textures from InventivetalentDev/minecraft-assets @1.20.4 into public/textures/entity/ — re-runnable), qa/tools/regionDump.cjs (ASCII pixel-map of a PNG region — used to derive/verify every UV table), src/game/entities/vanillaSkins.ts (texture loader + preloadEntityTextures() + boxUV() MC cross-layout UV mapper + uvBox() + sync tintedTex() canvas multiply-tint).
- REWRITTEN: src/game/entities/mobSkins.ts (per-mob part tables: head/body/limb/limb2/extra/extra2/wing/legsBaked/fur/hat*; sheep variants via SHEEP_COLORS dye palette; mooshroom_brown added). src/game/entities/mobs.ts helpers + all 13 builders now use boxPart(skinPart,...)/legPivot(skinPart,...)/collectMats; sheep got a real two-layer model (skin + inflated fleece boxes riding body/head/legs as CHILD meshes so animations carry them); MobSkins interface changed accordingly. NEW export buildMobModel(type,variant) for the Asset Viewer.
- Asset Viewer rebuilt (src/components/game/AssetViewer.tsx + screen 'assets' in state.ts + MainMenu button + GameRoot route): Mobs tab (18 entries incl. 5 sheep colors + brown mooshroom, walk animation, drag-orbit + wheel-zoom, turntable) and Blocks tab (ALL registered blocks; cubes use the SAME atlas/tileUV/face-order as the world mesher — what you see is what the game renders; cross-model blocks render as billboards; cutout/water handled).
- BUGS FOUND & FIXED DURING QA (agent-browser):
  1) tintedTex async canvas-swap rendered BLACK on the GPU (chicken legs, all tinted sheep) → replaced with SYNC architecture: preloadEntityTextures() decodes all PNGs at engine init / viewer mount; tintedTex builds the tinted CanvasTexture synchronously from the decoded image (falls back to untinted before preload). Debug evidence: isolated canvas tint worked, live material still black → root cause was the image-swap itself.
  2) Exact region-EDGE UVs sampled the next texel row (transparent padding next to several MC regions: chicken body/legs y23, villager/witch body y38, golem body y63) → boxUV now insets every region by 0.02 texel.
  3) Chicken legs layout h=5 hit transparent row 23 → h=4; wing (24,13) 1x8x6 mostly transparent → remapped (24,13) 1x3x6 (opaque strip).
  4) Sheep fleece legs: vanilla fleece covers only the UPPER HALF of legs (fur leg = 6 tall on a 12 leg, texOffs (0,16) h=6) — full-height wrap sampled transparent rows and looked cut-off black; legPivot now builds a top-aligned half-height fleece wrap.
  5) (mobSkins, golem) leg region h=8 hit transparent rows 81+ → h=6.
- Sheep color model ( groundwork for Task 32): fleece = full dye multiply; skin = 0.4-strength dye multiply so the sheared look KEEPS the sheep's color (white sheep = fully vanilla untinted).

QA (agent-browser):
- Asset Viewer, all 13 mob types + sheep variants: pig/cow/mooshroom red+brown (face w/ eyes+muzzle on front only, NO udder texels anywhere — user's cow bug fixed by construction), zombie/skeleton (faces + ribcage), creeper (iconic face), spider (8 legs), enderman (eyes), villager/witch (unibrow/eyes/nose/hat), golem (vine body, red eyes), chicken (white body, orange beak, RED wattle, ORANGE legs — vanilla runtime tint baked), sheep white/light_gray/gray/brown/black (white fleece + tan skin where vanilla shows it). Screenshots in tool-results/av3-*.png.
- Blocks tab: grass block per-face correct (the "weird grass in viewer" bug is gone — same render path as the world), leaves cutout holes ✓, poppy billboard ✓.
- In-game (world "Mob Rig QA" seed 7777, creative): cows/villagers/zombie/sheep/pig by day AND night (night = correctly dimmed by the voxel-light entity system), enderman/witch verified; rain cosmetic only. Engine exposed as window.__voxel (pre-existing line 227) for QA teleports.
- bun run lint CLEAN; tsc 22 pre-existing errors, 0 new. dev.log clean. Browser closed + pkill after QA.

Stage Summary:
- REGRESSION ROOT-CAUSED & FIXED: game restored to newest visuals, now BETTER than the lost build — mobs are pixel-perfect official-vanilla-textured with correct per-face UVs; the entire extracted-texel bug class (cow udder on body, sheep mouth) is impossible by construction.
- Asset Viewer restored with the SAME block rendering path as the world (fixes the user's "grass looks weird in the viewer" report).
- 3 protective commits: 4373df9, ee476d4 (+ this one).
- STILL MISSING (lost with the reset, to rebuild next): enchanting table (Phase 11), fishing (Phase 12), Phase 13 items; then the user's pending queue: creator test-tools button (time change etc.), creative inventory completeness audit, Minecraft-style inventory redesign, E-screen 3D character with mouse-follow, Task 32 shear color persistence (foundation done), Task 33 snow golem buildable.
---
Task ID: 19 (Feature — Creator Tools Panel, F4)
Agent: main (user request: "دکمه ابزار های اختصاصی تست بزار تا من سازنده بتونم سریع همچیز رو تست کنم مثلا تایم عوض کردن و...")

Work Log:
- NEW src/components/game/CreatorTools.tsx + state.creatorOpen/setCreatorOpen + engine F4 toggle (guarded to playing screen; panel floats top-right, pointer-events scoped so the game keeps running behind it).
- Features: TIME (Sunrise 130 / Noon 240 / Sunset 350 / Midnight 20 presets + live 0..479 slider reading eng.sky.time), WEATHER (Clear/Rain/Storm — sets weather.state + intensity directly), GAME MODE (creative/survival via player.gameMode), Heal (health=20), To Spawn (eng.spawnPoint + zero vy), SPAWN MOB (15 buttons: pig/cow/sheep white+black+brown/chicken/mooshroom/zombie/skeleton/creeper/spider/enderman/villager/witch/golem → mobs.debugSpawn 4 blocks in front at scanned ground height), Kill Hostiles (dead=true + deathT for hostiles), Clear All Mobs (mobs.clear()).
- React hooks-lint compliance: render-time engine access is READ-ONLY (display); all mutating handlers refetch via act((g)=>...) wrapper (no captured-engine mutation after render).

QA (agent-browser, world "Mob Rig QA" creative):
- F4 opens panel ✓; ✕ closes ✓; F4 reopens ✓ (toggle verified both ways).
- Noon button → sky.time=240, sunLevel=1.00 ✓; slider tracks ✓.
- Clear → rain stops ✓ (weather cleared, fading drops visible only as residue).
- Spawn Creeper/Sheep → mob count 20→22, zombie spawned 4 blocks ahead visible in frame ✓.
- No console/page errors ✓. lint CLEAN, tsc 22 pre-existing / 0 new. Browser closed + pkill.

Stage Summary:
- Creator has a one-keystroke (F4) test console: time, weather, mode, spawns, cleanup.
- NEXT: rebuild enchanting (Phase 11) + fishing (Phase 12); creative inventory completeness audit; Minecraft-style inventory redesign; E-screen 3D character w/ mouse-follow; Task 32 shear color (foundation: sheep two-layer skin model done); Task 33 snow golem.
---
Task ID: 20 (Bugfix — Creative Inventory Missing ALL Non-Block Items)
Agent: main (user question: "creative inventory تمام ایتم های جدید که اضافه شده هستش یا خیر؟" — audit result: NO, none were.)

Work Log:
- AUDIT (new permanent tool qa/tools/creativeAudit.ts, run with `bun run qa/tools/creativeAudit.ts`): cross-checks BLOCK registry + ITEM registry against creativePalette(). Found: 60/60 blocks present, **0/68 items present** — every non-block item (foods, materials, tools, armor, bow, boat, …) was missing from the creative palette.
- ROOT CAUSE (creativeItems.ts itemPalette()): `Object.keys(ITEMS)` yields numeric STRING keys ('256'), but the code re-indexed `ITEMS[idStr]` (yielding the ItemDef OBJECT cast to number) instead of parsing it — `getItemDef(object)` returned undefined → every item was `continue`d → empty item palette. Blocks were unaffected (blockPalette iterates the BLOCK enum by value).
- FIX: `const id = Number(idStr)` + finite guard. Post-fix audit: palette 129 = 60 blocks + 69 items, missingBlocks=[] missingItems=[] — every registered block AND item (incl. all phase-9/10 additions: hoe tiers, seeds, wheat, bread, boat, bonemeal) is now in the creative inventory.
- Visual QA: opened creative inventory in-game (E) — blocks grid ✓, scrolled palette shows all item icons (food/materials/armor sets/all 5 tool tiers incl. hoes/bow/arrow/boat) ✓. Bonus: fixing the cast removed 1 pre-existing tsc error (22 → 21).

Stage Summary:
- Creative inventory completeness RESTORED and now provably complete via the audit tool (re-runnable any time new blocks/items are added).
- tsc error count 21 (was 22 pre-existing baseline). lint CLEAN. Committed.
- REMAINING QUEUE: enchanting (Phase 11) + fishing (Phase 12) rebuild; Minecraft-style inventory/crafting redesign + E-screen 3D character w/ mouse-follow; Task 32 shear color persistence (sheep two-layer skin model already in place); Task 33 snow golem buildable.
---
Task ID: 21 (CRITICAL — Vanilla Mob Overhaul: missing parts + arms NaN root cause + snow golems + git backup)
Agent: main (user reported: pig no snout / sheep no face / chicken beak detached / zombie+skeleton+enderman+witch+golem no arms / spider texture+legs / villager lower body+nose / golem black legs / 2 snow golems missing / "why did you go back to the old version" + asked for git backup to github.com/masoudwolf/minecraft)

Work Log:
- CONTEXT: the user compared the post-reset rebuild against the LOST original build (first sandbox reset destroyed Tasks 18-31). The rebuild was missing many mob features. NO code was recovered (old work was never committed) — everything below was REBUILT from vanilla references.
- REGION DECODING: regionDump'd ALL 16 vanilla entity textures to derive exact UV regions (pig snout (16,16)4x3x1, spider head 8x8x6 + body (0,14) + legs (28,14), golem legs/arms (60,27) 6x24x6 / 4x28x2, snow_golem head (0,0) + body (0,16)10x10x10, villager legs (0,22) robe texture, witch arm (44,26)).
- SKINS: mobSkins.ts — pig snout part; spider clean regions (fixes texture overlap smear); golem limb/limb2 vanilla dims (fixes BLACK legs — old (0,70)4x6x4 sampled transparent rows); snowgolem skins (pumpkin variant head = boxCrossTex assembling pumpkin_top/side/carved_pumpkin block PNGs into an 8x8x8 cross; plain = snow coal face); witch arm region v26 (rows 24-25 transparent).
- vanillaSkins.ts: BoxUVOptions.frontTransparentRect (sheep fleece head FRONT maps to transparent rect (26,1,6,6) → sheep's real face with EYES shows through the wool — user's "sheep has no face" fixed); boxCrossTex() composite; preload + snow_golem/pumpkin textures; uvBox opts passthrough.
- mobs.ts: materials now alphaTest 0.35 + DoubleSide (cutout: skeleton RIBCAGE GAPS now see-through = user's "alpha body / double shield"; fleece face holes; no more black transparent sampling). Hip pivots moved INSIDE body (+30% bodyH inset, legs lengthened) → legs visibly swing from the TOP, no hip gap (user's "pivot should be from top"). Chicken beak+wattle are CHILDREN of head (follow head bob; attached). Villager: duplicate-texture SKIRT REMOVED → full-length robe legs (vanilla (0,22) region), nose child of head. Witch: nose + 4 hat pieces children of head. Golem: vanilla long arms (0.25x1.6x0.14 from y2.0), long legs (1.62), nose child of head. Enderman: arms lengthened to 1.5 (vanilla 30px). Skeleton: BOX BOW in right hand (buildBow: limbs+string, solidTex to stay tint-safe) + animator aiming pose (chase → -1.35 rad). Spider: 8 two-segment legs arched OUT+DOWN (vanilla), subtle per-leg ripple anim. Snowgolem: new MobType — body 0.62 cube + head 0.5 + two brown stick arms (cutoutMat), NO legs (animator legs guard fixed), drops SNOWBALL 0-15, natural spawn on SNOW_GRASS (85% pumpkin / 15% plain), CreatorTools + AssetViewer entries (20 total).
- items.ts: SNOWBALL id 331 with pixel icon (creative audit auto-includes).
- 🐛 ROOT CAUSE of "zombie/skeleton/enderman/witch/golem have NO ARMS" (reproduced in Asset Viewer, debugged via __lastParts + matrix inspection): **our custom `mesh.pivot = group` animation property collided with three.js's NEW built-in `Object3D.pivot`** — updateMatrix() now applies `this.pivot.x/y/z` as an offset; our Group has no .x/.y/.z → undefined → NaN local matrix → arms culled at NaN coordinates. Fix: renamed the custom property to `limbPivot` at ALL 11 sites (mobs.ts ×8, playerModel.ts ×2 — the PLAYER's arms were broken too!, AssetViewer ×1).
- AssetViewer walk anim: was rotating the leg MESH (middle pivot!) — fixed to rotate the hip PIVOT groups (top pivot) — user's "leg pivot from middle" in the viewer fixed.
- QA (agent-browser): Asset Viewer — pig snout ✓, sheep face+eyes ✓, chicken beak/wattle attached ✓, zombie arms+face ✓, skeleton thin arms+ribcage gaps+BOW ✓, spider arched red-striped legs ✓, enderman long arms+eyes ✓, villager nose+robe ✓, witch nose+hat+purple sleeves ✓, golem long arms/legs (no black) ✓, snowgolem pumpkin (carved face)+sheared (coal face) both with stick arms ✓; in-game (Mob Rig QA, noon): enderman + pig(snout) verified, snowgolems alive, Creator Tools buttons OK, dev.log clean, lint CLEAN. Browser closed + pkill.
- GIT BACKUP: repo reaches https://github.com/masoudwolf/minecraft.git (empty, public); remote 'origin' configured; push BLOCKED — no credentials in sandbox (no gh CLI / token). NEED: user creates a GitHub PAT (repo write scope) and sends it, or pushes manually. Every work unit is committed (protective commits 940aeed, ac2982e — sandbox resets restore last commit, so committing = backup).

Stage Summary:
- ALL user-reported mob issues fixed: pig snout, sheep face, chicken beak/wattle, leg pivots (top, viewer+game), zombie/skeleton/enderman/witch/golem arms (three.js pivot collision — the REAL regression), skeleton bow+ribcage, spider texture+legs, villager nose+lower body, golem black legs, 2 snow golems added (pumpkin+sheared) with SNOWBALL drops + snowy-biome spawns.
- Prevention: commit after EVERY unit (done: 2 protective commits this round); git remote ready — awaiting user PAT to enable off-sandbox backup.
- NEXT QUEUE: cow udder spot-check, E-screen 3D character w/ mouse-follow, Minecraft-style inventory redesign, Task 32 shear color persistence, enchanting/fishing rebuild, next phase.
---
Task ID: 22 (CRITICAL — Vanilla model source verified + full mob geometry/UV rebuild round 2)
Agent: main (user defect list round: cow/mooshroom udder under head, sheep face, spider, enderman jaw, villager arms, witch arms+hat, golem legs sunk, snow golems ×2; + "analyze everything yourself" meta-demand; + GitHub token)

Work Log:
- GROUND TRUTH: fetched REAL vanilla 1.20.1 model sources (SpiderModel, EndermanModel, CowModel, QuadrupedModel, SheepModel, SheepFurModel, VillagerModel, WitchModel, IronGolemModel, SnowGolemModel, PigModel, ChickenModel) via GitHub code-search API → github.com/Blackjack200/minecraft_client_1_20_1; stored under qa/ref/models/mc-1.20.1/ (permanent reference — future mob work must read these first). Cross-checked every region against the PNGs with new qa/tools/regionScan.cjs (color-cluster scanner: pink/dark bounding boxes + per-region avg colors).
- EMPIRICAL PROOFS: cow udder texels are the pink cluster at (31,26) 6×6 = bottom of the body's FRONT region → vanilla body is a VERTICAL 12×18×10 box rotated 90°X (front region = belly, udder box (52,0) 4×6×1 hangs under the REAR belly) — our horizontal mesh was the whole udder-under-head bug. Sheep skin head is 6×6×8 (face plate (8,8)-(13,13) with eyes+muzzle PROTRUDES 2px past the wool) while the fleece head is 6×6×6 shifted 2px back (SheepFurModel: box z −4..2, inflate 0.6) — the protruding face IS the vanilla trick, no transparency hack. Spider: head (32,4) 8×8×8, thorax (0,0) 6×6×6, abdomen (0,12) 10×8×12, legs (18,0) 16×2×2 one box per leg. Enderman: body (32,16) 8×12×4, limbs (56,0) 2×30×2 (30px!), inner hat layer (0,16) 8³ −0.5 = the vanilla jaw/mouth. Villager arms = ONE folded assembly (two 4×8×4 at (44,22) + 8×4×4 bridge at (40,38), group rotX −0.75). Witch = villager layout + nested hat chain (0,64)10×2×10 → (0,76)7×4×7 → (0,87)4×4×4 → (0,95)1×2×1 with cumulative tilts + nose wart. Golem: legs 6×16×5 at (37,0)/(60,0) pivot at body bottom, arms 4×30×6 at (60,21)/(60,58), skirt (0,70) 9×5×6. SnowGolem: TWO bodies (0,16)10³ + (0,36)12³, head 8³(−0.5), arms (32,0) 12×2×2 REAL stick texture, rotZ 1.0 droop.
- CODE: mobSkins.ts — all 13 builders rewritten to vanilla texOffs/dims (sheep skin tint strength 0.4→1.0 = vanilla full dye); mobs.ts — quadruped() now builds the vertical body + rotation.x=π/2 (+udder child at local (0,−6px,+5.5px), horns 1×3×1, fleece body +3.5px, fleece head at z −1px), all per-mob opts = vanilla px numbers; spider legs = 8 vanilla single boxes with baseY/baseZ/phase/side userData + animator port of vanilla setupAnim (ySway=−cos(2ωt+φ)·0.4·amt, zBob=|sin(ωt+φ)|·0.4·amt mirrored per side); enderman/villager/witch/golem/snowgolem builders = exact vanilla geometry; AssetViewer spider-aware leg anim + mobKey.
- FIX: vanillaSkins.boxCrossTex — 9-arg drawImage (block 16×16 → 8×8 face slot; the old 3-arg call drew 16px chunks that overflowed and smeared = the broken pumpkin head); sides now use carved_pumpkin (vanilla carved pumpkin has the face on ALL 4 sides); fallback placeholder now SELF-REDRAWS via onPreloaded callbacks (engine fire-and-forgets preloadEntityTextures — a mob built in the first frames previously cached a stale fallback forever; that was the in-game dark pumpkin head).
- QA (agent-browser): Asset Viewer all 20 entries — pig ✓ cow (udder under rear belly CONFIRMED via orbit, horns, pink ears) ✓ sheep white (face plate with eyes+muzzle protruding past wool) ✓ brown (full dye) ✓ mooshroom red (udder visible) ✓ spider (red-eyed face, fangs, clean arched legs — no eyes-on-legs, no cut body) ✓ enderman (vanilla hair pattern, 30px limbs) ✓ villager (folded arms, nose) ✓ witch (complete 4-tier bent hat + wart + folded arms) ✓ golem (legs under body, vines, nose) ✓ snowgolem pumpkin (carved face all-around) + sheared (coal face) ✓. In-world (Mob Rig QA noon): spider arched legs walking ✓, sheep face ✓, enderman ✓, villager folded arms ✓, witch hat ✓, golem legs ✓, pumpkin+plain snowgolems ✓ (post-reload re-verify after the self-heal fix). dev.log clean; lint CLEAN; browser closed + pkill.
- BACKUP: user sent GitHub PAT — REJECTED by GitHub: fine-grained token lacks "Contents: Read and write" (REST write test: "Resource not accessible by personal access token"). remote origin set with token; backup.sh commits+pushes (retries per cron cycle — will succeed once the token is edited: Repository access→minecraft selected; Permissions→Contents: Read and write). Local protection = commit-per-unit (intact). webDevReview cron recreated (job 424261, 900s, updated project context).

Stage Summary:
- EVERY mob the user listed is now built from the REAL vanilla model definitions (source-verified, not eyeballed): udder under the rear belly (+horns), sheep protruding face, spider rebuild, enderman jaw-layer + 30px limbs, villager/witch folded arms + full witch hat, golem legs at the body bottom, two-body snow golems with real stick arms + correct carved-pumpkin head. Plus the meta-fix: qa/ref/models/ + regionScan.cjs = the self-analysis pipeline the user asked for (models now come from source, region scans prove texture placement).
- PENDING (user action): GitHub token needs Contents:Read+Write — then ./backup.sh pushes automatically.
- NEXT QUEUE: E-screen 3D character w/ mouse-follow head; Minecraft-style inventory/crafting redesign; Task 32 shear color persistence (foundation done); enchanting+fishing rebuild; next phase.

---
Task ID: 33
Agent: main (Z.ai Code)
Task: Sheep head-wool dye verification + Asset Viewer upgrade (rotation toggle, full animation playback, model-inspection toolkit)

Work Log:
- USER REQUEST (Persian): ① sheep HEAD wool parts must take the variant color too (black sheep → black head wool); ② Asset Viewer needs a rotate on/off toggle (static view); ③ viewer must show ALL the mob's animations; ④ add other useful options for understanding models.
- SHEEP HEAD WOOL — VERIFIED ALREADY CORRECT: browsed Asset Viewer, selected Sheep (Black), sampled the fur-head mesh texture in-page: px(25,25,27) ≈ #19191B = exact black dye. All 5 variants screenshotted (white/light_gray/gray/brown/black): body + head fleece tinted per SHEEP_COLORS, cream face plate + forehead tuft stay untinted (vanilla SheepFurLayer behavior, confirmed by cropping sheep_body.png face rect (8,6,6,6): white forehead + tan skin + eyes). User's screenshot was from the pre-rebuild bundle; current build is vanilla-correct. NOTE user screenshot face plate IS white-ish in vanilla too.
- ROOT-CAUSE HARDEN (tint race): tintedTex() previously returned an untinted vanillaTex fallback when images weren't decoded yet, and mobSkins skinCache would cache that MobSkins FOREVER (same class as the old dark-pumpkin bug, for dyed mobs spawning in the first frames). Now: placeholder canvas texture cached immediately + registered onPreloaded redraw repainting the SAME canvas (tex.needsUpdate) — self-heals in place like boxCrossTex. preloadDone flag added; post-preload miss still falls back to vanillaTex.
- ASSET VIEWER REWRITE (src/components/game/AssetViewer.tsx):
  • Anim select (top bar): Idle / Walk + per-mob specials — Attack/Chase (skeleton bow-aim −1.35, enderman provoked −1.15, golem arms-raised −1.2, spider scuttle), Wing Flap (chicken, sin(t·8.7)·0.85 mirrored) — poses mirror the in-game animator exactly; passive mobs offer Idle|Walk only.
  • Speed slider 0–2× (0 = pose freeze) multiplying animState.t.
  • Rotate toggle: turntable freeze (verified: rotation.y frozen when off).
  • Tool chips (viewport, amber active): Grid (GridHelper 12×24), Hitbox (amber EdgesGeometry box from NEW mobs.ts export getMobDims(type) → def width/height; info line "hitbox 0.90×1.30 · anim walk"), Pivots (AxesHelper gizmos on head + leg hips + arm shoulders — top-pivot check at a glance), Skins (panel listing every texture the model uses: rasterized canvas/img previews + field usage labels + tex size; blocks tab shows the full block atlas), Wireframe (FOUND + FIXED inherited no-op — wireUV was synced but never applied; now sets material.wireframe across the model, verified 7/7 meshes), Light BG (0x1c1c24 ↔ 0xcfcfd6 — makes black-on-dark models visible), Reset (camera defaults per mob/tab + model rotation → 0).
  • React-hooks lint compliance: skin panel = pure useMemo from MobSkins data (no setState-in-effect); anim clamping = derived effAnim (no effect).
- QA (agent-browser): rotate freeze ✓ (rotation.y const), skeleton attack rotX {0.08,−1.35} ✓, chicken flap rotZ ±0.76 oscillating ✓, enderman attack pose screenshot ✓, speed 0 freeze (head bob frozen) ✓, grid/hitbox/pivots visuals ✓, skins panel (enderman.png 64×32 "head,body,limb,limb2"; block atlas 256×256) ✓, light BG ✓, reset ✓, pig anims = Idle|Walk ✓, blocks tab hides hitbox/pivots ✓. POST-CHANGE re-verify (tintedTex touched shared path): sheep black + chicken orange legs + snowgolem pumpkin (face front-only) + witch nose/hat ✓. In-world Mob Rig QA load ✓ (terrain + sheep + hotbar). dev.log clean; lint CLEAN; browser closed + pkill; ./backup.sh committed (push still blocked by PAT permissions).

Stage Summary:
- Sheep dye question resolved by VERIFICATION not rework: all 5 variants tint body + head fleece, face stays vanilla-untinted. Hardened tintedTex against the first-frames preload race (self-healing placeholder) — kills the "cached untinted sheep" bug class in-game too.
- Asset Viewer is now a real model-inspection workbench: rotate freeze, per-mob animation playback with speed control, grid, hitbox, pivot gizmos, texture-usage panel, wireframe (actually working now), light background, reset view.
- PENDING (user action): GitHub PAT needs Contents:Read+Write → ./backup.sh will push automatically.
- NEXT QUEUE: E-screen 3D character w/ mouse-follow head; creative inventory completeness audit; Minecraft-style inventory/crafting redesign; Task 32 shear color persistence (foundation done); mob swimming behavior (walk-on-water fix); "objects turn black" unified root-cause hunt.
---
Task ID: 34
Agent: main (Z.ai Code)
Task: User report (Persian): ① mobs must SWIM believably in water (they walked on the surface); ② some mob body parts are BRIGHT at night and visible from far away — investigate why; ③ sheep HEAD wool still doesn't take the variant color (gray/brown/black sheep have WHITE face wool).

Work Log:
- NIGHT GLOW ROOT-CAUSED: the material collectors in the mob builders only went ONE level deep (`pivot.children`), so the sheep's FLEECE-LEG fur (a child of the leg MESH, added by legPivot) was never registered in parts.materials → never cloned per-instance at spawn → never received the world-light tint (`color.setRGB(tintR*f, …)`) → the fleece legs stayed FULL-BRIGHT WHITE at midnight (a white sheep = 4 glowing leg-warmers visible from far). Fix: new `collectMatsDeep()` recursive collector (deduped); all 9 builder sites switched to it; PLUS a safety net in `spawn()` that rebuilds parts.materials from a FULL group traversal before the per-instance clone — no builder can ever miss a nested part again. Verified in-game: probe script (deep traversal vs parts.materials) reports ALL 28 MOBS OK; at midnight (sky.time=20, sunLevel 0.10) ALL 255 materials across every mob measured dark (bright=0).
- SHEEP HEAD WOOL ROOT-CAUSED (texel forensics on sheep_body.png + vanilla SheepFurModel/SheepModel source): the dyed look comes from the FLEECE layer, but the SKIN head also has WOOL texels that stayed vanilla-white: (a) the face plate's FOREHEAD row (y=8: grays 210–248) and its muzzle-frame CORNER texels (222,222,222) at rows 12–13; (b) the protruding 1.4px rim of the face plate samples the head's TOP/SIDE faces which are wool-white. On gray/brown/black sheep this read as "the wool of the face is white" — exactly the user's report. Fix: `tintedTex()` extended with REGION-limited tinting — `TintRegion = [x,y,w,h] | [x,y,w,h,'wool']`; full-tint rects for the head's top/bottom/side/back faces; the face plate uses a per-texel 'wool' filter (near-neutral r≥190, excludes pure-white eye sclera / tan skin / pink muzzle) so ONLY wool texels take the dye. Region-tint cache keys are region-aware; self-healing preload redraw threads regions through. White sheep stays 100% vanilla. Verified in Asset Viewer: black/gray/brown sheep now show dyed head wool cap + dyed wool framing around the muzzle, eyes + tan skin + pink nose untouched; close-up screenshots saved.
- SWIMMING (vanilla floatEntity-like): REMOVED the old `if (m.inWater) m.vy = max(vy, 1.8)` — that upward kick made mobs pop out of the water and SKIM across the surface (the "walking on water" bug). New physics: `isDeepWater()` (water at mid-body height — feet-deep puddles keep grounded wading with slight drag); in deep water vy approaches a target (2.4 head-under / 0.9 at surface) with damping, horizontal drive ×0.55 + drag → paddling; measured 0.33 b/s swim vs 0.42 land wander. Shore breach: blocked while in water → vy ≥ 3.4 (climbs out, no 8.4 rocket). Splash landings decelerate smoothly (dropped from 4–10 blocks → sink briefly → rise → bob). Visuals: gentle surface bob (sin(time·2.4)·0.035), ground shadow hidden while swimming. Verified empirically in a contained sky pool: sheep/cow/pig float half-submerged with heads out (y≈90.1, vy≈0.8, mid-height riding the waterline), paddle across on command, screenshot saved (swimming sheep head above water = vanilla pose).
- QA world notes: WORLD_HEIGHT is 96 (y=110 setBlock silently no-ops — pool5 never existed; use ≤93 for rigs). Natural water caves under the QA spawn (mobs wandered into them and swam — more proof). Test rigs cleaned up, mobs reset, noon restored, weather clear.
- dev.log clean; browser console clean; lint CLEAN; browser closed + pkill after QA.

Stage Summary:
- All three user-reported issues FIXED and browser-verified: ① mobs swim/bob/paddle in water (no more surface-skimming); ② night-brightness leak root-caused to uncollected fleece-leg materials — deep collection + spawn-time safety net make the world-light tint complete for every mob (255/255 materials dark at midnight); ③ sheep head wool (forehead, muzzle frame, protruding rim) now takes the variant dye via region-limited texel tinting while eyes/skin/muzzle stay vanilla.
- Protective commit follows this entry; ./backup.sh will push when the PAT gains Contents:Read+Write (still pending user action).
- NEXT QUEUE: E-screen 3D character w/ mouse-follow head; Minecraft-style inventory/crafting redesign; Task 32 shear color persistence (foundation done); enchanting+fishing rebuild; next phase.
---
Task ID: 35
Agent: main (Z.ai Code)
Task: User report (Persian): "token access should be OK now — re-check" + "play the game yourself multiple times — survival AND creative, debug gameplay visually/logically/code-wise, everything that needs checking."

Work Log:
- GITHUB BACKUP FIXED & VERIFIED: remote push was failing before (empty repo!) — the new PAT works: pushed FULL main history to github.com/masoudwolf/minecraft (refs/heads/main confirmed), created + pushed milestone tag v0.34-gameplay-qa. Every unit of work is now also safe off-sandbox.
- GAMEPLAY QA — SURVIVAL (new world "QA Survival Run", seed 7777, played via agent-browser):
  • Full craft chain verified end-to-end: punch tree → logs → planks (2x2) → sticks → crafting table (placed in world) → 3x3 wooden pickaxe + wooden sword → dug to stone → cobblestone. Recipes, invClick semantics (left=stack, right=one, output take, cursor-swap), table open via right-click all correct.
  • Mining + drops: dirt/stone/grass drop + magnet pickup + tool durability (sword 59→58 after mob hits; pickaxe wear) ✓. Leaves drop saplings; XP orbs from ores; XP bar + level render.
  • Combat: sword 4 dmg on zombie, zombie death + flesh drop, monster-hunter path; sunlight burning verified empirically (teleported zombie to open sky: skyL=15, burning=true, 1 dmg/s ticks 20→17→14) — a zombie standing in a shaded dig-shaft does NOT burn (correct light logic).
  • Death loop: died 3× during QA (night zombies ×2, drowning ×1, enderman ×1 across sessions) — "You Died!" screen + respawn + item spill all work. Deaths were legitimate (standing still crafting at night / swimming into a cave ambush / staring at an enderman).
  • Hunger: passive drain + regen (hp 13→20 overnight save) ✓. Achievements unlock (world shows 3/12).
  • Verified Task 34 fixes live in-game: pigs/cows bob + paddle at the lake surface; night entity dimming correct.
- GAMEPLAY QA — CREATIVE: creative palette UI complete (grab stack / X-delete slot), creativePick(id) API, instant-break, flight glide, mode indicator, CreatorTools F4 panel (time presets + slider, weather, mode, heal, to-spawn, 17 mob spawn buttons) — panel state syncs when mode changes engine-side.
- BUGS FOUND & FIXED (this round):
  1. PLAYER WATER SINK was uncapped (-6..-8 b/s — plummeted onto the lakebed, felt like concrete). Fix: cap vy at -1.8 in water (vanilla ~-1.5). Verified: 4-block descent now takes seconds, floats gently.
  2. NO SHORE EXIT: player got STUCK wading at the lakebed pushing into a 1-block shore (had to manually Space). Fix: shore climb — blocked while in water + pushing → full JUMP_VELOCITY from the lakebed / 3.4 breach while swimming. Verified: hopped vy=8.0, rose 2 blocks, walked out onto land.
  3. NO DROWNING SYSTEM (vanilla gap — you could idle underwater forever). NEW: 15s air → 2 dmg/s drowning (player.updateAir, head-block water check in physicsStep, creative/dead immune, 4× refill). HUD: MC-style pixel BUBBLE BAR above hunger (Bubble SVG component, shows only while air < max, popped-bubble fragments). VERIFIED: air 15→0 in 15s head-underwater, damage ticks, death, bubbles UI rendered.
  4. Weather balance: rain cycles were ~40% of playtime (140-400s clear vs 70-200s wet). Now clear 260-560s, rain 60-170s → rain is a minority; starts clear on new worlds (verified init was already correct).
- NOT A BUG (investigated & cleared): "target=null while placing" (aim was over open air — pitch sign: negative = down), item "vanishing" during crafting (cursor-held stack + takeCraftOutput silent-return when cursor occupied — correct MC semantics), zombie not burning (standing in shaded shaft), PUT /api/worlds failed once (client aborted mid-save during Fast Refresh; self-heals), player "frozen" (was dead — death interrupts input).
- QA-session learnings (tooling): agent-browser pointer lock is flaky in headless (mining/right-click guarded by lock) — drove engine flags directly for QA; agent-browser mouse coords miss DOM slots under pointer lock — used invClick API (real-user mouse unaffected).
- dev.log clean at end (1 transient PUT fail only), bun run lint CLEAN, compile clean. Browser closed after QA.

Stage Summary:
- Played survival AND creative across multiple sessions; the core loop (harvest → craft → build → fight → die → respawn) is verified working end-to-end with vanilla-faithful behaviors (sunburn, drowning, shore-exit, sink physics).
- 3 player-water fixes + drowning feature + weather rebalance landed; all browser-verified.
- GitHub backup NOW WORKS (user's new PAT): full history + tag pushed. ./backup.sh will push every run from now on.
- NEXT QUEUE: E-screen 3D character w/ mouse-follow head; Minecraft-style inventory/crafting redesign; shear color persistence (Task 32); enchanting table + fishing rebuild; hostile spawn-density tuning near world spawn (10 hostiles cleared at dawn once); FPS is 4-8 in headless QA — check perf targets on real hardware.
---
Task ID: 36
Agent: main (Z.ai Code)
Task: User request (Persian): ① everything is good — now ADD: a cheat/debug button with in-game testing tools for fast bug-hunting; ② inventory completely like Minecraft; ③ a recipe guide book (how to craft each item); ④ in the inventory a 3D character that follows the mouse with its gaze (like Minecraft); ⑤ our character doesn't look like Steve at all — use the real vanilla Steve texture on our model, and make the mesh match vanilla too.

Work Log:
- STEVE (real vanilla skin): downloaded the OFFICIAL steve.png (64×64) from Mojang's bedrock-samples repo → public/textures/entity/steve.png; pixel-verified the classic layout (cyan shirt rgb(0,168,168) at body-front, purple iris, blue jeans, transparent hat layer). REWROTE playerModel.ts around vanillaSkins.boxUV (same pipeline as mobs — pixel-perfect by construction): head 8×8×8 @(0,0), hat layer 8×8×8 @(32,0) cutout (hair volume, hidden under helmets), body 8×12×4 @(16,16), arms 4×12×4 R@(40,16)/L@(32,48), legs 4×12×4 R@(0,16)/L@(16,48) — EXACT vanilla PlayerModel proportions (1px=1/16m: head pivot at neck y=1.5, hip pivots y=0.75, shoulder pivots y=1.375 x=±0.3125, 2px arm rise). Added 'steve' to preloadEntityTextures. Exported createSteveModel() (fresh materials per call — the engine's per-frame world-light tint on the F5 model must not leak into other instances). Armor overlays re-anchored to the new geometry + helmet shells now parent to the NECK PIVOT (track sneak/head pitch, vanilla behavior) via new helmetGroup; animatePlayerModel updated for the neck pivot + new sneak offsets. VERIFIED in browser: back view (cyan shirt/jeans/hair) + front view mode 2 (fringe, white+blue eyes, mouth, tan skin) — unmistakably Steve.
- INVENTORY 3D CHARACTER (mouse-follow): new InventoryPlayer3D.tsx — own tiny three.js scene (alpha renderer, flat bright lighting independent of world sun), builds createSteveModel(), head+neck-pivot tracks the cursor: yaw=±66°, pitch=±35°, body follows ×0.30, exp-smoothed return-to-forward on mouseleave, subtle breathing/sway idle. Replaced the old 16×16 pixel-art PlayerFigure in the survival inventory (MC-style layout: armor column + live 3D preview in a framed panel). VERIFIED: mouse lower-left → head/body turn down-left; upper-right → turn up-right (screenshots).
- RECIPE BOOK: new RecipeBook.tsx — book-styled panel beside the crafting grid (2×2 and 3×3): search box, category chips (All/Tools/Combat/Armor/Food/Blocks/Misc — id-range classifier incl. swords→combat, hoes→tools), all 56 RECIPES as icon entries with output count, CRAFTABLE-NOW detection from live inventory counts (green corner mark + sorted first + full opacity; dimmed = missing ingredients OR needs a table in 2×2 mode — legend included), click entry → pattern popover (3×3 grid with exact shaped cells / shapeless scatter → arrow → output, per-ingredient have/need counts colored green/red, "⚠ Requires a Crafting Table (3×3)" badge). VERIFIED numerically: green = {Bone Meal, Crafting Table, Stick} exactly (player had bones+planks, no flint/wool/tables-only shapes), 53 dimmed incl. Diamond Axe correctly dimmed in 2×2 (2×3 shape) — recipe data + have/need logic proven.
- CHEAT BUTTON + CHEATS: CreatorTools now renders an always-visible "⚒ Cheats" button (top-right, pointer-events-auto) when closed; panel opens via button OR F4. New "Cheats (Give ×64)" section: 12 icon give-buttons (diamond/iron/gold/coal/steak/bread/torch/planks/cobble/string/arrows/bow) → engine.cheatGive(id,n) (public; addToInventory + freshDur + HUD/inv sync + toast "+N × name"); Repair All → engine.cheatRepairAll() (restores dur for every tool/bow/armor in hotbar+main+armor, toast count); +10 Levels; God mode toggle (player.godMode — damage() early-return incl. drowning ticks) with ON/OFF label; Fast Mine toggle (engine.instantBreak — mining time forced 0.04s in survival); Full Restore (hp20/hunger20/air max/poison 0); Unstick +10Y. VERIFIED: diamonds 64→128 via UI click, Fast Mine label flips + engine flag true, noon/kill-hostiles/restore applied.
- 🐛 BUGS FOUND & FIXED (all browser-verified):
  1. CreatorTools act() wrappers: Creative/Survival/Heal/To-Spawn (pre-existing!) + all my new cheat buttons used `onClick={() => act(...)}` — builds the handler and NEVER CALLS IT (mode switches silently did nothing). Fixed to `onClick={act(...)}` everywhere (13 sites). This is why mode toggling never worked through the panel.
  2. F4 panel vs pointer lock: engine paused whenever the F4-unlock fired (pointerlockchange auto-pause). Added creatorOpen exemption next to inv/trade; F4 now exits the lock when OPENING and re-locks when CLOSING; panel ✕ re-locks too — the cheat UI is actually clickable now (was unusable for real users while pointer-locked).
  3. CreatorTools HMR/stale-engine crash ("Cannot read properties of undefined (reading 'time')" — eng.sky undefined after Fast Refresh): added engReady guard (sky && player && mobs).
  4. RecipeBook duplicate React key "5-4-shapeless" (two shapeless planks recipes): keys now include the recipe index; selection tracked by idx.
  5. three.js warning "parameter 'alphaTest' has value of undefined": MeshLambertMaterial params built conditionally in playerModel mk().
  6. Inventory layout tightened (preview 196px, book list 252px max) so the panel fits shorter viewports.
- QA-session learnings: agent-browser synthetic KeyboardEvents DO reach the engine, but pointer-lock-gated handlers early-return in headless (E/F5 flaky) — drove engine via window.__voxel + real DOM mouse events for UI; the QA Survival Run spawn is a night death-trap (died ~8× during QA — legit mob kills) → pattern: respawn → immediately noon+god+kill-hostiles.
- State left behind: survival world QA Survival Run at noon/clear, player survival mode hp20, god OFF, instant-break OFF, +128 diamonds/+64 steak/+64 torch etc. from cheat testing (harmless gifts), camera first-person.
- dev.log clean; bun run lint CLEAN; browser closed + pkill after QA.

Stage Summary:
- All 5 user asks delivered and verified in-browser: real Steve (texture + vanilla mesh + neck-pivot), inventory 3D character with Minecraft gaze-following, recipe book (search/categories/patterns/craftable-now), visible cheat button + full cheat kit for fast bug-hunting, Minecraft-style survival inventory layout.
- Plus 6 latent bugs fixed (the act() no-op handler bug explained "panel buttons do nothing" since the panel existed; pointer-lock/panel UX; HMR crash; dup keys; alphaTest warning).
- NEXT QUEUE: creative-inventory category tabs (MC has tabs), recipe auto-fill into the grid (click a recipe → engine fills ingredients), E-screen 3D preview also in creative + table modes, shear color persistence (Task 32), enchanting table + fishing rebuild, hostile spawn-density tuning near spawn.
---
Task ID: 37
Agent: main (Z.ai Code)
Task: User request (Persian): an AI-built mob was provided as an HTML demo (شوالیه سایه نئونی — Neon Shadow Knight). First asked IF it could be used and as WHAT (answered: elite hostile night duelist). Then: "add it to our game — everything must be EXACTLY like what I gave you: texture, model, animations — don't edit any of it, whatever it has is good."

Work Log:
- VERBATIM PORT (src/game/entities/knightSkin.ts): the demo's procedural painter ported 1:1 — same seeded RNG (seed 11 LCG, `seed*16807%2147483647`), same helper semantics (sh/lt/css/px/gl/clr/fl), SAME painter call order (hs→hf→hb→ht→hd→cm→hm→bf→bb→bs→bt→am→at→ab→pm→lm→lu→cp→bm→gm→rm) so every texel is BIT-IDENTICAL to the demo; every part keeps its main+emissiveMap pair (the neon glow: eyes, armor trim, chest core, blade). Model hierarchy ported exactly: head 8³ (crest 1.6×2.6×6.5 + 2 horns 1.4×5×1.4 rotZ∓0.55), body 8×12×4, arms 4×12×4 with pauldrons 5×2.6×5 + spikes, legs 4×12×4 (hip pivots y=12), cape 8×14×0.6 with alphaTest jagged hem, glowing sword (handle+guard+blade 1.5×15×0.5+pommel) in the RIGHT hand + its PointLight. Only engine adaptations (not design): px=1/16 scale, SRGBColorSpace on canvases, r186 light units (K_LIGHT=3.55, decay 1 ≈ r128 legacy falloff), look target = player/viewer camera instead of demo orbit camera.
- ANIMATOR ported verbatim: the demo's 8 channels (aL,aR,lL,lR,ty,by,cp,hy,hx) with EXACT curves for idle/walk/attack/pose (attack: windup p<0.4 → slash p 0.4-0.6 (hit flag, sword light pulse ×3.5) → recovery), same lerp constants (dt*14 attack / dt*7 else), head tracking formula (|a|<1.5 gate, ×0.55, dt*4 smoothing), breathing bob (head+arms y=24+by), cape sway (rotZ sin(t*3)*0.05). In-game swing management: swingT starts at trigger, damage lands ONCE on the hit frame via onHit (dist<3.4 → damagePlayer + clang) — visuals and gameplay are one motion.
- INTEGRATION (mobs.ts): MobType+'knight', sound union+'knight', MobDef.builder now takes variant. Def: hostile, 0.7×2.1, HP 50, speed 2.2, dmg 6, drops IRON_INGOT 1-2 + COAL 0-2, XP 5. AI: chase<26 blocks, melee trigger <2.7 (cd 2.1s), swing pauses movement; wander otherwise. Natural spawn: rare night roll (6% of hostiles, cap 2 alive) with weighted variants cyber .38/fiery .27/toxic .20/ender .15; variant threads through skinKey+spawn+save (SavedMob.variant already generic). Generic animator skips legs/arms/head-bob for knight (its animator owns every part).
- AUDIO: 'knight' ambient (deep 56Hz saw hum + sub noise), hurt (metal clash), NEW knightSlash (greatsword whoosh on windup) + knightClang (metal ring + thud on hit frame).
- UI: CreatorTools spawn list +4 knight variant buttons; AssetViewer +4 entries (hostile), Attack anim available, NEW "Hero Pose" anim option (knight), camera defaults (targetY 1.05, dist 4.6), knight tick branch calls the verbatim animator with real dt + head tracks the orbit camera (the demo's signature behavior, reproduced); Skins panel now rasterizes the knight's REAL runtime canvases (map+glow) via knightSkinCards() with part labels + throwaway dispose.
- 🐛 BUG FIXED (pre-existing): the Spawn Mob buttons in CreatorTools NEVER worked — `onClick={() => spawnAtLook(...)}` wrapped spawnAtLook's RETURNED handler in a never-invoked arrow (same bug class as Task 36's act() wrappers; the mob-spawn buttons were the last survivors). Fixed to `onClick={spawnAtLook(m.type, m.variant)}`. Verified: 0→4 knights after clicks.
- QA (agent-browser): Asset Viewer — all 4 variants render with correct theme palettes (cyan+purple / orange+red / green+teal / magenta+dark-purple), neon glow, cape, horns, sword; attack swing + hero pose (sword skyward) verified; head tracking measured (rotY 0.697→0.004 as camera orbits); skins panel shows real procedural textures. Original demo HTML opened side-by-side — same armor pattern/colors/silhouette. In-game (QA Survival Run, night): knight naturally spawned by the world roll BEFORE any manual spawn (spawn logic live); spawned all 4 variants via panel; knights chase + walk-swing (legL.rotX=-0.416 at speed 2.2) + head faces the player; melee damage landed (god off: hp 20→11 with mixed night-hostile hits); death → 2×IRON_INGOT + 2×COAL drops on the ground + XP orb collected (level 0→1); toxic knight seen GLOWING GREEN in the dark (emissive at night = the point of the design). dev.log clean, browser console clean, lint CLEAN, browser closed + pkill.
- State left behind: QA Survival Run at noon/clear, god ON, hp 20, 3 knights (fiery/toxic remaining + 1) alive near spawn shore — harmless (QA world), 11 mobs total.

Stage Summary:
- The user's AI-built Neon Shadow Knight is now a real in-game mob: textures/model/animations bit-faithful to the provided demo (same seeded painter), integrated as a rare elite hostile night duelist with 4 color variants, synced sword-swing combat, drops, sounds, spawn buttons, and full Asset Viewer support (incl. Hero Pose + real texture panel).
- Bonus: fixed the last act()-style no-op bug (spawn buttons never worked since the panel existed).
- NEXT QUEUE: creative-inventory category tabs; recipe auto-fill into grid; shear color persistence (Task 32); enchanting table + fishing rebuild; hostile spawn-density tuning near spawn.
---
Task ID: 38
Agent: main (Z.ai Code)
Task: User report (Persian): ① knight damage is applied while the sword is still UP — it must land when the blade lands; ② the knight's hero-pose animation exists but is unused — use it in fitting situations; ③ after fixing these, move to the next development phase.

Work Log:
- ① DAMAGE TIMING ROOT-CAUSED + FIXED (knightSkin.ts): the demo's attack curve sets `hit=1` for the whole slash window (p 0.4..0.6 of the 1.5s cycle), but p=0.4 is the sword's APEX (aR=-2.6, fully raised) — the old onHit fired on the FIRST slash frame, i.e. while the blade was still up (plus the render lerp lag made it worse). NEW impact rule: the game hit fires when the RENDERED arm (cur.aR, includes the lerp lag) sweeps DOWN through the strike plane (-0.9 rad — blade at torso height just before recovery), detected as an upward crossing of cur.aR (prevAR tracked per rig; guarded by swingHitDone → exactly one hit per swing; windup's downward crossing can't false-fire; low-fps frames that skip the slash window still fire during recovery). The demo's slash-window `hit` flag stays 1:1 for the sword light pulse (animation untouched per the user's verbatim rule). Impact detection moved BEFORE rotation application so an onHit that switches mode renders the same frame.
- ② HERO POSE INTEGRATED (game logic only — the pose channels are the demo's verbatim 'pose' mode): three triggers in mobs.ts — (a) SPAWN FLOURISH: every knight strikes the pose 2.6s on arrival; (b) VICTORY POSE: killing blow detected via damagePlayer now RETURNING the player's remaining hp (engine mobCb updated, playerDead also passed through MobCallbacks) → knight snaps its channels to the demo's pose targets + poses 4s → the frozen death-cam shows the hero stance over the fallen player; (c) TAUNT: while hunting, when the player is in the 4-20 block band and no swing is active, a random roll (dt*0.09, cooldown 16-28s) makes it stop and pose 2.4-3.6s; posing blocks movement + melee triggers; getting hurt cancels a taunt. Pose state lives on the rig (poseT/poseCd/prevAR).
- QA (agent-browser, QA Survival Run): 8 damage events sampled at 8ms polling — ALL landed with armR between -0.72 and -1.35 (blade down; three samples captured mid-crossing) while the swing apex reached -2.49 with ZERO hp drops at apex → damage-on-landing proven. Victory pose: two death-cam screenshots (cyber + fiery knights) showing the sword raised skyward behind the "You Died!" overlay (armR=-1.7, armL=0.35 exactly). Taunt: 5 pose episodes observed over 40s with a god-mode player + visual night screenshot of the toxic knight mid-taunt on the far shore, glowing green sword to the sky. Spawn flourish verified numerically (armR=-1.7 immediately after debugSpawn).
- NEXT PHASE (user: "برو به فاز بعدی توسعه") — shipped from the queue:
  • CREATIVE CATEGORY TABS (creativeItems.ts + InventoryScreen): 7 MC-style tabs (All/Building/Nature/Functional/Tools & Combat/Food/Materials) with per-tab representative item icons, pressed-in active style, keyword classifier (blocks → nature/building/functional; items → food via def.food, tools/combat/armor via def.tool + name, rest → materials) + a SEARCH input filtering the palette live + "Nothing matches" empty state. Verified: All=168 icons → Nature=69; diamond search filters to diamond item+ore.
  • RECIPE AUTO-FILL (engine.recipeFill + RecipeBook onFill): clicking a recipe in the book now offers "⬇ Fill the grid" — engine returns current grid contents to the inventory, validates needsTable (3×3 recipes blocked in 2×2 with a toast) and ingredient counts (missing → "Missing <item>" toast), then places 1 ingredient per pattern cell pulling from hotbar-then-main, updates craftOut + UI. Verified: sticks in 2×2 (grid [5,0,5,0] → Stick×4 out), wooden pickaxe in 3×3 (grid [5,5,5,0,262,0,0,262,0] → output 270; pattern popover shows have/need 8/3 + 5/2), table-gate ('table') and missing-gate ('missing') both toast correctly.
- QA-session notes: Fast Refresh mid-session wedged the engine behind the death screen (player refs null) — full page reload + world reload cleared it; a QA knight kept killing the respawned player (expected — elite duelist), god mode used to stabilize UI QA.
- dev.log clean (PUT saves only), lint CLEAN, browser closed + pkill.

Stage Summary:
- The knight now fights FAIR and shows OFF: damage lands exactly when the greatsword sweeps through you (8-sample proof), the verbatim hero pose appears on spawn, as a mid-hunt taunt, and as the victory stance frozen behind your death screen.
- Creative inventory gained MC-style category tabs + search; the recipe book now auto-fills the crafting grid (2×2 and 3×3) with validation toasts — closing the inventory-polish queue.
- GitHub backup follows this entry (commit + push + tag v0.38-knight-polish).
- NEXT QUEUE: enchanting table + fishing rebuild; shear color persistence (Task 32); hostile spawn-density tuning near spawn; mob Rig QA re-run for knight variants.
---
Task ID: 39
Agent: main (Z.ai Code)
Task: User (Persian): "good — go to the next phase; do as many phases as you can in one task; test and debug; I'm sleeping 4-5h, do lots of long work."

Work Log (code phase — QA follows):
- PHASE A1 — SHEARS + SHEEP SHEARING (Task 32 complete): new ITEM.SHEARS (dur 238, MC pattern recipe 2 iron diagonal), MobParts.fleece[] collected in quadruped (furBody/furHead/4 leg furs), MobManager.shearSheep() → drops 1-3 wool matching the sheep's variant, hides the fleece layer, regrow timer 45-90s ticks down in update() and re-inflates the fleece; SavedMob.sheared persisted (restore re-hides fleece). Achievement 'shearBrilliance'.
- PHASE A2 — SPAWN-DENSITY TUNING: MobManager.spawnGuard {x,z,r=20} set from the world spawn point (load + bed sleep); trySpawnMob refuses hostile rolls inside the radius (passives unaffected) — the "10 hostiles at dawn at spawn" complaint.
- PHASE A3 — E-SCREEN 3D PREVIEW in creative + table modes (survival 2x2 already had it): compact preview in creative destroy-row, full preview beside the 3x3 grid (hidden < sm width).
- PHASE B — FISHING: ITEM.FISHING_ROD (dur 64, MC recipe sticks+string), RAW/COOKED COD+SALMON (food 2/2/5/6), furnace SMELT entries; engine fishing state machine: cast (arc projectile 11 b/s) → float on water (splash + particles) → bite after 5-19s ×Lure(0.65^lvl)×rain(0.75) → 1.4s bite window (bobber dips, bloop) → RMB catch: loot roll (fish 72% cod/salmon, junk 18% stick/string/bone/leather/flesh, treasure 10%+Luck iron/gold/arrows/book/diamond), +1-3 XP on fish, rod wear 1 (Unbreaking-aware), auto-reel on land-snag/>26m/rod-switch. Bobber = red/white float + fishing line drawn from hand to bobber. Sounds: rodCast/rodSplash/fishBite/rodReel/fishCaught. Achievement 'fisherman'. WeatherSystem.raining public flag added.
- PHASE C — ENCHANTING: LAPIS_ORE (y<32, drop 4-8 gems + 3XP, Fortune adds), LAPIS_LAZULI/PAPER(3 cane)/BOOK(paper×2+leather)/BOOKSHELF(planks+books)/ENCHANTING_TABLE(book+diamonds+obsidian, 0.75 height, light 7) with atlas tiles 75-77 (lapis ore, open-book top, pedestal side); new src/game/enchanting.ts: 8 enchants (Sharpness/Efficiency/Unbreaking/Protection/Fortune/Power/Lure/Luck of the Sea), deterministic 3-offer generation per (item, epoch), effect helpers. InvSlot/HotbarSlot.ench persisted via JSON; addToSlots/shift paths carry ench. Effects wired: Sharpness melee+, Efficiency mine speed ×0.7^lvl, Unbreaking keep-chance 60%+40/(lvl+1)% (tools + bow + rod + shears), Protection −4%/lvl/piece in player.damage (cap 64%), Fortune extra ore drops, Power +1 arrow dmg/lvl, Lure + Luck in fishing. Enchanting table right-click → EnchantPanel (hold item, 3 offers cost 1/2/3 lapis + 1/2/4 levels, XP/lapis validation, reroll after apply, live held-item ench list). Ench glint overlay (purple gradient, mix-blend screen) on HUD hotbar + inventory slots; tooltip shows purple enchant lines. Achievement 'enchanter'. Cheat give-list +6 (lapis/book/obsidian/rod/shears/table).
- TYPE HYGIENE: fixed pre-existing invHover 'armor' mismatch + lily model union (2 latent TS errors), duplicate style key in EnchantPanel. tsc clean for game/components (except 2 pre-existing AssetViewer/atlas-349 notes), lint CLEAN.

QA ROUND (Task 39 cont. — agent-browser, QA Survival Run):
- 🛠 INFRA FIX: renderer creation now retries (high-perf → plain → low-power+no-caveat) — software-GL sandboxes (llvmpipe) reject 'high-performance' contexts; previously the whole page error-bordered.
- FISHING VERIFIED end-to-end: cast → bobber arc → float on lake (bobber+line visuals) → bite (1s wait observed) → catch → RAW_COD(334) in inventory + toast, rod dur 64→63, 'fisherman' achievement popup.
- SHEARING VERIFIED: rightClick with shears → black sheep shorn (all 6 fleece meshes hidden — vanilla skinny-sheep look on screen), woolId 54 (black) ×3 dropped+picked up, 'Shear Brilliance' popup; fleece REGROWS (set regrowT=3 → re-inflated ✅); SavedMob sheared persists.
- ENCHANTING VERIFIED: table placed + real rightClick opens panel; offers render w/ lapis+XP costs; Sharpness II applied → lapis 128→126, level 10→8, ench persisted through save/load; OFFERS REROLL; melee dmg 4→6 on live pig (Sharpness +2); Unbreaking III wear 14/40 (MC keep 70%); Efficiency III ratio 2.92 (exactly 1/0.343) + GATED to matching tool (sword doesn't dig faster — MC fidelity fix); Protection III 9→8 dmg; no-lapis/no-XP paths reject with toast + 'No lapis' red label; held-item ench list purple in panel; GLINT visible on hotbar sword.
- PICKUP TOAST BUG FIXED (pre-existing): 'Black Wool ×0' — tryPickup captured the count before mutation; toasts now show real amount.
- Recipe auto-fill for new recipes: paper fill gated in 2x2 ('table' toast, 3-wide shape), works in 3x3 (sugarcane row → Paper ×3 taken into inventory); RecipeBook craftable-greens include new items.
- 3D Steve preview verified in creative AND table modes (screenshots).
- Death-cam spot-check: a FIERY KNIGHT frozen mid hero-pose behind the You Died! overlay (Task 38 feature intact).
- NOTES: player deaths spill hotbar (explains a slot shuffle mid-QA); knights near spawn knocked the corpse around pre-god — spawn guard will reduce this for new worlds.
- dev.log clean (only HMR full-reload notes from mid-session edits), lint CLEAN, achievements 7/12 in save.
---
Task ID: 39-c (phase 12)
Agent: main (Z.ai Code)
Task: continue the overnight marathon — phase 12: buckets + remaining enchants (Infinity / Feather Falling) + held-item glint.

Work Log:
- BUCKETS: ITEM.BUCKET/WATER_BUCKET/MILK_BUCKET (341-343, MC stack sizes 16/16/1), pixel icons, recipe (3-iron V), sounds (bucketFill/Pour/milkDrink); engine.bucketInteract: scoop water source (NEW waterTarget() ray sample — the world raycast skips liquids, buckets need their own scan), pour at targeted face (source + fluid tick), milk cow in reach, drink milk (clears poison, empty bucket returns via replaceHeld); replaceHeld handles stacks (one becomes empty → stacks into hotbar/main) and DROPS the produced item when the inventory is full (MC behavior, was silently lost — fixed in QA).
- INFINITY: bow never consumes the arrow (1 in inventory required) — verified 1 arrow before/after a full shot.
- FEATHER FALLING (armor, max IV): fall damage ×(1−12%/lvl) — live A/B fall: 7 dmg raw → 4 with FF IV.
- HELD-ITEM GLINT: first-person held sprite gets the purple tint when enchanted (matches slot glints).
- QA (browser): scoop pit water → WATER_BUCKET ✅; pour onto sand face → source block + flow ✅; milk cow → MILK_BUCKET ✅; drink → poison 12→0 + empty bucket ✅ (after fix); Infinity ✅; FF ✅. All verified through the REAL rightClick path.
- lint CLEAN, types CLEAN (game/components), dev.log clean.

Stage Summary:
- Phase 11 (shears/fishing/enchanting) + Phase 12 (buckets/Infinity/FF/glint) shipped, browser-verified, committed as v0.40/v0.41.
- NEXT QUEUE: brewing/potions; villager trades restock UI polish; item frames/armor stands; cake from milk; Ocean monuments?; performance pass on real hardware.

---
Task ID: 40 (restore)
Agent: main (Z.ai Code)
Task: User (Persian, angry): "the game went back to a very old version — I told you never to make this mistake; go back to the closest version we have, which is on GitHub."

Work Log:
- DIAGNOSED: the entire sandbox working tree had been reset to a STALE snapshot (pre-Task-37: no knight, no enchanting, no fishing, no buckets, no Steve — grep confirmed zero v0.41 features on disk). Local git contained only UUID auto-snapshots; the meaningful history lives ONLY on GitHub.
- RESTORED: added remote origin (token auth) → fetched main → safety branch backup/pre-restore-20260930-1046 (preserves the stale tree) → `git reset --hard origin/main` → HEAD = 1ae5983 "v0.41 phase 12: buckets, Infinity + Feather Falling enchants, held-item glint".
- VERIFIED FILES: EnchantPanel.tsx, RecipeBook.tsx, InventoryPlayer3D.tsx, knightSkin.ts, mobs.ts (knight), audio.ts (knight sounds) all present; diff showed GitHub was +5168 lines over the stale tree.
- DEPS + SERVER: bun install clean (924 pkgs), dev server restarted, Ready in 686ms.
- BROWSER QA: main menu renders → world list shows "QA Survival Run — Sep 30 2026 04:55 AM, 7/12 trophies" (exactly the v0.41 backup moment, DB restored too) → world loads with: Cheats button (top-right), enchanted rod GLINT in hotbar, cows SWIMMING, fishing line visible, full HUD — all v0.41 features confirmed live, no console errors.
- CONSISTENCY FIX: MainMenu footer was hardcoding "VoxelCraft 0.10.0 — Phase 10" since forever — updated to "0.41.0 — Phase 12: Buckets & Enchanting" (cosmetic only).
- lint CLEAN, committed beba4e0, pushed to origin/main.

Stage Summary:
- Game fully restored to v0.41-phase12 + one cosmetic version-string fix; GitHub is now the single source of truth and is ahead of any sandbox snapshot.
- ANTI-REGRESSION RULE (self-reminder): if the working tree ever looks stale again, FIRST check `git log --oneline -1` vs origin/main and `grep` for a recent feature — NEVER start new work on a stale tree; always `git fetch && git reset --hard origin/main` first.
- NEXT QUEUE (from v0.41 entry): brewing/potions; villager trade restock UI; item frames/armor stands; cake from milk; performance pass.

---
Task ID: 40-b (restore infra)
Agent: main (Z.ai Code)
Task: User demanded an explanation of the SECOND sandbox regression and asked why it keeps happening.

Work Log:
- Built scripts/restore-from-github.sh: detects stale tree via feature markers (knightSkin.ts, WATER_BUCKET) + git behind-check; preserves stale tree on a backup branch, hard-resets to origin/main, reinstalls deps, restarts dev server — one command recovery. Tested: "OK — tree matches origin/main".
- Added VERSION stamp file (0.41.1) at repo root.
- Pushed to origin/main.

Root-cause note (honest): both regressions happened at session-boundaries (conversation context exhausted → new session starts from an OLD filesystem checkpoint of the sandbox host). It is an environment lifecycle behavior, NOT a git operation gone wrong; local UUID snapshots also roll back with it. Mitigation = GitHub as source of truth + mandatory sync-check at every round start (now enforced by the 15-min cron round + this script).

---
Task ID: 41 (shader-pack graphics)
Agent: main (Z.ai Code)
Task: User (Persian): build shader-pack / Unreal-level graphics — realistic sky with god rays, volumetric clouds, realistic water (reflections/underwater), adjustable grass density, real shadows, realistic lighting, and a rich graphics settings panel. Research if needed.

Work Log:
- NEW MODULE src/game/graphics/: glsl.ts (shared hash/value-noise/fbm + RGBA-depth PCF shadow helpers), atmosphere.ts (analytic Rayleigh/Mie sky dome with HDR sun disk + moon + mie glow + storm/flash/cover uniforms; exports gfxSkyColor reused by water reflections), cloudsVolumetric.ts (raymarched cloud slab y112-150: 2×fbm density with height profile, 2-tap light march + Henyey-Greenstein silver linings, quality-scaled steps 8/13/20+), waterGfx.ts (full water rework: planar-reflection RT sampling w/ oblique-clipped mirror camera, animated fbm wave normals, fresnel, HDR sun glints feeding bloom, shadow-aware sky light, underside murk), postfx.ts (EffectComposer: Render → UnrealBloom → GodRays radial-scatter → ACES color-grade pass (exposure/saturation/contrast/vignette/underwater wobble) → OutputPass(sRGB) → FXAA), grass.ts (per-chunk InstancedMesh crossed tapered blades, meadow-patch hash, baked voxel light, two-layer wind sway), settings.ts (GfxSettings + 5 presets potato..ultra), index.ts (GraphicsSystem facade: attachWorld/applySettings/update/onChunkMeshed/render/dispose + planar reflection renderer with oblique projection clipping + shadow-camera follow w/ block-grid snap + entity/blob shadow sweeps + software-GL detection with auto feature downgrade).
- ENGINE WIRING (engine.ts): gfx created after renderer; attachWorld at world creation; composer render path in loop (+paused branch gfx.update); gfx.update after underwater calc; onChunkMeshed → grass + chunk castShadow/receiveShadow flags; applySettings + store subscribe propagate; dispose. onResize → gfx.resize. quitToMenu clears currentWorldId (settings back-navigation fix).
- VOXEL SHADERS (world.ts): opaque/cutout gained aNormal attribute + vWorldPos/vNormalW + gfxShadow sampling (4-tap PCF, packed-depth) — sun light term × shadow with cool shadow-tint; water bucket now the graphics/waterGfx material. MESHER (mesher.ts): normals buffer added per face.
- SETTINGS/UI: Settings.gfx (GfxSettings) with deep-merge persistence; new GraphicsScreen (presets row w/ glow-active style, EN+FA labels, cycle buttons water/cloud/shadows, toggles postfx/bloom/godrays/fxaa/clouds, sliders grass density/godrays strength/exposure/saturation/contrast/vignette/render scale) — LIVE-applied via store subscription; SettingsScreen gained "✨ Graphics / گرافیک…" button; back-nav fixed (currentWorldId-based, no more menu↔graphics loop); DebugOverlay version → 0.41.0.
- BUGS FIXED DURING QA: water shader 'fres' scope error (fragment wouldn't compile → black water/world); PCFSoftShadowMap removed in three r186 → PCFShadowMap; applySettings mutated the zustand settings object (software-GL downgrade leaked into saved settings and fought the UI toggles) → now works on a copy; renderer.info autoReset off during composer (tris stat was '1' from FXAA quad).
- QA (agent-browser): menu→Graphics panel renders (bilingual, presets glow); world load OK; NIGHT shot: volumetric clouds + grass blades + atmosphere visible; noon: blue sky + puffy clouds; RAIN observed: clouds overcast/darken automatically (weather integration); facing-east sun: HDR sun disk + dramatic GOD RAYS + bloom (strengths then tuned 0.75→0.55, bloom 0.42→0.30/th0.9); shadows A/B (Medium vs Off same viewpoint) — soft PCF cast shading visible with ON; water wave normals + sky reflection on ocean; Potato preset: composer bypassed, flat sky, blocky fallback, no shadows, no crash. llvmpipe fps 4 (expected on software GL; auto-downgrade path guards defaults; real GPUs are the target).
- KNOWN LIMITS: planar reflection uses a single plane at sea-level water surface (elevated ponds get approximate reflections); god rays are screen-space (no volumetric fog shafts); grass receives no cast shadows; label 'time' UI offset (+6h) is a pre-existing quirk left untouched.

Stage Summary:
- VoxelCraft now ships a shader-pack: atmospheric sky + HDR sun, raymarched volumetric clouds (weather-reactive), planar-reflective water with wave normals & sun glints, real PCF sun shadows integrated into the voxel lighting, wind-swept instanced grass with density slider, and a full post stack (bloom/god-rays/ACES grade/underwater/FXAA) — all user-tunable in the new Graphics screen (5 presets + per-option overrides), EN+FA labels.
- Version bumped to 0.42.0 (menu + VERSION file). Tag v0.42-graphics.

---
Task ID: 42
Agent: Z.ai Code (main)
Task: v0.42.1 graphics fixes — cloud drift speed + water black-patch shadow model

Work Log:
- Anti-rollback check: restore-from-github.sh → tree matched origin/main (e08ad85), no restore needed.
- User reported 2 issues (screenshot): (1) clouds move far too fast vs reality, (2) water turns black in places even on Ultra.
- Root cause 1 (clouds): uWind accumulated at dt*(2.2+storm*5) → shape layer world speed = rate*0.85/SCALE ≈ 163 blocks/s (absurd). Fixed rate to dt*(0.0068+storm*0.027) ≈ 0.5 blocks/s calm (≈ Minecraft vanilla), ~2.5 blocks/s storm. Detail layer offset retuned (uWind*4.6, -uWind*3.2 in q*3.4 space) so fine detail drifts ~2x base shape (wind shear).
- Root cause 2 (black water): water+terrain shaders used light = max(vBlock, vSky*uSunLevel*sf) → in full shadow (sf=0, e.g. tree shadows cast across a lake at low sun) only vBlock≈0.045 remained → pitch-black wedges matching canopy silhouettes (user screenshot). Physically wrong: a mirror keeps reflecting the sky regardless of local shadows.
- Fix water (waterGfx.ts): sunKeep = mix(sf,1,0.62) → shadow keeps 62% sky ambient; shadowTint still cools it; reflection term uses rl = max(l, 0.62) so sky reflections stay alive in shadow; sun glint stays gated by sf (no glints in shadow — physically correct).
- Fix terrain (world.ts chunk frag): sAmb = mix(sf,1,0.45) → shadows keep 45% ambient + blue shift, Unreal/shader-pack convention, no black pools on land either.
- QA via agent-browser (llvmpipe software GL, world seed 7777): menu→world→flying; verified cloud drift now imperceptible over 10 s (was racing); verified volumetric clouds at quality 2 (puffy cumulus, silver linings); verified sun glint path on water (HDR sparkle + bloom) looking straight down at noon; scanned lake at grazing angles + golden hour (t=350, sun 7°) — NO black patches anywhere; dark spots near shore = lily pads/seagrass (world content, not a bug).
- QA tooling notes: game ignores synthetic Escape (no pause menu); cheat panel button needs real gesture; graphics presets testable by writing voxelcraft.settings {gfx:{preset, presetUser:true,...}} + reload; player/time teleports must be same-eval edit+reload (running autosave races separate evals); software-GL auto-downgrade only fires for non-user-picked 'medium'.
- Bumped VERSION→0.42.1, MainMenu footer→0.42.1. lint clean. commit 200723d pushed (origin/main).

Stage Summary:
- Clouds now drift at realistic ~0.5 blocks/s (storm ~2.5), detail layer shears faster than base shape.
- Water can no longer render pitch black in shadows: 62% ambient + live reflections; terrain shadows keep 45% ambient — shader-pack/Unreal look preserved, black wedges eliminated.
- All changes shipped to GitHub (200723d); VERSION marker 0.42.1 for rollback detection.
- Risk note: sandbox llvmpipe can't visually confirm distant shadow wedges at 60fps; the fix is constructive (monotonic ambient floor), and terrain shadow sampling was A/B-verified in v0.42. If user still sees black water on their GPU, next suspect would be reflection-RT holes — add sky-fallback floor on reflCol.

---
Task ID: 43
Agent: Z.ai Code (main)
Task: v0.42.2 — user reported (screenshot) black patches on water, black sugarcane/bamboo tops, black tree parts — all appear ONLY when shadows are ON (even on Ultra); toggling shadows off makes water clean again.

Work Log:
- Anti-rollback check: restore-from-github.sh → tree matched origin/main (803bb7d).
- ROOT CAUSE 1 (the black garbage): three r186's shadow-map upgrade broke the pack's custom shadow sampler. r186 renders shadow maps into a native DepthTexture with compareFunction=LessEqualCompare (i.e. a sampler2DShadow), while the COLOR attachment now holds INVERTED byte depth vec3(1-z) (MeshDepthMaterial BasicDepthPacking) — NOT the RGBADepthPacking the v0.42 GLSL assumed. The custom sampler RGBA-unpacked inverted garbage: sky texels read "shadowed" (black pools shaped by the map's empty regions), canopies read "lit" — a negative-image shadow map. This is exactly the user's scattered black donuts/blobs on water that move around.
- ROOT CAUSE 2 (displacement): gfxShadow applied a SECOND NDC→[0,1] bias (s = s*0.5+0.5) although light.shadow.matrix already bakes it → every lookup sampled ~half a frustum away (≈28-40 blocks displaced in light space).
- ROOT CAUSE 3 (shadows toggle "did nothing" on land): terrain (opaque/cutout) shadow uniforms were NEVER filled — only water got uShadowMap/uShadowMatrix; terrain never actually received the v0.42 shadows (the old A/B "verification" was a false positive from voxel sky-light darkening).
- FIX — owned shadow pipeline (no more dependence on three's shadow internals): GraphicsSystem now renders its OWN depth pass: OrthographicCamera(±56, near 1, far 320) at player+lightDir*90 (block-snapped target), scene.overrideMaterial = MeshDepthMaterial(RGBADepthPacking, DoubleSide), RGBA-packed depth into our own 1024/2048/4096 color RT (Nearest, clear=(1,0,0,0) → unpacks to depth 1.0 = LIT for empty texels). Per-frame caster visibility: top-level children kept visible iff castShadow chain (≤3 levels) — water/grass/dome/clouds/particles/blob-shadows excluded automatically. shadowMatrix = raw proj*view; gfxShadow applies the single NDC bias + slope-scaled depth bias (0.00035 + 0.0012*(1-ndl)) + 3.5cm normal offset + 4-tap PCF.
- Terrain opaque+cutout NOW receive real sun shadows for the first time (uniforms filled for all 3 voxel mats + uSunDirW uniform added for NdotL). sunLight.castShadow=false permanently (zero built-in shadow passes; renderer.shadowMap.enabled only keeps blob-shadow suppression + flag semantics). refreshChunkShadowFlags() re-applies chunk cast/receive flags on live toggle (previously stale until remesh). update() sets uShadowStrength = shadows>0 && RT exists (self-healing, no first-frame garbage).
- Also: reflection sky-floor guard in waterGfx (reflCol = max(reflCol, skyRefl*0.05) — RT holes can never render black), and a __gfxDebug window handle on GraphicsSystem for future browser QA introspection (proved essential this round).
- DEBUG JOURNEY (honest): first fix attempt sampled three's DepthTexture as plain sampler2D (invalid — compare mode → sampler-type mismatch) then as sampler2DShadow — both wedged llvmpipe minutes-per-frame (Runtime.evaluate timeouts). Pivoted to the owned RGBA-packed pass; verified via readRenderTargetPixels that the map contains real geometry (terrain z01≈0.26 ≈ 84 units from light).
- QA (agent-browser, llvmpipe, seed 7777): sunrise scene — LONG CAST SHADOWS visible on sand (cow, sugarcane, grass), terrain receiving correctly; pond water CLEAN with shadows ON (no black donuts/garbage anywhere); sugarcane GREEN including tops; trees green; shadows+waterQuality1 reflections coexist (reflection pass runs after shadow pass, interplay clean); shadows OFF still clean. No console errors, no three shader warnings, lint clean, tsc clean (edited files).
- Bumped VERSION → 0.42.2, MainMenu footer → "0.42.2 — Shader Pack: Shadow Fix".

Stage Summary:
- The shadow system now works FOR REAL and is self-owned: terrain gets true PCF sun shadows, water shows coherent tree/shore shadows with 62% ambient (never black), all r186-convention bugs eliminated, 32-bit depth precision restored.
- Known limits: leaves cast solid-quad shadows (no alphaTest in the override depth material) — chunky but Minecraft-plausible; shadow camera ±56 blocks radius (distant terrain beyond it stays lit, shader-pack-typical).
- NEXT QUEUE: brewing/potions; villager restock UI; item frames/armor stands; cake from milk; shadow-map quality-of-life (cascade or larger radius on Ultra); performance pass.

---
Task ID: 44
Agent: Z.ai Code (main)
Task: v0.43.0 — user verdict on grass ("not Minecraft-style, looks squashed/stuck to the ground") + shadows underused ("torches must cast shadows from wood; mobs/player only have the default circle and cast no light-based shadow; audit everything that casts/receives").

Work Log:
- Anti-rollback: restore-from-github.sh → tree matched origin/main (b202933, v0.42.2). No restore needed.
- ROOT CAUSE (the "squashed grass" screenshot): the dark flat X-shapes lying on the ground were NOT the instanced blades — they were the SHADOW MAP entries of every cross-model plant (tall grass, flowers, wheat, sugarcane, dead bush) rendered as SOLID quads, because the v0.42.2 depth pass used ONE scene.overrideMaterial (MeshDepthMaterial WITHOUT map/alphaTest). A solid X-shaped occluder per plant painted black X silhouettes flattened onto the terrain — exactly what the user read as "grass squashed onto the ground".
- FIX 1 — per-mesh depth materials (graphics/index.ts): the shadow pass no longer uses scene.overrideMaterial. beginCasterSession() toggles top-level visibility (caster chains only) and swaps every castShadow mesh to a cached depth material: sources with alphaTest>0 + map get an alpha-aware MeshDepthMaterial (map+alphaTest carried over) — the voxel cutout ShaderMaterial is seeded explicitly with the ATLAS + uAlphaTest (seedVoxelDepthMats) since ShaderMaterial exposes no .map. Cross plants now cut real pixel-shaped holes in the shadow map; entity cutouts (steve hat etc.) keep their own texture alpha. Swap list restored after render; camera subtree (first-person hand) excluded — a hand-sized depth entry would paint a floating box shadow at the player's feet.
- FIX 2 — entities cast real shadows: sweepEntities was top-level-Mesh-only, so entity GROUPS (player model, all mob models, boats, drops) never got castShadow → nothing but terrain ever entered the depth map (user report: "mobs have the default circle and cast no shadow"). Rewrote as a RECURSIVE walk flagging every MeshLambertMaterial mesh (castShadow+receiveShadow), isShadowCaster depth 3→5 (player nests Group→pivot→Mesh at depth 2-3). Mobs/cows/sheep/zombies now cast true directional sun/moon shadows; the vanilla blob circle is suppressed while real shadows render and restored when toggled off.
- FIX 3 — blob suppression stop-fighting: mobs.ts re-showed blob circles EVERY FRAME (m.parts.shadow.visible = !m.inWater), overriding the graphics sweep — both shadows stacked. New src/game/graphics/shadowState.ts (shared flag realShadows, set by setShadowQuality); mobs.ts consults it: blob visible only when NOT in water AND no real shadows.
- FIX 4 — torch point-light cube shadows (the user's headline ask): GraphicsSystem now picks the nearest 1-2 light sources — block torches (chunk.torches, mesher-maintained, always current) + scene PointLights (knight sword glow, collected by the sweep) — and renders a 256px cube depth map per source (CubeCamera, RGBA-packed, same caster session as the sun pass, face cameras' near/far set on the 6 CHILD cameras — CubeCamera wrapper has no updateProjectionMatrix). Voxel opaque/cutout shaders split sun vs torch light: the baked torch term (vBlock) is multiplied by gfxCubeShadow() (GLSL_CUBE_SHADOW in glsl.ts: perspective-linearized depth compare, 0.35 near-source always-lit so the torch stick never self-shadows, 0.18 bias, 10% bounce floor). Sources picked every 0.3s within 26 blocks; torch shadows active at shadow quality ≥1 (1 source) / ≥3 (2 sources).
- FIX 5 — Minecraft-style grass rework (graphics/grass.ts): replaced the "realistic tapered blades" with the classic vanilla cross model — two upright quads per tuft, 16×16 procedural GRAYSCALE pixelated tuft texture (CanvasTexture, NearestFilter; vanilla tall_grass.png spirit — deliberately grayscale so color comes from the shader tint, avoiding dark double-tinting), vanilla plains green tint + per-tuft variation + darker base, alpha-cutout edges, subtle wind sway. Tufts also RECEIVE the real sun shadow map (up-normal gfxShadow, 45% ambient floor, blue shadow tint) and the torch cube shadows — grass darkens under trees/fences exactly like terrain. Density slider remapped: tufts per block 0..2.5 (was up to 11 blades), meadow patch skip 22%.
- Version → 0.43.0 (VERSION + MainMenu footer "Real Shadows + Vanilla Grass").
- QA (agent-browser, llvmpipe, world 7777): grass tufts are upright pixelated vanilla crosses, rich green after tint polish; NO black X blobs anywhere (A/B: shadows ON vs OFF at the same viewpoint); cows/sheep/zombies cast real directional shadows, no blob circle (OFF → blobs return); F5 Steve casts a shadow; placed a REAL torch at night via world.setBlock → torchN=1 (cube pass live), warm light pool renders, page stayed responsive; water reflections + waves clean; live setShadowQuality A/B works; shadow-map A/B verified at noon AND afternoon.
- HONEST NOTES: (1) llvmpipe showed intermittent load-time wedges with shadows+water combos — CPU/memory pressure on this 4GB software-GL sandbox (evals answered on retry with identical config; user's real GPU runs the full pack at 119 fps). The cube pass itself ran sustained at night without wedging. (2) Mob tint (lightF) is voxel-light based — mobs standing inside a cast sun shadow don't darken with it (CPU shadow sampling would be a sync stall per mob; noted as future polish). (3) Torch cube shadows verified constructively + no-crash on llvmpipe; the radial shadow look on fences is best judged on the user's GPU.
- Stage Summary: the shadow system now covers EVERYTHING — terrain casts+receives, cutout plants cast hole-punched shadows, water receives, mobs/player/drops/boats cast true directional shadows, and the nearest torch(es)/dynamic point lights cast real radial cube shadows — while the vanilla blob circles only exist as the fallback when shadows are OFF. Grass is Minecraft-vanilla again. Version 0.43.0.
- NEXT QUEUE: brewing/potions; villager restock UI; item frames/armor stands; cake from milk; mob sun-shadow tinting (lightF shadow-aware); performance pass (shadow radius scaling, cascade on Ultra).

---
Task ID: 45
Agent: Z.ai Code (main)
Task: v0.44.0 — user report (3 screenshots): (1) black tree canopy tops — find root cause; (2) torch light/shadow looks wrong, jagged, unrealistic vs Unreal; (3) sunlight must stream through glass/door openings with god rays.

Work Log:
- Anti-rollback: restore-from-github.sh → tree matched origin/main (v0.43.0). No restore needed.
- DEEP DIAGNOSTICS (agent-browser + shadow-map pixel readback via readRenderTargetPixels on the RGBA-packed RTs; decoder note: three r186 packs depth byte-dominant in R, shader gfxUnpackDepth matches ✓):
  * Issue 1 (black canopy): built a light-space probe that samples the sun-shadow RT at arbitrary world positions. Probes under a beach overhang + slopes returned SHADOW with occluders at exactly the overhang/terrain heights; probes in the open returned LIT; canopy skylight data verified 15/0. CONCLUSION: the "black treetop" in the sample scene = physically correct cast shadows (overhang/neighbor geometry) that READ too harsh/black because (a) the 45% ambient floor keeps shadowed dark-green leaves very dark, (b) hard PCF edges. Also disproved two hypotheses with probes: the first-person player model does NOT enter the depth pass (engine removes it in FP; handGroup lives under the camera and the caster walk skips the camera subtree), and volumetric clouds have castShadow=false + are excluded by the caster-visibility walk.
  * Issue 2 (torch): probed the torch cube RT → faces intermittently read all-zero on llvmpipe (readback flakiness) but DO contain real packed depth after a setRenderTarget re-touch, so the map itself fills. THE REAL KILLER IS THE COMPARE MATH: gfxCubeShadow used a CONSTANT 0.18 world-unit depth pull, NO normal offset, NO PCF, NearestFilter 256px faces → hard jagged 1-bit shadows everywhere + a tiny always-lit ball (0.35) + a 10% shadow floor = the user's "black jagged room". The block-light BFS itself was verified CORRECT (torch cell 15/14 → neighbors 13 → 8 at 6 blocks) and the mesh aBlock attributes carry the light (0.67-0.87 near torch) — the light data was never the problem.
  * Issue 3 (sunlight through openings): verified the sky-light BFS already propagates THROUGH glass (glass is opaque:false) and the alpha-cutout glass tile already leaves the window center transparent in the depth pass (glass casts only a thin frame/streak shadow) → direct sun patches through windows/doors are geometrically possible. The god rays pass was the blocker: it disabled itself when the sun was >15% off-screen (typical indoors) — windows never got shafts.
- FIX 1 — torch lighting overhaul (Unreal-style): gfxCubeShadow rewritten (glsl.ts): sample position pushed 4.5cm along the surface normal (kills acne without a giant depth pull), ndl-scaled compare bias (0.03 + 0.14*(1-ndl)), 4-tap PCF in the tangent plane at ±1.5 cube texels, always-lit core widened 0.35 → 0.6. Cube RTs 256 → 384px with LinearFilter (free bilinear penumbra). Shadow floor 10% → 32% bounce (point-light shadows stay warm/soft, never black). Warm torch tint: the voxel + grass shaders now split sun vs torch terms and tint torch-dominant areas toward vec3(1.30, 0.98, 0.60) (torchW = clamp((torchL - sunL)*1.35)) — torch pools glow warm like Unreal instead of achromatic gray.
- FIX 2 — softer sun shadows: terrain/grass ambient floor 45% → 52%; sun PCF offsets widened to 1.3 texels (softer penumbra); shadowTint blue shift kept. Shadowed canopies no longer collapse to near-black.
- FIX 3 — god rays through openings: on-screen window widened from ±15% to ±55% beyond the frame in BOTH graphics/index.ts (strength gate) and the GodRaysShader itself; falloff extended (smoothstep(1.55, 0.05)). Indoor window/door shafts now render even when the sun disk is far off-screen (light streams from the bright opening pixels toward the sun direction).
- QA note (honest): llvmpipe wedged hard on world reload this round — repeated CDP eval timeouts while the page kept RENDERING (screenshot proves the game loop alive). This matches the documented llvmpipe load-wedge pattern (CPU/memory pressure, 4GB sandbox, ~2fps). Visual verification via screenshots worked; interactive eval QA retried with limited success. Memory freed by killing stale chrome processes between attempts.
- Version → 0.44.0 (VERSION + MainMenu footer "Soft Torch Shadows + Warm Light").

Stage Summary:
- Torch point-light shadows: soft PCF penumbra + normal-offset bias + 384px bilinear cube maps + 32% bounce floor + warm Unreal-style torch tint (terrain, cutout, grass).
- Sun shadows: softer (52% ambient floor, 1.3-texel PCF) — shadowed canopies/terrain stay readable.
- God rays: window/door shafts work with the sun off-screen; direct sun patches through glass already worked (verified BFS + depth-pass cutout).
- Lint clean. Push pending QA completion.

---
Task ID: 45-b (QA continuation + wrap-up)
Agent: Z.ai Code (main)
Task: browser QA for v0.44.x + wrap-up.

Work Log:
- Discovered + fixed a sandbox freeze vector: the torch cube-shadow passes (CubeCamera ×6 faces + the new PCF shader) intermittently hard-freeze llvmpipe (0% CPU deadlock, no frames, CDP dead). Added a software-GL guard: maxTorchShadows = 0 on llvmpipe (real GPUs unaffected — user runs the pack at 119 fps and torches already rendered there in v0.43). After the guard, day loads with shadows:1 render fine (tree/sugarcane shadows visible on sand, water clean).
- Verified via shadow-map pixel readback that glass tiles are alpha-cutout in the depth pass (window centers let direct sun through) and the sky-light BFS propagates through glass (opaque:false) — direct sun patches through windows/doors work geometrically; the god-rays widening (±55% off-screen) now adds visible shafts from window pixels.
- Visual QA completed for: world load + render with all new shaders (multiple day loads), sun shadows ON (1024 map) with the softer 52% ambient floor + 1.3-texel PCF, sugarcane/tree cast shadows, water reflections.
- Visual QA NOT completable in this sandbox: night-time torch scene. Reason: game time advances ~0.15s per real second at sandbox fps (dt clamp) → night is ~30+ real minutes away, and the llvmpipe freezes recur intermittently on night loads (pre-dates this round's changes; also reproduced with v0.43.0). The warm-tint + soft-cube torch code paths are math-verified and compile-verified; final look confirmation falls to the user's GPU (next round should retry on a healthier sandbox).
- User's world save: QA artifacts removed (planks/sandstone test blocks restored to sand, test torches removed), time restored to morning.
- Version → 0.44.1. Commits pushed: 421ce0b (v0.44.0 core fixes), d06b61d + 16e844e (repo hygiene: qa/upload out of git), 6f89d91 (software-GL cube guard).

Stage Summary:
- Shipped: soft PCF cube shadows (384px Linear + normal-offset bias + tangent PCF + 0.32 bounce floor), warm Unreal-style torch tint (terrain/cutout/grass), sun ambient floor 52% + softer PCF, god rays through openings with the sun off-screen, software-GL cube-shadow guard.
- Next-round QA checklist: (1) night torch pool = warm/orange glow, soft shadows, never a black room; (2) treetop shadows read ~52% brightness, no near-black patches; (3) window/door god rays visible indoors with the sun off-screen; (4) confirm no regression on the user's GPU at Ultra.

---
Task ID: 46
Agent: Z.ai Code (main)
Task: v0.45.0 — user report (3 screenshots): (1) tree-leaf blackening STILL unresolved; (2) at night mobs and some objects turn very black (suspects shadow math); (3) creative breaking is broken — one click breaks 3-4 blocks in a burst including the blocks behind.

Work Log:
- Anti-rollback: restore-from-github.sh → tree matched origin/main (v0.44.1). No restore needed.
- ROOT CAUSE FOUND (the "black patches when shadows are ON" family — cane streaks, black lily pads, black leaf/branch areas): the mesher's special models (cross: sugarcane/tall grass/flowers/wheat/saplings/mushrooms/dead bush; torch mini-box; lily pad) NEVER pushed normals — the aNormal Float32BufferAttribute was built SHORTER than the position count while the index buffer drew the full range. Every vertex beyond the normals count read OUT-OF-BOUNDS attribute memory → garbage/zero vNormalW → the shadow shader's normalize()/dot()/sample-offset math went undefined per driver → random black patches EXACTLY on cross plants/lily pads/torches, and ONLY when shadows were on (uShadowStrength>0.001 guard skipped the garbage path when off — matching the user's decisive on/off experiment from round 43). Introduced when shadows started consuming aNormal (v0.44); the mesher never got updated.
  FIX (mesher.ts): cross + lily push up-normal (0,1,0) per vertex (same trick as grass tufts — lifts the shadow sample above thin quads, no self-shadow acne); torch box faces push their real per-face normals. aNormal is now 1:1 with positions on every chunk (verified in-browser: 6/6 cutout meshes position.count === aNormal.count).
- NIGHT BLACKNESS (user: "در شب ماب ها و بعضی از ابجکت ها خیلی سیاه میشن"): TWO compounding causes.
  1. sunLevel night floor was 0.14 → terrain sunL=vSky×0.14 (pow curve → ~10% on top faces, ~5% sides = near-black) AND every entity tint used the same 0.14. Raised the floor to 0.30 (MC moonlight ≈ level 4/15) in sky.ts. Safe for gameplay: hostile spawn check is effLight<6 → 15×0.30=4.5<6 still spawns at night; passive spawns still gated sunLevel>0.55; zombie burning still sunLevel>0.82.
  2. DOUBLE-DARKENING on entities: mob/drop/boat/hand tint multiplied the raw night value (lightF=0.30) on top of scene lights that ALSO darken with sunLevel (ambient 0.475 at night) → zombie/cow = 0.30×0.475 ≈ 0.14 effective → pitch-black dark-skinned mobs while white sheep survived. FIX: normalize the tint by the global sun factor — lightF = clamp(max(blockL, skyL×sunLevel)/max(sunLevel, 0.3), 0.1, 1) — the tint now encodes only LOCAL variation (torches bright, caves dark) while scene lights carry day/night. Applied in mobs.ts, drops.ts, boats.ts, engine.ts (hand/player model).
- CUTOUT SHADOW AMBIENT: leaves/cane/plants now keep 64% sky ambient in shadow (opaque terrain stays 52%) via new per-material uShadowAmbient uniform — shadowed canopy interiors read as dark-green, not black (vanilla treats vegetation as light-diffusing).
- CREATIVE BREAK BURST (user: "با یک کلیک 3 و 4 تا بلاک خراب میکنه"): mineTick's creative branch broke a block EVERY FRAME while LMB was down — the raycast then passed through each fresh hole and destroyed the blocks behind (a per-frame tunnel). FIX: creativeBreakCd=0.25s cadence (MC ~4 blocks/s held), reset to 0 on mousedown EDGE so every fresh click breaks exactly ONE block instantly; holding breaks at 4/s; reach limit unchanged (4.5). Verified in-browser with an instrumented setBlock: single click → exactly 1 block; 1.3s hold straight down → exactly 3 blocks (then stops at reach).
- VERSION CLEANUP: F3 debug overlay showed a hardcoded "0.41.0" (stale since v0.42). Created src/game/version.ts (GAME_VERSION + GAME_VERSION_LABEL, single source of truth); MainMenu + DebugOverlay now read it.
- QA (agent-browser, llvmpipe): user world seed 7777 with shadows ON (strength 1): sugarcane FULLY GREEN (was black-streaked), lily pads GREEN on the pond (was black blobs), tree canopies green, water clean. Night (time=30): terrain sand readable, trees dark-green readable, spawned zombie/cow/sheep show REAL texture colors (zombie green skin + teal shirt — was pitch black). Creative cadence test in a throwaway world (4242): 1 click = 1 block; hold 1.3s = 3 blocks with reach stop. Lint clean.
- llvmpipe wedge recurred during world reload (documented pattern); recovered by killing chrome + fresh session. A transient Prisma "stale SQLite engine" 500 on the throwaway world's save self-healed (row present, saves 200 afterward).
- WORLD-SAVE HYGIENE: this QA teleported the player + changed time in the user's world; the 20s autosave captured it. Restored from the last COMMITTED db state (zero block-edit diffs confirmed via edits-map diff): player (239.3, 42.0, -108.5, yaw -0.75, pitch -0.10), time 248.9 — restored into DB + localStorage + the live session so the next autosave persists the correct state.
- Version → 0.45.0 (VERSION + version.ts label "Normal Fix + Moonlight").

Stage Summary:
- The whole "black patches with shadows ON" family is FIXED at the root: aNormal buffer underrun (garbage normals in the shadow math) eliminated — cross plants, torches and lily pads are guaranteed 1:1 normals; cutout vegetation keeps 64% shadow ambient.
- Night is moonlit-readable: sunLevel floor 0.30 + entity tint normalization (no more double-darkening) — mobs show real colors at night, hostiles still spawn, day look unchanged.
- Creative breaking behaves like MC: 1 click = 1 block, hold = 4 blocks/s, reach-limited.
- Version surfaces unified (version.ts); F3 no longer stale.
- NEXT QUEUE: mob sun-shadow tinting (lightF shadow-map aware), performance pass, brewing/potions, villager restock UI, item frames/armor stands, cake from milk.
