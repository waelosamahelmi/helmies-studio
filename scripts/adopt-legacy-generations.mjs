#!/usr/bin/env node
// Helmies Studio — legacy in-flight generation adoption (Phase 4A Task 8)
//
// One-shot, idempotent, re-runnable migration. The durable job queue
// (Tasks 1-7) replaced the old settle-on-submit path, but a deploy lands
// mid-flight for whatever requests were already in progress under the OLD
// code: those rows are stuck `Generation.status IN ('pending','processing')`
// with no `GenerationJob` — nothing in the new system will ever pick them
// up and finish them.
//
//   - If the row still carries a `requestId` (src/lib/generation-handler.js
//     records this once a provider request is known — see its header), the
//     provider already has this request in flight: ADOPT it. Create a
//     GenerationJob in `running` status carrying that requestId, with its
//     lease already expired. The queue's EXISTING crash/lease-reap recovery
//     path — reapExpiredLeases (src/lib/job-queue.js) requeues it to
//     `queued` on the worker's next 60s reap cycle (scripts/worker.mjs),
//     claimNextJob picks it up like any other crash-recovered job, and
//     job-runner.js's runJob already knows to RESUME by polling instead of
//     re-submitting whenever providerRequestId is already set (see its
//     header) — is reused exactly as-is, not reimplemented here. No credits
//     move for this branch: the reservation stays active until the resumed
//     job settles or releases it through the normal lifecycle.
//   - If it has no requestId, there is nothing to resume (the provider was
//     never reached, or we have no way to reconnect to it): mark it
//     `failed` with "Interrupted by a deployment" and release-or-refund the
//     still-active reservation. Same fallback order as job-runner.js's
//     releaseOrRefund and generation-webhook.js's failure branch — try
//     releaseReservation first, fall back to refundCredits only when
//     nothing is active to release (src/lib/wallet.js signals "nothing
//     active" two ways: returns null, or throws "No active reservation
//     found" on the narrow concurrent-race case; both are handled
//     identically). This is the third call site of that exact fallback in
//     this codebase — deliberately not extracted into a shared helper, same
//     as the other two.
//
// Idempotent by construction: the query is `status IN (pending,processing)
// AND no GenerationJob`. Every row this script touches leaves that set —
// either it gets a job, or it goes to `failed` — so a re-run naturally finds
// nothing left to do. No separate "already processed" bookkeeping exists or
// is needed.
//
// SAFETY: dry-run by default — computes and prints the plan, makes NO
// writes. `--apply` performs it; `--apply` without `--yes` refuses (same
// guard shape as scripts/reconcile-credits.mjs). Like every other script in
// scripts/, this reads DATABASE_URL straight from the environment with no
// built-in host allowlist — NEVER invoke it with a production DATABASE_URL.
// Against the disposable test container:
//   DATABASE_URL="postgresql://postgres:test@localhost:55432/test" node scripts/adopt-legacy-generations.mjs --apply --yes
// Prints userId only, never email (AGENTS.md PII rule — same as
// scripts/reconcile-credits.mjs's column table).
//
// Relative ".js"-extended imports (not the "@/lib/..." alias): this script
// runs under plain `node`, same reasoning as scripts/worker.mjs and
// scripts/reconcile-credits.mjs's headers.
import "dotenv/config";
import { pathToFileURL } from "node:url";
import prisma from "../src/lib/prisma.js";
import { releaseReservation, refundCredits } from "../src/lib/wallet.js";
import { resolveAdapterKey } from "../src/lib/providers.js";

const FAILURE_MESSAGE = "Interrupted by a deployment";
// Same 30-minute default window enqueueJob (src/lib/job-queue.js) uses for a
// brand-new job — an adopted job gets a fresh deadline rather than
// inheriting whatever the original (pre-Phase-4A) request's own timing was.
const ADOPTED_TIMEOUT_MS = 30 * 60 * 1000;

// Rule-2-equivalent (job-runner.js's releaseOrRefund / generation-webhook.js's
// failure branch): release the still-active reservation, or refund if it's
// already settled/gone — never both — and never throw out of here. A
// credit-side failure is logged loudly instead of aborting the rest of the
// script's run, mirroring the crash-net shape used everywhere else money
// moves in this codebase.
async function releaseOrRefund(generation) {
  const { userId, id: generationId, creditsUsed } = generation;
  if (!creditsUsed || creditsUsed <= 0) return { moved: false };
  try {
    let released = null;
    try {
      released = await releaseReservation(userId, generationId);
    } catch (err) {
      if (err?.message !== "No active reservation found") throw err;
      released = null; // fall through to refund below
    }
    if (released === null) {
      await refundCredits(userId, creditsUsed, generationId, FAILURE_MESSAGE);
    }
    return { moved: true };
  } catch (creditErr) {
    console.error(
      `[adopt-legacy-generations] RELEASE/REFUND FAILED — user may be owed credits. userId=${userId} generationId=${generationId} amount=${creditsUsed}:`,
      creditErr.message
    );
    return { moved: false, error: creditErr.message };
  }
}

// Candidate rows: pending/processing generations with no GenerationJob.
// GenerationJob has no Prisma relation declared on Generation (it's a
// deliberately standalone, key-addressed table — same as job-queue.js's
// header notes for StripeEvent/AnonRateLimit), so this is a plain
// findMany + set-difference rather than a `job: null` relation filter.
async function findLegacyCandidates() {
  const pending = await prisma.generation.findMany({
    where: { status: { in: ["pending", "processing"] } },
  });
  if (pending.length === 0) return [];
  const jobs = await prisma.generationJob.findMany({
    where: { generationId: { in: pending.map((g) => g.id) } },
    select: { generationId: true },
  });
  const withJob = new Set(jobs.map((j) => j.generationId));
  return pending.filter((g) => !withJob.has(g.id));
}

