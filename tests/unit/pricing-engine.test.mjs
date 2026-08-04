// tests/unit/pricing-engine.test.mjs
import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  providerConfig: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  modelPricing: { upsert: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import {
  calculateCredits,
  setModelPricing,
  setProviderMarkup,
  assertCreditsCoverCost,
  assertMarkupAboveFloor,
  estimateCredits,
  estimateAgentTask,
  MIN_MARKUP,
  CREDIT_TO_EUR,
} from "@/lib/pricing-engine";

describe("calculateCredits", () => {
  it("applies 2.5x default markup at 1 credit = €0.01", () => {
    // €0.10 provider cost * 2.5 / 0.01 = 25 credits
    expect(calculateCredits(0.1)).toBe(25);
  });

  it("rounds up, never down", () => {
    // 0.001 * 2.5 / 0.01 = 0.25 → 1
    expect(calculateCredits(0.001)).toBe(1);
    // 0.0333 * 2.5 / 0.01 = 8.325 → 9
    expect(calculateCredits(0.0333)).toBe(9);
  });

  it("charges a minimum of 1 credit", () => {
    expect(calculateCredits(0)).toBe(1);
    expect(calculateCredits(-5)).toBe(1);
    expect(calculateCredits(null)).toBe(1);
    expect(calculateCredits(undefined)).toBe(1);
  });

  it("honors a per-provider markup override", () => {
    // €0.10 * 4.0 / 0.01 = 40
    expect(calculateCredits(0.1, 4.0)).toBe(40);
  });
});

// Code review: neither setModelPricing nor setProviderMarkup validated
// anything before this fix — an admin could price a model below its own
// provider cost (quantified example the review found: a 10s video at
// $0.075/sec costs the provider ~$0.75; creditsCost:5, worth €0.05, was
// accepted with no rejection) or set a provider's markup below breakeven
// (1.0), both a guaranteed per-generation loss.
describe("margin floor — setModelPricing rejects pricing below provider cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.modelPricing.upsert.mockResolvedValue({});
  });

  it("rejects the review's exact quantified scenario: $0.75 provider cost, creditsCost:5", async () => {
    // ceil(0.75 / 0.01) = 75 minimum credits — 5 is nowhere close.
    await expect(setModelPricing("wan2.6-i2v-flash", "i2v", "KIE", 0.75, 5)).rejects.toThrow(
      /below its provider cost/
    );
    expect(prismaMock.modelPricing.upsert).not.toHaveBeenCalled();
  });

  it("rejects creditsCost even one credit short of the floor", async () => {
    // providerCost 0.10 -> minCredits = ceil(0.10/0.01) = 10
    await expect(setModelPricing("m1", "image", "KIE", 0.1, 9)).rejects.toThrow(/minimum is 10 credits/);
    expect(prismaMock.modelPricing.upsert).not.toHaveBeenCalled();
  });

  it("accepts creditsCost exactly at the floor, and above it", async () => {
    await expect(setModelPricing("m1", "image", "KIE", 0.1, 10)).resolves.toBeUndefined();
    await expect(setModelPricing("m1", "image", "KIE", 0.1, 25)).resolves.toBeUndefined();
    expect(prismaMock.modelPricing.upsert).toHaveBeenCalledTimes(2);
  });

  it("a valid update still succeeds and writes exactly the given values", async () => {
    await setModelPricing("m1", "image", "KIE", 0.1, 25);
    expect(prismaMock.modelPricing.upsert).toHaveBeenCalledWith({
      where: { modelId: "m1" },
      create: { modelId: "m1", modelType: "image", providerName: "KIE", providerCost: 0.1, creditsCost: 25 },
      update: { providerCost: 0.1, creditsCost: 25, providerName: "KIE" },
    });
  });

  it("does not floor a brand-new model with no provider cost on record yet (providerCost 0)", async () => {
    await expect(setModelPricing("new-model", "image", "KIE", 0, 1)).resolves.toBeUndefined();
    expect(prismaMock.modelPricing.upsert).toHaveBeenCalled();
  });
});

