// Shared handler for the generation provider callbacks. Both
// src/app/api/webhooks/generation-complete/route.js and
// src/app/api/webhooks/generation/route.js are thin wrappers around
// handleGenerationWebhook — they only own the transport concerns (reading
// headers/auth, parsing the request body, translating the returned
// { status, response } into a NextResponse).
//
// Refund rule (money-correctness): a failure delivery only refunds if it is
// the delivery that actually transitions the Generation out of a
// non-terminal state. The transition + refund happen inside one
// prisma.$transaction so a crash between them can never leave the row
// "failed" with no refund, or refund without the row settling to "failed".
// A second (duplicate/retried) delivery for an already-terminal generation
// short-circuits to `alreadyProcessed` before the transaction ever opens,
// and — belt and suspenders — the conditional `updateMany` inside the
// transaction guards against a race between two concurrent deliveries too:
// only the one that matches `status notIn [failed, completed]` gets count 1
// and issues the refund.
//
// Phase 4A Task 6 — job-aware completion. Two changes from the pre-Task-6
// version of this file:
//
//   1. Generation LOOKUP. Since Task 5, /api/generate/async no longer
//      submits inline — the job runner (src/lib/job-runner.js) does, and it
//      persists the provider's request id onto GenerationJob.providerRequestId,
//      never onto Generation.requestId. So for any generation created after
//      Task 5 shipped, the three legacy lookup paths below (all keyed off
//      Generation.requestId, still written directly by the synchronous
//      /api/generate/* routes via src/lib/generation-handler.js) would never
//      match — this webhook would 404 every async-path callback. The job
//      table is checked FIRST to cover that case; the legacy paths remain
//      for sync-route generations.
//   2. SETTLE. On success, the generation may complete via either this
//      webhook OR the job runner polling the same provider result — same
//      race the runner's own header documents. Exactly-once is enforced by
//      the SAME conditional-transition ("CAS") pattern the failure path
//      already used: only the delivery whose `updateMany` actually flips
//      Generation.status out of a non-terminal state settles credits. That
//      transition, the settle, and the job's own terminal transition all
//      happen inside one prisma.$transaction — mirrors
//      src/lib/job-runner.js's tryTransitionGeneration + safeSettle guards
//      exactly; no second pattern was invented for this file.
//   3. FAILURE MONEY FIX (found while proving #2 against the real test DB,
//      not named in the Task 6 brief). Before Task 5, a failure webhook
//      could only ever arrive AFTER the reservation had already been
//      settled inline by the old synchronous route — so this branch's
//      unconditional `refundCredits` call happened to be dollar-correct by
//      accident (there was never an ACTIVE reservation left for it to
//      mishandle). Task 5 changes that: the reservation now stays ACTIVE
//      until something settles it, so a job that fails before either the
//      runner or this webhook ever settles now hits this branch with an
//      active reservation still open. `refundCredits` alone only credits
//      `available` — it never decrements `reserved` or closes the
//      CreditReservation row (see src/lib/wallet.js), which would leave
//      `reserved` permanently overstated and a phantom "active" reservation
//      behind forever (violating wallet.js's own documented invariant:
//      `reserved == Σ amount of active CreditReservation rows`). Fixed by
//      reusing job-runner.js's `releaseOrRefund` fallback exactly: try
//      `releaseReservation` first (closes the still-active hold cleanly),
//      and fall back to `refundCredits` only when nothing is active to
//      release (the legacy/already-settled case, which is what every
//      existing test below exercises).
//   4. CRITICAL-1 FIX (found in review): a job carrying payload.templateRunId
//      belongs to a Phase 6 TemplateRun step — src/lib/template-runner.js's
//      advanceTemplateRun is the ONLY thing that may move money or chain to
//      the next step for it (see that file's own header). Before this fix,
//      a provider callback that reached THIS webhook first (a real,
//      common race — job-runner.js's own poll is not always first) won the
//      CAS below, terminalized the generation, and then just stopped: the
//      per-generation settle/release this file otherwise does doesn't apply
//      to a template-run step (it never held its own reservation), and
//      nothing else was watching that generation, so the run stayed
//      "running" forever with its reservation still fully held (settled 30
//      minutes later only by sweepExpiredReservations, and only correctly
//      since the CRITICAL-2 fix in wallet.js). Fixed exactly like
//      job-runner.js's own three call sites: after winning the CAS, if the
//      job payload carries templateRunId, call advanceTemplateRun instead
//      of (not in addition to) the normal settle/release — whichever of
//      {this webhook, job-runner.js} actually wins the conditional
//      transition is the one that advances the run, never both.
import prisma from "@/lib/prisma";
import { log } from "@/lib/log";
import { refundCredits, settleReservation, releaseReservation } from "@/lib/wallet";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { extractKieResults } from "@/lib/media-download";
import { advanceTemplateRun } from "@/lib/template-runner";
import { advanceAgentRun } from "@/lib/agent-runner";
import { recordGenerationAsset } from "@/lib/assets-core";

