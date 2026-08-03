import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Phase 4A Task 5 — /api/generate/async stops calling the provider inline
// and enqueues a durable GenerationJob instead. The reservation now stays
// ACTIVE when this route returns; settlement moves to the job runner
// (src/lib/job-runner.js, already shipped) or the webhook (Task 6).

vi.mock("@/lib/prisma", () => {
  const models = {
    modelPricing: { findUnique: vi.fn() },
    generation: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    generationJob: { findUnique: vi.fn() },
    user: { update: vi.fn() },
  };
  return { default: models };
});
vi.mock("@/lib/session", () => ({ getCurrentUserWithCredits: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  reserveCredits: vi.fn(),
  releaseReservation: vi.fn(),
}));
vi.mock("@/lib/providers", () => ({ resolveProvider: vi.fn() }));
vi.mock("@/lib/job-queue", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/lib/model-catalog", () => ({ quoteCatalogModel: vi.fn() }));
vi.mock("@/lib/prompt-expansion", () => ({
  expandPrompt: vi.fn(async (p) => p),
  getNegativePrompt: vi.fn(() => ""),
  shouldExpand: vi.fn(() => false),
}));
vi.mock("@/lib/memory", () => ({ applyMemoryToPrompt: vi.fn() }));

import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { getWallet, reserveCredits, releaseReservation } from "@/lib/wallet";
import { resolveProvider } from "@/lib/providers";
import { enqueueJob } from "@/lib/job-queue";
import { POST } from "@/app/api/generate/async/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/generate/async", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// Mirrors the scheme documented in the route: sha256(userId + ":" + model +
// ":" + JSON.stringify(sortedParams) + ":" + minuteBucket).
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function expectedIdempotencyKey({ userId, model, tool, prompt, params, minuteBucket }) {
  const source = { tool: tool ?? null, prompt: prompt ?? "", ...params };
  return crypto
    .createHash("sha256")
    .update(`${userId}:${model}:${stableStringify(source)}:${minuteBucket}`)
    .digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1", credits: 1000 });
  checkRateLimit.mockResolvedValue({ allowed: true });
  resolveProvider.mockResolvedValue({ name: "kie", getKey: () => "k" });
  getWallet.mockResolvedValue({ available: 1000 });
  reserveCredits.mockResolvedValue({});
  releaseReservation.mockResolvedValue({ available: 1000 });
  prisma.modelPricing.findUnique.mockResolvedValue({
    modelId: "m1", isActive: true, isDeprecated: false, creditsCost: 10, providerCost: 0.1,
    pricingRules: null, providerModelId: "m1", endpoint: "resolved-endpoint",
  });
  prisma.generation.create.mockResolvedValue({ id: "gen1", creditsUsed: 10 });
  prisma.generation.update.mockResolvedValue({});
  prisma.generation.findUnique.mockResolvedValue({ id: "gen1", creditsUsed: 10 });
  prisma.generationJob.findUnique.mockResolvedValue(null);
  prisma.user.update.mockResolvedValue({});
  enqueueJob.mockResolvedValue({ id: "job1", generationId: "gen1" });

  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/generate/async — enqueues a durable job (Task 5)", () => {
  it("enqueues with the server-resolved endpoint/model, never body.endpoint", async () => {
    const res = await POST(jsonReq({
      tool: "image", model: "m1", prompt: "a cat",
      endpoint: "attacker-supplied-endpoint", size: "1024x1024",
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true, generationId: "gen1", jobId: "job1", status: "queued",
      creditsUsed: 10, pollUrl: "/api/generations/status?id=gen1",
    });
    expect(json.requestId).toBeUndefined();

    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const call = enqueueJob.mock.calls[0][0];
    expect(call.endpoint).toBe("resolved-endpoint");
    expect(call.endpoint).not.toBe("attacker-supplied-endpoint");
    expect(call.providerName).toBe("kie");
    expect(call.generationId).toBe("gen1");
    expect(call.userId).toBe("u1");
    // The payload handed to the provider must also carry the resolved
    // endpoint, never the client-supplied one.
    expect(call.payload.endpoint).toBe("resolved-endpoint");
  });

  // IMPORTANT-4 fix (found in review): job-runner.js/generation-webhook.js
  // both read job.payload.templateRunId to decide whether a job belongs to
  // a Phase 6 TemplateRun step, routing its terminal transition to
  // advanceTemplateRun instead of this generation's own settle/release. A
  // client-injected templateRunId/stepId in an ordinary /api/generate/async
  // body must never reach the job payload — that would let an attacker
  // hijack a normal generation into skipping its own settle/release and
  // instead driving an arbitrary (attacker-chosen) template run.
  it("strips a client-injected templateRunId/stepId — never reaches the job payload", async () => {
    const res = await POST(jsonReq({
      tool: "image", model: "m1", prompt: "a cat",
      templateRunId: "attacker-chosen-run-id", stepId: "step1",
    }));

    expect(res.status).toBe(200);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const call = enqueueJob.mock.calls[0][0];
    expect(call.payload.templateRunId).toBeUndefined();
    expect(call.payload.stepId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(call.payload, "templateRunId")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(call.payload, "stepId")).toBe(false);
  });

  it("reserves credits but never settles in the route — settle is the runner's/webhook's job now", async () => {
    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));

    expect(res.status).toBe(200);
    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 10, "gen1");
    // The reservation must stay ACTIVE — nothing in the happy path releases
    // or otherwise resolves it.
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("computes the idempotency key as sha256(userId:model:sortedParams:minuteBucket) and hands it to enqueueJob", async () => {
    await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat", size: "1024x1024" }));

    const expectedKey = expectedIdempotencyKey({
      userId: "u1", model: "m1", tool: "image", prompt: "a cat",
      params: { size: "1024x1024" },
      minuteBucket: Math.floor(Date.now() / 60000),
    });
    expect(enqueueJob.mock.calls[0][0].idempotencyKey).toBe(expectedKey);
  });

  it("a duplicate submit within the same minute returns the cached job and reserves only once", async () => {
    const first = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));
    expect(first.status).toBe(200);
    expect(reserveCredits).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(prisma.generation.create).toHaveBeenCalledTimes(1);

    const usedKey = enqueueJob.mock.calls[0][0].idempotencyKey;
    // Second click: a GenerationJob row now exists under that same key.
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", generationId: "gen1", idempotencyKey: usedKey });

    const second = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));
    expect(second.status).toBe(200);
    const json = await second.json();
    expect(json).toMatchObject({ success: true, generationId: "gen1", jobId: "job1", status: "queued" });

    expect(reserveCredits).toHaveBeenCalledTimes(1); // still just once total
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(prisma.generation.create).toHaveBeenCalledTimes(1);
  });

  it("a recognized duplicate skips even the insufficient-credits gate — the first submit already reserved", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", generationId: "gen1" });
    getWallet.mockResolvedValue({ available: 0 }); // would 402 on a fresh submit
    prisma.generation.findUnique.mockResolvedValue({ id: "gen1", creditsUsed: 10 });

    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));
    expect(res.status).toBe(200);
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("enqueue failure releases the reservation, marks the generation failed, and returns 500", async () => {
    enqueueJob.mockRejectedValue(new Error("DB write failed"));

    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));

    expect(res.status).toBe(500);
    const json = await res.json();
    // Task E2.1: the raw internal message must never reach the client — the
    // envelope carries a generic message + errorId instead, and the cause is
    // logged server-side.
    expect(json).toMatchObject({ code: "internal" });
    expect(typeof json.error).toBe("string");
    expect(json.error).not.toContain("DB write failed");
    expect(json.errorId).toMatch(/^[0-9a-f-]{8}$/);
    expect(releaseReservation).toHaveBeenCalledWith("u1", "gen1");
    expect(prisma.generation.update).toHaveBeenCalledWith({
      where: { id: "gen1" },
      data: { status: "failed", error: "DB write failed" },
    });
  });

  // Task E2.1 — the uniform error envelope is ADDITIVE: 402 keeps its
  // credits/cost fields, 429 keeps retryAfter, and every error body carries
  // code/title/errorId/retryable alongside the same string `error`.
  it("402s with an insufficient_credits envelope that keeps credits and cost", async () => {
    getWallet.mockResolvedValue({ available: 3 });

    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));

    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json).toMatchObject({ code: "insufficient_credits", credits: 3, cost: 10 });
    expect(json.error).toBe("This generation needs 10 credits but you have 3.");
    expect(typeof json.title).toBe("string");
    expect(json.errorId).toMatch(/^[0-9a-f-]{8}$/);
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("429s with a rate_limited envelope that keeps retryAfter", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 42 });

    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json).toMatchObject({ code: "rate_limited", retryAfter: 42, retryable: true });
    expect(json.errorId).toMatch(/^[0-9a-f-]{8}$/);
  });

  it("loses a concurrent duplicate race inside enqueueJob itself — releases its own reservation and returns the winner's job", async () => {
    // The pre-check (generationJob.findUnique) raced past a concurrent
    // identical request and saw nothing, but enqueueJob's own P2002
    // fallback (job-queue.js) hands back the winner's row instead of
    // creating a second one, since another request's idempotencyKey
    // collided with ours microseconds earlier.
    enqueueJob.mockResolvedValue({ id: "job-winner", generationId: "gen-winner" });
    prisma.generation.findUnique.mockResolvedValue({ id: "gen-winner", creditsUsed: 10 });

    const res = await POST(jsonReq({ tool: "image", model: "m1", prompt: "a cat" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, generationId: "gen-winner", jobId: "job-winner", status: "queued" });

    expect(releaseReservation).toHaveBeenCalledWith("u1", "gen1"); // our OWN (losing) reservation
    expect(prisma.generation.update).toHaveBeenCalledWith({
      where: { id: "gen1" },
      data: { status: "failed", error: expect.stringContaining("Duplicate") },
    });
  });
});
