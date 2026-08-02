import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    template: { findUnique: vi.fn() },
    templateVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
    templateRun: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    modelPricing: { findUnique: vi.fn() },
    generation: { create: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/wallet", () => ({
  reserveCredits: vi.fn(),
  settleReservation: vi.fn(),
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

// Treated as an external collaborator here — release-or-refund's own
// release-then-refund-fallback logic is exhaustively unit-tested in
// tests/unit/job-runner.test.mjs and re-proven end-to-end (with the REAL
// function, not this mock) in tests/unit/template-runner-settlement.test.mjs.
// These tests only assert template-runner.js calls it correctly (once, with
// the run's own synthetic identity) — never a second time, never alongside
// settleReservation.
vi.mock("@/lib/job-runner", () => ({
  releaseOrRefund: vi.fn(),
}));

// Dynamically imported inside startTemplateRun (see template-runner.js's
// header for why) — vi.mock intercepts it the same way regardless of
// static/dynamic import, keyed by resolved module identity.
vi.mock("@/lib/template-quote", () => ({
  quoteTemplate: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { reserveCredits, settleReservation } from "@/lib/wallet";
import { enqueueJob } from "@/lib/job-queue";
import { releaseOrRefund } from "@/lib/job-runner";
import { quoteTemplate } from "@/lib/template-quote";
import { startTemplateRun, advanceTemplateRun } from "@/lib/template-runner";

beforeEach(() => vi.clearAllMocks());

function twoStepGraph() {
  return {
    steps: [
      { id: "step1", tool: "image", modelId: "model-a", inputs: { prompt: "a cover image" }, dependsOn: [] },
      {
        id: "step2",
        tool: "i2v",
        modelId: "model-b",
        inputs: { image_url: "$step1.output", duration: 5, resolution: "720p" },
        dependsOn: ["step1"],
      },
    ],
  };
}

const modelRow = (modelId) => ({
  modelId,
  providerName: "Alibaba",
  endpoint: modelId,
  providerModelId: modelId,
});

describe("startTemplateRun", () => {
  it("reserves the full quoted total exactly once — never per step — and enqueues only step 1", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({
      valid: true,
      steps: [
        { stepId: "step1", modelId: "model-a", credits: 5 },
        { stepId: "step2", modelId: "model-b", credits: 8 },
      ],
      totalCredits: 13,
      errors: [],
    });
    reserveCredits.mockResolvedValue({ wallet: {}, reservation: {} });
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-a"));
    prisma.generation.create.mockResolvedValue({ id: "gen1" });
    enqueueJob.mockResolvedValue({ id: "job1" });
    prisma.templateRun.create.mockResolvedValue({});

    const result = await startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} });

    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 13, expect.any(String));
    expect(result.totalCredits).toBe(13);
    expect(typeof result.runId).toBe("string");

    // Only step1 is created/enqueued — step2 doesn't exist yet.
    expect(prisma.generation.create).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const enqueueArgs = enqueueJob.mock.calls[0][0];
    expect(enqueueArgs.payload.templateRunId).toBe(result.runId);
    expect(enqueueArgs.payload.stepId).toBe("step1");

    const runCreateArgs = prisma.templateRun.create.mock.calls[0][0].data;
    expect(runCreateArgs.totalCredits).toBe(13);
    expect(runCreateArgs.status).toBe("running");
    expect(runCreateArgs.stepState.step1.status).toBe("running");
    expect(runCreateArgs.stepState.step2.status).toBe("pending");
  });

  it("propagates reserveCredits' insufficient-credits error and creates no run/generation/job", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 999, errors: [] });
    reserveCredits.mockRejectedValue(new Error("Insufficient credits: need 999, have 10"));

    await expect(startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} })).rejects.toThrow(
      /Insufficient credits/
    );

    expect(prisma.generation.create).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(prisma.templateRun.create).not.toHaveBeenCalled();
  });

  it("throws before quoting/reserving when the template doesn't exist", async () => {
    prisma.template.findUnique.mockResolvedValue(null);

    await expect(startTemplateRun({ userId: "u1", slug: "ghost", inputs: {} })).rejects.toThrow(
      "Template not found"
    );
    expect(quoteTemplate).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("throws when the template has no published version, without reserving", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue(null);

    await expect(startTemplateRun({ userId: "u1", slug: "draft-only", inputs: {} })).rejects.toThrow(
      "Template not available"
    );
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("throws when the quote is invalid, without reserving", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({ valid: false, steps: [], totalCredits: 0, errors: ["step1: unpriced"] });

    await expect(startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} })).rejects.toThrow(
      /Template quote invalid/
    );
    expect(reserveCredits).not.toHaveBeenCalled();
  });
});

