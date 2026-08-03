// Phase 6 Task 3 — a 2-step template runs end to end against the REAL local
// test database: reserve once, chain step 1 -> step 2 through the actual
// Phase 4A job queue/runner, settle once on the last step's completion.
// Mirrors tests/integration/storage-ingest.int.test.mjs's pattern: real DB
// (resetDb), only the network-facing boundaries mocked (the provider SDK
// and the storage ingest call — this test's focus is money/chaining, not
// storage, so ingest is mocked here rather than exercised for real).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

vi.mock("@/lib/providers", () => ({
  submitOnly: vi.fn(),
  pollProviderResult: vi.fn(),
  getProvider: vi.fn(),
  brandForUser: (m) => m,
  // Real implementation kept (not mocked) — template-runner.js's
  // enqueueStep uses this to normalize ModelPricing.providerName ("Alibaba")
  // into the lowercase adapter key job-runner.js's own real getProvider
  // indexes by; this test wants that normalization to actually happen, not
  // be stubbed away.
  resolveAdapterKey: (name) => (String(name || "").toLowerCase().includes("alibaba") ? "alibaba" : "kie"),
}));

vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
}));

import { submitOnly, pollProviderResult } from "@/lib/providers";
import { ingestFromUrl } from "@/lib/storage/ingest";

let prisma;

beforeEach(async () => {
  prisma = await resetDb();
  vi.clearAllMocks();
});

async function makeFundedUser(amount) {
  const { grantCredits } = await import("@/lib/wallet");
  const user = await prisma.user.create({ data: { email: `t-templaterun-${randomUUID()}@test.local` } });
  await grantCredits(user.id, amount, "signup", "Test opening balance");
  return user;
}

const STEP1_MODEL = "alibaba:wan2.7-image"; // text-to-image
const STEP2_MODEL = "alibaba:wan2.7-i2v"; // image-to-video