describe("margin floor — setProviderMarkup rejects markup below breakeven", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.providerConfig.upsert.mockResolvedValue({});
  });

  it("rejects the review's exact scenario: markup 0.5", async () => {
    await expect(setProviderMarkup("KIE", 0.5)).rejects.toThrow(/at least 1/);
    expect(prismaMock.providerConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric or non-finite markup", async () => {
    await expect(setProviderMarkup("KIE", NaN)).rejects.toThrow(/at least 1/);
    await expect(setProviderMarkup("KIE", undefined)).rejects.toThrow(/at least 1/);
    expect(prismaMock.providerConfig.upsert).not.toHaveBeenCalled();
  });

  it("accepts markup exactly at breakeven (1.0), and a valid update still succeeds", async () => {
    await expect(setProviderMarkup("KIE", MIN_MARKUP)).resolves.toBeUndefined();
    await setProviderMarkup("KIE", 2.5);
    expect(prismaMock.providerConfig.upsert).toHaveBeenCalledWith({
      where: { name: "KIE" },
      create: { name: "KIE", type: "image+video", markup: 2.5 },
      update: { markup: 2.5 },
    });
  });
});

describe("assertCreditsCoverCost / assertMarkupAboveFloor — reused constants, no second pricing constant invented", () => {
  it("computes the minimum credits floor from CREDIT_TO_EUR directly", () => {
    expect(() => assertCreditsCoverCost(1, Math.ceil(1 / CREDIT_TO_EUR))).not.toThrow();
    expect(() => assertCreditsCoverCost(1, Math.ceil(1 / CREDIT_TO_EUR) - 1)).toThrow(/below its provider cost/);
  });

  it("MIN_MARKUP is breakeven (1.0), not the 2.5x default markup", () => {
    expect(MIN_MARKUP).toBe(1.0);
    expect(() => assertMarkupAboveFloor(1.0)).not.toThrow();
    expect(() => assertMarkupAboveFloor(0.999)).toThrow();
  });
});

// ── EDITSv1 E5.1 — non-provider workflow steps ───────────────────────────
// `assembly` and `export` never call a generation provider, so no
// ModelPricing row can ever quote them. Their price is fixed here, on the
// server, and must be the SAME number /api/estimate shows the builder and
// executeWorkflow reserves against the wallet. The step's KIND decides the
// price — naming an expensive model on an assembly step must not change what
// it costs, and naming a cheap one must not make a real generation free.
describe("non-provider step quotes — server-fixed, kind-decided", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.modelPricing.findUnique.mockResolvedValue(null);
    prismaMock.modelPricing.findFirst.mockResolvedValue(null);
  });

  it("assembly is a flat 5 credits — the same figure the director charges", async () => {
    await expect(estimateCredits("assembly", "assembly", {})).resolves.toBe(5);
  });

  it("export costs nothing", async () => {
    await expect(estimateCredits("export", "export", {})).resolves.toBe(0);
  });

  it("a model name on the step cannot move either price", async () => {
    prismaMock.modelPricing.findUnique.mockResolvedValue({
      modelId: "expensive-model", providerCost: 5, creditsCost: 900, providerName: "kie", pricingRules: null,
    });

    await expect(estimateCredits("assembly", "expensive-model", {})).resolves.toBe(5);
    await expect(estimateCredits("export", "expensive-model", {})).resolves.toBe(0);
    expect(prismaMock.modelPricing.findUnique).not.toHaveBeenCalled();
  });

  it("estimateAgentTask sums a mixed chain with the same fixed figures", async () => {
    const { total, breakdown } = await estimateAgentTask([
      { agent: "image", task: "Hero", params: { model: "unpriced-image-model" } },
      { agent: "assembly", task: "Cut", params: {} },
      { agent: "export", task: "Deliver", params: {} },
    ]);

    // image falls back to 2 (no pricing row), assembly 5, export 0.
    expect(breakdown.map((b) => b.credits)).toEqual([2, 5, 0]);
    expect(total).toBe(7);
  });

  it("the new provider-backed kinds have sane fallbacks when a model is unpriced", async () => {
    await expect(estimateCredits("i2v", "unpriced", {})).resolves.toBeGreaterThan(0);
    await expect(estimateCredits("upscale", "unpriced", {})).resolves.toBeGreaterThan(0);
    await expect(estimateCredits("music", "unpriced", {})).resolves.toBeGreaterThan(0);
    await expect(estimateCredits("voiceover", "unpriced", {})).resolves.toBeGreaterThan(0);
  });
});
