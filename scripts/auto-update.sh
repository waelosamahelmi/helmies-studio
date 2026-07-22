#!/usr/bin/env bash
set -euo pipefail

# ── Auto‑update daemon for Helmies Studio ─────────────────────────
# Run this on a cron schedule, e.g. every 5 minutes:
#   * * * * * /var/www/helmies-studio/scripts/auto-update.sh >> /var/log/helmies-auto-update.log 2>&1
# ───────────────────────────────────────────────────────────────────

APP_DIR="/var/www/helmies-studio"
PM2_NAME="helmies-studio"
LOG="/var/log/helmies-auto-update.log"
BRANCH="main"

cd "$APP_DIR"

# 1. Make sure we're on the right branch and clean
git checkout "$BRANCH" 2>/dev/null || true

# 2. Fetch latest without merging
git fetch origin "$BRANCH"

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "[$(date -Iseconds)] No updates — HEAD is $LOCAL"
  exit 0
fi

echo "[$(date -Iseconds)] Update found: $LOCAL → $REMOTE"

# 3. Pull
git pull origin "$BRANCH"

# 4. Install deps if package-lock.json changed
git diff --name-only "$LOCAL..$REMOTE" | grep -q "package-lock.json\|package.json" && {
  echo "[$(date -Iseconds)] Dependencies changed — running npm ci"
  npm ci --omit=dev
}

# 5. Regenerate Prisma client if schema changed
git diff --name-only "$LOCAL..$REMOTE" | grep -q "prisma/schema.prisma" && {
  echo "[$(date -Iseconds)] Schema changed — running prisma generate"
  npx prisma generate
}

# 6. Build
echo "[$(date -Iseconds)] Building…"
npm run build

# 7. Restart PM2 process
echo "[$(date -Iseconds)] Restarting $PM2_NAME…"
pm2 restart "$PM2_NAME"

echo "[$(date -Iseconds)] Update complete — now at $(git rev-parse HEAD)"
