import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    generation: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    generationJob: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});
vi.mock("@/lib/wallet", () => ({ refundCredits: vi.fn(), settleReservation: vi.fn(), releaseReservation: vi.fn() }));
vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
}));
vi.mock("@/lib/media-download", () => ({
  extractKieResults: vi.fn(() => null),
}));

import prisma from "@/lib/prisma";
import { refundCredits, settleReservation, releaseReservation } from "@/lib/wallet";
import { ingestFromUrl } from "@/lib/storage/ingest";
import { handleGenerationWebhook } from "@/lib/generation-webhook";

// ingestFromUrl's return shape is the richer { url, key, bytes, sha256 }
// (Phase 4B Task 4) — generation-webhook.js only uses .url, but every mock
// below returns the full shape to match the real contract.
function ingestResult(url) {
  return { url, key: url.split("/").pop(), bytes: 123, sha256: "a".repeat(64) };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Phase 4A Task 6: most existing tests below exercise the legacy
  // (pre-Task-5, sync-route) lookup paths, where no GenerationJob row ever
  // existed — default both job lookups to "not found" so those tests don't
  // need to know about the job table at all.
  prisma.generationJob.findFirst.mockResolvedValue(null);
  prisma.generationJob.findUnique.mockResolvedValue(null);
  // Default: nothing active to release (the legacy/already-settled case) —
  // every test below except the dedicated "still active" ones represents
  // that case, so the failure path falls through to refundCredits exactly
  // as it always did.
  releaseReservation.mockResolvedValue(null);
});

describe("handleGenerationWebhook — failure path", () => {
  it("tries releaseReservation first, then refunds inside the SAME $transaction, when nothing was active to release", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1",
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "boom",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, refunded: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const updateManyArgs = prisma.generation.updateMany.mock.calls[0][0];
    expect(updateManyArgs.where).toEqual({ id: "gen1", status: { notIn: ["failed", "completed"] } });
    expect(updateManyArgs.data).toEqual({ status: "failed", error: "boom" });

    expect(releaseReservation).toHaveBeenCalledWith("u1", "gen1", prisma);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    const refundArgs = refundCredits.mock.calls[0];
    expect(refundArgs[0]).toBe("u1"); // userId
    expect(refundArgs[1]).toBe(5); // generation.creditsUsed
    expect(refundArgs[2]).toBe("gen1"); // jobId
    expect(refundArgs[4]).toBe(prisma); // the tx client (mocked $transaction hands back `prisma`)

    // No GenerationJob row for this (legacy) generation — no job update.
    expect(prisma.generationJob.update).not.toHaveBeenCalled();
  });

  it("releases the still-active reservation instead of refunding — Task 5's new reality: a failure can now arrive BEFORE anything settled", async () => {
    // This is the money bug Task 6 fixes (found proving exactly-once settle
    // against the real test DB, not named in the brief): before Task 5, a
    // failure webhook could only ever arrive after the reservation was
    // already settled inline, so refundCredits-only happened to be correct
    // by accident. Task 5 leaves the reservation ACTIVE until something
    // settles it, so this branch must now handle "still active" too.
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1",
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 }); // active reservation found and released

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "boom",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, refunded: true });
    expect(releaseReservation).toHaveBeenCalledWith("u1", "gen1", prisma);
    expect(refundCredits).not.toHaveBeenCalled(); // never both
  });

  it("falls back to refundCredits when releaseReservation throws the race-condition error", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1",
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockRejectedValue(new Error("No active reservation found"));

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "boom",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, refunded: true });
    expect(refundCredits).toHaveBeenCalledTimes(1);
  });

  it("does not refund a duplicate delivery once the generation already transitioned out of non-terminal state", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1",
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 0 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "boom",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, alreadyProcessed: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("skips the refund call (but still transitions) when creditsUsed is 0", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 0, requestId: "req1",
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "boom",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, refunded: false });
    expect(refundCredits).not.toHaveBeenCalled();
  });
});

