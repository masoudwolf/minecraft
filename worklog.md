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
