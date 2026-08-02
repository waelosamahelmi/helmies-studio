import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const generation = { findUnique: vi.fn(), updateMany: vi.fn() };
  const generationJob = { update: vi.fn() };
  return { default: { generation, generationJob } };
});

vi.mock("@/lib/job-queue", () => ({
  heartbeatJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  refundCredits: vi.fn(),
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
import { heartbeatJob, completeJob, failJob } from "@/lib/job-queue";
import { settleReservation, releaseReservation, refundCredits } from "@/lib/wallet";
import { submitOnly, pollProviderResult, getProvider } from "@/lib/providers";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { runJob } from "@/lib/job-runner";

// ingestFromUrl's return shape is the richer { url, key, bytes, sha256 }
// (Phase 4B Task 4) — job-runner.js only uses .url, but every mock below
// returns the full shape to match the real contract.
function ingestResult(url) {
  return { url, key: url.split("/").pop(), bytes: 123, sha256: "a".repeat(64) };
}

beforeEach(() => vi.clearAllMocks());

function makeJob(overrides = {}) {
  return {
    id: "job1",
    generationId: "gen1",
    userId: "user1",
    status: "running",
    idempotencyKey: "idem1",
    attempts: 1,
    maxAttempts: 3,
    providerRequestId: null,
    providerName: "kie",
    endpoint: "/v1/generate",
    payload: { prompt: "a cat", model: "flux" },
    ...overrides,
  };
}

function makeGeneration(overrides = {}) {
  return {
    id: "gen1",
    userId: "user1",
    tool: "image",
    model: "flux",
    prompt: "a cat",
    status: "pending",
    creditsUsed: 5,
    outputUrl: null,
    ...overrides,
  };
}

const PROVIDER_OBJ = { name: "kie", getKey: () => "test-key" };

describe("runJob — happy path", () => {
  it("submits, polls, ingests via the shared downloader, settles once, and completes the job", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1", submitData: {} });
    prisma.generationJob.update.mockResolvedValue({});
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockResolvedValue({ available: 10 });
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(submitOnly).toHaveBeenCalledWith(job.providerName, job.endpoint, job.payload);
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { providerRequestId: "req_1" },
    });
    expect(pollProviderResult).toHaveBeenCalledWith(PROVIDER_OBJ, "req_1");
    expect(ingestFromUrl).toHaveBeenCalledWith("https://provider/out.png");

    const transitionCall = prisma.generation.updateMany.mock.calls[0][0];
    expect(transitionCall.where).toEqual({ id: "gen1", status: { notIn: ["completed", "failed"] } });
    expect(transitionCall.data).toMatchObject({ status: "completed", outputUrl: "/api/media/local/abc.png" });

    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("user1", "gen1", 5);
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith("job1", { providerRequestId: "req_1" });
  });

  it("skips polling when the provider returns an immediate synchronous result", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({
      provider: PROVIDER_OBJ,
      requestId: null,
      submitData: {},
      immediateResult: { outputs: ["https://provider/immediate.png"] },
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/immediate.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockResolvedValue({});
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(pollProviderResult).not.toHaveBeenCalled();
    expect(prisma.generationJob.update).not.toHaveBeenCalled(); // no requestId to persist
    expect(ingestFromUrl).toHaveBeenCalledWith("https://provider/immediate.png");
    expect(settleReservation).toHaveBeenCalledTimes(1);
  });

  it("resumes from an existing providerRequestId instead of re-submitting", async () => {
    const job = makeJob({ providerRequestId: "req_existing" });
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    getProvider.mockReturnValue(PROVIDER_OBJ);
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockResolvedValue({});
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(submitOnly).not.toHaveBeenCalled();
    expect(getProvider).toHaveBeenCalledWith("kie");
    expect(pollProviderResult).toHaveBeenCalledWith(PROVIDER_OBJ, "req_existing");
    expect(completeJob).toHaveBeenCalledWith("job1", { providerRequestId: "req_existing" });
  });

  it("uses job.payload.creditsUsed over generation.creditsUsed for settlement amount when actually charging — settle always uses the generation's recorded cost, not the estimate", async () => {
    // settleReservation is always charged at the generation's actual
    // recorded cost (generation.creditsUsed) — the payload.creditsUsed
    // fallback in the money rules is specifically for the release/refund
    // path (see the "release-or-refund" describe block below), not settle.
    const job = makeJob({ payload: { prompt: "x", creditsUsed: 999 } });
    const generation = makeGeneration({ creditsUsed: 5 });
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockResolvedValue({});
    completeJob.mockResolvedValue({});

    await runJob(job, { workerId: "worker-1" });

    expect(settleReservation).toHaveBeenCalledWith("user1", "gen1", 5);
  });
});

describe("runJob — generation already terminal (rule 4): webhook won the race", () => {
  it("generation already completed — completes the job, moves zero credits", async () => {
    const job = makeJob();
    const generation = makeGeneration({ status: "completed" });
    prisma.generation.findUnique.mockResolvedValue(generation);
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(completeJob).toHaveBeenCalledWith("job1", {});
    expect(submitOnly).not.toHaveBeenCalled();
    expect(pollProviderResult).not.toHaveBeenCalled();
    expect(ingestFromUrl).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(prisma.generation.updateMany).not.toHaveBeenCalled();
    expect(failJob).not.toHaveBeenCalled();
  });

  it("generation already failed — completes the job, moves zero credits", async () => {
    const job = makeJob();
    const generation = makeGeneration({ status: "failed" });
    prisma.generation.findUnique.mockResolvedValue(generation);
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(completeJob).toHaveBeenCalledWith("job1", {});
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("a terminal failure discovered by another winner mid-flight (race after our poll succeeded) moves zero credits", async () => {
    // Our own poll succeeded, but by the time we go to transition the
    // generation, something else (the webhook) already terminalized it.
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 0 }); // lost the race
    completeJob.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(settleReservation).not.toHaveBeenCalled();
    expect(completeJob).toHaveBeenCalledWith("job1", { providerRequestId: "req_1" });
  });
});

describe("runJob — retryable provider failure: no credit movement", () => {
  it("a retryable poll error (5xx wording) fails the job as retryable and moves no credits", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockRejectedValue(new Error("503 Service Unavailable"));
    failJob.mockResolvedValue({ status: "queued", willRetry: true });

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "retry" });
    expect(failJob).toHaveBeenCalledWith("job1", "503 Service Unavailable", { retryable: true });
    expect(prisma.generation.updateMany).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
    expect(completeJob).not.toHaveBeenCalled();
  });

  it("a retryable submit-phase error (timeout wording) also moves no credits", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("The request timed out"));
    failJob.mockResolvedValue({ status: "queued", willRetry: true });

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "retry" });
    expect(failJob).toHaveBeenCalledWith("job1", "The request timed out", { retryable: true });
    expect(pollProviderResult).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("a retryable error that has exhausted maxAttempts (failJob returns dead) DOES release credits — it is terminal now", async () => {
    // failJob's own state machine can decide "dead" even for a retryable
    // classification once attempts are exhausted — that's a terminal
    // failure per rule 2, not a "no movement" retry.
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockRejectedValue(new Error("504 Gateway Timeout"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(failJob).toHaveBeenCalledWith("job1", "504 Gateway Timeout", { retryable: true });
    expect(releaseReservation).toHaveBeenCalledWith("user1", "gen1");
    expect(refundCredits).not.toHaveBeenCalled();
  });
});

