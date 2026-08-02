// Helmies Studio — Durable Generation Job Runner (Phase 4A, Task 3)
//
// Executes ONE claimed GenerationJob end-to-end: submit to the provider (or
// resume a prior submission), poll for completion (heartbeating the lease
// throughout), ingest the output via the SAME downloader the completion
// webhook uses (src/lib/media-download.js's downloadAllMedia — no second
// downloader is written here), and drive the Generation row to a terminal
// state.
//
// Imports below are RELATIVE with explicit ".js" extensions, not the
// "@/lib/..." alias used elsewhere in this app (e.g. src/lib/director-executor.js).
// This module is loaded two ways: bundled by Next/Vite (where the alias
// would resolve fine), and directly by scripts/worker.mjs under plain
// `node` (Task 4), which has no knowledge of the "@/" webpack/vite alias at
// all — not even a missing-extension problem, an entirely unresolvable bare
// specifier. Relative-with-extension resolves identically in both contexts,
// so this file (and its worker-reachable dependencies: job-queue.js,
// wallet.js, providers.js, media-download.js, prisma.js) needed no separate
// "app version" vs "worker version". Vitest's alias-based `vi.mock("@/lib/x", ...)`
// still intercepts these relative imports in unit tests below — both
// specifiers resolve to the same absolute file, which is what Vitest's
// mock registry keys on (confirmed by precedent: tests/unit/job-queue.test.mjs
// mocks "@/lib/prisma" while job-queue.js itself imports the plain relative
// "./prisma").
//
// MONEY RULES (normative — a reviewer checks each of these):
//   1. The reservation is settled ONLY when output has been ingested AND the
//      generation is durably marked "completed" — never on submit. This is
//      the fix for the gap Phase 4A exists to close: today's
//      src/app/api/generate/async/route.js settles on submit success, so a
//      webhook that never arrives leaves the user charged with a generation
//      stuck pending forever. A later task (5) moves that route to
//      enqueue-only, leaving the reservation ACTIVE until this runner (or
//      the webhook — whichever wins the race) settles or releases it.
//   2. Any terminal failure (the job goes `dead`, i.e. failJob's
//      `willRetry: false`) releases the still-active reservation, or — if
//      it was already settled/never active by the time we get here —
//      refunds instead. `releaseReservation` is tried first. Per
//      src/lib/wallet.js it signals "nothing to release" two different
//      ways in practice: it returns `null` when no reservation is
//      currently `active` for this generation (the common case once
//      something already settled or released it), and it THROWS
//      "No active reservation found" only in the narrow concurrent-race
//      case where the row flips out of `active` between our read and our
//      write. Both are treated identically here — fall back to
//      `refundCredits` — because both mean the same thing: there is no
//      active hold left to release. Release and refund are never both
//      called for the same failure.
//   3. Every credit call (settle, release, refund) is wrapped so a failure
//      logs loudly (userId, generationId, amount) instead of throwing —
//      mirrors the crash-net pattern in src/lib/director-executor.js's
//      catch block. A credit-side failure must never mask the original
//      provider/ingest error, and must never crash the worker process.
//   4. If the generation this job belongs to is ALREADY terminal
//      (`completed` or `failed`) by the time we look — the webhook won the
//      race — this makes NO credit move. It just completes the job.
//
// Error classification: network/5xx/timeout/rate-limit wording is
// retryable (the queue's own backoff in src/lib/job-queue.js's failJob
// handles the schedule); everything else (4xx, validation, a branded
// provider rejection like "invalid API key" — see providers.js's
// BRANDED_ERRORS) is terminal — retrying it would never succeed.

import prisma from "./prisma.js";
import { heartbeatJob, completeJob, failJob, findTimedOutJobs } from "./job-queue.js";
import { settleReservation, releaseReservation, refundCredits } from "./wallet.js";
import { submitOnly, pollProviderResult, getProvider } from "./providers.js";
import { downloadAllMedia } from "./media-download.js";

// Heartbeat cadence during a long poll — comfortably under job-queue's
// default 5-minute lease (DEFAULT_LEASE_MS in job-queue.js) so a slow
// provider never lets our own lease expire and get reaped out from under us
// mid-poll.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

const RETRYABLE_PATTERNS = [
  /\b5\d{2}\b/, // 500/502/503/504...
  /timeout|timed out|took too long/i,
  /service unavailable/i,
  /network|econnreset|econnrefused|fetch failed|socket hang up|enotfound/i,
  /something went wrong on our end/i, // providers.js BRANDED_ERRORS.server_error
  /too many requests|rate limit|wait a moment/i, // BRANDED_ERRORS.rate_limit — transient
];

function isRetryableError(err) {
  const msg = String(err?.message || err || "");
  return RETRYABLE_PATTERNS.some((re) => re.test(msg));
}

