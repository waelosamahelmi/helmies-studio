#!/usr/bin/env bash
# Deploy Helmies Studio to production.
#
# Run ON THE SERVER (root@69.62.126.13), from /root/helmies-studio.
# Locally: push to main first, then run this over SSH.
#
#   plink -ssh -batch -pw '<pw>' root@69.62.126.13 'bash /root/helmies-studio/scripts/deploy.sh'
#
# Nginx reverse-proxies studio.helmies.fi → PM2 process `helmies-studio`.

set -euo pipefail

APP_DIR=/root/helmies-studio
PM2_NAME=helmies-studio

cd "$APP_DIR"

step() { printf '\n\033[1;35m── %s\033[0m\n' "$1"; }

step "Pulling main"
git fetch origin main
BEFORE=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)
echo "$BEFORE → $AFTER"

step "Installing dependencies"
# Only reinstall when the lockfile actually moved — npm ci is slow and this
# box has limited headroom.
if ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json package.json; then
  npm ci --omit=dev=false
else
  echo "lockfile unchanged — skipping"
fi

step "Prisma client"
npx prisma generate

step "Database migration"
# ONE-TIME before the first deploy of this branch: on the server run
#   npx prisma migrate resolve --applied 0_init
# (marks the pre-existing schema as the baseline; see prisma/migrations/README.md)
npx prisma migrate deploy

step "Building"
# The box has ~6GB free; the default heap is not always enough for this app.
NODE_OPTIONS="--max-old-space-size=3072" npm run build

step "Restarting"
pm2 restart "$PM2_NAME" --update-env
sleep 4
pm2 describe "$PM2_NAME" | grep -E "status|restarts|uptime" || true

step "Health check"
for i in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3010/ || echo 000)
  if [ "$CODE" = "200" ] || [ "$CODE" = "307" ] || [ "$CODE" = "302" ]; then
    echo "local OK ($CODE)"
    break
  fi
  echo "waiting for app… ($CODE)"
  sleep 5
  if [ "$i" = "12" ]; then
    echo "app did not come up — last 40 log lines:"
    pm2 logs "$PM2_NAME" --lines 40 --nostream
    exit 1
  fi
done

PUBLIC=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://studio.helmies.fi/ || echo 000)
echo "public https://studio.helmies.fi → $PUBLIC"

step "Done"
