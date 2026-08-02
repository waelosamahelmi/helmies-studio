# Runbook: operator controls (maintenance mode, provider kill switch, worker/queue health, reconciliation)

Phase 7 adds the controls this doc covers: `src/lib/ops-flags.js` (maintenance
mode + provider kill switch), `src/lib/metrics.js` (the numbers below),
`src/app/api/admin/ops/route.js` and `src/app/api/admin/metrics/route.js`
(the API), `src/components/admin/OpsPanel.js` and `MetricsPanel.js` (the UI,
under Admin → Operator controls / Admin → Metrics). Everything here is a
day-2 operations doc, not a feature description — see the Phase 7 plan
(`docs/superpowers/plans/2026-08-02-phase7-observability-release.md`) for the
design rationale.

## Maintenance mode

**What it does:** while on, `middleware.js` returns a 503 for every `/studio/*`
request and every state-changing (`POST`/`PUT`/`PATCH`/`DELETE`) `/api/*`
request. `/api/health`, `/api/admin/*`, `/api/cron/*`, `/api/webhooks/*`, and
`/api/stripe/webhook` are always reachable regardless of maintenance mode or
method — a maintenance window must never drop a provider callback or a
Stripe event, both of which carry real money.

**Turn it on:** Admin → Operator controls → Maintenance mode → toggle. Turning
ON is the destructive direction — the UI requires typing `MAINTENANCE`
verbatim plus a reason before the confirm button enables; the reason lands in
the `AuditLog` row (`action: "admin_maintenance_mode"`). Equivalent API call:

```bash
curl -X POST https://studio.helmies.fi/api/admin/ops \
  -H "Content-Type: application/json" -H "Cookie: <admin session cookie>" \
  -d '{"action":"maintenance","enabled":true,"reason":"planned DB migration"}'
```

**Turn it off:** same toggle, no confirmation gate (restoring service is
never the action that needs a typed confirmation). `GET /api/admin/ops`
always works during maintenance (it's under the `/api/admin/*` exemption), so
an operator locked out of `/studio` by their own maintenance window can still
read and flip the flag back.

**How it's implemented, for debugging:** the flag lives in `FeatureFlag`
(key `maintenance_mode`). `middleware.js` cannot import Prisma directly — Next
builds middleware for the Edge runtime by default, and Prisma's
`@prisma/adapter-pg` driver needs a real TCP socket Edge doesn't have (this
was confirmed empirically while building this feature: adding `export const
runtime = "nodejs"` to `middleware.js` made Next silently drop the middleware
from the build with no warning). So middleware polls `GET /api/health` — an
ordinary Node.js route handler where Prisma works — the same way it already
resolves the session via a fetch to `/api/auth/session`. If maintenance mode
looks "stuck" on or off, check `/api/health` directly:

```bash
curl -s https://studio.helmies.fi/api/health
# { "ok": true, "dbOk": true, "maintenance": false }
```

If `dbOk` is `false`, middleware fails OPEN (treats it as NOT in
maintenance) rather than 503ing the whole app over a DB hiccup — check the DB
connection first, not the flag.

## Provider kill switch

**What it does:** `src/lib/providers.js`'s `resolveProviderWithFallback`
filters a provider out of the fallback chain when `ops-flags.js`'s
`isProviderDisabled(name)` says so — backed by `ProviderConfig.isActive`,
the same table `getProviderActivity()` already read before Phase 7 (the kill
switch extends that existing read path; it does not add a second one). If
**every** provider for a model ends up disabled, `resolveProviderWithFallback`
throws a clear, model-named error immediately instead of returning an empty
chain a caller would otherwise wait on indefinitely.

**Turn a provider off:** Admin → Operator controls → Provider kill switch →
toggle the provider off. Disabling is the destructive direction — the UI
requires typing the provider's name (`KIE` or `ALIBABA`) plus a reason;
re-enabling applies immediately, no gate. Equivalent API call:

```bash
curl -X POST https://studio.helmies.fi/api/admin/ops \
  -H "Content-Type: application/json" -H "Cookie: <admin session cookie>" \
  -d '{"action":"provider","name":"kie","disabled":true,"reason":"KIE returning 5xx since 14:02 UTC"}'
```

**When to use it:** a provider is returning sustained errors or garbage
output and you want new generations to skip it immediately, without waiting
for `autoDisableFailingModels` (`src/lib/automation.js`, the cron-driven
per-model auto-disable — see "the automation systemd timer" below) to notice
and disable individual models one at a time. The kill switch is coarser (the
whole provider, every model) and instant (no waiting for the next cron tick).

