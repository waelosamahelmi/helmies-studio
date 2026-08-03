import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks: sync path (generation-handler.js, driven through the image route) ──
vi.mock("@/lib/prisma", () => {
  const models = {
    modelPricing: { findUnique: vi.fn() },
    generation: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    generationJob: { findUnique: vi.fn() },
    asset: { create: vi.fn(), findFirst: vi.fn() },
    promptCompilation: { create: vi.fn() },
    user: { update: vi.fn() },
    brandKit: { findFirst: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});
vi.mock("@/lib/session", () => ({ getCurrentUserWithCredits: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/lib/api-key-auth", () => ({ authenticateApiKey: vi.fn() }));
// Origin verification (Task 3, generate/async's cookie-session branch) is
// exercised on its own in tests/unit/origin-check.test.mjs — stub it here so
// this file's pricing assertions don't need matching Origin headers.
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn(), logAudit: vi.fn() }));
vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  reserveCredits: vi.fn(),
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  refundCredits: vi.fn(),
}));
vi.mock("@/lib/model-catalog", () => ({ quoteCatalogModel: vi.fn() }));
// Task 5: /api/generate/async now enqueues a durable job instead of calling
// submitOnly inline — see tests/unit/generate-async-enqueue.test.mjs for
// dedicated coverage of that behavior. This file only needs enqueueJob
// mocked so the async describe block below (which predates Task 5 and only
// asserts on pricing/reservation behavior) doesn't hit the real job-queue
// module against an incomplete prisma mock.
vi.mock("@/lib/job-queue", () => ({ enqueueJob: vi.fn() }));
vi.mock("@/lib/providers", () => ({
  resolveProvider: vi.fn(),
  resolveProviderWithFallback: vi.fn(),
  brandError: vi.fn((m) => m),
  logProviderError: vi.fn(),
  submitAndPoll: vi.fn(),
  submitOnly: vi.fn(),
  PROVIDERS: { kie: { getKey: () => "k" }, alibaba: { getKey: () => "k" } },
  DEFAULT_PROVIDER: "kie",
}));
vi.mock("@/lib/prompt-expansion", () => ({
  expandPrompt: vi.fn(async (p) => p),
  getNegativePrompt: vi.fn(() => ""),
  shouldExpand: vi.fn(() => false),
}));
vi.mock("@/lib/memory", () => ({ applyMemoryToPrompt: vi.fn() }));
vi.mock("@/lib/quality-gate", () => ({
  validateGenerationOutput: vi.fn(async () => ({ valid: true })),
  logQualityGate: vi.fn(),
}));
vi.mock("@/lib/storage/ingest", () => ({
  // ingestFromUrl's return shape is the richer { url, key, bytes, sha256 }
  // (Phase 4B Task 4) — generation-handler.js only uses .url; this
  // pass-through mock mirrors storeMedia's old pass-through-the-url test
  // double exactly.
  ingestFromUrl: vi.fn(async (u) => ({ url: u, key: "k", bytes: 1, sha256: "a".repeat(64) })),
}));
vi.mock("@/lib/prompt-engine", () => ({
  compilePrompt: vi.fn(async ({ rawPrompt }) => ({
    finalPrompt: rawPrompt,
    negativePrompt: null,
    warnings: [],
    guideVersion: "v1",
  })),
}));
vi.mock("@/lib/generation", () => ({ generateImage: vi.fn() }));
// The route's own pre-fetch default — mimics the flat 2-credit "image" tool
// default from plan-constants.js CREDIT_COSTS. handleGeneration must never
// bill this once a ModelPricing row is consulted.
vi.mock("@/lib/credits", () => ({ getCreditCost: vi.fn(async () => 2) }));

import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkRateLimit } from "@/lib/security";
import { getWallet, reserveCredits, settleReservation } from "@/lib/wallet";
import { quoteCatalogModel } from "@/lib/model-catalog";
import { resolveProvider, resolveProviderWithFallback, submitOnly } from "@/lib/providers";
import { enqueueJob } from "@/lib/job-queue";
import { generateImage } from "@/lib/generation";
import { POST as postImage } from "@/app/api/generate/image/route.js";
import { POST as postAsync } from "@/app/api/generate/async/route.js";