// Poll with a concurrent heartbeat so a slow provider never lets the lease
// (and with it, this worker's exclusive claim on the job) expire mid-poll.
// pollProviderResult (src/lib/providers.js) has no callback hook of its own
// — it's a single blocking loop with its own internal sleep/backoff — so the
// heartbeat runs on its own timer alongside the poll promise and is cleared
// the moment the poll settles, either way.
async function pollWithHeartbeat(provider, requestId, job, workerId) {
  const timer = setInterval(() => {
    heartbeatJob(job.id, workerId).catch((err) => {
      console.error(`[job-runner] heartbeat failed for job ${job.id}:`, err.message);
    });
  }, HEARTBEAT_INTERVAL_MS);
  try {
    return await pollProviderResult(provider, requestId);
  } finally {
    clearInterval(timer);
  }
}

// Rule 2 + rule 3: release the still-active reservation, or refund if it's
// already settled/gone — never both — and never let a credit-side failure
// throw out of here (it would mask whatever provider/ingest error got us
// here).
async function releaseOrRefund(generation, job) {
  const { userId, id: generationId, creditsUsed } = generation;
  const amount = job.payload?.creditsUsed ?? creditsUsed;
  try {
    let released = null;
    try {
      released = await releaseReservation(userId, generationId);
    } catch (err) {
      if (err?.message !== "No active reservation found") throw err;
      released = null; // fall through to refund below
    }
    if (released === null) {
      await refundCredits(userId, amount, generationId, "Generation failed");
    }
  } catch (creditErr) {
    console.error(
      `[job-runner] RELEASE/REFUND FAILED — user may be owed credits. userId=${userId} generationId=${generationId} amount=${amount}:`,
      creditErr.message
    );
  }
}

// Rule 1 + rule 3: settle at the generation's actual recorded cost. Never
// throws — a settle failure is logged loudly and the job still completes
// (the output is real and already recorded on the generation row);
// src/lib/reconciliation.js's sweep is the safety net for a wallet-side
// hiccup here, same as it is for every other settle call site in this app.
async function safeSettle(generation) {
  try {
    await settleReservation(generation.userId, generation.id, generation.creditsUsed);
  } catch (err) {
    console.error(
      `[job-runner] SETTLE FAILED — user may not be charged correctly. userId=${generation.userId} generationId=${generation.id} amount=${generation.creditsUsed}:`,
      err.message
    );
  }
}

// Conditional transition, mirroring src/lib/generation-webhook.js's own
// idempotency guard: only the caller that actually flips the row OUT of a
// non-terminal state gets to act on it. A concurrent winner (the webhook,
// or another worker that reclaimed a reaped lease) returns count 0 here —
// this function reports `false` and the caller must not move credits.
async function tryTransitionGeneration(generationId, data) {
  const result = await prisma.generation.updateMany({
    where: { id: generationId, status: { notIn: ["completed", "failed"] } },
    data,
  });
  return result.count > 0;
}

// Terminal or retry transition for a job that hit a provider/ingest error.
// `failJob` (src/lib/job-queue.js) owns the JOB row's own retry/dead state
// machine — this function only decides whether that error was retryable and,
// if the job just went terminal (`dead`), what it means for the generation
// and its credits (rules 2 and 4).
async function handleFailure(job, generation, err) {
  const retryable = isRetryableError(err);
  const message = err?.message || String(err);
  const result = await failJob(job.id, message, { retryable });

  if (result.willRetry) {
    // Still retryable and under maxAttempts — the job goes back to `queued`
    // with backoff. Rule 2 only applies to a TERMINAL failure, and this
    // isn't one: the reservation (if any) stays exactly as it is.
    return { outcome: "retry" };
  }

  // `dead` — terminal, whether from a non-retryable error or from
  // exhausting maxAttempts. Mark the generation failed and resolve credits,
  // but only if we're the one who actually wins the transition (rule 4 —
  // the webhook may already have terminalized this generation).
  const won = await tryTransitionGeneration(generation.id, { status: "failed", error: message });
  if (won) {
    await releaseOrRefund(generation, job);
  }
  return { outcome: "failed" };
}