**Recovery:** re-enable the same toggle once the provider is confirmed
healthy again (check `GET /api/admin/provider-health` and recent
`GenerationJob` failure counts for that `providerName` via
`GET /api/admin/metrics`'s `providers` array first).

## Worker down (symptom: `oldestQueuedAgeSec` climbing)

**Symptom:** `GET /api/admin/metrics`'s `jobs.oldestQueuedAgeSec` — the
worker-liveness signal — grows without bound instead of staying near zero.
This is the single number to watch on the Metrics screen; it leads the page
for exactly this reason. It is the age of the oldest **queued** job whose
`nextRunAt` has already passed (i.e. the queue itself considers it claimable
right now) — a job still waiting out a retry backoff does not count, so this
number only grows when something has genuinely stopped claiming.

**Check and fix:** this is the exact scenario `docs/runbook-jobs.md`'s
"Worker down: jobs stuck `queued`" section covers in full — `pm2 list` /
`pm2 logs helmies-worker`, and if it's missing or crash-looping,
`pm2 startOrReload ecosystem.config.cjs --update-env`. Confirm recovery by
watching `oldestQueuedAgeSec` drop back toward zero (or null, once the queue
drains) within a few worker-claim cycles.

## Stuck jobs (one specific generation, not the whole queue)

See `docs/runbook-jobs.md`'s "A job stuck `running`" (self-heals via lease
reaping, ~60s) and "Manual retry" (reset a specific `GenerationJob` row to
`queued` via SQL) sections — unchanged by Phase 7, still the authoritative
doc for per-job triage. The Admin → Jobs panel (`GET /api/admin/jobs`) is the
UI view of the same `GenerationJob` table for spotting which specific job(s)
are affected before reaching for SQL.

## Reconciliation drift