describe("handleGenerationWebhook — failure path, job-backed generation (Task 6)", () => {
  it("marks the job dead and RELEASES (not refunds) the still-active reservation — the realistic job-backed case, found via GenerationJob.providerRequestId (not Generation.requestId, which Task 5's async path never sets)", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1", providerRequestId: "req1" });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: null,
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 }); // active — nothing has settled yet

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "provider says no",
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, refunded: true });

    // Found via the job table — the legacy Generation.requestId fallback
    // was never even consulted.
    expect(prisma.generation.findFirst).not.toHaveBeenCalled();

    expect(prisma.generationJob.update).toHaveBeenCalledTimes(1);
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "dead", leaseUntil: null, lockedBy: null, lastError: "provider says no" },
    });

    expect(releaseReservation).toHaveBeenCalledWith("u1", "gen1", prisma);
    expect(refundCredits).not.toHaveBeenCalled(); // never both
  });

  it("falls back to refundCredits for a job-backed generation whose reservation was somehow already settled", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1", providerRequestId: "req1" });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: null,
    });
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    // releaseReservation defaults to null in beforeEach — nothing active.

    const { response } = await handleGenerationWebhook({
      request_id: "req1", status: "failed", error: "provider says no",
    });

    expect(response).toMatchObject({ success: true, refunded: true });
    expect(refundCredits).toHaveBeenCalledTimes(1);
    expect(refundCredits).toHaveBeenCalledWith("u1", 5, "gen1", "Refund: provider says no", prisma);
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "dead", leaseUntil: null, lockedBy: null, lastError: "provider says no" },
    });
  });

  it("does not mark the job dead twice, or release/refund twice, on a duplicate delivery for a job-backed generation", async () => {
    prisma.generationJob.findFirst.mockResolvedValue({ id: "job1", generationId: "gen1", providerRequestId: "req1" });
    prisma.generation.findUnique.mockResolvedValue({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: null,
    });
    prisma.generation.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const first = await handleGenerationWebhook({ request_id: "req1", status: "failed", error: "boom" });
    expect(first.response).toMatchObject({ success: true, refunded: true });

    const second = await handleGenerationWebhook({ request_id: "req1", status: "failed", error: "boom" });
    expect(second.response).toMatchObject({ success: true, alreadyProcessed: true });

    expect(releaseReservation).toHaveBeenCalledTimes(1);
    expect(refundCredits).not.toHaveBeenCalled();
    expect(prisma.generationJob.update).toHaveBeenCalledTimes(1);
  });

  it("still finds and terminates the job when the generation was found via the legacy Generation.requestId fallback (narrow race: providerRequestId not yet persisted by the runner)", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce(null); // not found by providerRequestId yet
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1",
    });
    prisma.generationJob.findUnique.mockResolvedValueOnce({ id: "job1", generationId: "gen1" }); // found by generationId instead
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    releaseReservation.mockResolvedValue({ available: 10 });

    const { response } = await handleGenerationWebhook({ request_id: "req1", status: "failed", error: "boom" });

    expect(response).toMatchObject({ success: true, refunded: true });
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "dead", leaseUntil: null, lockedBy: null, lastError: "boom" },
    });
  });
});

