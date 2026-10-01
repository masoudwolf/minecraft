'use client';

// ─── Creator Tools (F4 or ⚒ button): quick testing panel for the game creator ─
// Time control, weather, mob spawning, mode toggle, heal, teleport, cleanup,
// PLUS the Cheats section: give items, repair, XP, god mode, instant break.
import { useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine, type Game } from '@/game/engine';
import { audio } from '@/game/audio';
import type { MobType } from '@/game/entities/mobs';
import { ITEM } from '@/game/items';
import { BLOCK } from '@/game/blocks';
import { PLAYER_AIR_MAX } from '@/game/player';
import { slotIconUrl, slotName } from './slotIcon';

const MOB_SPAWN_LIST: { type: MobType; label: string; variant?: string }[] = [
  { type: 'pig', label: 'Pig' },
  { type: 'cow', label: 'Cow' },
  { type: 'sheep', label: 'Sheep ♦', variant: 'white' },
  { type: 'sheep', label: 'Sheep ●', variant: 'black' },
  { type: 'sheep', label: 'Sheep ♦', variant: 'brown' },
  { type: 'chicken', label: 'Chicken' },
  { type: 'mooshroom', label: 'Mooshroom' },
  { type: 'zombie', label: 'Zombie' },
  { type: 'skeleton', label: 'Skeleton' },
  { type: 'creeper', label: 'Creeper' },
  { type: 'spider', label: 'Spider' },
  { type: 'enderman', label: 'Enderman' },
  { type: 'villager', label: 'Villager' },
  { type: 'witch', label: 'Witch' },
  { type: 'golem', label: 'Iron Golem' },
  { type: 'snowgolem', label: 'Snow Golem' },
  { type: 'snowgolem', label: 'Sheared Snow Golem', variant: 'plain' },
  { type: 'knight', label: 'Knight ♦ Cyber', variant: 'cyber' },
  { type: 'knight', label: 'Knight 🔥 Fire', variant: 'fiery' },
  { type: 'knight', label: 'Knight ☢ Toxic', variant: 'toxic' },
  { type: 'knight', label: 'Knight ✦ Ender', variant: 'ender' },
];

const TIME_PRESETS: { label: string; t: number }[] = [
  { label: 'Sunrise', t: 130 },
  { label: 'Noon', t: 240 },
  { label: 'Sunset', t: 350 },
  { label: 'Midnight', t: 20 },
];

/** cheat give-list: fast bug-hunting kits (id + amount) */
const CHEAT_ITEMS: { id: number; n: number }[] = [
  { id: ITEM.DIAMOND, n: 64 },
  { id: ITEM.IRON_INGOT, n: 64 },
  { id: ITEM.GOLD_INGOT, n: 64 },
  { id: ITEM.COAL, n: 64 },
  { id: ITEM.LAPIS_LAZULI, n: 64 },
  { id: ITEM.BOOK, n: 16 },
  { id: ITEM.STEAK, n: 64 },
  { id: ITEM.BREAD, n: 64 },
  { id: BLOCK.TORCH, n: 64 },
  { id: BLOCK.PLANKS, n: 64 },
  { id: BLOCK.COBBLESTONE, n: 64 },
  { id: BLOCK.OBSIDIAN, n: 16 },
  { id: ITEM.STRING, n: 16 },
  { id: ITEM.ARROW, n: 64 },
  { id: ITEM.BOW, n: 1 },
  { id: ITEM.FISHING_ROD, n: 1 },
  { id: ITEM.SHEARS, n: 1 },
  { id: ITEM.BUCKET, n: 4 },
  { id: ITEM.WATER_BUCKET, n: 4 },
  { id: BLOCK.ENCHANTING_TABLE, n: 8 },
  { id: BLOCK.ITEM_FRAME, n: 16 },
  { id: BLOCK.FLOWER_POT, n: 16 },
  { id: BLOCK.FLOWER_RED, n: 16 },
  { id: BLOCK.MUSHROOM_RED, n: 16 },
];

