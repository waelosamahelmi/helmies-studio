#!/usr/bin/env bash
# Helmies Studio — OWASP ZAP baseline scan (Phase 8 Task B3)
#
# Builds a REAL production build, starts it against the disposable local
# test Postgres (never the .env DATABASE_URL — see the DATABASE_URL guard
# below, same pattern as playwright.config.mjs/tests/e2e/fixtures/seed.mjs),
# and runs the OWASP ZAP baseline scan (a passive spider + a small set of
# safe active checks — NOT the full active scanner) against it in Docker.
#
# WHAT THIS DOES NOT PROVE: this is an UNAUTHENTICATED scan of a LOCAL
# instance. It never logs in, so it only ever sees the same handful of
# public routes any anonymous visitor sees (/, /login, /pricing, the public
# API 401/404 responses, static assets) — it does not exercise anything
# behind auth (the studio, admin, billing, or template-run routes), and it
# is not staging or production. It does NOT satisfy the release contract's
# requirement for an AUTHENTICATED scan against staging — see
# docs/runbook-security-scan.md's own header for the full scoping statement.
# Treat a clean run here as "no obvious unauthenticated issue", never as
# "this app is secure."
#
# Usage:
#   ./scripts/security-scan.sh
#   SECURITY_SCAN_PORT=3401 ./scripts/security-scan.sh   # if 3400 is busy
#
# Requires: Docker Desktop (or any Docker Engine reachable via `docker`),
# and the disposable test Postgres container already running with
# migrations applied (see docs/runbook-e2e.md's "Running locally" section —
# same container, same connection string).
set -euo pipefail

PORT="${SECURITY_SCAN_PORT:-3400}"
BASE_URL="http://localhost:${PORT}"
TEST_DATABASE_URL="postgresql://postgres:test@localhost:55432/test"
OUT_DIR="$(pwd)/zap-out"

# SAFETY (mirrors playwright.config.mjs's own guard comment): this script
# only ever targets the disposable local test database, hardcoded here —
# never read from ambient DATABASE_URL, so a stray exported production
# value in the calling shell can never leak into the scanned instance.
testDbHost() { node -e "try { console.log(new URL(process.argv[1]).hostname) } catch { console.log('') }" "$1"; }
host="$(testDbHost "$TEST_DATABASE_URL")"
if [ "$host" != "localhost" ] && [ "$host" != "127.0.0.1" ]; then
  echo "Refusing to run: TEST_DATABASE_URL's hostname must be localhost/127.0.0.1, got '$host'." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "==> Building the app (production build)..."
npm run build

echo "==> Starting the app on port ${PORT} against the disposable test database..."
DATABASE_URL="$TEST_DATABASE_URL" \
NEXTAUTH_URL="$BASE_URL" \
NEXTAUTH_SECRET="security-scan-dummy-secret-0000000000" \
GOOGLE_CLIENT_ID="security-scan-dummy-google-client-id" \
GOOGLE_CLIENT_SECRET="security-scan-dummy-google-client-secret" \
KIE_KEY="security-scan-dummy-kie-key" \
WEBHOOK_SECRET="security-scan-dummy-webhook-secret" \
OPENROUTER_KEY="" \
ALIBABA_KEY="" \
ALIBABA_WORKSPACE_ID="" \
STRIPE_SECRET_KEY="security-scan-dummy-stripe-secret-not-real" \
STRIPE_WEBHOOK_SECRET="security-scan-dummy-stripe-webhook-not-real" \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="security-scan-dummy-stripe-publishable-not-real" \
E2E_MOCK_PROVIDERS=1 \
NODE_ENV=production \
npm run start -- -p "$PORT" &
APP_PID=$!

cleanup() {
  echo "==> Stopping the app (pid ${APP_PID})..."
  kill "$APP_PID" 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Waiting for ${BASE_URL}/api/health..."
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "${BASE_URL}/api/health" 2>/dev/null; then
    echo "==> App is up."
    break
  fi
  sleep 1
done

# `--network host` (the plan's original example command) is Linux-only and
# silently does not behave the same way under Docker Desktop's Windows/Mac
# backends. `--add-host=host.docker.internal:host-gateway` is the portable
# equivalent — it works identically on a native Linux Docker Engine too —
# so the container reaches the just-started app on the host regardless of
# platform.
echo "==> Running the ZAP baseline scan against ${BASE_URL} (via host.docker.internal)..."
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "${OUT_DIR}:/zap/wrk:rw" \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t "http://host.docker.internal:${PORT}" \
  -r zap-report.html \
  -J zap-report.json \
  -x zap-report.xml \
  -I \
|| ZAP_EXIT=$?

# zap-baseline.py's own exit codes: 0 = no WARN/FAIL alerts, 1 = at least
# one FAIL, 2 = at least one WARN (its default alert threshold treats every
# finding as at most WARN unless a rule is explicitly escalated) — `-I`
# above makes it not fail the container run on WARN so this script's own
# exit code reflects whether the SCAN ran, not the triage verdict (that's a
# human/reviewer judgment call made afterwards, recorded in
# docs/runbook-security-scan.md, not something this script should encode).
echo "==> Reports written to ${OUT_DIR}/zap-report.{html,json,xml}"
echo "==> Done."
