// Proves template-runner.js's advanceTemplateRun reuses job-runner.js's REAL
// releaseOrRefund (not a re-implementation) end to end — specifically the
// "already settled/nothing active -> falls back to refund, never both"
// behavior the Task 3 brief calls out by name. Unlike
// tests/unit/template-runner.test.mjs (which mocks "@/lib/job-runner"
// entirely to keep the chaining/settle assertions a clean unit boundary),
// this file leaves job-runner.js UNMOCKED so its actual releaseOrRefund runs
// — only its own transitive dependencies (wallet, job-queue, providers,
// storage/ingest) are mocked, mirroring tests/unit/job-runner.test.mjs's own
// setup exactly.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    templateRun: { findUnique: vi.fn(), update: vi.fn() },
    templateVersion: { findUnique: vi.fn() },
    generation: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/job-queue", () => ({
  heartbeatJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  refundCredits: vi.fn(),
  reserveCredits: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  submitOnly: vi.fn(),
  pollProviderResult: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { releaseReservation, refundCredits, settleReservation } from "@/lib/wallet";
import { enqueueJob } from "@/lib/job-queue";
import { advanceTemplateRun } from "@/lib/template-runner";

beforeEach(() => vi.clearAllMocks());

function graph() {
  return {
    steps: [
      { id: "step1", tool: "image", modelId: "model-a", inputs: { prompt: "x" }, dependsOn: [] },
      { id: "step2", tool: "i2v", modelId: "model-b", inputs: { image_url: "$step1.output" }, dependsOn: ["step1"] },
    ],
  };
}

function runningRun() {
  return {
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
  };
}

describe("advanceTemplateRun — reuses job-runner.js's real releaseOrRefund", () => {
  it("falls back to refundCredits (never release) when the run's reservation was already settled/gone", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(runningRun());
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: graph() });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "provider rejected" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseReservation.mockResolvedValue(null); // nothing active — already settled/released
    refundCredits.mockResolvedValue({});

    await advanceTemplateRun("run1");

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith("u1", "run1");
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("u1", 13, "run1", "Generation failed");
    expect(settleReservation).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("falls back to refundCredits when releaseReservation throws the race-condition error", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(runningRun());
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: graph() });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "boom" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseReservation.mockRejectedValue(new Error("No active reservation found"));
    refundCredits.mockResolvedValue({});

    await advanceTemplateRun("run1");

    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("u1", 13, "run1", "Generation failed");
  });

  it("releases (never refunds) when the reservation is still active", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(runningRun());
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: graph() });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "boom" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseReservation.mockResolvedValue({ available: 100 });

    await advanceTemplateRun("run1");

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("a release AND a refund are never both called for the same run failure", async () => {
    prisma.templateRun.findUnique.mockResolvedValue(runningRun());
    prisma.templateVersion.findUnique.mockResolvedValue({ id: "v1", graph: graph() });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", status: "failed", error: "boom" });
    prisma.templateRun.update.mockResolvedValue({});
    releaseReservation.mockResolvedValue({ available: 100 });

    await advanceTemplateRun("run1");

    const releaseCalled = releaseReservation.mock.calls.length > 0;
    const refundCalled = refundCredits.mock.calls.length > 0;
    expect(releaseCalled && refundCalled).toBe(false);
  });
});