const jsonReq = (body, url = "http://test/api/generate/image") =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateApiKey.mockResolvedValue(null);
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1", credits: 1000 });
  checkRateLimit.mockResolvedValue({ allowed: true });
  resolveProvider.mockResolvedValue({ name: "kie", getKey: () => "k" });
  resolveProviderWithFallback.mockResolvedValue([{ name: "kie", getKey: () => "k" }]);
  submitOnly.mockResolvedValue({ requestId: "req1" });
  getWallet.mockResolvedValue({ available: 1000 });
  reserveCredits.mockResolvedValue({});
  settleReservation.mockResolvedValue({ available: 998 });
  prisma.generation.create.mockResolvedValue({ id: "gen1" });
  prisma.generation.update.mockResolvedValue({});
  prisma.generation.findUnique.mockResolvedValue({ id: "gen1" });
  prisma.generationJob.findUnique.mockResolvedValue(null); // no pre-existing duplicate job
  enqueueJob.mockResolvedValue({ id: "job1", generationId: "gen1" });
  generateImage.mockResolvedValue({ url: "https://example.com/out.png", requestId: "req1" });
});

describe("sync generation path (handleGeneration via /api/generate/image) — strict model pricing", () => {
  it("400s when body.model is missing, even when body.endpoint or the tool name would have matched something before", async () => {
    const res = await postImage(jsonReq({ endpoint: "nano-banana-pro", prompt: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Model required" });
    expect(prisma.modelPricing.findUnique).not.toHaveBeenCalled();
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("422s when body.model is set but no ModelPricing row exists, even though the static registry knows the model", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    // nano-banana-pro is a real static-registry model id (see MODEL_REGISTRY in
    // generation-handler.js) — this proves the registry can no longer stand in
    // for a priced row.
    const res = await postImage(jsonReq({ model: "nano-banana-pro", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Model not priced", model: "nano-banana-pro" });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("422s when the ModelPricing row is inactive", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: false, isDeprecated: false, creditsCost: 5, providerCost: 0.1,
    });
    const res = await postImage(jsonReq({ model: "m1", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Model not priced", model: "m1" });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("422s when the ModelPricing row is deprecated", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: true, creditsCost: 5, providerCost: 0.1,
    });
    const res = await postImage(jsonReq({ model: "m1", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Model not priced", model: "m1" });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("happy path: bills the ModelPricing row's creditsCost, never the tool's flat CREDIT_COSTS default", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: false, creditsCost: 47, providerCost: 1.2,
      pricingRules: null, providerModelId: "m1", endpoint: "m1",
    });
    const res = await postImage(jsonReq({ model: "m1", prompt: "x" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.creditsUsed).toBe(47);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 47, "gen1");
    expect(prisma.generation.create.mock.calls[0][0].data.creditsUsed).toBe(47);
  });

  it("happy path: bills the pricingRules quote when present, ignoring creditsCost and the flat default", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: false, creditsCost: 5, providerCost: 0.1,
      pricingRules: { base: 1 }, providerModelId: "m1", endpoint: "m1",
    });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 99, providerCost: 3.4 });
    const res = await postImage(jsonReq({ model: "m1", prompt: "x" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.creditsUsed).toBe(99);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 99, "gen1");
  });
});

describe("async generation path (/api/generate/async) — strict model pricing", () => {
  const asyncReq = (body) => jsonReq(body, "http://test/api/generate/async");

  it("400s when body.model is missing", async () => {
    const res = await postAsync(asyncReq({ tool: "image", endpoint: "nano-banana-pro", prompt: "x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Model required", code: "bad_request" });
    expect(prisma.modelPricing.findUnique).not.toHaveBeenCalled();
  });

  it("422s when body.model is set but no ModelPricing row exists, even though the static registry knows the model", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    const res = await postAsync(asyncReq({ tool: "image", model: "nano-banana-pro", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "model_not_priced", model: "nano-banana-pro" });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("422s when the ModelPricing row is inactive", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: false, isDeprecated: false, creditsCost: 5, providerCost: 0.1,
    });
    const res = await postAsync(asyncReq({ tool: "image", model: "m1", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "model_not_priced", model: "m1" });
  });

  it("422s when the ModelPricing row is deprecated", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: true, creditsCost: 5, providerCost: 0.1,
    });
    const res = await postAsync(asyncReq({ tool: "image", model: "m1", prompt: "x" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "model_not_priced", model: "m1" });
  });

  it("happy path: bills the ModelPricing row's creditsCost", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: false, creditsCost: 47, providerCost: 1.2,
      pricingRules: null, providerModelId: "m1", endpoint: "m1",
    });
    const res = await postAsync(asyncReq({ tool: "image", model: "m1", prompt: "x" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.creditsUsed).toBe(47);
    expect(reserveCredits).toHaveBeenCalledWith("u1", 47, "gen1");
  });

  it("happy path: bills the pricingRules quote when present, ignoring creditsCost", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1", isActive: true, isDeprecated: false, creditsCost: 5, providerCost: 0.1,
      pricingRules: { base: 1 }, providerModelId: "m1", endpoint: "m1",
    });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 99, providerCost: 3.4 });
    const res = await postAsync(asyncReq({ tool: "image", model: "m1", prompt: "x" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.creditsUsed).toBe(99);
  });
});