describe("handleGenerationWebhook — success path", () => {
  it("marks the generation completed via the conditional transaction and settles the reservation when there is no job row (legacy sync-route generation)", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1", outputUrl: null,
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/x.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockResolvedValue({ available: 10 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://example.com/y.png"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, downloaded: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const transitionCall = prisma.generation.updateMany.mock.calls[0][0];
    expect(transitionCall.where).toEqual({ id: "gen1", status: { notIn: ["failed", "completed"] } });
    expect(transitionCall.data).toMatchObject({ status: "completed", outputUrl: "/api/media/local/x.png" });

    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("u1", "gen1", 5, prisma);
    expect(prisma.generationJob.update).not.toHaveBeenCalled();
  });
});

describe("handleGenerationWebhook — success path, job-backed generation: exactly-once settle (Task 6)", () => {
  it("settles AND marks the job succeeded when the webhook wins the completion race", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1", providerRequestId: null });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "pending", creditsUsed: 5, requestId: null, outputUrl: null,
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 }); // webhook wins the CAS
    settleReservation.mockResolvedValue({ available: 10 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://provider/out.png"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true, downloaded: true });

    expect(settleReservation).toHaveBeenCalledTimes(1);
    expect(settleReservation).toHaveBeenCalledWith("u1", "gen1", 5, prisma);

    expect(prisma.generationJob.update).toHaveBeenCalledTimes(1);
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "succeeded", leaseUntil: null, lockedBy: null, providerRequestId: "req1" },
    });
  });

  it("does NOT settle when the runner already won the completion race (assert no double settle) — but still marks the job succeeded", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1", providerRequestId: "req1" });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "pending", creditsUsed: 5, requestId: null, outputUrl: null,
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    // The runner's OWN updateMany already committed status:"completed"
    // between this webhook's initial (still non-terminal) read and its own
    // conditional transition below — this is the real race, not a
    // same-process re-check.
    prisma.generation.updateMany.mockResolvedValue({ count: 0 });

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://provider/out.png"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true });

    expect(settleReservation).not.toHaveBeenCalled(); // exactly-once: the runner already settled

    // Still terminates the job — this delivery genuinely observed success
    // too, independent of who won the credit race (mirrors job-runner's own
    // unconditional completeJob call after a successful ingest).
    expect(prisma.generationJob.update).toHaveBeenCalledWith({
      where: { id: "job1" },
      data: { status: "succeeded", leaseUntil: null, lockedBy: null, providerRequestId: "req1" },
    });
  });

  it("a settle failure is logged loudly and does not prevent the generation/job from being marked terminal (mirrors job-runner's safeSettle)", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1" });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "pending", creditsUsed: 5, requestId: null, outputUrl: null,
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });
    settleReservation.mockRejectedValue(new Error("DB connection lost"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://provider/out.png"],
    });

    expect(status).toBe(200);
    expect(response).toMatchObject({ success: true });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("SETTLE FAILED"), expect.any(String));
    expect(prisma.generationJob.update).toHaveBeenCalledTimes(1); // job still terminated
    errorSpy.mockRestore();
  });

  it("skips settle when creditsUsed is 0, but still marks the job succeeded", async () => {
    prisma.generationJob.findFirst.mockResolvedValueOnce({ id: "job1", generationId: "gen1" });
    prisma.generation.findUnique.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "pending", creditsUsed: 0, requestId: null, outputUrl: null,
    });
    ingestFromUrl.mockResolvedValue(ingestResult("/api/media/local/abc.png"));
    prisma.generation.updateMany.mockResolvedValue({ count: 1 });

    const { response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://provider/out.png"],
    });

    expect(response).toMatchObject({ success: true });
    expect(settleReservation).not.toHaveBeenCalled();
    expect(prisma.generationJob.update).toHaveBeenCalledTimes(1);
  });
});

describe("handleGenerationWebhook — idempotency guard on already-terminal generations", () => {
  it("returns alreadyProcessed without opening a transaction when the generation is already failed", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "failed", creditsUsed: 5, requestId: "req1",
    });

    const { status, response } = await handleGenerationWebhook({ request_id: "req1", status: "failed" });

    expect(status).toBe(200);
    expect(response).toMatchObject({ alreadyProcessed: true, status: "failed" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("returns alreadyProcessed without opening a transaction when the generation is already completed", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "completed", creditsUsed: 5, requestId: "req1",
    });

    const { status, response } = await handleGenerationWebhook({ request_id: "req1", status: "failed" });

    expect(status).toBe(200);
    expect(response).toMatchObject({ alreadyProcessed: true, status: "completed" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
  });
});

describe("handleGenerationWebhook — lookup", () => {
  it("returns 404 when no generation matches by job, requestId, params path, or id", async () => {
    prisma.generation.findFirst.mockResolvedValue(null);

    const { status, response } = await handleGenerationWebhook({ request_id: "missing" });

    expect(status).toBe(404);
    expect(response).toMatchObject({ error: "Generation not found" });
  });

  it("returns 400 when the payload carries no task/request id", async () => {
    const { status, response } = await handleGenerationWebhook({});
    expect(status).toBe(400);
    expect(response).toMatchObject({ error: "Missing task/request ID" });
  });
});
