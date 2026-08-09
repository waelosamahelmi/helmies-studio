import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    template: { findUnique: vi.fn() },
    templateVersion: { findFirst: vi.fn(), findUnique: vi.fn() },
    templateRun: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
import { startTemplateRun, advanceTemplateRun, reservationTTLMinutes } from "@/lib/template-runner";

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

describe("reservationTTLMinutes — CRITICAL-2(a) sizing", () => {
  it("is at least 40 minutes per step (comfortably above the 30-minute per-job hard timeout)", () => {
    expect(reservationTTLMinutes(1)).toBeGreaterThanOrEqual(40);
    expect(reservationTTLMinutes(4)).toBeGreaterThanOrEqual(4 * 40);
  });

  it("floors at 60 minutes even for a single-step run", () => {
    expect(reservationTTLMinutes(1)).toBeGreaterThanOrEqual(60);
  });
});

describe("startTemplateRun", () => {
  it("reserves the full quoted total exactly once — never per step — sized by reservationTTLMinutes, not the 30-minute default", async () => {
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
    prisma.templateRun.update.mockResolvedValue({});

    const result = await startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} });

    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 13, expect.any(String), reservationTTLMinutes(2));
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
    expect(runCreateArgs.inputs).toEqual({});
    // Important-5: the run row is created BEFORE step 1 is enqueued, so at
    // CREATE time nothing has a real generationId yet — every step
    // (including the first) starts "pending"; the first step's own
    // "running" transition (with its real generationId) happens via a
    // SUBSEQUENT update, once the generation/job actually exist.
    expect(runCreateArgs.stepState.step1.status).toBe("pending");
    expect(runCreateArgs.stepState.step1.generationId).toBeNull();
    expect(runCreateArgs.stepState.step2.status).toBe("pending");

    // Important-5 ordering: templateRun.create must happen BEFORE enqueueJob.
    expect(prisma.templateRun.create.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueJob.mock.invocationCallOrder[0]
    );

    // The follow-up update flips step1 to "running" with the real generationId.
    const updateArgs = prisma.templateRun.update.mock.calls[0][0];
    expect(updateArgs.data.stepState.step1).toEqual({
      status: "running", generationId: "gen1", outputUrl: null, error: null,
    });
  });

  it("persists the caller's inputs on the run row (Important-3) so later steps can reuse them", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({
      valid: true,
      steps: [{ stepId: "step1", modelId: "model-a", credits: 5 }, { stepId: "step2", modelId: "model-b", credits: 8 }],
      totalCredits: 13,
      errors: [],
    });
    reserveCredits.mockResolvedValue({});
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-a"));
    prisma.generation.create.mockResolvedValue({ id: "gen1" });
    enqueueJob.mockResolvedValue({ id: "job1" });
    prisma.templateRun.create.mockResolvedValue({});
    prisma.templateRun.update.mockResolvedValue({});

    const callerInputs = { step2: { duration: 10 } };
    await startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: callerInputs });

    const runCreateArgs = prisma.templateRun.create.mock.calls[0][0].data;
    expect(runCreateArgs.inputs).toEqual(callerInputs);
  });

  it("Important-5: releases the reservation and marks the run failed when the first step's model has vanished after reserving", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 13, errors: [] });
    reserveCredits.mockResolvedValue({});
    prisma.modelPricing.findUnique.mockResolvedValue(null); // vanished between publish and this run
    releaseOrRefund.mockResolvedValue(undefined);
    prisma.templateRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} })).rejects.toThrow(
      /no longer available/
    );

    expect(releaseOrRefund).toHaveBeenCalledTimes(1);
    expect(releaseOrRefund).toHaveBeenCalledWith(
      { userId: "u1", id: expect.any(String), creditsUsed: 13 },
      { payload: {} }
    );
    expect(prisma.templateRun.create).not.toHaveBeenCalled();
  });

  it("Important-5: releases the reservation when creating the run row itself throws", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 13, errors: [] });
    reserveCredits.mockResolvedValue({});
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-a"));
    prisma.templateRun.create.mockRejectedValue(new Error("DB write failed"));
    releaseOrRefund.mockResolvedValue(undefined);
    prisma.templateRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} })).rejects.toThrow(
      "DB write failed"
    );

    expect(releaseOrRefund).toHaveBeenCalledTimes(1);
    expect(enqueueJob).not.toHaveBeenCalled(); // never got that far
  });

  it("Important-5: releases the reservation AND marks an already-created run row failed when enqueueing step 1 throws", async () => {
    prisma.template.findUnique.mockResolvedValue({ id: "tpl1" });
    prisma.templateVersion.findFirst.mockResolvedValue({ id: "v1", version: 1, graph: twoStepGraph() });
    quoteTemplate.mockResolvedValue({ valid: true, steps: [], totalCredits: 13, errors: [] });
    reserveCredits.mockResolvedValue({});
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-a"));
    prisma.generation.create.mockResolvedValue({ id: "gen1" });
    prisma.templateRun.create.mockResolvedValue({});
    enqueueJob.mockRejectedValue(new Error("provider enqueue failed"));
    releaseOrRefund.mockResolvedValue(undefined);
    prisma.templateRun.updateMany.mockResolvedValue({ count: 1 });

    await expect(startTemplateRun({ userId: "u1", slug: "my-tpl", inputs: {} })).rejects.toThrow(
      "provider enqueue failed"
    );

    expect(releaseOrRefund).toHaveBeenCalledTimes(1);
    // The run row (already created before the enqueue) is marked failed —
    // never left reading "running" with no active step.
    expect(prisma.templateRun.updateMany).toHaveBeenCalledWith({
      where: { id: expect.any(String), status: "running" },
      data: { status: "failed" },
    });
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

  // IMPORTANT-3 fix (found in review, proven against the real test DB): a
  // caller-supplied per-step override (e.g. a longer duration) was priced
  // into the ORIGINAL quote/reservation via startTemplateRun's own `inputs`
  // argument, but advanceTemplateRun used to resolve every LATER step
  // against {} (the graph's bare defaults) instead of that same `inputs` —
  // so what was quoted/charged and what actually executed silently
  // diverged (reviewer's proof: inputs.step2.duration=10 quoted+charged
  // 258, but step 2 ran with the graph's default duration=5, worth 133).
  // run.inputs (persisted at start) must be exactly what a later step is
  // enqueued with.
  it("executes a later step with the SAME caller-supplied override that was quoted and reserved for — not the graph's bare default", async () => {
    const graph = twoStepGraph(); // step2's own graph default is duration: 5
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "u1",
      templateId: "tpl1",
      versionId: "v1",
      status: "running",
      totalCredits: 258,
      inputs: { step2: { duration: 10 } }, // persisted at startTemplateRun
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

    const genArgs = prisma.generation.create.mock.calls[0][0].data;
    expect(genArgs.params.duration).toBe(10); // the OVERRIDE, never the graph's bare default (5)

    const enqueueArgs = enqueueJob.mock.calls[0][0];
    expect(enqueueArgs.payload.duration).toBe(10);
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

  it("STARTS a ready step that was left pending — a stalled run recovers", async () => {
    /* This used to assert a no-op, and under sequential scheduling that was
       right: the only way to reach the next step was to be the call that
       completed the previous one, so a run in this state was "already
       advanced". Under ready-step scheduling it is a run that stalled with
       work it could do — a lost advance call, a restart mid-step — and the
       right answer is to pick it up rather than leave it stuck forever. */
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "user1",
      status: "running",
      versionId: "v1",
      totalCredits: 30,
      inputs: {},
      stepState: {
        step1: { status: "completed", generationId: "gen1", outputUrl: "https://x/a.png", error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: twoStepGraph() });
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-b"));
    prisma.generation.create.mockResolvedValue({ id: "gen2" });

    await advanceTemplateRun("run1");

    const written = prisma.templateRun.update.mock.calls.at(-1)[0].data.stepState;
    expect(written.step2.status).toBe("running");
    // Recovery is not completion: nothing is settled or refunded here.
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseOrRefund).not.toHaveBeenCalled();
  });

  it("is a no-op while a step is still at the provider", async () => {
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1",
      userId: "user1",
      status: "running",
      versionId: "v1",
      totalCredits: 30,
      inputs: {},
      stepState: {
        step1: { status: "running", generationId: "gen1", outputUrl: null, error: null },
        step2: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: twoStepGraph() });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "processing" });

    await advanceTemplateRun("run1");

    expect(prisma.templateRun.update).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseOrRefund).not.toHaveBeenCalled();
  });

  it("runs INDEPENDENT steps side by side instead of one after another", async () => {
    /* The whole point of B1.3. Topological order is a valid sequence, not a
       schedule: it says a step may not start before its dependencies, and
       says nothing about whether two steps could have gone at once. Three
       shots that all depend only on the same hero used to cost three
       provider round-trips where they needed one. */
    const fanOut = {
      steps: [
        { id: "hero", tool: "image", modelId: "model-a", inputs: { prompt: "hero" }, dependsOn: [] },
        { id: "shotA", tool: "i2v", modelId: "model-b", inputs: { image_url: "$hero.output" }, dependsOn: ["hero"] },
        { id: "shotB", tool: "i2v", modelId: "model-b", inputs: { image_url: "$hero.output" }, dependsOn: ["hero"] },
        { id: "shotC", tool: "i2v", modelId: "model-b", inputs: { image_url: "$hero.output" }, dependsOn: ["hero"] },
      ],
    };
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1", userId: "user1", status: "running", versionId: "v1", totalCredits: 90, inputs: {},
      stepState: {
        hero: { status: "running", generationId: "genHero", outputUrl: null, error: null },
        shotA: { status: "pending", generationId: null, outputUrl: null, error: null },
        shotB: { status: "pending", generationId: null, outputUrl: null, error: null },
        shotC: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: fanOut });
    prisma.generation.findUnique.mockResolvedValue({ id: "genHero", status: "completed", outputUrl: "https://x/hero.png" });
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-b"));
    let n = 0;
    prisma.generation.create.mockImplementation(async () => ({ id: `gen-${++n}` }));

    await advanceTemplateRun("run1");

    const written = prisma.templateRun.update.mock.calls.at(-1)[0].data.stepState;
    expect(written.hero.status).toBe("completed");
    // All three, in one advance — capped at TEMPLATE_IN_FLIGHT_CAP (3).
    for (const id of ["shotA", "shotB", "shotC"]) expect(written[id].status).toBe("running");
    expect(prisma.generation.create).toHaveBeenCalledTimes(3);
  });

  it("does not start a step whose dependencies are not all finished", async () => {
    const diamond = {
      steps: [
        { id: "a", tool: "image", modelId: "model-a", inputs: {}, dependsOn: [] },
        { id: "b", tool: "image", modelId: "model-a", inputs: {}, dependsOn: [] },
        { id: "join", tool: "i2v", modelId: "model-b", inputs: {}, dependsOn: ["a", "b"] },
      ],
    };
    prisma.templateRun.findUnique.mockResolvedValue({
      id: "run1", userId: "user1", status: "running", versionId: "v1", totalCredits: 40, inputs: {},
      stepState: {
        a: { status: "running", generationId: "genA", outputUrl: null, error: null },
        b: { status: "running", generationId: "genB", outputUrl: null, error: null },
        join: { status: "pending", generationId: null, outputUrl: null, error: null },
      },
    });
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: diamond });
    // Only one of the two finished.
    prisma.generation.findUnique.mockImplementation(async ({ where }) => (
      where.id === "genA"
        ? { id: "genA", status: "completed", outputUrl: "https://x/a.png" }
        : { id: "genB", status: "processing" }
    ));
    prisma.modelPricing.findUnique.mockResolvedValue(modelRow("model-b"));

    await advanceTemplateRun("run1");

    const written = prisma.templateRun.update.mock.calls.at(-1)[0].data.stepState;
    expect(written.a.status).toBe("completed");
    expect(written.join.status).toBe("pending");
    expect(prisma.generation.create).not.toHaveBeenCalled();
  });

  it("is a no-op (and never throws) when the run id does not exist at all", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(null);
    await expect(advanceTemplateRun("ghost-run")).resolves.toBeUndefined();
    expect(prisma.templateRun.update).not.toHaveBeenCalled();
  });
});
