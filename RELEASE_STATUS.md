# RELEASE_STATUS

Compiled 2026-08-02 for `feat/phase7-observability`, against contract
gates A–F (`01_HELMIES_STUDIO_PRODUCTION_EXCELLENCE_AND_QA.md` §14). Every
row below is backed by a command actually run in this worktree during this
phase, cited next to the claim. **Nothing here is PASS on the basis of "it
should work" or "it's implemented so it must be fine"** — an item is PASS
only where I ran the command and read the output; everything I could not
personally verify in this environment is BLOCKED, never PASS, per the
explicit instruction this task was built around.

## Phase 8 update — backups (Task A1) and alerting (Task A2)

Compiled onward from `feat/phase8-ops` (branched from the Phase 7 state
below). Two Gate B/F blockers this document previously listed are now closed
with real, executed evidence — the rest are unchanged and stay BLOCKED for
the exact reasons already on record.

1. **Backup and restore, rehearsed for real (Gate B).** `scripts/backup-db.mjs`
   (`pg_dump --format=custom`, retention pruning, never prints the
   connection string) and `scripts/restore-db.mjs` (`--target` always
   explicit, never defaults to `DATABASE_URL`, refuses without `--yes` or
   against a production-looking host without `--allow-production`) exist
   and were rehearsed against the disposable test container
   (`postgresql://postgres:test@localhost:55432/test`) — never against
   `.env`'s `DATABASE_URL`. Exact commands and before/after row counts are
   in `docs/runbook-backup.md`.
2. **Threshold alerting with webhook delivery and dedup (Gate F).**
   `src/lib/alerts.js`'s `evaluateAlerts()` reuses Phase 7's
   `collectMetrics()` directly; `deliverAlerts()` posts to
   `ALERT_WEBHOOK_URL` when configured, a logged no-op otherwise;
   `selectDueAlerts()`/`recordAlertsFired()` dedupe per alert key against
   the existing `FeatureFlag` table. `GET /api/cron/alerts` (bearer
   `CRON_SECRET`) and `runAutomation()`'s new 6th leg both wire this
   together.

### Code review follow-up (executed-proof round, same phase)

An independent review executed adversarial tests against both A1 and A2 —
not a read-through, actual exploit attempts against a stand-in database and
a stubbed webhook — and found **three Critical** issues in
`restore-db.mjs`'s production-host guard (each proven by actually
destroying a stand-in database) plus **five Important** issues. All eight
are fixed; re-verified with fresh executed evidence, not merely re-reading
the code.

**Criticals (restore-db.mjs's guard):**

1. The guard was a bare hostname STRING compare. Proven bypass: production
   addressed as `localhost`, target as `127.0.0.1` (same machine) — the
   guard allowed it, `pg_restore` ran, 51 tables were overwritten in the
   reviewer's stand-in. Fixed: `assertRestoreTargetAllowed` now resolves
   both hosts to IP address sets — a manual legacy-IPv4 parser
   (`parseLegacyIPv4`, exported) for `127.1`/`2130706433`/`0177.0.0.1`-style
   forms (confirmed `dns.lookup` itself does NOT normalize these on this
   platform) plus a real DNS lookup for genuine hostnames — and also
   compares port and database name, so a same-host restore into a clearly
   different (scratch) database doesn't force `--allow-production` for a
   legitimate case.
2. `.env` loading was `process.cwd()`-relative; with `DATABASE_URL` unset,
   the guard silently skipped its check. Proven bypass: the identical
   `--target` invocation that was refused from the repo root restored
   successfully when run from a scratch directory — exactly what an
   operator following this runbook's own restore recipe would hit (dumps
   live in `/root/backups/db`, not the app directory). Fixed: both scripts
   now load `.env` from a path relative to the script file itself
   (`fileURLToPath(import.meta.url)`), never `process.cwd()`.
3. The guard failed OPEN on a missing/empty/unparseable `DATABASE_URL`
   ("can't tell what production is" was treated as "no conflict, proceed").
   Fixed: now fails CLOSED — refuses unless `--allow-production` is passed
   explicitly.

All three were re-executed against the real script (not just unit tests)
after the fix — every one of the bypass forms above, plus the
cwd-independence scenario, is now REFUSED; the cases that must keep passing
(a genuinely different host, a same-host different-database-name target,
`--allow-production` itself) are still ALLOWED. The full table of inputs and
results is in `docs/runbook-backup.md`'s "Security hardening" section.

**Importants:**

4. Alert dedup state was written BEFORE delivery was attempted — an
   undelivered critical (webhook 500) was marked "fired" and suppressed for
   the full 60-minute repeat window, reaching nobody. Fixed: `alerts.js`
   now splits `selectDueAlerts` (read-only) from `recordAlertsFired`
   (write-only), and callers (`GET /api/cron/alerts`, the automation leg)
   call the latter ONLY after `deliverAlerts()` reports `delivered: true`.
   Proven against real Postgres: a webhook 500 now leaves the same critical
   alert due again on the very next call
   (`tests/integration/alerts.int.test.mjs`).