async function seedTwoStepTemplate() {
  const { syncAlibabaModels } = await import("@/lib/model-catalog");
  await syncAlibabaModels(); // real ModelPricing rows, real pricingRules — no network, pure JS + DB writes

  const graph = {
    steps: [
      { id: "step1", tool: "image", modelId: STEP1_MODEL, inputs: { prompt: "A vibrant product hero photo" }, dependsOn: [] },
      {
        id: "step2",
        tool: "i2v",
        modelId: STEP2_MODEL,
        inputs: { prompt: "Animate the product gently", image_url: "$step1.output", duration: 5, resolution: "720p" },
        dependsOn: ["step1"],
      },
    ],
    sampleInputs: {},
  };

  const template = await prisma.template.create({
    data: {
      slug: `int-two-step-${randomUUID()}`,
      name: "Integration Two Step",
      description: "template-run integration fixture",
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

describe("startTemplateRun + advanceTemplateRun — 2-step template, real queue/runner", () => {
  it("reserves once, chains step1 -> step2, settles once on completion — wallet drops by exactly the quote, reconcile clean", async () => {
    const { startTemplateRun } = await import("@/lib/template-runner");
    const { runJob } = await import("@/lib/job-runner");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    const { template } = await seedTwoStepTemplate();

    // ── Start the run: reserve once, enqueue step 1 only ──
    const { runId, totalCredits } = await startTemplateRun({ userId: user.id, slug: template.slug, inputs: {} });
    expect(totalCredits).toBeGreaterThan(0);

    let wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000 - totalCredits);
    expect(wallet.reserved).toBe(totalCredits);

    let run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("running");
    expect(run.stepState.step1.status).toBe("running");
    expect(run.stepState.step2.status).toBe("pending");

    const job1 = await prisma.generationJob.findUnique({
      where: { generationId: run.stepState.step1.generationId },
    });
    expect(job1).toBeTruthy();
    expect(job1.payload.templateRunId).toBe(runId);
    expect(job1.payload.stepId).toBe("step1");

    // ── Drive step 1 to completion through the REAL job runner ──
    submitOnly.mockResolvedValueOnce({
      provider: { name: "Alibaba", getKey: () => "k" },
      requestId: "req_step1",
      submitData: {},
    });
    pollProviderResult.mockResolvedValueOnce({ outputs: ["https://provider.example/step1-cover.png"] });
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/step1-cover.png" });

    const step1Result = await runJob(job1, { workerId: "worker-int-1" });
    expect(step1Result).toEqual({ outcome: "succeeded" });

    // Money is UNTOUCHED after step 1 — still one active reservation for the
    // whole run, nothing settled/released yet.
    wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000 - totalCredits);
    expect(wallet.reserved).toBe(totalCredits);

    run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("running");
    expect(run.stepState.step1).toMatchObject({ status: "completed", outputUrl: "/api/media/local/step1-cover.png" });
    expect(run.stepState.step2.status).toBe("running");
    expect(run.stepState.step2.generationId).toBeTruthy();

    // Step 2's input resolved the $step1.output placeholder to step 1's real output.
    const gen2 = await prisma.generation.findUnique({ where: { id: run.stepState.step2.generationId } });
    expect(gen2.params.image_url).toBe("/api/media/local/step1-cover.png");

    const job2 = await prisma.generationJob.findUnique({
      where: { generationId: run.stepState.step2.generationId },
    });
    expect(job2).toBeTruthy();
    expect(job2.payload.templateRunId).toBe(runId);
    expect(job2.payload.stepId).toBe("step2");

    // ── Drive step 2 (the LAST step) to completion ──
    submitOnly.mockResolvedValueOnce({
      provider: { name: "Alibaba", getKey: () => "k" },
      requestId: "req_step2",
      submitData: {},
    });
    pollProviderResult.mockResolvedValueOnce({ outputs: ["https://provider.example/step2-video.mp4"] });
    ingestFromUrl.mockResolvedValueOnce({ url: "/api/media/local/step2-video.mp4" });

    const step2Result = await runJob(job2, { workerId: "worker-int-1" });
    expect(step2Result).toEqual({ outcome: "succeeded" });

    // Settled exactly once, at exactly the quoted total.
    wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000 - totalCredits);
    expect(wallet.reserved).toBe(0);

    run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("completed");
    expect(run.stepState.step1.status).toBe("completed");
    expect(run.stepState.step2).toMatchObject({ status: "completed", outputUrl: "/api/media/local/step2-video.mp4" });

    const generationLedgerRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: "generation", referenceId: runId },
    });
    expect(generationLedgerRows).toHaveLength(1);
    expect(generationLedgerRows[0].amount).toBe(-totalCredits);

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
    expect(report.driftAvailable).toBe(0);
    expect(report.driftReserved).toBe(0);
  });

  it("a mid-chain step failure releases the run's one reservation exactly once and marks the run failed", async () => {
    const { startTemplateRun } = await import("@/lib/template-runner");
    const { runJob } = await import("@/lib/job-runner");
    const { reconcileWallet } = await import("@/lib/reconciliation");

    const user = await makeFundedUser(1000);
    const { template } = await seedTwoStepTemplate();

    const { runId, totalCredits } = await startTemplateRun({ userId: user.id, slug: template.slug, inputs: {} });

    let run = await prisma.templateRun.findUnique({ where: { id: runId } });
    const job1 = await prisma.generationJob.findUnique({
      where: { generationId: run.stepState.step1.generationId },
    });

    // Step 1's provider call fails outright with a terminal (non-retryable)
    // error.
    submitOnly.mockRejectedValueOnce(new Error("Invalid API key"));

    const step1Result = await runJob(job1, { workerId: "worker-int-2" });
    expect(step1Result).toEqual({ outcome: "failed" });

    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(1000); // fully released back
    expect(wallet.reserved).toBe(0);

    run = await prisma.templateRun.findUnique({ where: { id: runId } });
    expect(run.status).toBe("failed");
    expect(run.stepState.step1.status).toBe("failed");
    expect(run.stepState.step2.status).toBe("pending"); // never started

    const releaseRows = await prisma.creditLedger.findMany({
      where: { walletId: wallet.id, type: { in: ["reservation_release", "refund"] } },
    });
    expect(releaseRows).toHaveLength(1);
    expect(releaseRows[0].amount).toBe(totalCredits);

    const report = await reconcileWallet(user.id);
    expect(report.ok).toBe(true);
  });
});
