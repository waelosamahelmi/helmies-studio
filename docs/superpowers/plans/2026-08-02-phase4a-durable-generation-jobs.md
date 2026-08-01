# Phase 4A — Durable Generation Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every generation a durable, resumable job with a terminal timeout, so a provider or webhook failure can never leave a user charged with a generation stuck `pending` forever.

**Architecture:** A `GenerationJob` row per submission, claimed by a separate PM2 worker process using a single atomic `UPDATE … FOR UPDATE SKIP LOCKED` statement (no new infrastructure — Postgres is the queue). The worker submits to the provider, polls, ingests output, and drives the generation to a terminal state; leases + heartbeats make worker crashes recoverable, and a `timeoutAt` guarantees every job ends — releasing or refunding credits. HTTP submit becomes enqueue-only and returns immediately.

**Tech Stack:** unchanged — Next.js 16, Prisma 7 + PostgreSQL, PM2, Vitest (unit + integration). **No new npm dependencies.**

## Global Constraints

- Branch `feat/phase4a-durable-jobs` off `main`. Landing page (`src/components/landing/*`, `src/app/page.js`) untouched.
- **NEVER run prisma migrate/db push against the `.env` DATABASE_URL** (production). Migrations authored offline; applied only to `TEST_DATABASE_URL` (`postgresql://postgres:test@localhost:55432/test`, container `helmies-test-pg` — `docker start helmies-test-pg`, or create per the Phase 3 ledger). Never print `.env` values.
- Gates after every task: `npm run lint` (0 warnings), `npm run typecheck`, `npm test`, `npm run build`; plus `npm run test:integration` for any task touching DB behavior.
- **Money invariants from Phases 2–3 are binding and must not regress:** every balance move inside a transaction with a ledger row; reserve → settle-or-release exactly once; refunds are new ledger entries. `npm run reconcile` must report 0 drifted wallets in the integration suite after any job lifecycle test.
- **Backward compatibility is required — this deploys to a live service.** In-flight generations created by the old code path (rows with `status:"pending"` and a `requestId` but no `GenerationJob`) must still complete or be reconciled; the client's existing poll contract (`GET /api/generations/status?id=` returning `{status, outputUrl, error, ...}`) must not change shape.
- Commit convention as prior phases (`feat:`/`fix:`/`test:`/`chore:` + standard footers).
- Security invariants from Phase 3 hold: new state-changing routes must be registered in `security/route-manifest.json` (the CI test enforces `originCheck` for user/admin state-changers) and use `authzResponse`.

## Current behavior being replaced (verified 2026-08-02)

`POST /api/generate/async` today: creates `Generation(pending)` → `reserveCredits` → `submitOnly` (inline HTTP to provider) → **settles the reservation immediately on submit success** → returns a poll URL. Completion arrives only via `POST /api/webhooks/generation-complete`, which marks completed or marks failed + refunds.

The gap: after submit, the reservation is already settled, so `sweepExpiredReservations` (Phase 3) has nothing to release. If the webhook never arrives — provider outage, dropped callback, bad secret — the user stays charged and the generation stays `pending` forever. Nothing polls it. This plan closes that.

## File Structure

```
prisma/schema.prisma                       (GenerationJob model + Generation.jobId backlink)
prisma/migrations/<ts>_generation_jobs/    (table + indexes)
src/lib/job-queue.js                       (new: enqueue/claim/heartbeat/complete/fail/reap/timeout — pure queue mechanics, no provider knowledge)
src/lib/job-runner.js                      (new: executes one claimed job — provider submit/poll, ingest, terminal transitions + credit settlement)
scripts/worker.mjs                         (new: PM2 worker loop calling claim → run → repeat)
ecosystem.config.cjs                       (new: PM2 config declaring both app and worker)
src/app/api/generate/async/route.js        (enqueue-only; no inline provider call)
src/app/api/generations/status/route.js    (expose job progress fields, same response shape + additive keys)
src/lib/generation-webhook.js              (webhook completes the JOB, not just the generation)
src/lib/automation.js                      (add job reaping + timeout sweep to runAutomation)
security/route-manifest.json               (register any changed route metadata)
scripts/deploy.sh                          (start/reload the worker process)
tests/unit/job-queue.test.mjs, tests/unit/job-runner.test.mjs
tests/integration/job-lifecycle.int.test.mjs, tests/integration/job-claim-concurrency.int.test.mjs
docs/runbook-jobs.md                       (ops: worker down, stuck jobs, manual retry)
```