describe("runJob — terminal provider failure: exactly one release-or-refund", () => {
  it("a terminal error (branded invalid API key) marks the generation failed and releases the active reservation", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockRejectedValue(new Error("Provider authentication failed. Our team has been notified."));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(failJob).toHaveBeenCalledWith(
      "job1",
      "Provider authentication failed. Our team has been notified.",
      { retryable: false }
    );
    const transitionCall = prisma.generation.updateMany.mock.calls[0][0];
    expect(transitionCall.data).toMatchObject({
      status: "failed",
      error: "Provider authentication failed. Our team has been notified.",
    });
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(releaseReservation).toHaveBeenCalledWith("user1", "gen1");
    expect(refundCredits).not.toHaveBeenCalled();
    expect(settleReservation).not.toHaveBeenCalled();
  });

  it("falls back to refundCredits when releaseReservation finds nothing active (already settled)", async () => {
    const job = makeJob();
    const generation = makeGeneration({ creditsUsed: 7 });
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("400 Bad Request — invalid parameters"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue(null); // nothing active — already settled
    refundCredits.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("user1", 7, "gen1", "Generation failed");
  });

  it("falls back to refundCredits when releaseReservation throws the race-condition error", async () => {
    const job = makeJob();
    const generation = makeGeneration({ creditsUsed: 3 });
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("Content blocked by safety filters"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockRejectedValue(new Error("No active reservation found"));
    refundCredits.mockResolvedValue({});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("user1", 3, "gen1", "Generation failed");
  });

  it("uses job.payload.creditsUsed over generation.creditsUsed for the refund amount when present", async () => {
    const job = makeJob({ payload: { prompt: "x", creditsUsed: 42 } });
    const generation = makeGeneration({ creditsUsed: 5 });
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("404 model not found"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue(null);
    refundCredits.mockResolvedValue({});

    await runJob(job, { workerId: "worker-1" });

    expect(refundCredits).toHaveBeenCalledWith("user1", 42, "gen1", "Generation failed");
  });

  it("never calls both release and refund for the same failure", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("insufficient provider balance"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 }); // succeeds — active reservation released

    await runJob(job, { workerId: "worker-1" });

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("does not move credits when the generation was already terminalized by a concurrent winner before our transition", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("Invalid API key"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 0 }); // lost the race

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("a credit-side failure during release/refund is logged loudly and does not throw or mask the outcome", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockRejectedValue(new Error("Invalid API key"));
    failJob.mockResolvedValue({ status: "dead", willRetry: false });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockRejectedValue(new Error("DB connection lost"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await expect(runJob(job, { workerId: "worker-1" })).resolves.toEqual({ outcome: "failed" });

    expect(refundCredits).not.toHaveBeenCalled();
    // Phase 7 Task 1: structured JSON line via src/lib/log.js replaces the
    // old free-text "RELEASE/REFUND FAILED" console.error string — same
    // loud-log-and-swallow behavior, new event name + ids.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(line).toMatchObject({
      level: "error",
      event: "credit_release_refund_failed",
      userId: "user1",
      generationId: "gen1",
      amount: 5,
    });
    expect(line.err.message).toBe("DB connection lost");
    errorSpy.mockRestore();
    return result;
  });
});

describe("runJob — settle failure is logged loudly, never masks a successful ingest", () => {
  it("logs and swallows a settleReservation failure instead of throwing", async () => {
    const job = makeJob();
    const generation = makeGeneration();
    prisma.generation.findUnique.mockResolvedValue(generation);
    submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
    pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockRejectedValue(new Error("DB connection lost"));
    completeJob.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "succeeded" });
    expect(completeJob).toHaveBeenCalled();
    // Phase 7 Task 1: structured JSON line via src/lib/log.js replaces the
    // old free-text "SETTLE FAILED" console.error string.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(line).toMatchObject({
      level: "error",
      event: "generation_settle_failed",
      userId: "user1",
      generationId: "gen1",
      amount: 5,
    });
    expect(line.err.message).toBe("DB connection lost");
    errorSpy.mockRestore();
  });
});

