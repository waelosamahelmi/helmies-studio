# Runbook: durable generation job queue

The generation queue (`GenerationJob` table, `src/lib/job-queue.js`) is
drained by a separate PM2 process, `helmies-worker`
(`scripts/worker.mjs`), declared alongside the app in
`ecosystem.config.cjs`. This doc covers the operational failure modes.

Status vocabulary: `queued` (claimable) -> `running` (leased by a worker)
-> `succeeded` / `failed` (terminal) or `dead` (terminal after
`maxAttempts` or timeout).

## Worker down: jobs stuck `queued`

**Symptom:** users see generations stuck "pending"/"processing" and never
completing; `GenerationJob` rows accumulate in `queued` and never move to
`running`.

**Check:**

```bash
pm2 list                       # is helmies-worker even present, and "online"?
pm2 logs helmies-worker --lines 50
```

If it's missing entirely, the last deploy didn't start it (see "Deploying"
below) — run `pm2 startOrReload ecosystem.config.cjs --update-env`. If it's
present but crash-looping, `pm2 logs helmies-worker` will show the
`[worker] fatal:` line and the underlying error; `max_restarts: 20` /
`restart_delay: 5000` in `ecosystem.config.cjs` mean PM2 gives up
escalating restarts after 20 attempts rather than pegging the CPU forever —
check `pm2 describe helmies-worker` for `restart time` if it looks stuck in
`errored`.

**Confirm from the DB directly** (never against the `.env` DATABASE_URL from
a local machine — run this on the server, or via the app's own DB access):

```sql
SELECT status, count(*) FROM "GenerationJob" GROUP BY status;
```

A growing `queued` count with `running` stuck at 0 confirms the worker
isn't claiming.

## A job stuck `running` (worker crashed mid-job)

**Symptom:** one specific generation is stuck; `GenerationJob.status =
'running'` with a `leaseUntil` that has already passed.

This self-heals — no manual action needed. Every worker (via
`reapExpiredLeases`, `src/lib/job-queue.js`) checks every 60 seconds for
`running` rows whose `leaseUntil` has passed and puts them back to
`queued`, where any live worker (including the one that crashed, once it
restarts) can reclaim and resume them. Recovery time is at most
~60s (reap interval) + however far past its lease the row already was.

If a job appears stuck `running` for much longer than that, check first
whether `helmies-worker` is running at all (see above) — nothing reaps
leases if there's no worker process running the reap timer.

## Manual retry

To force a specific job to be retried immediately instead of waiting for
its backoff (`nextRunAt`) or waiting for it to be marked `dead`:

```sql
UPDATE "GenerationJob"
SET status = 'queued', "nextRunAt" = NOW(), "leaseUntil" = NULL, "lockedBy" = NULL
WHERE id = '<jobId>';
```

Any live worker will pick it up on its next claim. If `job.providerRequestId`
is already set (a prior attempt got as far as submitting to the provider),
the runner resumes by polling that request instead of submitting a second
time (`src/lib/job-runner.js` — "Resuming a prior attempt").

A job in `dead` can be retried the same way — nothing about `dead` is
special at the row level, it's just where `failJob` stops retrying
automatically. Reset it to `queued` (and consider bumping `maxAttempts` if
it had already exhausted the default 3) and it will run again exactly like
any other queued job.

## Draining the queue before a deploy

The worker has no built-in maintenance-mode flag; "drain" here means "let
it finish what's in flight and stop claiming new work" before you restart
it as part of a deploy.

1. `pm2 logs helmies-worker --lines 20` — see what's currently running.
2. `pm2 stop helmies-worker` sends SIGTERM. The worker's shutdown handler
   (`scripts/worker.mjs`) immediately stops claiming new jobs but lets any
   job(s) already in flight finish normally (up to ~30s grace period,
   `SHUTDOWN_GRACE_MS`) before the process exits.
3. Any job still `queued` when the worker stops simply waits — it isn't
   lost, and isn't stuck (it's not `running`, so the lease reaper has
   nothing to do here). It picks up again the moment the worker (or its
   replacement, post-deploy) starts claiming.
4. Deploy normally (`scripts/deploy.sh`'s `pm2 startOrReload
   ecosystem.config.cjs --update-env` brings both `helmies-studio` and
   `helmies-worker` back/reloaded together — you don't need to manually
   restart the worker you just stopped, `startOrReload` handles a
   currently-stopped app the same as a currently-running one).

In practice this manual drain is rarely necessary — `startOrReload` is
already a graceful reload (SIGTERM + wait, not a hard kill), so a normal
deploy already gets the same in-flight-job-finishes-first behavior. The
explicit stop/inspect/start sequence above is for a maintenance window
where you specifically want to *confirm* the queue is empty before doing
something more invasive (e.g. a `GenerationJob` schema migration).

## Rollback note

Reverting the app's code leaves the `GenerationJob` table harmless (rows
just sit there unclaimed). If you roll back a deploy that introduced the
worker's dependencies, stop the worker explicitly first —
`pm2 delete helmies-worker` — otherwise it keeps running against code that
no longer knows how to enqueue jobs the same way, or (worse) claims jobs
the rolled-back app version never created and doesn't expect to exist.