5. `deliverAlerts()`'s `fetch` had no timeout — a hanging webhook would
   stall the entire `runAutomation()` cron response (including the
   money-safety legs) indefinitely. Fixed: `AbortSignal.timeout(10_000)` on
   the request.
6. `alert_state:*` `FeatureFlag` rows were visible (and writable) via
   `GET`/`POST /api/admin/flags` as if they were ordinary operator flags.
   Fixed: `GET` now excludes the `alert_state:` prefix at the query level;
   `POST` 400s if asked to write one.
7. `restore-db.mjs` exited 0 regardless of `pg_restore`'s own exit code — a
   partial restore (after `--clean --if-exists` already dropped objects)
   printed row counts and reported success. Fixed and re-verified: a
   deliberately truncated dump now produces exit code 1, matching
   `pg_restore`'s.
8. `backup-db.mjs` read the dump's byte size right after the child
   process's `"close"` event, which does not guarantee the piped
   `WriteStream` had finished flushing — a slow disk could under-report the
   size, and the (now-incorrect) `size === 0` check would delete a real,
   merely-not-yet-flushed dump; `WriteStream` also had no `"error"`
   handler. Fixed: `runPgDump` now resolves only once BOTH the child has
   closed AND the stream has emitted `"finish"`, and the stream's own
   `"error"` is handled.

The full rehearsal (seed → backup → drop/recreate → restore → verify) was
re-run after all eight fixes, against the corrected scripts — fresh numbers
are in `docs/runbook-backup.md`, not reused from before the fixes.

**Full gate sequence re-run clean after the review fixes:** `npm run lint`
(0 warnings), `npm run typecheck` (clean), `npx vitest run` → **659/659
unit** (baseline 570 + 89 new: 45 backup-args, 36 alerts, 4
api-admin-flags, plus automation-leg additions), `TEST_DATABASE_URL=
postgresql://postgres:test@localhost:55432/test npx vitest run --config
vitest.integration.config.mjs` → **90/90 integration** (baseline 85 + 5
alerts, including the Important-1 undelivered-alert proof), `npm run build`
(clean, `ƒ /api/cron/alerts` present in the route list).

Neither task touched anything under `src/components/`, `src/app/templates/`,
`tests/e2e/`, `playwright.config.mjs`, or `src/lib/template*` — Stream B's
files, worked concurrently on `feat/phase8-product`.

## Code review follow-up (post-Task-6)

An independent code review of this branch found one Critical (executable-
proven) and two Important findings, plus asked that the Gate B margin-floor
gap this document already flagged be closed rather than just documented.
All four are fixed; each is summarized here and detailed in its gate's own
section below.

1. **CRITICAL — the provider kill switch could silently reverse itself.**
   `setProviderDisabled` (`src/lib/ops-flags.js`) upserted unconditionally on
   the lowercase canonical key (`"kie"`/`"alibaba"`), but production
   `ProviderConfig` rows are seeded with display casing (`"KIE"`/`"Alibaba"`
   — `scripts/seed-providers.mjs`; Postgres string equality is
   case-sensitive), so the upsert created a **second, duplicate row**
   instead of updating the existing one. `getProviderActivity`
   (`src/lib/providers.js`) then lowercased both rows into the same key with
   whichever the (unordered) `findMany` scan visited last winning — so an
   **unrelated** update to the original row (a markup change, a catalog
   sync) could flip the effective state back to active with no operator
   action and no audit row. Fixed: `setProviderDisabled` now matches
   existing rows via a shared classifier (`classifyProviderConfigName`,
   exported from `providers.js`) and updates them in place — it only
   creates a new row when none exists for that provider at all yet — and
   `getProviderActivity` is now deterministic regardless of row order
   (any row saying `isActive:false` wins). Executed proof: seeded a
   production-cased `"KIE"` row, disabled it via the real kill switch,
   performed an unrelated update to that same row, and asserted it was
   still disabled with no duplicate row created —
   `tests/integration/ops-flags.int.test.mjs`'s new "a provider seeded with
   production casing…" test, and independently re-verified by reverting to
   the pre-fix code and confirming that exact test fails
   (`expected length 1 but got 2`) before restoring the fix.
