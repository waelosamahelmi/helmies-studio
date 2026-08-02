import { describe, it, expect, vi, beforeEach } from "vitest";

// automation.js imports prisma directly for its models/users legs
// (tests/unit/automation.test.mjs's own mock shape), and job-runner.js
// (loaded transitively via the new jobs leg) also needs prisma.generation
// findUnique/updateMany and prisma.generationJob.update — mirroring
// tests/unit/job-runner.test.mjs's mock set exactly, so importing
// job-runner.js here never touches a real network/DB call.
vi.mock("@/lib/prisma", () => {
  const generation = { groupBy: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() };
  const generationJob = { update: vi.fn() };
  const user = { findUnique: vi.fn() };
  const modelPricing = { findUnique: vi.fn(), update: vi.fn() };
  const auditLog = { create: vi.fn() };
  return { default: { generation, generationJob, user, modelPricing, auditLog } };
});

vi.mock("@/lib/job-queue", () => ({
  heartbeatJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  findTimedOutJobs: vi.fn(),
  pruneTerminalJobs: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  refundCredits: vi.fn(),
  sweepExpiredReservations: vi.fn(),
  adjustWalletTo: vi.fn(),
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
import { failJob, findTimedOutJobs, pruneTerminalJobs } from "@/lib/job-queue";
import { releaseReservation, refundCredits, sweepExpiredReservations } from "@/lib/wallet";
import { sweepTimedOutJobs } from "@/lib/job-runner";
import { runAutomation } from "@/lib/automation";

beforeEach(() => vi.clearAllMocks());

function makeJob(overrides = {}) {
  return {
    id: "job1",
    generationId: "gen1",
    userId: "user1",
    status: "running",
    providerName: "kie",
    payload: { prompt: "a cat" },
    timeoutAt: new Date(0),
    ...overrides,
  };
}

function makeGeneration(overrides = {}) {
  return {
    id: "gen1",
    userId: "user1",
    status: "processing",
    creditsUsed: 5,
    ...overrides,
  };
}

describe("sweepTimedOutJobs — a timed-out job always ends and always returns credits", () => {
  it("a job past timeoutAt with an active reservation: released, generation failed, job marked dead", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    findTimedOutJobs.mockResolvedValue([job]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique.mockResolvedValue(generation);
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 1, refunded: 1 });
    expect(failJob).toHaveBeenCalledWith("job1", "Timed out waiting for the provider", { retryable: false });
    const transitionCall = prisma.generation.updateMany.mock.calls[0][0];
    expect(transitionCall.where).toEqual({ id: "gen1", status: { notIn: ["completed", "failed"] } });
    expect(transitionCall.data).toEqual({ status: "failed", error: "Timed out waiting for the provider" });
    expect(releaseReservation).toHaveBeenCalledWith("user1", "gen1");
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("a job past timeoutAt whose reservation was already settled: refunded exactly once (never both)", async () => {
    const job = makeJob();
    const generation = makeGeneration({ creditsUsed: 7 });
    findTimedOutJobs.mockResolvedValue([job]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique.mockResolvedValue(generation);
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue(null); // nothing active — already settled
    refundCredits.mockResolvedValue({});

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 1, refunded: 1 });
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("user1", 7, "gen1", "Generation failed");
  });

  it("falls back to refundCredits when releaseReservation throws the race-condition error, and never calls both", async () => {
    const job = makeJob();
    const generation = makeGeneration({ creditsUsed: 3 });
    findTimedOutJobs.mockResolvedValue([job]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique.mockResolvedValue(generation);
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockRejectedValue(new Error("No active reservation found"));
    refundCredits.mockResolvedValue({});

    await sweepTimedOutJobs();

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
  });

  it("a job NOT past timeout is untouched — findTimedOutJobs already filters it out", async () => {
    findTimedOutJobs.mockResolvedValue([]);

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 0, refunded: 0 });
    expect(failJob).not.toHaveBeenCalled();
    expect(prisma.generation.findUnique).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("does not move credits when the generation was already terminalized by a concurrent winner (rule 4)", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    findTimedOutJobs.mockResolvedValue([job]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique.mockResolvedValue(generation);
    prisma.generation.updateMany.mockResolvedValue({ count: 0 }); // lost the race — already terminal

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 1, refunded: 0 });
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("marks each job dead regardless of the generation row being missing, and moves no credits", async () => {
    const job = makeJob();
    findTimedOutJobs.mockResolvedValue([job]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique.mockResolvedValue(null);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 1, refunded: 0 });
    expect(failJob).toHaveBeenCalledTimes(1);
    expect(prisma.generation.updateMany).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("processes multiple timed-out jobs across different users in one sweep", async () => {
    const jobA = makeJob({ id: "jobA", generationId: "genA", userId: "userA" });
    const jobB = makeJob({ id: "jobB", generationId: "genB", userId: "userB" });
    findTimedOutJobs.mockResolvedValue([jobA, jobB]);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.findUnique
      .mockResolvedValueOnce(makeGeneration({ id: "genA", userId: "userA" }))
      .mockResolvedValueOnce(makeGeneration({ id: "genB", userId: "userB" }));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const result = await sweepTimedOutJobs();

    expect(result).toEqual({ timedOut: 2, refunded: 2 });
    expect(failJob).toHaveBeenCalledTimes(2);
    expect(releaseReservation).toHaveBeenCalledWith("userA", "genA");
    expect(releaseReservation).toHaveBeenCalledWith("userB", "genB");
  });
});

describe("runAutomation — jobs leg wiring (Task 7)", () => {
  beforeEach(() => {
    prisma.generation.groupBy.mockResolvedValue([]);
    prisma.generation.findUnique.mockResolvedValue(null);
    findTimedOutJobs.mockResolvedValue([]);
    sweepExpiredReservations.mockResolvedValue({ released: 0, settled: 0, skipped: 0 });
    pruneTerminalJobs.mockResolvedValue({ deleted: 0 });
  });

  it("calls sweepTimedOutJobs and surfaces its result under `jobs`, alongside the existing three legs", async () => {
    findTimedOutJobs.mockResolvedValue([]);

    const result = await runAutomation();

    expect(findTimedOutJobs).toHaveBeenCalledTimes(1);
    expect(result.jobs).toEqual({ timedOut: 0, refunded: 0 });
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("timestamp");
  });

  it("returns all four legs even when the jobs leg rejects — one failing leg never suppresses the others", async () => {
    findTimedOutJobs.mockRejectedValueOnce(new Error("timeout sweep boom"));

    const result = await runAutomation();

    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("jobs");
    expect(result.jobs).toEqual({ error: "timeout sweep boom" });
  });

  it("returns all four legs even when a DIFFERENT leg rejects — jobs stays intact", async () => {
    sweepExpiredReservations.mockRejectedValueOnce(new Error("reservation sweep boom"));
    findTimedOutJobs.mockResolvedValue([]);

    const result = await runAutomation();

    expect(result.reservations).toEqual({ error: "reservation sweep boom" });
    expect(result.jobs).toEqual({ timedOut: 0, refunded: 0 });
  });
});