describe("runJob — long poll heartbeats the lease", () => {
  it("calls heartbeatJob at least once while waiting on a slow poll", async () => {
    vi.useFakeTimers();
    try {
      const job = makeJob();
      const generation = makeGeneration();
      prisma.generation.findUnique.mockResolvedValue(generation);
      submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
      heartbeatJob.mockResolvedValue(true);

      let resolvePoll;
      pollProviderResult.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvePoll = resolve;
          })
      );
      ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
      prisma.generation.updateMany.mockResolvedValue({ count: 1 });
      settleReservation.mockResolvedValue({});
      completeJob.mockResolvedValue({});

      const runPromise = runJob(job, { workerId: "worker-1" });

      // Let the microtask queue advance to the point pollProviderResult was
      // called and its promise is pending, then advance real+fake time past
      // one heartbeat interval.
      await vi.advanceTimersByTimeAsync(60 * 1000);

      expect(heartbeatJob).toHaveBeenCalledWith("job1", "worker-1");
      expect(heartbeatJob.mock.calls.length).toBeGreaterThanOrEqual(1);

      resolvePoll({ outputs: ["https://provider/out.png"] });
      const result = await runPromise;

      expect(result).toEqual({ outcome: "succeeded" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the heartbeat timer once the poll settles (no heartbeat calls after completion)", async () => {
    vi.useFakeTimers();
    try {
      const job = makeJob();
      const generation = makeGeneration();
      prisma.generation.findUnique.mockResolvedValue(generation);
      submitOnly.mockResolvedValue({ provider: PROVIDER_OBJ, requestId: "req_1" });
      pollProviderResult.mockResolvedValue({ outputs: ["https://provider/out.png"] });
      ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
      prisma.generation.updateMany.mockResolvedValue({ count: 1 });
      settleReservation.mockResolvedValue({});
      completeJob.mockResolvedValue({});

      await runJob(job, { workerId: "worker-1" });
      const callsRightAfter = heartbeatJob.mock.calls.length;

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      expect(heartbeatJob.mock.calls.length).toBe(callsRightAfter);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runJob — missing generation row", () => {
  it("marks the job dead defensively and moves no credits when the generation row cannot be found", async () => {
    const job = makeJob();
    prisma.generation.findUnique.mockResolvedValue(null);
    failJob.mockResolvedValue({ status: "dead", willRetry: false });

    const result = await runJob(job, { workerId: "worker-1" });

    expect(result).toEqual({ outcome: "failed" });
    expect(failJob).toHaveBeenCalledWith("job1", "Generation gen1 not found", { retryable: false });
    expect(settleReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });
});
