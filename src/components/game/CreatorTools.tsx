'use client';

// ─── Creator Tools (F4): quick testing panel for the game creator ────────────
// Time control, weather, mob spawning, mode toggle, heal, teleport, cleanup.
import { useState } from 'react';
import { useGameStore } from '@/game/state';
import { getEngine, type Game } from '@/game/engine';
import { audio } from '@/game/audio';
import type { MobType } from '@/game/entities/mobs';

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
];

const TIME_PRESETS: { label: string; t: number }[] = [
  { label: 'Sunrise', t: 130 },
  { label: 'Noon', t: 240 },
  { label: 'Sunset', t: 350 },
  { label: 'Midnight', t: 20 },
];

export function CreatorTools() {
  const creatorOpen = useGameStore((s) => s.creatorOpen);
  const setCreatorOpen = useGameStore((s) => s.setCreatorOpen);
  const [, force] = useState(0);
  const refresh = (): void => force((n) => n + 1);
  if (!creatorOpen) return null;

  const eng = getEngine(); // render-time READS only; handlers refetch
  const close = (): void => { audio.click(); setCreatorOpen(false); };
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
        {!eng && <div className="text-[11px] text-[#ff9d9d]">Engine not ready…</div>}
        {eng && (
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
                <Btn active={eng.weather?.state === 'clear'} onClick={() => act((g) => {
                  if (g.weather) { eng.weather.state = 'clear'; eng.weather.intensity = 0; } })}>Clear</Btn>
                <Btn active={eng.weather?.state === 'rain'} onClick={() => act((g) => {
                  if (g.weather) { eng.weather.state = 'rain'; eng.weather.intensity = 1; } })}>Rain</Btn>
                <Btn active={eng.weather?.state === 'thunder'} onClick={() => act((g) => {
                  if (g.weather) { eng.weather.state = 'thunder'; eng.weather.intensity = 1; } })}>Storm</Btn>
              </div>
            </Section>

            {/* GAME MODE */}
            <Section title="Game Mode">
              <div className="grid grid-cols-2 gap-1">
                <Btn active={eng.player.gameMode === 'creative'} onClick={() => act((g) => { g.player.gameMode = 'creative'; })}>Creative</Btn>
                <Btn active={eng.player.gameMode === 'survival'} onClick={() => act((g) => { g.player.gameMode = 'survival'; })}>Survival</Btn>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <Btn onClick={() => act((g) => { g.player.health = 20; })}>Heal</Btn>
                <Btn onClick={() => act((g) => {
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
                  <Btn key={m.label + i} onClick={() => spawnAtLook(m.type, m.variant)}>{m.label}</Btn>
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
