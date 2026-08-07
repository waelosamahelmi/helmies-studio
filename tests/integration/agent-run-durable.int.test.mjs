// Phase A (A1.10.2) — the durable agent run against a real database.
//
// The retired executor ran an agent production as a detached promise inside
// the web process: a PM2 restart lost every remaining step AND the unused
// budget, because the money was a full-estimate debitWallet taken up front.
// The durable engine replaces that with the proven TemplateRun shape — one
// reservation per run, every step a row on the GenerationJob queue — so the
// HTTP connection and the web process are both non-load-bearing.
//
// These tests never invoke runJob/pollProviderResult. They drive completions
// through generation-webhook.js alone, which is exactly what a restart looks
// like from the provider's side: the process that started the run is gone,
// the callback still arrives, and the run must still finish and settle
// EXACTLY once.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

vi.mock("@/lib/storage/ingest", () => ({ ingestFromUrl: vi.fn() }));

import { ingestFromUrl } from "@/lib/storage/ingest";

let prisma;

beforeEach(async () => {
  prisma = await resetDb();
  vi.clearAllMocks();
});

const IMAGE_MODEL = "alibaba:wan2.7-image";

async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-agentrun-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

async function seedCatalog() {
  const { syncAlibabaModels } = await import("@/lib/model-catalog");
  await syncAlibabaModels();
}

const imageStep = (task, prompt) => ({
  agent: "image",
  task,
  params: { prompt, model: IMAGE_MODEL },
});

// Attach a provider request id to a step's job so the webhook can address it,
// the same way the runner does right after submitOnly.
async function addressableJob(runId, stepId) {
  const step = await prisma.agentRunStep.findFirst({ where: { runId, stepId } });
  const job = await prisma.generationJob.findUnique({ where: { generationId: step.generationId } });
  const requestId = `agent-int-req-${randomUUID()}`;
  await prisma.generationJob.update({ where: { id: job.id }, data: { providerRequestId: requestId } });
  return { step, job, requestId };
}

const walletOf = (userId) => prisma.creditWallet.findUnique({ where: { userId } });
const runOf = (runId) => prisma.agentRun.findUnique({ where: { id: runId } });
const stepsOf = (runId) => prisma.agentRunStep.findMany({ where: { runId }, orderBy: { stepIndex: "asc" } });