// Execute one claimed job. Returns { outcome: "succeeded" | "failed" | "retry" }.
// `signal` is accepted for interface symmetry with the worker's graceful
// shutdown (Task 4) but is not currently wired into the provider calls —
// submitOnly/pollProviderResult (src/lib/providers.js) use their own
// internal AbortSignal.timeout() and don't accept an external one; the
// worker's shutdown strategy is to let the in-flight job finish rather than
// abort it mid-request (see docs/runbook-jobs.md).
export async function runJob(job, { workerId, signal } = {}) {
  void signal;

  const generation = await prisma.generation.findUnique({ where: { id: job.generationId } });

  if (!generation) {
    console.error(`[job-runner] Generation ${job.generationId} not found for job ${job.id} — marking job dead.`);
    await failJob(job.id, `Generation ${job.generationId} not found`, { retryable: false }).catch((err) => {
      console.error(`[job-runner] failJob also failed for orphaned job ${job.id}:`, err.message);
    });
    return { outcome: "failed" };
  }

  // Rule 4: the webhook (or a previous run of this same job) already
  // resolved the generation — no credit move, just close out the job.
  if (generation.status === "completed" || generation.status === "failed") {
    await completeJob(job.id, {});
    return { outcome: "succeeded" };
  }

  try {
    let providerRequestId = job.providerRequestId;
    let provider;
    let outputs = null;

    if (providerRequestId) {
      // Resuming a prior attempt (crash/lease-reap recovery) — the provider
      // already has this request; reconnect instead of re-submitting.
      provider = getProvider(job.providerName);
    } else {
      let submitResult;
      try {
        submitResult = await submitOnly(job.providerName, job.endpoint, job.payload);
      } catch (err) {
        return await handleFailure(job, generation, err);
      }
      provider = submitResult.provider;
      providerRequestId = submitResult.requestId;

      if (providerRequestId) {
        // Persist immediately — completeJob's sibling update, i.e. the same
        // direct row update shape but without the status flip — so a crash
        // between here and the terminal transition resumes by polling
        // instead of submitting to the provider a second time.
        await prisma.generationJob.update({
          where: { id: job.id },
          data: { providerRequestId },
        });
      }

      if (submitResult.immediateResult) {
        outputs = submitResult.immediateResult.outputs || [];
      }
    }

    if (!outputs) {
      try {
        const polled = await pollWithHeartbeat(provider, providerRequestId, job, workerId);
        outputs = polled.outputs || [];
      } catch (err) {
        return await handleFailure(job, generation, err);
      }
    }

    const localUrl = await downloadAllMedia(outputs);

    const won = await tryTransitionGeneration(generation.id, {
      status: "completed",
      outputUrl: localUrl || outputs?.[0] || generation.outputUrl,
    });
    if (won) {
      await safeSettle(generation);
    }
    // else: the webhook already completed (or failed) this generation first
    // — rule 4, no credit move.

    await completeJob(job.id, { providerRequestId });
    return { outcome: "succeeded" };
  } catch (err) {
    // Defensive: anything unexpected (a bug here, a transient DB hiccup)
    // funnels through the same classification/terminal-handling path
    // instead of crashing the worker process.
    return await handleFailure(job, generation, err);
  }
}

// Terminal timeout sweep (Phase 4A Task 7) — the risk this whole phase
// exists to close: a job whose timeoutAt has passed (queued too long, or
// stuck polling past the hard deadline) must ALWAYS end and ALWAYS return
// the user's credits, independent of whatever a worker is or isn't doing
// with it. findTimedOutJobs() (src/lib/job-queue.js) only REPORTS these rows
// — it never touches credits or job/generation status; this is where
// "timed out" gets translated into money and a terminal state, using the
// EXACT SAME translation runJob's handleFailure already uses for a live
// provider error (rule 2 in the file header above) — reused via
// tryTransitionGeneration/releaseOrRefund, not a second copy of the money
// logic.
//
// failJob(..., { retryable: false }) marks the job `dead` unconditionally
// (retryable:false always takes the dead branch of job-queue.js's state
// machine regardless of remaining attempts), mirroring how every other
// terminal-job transition in this codebase (handleFailure above,
// generation-webhook.js's failure branch) treats its own trigger as
// authoritative. The one race this leaves open — a worker completes the
// SAME job in the narrow window between findTimedOutJobs()'s snapshot and
// this function's failJob call — cannot cause a money bug:
// tryTransitionGeneration's conditional update below is the actual money
// gate, and it only fires while the generation is still non-terminal, so a
// job that genuinely just succeeded loses that race cleanly (count 0, no
// credit move) even though its job row may end up reading "dead" instead of
// "succeeded" — a job-row cosmetic race, not a wallet one.
const TIMEOUT_ERROR_MESSAGE = "Timed out waiting for the provider";

export async function sweepTimedOutJobs() {
  const rows = await findTimedOutJobs();
  let timedOut = 0;
  let refunded = 0;

  for (const job of rows) {
    await failJob(job.id, TIMEOUT_ERROR_MESSAGE, { retryable: false });
    timedOut++;

    const generation = await prisma.generation.findUnique({ where: { id: job.generationId } });
    if (!generation) {
      console.error(
        `[job-runner] sweepTimedOutJobs: generation ${job.generationId} not found for timed-out job ${job.id}`
      );
      continue;
    }

    const won = await tryTransitionGeneration(generation.id, {
      status: "failed",
      error: TIMEOUT_ERROR_MESSAGE,
    });
    if (won) {
      await releaseOrRefund(generation, job);
      refunded++;
    }
    // else: the webhook (or the worker's own runJob) already terminalized
    // this generation first — rule 4, no credit move, same as handleFailure.
  }

  return { timedOut, refunded };
}