// Provider resolution for the adopted job's providerName. The resume branch
// of job-runner.js's runJob calls getProvider(job.providerName) (no submit,
// no endpoint/payload use at all) once providerRequestId is already set —
// getProvider (src/lib/providers.js) indexes its PROVIDERS map with a
// case-sensitive direct lookup, so job.providerName MUST be the canonical
// lowercase adapter key ("kie", "alibaba"), never the raw
// ModelPricing.providerName DB string (e.g. "Alibaba", mixed case): passing
// "Alibaba" straight through would silently miss the index and fall back to
// DEFAULT_PROVIDER ("kie") — every adopted Alibaba-model job would resume
// its poll against the wrong provider's API (verified empirically: also
// true of resolveProvider(modelId).name in src/lib/providers.js, which
// carries its OWN separate, pre-existing bug that makes it unsuitable here
// — see resolveAdapterKey's export comment in that file for the full
// explanation). resolveAdapterKey is exported specifically for this call
// site: it does the same lowercasing + alias-matching normalization
// resolveProvider is SUPPOSED to expose, without going through
// resolveProvider's buggy return shape. Never throws — an unknown/missing
// providerName normalizes to the default adapter key ("kie"), same
// fallback getProvider() itself would apply anyway.
async function resolveProviderName(model) {
  const pricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
  return resolveAdapterKey(pricing?.providerName);
}

function planFor(generation) {
  return { generation, action: generation.requestId ? "adopt" : "fail" };
}

async function applyAdopt(generation) {
  const providerName = await resolveProviderName(generation.model);
  const now = new Date();
  await prisma.generationJob.create({
    data: {
      generationId: generation.id,
      userId: generation.userId,
      idempotencyKey: `legacy-adopt-${generation.id}`,
      status: "running",
      providerRequestId: generation.requestId,
      providerName,
      payload: {},
      // Lease already expired — see the file header: the next
      // reapExpiredLeases cycle requeues this immediately, and it resumes
      // through the exact same crash-recovery path a genuinely crashed
      // worker's job would.
      leaseUntil: new Date(now.getTime() - 1000),
      lockedBy: null,
      timeoutAt: new Date(now.getTime() + ADOPTED_TIMEOUT_MS),
    },
  });
  return { generationId: generation.id, userId: generation.userId, action: "adopted" };
}

async function applyFail(generation) {
  // Conditional transition — same CAS guard as tryTransitionGeneration
  // (job-runner.js) and generation-webhook.js's failure branch — so a row
  // that somehow already went terminal between the candidate scan and this
  // write is never double-refunded.
  const transitioned = await prisma.generation.updateMany({
    where: { id: generation.id, status: { notIn: ["completed", "failed"] } },
    data: { status: "failed", error: FAILURE_MESSAGE },
  });
  let refundResult = { moved: false };
  if (transitioned.count > 0) {
    refundResult = await releaseOrRefund(generation);
  }
  return { generationId: generation.id, userId: generation.userId, action: "failed", ...refundResult };
}

// Exported entry point. `apply: false` (the default) is a pure read — it
// computes and returns the plan, making NO database writes at all. The
// integration test calls this directly in apply mode, bypassing the CLI's
// own argv/--yes guard entirely (that guard is a terminal-operator safety
// net, not part of this function's own contract).
export async function adoptLegacyGenerations({ apply = false } = {}) {
  const candidates = await findLegacyCandidates();
  const plans = candidates.map(planFor);
  const planRows = plans.map((p) => ({ generationId: p.generation.id, userId: p.generation.userId, action: p.action }));

  if (!apply) {
    return {
      applied: false,
      total: plans.length,
      toAdopt: plans.filter((p) => p.action === "adopt").length,
      toFail: plans.filter((p) => p.action === "fail").length,
      plan: planRows,
    };
  }

  const results = [];
  for (const { generation, action } of plans) {
    results.push(action === "adopt" ? await applyAdopt(generation) : await applyFail(generation));
  }

  return {
    applied: true,
    total: results.length,
    adopted: results.filter((r) => r.action === "adopted").length,
    failed: results.filter((r) => r.action === "failed").length,
    plan: planRows,
    results,
  };
}

// ── CLI entry point ──
async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const yes = args.includes("--yes");

  if (apply && !yes) {
    console.error("Refusing --apply without --yes (safety guard) — no changes made. Re-run with both flags to apply.");
    process.exit(1);
  }

  const result = await adoptLegacyGenerations({ apply });

  const col = (v, w) => String(v).padEnd(w);
  console.log(col("userId", 30), col("generationId", 30), col("action", 10));
  for (const row of result.plan) {
    console.log(col(row.userId, 30), col(row.generationId, 30), col(row.action, 10));
  }
  console.log("");

  if (!result.applied) {
    console.log(`${result.total} legacy generation(s) found: ${result.toAdopt} to adopt, ${result.toFail} to fail-and-refund.`);
    console.log("Dry run only — no changes made. Re-run with --apply --yes to perform this plan.");
    process.exit(0);
  }

  console.log(`${result.total} legacy generation(s) processed: ${result.adopted} adopted, ${result.failed} failed-and-refunded.`);
  process.exit(0);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((err) => {
    console.error("[adopt-legacy-generations] fatal:", err);
    process.exit(1);
  });
}
