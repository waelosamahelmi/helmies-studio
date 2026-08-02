# Phase 7 — Observability, Admin Operations & Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make production failures visible before users report them, give the operator the controls the contract requires, and produce an honest `RELEASE_STATUS.md` with PASS/FAIL per gate.

**Architecture:** A structured logger replaces scattered `console.*` and stamps request/user/job/generation ids. An admin-only metrics endpoint aggregates the business and health numbers the contract names. Operator controls (maintenance mode, provider kill switch, reconciliation view, job explorer) build on existing `FeatureFlag`/`ProviderConfig`/`GenerationJob` tables. The release status document is compiled from real command output, not assertions.

**Tech Stack:** unchanged. No new dependencies.

## Global Constraints

- Branch `feat/phase7-observability` off `main`. **Do not touch** `src/lib/templates.js`, `src/lib/template-*`, `src/app/api/templates/*`, `src/app/templates/*`, `scripts/seed-templates.mjs`, or `prisma` template models — Phase 6 owns those and runs concurrently. If a metric needs template data, read it with a plain Prisma query; do not import Phase 6 modules.
- Landing page off-limits except attribute/contrast a11y fixes (standing rule).
- NEVER prisma migrate/db push against `.env` DATABASE_URL. Test DB only.
- **Never log secrets, prompts, or media.** The contract forbids logging user-sensitive prompt content by default; log ids and lengths, not content.
- New admin routes must be registered in `security/route-manifest.json` with `originCheck: true` (CI enforces this) and use `requireAdminUser`/`authzResponse`.
- Gates each task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; integration where DB is touched.
- Commit convention + standard footers as prior phases.

---

### Task 1: Structured logging

**Files:** `src/lib/log.js`; convert the highest-value call sites; tests `tests/unit/log.test.mjs`

**Interfaces:**
- `log.info(event, fields)`, `log.warn(...)`, `log.error(event, fields)` → one JSON line per call: `{ ts, level, event, ...fields }`. `event` is a stable snake_case string (e.g. `generation_settled`).
- `redact(fields)` strips any key matching `/key|secret|token|password|authorization/i` and truncates `prompt` to a length marker (`promptChars: N`, never the text). Applied automatically inside every log call.
- Convert the money- and job-critical sites only (do NOT sweep all 29 blindly): `src/lib/wallet.js`, `src/lib/job-runner.js`, `src/lib/job-queue.js`, `scripts/worker.mjs`, `src/lib/generation-webhook.js`, `src/app/api/stripe/webhook/route.js`. Keep each existing message's meaning; add ids (`userId`, `generationId`, `jobId`, `stripeEventId`) where the surrounding scope has them.

- [ ] **Step 1: Failing tests** — a log line is valid JSON with ts/level/event; a field named `apiKey`/`secret`/`authorization` never appears in output; a `prompt` field is replaced by `promptChars` and the text never appears; `log.error` includes an `err` message but not a full stack in production mode.
- [ ] **Step 2–3: Run, implement, convert the six files. Step 4: Gates + commit** — `feat: structured logging with automatic redaction`

---

### Task 2: Metrics endpoint

**Files:** `src/lib/metrics.js`; `src/app/api/admin/metrics/route.js`; `security/route-manifest.json`; tests `tests/unit/metrics.test.mjs`, `tests/integration/metrics.int.test.mjs`

**Interfaces:**
- `collectMetrics({ sinceHours = 24 })` → `{ generations: {total, succeeded, failed, successRate}, jobs: {queued, running, dead, oldestQueuedAgeSec}, credits: {granted, spent, refunded}, revenue: {topupCents, subscriptionCents}, providers: [{name, attempts, failures}], reconciliation: {walletsChecked, drifted}, webhooks: {stripeEventsProcessed}, users: {signups} }`.
- `GET /api/admin/metrics` (auth: admin) returns it. **`oldestQueuedAgeSec` is the worker-liveness signal** the Phase 4A review asked for — if the worker is down, this grows without bound.
- Reconciliation numbers come from the existing `src/lib/reconciliation.js` (`reconcileAll` or equivalent — read it and reuse; do not reimplement the invariant).

- [ ] **Step 1: Failing tests** — each aggregate is computed from seeded rows (integration, real DB); `successRate` handles zero-generations without dividing by zero; a non-admin gets 403; `oldestQueuedAgeSec` is null when nothing is queued and grows with a stale queued job.
- [ ] **Step 2–3: Run, implement. Step 4: Gates + integration + commit** — `feat: admin metrics endpoint with worker-liveness signal`

---

### Task 3: Operator controls — maintenance mode and provider kill switch

**Files:** `src/lib/ops-flags.js`; `middleware.js`; `src/app/api/admin/ops/route.js`; `src/lib/providers.js` (kill-switch check only); `security/route-manifest.json`; tests `tests/unit/ops-flags.test.mjs`, `tests/integration/ops-flags.int.test.mjs`