---

### Task 1: `GenerationJob` schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260802100000_generation_jobs/migration.sql`

**Interfaces:**
- Produces the model every later task consumes:

```prisma
model GenerationJob {
  id                String    @id @default(cuid())
  generationId      String    @unique
  userId            String
  status            String    @default("queued")   // queued|running|succeeded|failed|dead
  idempotencyKey    String    @unique
  attempts          Int       @default(0)
  maxAttempts       Int       @default(3)
  nextRunAt         DateTime  @default(now())
  leaseUntil        DateTime?
  lockedBy          String?
  providerRequestId String?
  providerName      String?
  endpoint          String?
  payload           Json
  timeoutAt         DateTime
  lastError         String?   @db.Text
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([status, nextRunAt])
  @@index([status, leaseUntil])
  @@index([timeoutAt])
  @@schema("public")
}
```

Status vocabulary (normative for all later tasks): `queued` (claimable), `running` (leased by a worker), `succeeded`/`failed` (terminal, credits settled/refunded), `dead` (terminal after `maxAttempts` or timeout — credits refunded).

- [ ] **Step 1: Add the model to `prisma/schema.prisma`** exactly as above (place it after the `Generation` model).
- [ ] **Step 2: Author the migration offline.** Try `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`; if it demands a shadow DB, hand-write it following `prisma/migrations/20260801130000_anon_rate_limit/migration.sql`'s style. The SQL must create the table plus the three indexes and the two unique constraints.
- [ ] **Step 3: Apply to the TEST database only and verify**

```bash
docker start helmies-test-pg
DATABASE_URL="postgresql://postgres:test@localhost:55432/test" npx prisma migrate deploy
npx prisma validate
```

- [ ] **Step 4: `npx prisma generate`, then gates** (`npm run lint && npm run typecheck && npm test && npm run build`).
- [ ] **Step 5: Commit**

```bash
git add prisma && git commit -m "feat: generation job table for the durable queue"
```

---

### Task 2: Queue mechanics (`src/lib/job-queue.js`)

**Files:**
- Create: `src/lib/job-queue.js`
- Test: `tests/unit/job-queue.test.mjs`, `tests/integration/job-claim-concurrency.int.test.mjs`

**Interfaces (all exported from `@/lib/job-queue`; later tasks depend on these exact signatures):**
- `enqueueJob({ generationId, userId, idempotencyKey, payload, providerName, endpoint, timeoutMs = 30*60*1000 }, db?)` → the created job, or the EXISTING job when `idempotencyKey` collides (never throws on duplicate — this is the double-submit guard).
- `claimNextJob(workerId, { leaseMs = 5*60*1000 })` → one job now `running` with `leaseUntil = now + leaseMs`, `lockedBy = workerId`, `attempts` incremented — or `null` when nothing is claimable. **Must be a single atomic statement** (see Step 3) so two workers can never claim the same row.
- `heartbeatJob(jobId, workerId, { leaseMs = 5*60*1000 })` → extends `leaseUntil`; returns false if the worker no longer owns the lease.
- `completeJob(jobId, { providerRequestId })` → status `succeeded`, clears lease.
- `failJob(jobId, errorMessage, { retryable })` → if `retryable` and `attempts < maxAttempts`: back to `queued` with exponential `nextRunAt` (`now + 2^attempts * 30s`, capped 15 min); else `dead`. Returns `{ status, willRetry }`.
- `reapExpiredLeases()` → rows `running` with `leaseUntil < now` go back to `queued` (crashed worker recovery). Returns count.
- `findTimedOutJobs()` → non-terminal rows with `timeoutAt < now`. Returns the rows (the RUNNER decides money; the queue never touches credits).

**This module must contain no provider or credit logic** — pure state machine.