describe("advanceTemplateRun — mid-chain success", () => {
  it("chains to the next step, resolving $step1.output — no settle, no release/refund", async () => {
    const graph = twoStepGraph();
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 13,
      stepState: {
        step1: { status: "running", generationId: "gen1", outputUrl: null, error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "completed", outputUrl: "https://out/1.png" });
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-b"));
    prisma.generation.create.mockResolvedValue({ id: "gen2" });
    enqueueJob.mockResolvedValue({ id: "job2" });
    prisma.templateRun.update.mockResolvedValue({});

    await advanceTemplateRun("run1");

    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseOrRefund).not.toHaveBeenCalled();
    expect(prisma.generation.create).toHaveBeenCalledTimes(1);

    const genArgs = prisma.generation.create.mock.calls[0][0].data;
    expect(genArgs.params.image_url).toBe("https://out/1.png"); // $step1.output resolved to the real output

    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const enqueueArgs = enqueueJob.mock.calls[0][0];
    expect(enqueueArgs.payload.templateRunId).toBe("run1");
    expect(enqueueArgs.payload.stepId).toBe("step2");

    const updateArgs = prisma.templateRun.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "run1" });
    expect(updateArgs.data.status).toBeUndefined(); // still running — no status flip
    expect(updateArgs.data.stepState.step1.status).toBe("completed");
    expect(updateArgs.data.stepState.step2).toEqual({
      status: "running",
      generationId: "gen2",
      outputUrl: null,
      error: null,
    });
  });
});

describe("advanceTemplateRun — final step success", () => {
  it("settles the run's ONE reservation exactly once and marks the run completed", async () => {
    const graph = twoStepGraph();
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 13,
      stepState: {
        step1: { status: "completed", generationId: "gen1", outputUrl: "https://out/1.png", error: null },
        step2: { status: "running", generationId: "gen2", outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen2", status: "completed", outputUrl: "https://out/2.mp4" });
    settleReservation.mockResolvedValue({});
    prisma.templateRun.update.mockResolvedValue({});

    await advanceTemplateRun("run1");

    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("u1", "run1", 13);
    expect(releaseOrRefund).not.toHaveBeenCalled();
    expect(prisma.generation.create).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();

    const updateArgs = prisma.templateRun.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("completed");
    expect(updateArgs.data.stepState.step2.status).toBe("completed");
    expect(updateArgs.data.stepState.step2.outputUrl).toBe("https://out/2.mp4");
  });

  it("a settle failure is swallowed (logged), never thrown — the run still closes out completed", async () => {
    const graph = twoStepGraph();
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 13,
      stepState: {
        step1: { status: "completed", generationId: "gen1", outputUrl: "https://out/1.png", error: null },
        step2: { status: "running", generationId: "gen2", outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen2", status: "completed", outputUrl: "https://out/2.mp4" });
    settleReservation.mockRejectedValue(new Error("DB connection lost"));
    prisma.templateRun.update.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(advanceTemplateRun("run1")).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("SETTLE FAILED"), expect.any(String));
    const updateArgs = prisma.templateRun.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("completed");
    errorSpy.mockRestore();
  });
});

describe("advanceTemplateRun — step failure", () => {
  it("marks the run failed and releases-or-refunds the run's ONE reservation exactly once", async () => {
    const graph = twoStepGraph();
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 13,
      stepState: {
        step1: { status: "running", generationId: "gen1", outputUrl: null, error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "Content blocked by safety filters" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseOrRefund.mockResolvedValue(undefined);

    await advanceTemplateRun("run1");

    expect(releaseOrRefund).toHaveBeenCalledTimes(1);
    expect(releaseOrRefund).toHaveBeenCalledWith({ userId: "u1", id: "run1", creditsUsed: 13 }, { payload: {} });
    expect(settleReservation).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(prisma.generation.create).not.toHaveBeenCalled();

    const updateArgs = prisma.templateRun.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("failed");
    expect(updateArgs.data.stepState.step1).toMatchObject({
      status: "failed",
      error: "Content blocked by safety filters",
    });
  });

  it("never calls both settle AND release/refund for the same run", async () => {
    const graph = twoStepGraph();
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 13,
      stepState: {
        step1: { status: "running", generationId: "gen1", outputUrl: null, error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "boom" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseOrRefund.mockResolvedValue(undefined);

    await advanceTemplateRun("run1");

    expect(releaseOrRefund).toHaveBeenCalledTimes(1);
    expect(settleReservation).not.toHaveBeenCalled();
  });
});

describe("advanceTemplateRun — idempotency", () => {
  it("is a no-op when the run is already terminal", async () => {
    prisma.templateRun.findUnique.mockResolvedValue({ id: "run1", status: "completed" });

    await advanceTemplateRun("run1");

    expect(prisma.templateVersion.findUnique).not.toHaveBeenCalled();
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseOrRefund).not.toHaveBeenCalled();
  });

  it("is a no-op when no step is currently 'running' (already advanced by an earlier call)", async () => {
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      status: "running",
      versionId: "v1",
      stepState: {
        step1: { status: "completed", generationId: "gen1", outputUrl: "x", error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: twoStepGraph() });

    await advanceTemplateRun("run1");

    expect(prisma.templateRun.update).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseOrRefund).not.toHaveBeenCalled();
  });

  it("is a no-op (and never throws) when the run id does not exist at all", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(null);
    await expect(advanceTemplateRun("ghost-run")).resolves.toBeUndefined();
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
  });
});
