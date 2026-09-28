// ─── Core world constants ────────────────────────────────────────────────────
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const SEA_LEVEL = 40;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT;

export const DAY_LENGTH = 480; // seconds for a full day-night cycle
export const GRAVITY = -32;
export const JUMP_VELOCITY = 9.2;
export const WALK_SPEED = 4.32;
export const SPRINT_SPEED = 5.6;
export const SNEAK_SPEED = 1.6;
export const SWIM_SPEED = 2.6;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE = 1.62;
export const REACH = 4.5;

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}

export function blockIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_AREA;
}
