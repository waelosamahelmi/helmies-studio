// Phase 6 review fix — CRITICAL 1: a real provider callback frequently
// arrives at the webhook BEFORE (or instead of) the job runner's own poll
// ever completes — a common production race, not an edge case. Before this
// fix, generation-webhook.js won that race, terminalized the generation,
// and just stopped: it had no idea a job carrying payload.templateRunId
// needs advanceTemplateRun called on it, so the run stayed "running"
// forever with its reservation still fully held (only ever resolved 30+
// minutes later by the reservation-expiry sweep). This proves the webhook
// path alone — never touching runJob/pollProviderResult at all — correctly
// chains step 1 -> step 2 and settles once step 2 completes, exactly like
// tests/integration/template-run.int.test.mjs already proves for the
// job-runner-wins-the-race path.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
}));

import { ingestFromUrl } from "@/lib/storage/ingest";

let prisma;

beforeEach(async () => {
  prisma = await resetDb();
  vi.clearAllMocks();
});

async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-webhookrun-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

const STEP1_MODEL = "alibaba:wan2.7-image";
const STEP2_MODEL = "alibaba:wan2.7-i2v";

async function seedTwoStepTemplate() {
  const { syncAlibabaModels } = await import("@/lib/model-catalog");
  await syncAlibabaModels();

  const graph = {
    steps: [
      { id: "step1", tool: "image", modelId: STEP1_MODEL, inputs: { prompt: "A webhook-race test cover photo" }, dependsOn: [] },
      {
        id: "step2",
        tool: "i2v",
        modelId: STEP2_MODEL,
        inputs: { prompt: "Animate it gently", image_url: "$step1.output", duration: 5, resolution: "720p" },
        dependsOn: ["step1"],
      },
    ],
    sampleInputs: {},
  };

  const template = await prisma.template.create({
    data: {
      slug: `int-webhook-race-${randomUUID()}`,
      name: "Integration Webhook Race",
      description: "template-run-webhook integration fixture",
      category: "marketing",
      toolType: "image",
      config: {},
      isPublished: true,
    },
  });
  const version = await prisma.templateVersion.create({
    data: { templateId: template.id, version: 1, graph, status: "published" },
  });

  return { template, version };
}

describe("generation-webhook.js — a webhook-first completion advances a template run", () => {
  it("chains step1 -> step2 and settles once step2 completes, entirely through the webhook path (runJob never called)", async () => {
    const { startTemplateRun } = await import("@/lib/template-runner");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    const { template } = await seedTwoStepTemplate();

    const { runId, totalCredits } = await startTemplateRun({ userId: user.id, slug: template.slug, inputs: {} });

    let run = await prisma.templateRun.findUnique({ where: { id: runId } });
    const job1 = await prisma.generationJob.findUnique({ where: { generationId: run.stepState.step1.generationId } });
    expect(job1.payload.templateRunId).toBe(runId);

    // Simulate the provider's own callback winning the race: the runner
    // would normally persist providerRequestId right after submitOnly,
    // then poll — here the webhook delivers success BEFORE any poll ever
    // happens (runJob/pollProviderResult are never invoked in this test at
    // all).
    const req1 = `webhook-race-req-${randomUUID()}`;
    await prisma.generationJob.update({ where: { id: job1.id }, data: { providerRequestId: req1 } });
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/webhook-step1.png" });

    const result1 = await handleGenerationWebhook({
      request_id: req1,
      status: "completed",
      outputs: ["https://provider.example/webhook-step1.png"],
    });
    expect(result1.status).toBe(200);
    expect(result1.response).toMatchObject({ success: true });

    // Money must be UNTOUCHED — one reservation for the whole run, nothing
    // settled/released after just step 1.
    let wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000 - totalCredits);
    expect(wallet.reserved).toBe(totalCredits);

    run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("running"); // NOT stuck — this is exactly what CRITICAL-1 fixes
    expect(run.stepState.step1).toMatchObject({ status: "completed", outputUrl: "/api/media/local/webhook-step1.png" });
    expect(run.stepState.step2.status).toBe("running");
    expect(run.stepState.step2.generationId).toBeTruthy();

    const gen2 = await prisma.generation.findUnique({ where: { id: run.stepState.step2.generationId } });
    expect(gen2.params.image_url).toBe("/api/media/local/webhook-step1.png"); // $step1.output resolved correctly

    const job2 = await prisma.generationJob.findUnique({ where: { generationId: run.stepState.step2.generationId } });
    expect(job2.payload.templateRunId).toBe(runId);

    // Complete step 2 the same way (webhook-first) — the LAST step, so
    // this must settle the run's ONE reservation exactly once.
    const req2 = `webhook-race-req-${randomUUID()}`;
    await prisma.generationJob.update({ where: { id: job2.id }, data: { providerRequestId: req2 } });
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/webhook-step2.mp4" });

    const result2 = await handleGenerationWebhook({
      request_id: req2,
      status: "completed",
      outputs: ["https://provider.example/webhook-step2.mp4"],
    });
    expect(result2.status).toBe(200);

    wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000 - totalCredits);
    expect(wallet.reserved).toBe(0);

    run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("completed");
    expect(run.stepState.step2).toMatchObject({ status: "completed", outputUrl: "/api/media/local/webhook-step2.mp4" });

    const generationLedgerRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "generation", referenceId: runId },
    });
    expect(generationLedgerRows).toHaveLength(1); // settled exactly once
    expect(generationLedgerRows[0].amount).toBe(-totalCredits);

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
  });

  it("a webhook-delivered step FAILURE also advances (and correctly fails) the run, not just success", async () => {
    const { startTemplateRun } = await import("@/lib/template-runner");
    const { handleGenerationWebhook } = await import("@/lib/generation-webhook");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    const { template } = await seedTwoStepTemplate();

    const { runId, totalCredits } = await startTemplateRun({ userId: user.id, slug: template.slug, inputs: {} });

    const run = await prisma.templateRun.findUnique({ where: { id: runId } });
    const job1 = await prisma.generationJob.findUnique({ where: { generationId: run.stepState.step1.generationId } });

    const req1 = `webhook-fail-req-${randomUUID()}`;
    await prisma.generationJob.update({ where: { id: job1.id }, data: { providerRequestId: req1 } });

    const result = await handleGenerationWebhook({ request_id: req1, status: "failed", error: "provider rejected" });
    expect(result.status).toBe(200);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000); // fully released back — not stuck reserved forever
    expect(wallet.reserved).toBe(0);

    const runAfter = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(runAfter.status).toBe("failed");
    expect(runAfter.stepState.step1.status).toBe("failed");
    expect(runAfter.stepState.step2.status).toBe("pending"); // never started

    const releaseRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: { in: ["reservation_release", "refund"] } },
    });
    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].amount).toBe(totalCredits);

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
  });
});
