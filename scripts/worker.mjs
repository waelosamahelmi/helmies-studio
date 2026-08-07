#!/usr/bin/env node
// Helmies Studio — durable generation job worker (Phase 4A Task 4)
//
// Drains the GenerationJob queue (src/lib/job-queue.js): claim -> run
// (src/lib/job-runner.js) -> repeat, WORKER_CONCURRENCY parallel loops
// (default 2), reaping crashed-worker leases every 60s, exiting gracefully
// on SIGTERM/SIGINT (stop claiming, finish in-flight jobs, forced exit at
// 30s if something hangs). Run standalone via `npm run worker`, or under
// PM2 as "helmies-worker" (see ecosystem.config.cjs) alongside the app.
//
// Runs under plain `node`, NOT bundled by Next/Vite, so:
//   - every local import below is a RELATIVE path with an explicit ".js"
//     extension. The app's "@/..." alias is a Next/Vite bundler feature
//     Node has no knowledge of at all — verified empirically:
//     `node -e "import('./src/lib/providers.js')"` failed with
//     "Cannot find package '@/lib'", not merely a missing-extension error.
//   - src/lib/job-runner.js and everything it pulls in transitively
//     (job-queue.js, wallet.js, providers.js, prisma.js) already use this
//     same relative + ".js" style internally for exactly this reason — see
//     the header comments in job-runner.js and the ".js"-extension comments
//     added to wallet.js, job-queue.js, and providers.js as part of this
//     task (the extensionless "./prisma" in wallet.js/job-queue.js, and the
//     "@/lib/prisma" + "@/lib/alibaba-provider-core.mjs" aliases in
//     providers.js, were the exact transitive breaks found by trying to
//     import each module directly under `node` before writing this file).
//   - "dotenv/config" loads .env explicitly — Next.js does this
//     automatically for the app process; plain `node` does not. Same
//     pattern as every other standalone script in scripts/ (e.g.
//     reconcile-credits.mjs). In production this picks up the real
//     DATABASE_URL from the server's .env, same as the app.
import "dotenv/config";
import { hostname } from "node:os";
import { claimNextJob, reapExpiredLeases, failJob } from "../src/lib/job-queue.js";
import { runJob } from "../src/lib/job-runner.js";
import { sweepStaleAgentRuns } from "../src/lib/agent-runner.js";
import prisma from "../src/lib/prisma.js";
import { log } from "../src/lib/log.js";

const WORKER_ID = `${hostname()}-${process.pid}`;
const CONCURRENCY = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY, 10) || 2);
const EMPTY_CLAIM_SLEEP_MS = 2000;
const REAP_INTERVAL_MS = 60 * 1000;
const SHUTDOWN_GRACE_MS = 30 * 1000;

let shuttingDown = false;
const inFlight = new Set(); // job ids currently being processed, across all loops

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// jobId/generationId/outcome/duration land on the same line for every
// claimed job, per the task brief, and every other worker lifecycle event
// (start/stop/reap/shutdown) uses the same shape so `pm2 logs
// helmies-worker` is uniformly greppable/parseable. `workerId` is stitched
// onto every line here so call sites below don't have to repeat it — src/lib/
// log.js (Phase 7 Task 1) owns the actual JSON-line format + redaction.
function wlog(level, event, fields) {
  log[level](event, { workerId: WORKER_ID, ...fields });
}

// Claim and run exactly one job, if one is available. Returns true if a job
// was claimed (regardless of its outcome), false if the queue was empty.
// runJob (src/lib/job-runner.js) already catches everything it can and
// funnels failures through failJob/credit release internally — the inner
// try/catch here is this process's own last-resort net: if runJob somehow
// still throws (a bug, an unhandled edge case), the job must not be left
// silently "running" until the lease reaper notices minutes later. Failing
// it as retryable here gives it another attempt (or lets job-queue's own
// attempts-exhausted logic send it to `dead`) immediately instead.
async function runOneClaim() {
  const job = await claimNextJob(WORKER_ID);
  if (!job) return false;

  inFlight.add(job.id);
  const startedAt = Date.now();
  try {
    const { outcome } = await runJob(job, { workerId: WORKER_ID });
    wlog("info", "job_done", { jobId: job.id, generationId: job.generationId, outcome, durationMs: Date.now() - startedAt });
  } catch (err) {
    wlog("error", "job_crashed", {
      jobId: job.id,
      generationId: job.generationId,
      err,
      durationMs: Date.now() - startedAt,
    });
    try {
      await failJob(job.id, `Worker crashed: ${err.message}`, { retryable: true });
    } catch (failErr) {
      wlog("error", "job_fail_also_failed", { jobId: job.id, err: failErr });
    }
  } finally {
    inFlight.delete(job.id);
  }
  return true;
}

// One of WORKER_CONCURRENCY parallel claim loops. Postgres's
// FOR UPDATE SKIP LOCKED claim (src/lib/job-queue.js#claimNextJob) makes
// concurrent loops (in this process, and across other worker processes)
// safe by construction — no two loops can ever claim the same row.
async function claimLoop(loopIndex) {
  while (!shuttingDown) {
    const claimed = await runOneClaim().catch((err) => {
      wlog("error", "worker_claim_failed", { loopIndex, err });
      return false;
    });
    if (!claimed) {
      await sleep(EMPTY_CLAIM_SLEEP_MS);
    }
  }
}

async function main() {
  wlog("info", "worker_started", { concurrency: CONCURRENCY });

  const reapTimer = setInterval(async () => {
    try {
      const count = await reapExpiredLeases();
      if (count > 0) wlog("info", "reaped_expired_leases", { count });
    } catch (err) {
      wlog("error", "worker_reap_failed", { err });
    }
    // A1.8: agent runs whose driving process died (web deploy, PM2 restart)
    // leave steps queued/running with live jobs — those recover on their own
    // via job completion -> advanceAgentRun. This sweep catches the OTHER
    // case: a run stuck `executing` with no live work at all (its last
    // advance was lost mid-flight), re-deriving state idempotently.
    try {
      const { swept, advanced } = await sweepStaleAgentRuns();
      if (swept > 0) wlog("info", "swept_stale_agent_runs", { swept, advanced });
    } catch (err) {
      wlog("error", "agent_run_sweep_failed", { err });
    }
  }, REAP_INTERVAL_MS);
  reapTimer.unref?.();

  const claimLoops = Array.from({ length: CONCURRENCY }, (_, i) => claimLoop(i));

  let shutdownTimer = null;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(reapTimer);
    wlog("info", "shutdown_started", { signal, inFlight: inFlight.size });
    // Forced exit if graceful wind-down (each claim loop finishing its
    // current job, then noticing `shuttingDown` and stopping) somehow takes
    // longer than the grace period — e.g. a job stuck in a provider call
    // with no timeout. `.unref()` so this timer itself never keeps the
    // process alive if shutdown finishes cleanly well before it fires.
    shutdownTimer = setTimeout(() => {
      wlog("error", "shutdown_forced", { inFlight: inFlight.size });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    shutdownTimer.unref?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await Promise.all(claimLoops);
  if (shutdownTimer) clearTimeout(shutdownTimer);
  await prisma.$disconnect().catch(() => {});
  wlog("info", "worker_stopped", {});
  process.exit(0);
}

main().catch((err) => {
  wlog("error", "worker_fatal", { err });
  process.exit(1);
});