**Interfaces:**
- Backed by the existing `FeatureFlag` table. `isMaintenanceMode()`, `setMaintenanceMode(on, adminId)`, `isProviderDisabled(name)`, `setProviderDisabled(name, disabled, adminId)` from `@/lib/ops-flags`. Every setter writes an `AuditLog` row with the admin id and reason.
- **Maintenance mode**: `middleware.js` returns a 503 maintenance page for `/studio/*` and state-changing `/api/*` **while always allowing** `/api/health`, `/api/admin/*`, `/api/cron/*`, `/api/webhooks/*`, and `/api/stripe/webhook` (a maintenance window must not lose provider callbacks or Stripe events). Read `middleware.js` first — it currently only matches `/admin`, `/studio`, `/settings`; extend the matcher deliberately and keep the existing auth redirects intact.
- **Provider kill switch**: `resolveProviderWithFallback` filters out disabled providers (it already filters on `getProviderActivity()` — extend that path, don't add a second mechanism). If every provider for a model is disabled, generation submission fails fast with a clear message rather than hanging.
- `GET/POST /api/admin/ops` (admin, origin-checked) reads and sets both.

- [ ] **Step 1: Failing tests** — maintenance on: `/studio` gets 503, `/api/webhooks/generation-complete` and `/api/stripe/webhook` still reach their handler, `/api/admin/ops` still works (so you can turn it back off); kill switch: a disabled provider is absent from the resolved chain, and all-disabled produces a clear error; both setters write an audit row.
- [ ] **Step 2–3: Run, implement. Step 4: Gates + integration + commit** — `feat: maintenance mode and provider kill switch`

---

### Task 4: Admin operations views

**Files:** `src/components/admin/OpsPanel.js`, `src/components/admin/MetricsPanel.js`, wire into `src/components/admin/AdminShell.js`; `tests/e2e/admin-ops.spec.mjs`

**Interfaces:** consumes `GET /api/admin/metrics` and `GET|POST /api/admin/ops`. Panels show: the metric groups from Task 2 with the worker-liveness age prominent; maintenance toggle and per-provider disable toggles, each requiring a typed confirmation for the destructive direction (turning maintenance ON, disabling a provider) and capturing a reason that lands in the audit row.

- [ ] **Step 1: E2E first** (admin storage state already exists from Phase 5) — an admin sees metrics; toggling maintenance ON requires the typed confirmation and then `/studio` returns 503 for a normal user; toggling OFF restores it. Reuse `src/components/states/` for loading/error.
- [ ] **Step 2–3: Implement, run. Step 4: Gates + e2e + commit** — `feat: admin operations and metrics panels`

---

### Task 5: Runbooks, alert thresholds, and an honest RELEASE_STATUS.md

**Files:** `docs/runbook-ops.md`, `docs/incident-response.md`, `docs/data-retention.md`, `docs/release-checklist.md`, `RELEASE_STATUS.md`

- [ ] **Step 1: Write the runbooks** — `runbook-ops.md`: maintenance mode, provider kill switch, worker down (symptom: `oldestQueuedAgeSec` climbing), stuck jobs, reconciliation drift, and the fact that the automation systemd timer is the money safety net. `incident-response.md`: severity levels, who to page, the first five commands to run. `data-retention.md`: what is stored, for how long, what the retention sweeps actually delete today, and what is not yet implemented (media retention, user export/deletion). `release-checklist.md`: the ordered pre-merge/pre-deploy checks this project actually uses.
- [ ] **Step 2: Alert thresholds** — document the numeric thresholds for the contract's alert list (payment webhook failures, settlement mismatch, provider cost spike, queue backlog via `oldestQueuedAgeSec`, error-rate spike, auth failure spike, backup failure) and state plainly which are **implemented as metrics** versus **documented only** (no paging system is configured — say so).
- [ ] **Step 3: `RELEASE_STATUS.md`** — a row per contract gate (A–F) with **PASS / FAIL / BLOCKED** and the evidence command for each. Every claim must be backed by output you actually produced. Anything unverifiable in this environment (live Stripe test-clock flows, ZAP authenticated scan, real-device browser matrix, screen-reader passes, backup/restore rehearsal) is **BLOCKED**, never PASS. Include the one-command instruction to run each blocked item.
- [ ] **Step 4: Gates + commit** — `docs: operations runbooks, alert thresholds and release status`

---

### Task 6: Phase gate + PR

- [ ] Full gates + integration + e2e; landing diff empty; push; CI green; PR with Risk **Medium** and the deploy runbook (no migration expected unless Task 3 added one; restart app + worker; verify `/api/admin/metrics` and that maintenance mode can be toggled on and back off).

---

## Self-Review
1. **Coverage vs contract §10/§13/§14/§15:** structured logs with ids and redaction → T1; metrics list → T2; graceful degradation controls (provider kill switch, maintenance mode) → T3; admin operator surface → T4; runbooks/incident/retention/checklist → T5; release gates PASS/FAIL/BLOCKED → T5. **Deferred/blocked, stated explicitly in RELEASE_STATUS.md:** distributed tracing, a real alerting/paging integration, ZAP scan, Stripe test clocks, backup/restore rehearsal, browser matrix, screen-reader passes.
2. **Placeholders:** T5 requires real command output — by construction it cannot be written in advance, and fabricating a PASS is the specific failure mode called out. No TBDs.
3. **Type consistency:** `collectMetrics`, `isMaintenanceMode`/`setMaintenanceMode`, `isProviderDisabled`/`setProviderDisabled`, `log.info/warn/error` used identically across tasks.
