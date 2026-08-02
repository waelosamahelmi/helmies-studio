# Phase 8 — Closing the Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close every `RELEASE_STATUS.md` blocker that does not require the owner's credentials or a human operator — backups with a *rehearsed* restore, alerting that actually reaches someone, per-step template inputs, a real browser matrix, and an executed security scan.

**Architecture:** Two independent work streams that share no files. Stream A is operations (backup/restore scripts + systemd units, an alert evaluator with webhook delivery and deduplication). Stream B is product/test (per-step template input UI, Playwright projects for Firefox/WebKit, an OWASP ZAP baseline scan run in Docker against a real production build).

**Tech Stack:** unchanged. **No new npm dependencies** — alert delivery uses `fetch`, backups use `pg_dump`, ZAP runs as a Docker image.

## Global Constraints

- Two branches, worked concurrently: `feat/phase8-ops` (Stream A) and `feat/phase8-product` (Stream B). Neither may touch the other's files (listed per stream).
- Landing page off-limits except attribute/contrast a11y fixes (standing rule).
- **NEVER run `pg_dump`, `psql`, `prisma migrate` or any write against the `.env` `DATABASE_URL`.** All rehearsal happens against the disposable test database. The production backup script must be *written and unit-tested*, then run by the owner (or by the controller against production explicitly) — never speculatively by an implementer.
- Never print `.env` values.
- Gates each task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; integration where DB is touched; `npm run test:e2e` where UI is touched.
- Baseline at branch point: 570 unit, 85 integration, 26 e2e. None may break.
- **`RELEASE_STATUS.md` may only be edited by Stream A**, and only to reflect what was genuinely proven. A gate moves to PASS only with executed evidence; otherwise it stays BLOCKED with the reason.
- Commit convention + standard footers as prior phases.

---

## Stream A — Operations (`feat/phase8-ops`)

**Owns:** `scripts/backup-db.mjs`, `scripts/restore-db.mjs`, `src/lib/alerts.js`, `src/app/api/cron/alerts/route.js`, `src/lib/automation.js`, `docs/runbook-backup.md`, `docs/runbook-ops.md`, `RELEASE_STATUS.md`, `.env.example`, `scripts/check-env.mjs`, `security/route-manifest.json`
**Must not touch:** anything under `src/components/`, `src/app/templates/`, `tests/e2e/`, `playwright.config.mjs`, `src/lib/template*`

### Task A1: Backups with a rehearsed restore

**Files:** create `scripts/backup-db.mjs`, `scripts/restore-db.mjs`, `docs/runbook-backup.md`; tests `tests/unit/backup-args.test.mjs`

**Interfaces:**
- `scripts/backup-db.mjs` — `pg_dump --format=custom` of `DATABASE_URL` to `BACKUP_DIR` (default `/root/backups/db`), filename `helmies-studio-<ISO-date>-<HHMM>.dump`. Prunes dumps older than `BACKUP_RETENTION_DAYS` (default 14). Prints the path and byte size; **never prints the connection string**. Exits non-zero on failure so a systemd unit records it.
- `scripts/restore-db.mjs` — restores a named dump into a **target URL that must be supplied explicitly** via `--target` (never defaults to `DATABASE_URL`), refuses to run unless `--yes` is passed AND the target hostname is not the production host, and prints a row-count summary of key tables afterwards so the operator can eyeball it.
- Export the argument/guard logic as functions so it can be unit-tested without touching a database (`buildBackupPath(now, dir)`, `assertRestoreTargetAllowed(targetUrl, { allowProduction })`, `prunableFiles(files, now, retentionDays)`).

- [ ] **Step 1: Failing unit tests** — the filename is deterministic for a fixed clock; pruning selects only files older than the retention window and never the newest; `assertRestoreTargetAllowed` throws for a production-looking host and for a missing `--yes`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: REHEARSE THE RESTORE — this is the deliverable, not the script.** Against the test container only: seed recognisable data, run `backup-db.mjs` against the *test* database, drop and recreate that database, run `restore-db.mjs --target <test url> --yes`, and prove the seeded rows came back. Record the exact commands and the before/after row counts in `docs/runbook-backup.md`. A script that has never restored anything is not a backup.
- [ ] **Step 4: Write `docs/runbook-backup.md`** — how to take a manual backup, how to restore to a scratch database, how to restore to production (with the explicit warning that this is destructive and the exact command), the retention policy, where dumps live, and the systemd unit + timer text for a nightly backup (do **not** install them — the controller does that on the server).
- [ ] **Step 5: Gates + commit** — `feat: database backup and restore with a rehearsed recovery`

