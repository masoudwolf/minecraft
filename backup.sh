#!/usr/bin/env bash
# Protective backup: commit everything + push to GitHub (if credentials exist).
# Run after every completed work unit. Sandbox resets restore the LAST COMMIT,
# so committing is the primary protection; pushing is the off-sandbox backup.
cd "$(dirname "$0")"
git add -A
if git diff --cached --quiet; then echo "Nothing to commit."; else git commit -m "Auto-backup $(date '+%Y-%m-%d %H:%M')"; fi
if git push origin main 2>/dev/null; then echo "✓ Pushed to GitHub (masoudwolf/minecraft)"; else echo "⚠ Push failed — token lacks Contents:Read+Write (fine-grained PAT). Fix at github.com/settings/tokens:"; echo "  Edit token: Repository access→minecraft selected; Permissions→Repository→Contents: Read and write"; fi