**Symptom:** `GET /api/admin/metrics`'s `reconciliation.drifted` is nonzero —
at least one wallet's `available`/`reserved` no longer matches what its
`CreditLedger`/`CreditReservation` rows say it should be (see
`src/lib/reconciliation.js`'s header for the exact invariant). This reuses
`reconcileAll()` directly; Phase 7 did not reimplement the check.

**Investigate and fix:**

```bash
npm run reconcile          # scripts/reconcile-credits.mjs — reports every drifted wallet
```

For a specific user, `reconcileWallet(userId)` (importable from
`src/lib/reconciliation.js`) returns the exact drift amounts. `anchorWallet(userId)`
books a single `admin_adjustment` ledger row that makes the ledger's movement
sum catch up to the wallet's `available` balance — it never edits history and
never touches `available`/`reserved` directly. It only repairs
`driftAvailable`; a nonzero `driftReserved` has no ledger-based repair (it has
to be investigated by hand — see the reconciliation module's header for why).
`driftMirror` (the legacy `User.credits` column vs the wallet) is
informational only and self-heals on the user's next session read or
generation completion; it never needs a manual fix and is deliberately
excluded from what counts as "drifted" here.

## The automation systemd timer is the money safety net

`GET /api/cron/automation` (bearer `CRON_SECRET`, `src/app/api/cron/automation/route.js`)
runs `runAutomation()` (`src/lib/automation.js`), which executes five
independent legs via `Promise.allSettled` (one leg throwing never blocks or
masks the other four):

1. `autoDisableFailingModels` — disables a `ModelPricing` row after 5+
   failures in 30 minutes.
2. `autoSuspendAbusiveUsers` — zeroes a non-admin user's wallet after 100+
   generations in 60 minutes.
3. `sweepExpiredReservations` (`src/lib/wallet.js`) — resolves any
   `CreditReservation` whose `expiresAt` has passed: releases it if the
   generation never completed, settles it at actual cost if it did.
4. `sweepTimedOutJobs` (`src/lib/job-runner.js`) — the money safety net this
   phase's own metric (`oldestQueuedAgeSec`) exists to give visibility into:
   ANY `GenerationJob` past its `timeoutAt` gets marked `dead` and its credits
   released/refunded, independent of whether a worker or a provider webhook
   ever comes back. This is what prevents a genuinely stuck job from
   stranding a user's credits forever, even if `helmies-worker` is down for
   an extended period.
5. `pruneTerminalJobs` — deletes `GenerationJob` rows that have been terminal
   (`succeeded`/`failed`/`dead`) for 30+ days. History cleanup only; no money
   or state-machine implication.

This endpoint is triggered periodically by a systemd timer configured
directly on the production server (not version-controlled in this repo —
it is server infrastructure, like the Postgres install itself). **If that
timer stops firing, legs 3 and 4 above stop running**, and a reservation or
job that would otherwise self-heal within its expiry/timeout window instead
sits there indefinitely until someone runs the equivalent sweep by hand.
Because this is the one link in the whole money-safety chain that lives
entirely outside this repo's version control, verify it explicitly as part
of any server migration or provisioning change:

```bash
# On the server:
systemctl list-timers | grep -i automation      # confirm the timer exists and shows a sane "NEXT" time
systemctl status <automation-timer-unit-name>   # confirm it's enabled, not just present
journalctl -u <automation-timer-unit-name> --since "1 hour ago"   # confirm it's actually firing
```

If the timer is missing or disabled, `GET /api/cron/automation` can be
invoked directly (with the bearer secret) as an immediate manual substitute
while the timer is restored, and `oldestQueuedAgeSec` /
`reconciliation.drifted` on the Metrics screen are the two numbers that will
visibly worsen if it stays missing.

## Alert thresholds

The contract (`01_HELMIES_STUDIO_PRODUCTION_EXCELLENCE_AND_QA.md` §10.2)
names an alert list. **No paging/alerting system is configured** — nothing
here pages anyone automatically today (see `docs/incident-response.md`).
"Implemented as a metric" below means the number is real and available via
`GET /api/admin/metrics` or the Metrics screen for a human to check;
"documented only" means there is no metric surfacing it at all yet — checking
it requires a manual query or log grep.

| Alert | Threshold | Status |
|---|---|---|
| Payment webhook failures | > 0 `stripe_webhook_processing_failed` log lines (`src/app/api/stripe/webhook/route.js`, via `src/lib/log.js`) in any 15-minute window | **Documented only.** `webhooks.stripeEventsProcessed` (metrics) counts *successful* claims only — a failing webhook never reaches that counter, so a spike in failures currently only shows up as elevated 4xx/5xx responses in server logs, not as a metric. |
| Settlement mismatch | `reconciliation.drifted > 0` (any drift at all — the wallet invariant is exact, not a tolerance band) | **Implemented as a metric.** `GET /api/admin/metrics` → `reconciliation.{walletsChecked,drifted}`, reusing `src/lib/reconciliation.js`'s `reconcileAll()` directly. |
| Provider cost spike | Daily provider cost (`Σ Generation.providerCost`) more than 2× the trailing 7-day daily average | **Documented only.** `GET /api/admin/analytics` reports lifetime/30-day provider cost totals but has no rolling-average comparison; `GET /api/admin/metrics`'s `providers[]` reports attempt/failure counts, not cost. Spike detection today means pulling the numbers from `/api/admin/analytics` by hand and eyeballing the trend. |
| Queue backlog | `jobs.oldestQueuedAgeSec > 300` (5 minutes) | **Implemented as a metric.** The worker-liveness signal this phase was built around; `MetricsPanel.js` visually flags it past this threshold. Not a hard outage signal by itself — comfortably above `job-queue.js`'s own 5-minute default lease, so it should stay near zero/null under a live worker. |
| Error-rate spike | `generations.successRate < 80` over a 24-hour window with `generations.total >= 20` (the sample-size floor avoids alerting on 1-of-3 noise) | **Implemented as a metric.** `GET /api/admin/metrics` → `generations.{total,succeeded,failed,successRate}`. |
| Auth failure spike | N/A today — no threshold defined | **Not implemented at all.** NextAuth's credentials flow does not currently write an `AuditLog` row (or any other record) on a failed sign-in attempt — there is nothing to threshold yet. This is a real gap: closing it means adding a failure-path log/audit call in `src/lib/auth.js`'s credentials provider, out of scope for this phase. |
| Backup failure | N/A today — no threshold defined | **Not implemented at all.** No backup mechanism (scheduled `pg_dump`, managed-Postgres snapshot, or otherwise) exists anywhere in this repo or its deploy scripts (`scripts/deploy.sh`, `ecosystem.config.cjs`) as of this phase — see `docs/data-retention.md` and `RELEASE_STATUS.md` Gate B. There is nothing running to fail, and therefore nothing to alert on, until a backup process is actually stood up. |

Two more from the contract's full alert list, for completeness (not called
out by name in the Phase 7 brief, included here so the alert-list coverage is
honest about all 11, not just 7):

| Alert | Threshold | Status |
|---|---|---|
| Abnormal free-credit usage | `autoSuspendAbusiveUsers`'s own threshold: 100+ generations by one non-admin user in 60 minutes | **Implemented as automated action, not a metric.** `src/lib/automation.js` already zeroes the wallet automatically (via the cron timer above) and writes an `AuditLog` row (`action: "auto_suspend_user"`) — there's no separate "alert" surface, the system just acts. Query `AuditLog` for that action to see how often it's firing. |
| Object storage failure | N/A — no threshold defined | **Documented only.** `src/lib/storage/ingest.js`'s ingest failures fall back to the raw provider URL rather than failing the generation (see `job-runner.js`'s `ingestFirstOutput` header) — a storage outage degrades gracefully today but isn't counted anywhere. |

`Database saturation` and `CSP reports` (also in the contract's full list)
have no metric or threshold defined at all in this phase and aren't
mentioned in the Phase 7 brief's alert list — flagged here only so this table
doesn't imply silent coverage. Both require infrastructure (connection-pool
metrics, a CSP `report-uri` collector) not built yet.
