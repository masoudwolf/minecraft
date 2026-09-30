// ─── Shared shadow state ─────────────────────────────────────────────────────
// Tiny bridge between the graphics pack (which owns the real shadow pipeline)
// and gameplay code (mobs/engine) that draws vanilla-style blob shadows.
// When real sun/moon shadows are enabled, blob circles must hide — and gameplay
// code re-shows them EVERY FRAME, so the flag has to live somewhere both sides
// can read cheaply (the old sweep-based toggle lost that fight every frame).
export const shadowState = {
  /** true while the graphics pack renders real shadow maps (quality ≥ 1) */
  realShadows: false,
};