- [ ] **Step 1: Write the failing unit tests** (mock `@/lib/prisma`): enqueue returns the existing row on duplicate `idempotencyKey` (simulate P2002 → findUnique); `failJob` retryable under max → `queued` with a future `nextRunAt` and `willRetry:true`; at max → `dead`, `willRetry:false`; `heartbeatJob` returns false when `lockedBy` differs (assert the updateMany where-clause includes `lockedBy: workerId`).
- [ ] **Step 2: Run to verify they fail** — `npx vitest run tests/unit/job-queue.test.mjs`.
- [ ] **Step 3: Implement.** `claimNextJob` MUST use one statement — Prisma's query builder cannot express `SKIP LOCKED`, so use `$queryRaw`:

```js
const rows = await prisma.$queryRaw`
  UPDATE "GenerationJob" SET
    "status" = 'running',
    "lockedBy" = ${workerId},
    "leaseUntil" = ${new Date(Date.now() + leaseMs)},
    "attempts" = "attempts" + 1,
    "updatedAt" = NOW()
  WHERE "id" = (
    SELECT "id" FROM "GenerationJob"
    WHERE "status" = 'queued' AND "nextRunAt" <= NOW()
    ORDER BY "nextRunAt" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING *`;
return rows[0] ?? null;
```

- [ ] **Step 4: Write the concurrency integration test** — the load-bearing proof:

```js
// tests/integration/job-claim-concurrency.int.test.mjs
it("never hands the same job to two workers", async () => {
  // enqueue exactly 5 jobs, then fire 20 concurrent claimNextJob calls
  const claims = await Promise.all(
    Array.from({ length: 20 }, (_, i) => claimNextJob(`worker-${i}`, {}))
  );
  const got = claims.filter(Boolean);
  expect(got).toHaveLength(5);                                   // no over-claim
  expect(new Set(got.map((j) => j.id)).size).toBe(5);            // no duplicate ids
});
```

Assert on the **claim results**, never on a stored counter (the Phase 3 rate-limit bug hid exactly there).
- [ ] **Step 5: Run both suites, then gates, then commit**

```bash
npx vitest run tests/unit/job-queue.test.mjs
TEST_DATABASE_URL="postgresql://postgres:test@localhost:55432/test" npm run test:integration
git add -A && git commit -m "feat: postgres-backed job queue with atomic skip-locked claims"
```

---

### Task 3: Job runner (`src/lib/job-runner.js`) — money-terminal guarantees

**Files:**
- Create: `src/lib/job-runner.js`
- Test: `tests/unit/job-runner.test.mjs`

**Interfaces:**
- Consumes from `@/lib/job-queue`: `heartbeatJob`, `completeJob`, `failJob`. From `@/lib/wallet`: `settleReservation`, `releaseReservation`. From `@/lib/providers`: `submitOnly`, `pollProviderResult`, `getProvider`. From `@/lib/media-download` / `@/lib/media-storage`: the existing ingest helper the webhook uses (read `src/lib/generation-webhook.js` to find the exact export and reuse it — do not write a second downloader).
- Produces: `runJob(job, { workerId, signal })` → `{ outcome: "succeeded"|"failed"|"retry" }`.

**Normative money rules for this task — a reviewer will check each:**
1. The reservation is settled **only when output is ingested and the generation is marked `completed`** (this is the change from today's settle-on-submit).
2. Any terminal failure (`failed` or `dead`) releases the reservation if still active, or refunds if already settled — use `releaseReservation` first; if it throws "No active reservation found", call `refundCredits(userId, job.payload.creditsUsed ?? generation.creditsUsed, generation.id, "Generation failed")`. Never both.
3. Every credit call is wrapped so a credit failure logs loudly (userId, generationId, amount) and does not mask the original provider error — mirror the crash-net pattern in `src/lib/director-executor.js`.
4. A job whose generation is ALREADY terminal (`completed`/`failed`) makes no credit move — it just completes the job (webhook won the race).

- [ ] **Step 1: Write the failing unit tests** (mock prisma, providers, wallet, ingest): happy path → ingest called, generation `completed`, `settleReservation` called once, `completeJob` called; provider throws a retryable error (5xx/timeout wording) → `failJob(..., {retryable:true})` and NO credit movement; provider throws a terminal error → generation `failed` + release-or-refund exactly once; generation already `completed` when the job runs → `completeJob` called and zero credit calls; long poll → `heartbeatJob` called at least once.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Structure: submit (if no `providerRequestId` yet) → persist `providerRequestId` via `completeJob`'s sibling update so a retry resumes instead of re-submitting → poll with a heartbeat callback → ingest → terminal transition. Classify errors: network/5xx/timeout ⇒ retryable; 4xx/validation/branded provider rejection ⇒ terminal.
- [ ] **Step 4: Gates + commit** — `feat: job runner settles credits only on ingested output`

---

### Task 4: Worker process + PM2

**Files:**
- Create: `scripts/worker.mjs`, `ecosystem.config.cjs`
- Modify: `scripts/deploy.sh`, `package.json` (script `"worker": "node scripts/worker.mjs"`)
- Create: `docs/runbook-jobs.md`

**Interfaces:**
- Consumes `claimNextJob`, `reapExpiredLeases` from `@/lib/job-queue` and `runJob` from `@/lib/job-runner`. Note both are `@/`-aliased app modules — a plain `node` script can't resolve that alias, and `src/lib/wallet.js` uses an extensionless `./prisma` import that breaks under plain node (documented during Phase 2 Task 12). **Verify how the worker must import these before writing it** — the simplest working approach in this repo is relative paths with explicit `.js` extensions from `scripts/`; if a transitive extensionless import still breaks, add the `.js` extension at that import site (a one-word change, note it in the report).
- Produces: a loop — claim → run → repeat; empty claim sleeps 2s; `reapExpiredLeases()` every 60s; graceful shutdown on SIGTERM (stop claiming, finish the in-flight job, exit ≤ 30s); `WORKER_ID = ${hostname}-${pid}`; `WORKER_CONCURRENCY` env (default 2) via N parallel loops.

- [ ] **Step 1: Write `ecosystem.config.cjs`** declaring both processes so PM2 owns them together:

```js
module.exports = {
  apps: [
    { name: "helmies-studio", script: "npm", args: "start -- -p 3010", env: { NODE_ENV: "production" } },
    { name: "helmies-worker", script: "scripts/worker.mjs", env: { NODE_ENV: "production" },
      max_restarts: 20, restart_delay: 5000 },
  ],
};
```

Confirm the existing app process's start command with `pm2 describe helmies-studio` semantics in mind — the app entry must match how it runs today (`npm start -- -p 3010`).
- [ ] **Step 2: Write `scripts/worker.mjs`** per the interface above. It must log one line per claimed job (`jobId`, `generationId`, outcome, duration) and never crash the process on a single job error (catch, `failJob`, continue).
- [ ] **Step 3: Prove it works against the test DB** — enqueue a job whose provider call is stubbed (set `payload._testMode` handling ONLY if the runner already supports a seam; otherwise run the worker against a job that will fail terminally and assert the DB reaches `dead` with credits released). Record the actual command and output in the report.
- [ ] **Step 4: Update `scripts/deploy.sh`** to `pm2 startOrReload ecosystem.config.cjs --update-env` instead of restarting only the app, and write `docs/runbook-jobs.md` covering: worker down (symptom: jobs stuck `queued`, `pm2 logs helmies-worker`), stuck `running` job (lease reaping explains recovery), manual retry (set `status='queued', nextRunAt=NOW()`), and how to drain before a deploy.
- [ ] **Step 5: Gates + commit** — `feat: pm2 worker process drains the generation queue`

---

### Task 5: Submit route enqueues instead of calling the provider

**Files:**
- Modify: `src/app/api/generate/async/route.js`
- Modify: `security/route-manifest.json` (notes only — the route stays `user`/state-changing/origin-checked)
- Test: `tests/unit/generate-async-enqueue.test.mjs`

**Interfaces:**
- Consumes `enqueueJob` from `@/lib/job-queue`.
- Produces: the SAME response shape as today plus `jobId` — `{ success, generationId, jobId, status: "queued", creditsUsed, remainingCredits, pollUrl }`. The client (`src/components/studio/useAsyncGeneration.js`) polls `pollUrl` and branches on `status === "completed"` / `"failed"`; `"queued"` must fall through its default "still working" branch exactly like today's `"pending"` — **read that hook before changing the status string and keep it satisfied** (safest: keep `Generation.status` values unchanged and let the JOB carry `queued`).
- Idempotency key: `sha256(userId + ":" + model + ":" + JSON.stringify(sortedParams) + ":" + minuteBucket)` where `minuteBucket = Math.floor(Date.now()/60000)` — a double-clicked submit within the same minute returns the FIRST job instead of creating a second charge. State this window in the code comment.

**Money-flow change:** reserve stays; the settle moves to the runner (Task 3). This route now ends at `enqueueJob` with the reservation still ACTIVE.

- [ ] **Step 1: Failing tests** — enqueue called with the server-resolved endpoint/model (never `body.endpoint`); reservation reserved but NOT settled in the route; duplicate submit within the minute returns the same `jobId` and reserves only once; enqueue failure releases the reservation and returns 500.
- [ ] **Step 2: Run to verify failure. Step 3: Implement** — delete the inline `submitOnly`/settle block, add enqueue + the duplicate-safe path.
- [ ] **Step 4: Gates + commit** — `feat: async generation submits enqueue a durable job`

---

### Task 6: Webhook and status route become job-aware

**Files:**
- Modify: `src/lib/generation-webhook.js`, `src/app/api/generations/status/route.js`
- Test: extend `tests/unit/generation-webhook.test.mjs`; add `tests/unit/generations-status.test.mjs`

**Interfaces:**
- Webhook: on provider completion it now ALSO terminates the job (`completeJob`) and performs the settle if the runner hasn't (the webhook may win the race). Exactly-once is preserved by the existing conditional generation transition — extend the same transaction to cover the job row. On failure it marks the job `dead` and releases/refunds as today.
- Status route: response gains additive keys only — `{ ...existing, jobStatus, attempts, queuedAt }` (null when no job row exists, i.e. legacy generations). No existing key changes type or disappears.

- [ ] **Step 1: Failing tests** — webhook success on a job-backed generation → job `succeeded` and settle happens exactly once even if the runner already settled (assert no double settle); webhook failure → job `dead` + single refund; status route returns the additive keys, and returns them as `null` for a generation with no job.
- [ ] **Step 2: Run to verify failure. Step 3: Implement.**
- [ ] **Step 4: Gates + commit** — `feat: webhook and status endpoints understand durable jobs`

---

### Task 7: Terminal timeout sweep — the risk this phase exists to close

**Files:**
- Modify: `src/lib/automation.js` (`runAutomation`), `src/lib/job-runner.js` (export the terminal helper)
- Test: `tests/unit/automation-jobs.test.mjs`, `tests/integration/job-lifecycle.int.test.mjs`

**Interfaces:**
- Produces `sweepTimedOutJobs()` (export from `@/lib/job-runner`): for each row from `findTimedOutJobs()` — mark job `dead`, mark its generation `failed` with error `"Timed out waiting for the provider"`, and release-or-refund exactly once (same rules as Task 3). Returns `{ timedOut, refunded }`.
- `runAutomation` gains a fourth leg, `jobs: { reaped, timedOut, refunded }`, using the SAME `Promise.allSettled` per-leg isolation the hotfix established — one failing leg must not suppress the others.

- [ ] **Step 1: Failing tests** — a job past `timeoutAt` with an active reservation → released, generation `failed`, job `dead`; a job past `timeoutAt` whose reservation was already settled → refunded exactly once; a job NOT past timeout → untouched; `runAutomation` returns all four legs when one rejects.
- [ ] **Step 2: Integration test — the end-to-end proof.** Enqueue a job with `timeoutAt` in the past and an active reservation; run the sweep; assert wallet `available` is fully restored, exactly one release/refund ledger row exists, generation is `failed`, job is `dead`; then run `reconcileWallet(userId)` and assert `ok: true`. This is the assertion that proves the stranding risk is closed.
- [ ] **Step 3: Implement. Step 4: Gates + integration + commit** — `feat: timed-out jobs always end and always return the user's credits`

---

### Task 8: Migrate in-flight legacy generations

**Files:**
- Create: `scripts/adopt-legacy-generations.mjs`
- Test: `tests/integration/legacy-adoption.int.test.mjs`

**Interfaces:**
- Produces a one-shot, idempotent, re-runnable script: for every `Generation` with `status IN ('pending','processing')` and no `GenerationJob`, either (a) create a job in `running` state carrying its existing `requestId` so the worker resumes polling, when `requestId` is present; or (b) mark it `failed` with `"Interrupted by a deployment"` and release-or-refund, when it has no `requestId` (nothing to resume). Prints a dry-run table by default; `--apply --yes` performs it.
- Reason this exists: the deploy replaces the settle-on-submit path, and rows created by the old code have no job to drive them.

- [ ] **Step 1: Failing integration test** — seed one legacy pending generation WITH a requestId and one WITHOUT; run the script's exported function in apply mode; assert the first gets a `running` job with that `providerRequestId` and no credit movement, and the second is `failed` with credits returned and reconciliation clean.
- [ ] **Step 2: Implement (dry-run default, `--apply --yes` guard, prints userId not email).**
- [ ] **Step 3: Gates + integration + commit** — `feat: adopt in-flight generations into the durable queue`

---

### Task 9: Phase gate — suites, CI, PR

- [ ] **Step 1:** Full gates + integration locally; `npm run reconcile` against the test DB reports 0 drifted.
- [ ] **Step 2:** `git diff main --stat -- src/components/landing src/app/page.js` → empty.
- [ ] **Step 3:** Push; CI green (the `migrations` job applies the new migration and runs the integration suite).
- [ ] **Step 4:** PR with **Risk level: High** and this deploy runbook:
  1. `git pull`, `npm ci`, `npx prisma generate`, **build**, then `npx prisma migrate deploy` (build-before-migrate, per the Phase 3 lesson).
  2. `pm2 startOrReload ecosystem.config.cjs --update-env` — starts `helmies-worker` alongside the app for the first time.
  3. `pm2 logs helmies-worker --lines 30` — confirm it claims or idles cleanly.
  4. `node scripts/adopt-legacy-generations.mjs` (dry run) → review → `--apply --yes`.
  5. Submit one real generation end-to-end; confirm it completes and `npm run reconcile` stays at 0 drifted.
  6. Rollback note: reverting code leaves the `GenerationJob` table harmless; the worker must be stopped (`pm2 delete helmies-worker`) if rolling back, or it will claim jobs the old code never creates.

---

## Self-Review (done at authoring time)

1. **Spec coverage** (contract §2.3 durable jobs): job creation ✅ T1/T5; idempotency key ✅ T5; retries with bounded backoff ✅ T2; provider timeout ✅ T7; webhook completion ✅ T6; polling fallback ✅ T3 (runner polls); dead-letter ✅ T2 (`dead`); lease/heartbeat ✅ T2/T3; worker crash recovery ✅ T2 `reapExpiredLeases` + T4; concurrency limits ✅ T4 (`WORKER_CONCURRENCY`); progress events ✅ T6 (status route additive keys); output ingestion ✅ T3; reservation settlement ✅ T3/T7. **Deliberately deferred to 4B/later:** per-plan queue priority, per-provider concurrency caps, alerting (§2.3's last items) — they need the object-storage and observability work; state this in the PR.
2. **Placeholder scan:** T3 and T4 contain "read the existing module to find the exact export/import form" steps — real unknowns (the ingest helper's name; the extensionless-import behavior under plain node), each naming the exact file to read and the fixed contract required. No TBDs.
3. **Type consistency:** status vocabulary (`queued|running|succeeded|failed|dead`) fixed in T1 and used identically in T2–T8; `claimNextJob(workerId, opts)`, `failJob(jobId, msg, {retryable})`, `runJob(job, {workerId, signal})`, `sweepTimedOutJobs()` consistent across tasks; `enqueueJob` returns the existing row on duplicate in both T2 and T5.