2. **IMPORTANT — redaction was top-level only.** `redact()`
   (`src/lib/log.js`) only inspected top-level string-keyed fields — a
   nested `{req:{headers:{authorization}}}`, an array of objects containing
   `token`/`prompt`, a non-string `prompt`, differently-cased prompt keys
   (`Prompt`, `promptText`, `negative_prompt`), and a secret embedded in
   `err.message`'s free text all passed through verbatim (no active leak at
   any real call site — every one passes flat scalars today — but the
   module's own stated contract, "callers never have to sanitize," wasn't
   met). Fixed: `redact()` now recurses into nested objects/arrays (depth-
   capped), the prompt-key match is case-insensitive across the whole
   prompt family, non-string prompts are measured via their JSON length
   instead of crashing or leaking, and `err.message`/`err.stack` are scrubbed
   for secret-shaped substrings (a key/secret/token/password/authorization
   label followed by a genuinely key-shaped value, or a bearer-token shape —
   deliberately conservative so it doesn't mangle ordinary prose like
   "Authorization failed for this user"). 9 new tests in
   `tests/unit/log.test.mjs` cover every vector the review listed
   individually; writing the `err.message` test caught a second, related
   leak I hadn't anticipated — the non-production `err.stack` field embeds
   the unredacted message as its own first line (V8's default stack format),
   so `stack` needed the identical scrub, not just `message`.
3. **IMPORTANT — Gate C's redaction row reworded** to state exactly what's
   enforced now that #2 is fixed (see Gate C below).
4. **Gate B margin floor closed** (previously documented as FAIL, not
   fixed). `setModelPricing`/`setProviderMarkup`
   (`src/lib/pricing-engine.js`) now reject — never silently clamp — a
   `creditsCost` that would price a model below its recorded provider cost,
   or a `markup` below `1.0` (breakeven), reusing the existing
   `CREDIT_TO_EUR` constant (no second pricing constant invented). Applied
   at all three write paths that can set these values:
   `POST /api/admin/pricing` (calls `setModelPricing`),
   `POST /api/admin/models` (a partial-update route that upserts
   `ModelPricing` directly — floored against the row's EFFECTIVE
   post-update cost, not just this one request's body), and
   `POST /api/admin/providers` (upserts `ProviderConfig.markup` directly,
   never through `setProviderMarkup` — the review named the first two
   files explicitly; I found this third route has the identical gap and
   closed it too, reusing the same exported assertion functions rather than
   duplicating the check).

**Re-verification after all four fixes:** `origin/main` fetched and merged
(no-op — main has not moved since this branch forked; Phase 6 lives on the
unmerged `feat/phase6-templates` branch, nothing to integrate yet).
Full gate sequence re-run clean: `npm run lint` (0 warnings), `npm run
typecheck` (clean), `npx vitest run` → **503/503 unit**,
`TEST_DATABASE_URL=... npx vitest run --config vitest.integration.config.mjs`
→ **70/70 integration**, `npm run build` (clean), and
`npx playwright test --workers=1` → **26/26 e2e**, zero failures — confirming
the intermittent flakiness seen earlier under the default 3-worker run was
genuinely environmental (concurrent-agent port/DB contention), not a defect
these fixes (or anything else in this phase) introduced.

## Task 6 phase-gate verification (final pass before push)

Re-ran the full gate sequence one more time immediately before pushing:
`npm run lint` (clean), `npm run typecheck` (clean), `npx vitest run` (475/475
unit), `TEST_DATABASE_URL=... npx vitest run --config vitest.integration.config.mjs`
(69/69 integration), `npm run build` (clean, `ƒ Proxy (Middleware)` confirms
`middleware.js` registered). Landing page diff against `main` confirmed empty:
`git diff origin/main...HEAD --stat -- src/app/page.js src/components/landing/`
produces no output. Full `npx playwright test` run 3 more times: 26/26, 25/26,
and 22/26 across those runs — the new `tests/e2e/admin-ops.spec.mjs` (3 tests)
passed in every single run; the only failures were pre-existing tests
(`billing.spec.mjs`, `generation.spec.mjs`, `states.spec.mjs`) hitting the
same `.st-app:visible`/render-timeout or `net::ERR_CONNECTION_REFUSED`
symptom documented in the Task 4 commit message and the test-suite summary
below — consistent with contention from a concurrent agent's own e2e run
against the same fixed port `3399` and shared `helmies-test-pg` container,
not a defect introduced by this phase's code (confirmed by isolating
`--workers=1`, where every affected test passes every time).

## Gate summary

| Gate | Status | Why |
|---|---|---|
| A — Code health | **PASS** | Clean install, lint, typecheck, build, dead-code scan, and the dependency audit (at the exact severity level CI gates on) all ran clean; no secrets found in tracked files. |
| B — Data and money | **BLOCKED** | The margin-floor gap (previously FAIL) is fixed and verified. **Backup/restore is now rehearsed for real** (Phase 8 Task A1, see above) and moves to PASS on its own row. The sole remaining blocker is live Stripe test-clock flows, which need a real Stripe test-mode account not available in this worktree — that alone keeps the gate BLOCKED. |
| C — Security | **BLOCKED** | Everything testable here passes (route manifest — now also covering `/api/cron/alerts` — authz negative tests, upload/SSRF, log redaction, admin audit trail). The one outstanding item — an authenticated ZAP scan against staging — needs infrastructure this environment doesn't have. |
| D — Product | **BLOCKED** | Core-tool success/failure simulation, onboarding, job-resume, and cancellation/refund are verified. Templates A–L are Phase 6/Stream B's concurrent scope and explicitly off-limits to this agent (`src/lib/templates*`, `src/app/templates/*`, etc.) — not verified here. |
| E — Browser and accessibility | **BLOCKED** | axe finds zero serious/critical violations across the tested pages. Full browser/device matrix, 200%-zoom/mobile-keyboard checks, and VoiceOver/NVDA passes all need infrastructure (real devices/browsers, screen readers) this environment doesn't have — Stream B's concurrent scope (`feat/phase8-product`) addresses the browser matrix specifically; not re-verified here. |
| F — Operations | **BLOCKED** | Maintenance mode, provider kill switch, metrics dashboard, and the incident/ops runbooks are all implemented and verified by real tests. **Threshold alerting with webhook delivery and dedup now exists and is proven end to end** (Phase 8 Task A2, see above) — that row moves to PASS. The gate stays BLOCKED on the two remaining items: rollback rehearsal and the production smoke test, both of which require a real deployed environment/deliberate production action this worktree cannot take. |

**No public paid launch until Gates A–F pass** (contract §14) — they do not
today. Every gate below is now either PASS or BLOCKED purely on
infrastructure this environment does not provide (staging, a real Stripe
test-mode account, real devices/browsers/screen readers, a real deployed
environment) — each with the exact one-command instruction to run it once
that infrastructure exists. No gate carries an un-fixed, verified code
defect: the margin-floor gap this document originally failed Gate B on is
now closed (see Gate B below).

---

## Gate A — Code health: PASS

| Check | Evidence | Result |
|---|---|---|
| Clean install | `npm ci` | 645 packages installed, no errors. |
| Lint, zero warnings | `npm run lint` | Exit 0, no output (zero warnings/errors). |
| Typecheck | `npm run typecheck` | Exit 0 (`tsc --noEmit`), no output. |
| Build | `npm run build` | Production build (Turbopack) completes; every route in `src/app/api/**` and every page compiles; `ƒ Proxy (Middleware)` confirms `middleware.js` is registered. One pre-existing Turbopack tracing warning on `src/lib/storage/local-driver.js` (unrelated to this phase, not an error). |
| No dead launch-critical code | `npm run check:dead-code` | 3 dead files reported: `src/components/landing/ScrollSection.js`, `src/lib/alibaba.js`, `src/lib/template-seed.js` (245 files scanned). None are launch-critical (dead code, by definition, isn't reachable); the last is Phase 6's file, not touched here. |
| No secrets | `git ls-files \| grep -v test \| xargs grep -lEI "sk-[a-zA-Z0-9]{20,}\|AKIA[0-9A-Z]{16}\|-----BEGIN (RSA\|EC )?PRIVATE KEY-----"` and `git ls-files \| grep -E "^\.env$\|^\.env\.[^e]"` | Zero matches for both — no hardcoded API-key-shaped strings in tracked non-test files, and no real `.env` file tracked (only `.env.example`). |
| Dependency audit, no unaccepted critical/high | `npm audit --omit=dev --audit-level=critical` (the exact command `.github/workflows/ci.yml`'s `audit` job runs) | Exit 0. 3 high-severity findings exist (`next`'s bundled `postcss <=8.5.17`, `sharp <0.35.0`) but are a **documented, already-accepted exception** (recorded in `.github/workflows/ci.yml`'s `audit` job comment and `.superpowers/sdd/2026-08-01-phase1-foundation-stabilization/progress.md`, Task 12): no non-breaking fix exists on the Next 16.x line (`npm audit fix --force` proposes downgrading to `next@9.3.3`, not a real fix), so the CI gate is deliberately scoped to `critical`, and passes. |

---

## Gate B — Data and money: BLOCKED

| Check | Evidence | Result |
|---|---|---|
| Migrations tested | `DATABASE_URL=postgresql://postgres:test@localhost:55432/test npx prisma migrate status` | "7 migrations found in prisma/migrations" / "Database schema is up to date!" against the disposable test DB. Never run against `.env`'s `DATABASE_URL` (production) per the absolute safety rule. |
| Wallet reconciliation zero mismatch | `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/test npx vitest run --config vitest.integration.config.mjs` | 70/70 integration tests pass, including `tests/integration/reconciliation.int.test.mjs` (proves `ok:true` for a wallet built purely through real `wallet.js` calls, and that a simulated drift is correctly detected and repaired) and `tests/integration/metrics.int.test.mjs`'s reconciliation-metric tests. |
| Concurrent spend test | Same integration run — `tests/integration/job-claim-concurrency.int.test.mjs` ("20 concurrent claims on 5 jobs → exactly 5 distinct claims") and `tests/integration/wallet.int.test.mjs` ("two concurrent 60-credit reserves on a 100-credit wallet → exactly one succeeds") | Both pass — no over-claim, no over-spend under real concurrency against real Postgres. |
| Duplicate webhook/job tests | Same run — `tests/integration/stripe-webhook.int.test.mjs`, `tests/integration/webhook-refund.int.test.mjs`, and job-queue's own idempotency test (duplicate `idempotencyKey` returns the same row, 20 concurrent enqueues collapse to 1 row) | All pass. |
| Stripe cases (simulated) | `npx vitest run tests/unit/stripe-webhook.test.mjs` + the integration Stripe tests above | Pass — checkout/topup/subscription/invoice-renewal/cancellation branches all exercised against a mocked Stripe SDK + real Postgres for the DB side. |
| No client-controlled price | `npx vitest run tests/unit/generation-pricing-strict.test.mjs` | 12/12 pass — price is always resolved server-side from `ModelPricing`, never from the request body. |
| **Margin floor enforced** | `npx vitest run tests/unit/pricing-engine.test.mjs tests/unit/api-admin-pricing.test.mjs tests/unit/api-admin-models.test.mjs tests/unit/api-admin-providers.test.mjs` | **PASS — fixed this review round.** `setModelPricing`/`setProviderMarkup` (`src/lib/pricing-engine.js`) now reject (never clamp) a `creditsCost` below the model's provider cost or a `markup` below `1.0`, reusing `CREDIT_TO_EUR` (no second constant). Enforced at all three write paths: `POST /api/admin/pricing`, `POST /api/admin/models` (partial-update, floored against the row's effective post-update cost), `POST /api/admin/providers` (upserts markup directly, same shared assertion). The review's exact quantified scenario (10s video, ~$0.75 provider cost, `creditsCost:5`) is a named test case and is rejected with a 400 naming the real minimum (75 credits); a markup of `0.5` is rejected the same way; a valid update at or above the floor still succeeds. 20 new tests total (14 in `pricing-engine.test.mjs`, 2 in the new `api-admin-pricing.test.mjs`, 4 in the new `api-admin-models.test.mjs`, 2 added to `api-admin-providers.test.mjs`). |
| Backup and restore tested | `docs/runbook-backup.md`'s rehearsal + "Security hardening" sections — exact commands, run for real against `helmies-test-pg` and re-run after a review found and fixed 3 executable Criticals in the production-host guard | **PASS (Phase 8 Task A1, re-verified after code review).** `scripts/backup-db.mjs`/`scripts/restore-db.mjs` were rehearsed against the disposable test container only, never `.env`'s `DATABASE_URL`: seeded 3 recognizable marker `User` rows, backed up (105,487 bytes, via the corrected stream-flush-safe `runPgDump`), **dropped and recreated the database from scratch** (confirmed zero tables), restored, and confirmed all 3 marker rows plus the full table totals came back exactly, alongside `_prisma_migrations` (10 rows) proving the full schema round-tripped. **The production-host guard itself was adversarially re-tested**: `127.0.0.1` vs `localhost`, `127.1`, `2130706433` (decimal), `0177.0.0.1` (octal), and a trailing-dot FQDN are all now REFUSED (previously all bypassed a bare string compare); an empty or unparseable `DATABASE_URL` now fails CLOSED (previously failed open); the guard's `.env` load is cwd-independent (confirmed identical behavior running from the repo root vs. an unrelated directory with `DATABASE_URL` unset in the shell); a genuinely different host, a same-host different-database target, and `--allow-production` itself all remain correctly ALLOWED. A corrupted/partial dump now makes `restore-db.mjs` exit non-zero (previously always exited 0). 45 unit tests cover the pure filename/pruning/guard/legacy-IPv4/DNS logic (`tests/unit/backup-args.test.mjs`). |
| Live Stripe test-clock flows | — | **BLOCKED.** Requires a real Stripe test-mode account and `stripe trigger`/test-clock API access, not available in this worktree. One-command instruction: `stripe trigger checkout.session.completed --add checkout_session:metadata.userId=<test-user-id>` against a configured Stripe CLI pointed at the app's `/api/stripe/webhook`, then confirm the matching `CreditLedger` row. |

Gate B stays **BLOCKED**, not PASS: the margin-floor defect is fixed, and
backup/restore — the other concrete gap this document previously flagged —
is now genuinely rehearsed and proven (Phase 8 Task A1, immediately above).
The **sole remaining blocker is live Stripe test-clock flows**, which need a
real Stripe test-mode account this worktree does not have — that is
infrastructure, not a code defect, and is why this gate cannot move to PASS
from an implementer's worktree at all; it needs the owner's Stripe
credentials.

---

## Gate C — Security: BLOCKED

| Check | Evidence | Result |
|---|---|---|
| Route manifest complete | `npx vitest run tests/unit/route-manifest.test.mjs` | 11/11 pass — every `src/app/api/**/route.js` file is registered in `security/route-manifest.json`, every cookie-session state-changing route has `originCheck: true` (or an explicit `ORIGIN-EXEMPT:` justification), no dangling/stale entries. |
| Authorization negative tests | `npx vitest run` (full unit suite) — `tests/unit/authz.test.mjs`, `tests/unit/mass-assignment.test.mjs`, `tests/unit/api-templates-authz.test.mjs`, and the admin-route auth-gate tests added this phase (`tests/unit/metrics.test.mjs`, `tests/unit/ops-flags.test.mjs`) | All pass — non-admin callers get 403, unauthenticated callers get 401, across every admin route this phase touched plus the pre-existing suite. |
| Upload and SSRF tests | Same full run — `tests/unit/upload-sniff.test.mjs`, `tests/unit/api-upload-sniff.test.mjs`, `tests/unit/media-serve.test.mjs` | Pass. |
| CSP active | Read `next.config.js` | A `Content-Security-Policy` header (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, etc.) is set on every route via `headers()`; confirmed present at build time (the build step reads and applies this config without error). |
| Logs contain no secrets | `npx vitest run tests/unit/log.test.mjs` | 17/17 pass. `redact()` walks the **entire** fields tree (objects and arrays, depth-capped at 5) — not just the top level, which is what an earlier version of this function did and a code review found leaking: a sensitive key nested inside a plain object (`req.headers.authorization`), inside an array of objects, under a differently-cased prompt-family key (`Prompt`, `promptText`, `negative_prompt` — matched case-insensitively), or as a non-string prompt value (measured by JSON length instead of crashing or leaking) are all now stripped/truncated at any depth. `err.message` and (non-production) `err.stack` are additionally scrubbed for secret-shaped substrings — a label (key/secret/token/password/authorization/Bearer) immediately followed by a genuinely key-shaped value — without mangling ordinary prose that merely contains one of those words. No log call site in this codebase currently passes a nested/nonobvious structure (every real call site passes flat scalars, confirmed by reading all six Task 1 conversions), so this was a latent gap, not an active leak — but the module's contract ("callers never have to sanitize") is now actually met, not just true by accident of how it's currently called. |
| Admin actions audited | `npx vitest run tests/unit/ops-flags.test.mjs` + `tests/integration/ops-flags.int.test.mjs` | Both maintenance-mode and provider-kill-switch setters are proven (unit and against real Postgres) to write an `AuditLog` row with the admin id and reason on every call. |
| **ZAP scan (authenticated, staging)** | — | **BLOCKED.** No staging deployment exists in this environment, and OWASP ZAP is not installed. One-command instruction once staging exists: `docker run -t owasp/zap2docker-stable zap-full-scan.py -t https://staging.helmies.fi -r zap-report.html` (authenticated scan needs a ZAP auth script or session-token injection configured against the real login flow — see ZAP's authenticated-scan docs). Critical/high findings block release per contract §9.5. |

---

## Gate D — Product: BLOCKED

| Check | Evidence | Result |
|---|---|---|
| Core tools: one success + one failure simulation | `npx playwright test tests/e2e/generation.spec.mjs --workers=1` | Both pass in isolation: "generating an image completes end-to-end and the balance drops by exactly 10" and "a failed generation reports failure and refunds the balance." (Under the full suite's default 3-worker run, this file intermittently hits a pre-existing render-timeout flake under heavy concurrent load — see the Task 4 commit message and `docs/release-checklist.md`; isolated runs are consistently green.) |
| Onboarding first-value flow | `npx playwright test tests/e2e/auth.spec.mjs` | Passes — fresh registration lands in `/studio` with a 100-credit balance. |
| Jobs resume after refresh | `npx vitest run tests/unit/job-runner.test.mjs` + `tests/integration/job-lifecycle.int.test.mjs` | Pass — a job resumed after a simulated crash (lease-reap recovery) polls the existing provider request instead of re-submitting. |
| Cancellation and refunds correct | `npx playwright test tests/e2e/generation.spec.mjs --workers=1` (failure case) + `tests/integration/reservation-expiry.int.test.mjs` | Pass — a failed generation refunds exactly once; an expired reservation resolves to release or settle, never both. |
| Assets persist | — | Not independently verified by a dedicated test in this phase's evidence; exercised implicitly by the gallery/generation e2e flows but not called out separately. Not claimed as PASS on that basis. |
| **Templates A–L published only after test run** | — | **Out of this phase's verification scope.** `src/lib/templates*`, `src/app/api/templates/*`, `src/app/templates/*`, and `scripts/seed-templates.mjs` are explicitly off-limits to this agent — Phase 6 owns them and is developing concurrently on its own branch. Not verified here; do not treat this row as evidence either way for Phase 6's own release status. |

---

## Gate E — Browser and accessibility: BLOCKED

| Check | Evidence | Result |
|---|---|---|
| axe: no serious/critical issue | `npx playwright test tests/e2e/a11y.spec.mjs` | 6/6 pass across `/`, `/login`, `/pricing`, `/studio`, `/studio/image`, `/settings`, `/gallery`, and the model-picker sheet, plus a keyboard-traversal test. Zero `serious`/`critical` violations; a few pre-existing `moderate` findings are logged (landmark structure on `/`, heading order on `/settings` and `/gallery`) but don't gate per the test's own documented policy. |
| **Full supported browser matrix** | — | **BLOCKED.** This environment only has Playwright's bundled Chromium available. One-command instruction: `npx playwright test --project=chromium --project=firefox --project=webkit` after adding Firefox/WebKit projects to `playwright.config.mjs` and running `npx playwright install --with-deps`; real-device coverage (iOS Safari, Android Chrome) needs BrowserStack/Sauce Labs or physical devices, neither available here. |
| **Mobile keyboard safe / no horizontal overflow / 200% zoom usable** | — | **BLOCKED.** No automated test exists for any of these three in this codebase today, and they need a real mobile viewport/device or manual zoom testing, not exercised by axe. |
| **VoiceOver and NVDA core journeys pass** | — | **BLOCKED.** Requires macOS (VoiceOver) and Windows+NVDA with a human operator; not automatable in this headless environment. One-command instruction: there isn't one — this is a manual pass, not a script, per the contract's own phrasing ("VoiceOver and NVDA core journeys pass," not "an automated screen-reader test passes"). Budget a manual QA session against the same core journeys `tests/e2e/*.spec.mjs` cover (register → generate → billing → admin ops). |

---

## Gate F — Operations: BLOCKED

| Check | Evidence | Result |
|---|---|---|
| Dashboards working | `npx vitest run tests/unit/metrics.test.mjs` + `tests/integration/metrics.int.test.mjs` + `npx playwright test tests/e2e/admin-ops.spec.mjs --workers=1` | 10 unit + 10 integration + 3 e2e, all pass. `GET /api/admin/metrics` aggregates generations/jobs/credits/revenue/providers/reconciliation/webhooks/users; `MetricsPanel.js` renders it with the worker-liveness signal (`oldestQueuedAgeSec`) leading the page. |
| Provider kill switch | `npx vitest run tests/unit/ops-flags.test.mjs tests/unit/provider-resolution.test.mjs` + `tests/integration/ops-flags.int.test.mjs` + the e2e kill-switch test | A disabled provider is proven absent from `resolveProviderWithFallback`'s resolved chain (unit, against mocked and real Postgres); disabling every provider for a model throws a clear, model-named error instead of hanging. The e2e test verifies the UI's typed-confirmation gate without actually disabling a real provider (to avoid stranding concurrently-running generation tests that depend on it) — see the Task 4 commit message. **Code review fix:** a Critical finding proved the switch could silently reverse itself against production-cased `ProviderConfig` rows (`"KIE"`/`"Alibaba"`) via a duplicate-row/unordered-`findMany` bug — fixed (`setProviderDisabled` now matches and updates existing rows instead of blind-upserting on the lowercase key; `getProviderActivity` is now order-independent), with an executed-proof integration test: seed a production-cased `"KIE"` row, disable it, perform an unrelated update to that row, and confirm it's still disabled with no duplicate created — independently verified to fail against the pre-fix code (`expected length 1 but got 2`) before the fix was restored. |
| **Maintenance mode — verified with a test, not by inspection** | `npx playwright test tests/e2e/admin-ops.spec.mjs --workers=1` (test: "toggling maintenance ON requires typed confirmation, then /studio 503s; toggling OFF restores it") | **PASS.** The test: opens Admin → Operator controls, requires typing `MAINTENANCE` + a reason before the confirm button enables, confirms, then a **fresh unauthenticated browser context** gets a real `503` from `GET /studio`; toggles back off (no confirmation gate on that direction) and a second fresh context confirms `/studio` no longer 503s. The ON window is wrapped in `try/finally` so a failed assertion can never leave maintenance stuck on for other concurrently-running specs. |
| **Maintenance mode never blocks money-critical paths — verified with a test** | `npx vitest run tests/unit/ops-flags.test.mjs` (12 middleware-specific test cases) | **PASS.** Directly asserts, with a real `middleware()` invocation and a mocked `/api/health` response of `maintenance: true`, that `POST /api/webhooks/generation-complete`, `POST /api/stripe/webhook`, `POST /api/cron/automation`, `POST /api/admin/ops`, and `GET /api/health` itself all still reach `NextResponse.next()` (never a 503), while a normal state-changing route (`POST /api/assets`) and `/studio` correctly do 503. |
| Incident runbook | `docs/runbook-ops.md`, `docs/incident-response.md` (this phase) | Written — maintenance mode, provider kill switch, worker-down/stuck-job/reconciliation-drift triage, the automation cron's role as the money safety net, severity levels, who to page (currently: no one, automatically — documented honestly), and the first five commands for a SEV-1. |
| **Alerts working (paging)** | `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/test npx vitest run --config vitest.integration.config.mjs tests/integration/alerts.int.test.mjs` + `npx vitest run tests/unit/alerts.test.mjs tests/unit/automation.test.mjs tests/unit/api-admin-flags.test.mjs` | **PASS (Phase 8 Task A2, re-verified after code review).** `src/lib/alerts.js`'s `evaluateAlerts()` (reusing Phase 7's `collectMetrics()` directly, never re-querying) implements 6 real, data-backed rules plus a 7th (Stripe webhook failures) that is real and unit-tested but cannot fire against production data yet (documented honestly, see `docs/runbook-ops.md`). `deliverAlerts()` posts to `ALERT_WEBHOOK_URL` with a 10s `AbortSignal.timeout` (fixed: a hanging webhook used to stall `runAutomation()`'s entire response, including the money-safety legs), logs a warning no-op when unset. Dedup is split into `selectDueAlerts()` (read-only) and `recordAlertsFired()` (write-only, called ONLY after a confirmed delivery — fixed: it used to write before delivery was attempted, so an undelivered critical was suppressed for the full 60-minute window; re-proven against real Postgres that a webhook 500 now leaves the alert due again immediately). `GET /api/cron/alerts` and `runAutomation()`'s 6th leg both wire this together. `alert_state:*` `FeatureFlag` rows are now excluded from `GET /api/admin/flags` and rejected by its `POST` (fixed: they used to appear as editable operator flags). 36 alert unit tests + 5 integration tests + automation-leg tests + 4 admin-flags tests, all passing. |
| **Rollback tested** | — | **BLOCKED.** Would require a real deploy + intentional rollback rehearsal against the production server; not performed in this environment. One-command instruction: on the server, `git reset --hard <previous-sha> && npx prisma generate && npm run build && pm2 startOrReload ecosystem.config.cjs --update-env`, then confirm `/api/admin/metrics` and `/api/health` respond correctly post-rollback. |
| **Production smoke test checklist completed** | `docs/release-checklist.md` (written this phase) | The checklist itself is written and matches CI exactly, plus a manual post-deploy section (metrics reachable, maintenance mode off, worker not crash-looping). **Running it against real production is BLOCKED** — no deploy was performed as part of this phase. One-command instruction: `scripts/deploy.sh` via the documented `plink` invocation, followed by the "Pre-deploy (manual today)" section's four checks in `docs/release-checklist.md`. |

---

## Test suite summary (this phase + code review follow-up, real command output)

- **Unit:** `npx vitest run` → 503 passed (56 files). Baseline was 426; Phase 7
  added 49 (log.js: 8, metrics.js: 10, ops-flags.js + middleware: 29,
  provider-resolution kill-switch additions: 2); the code review follow-up
  added 28 more (log.js recursive-redaction vectors: 9, ops-flags.js
  duplicate-row regression: 1, pricing-engine.js margin floor: 14, two new
  route test files `api-admin-pricing.test.mjs`/`api-admin-models.test.mjs`:
  2+4, `api-admin-providers.test.mjs` markup-floor additions: 2 — some of
  these land across files listed once above).
- **Integration:** `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/test npx vitest run --config vitest.integration.config.mjs` → 70 passed (13 files). Baseline was 52; Phase 7 added 17 (metrics: 10, ops-flags: 7), the code review follow-up added 1 more (the production-casing kill-switch regression test).
- **E2E:** `npx playwright test` → 26 tests defined (baseline 23 + 3 new in
  `tests/e2e/admin-ops.spec.mjs`). In isolation (`--workers=1`, no
  cross-file/cross-agent contention) every test passes, including all 3 new
  ones. Under the suite's default 3-worker run, 1–2 **pre-existing** tests
  (`billing.spec.mjs`, `generation.spec.mjs`) intermittently hit a
  render-timeout flake (`.st-app:visible` / `toBeVisible` exceeding the
  configured 10s default) that `playwright.config.mjs`'s own comments already
  document as a known risk under concurrent load on constrained hardware —
  observed worse in this session while a concurrent agent (Phase 6, working
  on templates) was independently running its own e2e suite against the same
  fixed port `3399` and the same shared `helmies-test-pg` container (confirmed
  via process listing: a `next dev --port 3003` / `playwright test
  templates.spec.mjs` from the main repo checkout, and at one point a stray
  server yielding `ERR_CONNECTION_REFUSED` across most of one run). The new
  `admin-ops.spec.mjs` tests were green in every run performed, isolated or
  not.

## Every blocker, in one place

Two rows this table previously listed — **backup/restore never rehearsed**
and **paging/alerting integration** — are resolved as of Phase 8 Tasks A1
and A2 (see the addendum near the top of this document) and have been
removed from the list below. Everything remaining here is unchanged and
still genuinely needs the stated infrastructure/owner action.

| Blocker | Gate | One-command instruction |
|---|---|---|
| Live Stripe test-clock flows | B | `stripe trigger checkout.session.completed --add checkout_session:metadata.userId=<id>` against a real Stripe CLI + test-mode account. |
| ZAP authenticated scan | C | `docker run -t owasp/zap2docker-stable zap-full-scan.py -t https://staging.helmies.fi -r zap-report.html` against a real staging deployment. |
| Templates A–L test-run proof | D | Owned by Phase 6 / Stream B, concurrent branch (`feat/phase8-product`) — out of this agent's scope by explicit instruction. |
| Full browser/device matrix | E | `npx playwright test --project=firefox --project=webkit` (config addition needed) plus BrowserStack/Sauce Labs or physical devices for real mobile coverage — Stream B's concurrent `feat/phase8-product` Task B2 addresses the config addition; not re-verified from this agent. |
| Mobile keyboard / overflow / 200% zoom | E | No script exists; manual testing on a real device/browser at 200% zoom. |
| VoiceOver / NVDA passes | E | Manual pass, no command — a human operator on macOS (VoiceOver) and Windows+NVDA walking the core journeys. |
| Rollback rehearsal | F | `git reset --hard <previous-sha> && npx prisma generate && npm run build && pm2 startOrReload ecosystem.config.cjs --update-env` on the real server — requires taking production down deliberately; the owner should schedule it. |
| Production smoke test | F | `scripts/deploy.sh` (via the documented `plink` SSH invocation) followed by `docs/release-checklist.md`'s manual post-deploy section. |