### Task A2: Alerting that reaches someone

**Files:** create `src/lib/alerts.js`, `src/app/api/cron/alerts/route.js`; modify `src/lib/automation.js`, `.env.example`, `scripts/check-env.mjs`, `security/route-manifest.json`, `docs/runbook-ops.md`; tests `tests/unit/alerts.test.mjs`, `tests/integration/alerts.int.test.mjs`

**Interfaces:**
- `evaluateAlerts(metrics)` from `@/lib/alerts` → `[{ key, severity: "warn"|"critical", title, detail, value, threshold }]`. Rules, each reading the Phase 7 metrics: worker liveness (`oldestQueuedAgeSec` > 900 → critical), job dead-letter rate, generation failure rate over the window, wallet reconciliation drift (> 0 → critical), Stripe webhook failures, queue backlog, and a provider whose failure count exceeds its success count.
- `deliverAlerts(alerts)` → posts a compact JSON payload to `ALERT_WEBHOOK_URL` when set; a no-op that logs when unset (so the system is honest about being un-delivered rather than silently pretending). Never includes secrets or prompt text.
- **Deduplication:** an alert with the same `key` must not re-fire more often than `ALERT_REPEAT_MINUTES` (default 60). Persist last-fired state in the existing `FeatureFlag` table (key prefix `alert_state:`) — no new model.
- `GET /api/cron/alerts` (auth: cron secret, same pattern as `/api/cron/automation`) evaluates and delivers; registered in the route manifest.

- [ ] **Step 1: Failing tests** — each rule fires at its threshold and not below it; a repeated alert inside the window is suppressed and fires again after it; `deliverAlerts` posts exactly once per delivery with no secret/prompt fields; with `ALERT_WEBHOOK_URL` unset nothing is posted and a warning is logged.
- [ ] **Step 2: Implement.** Reuse Phase 7's `collectMetrics` — do not re-query.
- [ ] **Step 3: Integration** — seed a stale queued job, hit the route, assert a critical worker-liveness alert is produced and (with a stubbed webhook) delivered once, then suppressed on an immediate second call.
- [ ] **Step 4: Document in `docs/runbook-ops.md`** — every rule, its threshold, how to set `ALERT_WEBHOOK_URL` (Slack/Discord/generic), and the systemd timer text for a 5-minute cadence (controller installs it).
- [ ] **Step 5: Gates + integration + commit** — `feat: threshold alerting with webhook delivery and deduplication`

### Task A3: Update RELEASE_STATUS honestly

- [ ] Re-evaluate Gate B (backup/restore now rehearsed — does it PASS, or does the remaining Stripe test-clock blocker keep it BLOCKED? Say which and why) and Gate F (alerting now exists and is delivered — but rollback rehearsal and the production smoke test may still block). Move a gate only on evidence you produced. Commit — `docs: release status after backups and alerting`

---

## Stream B — Product & verification (`feat/phase8-product`)

**Owns:** `src/components/templates/*`, `src/app/templates/*`, `src/lib/template-runner.js` (inputs only), `scripts/seed-templates.mjs`, `playwright.config.mjs`, `tests/e2e/*`, `docs/runbook-security-scan.md`
**Must not touch:** `scripts/backup-db.mjs`, `scripts/restore-db.mjs`, `src/lib/alerts.js`, `src/lib/automation.js`, `RELEASE_STATUS.md`, `docs/runbook-ops.md`

### Task B1: Per-step template inputs (unblocks `real-estate-listing-pack`)

**Files:** the template detail/use UI under `src/app/templates/` and `src/components/`; `scripts/seed-templates.mjs`; tests `tests/e2e/template-inputs.spec.mjs`

