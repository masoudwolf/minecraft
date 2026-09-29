#!/usr/bin/env bash
# Protective backup: commit everything + push to GitHub (if credentials exist).
# Run after every completed work unit. Sandbox resets restore the LAST COMMIT,
# so committing is the primary protection; pushing is the off-sandbox backup.
cd "$(dirname "$0")"
git add -A
if git diff --cached --quiet; then echo "Nothing to commit."; else git commit -m "Auto-backup $(date '+%Y-%m-%d %H:%M')"; fi
if git push origin main 2>/dev/null; then echo "✓ Pushed to GitHub (masoudwolf/minecraft)"; else echo "⚠ Push failed — configure credentials:"; echo "  git remote set-url origin https://<YOUR_GITHUB_TOKEN>@github.com/masoudwolf/minecraft.git"; echo "  (create the token at github.com/settings/tokens with repo scope)"; fi
