import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    templateVersion: { findUnique: vi.fn() },
    modelPricing: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/model-catalog", () => ({
  quoteCatalogModel: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { quoteCatalogModel } from "@/lib/model-catalog";
import { quoteTemplate, canPublish } from "@/lib/template-quote";

beforeEach(() => vi.clearAllMocks());

function step(id, overrides = {}) {
  return { id, tool: "generate", modelId: `model-${id}`, inputs: {}, dependsOn: [], ...overrides };
}

describe("quoteTemplate", () => {
  it("sums per-step credits from quoteCatalogModel — never from the graph or the request", async () => {
    const graph = { steps: [step("step1"), step("step2", { dependsOn: ["step1"] })] };
    quoteCatalogModel.mockImplementation(async (modelId) => ({
      valid: true,
      modelId,
      credits: modelId === "model-step1" ? 5 : 8,
    }));

    const result = await quoteTemplate(graph, {});

    expect(result.valid).toBe(true);
    expect(result.totalCredits).toBe(13);
    expect(result.steps).toEqual([
      { stepId: "step1", modelId: "model-step1", credits: 5 },
      { stepId: "step2", modelId: "model-step2", credits: 8 },
    ]);
  });

  it("ignores a client-supplied credits/price field in the request inputs — the quote always comes from quoteCatalogModel", async () => {
    const graph = { steps: [step("step1")] };
    quoteCatalogModel.mockResolvedValue({ valid: true, modelId: "model-step1", credits: 5 });

    const result = await quoteTemplate(graph, { step1: { credits: 999999, price: 1 } });

    expect(result.totalCredits).toBe(5);
    expect(result.steps[0].credits).toBe(5);
  });

  it("an unpriced model makes the whole quote invalid, naming the step and model", async () => {
    const graph = { steps: [step("step1"), step("step2", { dependsOn: ["step1"] })] };
    quoteCatalogModel.mockImplementation(async (modelId) => {
      if (modelId === "model-step2") throw new Error("Model is unavailable");
      return { valid: true, modelId, credits: 5 };
    });

    const result = await quoteTemplate(graph, {});

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("step2") && e.includes("Model is unavailable"))).toBe(true);
    // The valid step is still attempted and reported — one bad step doesn't
    // hide the rest of the quote.
    expect(result.steps).toEqual([{ stepId: "step1", modelId: "model-step1", credits: 5 }]);
  });

  it("a step whose input validation fails also invalidates the whole quote", async () => {
    const graph = { steps: [step("step1")] };
    quoteCatalogModel.mockResolvedValue({
      valid: false,
      errors: [{ field: "prompt", message: "prompt is required" }],
    });

    const result = await quoteTemplate(graph, {});

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/prompt is required/);
  });

  it("an invalid graph short-circuits before any pricing call", async () => {
    const result = await quoteTemplate({ steps: [] }, {});
    expect(result.valid).toBe(false);
    expect(quoteCatalogModel).not.toHaveBeenCalled();
  });

  it("a caller-supplied per-step override (e.g. resolution) is layered onto the graph's own inputs before pricing", async () => {
    const graph = { steps: [step("step1", { inputs: { prompt: "x", resolution: "720p" } })] };
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    await quoteTemplate(graph, { step1: { resolution: "1080p" } });

    expect(quoteCatalogModel).toHaveBeenCalledWith("model-step1", { prompt: "x", resolution: "1080p" });
  });
});

describe("canPublish", () => {
  const templateId = "tpl1";

  it("refuses when validateGraph fails (structurally invalid graph)", async () => {
    prisma.templateVersion.findUnique.mockResolvedValue({ graph: { steps: [] } });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("invalid graph"))).toBe(true);
  });

  it("refuses when a step's model does not exist in the catalog", async () => {
    const graph = { steps: [step("step1")], sampleInputs: {} };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("does not exist"))).toBe(true);
  });

  it("refuses when a step's model is inactive", async () => {
    const graph = { steps: [step("step1")], sampleInputs: {} };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue({ isActive: false, isDeprecated: false });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("inactive"))).toBe(true);
  });

  it("refuses when a step's model is deprecated", async () => {
    const graph = { steps: [step("step1")], sampleInputs: {} };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue({ isActive: true, isDeprecated: true });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("deprecated"))).toBe(true);
  });

  it("refuses when quoteTemplate against the declared sample inputs is invalid", async () => {
    const graph = { steps: [step("step1")], sampleInputs: {} };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue({ isActive: true, isDeprecated: false });
    quoteCatalogModel.mockResolvedValue({ valid: false, errors: [{ field: "prompt", message: "prompt is required" }] });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes("quote failed"))).toBe(true);
  });

  it("passes when the graph is valid, every model is active/non-deprecated, and the sample-input quote succeeds", async () => {
    const graph = { steps: [step("step1")], sampleInputs: {} };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue({ isActive: true, isDeprecated: false });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    const result = await canPublish(templateId, 1);

    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("reports not-found when the version does not exist, and never touches the catalog", async () => {
    prisma.templateVersion.findUnique.mockResolvedValue(null);

    const result = await canPublish(templateId, 99);

    expect(result.ok).toBe(false);
    expect(prisma.modelPricing.findUnique).not.toHaveBeenCalled();
  });

  it("reports every independent reason at once, not just the first", async () => {
    const graph = {
      steps: [step("step1"), step("step2", { modelId: undefined })],
      sampleInputs: {},
    };
    prisma.templateVersion.findUnique.mockResolvedValue({ graph });
    prisma.modelPricing.findUnique.mockResolvedValue({ isActive: false, isDeprecated: false });
    quoteCatalogModel.mockResolvedValue({ valid: true, credits: 5 });

    const result = await canPublish(templateId, 1);

    expect(result.ok).toBe(false);
    // Missing modelId (structural) AND the other step's inactive model are
    // both surfaced.
    expect(result.reasons.some((r) => r.includes("missing modelId"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("inactive"))).toBe(true);
  });
});