**Interfaces:** the template detail page renders an input control per declared step input (text, number, select, and **image upload** reusing the existing `/api/upload` route and its magic-byte validation), sends them as `inputs[stepId][field]`, and re-quotes on change so the displayed credits always match what will be charged. The quote/run APIs already accept this shape (Phase 6) — this is wiring the UI to an existing contract.

- [ ] **Step 1: E2E first** — a template with a declared image input shows an upload control; uploading and running produces a run whose step 1 receives the uploaded URL; changing a numeric input (e.g. duration) updates the displayed quote *before* running, and the charged amount matches the displayed quote.
- [ ] **Step 2: Implement.** Reuse `src/components/studio/kit/` and `src/components/states/`. Then flip `real-estate-listing-pack` to published in the seed **only if** its graph can now genuinely succeed with user-supplied images — if it cannot, leave it draft and say so.
- [ ] **Step 3: Gates + e2e + commit** — `feat: per-step template inputs with live re-quoting`

### Task B2: Browser matrix

**Files:** `playwright.config.mjs`; whatever the failures force; `docs/runbook-e2e.md`

- [ ] **Step 1: Add `firefox` and `webkit` projects** to the Playwright config, reusing the same setup project and storage states.
- [ ] **Step 2: Run the full suite on all three.** Record the per-browser pass/fail before fixing anything.
- [ ] **Step 3: Fix genuine cross-browser product bugs.** If a failure is a *test* artifact (timing, a chromium-only selector), fix the test and say so. If it is a real product bug in Firefox or WebKit, fix the product. Do not skip a browser to make the suite green — a skipped project must be justified in the report.
- [ ] **Step 4: Gates + commit** — `test: firefox and webkit browser matrix`

### Task B3: Execute an OWASP ZAP baseline scan

**Files:** create `docs/runbook-security-scan.md`, `scripts/security-scan.sh`

- [ ] **Step 1: Run it for real.** Build and start the app against the test database, then run the ZAP baseline image against it in Docker (`docker run --rm --network host -v "$PWD:/zap/wrk" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://localhost:<port> -r zap-report.html`; adjust networking as needed on this machine). Capture the real findings.
- [ ] **Step 2: Triage every finding** into: genuine (fix it), false positive (say why), or accepted-with-reason. Fix the genuine ones — most likely candidates are missing headers on specific routes or cookie attributes.
- [ ] **Step 3: Write `docs/runbook-security-scan.md`** with the exact command, how to interpret output, and the current triaged findings table.
- [ ] **Step 4: Gates + commit** — `test: owasp zap baseline scan with triaged findings`
- **Note:** this scans an unauthenticated local instance. It does **not** satisfy the contract's *authenticated* scan against staging — say so plainly; Gate C stays BLOCKED on the authenticated scan.

---

## Deliberately NOT in this plan (needs the owner)

- **Stripe test-clock flows** — needs the owner's Stripe test-mode account.
- **VoiceOver/NVDA passes and 200%/400% zoom on real devices** — needs a human operator.
- **A priced audio model** — the Alibaba catalog contains *no* audio-output models (verified: `alibaba-catalog.js` has audio only as a video *flag*). Closing this needs a provider decision, not code. `music-visualizer-pack` and `podcast-clip-factory` stay visuals-only until then.
- **Production rollback rehearsal** — requires taking production down deliberately; the owner should schedule it.

## Self-Review
1. **Coverage:** RELEASE_STATUS blockers addressed — backup/restore (A1), alerting/paging (A2), authenticated-scan *partial* (B3, honestly scoped), browser matrix (B2), per-step inputs + real-estate template (B1). Remaining blockers are the four listed above, each attributed to a specific owner action.
2. **Placeholders:** B2 Step 2 and B3 Step 1 require running something whose output cannot be known in advance — that is the point of both tasks. No TBDs.
3. **Type consistency:** `evaluateAlerts`/`deliverAlerts`, `buildBackupPath`/`assertRestoreTargetAllowed`/`prunableFiles` used identically across their tasks; `inputs[stepId][field]` matches the Phase 6 API contract exactly.