// Phase A: agent-run steps follow the exact CRITICAL-1 pattern documented
// above for template runs — the run's ONE reservation is owned by
// advanceAgentRun; this webhook only terminalizes the generation and then
// hands off (never settles/releases a step's own nonexistent reservation).
async function safeAdvanceAgentRun(runId) {
  try {
    await advanceAgentRun(runId);
  } catch (err) {
    console.error(`[generation-webhook] advanceAgentRun FAILED for agent run ${runId}:`, err.message);
  }
}

// Never let a template run's own money/chaining logic throw out of the
// webhook — mirrors job-runner.js's identical safeAdvanceTemplateRun (kept
// as an independent copy here rather than an export from that file, since
// this one is only ever used from this Next-bundled route context, not the
// worker).
async function safeAdvanceTemplateRun(runId) {
  try {
    await advanceTemplateRun(runId);
  } catch (err) {
    console.error(`[generation-webhook] advanceTemplateRun FAILED for template run ${runId}:`, err.message);
  }
}

// Ingest the provider's primary output through the unified ingest path
// (Phase 4B Task 4). Mirrors src/lib/job-runner.js's ingestFirstOutput
// exactly (same contract as the downloadAllMedia this replaced: null on no
// outputs, never throws — falls back to the raw provider url on a
// download/strip failure rather than turning a successful generation into a
// 500 that would abort the transaction below and leave the row stuck
// non-terminal). Only the first url is ingested — matches what's actually
// used: outputUrl is a single field.
async function ingestFirstOutput(urls) {
  if (!urls || urls.length === 0) return null;
  const url = urls[0];
  if (typeof url !== "string" || url.startsWith("/api/media/local/")) return url ?? null;
  try {
    const ingested = await ingestFromUrl(url);
    return ingested.url;
  } catch (err) {
    log.error("generation_webhook_ingest_fallback", { url, err });
    return url;
  }
}