/** collapsed state: a small always-visible cheat button (top-right) */
function CheatButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-end p-2 pt-2">
      <button
        aria-label="Open cheat tools"
        title="Cheat / Debug tools (F4)"
        className="pointer-events-auto flex items-center gap-1.5 px-2 py-1.5"
        style={{
          fontFamily: 'var(--font-mc)',
          background: 'rgba(20,20,22,0.82)',
          border: '2px solid #55555a',
          boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.18)',
          color: '#ffe37a',
          textShadow: '1px 1px 0 #000',
          minHeight: 44,
        }}
        onClick={onClick}
      >
        <span className="text-[14px]">⚒</span>
        <span className="text-[11px]">Cheats</span>
      </button>
    </div>
  );
}

export function CreatorTools() {
  const creatorOpen = useGameStore((s) => s.creatorOpen);
  const setCreatorOpen = useGameStore((s) => s.setCreatorOpen);
  const [, force] = useState(0);
  const refresh = (): void => force((n) => n + 1);
  // collapsed: floating cheat button (visible during play)
  if (!creatorOpen) {
    return (
      <CheatButton
        onClick={(): void => {
          audio.click();
          setCreatorOpen(true);
        }}
      />
    );
  }

  const eng = getEngine(); // render-time READS only; handlers refetch
  // engine must be fully constructed (sky/player/mobs) before the panel reads it —
  // after Fast Refresh a stale singleton can exist with undefined subsystems
  const engReady = !!(eng && eng.sky && eng.player && eng.mobs);
  const close = (): void => {
    audio.click();
    setCreatorOpen(false);
    getEngine()?.requestLock(); // return the cursor to the game
  };
  const act = (fn: (g: Game) => void): (() => void) => (): void => {
    const g = getEngine();
    if (!g) return;
    audio.click();
    fn(g);
    refresh();
  };

  // spawn a mob ~4 blocks in front of the player, at ground height
  const spawnAtLook = (type: MobType, variant?: string): (() => void) => act((g) => {
    const p = g.player;
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    const x = p.x + dx * 4, z = p.z + dz * 4;
    // scan down from a bit above the player for ground
    let y = Math.floor(p.y) + 4;
    const isSolid = (yy: number): boolean => {
      const b = g.world.getBlock(Math.floor(x), yy, Math.floor(z));
      return b !== 0 && b !== 10 && b !== 38;
    };
    while (y > 1 && !isSolid(y - 1)) y--;
    g.mobs.debugSpawn(type, x, y, z, variant ?? '');
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-start justify-end p-3 pt-14">
      <div className="pointer-events-auto max-h-[80vh] w-[290px] overflow-y-auto border-4 border-[#1d1d21] bg-[#313135]/95 p-3 shadow-2xl" style={{ fontFamily: 'var(--font-mc)' }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-[#ffe37a]" style={{ textShadow: '2px 2px 0 #000' }}>⚒ Creator Tools</span>
          <button className="border-2 border-[#5a5a5a] bg-[#6d6d6d] px-2 py-0.5 text-[11px] text-white hover:bg-[#7d7d7d]" onClick={close}>✕</button>
        </div>
        {!engReady && <div className="text-[11px] text-[#ff9d9d]">Engine not ready…</div>}
        {engReady && (
          <div className="flex flex-col gap-3 text-[11px] text-white">
            {/* TIME */}
            <Section title="Time">
              <div className="grid grid-cols-4 gap-1">
                {TIME_PRESETS.map((p) => (
                  <Btn key={p.label} onClick={act((g) => { g.sky.time = p.t; })}>{p.label}</Btn>
                ))}
              </div>
              <label className="mt-1 flex items-center gap-2 text-[10px] text-[#ccc]">
                t={Math.floor(eng.sky.time)}
                <input
                  type="range" min={0} max={479} step={1} value={Math.floor(eng.sky.time)}
                  className="flex-1 accent-[#ffe37a]"
                  onChange={(e) => { const g = getEngine(); if (g) { g.sky.time = Number(e.target.value); refresh(); } }}
                />
              </label>
            </Section>

            {/* WEATHER */}
            <Section title="Weather">
              <div className="grid grid-cols-3 gap-1">
                <Btn active={eng.weather?.state === 'clear'} onClick={act((g) => {
                  if (g.weather) { eng.weather.state = 'clear'; eng.weather.intensity = 0; } })}>Clear</Btn>
                <Btn active={eng.weather?.state === 'rain'} onClick={act((g) => {
                  if (g.weather) { eng.weather.state = 'rain'; eng.weather.intensity = 1; } })}>Rain</Btn>
                <Btn active={eng.weather?.state === 'thunder'} onClick={act((g) => {
                  if (g.weather) { eng.weather.state = 'thunder'; eng.weather.intensity = 1; } })}>Storm</Btn>
              </div>
            </Section>

            {/* GAME MODE */}
            <Section title="Game Mode">
              <div className="grid grid-cols-2 gap-1">
                <Btn active={eng.player.gameMode === 'creative'} onClick={act((g) => { g.player.gameMode = 'creative'; })}>Creative</Btn>
                <Btn active={eng.player.gameMode === 'survival'} onClick={act((g) => { g.player.gameMode = 'survival'; })}>Survival</Btn>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <Btn onClick={act((g) => { g.player.health = 20; })}>Heal</Btn>
                <Btn onClick={act((g) => {
                  const s = g.spawnPoint;
                  if (!s) return;
                  g.player.x = s.x; g.player.y = s.y; g.player.z = s.z; g.player.entity.vy = 0;
                })}>To Spawn</Btn>
              </div>
            </Section>

            {/* SPAWN MOB */}
            <Section title="Spawn Mob (in front)">
              <div className="grid grid-cols-3 gap-1">
                {MOB_SPAWN_LIST.map((m, i) => (
                  // spawnAtLook RETURNS the handler — call it (wrapping it in
                  // another arrow built a never-invoked closure: the spawn
                  // buttons silently did nothing)
                  <Btn key={m.label + i} onClick={spawnAtLook(m.type, m.variant)}>{m.label}</Btn>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <Btn onClick={act((g) => {
                  for (const m of [...g.mobs.mobs]) {
                    if (m.def.hostile && !m.dead) { m.dead = true; m.deathT = 0.45; }
                  }
                })}>Kill Hostiles</Btn>
                <Btn onClick={act((g) => { g.mobs.clear(); })}>Clear All Mobs</Btn>
              </div>
            </Section>

            {/* CHEATS: give / repair / xp / god / instant-break */}
            <Section title="Cheats (Give ×64)">
              <div className="grid grid-cols-6 gap-1">
                {CHEAT_ITEMS.map(({ id, n }) => {
                  const icon = slotIconUrl(id);
                  return (
                    <button
                      key={id}
                      title={`Give ${n} × ${slotName(id)}`}
                      aria-label={`Give ${n} ${slotName(id)}`}
                      className="flex h-[34px] items-center justify-center"
                      style={{
                        background: '#6d6d6d',
                        border: '2px solid #5a5a5a',
                        borderBottom: '2px solid #2e2e2e',
                        borderRight: '2px solid #2e2e2e',
                      }}
                      onClick={act((g) => { g.cheatGive(id, n); })}
                    >
                      {icon && <img src={icon} alt={slotName(id)} className="h-[26px] w-[26px]" style={{ imageRendering: 'pixelated' }} draggable={false} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <Btn onClick={act((g) => { g.cheatRepairAll(); })}>Repair All</Btn>
                <Btn onClick={act((g) => { g.player.level += 10; })}>+10 Levels</Btn>
                <Btn active={eng.player.godMode} onClick={act((g) => { g.player.godMode = !g.player.godMode; })}>
                  God {eng.player.godMode ? 'ON' : 'OFF'}
                </Btn>
                <Btn active={eng.instantBreak} onClick={act((g) => { g.instantBreak = !g.instantBreak; })}>
                  Fast Mine {eng.instantBreak ? 'ON' : 'OFF'}
                </Btn>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <Btn onClick={act((g) => {
                  g.player.health = 20; g.player.hunger = 20;
                  g.player.air = PLAYER_AIR_MAX; g.player.poisonT = 0;
                })}>Full Restore</Btn>
                <Btn onClick={act((g) => { g.player.y += 10; g.player.entity.vy = 0; })}>Unstick +10Y</Btn>
              </div>
            </Section>

            <div className="text-center text-[9px] text-[#888]">F4 to toggle this panel</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 border-b border-[#4a4a4e] pb-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9a9a9e]">{title}</div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      className={`border-2 px-1.5 py-1 text-[10px] leading-none ${active ? 'border-[#ffe37a] bg-[#5c5426] text-[#ffe37a]' : 'border-[#5a5a5a] border-b-[#2e2e2e] border-r-[#2e2e2e] bg-[#6d6d6d] text-[#eee] hover:bg-[#7d7d7d]'}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
