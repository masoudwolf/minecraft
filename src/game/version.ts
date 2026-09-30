// ─── Single source of truth for the game version ─────────────────────────────
// Mirrors the VERSION file at the repo root. MainMenu + DebugOverlay (F3) read
// this so the version can never go stale in one UI surface again.
export const GAME_VERSION = '0.45.0';
export const GAME_VERSION_LABEL = `${GAME_VERSION} — Normal Fix + Moonlight`;