export async function handleGenerationWebhook(body) {
  try {
    // Parse the KIE callback format (plus generic request_id fields for
    // backward compat). This extraction is identical between the two
    // legacy routes — there was never a real payload-format difference
    // between them, only a difference in how far the generation lookup
    // fell back (see below).
    const kie = extractKieResults(body);

    const requestId = kie?.taskId || body.request_id || body.data?.request_id || body.taskId || body.data?.taskId;
    const status = kie?.state || body.status || body.data?.status;
    const urls = kie?.urls || body.outputs || body.data?.output || (body.output_url ? [body.output_url] : []);
    const errorMsg = kie?.error || body.error || body.data?.error || body.msg;

    if (!requestId) {
      return { status: 400, response: { error: "Missing task/request ID" } };
    }

    // Primary lookup (Task 6): job-backed (Task 5 async) generations only.
    // See the file header — Generation.requestId is never set for these.
    let job = await prisma.generationJob.findFirst({ where: { providerRequestId: requestId } }).catch(() => null);

    let generation = job
      ? await prisma.generation.findUnique({ where: { id: job.generationId } }).catch(() => null)
      : null;

    if (!generation) {
      generation = await prisma.generation.findFirst({
        where: { requestId },
      }).catch(() => null);
    }

    if (!generation) {
      generation = await prisma.generation.findFirst({
        where: { params: { path: ["requestId"], equals: requestId } },
      }).catch(() => null);
    }

    if (!generation) {
      // Fallback: some callers pass the Generation's own id as the
      // "request id" (this was only present in one of the two legacy
      // routes; kept here since it's a strict superset — it only kicks in
      // once both requestId-based lookups above have already failed).
      generation = await prisma.generation.findFirst({
        where: { id: requestId },
      }).catch(() => null);
    }

    if (!generation) {
      return { status: 404, response: { error: "Generation not found" } };
    }

    // Idempotency guard: a generation that already reached a terminal state
    // must not be re-processed — replaying a "failed" callback would credit
    // the user again on every delivery.
    if (generation.status === "failed" || generation.status === "completed") {
      return { status: 200, response: { success: true, alreadyProcessed: true, status: generation.status } };
    }

    // A generation found via one of the legacy paths above may STILL have a
    // job row (e.g. the runner submitted but this delivery landed before it
    // finished persisting providerRequestId) — look it up by generationId so
    // the job-termination logic below still runs.
    if (!job) {
      job = await prisma.generationJob.findUnique({ where: { generationId: generation.id } }).catch(() => null);
    }

    const normalizedStatus = status?.toLowerCase();
    const isSuccess = normalizedStatus === "completed" || normalizedStatus === "succeeded" || normalizedStatus === "success";
    const isFail = normalizedStatus === "failed" || normalizedStatus === "error" || normalizedStatus === "fail";

    if (isSuccess) {
      // Download media to our server — I/O, deliberately outside the
      // transaction below (mirrors src/lib/job-runner.js, which also
      // downloads before its own conditional transition).
      let localUrl = null;
      if (urls && urls.length > 0) {
        localUrl = await ingestFirstOutput(urls);
      }

      const isTemplateStep = Boolean(job?.payload?.templateRunId);
      const isAgentStep = Boolean(job?.payload?.agentRunId);
      const isRunStep = isTemplateStep || isAgentStep;

      let won = false;
      await prisma.$transaction(async (tx) => {
        // Same CAS as the failure path below: only the delivery that
        // actually flips the row out of a non-terminal state may settle.
        const transitioned = await tx.generation.updateMany({
          where: { id: generation.id, status: { notIn: ["failed", "completed"] } },
          data: { status: "completed", outputUrl: localUrl || urls?.[0] || generation.outputUrl },
        });
        won = transitioned.count > 0;

        // CRITICAL-1 / Phase A: a run step (template or agent) never held
        // its own reservation — settle here only for a normal generation.
        if (won && !isRunStep && generation.creditsUsed > 0) {
          // Never let a settle failure roll back a successful ingest —
          // mirrors job-runner.js's safeSettle exactly (a credit-side
          // failure must never mask the original provider/ingest result).
          // src/lib/reconciliation.js's sweep is the safety net for a
          // wallet-side hiccup here, same as every other settle call site.
          try {
            await settleReservation(generation.userId, generation.id, generation.creditsUsed, tx);
          } catch (err) {
            log.error("generation_settle_failed", {
              userId: generation.userId,
              generationId: generation.id,
              amount: generation.creditsUsed,
              err,
            });
          }
        }

        if (job) {
          // Unconditional, mirroring job-runner's own unconditional
          // completeJob call: this delivery genuinely observed the provider
          // report success, independent of who won the credit race above.
          // Idempotent/harmless if the runner already did the same thing.
          await tx.generationJob.update({
            where: { id: job.id },
            data: { status: "succeeded", leaseUntil: null, lockedBy: null, providerRequestId: requestId },
          });
        }
      });

      // Outside the transaction (advanceTemplateRun does its own DB
      // read/writes against the now-committed generation row) — only the
      // delivery that actually won the CAS above advances the run, exactly
      // once, mirroring job-runner.js's own three call sites.
      if (won && isTemplateStep) {
        await safeAdvanceTemplateRun(job.payload.templateRunId);
      }
      if (won && isAgentStep) {
        // A1.4.3: durable agent media steps land in the asset library too.
        try {
          const fresh = await prisma.generation.findUnique({ where: { id: generation.id } });
          await recordGenerationAsset(fresh || { ...generation, outputUrl: localUrl || generation.outputUrl });
        } catch (err) {
          log.error("asset_record_wrapper_failed", { generationId: generation.id, err });
        }
        await safeAdvanceAgentRun(job.payload.agentRunId);
      }

      return { status: 200, response: { success: true, downloaded: !!localUrl } };
    }

    if (isFail) {
      const isTemplateStep = Boolean(job?.payload?.templateRunId);
      const isAgentStep = Boolean(job?.payload?.agentRunId);
      const isRunStep = isTemplateStep || isAgentStep;

      const txResult = await prisma.$transaction(async (tx) => {
        // Conditional write: only the delivery that actually transitions the
        // row out of a non-terminal state is allowed to issue the refund.
        const transitioned = await tx.generation.updateMany({
          where: { id: generation.id, status: { notIn: ["failed", "completed"] } },
          data: { status: "failed", error: errorMsg || "Generation failed" },
        });
        if (transitioned.count === 0) return { alreadyProcessed: true, won: false };

        if (job) {
          // A provider-reported failure is authoritative — go straight to
          // `dead`, not through job-queue.js's retryable failJob (retrying
          // would just resubmit to a provider that already said no).
          await tx.generationJob.update({
            where: { id: job.id },
            data: { status: "dead", leaseUntil: null, lockedBy: null, lastError: errorMsg || "Generation failed" },
          });
        }

        // CRITICAL-1 / Phase A: a run step's failure closes out the WHOLE
        // run via its runner (called AFTER this transaction commits below)
        // — this step's own Generation never held its own reservation, so
        // skip the normal per-generation release/refund below entirely.
        if (!isRunStep && generation.creditsUsed > 0) {
          // Release the still-active reservation when there is one (the
          // common post-Task-5 case — nothing has settled yet); fall back
          // to refundCredits only when there's nothing active to release
          // (already settled elsewhere, or a legacy sync-route generation).
          // Mirrors job-runner.js's releaseOrRefund exactly — see point 3
          // in the file header.
          let released = null;
          try {
            released = await releaseReservation(generation.userId, generation.id, tx);
          } catch (err) {
            if (err?.message !== "No active reservation found") throw err;
            released = null; // fall through to refund below
          }
          if (released === null) {
            await refundCredits(generation.userId, generation.creditsUsed, generation.id,
              `Refund: ${errorMsg || "Failed generation"}`, tx);
          }
        }
        return { refunded: !isRunStep && generation.creditsUsed > 0, won: true };
      });

      if (txResult.alreadyProcessed) {
        return { status: 200, response: { success: true, alreadyProcessed: true } };
      }

      // Outside the transaction, same rationale as the success branch above
      // — only the delivery that won the CAS advances the run, exactly once.
      if (txResult.won && isTemplateStep) {
        await safeAdvanceTemplateRun(job.payload.templateRunId);
      }
      if (txResult.won && isAgentStep) {
        await safeAdvanceAgentRun(job.payload.agentRunId);
      }

      return { status: 200, response: { success: true, refunded: txResult.refunded } };
    }

    // Still processing
    return { status: 200, response: { success: true, status: normalizedStatus } };
  } catch {
    return { status: 500, response: { error: "Internal error" } };
  }
}
