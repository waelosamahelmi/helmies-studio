import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    generation: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});
vi.mock("@/lib/wallet", () => ({ refundCredits: vi.fn() }));
vi.mock("@/lib/media-download", () => ({
  downloadAllMedia: vi.fn(),
  extractKieResults: vi.fn(() => null),
}));

import prisma from "@/lib/prisma";
import { refundCredits } from "@/lib/wallet";
import { downloadAllMedia } from "@/lib/media-download";
import { handleGenerationWebhook } from "@/lib/generation-webhook";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleGenerationWebhook — failure path", () => {
  it("runs the transition + refund inside one $transaction, refunding the tx client with creditsUsed", async () => {
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

    expect(refundCredits).toHaveBeenCalledTimes(1);
    const refundArgs = refundCredits.mock.calls[0];
    expect(refundArgs[0]).toBe("u1"); // userId
    expect(refundArgs[1]).toBe(5); // generation.creditsUsed
    expect(refundArgs[2]).toBe("gen1"); // jobId
    expect(refundArgs[4]).toBe(prisma); // the tx client (mocked $transaction hands back `prisma`)
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

describe("handleGenerationWebhook — success path", () => {
  it("marks the generation completed and never touches the wallet or a transaction", async () => {
    prisma.generation.findFirst.mockResolvedValueOnce({
      id: "gen1", userId: "u1", status: "processing", creditsUsed: 5, requestId: "req1", outputUrl: null,
    });
    downloadAllMedia.mockResolvedValue("/api/media/local/x.png");
    prisma.generation.update.mockResolvedValue({});

    const { status, response } = await handleGenerationWebhook({
      request_id: "req1", status: "completed", outputs: ["https://example.com/y.png"],
    });

    expect(status).toBe(200);
    expect(response.success).toBe(true);
    expect(prisma.generation.update).toHaveBeenCalledTimes(1);
    expect(prisma.generation.update.mock.calls[0][0].data.status).toBe("completed");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled();
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
  it("returns 404 when no generation matches by requestId, params path, or id", async () => {
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
