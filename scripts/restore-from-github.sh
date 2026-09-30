#!/usr/bin/env bash
# restore-from-github.sh — one-command recovery from sandbox regressions.
# GitHub is the single source of truth. Run this BEFORE any other work.
# Token lives OUTSIDE the repo at ~/.github-token (never commit it — GitHub Push Protection blocks it).
set -u
cd /home/z/my-project || exit 1

TOKEN_FILE="$HOME/.github-token"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "[restore] ERROR: $TOKEN_FILE missing — cannot authenticate"
  exit 1
fi
TOKEN=$(cat "$TOKEN_FILE")
REMOTE_URL="https://masoudwolf:${TOKEN}@github.com/masoudwolf/minecraft.git"

# 0. sanity markers of the newest version (v0.41+)
STALE=0
[ -f src/game/entities/knightSkin.ts ] || STALE=1
grep -q "WATER_BUCKET" src/game/items.ts 2>/dev/null || STALE=1

CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
echo "[restore] local HEAD: $CURRENT"

# 1. ensure remote exists + fetch
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
fi
git fetch origin main 2>&1 | tail -1
REMOTE=$(git rev-parse --short origin/main 2>/dev/null || echo "none")
echo "[restore] origin/main: $REMOTE"

NEEDS_RESTORE=0
if [ "$STALE" = "1" ]; then
  echo "[restore] STALE TREE DETECTED (feature markers missing)"
  NEEDS_RESTORE=1
elif [ "$CURRENT" != "$REMOTE" ]; then
  # only force when local is NOT ahead of remote (local-ahead = normal uncommitted work)
  AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
  if [ "$AHEAD" = "0" ]; then
    echo "[restore] local is behind origin/main by $(git rev-list --count HEAD..origin/main) commits"
    NEEDS_RESTORE=1
  else
    echo "[restore] local is AHEAD by $AHEAD commits (normal) — pushing instead"
    NEEDS_RESTORE=0
  fi
fi

if [ "$NEEDS_RESTORE" = "1" ]; then
  # 2. preserve the stale tree for forensics, then hard-restore
  BR="backup/stale-$(date +%Y%m%d-%H%M%S)"
  git add -A >/dev/null 2>&1
  git commit -m "auto: preserve stale tree before restore" >/dev/null 2>&1
  git branch -f "$BR" HEAD 2>/dev/null
  git reset --hard origin/main
  echo "[restore] RESTORED to $(git rev-parse --short HEAD) (stale tree kept on $BR)"
  # 3. sync deps + restart dev server
  bun install >/dev/null 2>&1
  pkill -f "next dev" 2>/dev/null; pkill -f "bun run dev" 2>/dev/null; sleep 2
  (bun run dev > dev.log 2>&1 &)
  sleep 8
  echo "[restore] dev server restarted"
else
  echo "[restore] OK — tree matches origin/main, nothing to do"
fi

echo "[restore] current version:"
git log --oneline -1
