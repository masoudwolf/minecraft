'use client';

// ─── F3 debug overlay (Minecraft-style) ──────────────────────────────────────
import { useGameStore } from '@/game/state';

export function DebugOverlay() {
  const debug = useGameStore((s) => s.debug);
  const showFps = useGameStore((s) => s.settings.showFps);

  const lines = [
    `VoxelCraft 0.5.0 — ${debug.fps} fps`,
    `XYZ: ${debug.x.toFixed(2)} / ${debug.y.toFixed(2)} / ${debug.z.toFixed(2)}`,
    `Chunk: ${debug.chunkX} ${debug.chunkZ}  (${debug.chunks} loaded)`,
    `Biome: minecraft:${debug.biome}`,
    `Facing: ${debug.facing}   Mobs: ${debug.mobs}`,
    `Targeted Block: ${debug.targetBlock}`,
    `Time: ${debug.time}   Tris: ${debug.tris.toLocaleString()}`,
  ];

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-30 max-w-[92vw] select-none">
      {lines.map((line, i) => (
        <div
          key={i}
          className="bg-black/45 px-1.5 py-[1px] text-[11px] leading-[17px] text-white"
          style={{ fontFamily: 'var(--font-mc)', width: 'fit-content' }}
        >
          {line}
        </div>
      ))}
      {showFps && !lines[0].includes('fps') && (
        <div className="bg-black/45 px-1.5 text-[11px] text-white" style={{ fontFamily: 'var(--font-mc)' }}>
          {debug.fps} fps
        </div>
      )}
    </div>
  );
}
