'use client';

import dynamic from 'next/dynamic';

const GameRoot = dynamic(() => import('@/components/game/GameRoot'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#1a1a1a]">
      <div className="text-white text-lg" style={{ fontFamily: 'var(--font-mc)' }}>Loading VoxelCraft…</div>
    </div>
  ),
});

export default function Home() {
  return <GameRoot />;
}
