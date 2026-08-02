# Release checklist

The ordered checks this project actually runs, pre-merge and pre-deploy —
not an aspirational list. Matches `.github/workflows/ci.yml` exactly; if this
doc and that file ever disagree, the workflow file is the source of truth
and this doc is stale.

## Pre-merge (every PR, enforced by CI)

CI (`.github/workflows/ci.yml`) runs four jobs on every push to `main` and
every PR, all required to pass before merge:

1. **`checks`** — `npm ci` → `npx prisma generate` → `npm run lint`
   (zero warnings) → `npm run typecheck` → `npm test` (unit suite,
   `vitest run`) → `npm run build`.
2. **`migrations`** — spins up a disposable Postgres 16 container,
   `npx prisma migrate deploy` against it, then `npm run test:integration`
   (real-DB tests, `tests/integration/**/*.int.test.mjs`).
3. **`e2e`** — spins up the same disposable Postgres, `npx prisma migrate deploy`,
   `npx playwright install --with-deps chromium`, then `npm run test:e2e`
   against a real `next build && next start` + the durable worker
   (`scripts/worker.mjs`) with `E2E_MOCK_PROVIDERS=1`.
4. **`audit`** — `npm audit --omit=dev --audit-level=critical`. Deliberately
   scoped to `critical` (not `high`) with the exact rationale for the current
   3 accepted high-severity findings (`next`'s bundled `postcss`/`sharp`, no
   non-breaking fix available on the Next 16.x line) recorded inline in the
   workflow file itself.

Additionally, `tests/unit/route-manifest.test.mjs` (part of the `checks` job's
`npm test`) fails CI if any `src/app/api/**/route.js` file is missing from
`security/route-manifest.json`, or if a cookie-session state-changing route
(`auth: "user"`/`"admin"`, `stateChanging: true`) lacks `originCheck: true`
without an explicit `ORIGIN-EXEMPT:` justification in its `notes` field —
this is the mechanism that keeps the security manifest from silently
drifting out of sync as routes are added.

## Locally, before opening a PR (what an agent/engineer should run)

Same four checks as CI, run locally first so CI is a confirmation, not a
discovery:

```bash
npm run lint && npm run typecheck && npm test && npm run build
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/test npm run test:integration
npm run test:e2e
```

(Integration and e2e need the disposable local Postgres container described
in `tests/integration/setup.mjs` and `playwright.config.mjs` —
`docker run -d --name helmies-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 55432:5432 postgres:16`,
then `npx prisma migrate deploy` against it once.)

For a change touching Prisma schema/migrations specifically: author the
migration offline, verify it applies cleanly to the disposable test
Postgres (never to the `.env` `DATABASE_URL` — that's production), and let
CI's `migrations` job be the second, independent confirmation.

## Pre-deploy (manual today — see `RELEASE_STATUS.md` Gate F)

`scripts/deploy.sh` is the actual deploy mechanism, run over SSH on the
server (`plink -ssh -batch -pw '<pw>' root@<host> 'bash /root/helmies-studio/scripts/deploy.sh'`).
It already encodes its own ordered sequence: pull `main` → install deps only
if the lockfile moved → `prisma generate` → `prisma migrate deploy` → build
→ `pm2 startOrReload ecosystem.config.cjs --update-env` (restarts both the
app and `helmies-worker` together) → a local health-check poll → a public
HTTPS health-check.

What is **not** automated and should be checked by hand immediately after
`scripts/deploy.sh` finishes:

- `GET /api/admin/metrics` returns and `jobs.oldestQueuedAgeSec` is not
  already climbing (confirms the worker restarted and is claiming).
- `GET /api/admin/ops` returns and shows `maintenance: false` (confirms the
  deploy didn't leave a maintenance window from a previous incident still
  on).
- If the deploy included any operator-control change (Phase 7), manually
  toggle maintenance mode on and back off once, confirming `/studio` 503s
  and then recovers — `docs/runbook-ops.md`.
- `pm2 describe helmies-worker` shows a low `restarts` count (not
  crash-looping) a minute or two after the restart.

## What this checklist does not yet cover

No staged/canary environment, no automated rollback, no production smoke-test
script, no ZAP/security scan step, no cross-browser/device matrix, and no
screen-reader pass — all called out explicitly, with the one-command
instruction to run each, in `RELEASE_STATUS.md`.
