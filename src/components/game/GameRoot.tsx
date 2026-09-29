'use client';

// ─── Game root: canvas + engine lifecycle + screen router ────────────────────
import { useEffect, useRef, useState } from 'react';
import { Game, setEngine } from '@/game/engine';
import { useGameStore } from '@/game/state';
import { MainMenu } from './MainMenu';
import { WorldSelectScreen, CreateWorldScreen } from './WorldMenu';
import { AchievementsScreen } from './AchievementsScreen';
import { HUD } from './HUD';
import { DebugOverlay } from './DebugOverlay';
import { PauseMenu, SettingsScreen, DeathScreen, LoadingScreen, TradePanel } from './Overlays';
import { InventoryScreen } from './InventoryScreen';
import AssetViewer from './AssetViewer';

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screen = useGameStore((s) => s.screen);
  const prevScreen = useGameStore((s) => s.prevScreen);
  const invOpen = useGameStore((s) => s.inv.open);
  const tradeOpen = useGameStore((s) => s.tradeOpen);
  const debugVisible = useGameStore((s) => s.debugVisible);

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current);
    setEngine(game);
    void game.migrateLocalSave(); // legacy localStorage save → DB world (one-time)
    void game.fetchWorlds();
    return () => {
      game.dispose();
      setEngine(null);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {screen === 'playing' && (
        <>
          <HUD />
          {debugVisible && <DebugOverlay />}
          {!invOpen && <ClickHint />}
        </>
      )}
      {screen === 'playing' && invOpen && <InventoryScreen />}
      {screen === 'playing' && tradeOpen && !invOpen && <TradePanel />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'worlds' && <WorldSelectScreen />}
      {screen === 'createWorld' && <CreateWorldScreen />}
      {screen === 'achievements' && <AchievementsScreen source={prevScreen === 'paused' ? 'game' : 'menu'} />}
      {screen === 'loading' && <LoadingScreen />}
      {screen === 'paused' && <PauseMenu />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'assets' && <AssetViewer />}
      {screen === 'dead' && <DeathScreen />}
    </div>
  );
}

/** shows "Click to play" when the pointer isn't locked during gameplay */
function ClickHint() {
  const [locked, setLocked] = useState(!!document.pointerLockElement);

  useEffect(() => {
    const onChange = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  if (locked) return null;
  return (
    <div
      className="absolute left-1/2 top-[58%] z-30 -translate-x-1/2 bg-black/55 px-4 py-2 text-sm text-white"
      style={{ fontFamily: 'var(--font-mc)', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}
    >
      Click to play
    </div>
  );
}