describe("durable agent run — money and state across a simulated restart", () => {
  it("reserves once, runs two independent steps, and settles exactly the succeeded actuals", async () => {
    const { startAgentRun } = await import("@/lib/agent-runner");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    await seedCatalog();

    const res = await startAgentRun({
      userId: user.id,
      task: "Two stills",
      plan: { summary: "Two stills", steps: [imageStep("Hero", "a fox in snow"), imageStep("Poster", "a poster")] },
    });
    expect(res.queued).toBe(true);
    const runId = res.runId;
    const reserved = res.estimate.total;
    expect(reserved).toBeGreaterThan(0);

    // ONE reservation for the whole run — not a debit, and not per step.
    let wallet = await walletOf(user.id);
    expect(wallet.available).toBe(1000 - reserved);
    expect(wallet.reserved).toBe(reserved);

    // Both steps are independent roots: the DAG enqueues them together.
    let steps = await stepsOf(runId);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.status === "queued")).toBe(true);
    expect(steps.every((s) => s.generationId)).toBe(true);

    // Every step's own Generation is created at zero credits — the run's
    // reservation owns the money, so a step can never double-charge.
    const gens = await prisma.generation.findMany({ where: { id: { in: steps.map((s) => s.generationId) } } });
    expect(gens.every((g) => g.creditsUsed === 0)).toBe(true);

    const j1 = await addressableJob(runId, "step-1");
    expect(j1.job.payload.agentRunId).toBe(runId);
    expect(j1.job.idempotencyKey).toBe(`agent-run-${runId}-step-1`);

    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/agent-step1.png" });
    const r1 = await handleGenerationWebhook({
      request_id: j1.requestId,
      status: "completed",
      outputs: ["https://provider.example/agent-step1.png"],
    });
    expect(r1.status).toBe(200);

    // Half done: nothing settled, nothing released — the run still holds its
    // single reservation.
    wallet = await walletOf(user.id);
    expect(wallet.available).toBe(1000 - reserved);
    expect(wallet.reserved).toBe(reserved);
    expect((await runOf(runId)).status).toBe("executing");

    const j2 = await addressableJob(runId, "step-2");
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/agent-step2.png" });
    const r2 = await handleGenerationWebhook({
      request_id: j2.requestId,
      status: "completed",
      outputs: ["https://provider.example/agent-step2.png"],
    });
    expect(r2.status).toBe(200);

    const run = await runOf(runId);
    expect(run.status).toBe("completed");
    expect(run.creditsUsed).toBe(reserved);

    steps = await stepsOf(runId);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded"]);
    expect(steps[0].outputUrl).toBe("/api/media/local/agent-step1.png");

    wallet = await walletOf(user.id);
    expect(wallet.reserved).toBe(0);
    expect(wallet.available).toBe(1000 - reserved);

    // Settled exactly once, against the run id.
    const settleRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "generation", referenceId: runId },
    });
    expect(settleRows).toHaveLength(1);
    expect(settleRows[0].amount).toBe(-reserved);

    // A1.4.3: durable media steps land in the asset library.
    const assets = await prisma.asset.findMany({ where: { userId: user.id } });
    expect(assets.length).toBe(2);

    expect((await reconcileWallet(user.id)).ok).toBe(true);
  });

  it("a duplicate webhook delivery never settles twice", async () => {
    const { startAgentRun, advanceAgentRun } = await import("@/lib/agent-runner");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    await seedCatalog();

    const res = await startAgentRun({
      userId: user.id,
      task: "One still",
      plan: { summary: "One still", steps: [imageStep("Hero", "a fox")] },
    });
    const runId = res.runId;
    const reserved = res.estimate.total;

    const j1 = await addressableJob(runId, "step-1");
    ingestFromUrl.mockResolvedValue({ url: "/api/media/local/agent-dupe.png" });

    const body = { request_id: j1.requestId, status: "completed", outputs: ["https://provider.example/agent-dupe.png"] };
    await handleGenerationWebhook(body);
    // Redelivery + an extra bare advance (the worker tick racing the webhook).
    await handleGenerationWebhook(body);
    await advanceAgentRun(runId);
    await advanceAgentRun(runId);

    const wallet = await walletOf(user.id);
    expect(wallet.reserved).toBe(0);
    expect(wallet.available).toBe(1000 - reserved);

    const settleRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "generation", referenceId: runId },
    });
    expect(settleRows).toHaveLength(1);
    expect((await runOf(runId)).status).toBe("completed");
    expect((await reconcileWallet(user.id)).ok).toBe(true);
  });

  it("a failed step is never charged: its sibling settles, the remainder is released", async () => {
    const { startAgentRun } = await import("@/lib/agent-runner");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    await seedCatalog();

    const res = await startAgentRun({
      userId: user.id,
      task: "Two stills",
      plan: { summary: "Two stills", steps: [imageStep("Hero", "a fox"), imageStep("Poster", "a poster")] },
    });
    const runId = res.runId;
    const reserved = res.estimate.total;

    const j1 = await addressableJob(runId, "step-1");
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/agent-ok.png" });
    await handleGenerationWebhook({
      request_id: j1.requestId,
      status: "completed",
      outputs: ["https://provider.example/agent-ok.png"],
    });

    const j2 = await addressableJob(runId, "step-2");
    await handleGenerationWebhook({ request_id: j2.requestId, status: "failed", error: "provider rejected" });

    const run = await runOf(runId);
    expect(run.status).toBe("failed");

    const steps = await stepsOf(runId);
    expect(steps.map((s) => s.status)).toEqual(["succeeded", "failed"]);
    expect(steps[1].creditsActual).toBeNull();

    // Charged for the one that worked; the failed half came back.
    const charged = run.creditsUsed;
    expect(charged).toBe(steps[0].creditsActual);
    expect(charged).toBeLessThan(reserved);

    const wallet = await walletOf(user.id);
    expect(wallet.reserved).toBe(0);
    expect(wallet.available).toBe(1000 - charged);
    expect((await reconcileWallet(user.id)).ok).toBe(true);
  });

  it("cancelling releases the whole reservation and skips pending work", async () => {
    const { startAgentRun, advanceAgentRun } = await import("@/lib/agent-runner");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    await seedCatalog();

    const res = await startAgentRun({
      userId: user.id,
      task: "Two stills",
      plan: { summary: "Two stills", steps: [imageStep("Hero", "a fox"), imageStep("Poster", "a poster")] },
    });
    const runId = res.runId;

    await prisma.agentRun.update({ where: { id: runId }, data: { cancelRequested: true } });
    await advanceAgentRun(runId);

    const run = await runOf(runId);
    expect(run.status).toBe("cancelled");

    const wallet = await walletOf(user.id);
    expect(wallet.reserved).toBe(0);
    expect(wallet.available).toBe(1000); // nothing was charged

    const settleRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "generation", referenceId: runId },
    });
    expect(settleRows).toHaveLength(0);
    expect((await reconcileWallet(user.id)).ok).toBe(true);
  });

  it("sweepStaleAgentRuns finalizes a run whose advance was lost mid-flight", async () => {
    const { startAgentRun, sweepStaleAgentRuns } = await import("@/lib/agent-runner");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    await seedCatalog();

    const res = await startAgentRun({
      userId: user.id,
      task: "One still",
      plan: { summary: "One still", steps: [imageStep("Hero", "a fox")] },
    });
    const runId = res.runId;
    const reserved = res.estimate.total;

    // The step's generation completed but the process died before the
    // advance ran: the run is stuck `executing` with no live work.
    const step = await prisma.agentRunStep.findFirst({ where: { runId, stepId: "step-1" } });
    await prisma.generation.update({
      where: { id: step.generationId },
      data: { status: "completed", outputUrl: "/api/media/local/agent-stale.png" },
    });
    // Prisma's @updatedAt rewrites an explicitly-passed updatedAt on every
    // update, so the backdate has to bypass the client.
    await prisma.$executeRawUnsafe(
      `UPDATE "public"."AgentRun" SET "updatedAt" = NOW() - INTERVAL '30 minutes' WHERE "id" = $1`,
      runId
    );

    // A run with in-flight work is left alone; this one has none.
    const swept = await sweepStaleAgentRuns({ staleMinutes: 10 });
    expect(swept.advanced).toBeGreaterThanOrEqual(1);

    const run = await runOf(runId);
    expect(run.status).toBe("completed");
    expect(run.creditsUsed).toBe(reserved);

    const wallet = await walletOf(user.id);
    expect(wallet.reserved).toBe(0);
    expect((await reconcileWallet(user.id)).ok).toBe(true);
  });
});
