import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), update: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { planFixes, run } from "../../scripts/fix-model-categories.mjs";

// planFixes is the pure planning core of scripts/fix-model-categories.mjs —
// no DB access, so it's tested directly against plain row arrays here.
// run()'s actual dry-run-writes-nothing / apply-writes / idempotent-second-
// run DB behavior is additionally covered end-to-end against the real test
// DB in tests/integration/model-catalog-categories.int.test.mjs.

describe("planFixes", () => {
  it("reports a modelType mismatch for a row whose stored type disagrees with its capability", () => {
    const rows = [
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Seedance 1.5 Pro" },
    ];
    const { modelTypeFixes, needsAttention } = planFixes(rows);
    expect(modelTypeFixes).toEqual([
      { modelId: "seedance-1-5-pro", providerName: "KIE", capability: "video", from: "image", to: "uncategorized" },
    ]);
    // capability="video" is bare/unmapped, so this ALSO needs attention —
    // it can't be auto-corrected into a real category, only flagged.
    expect(needsAttention).toEqual([
      { modelId: "seedance-1-5-pro", providerName: "KIE", capability: "video", currentModelType: "image" },
    ]);
  });

  it("reports a modelType mismatch that DOES resolve to a real category (reference-to-video stuck under image)", () => {
    const rows = [
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
    ];
    const { modelTypeFixes, needsAttention } = planFixes(rows);
    expect(modelTypeFixes).toEqual([
      { modelId: "wan/2-7-r2v", providerName: "KIE", capability: "reference-to-video", from: "image", to: "video" },
    ]);
    expect(needsAttention).toEqual([]);
  });

  it("reports nothing for a row that already agrees", () => {
    const rows = [
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Flux 2" },
    ];
    const { modelTypeFixes, needsAttention, displayNameFixes } = planFixes(rows);
    expect(modelTypeFixes).toEqual([]);
    expect(needsAttention).toEqual([]);
    expect(displayNameFixes).toEqual([]);
  });

  it("flags a null-capability row as needing attention without touching modelType if it already happens to be uncategorized", () => {
    const rows = [
      { modelId: "mystery-model", providerName: "KIE", modelType: "uncategorized", capability: null, displayName: "Mystery Model" },
    ];
    const { modelTypeFixes, needsAttention } = planFixes(rows);
    expect(modelTypeFixes).toEqual([]);
    expect(needsAttention).toEqual([
      { modelId: "mystery-model", providerName: "KIE", capability: null, currentModelType: "uncategorized" },
    ]);
  });

  it("recomputes a stale KIE displayName (mangled slug auto-titling) but never touches an Alibaba row's hand-authored name", () => {
    const rows = [
      { modelId: "bytedance/seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Bytedance Seedance 1 5 Pro" },
      { modelId: "alibaba:qwen-image-max", providerName: "Alibaba", modelType: "image", capability: "text-to-image", displayName: "Qwen Image Max" },
    ];
    const { displayNameFixes } = planFixes(rows);
    expect(displayNameFixes).toEqual([
      { modelId: "bytedance/seedance-1-5-pro", providerName: "KIE", from: "Bytedance Seedance 1 5 Pro", to: "Seedance 1.5 Pro" },
    ]);
  });

  it("is idempotent: re-planning against already-fixed rows reports nothing", () => {
    const fixedRows = [
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "uncategorized", capability: "video", displayName: "Seedance 1.5 Pro" },
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "video", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
    ];
    const { modelTypeFixes, displayNameFixes } = planFixes(fixedRows);
    expect(modelTypeFixes).toEqual([]);
    expect(displayNameFixes).toEqual([]);
  });
});

describe("run() — dry-run vs apply (mocked DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Bytedance Seedance 1 5 Pro" },
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Flux 2" },
    ]);
  });

  it("dry run (default) writes nothing", async () => {
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.modelTypeFixes.length).toBeGreaterThan(0);
  });

  it("refuses --apply without --yes and writes nothing", async () => {
    await expect(run({ apply: true, yes: false })).rejects.toThrow(/--yes/);
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
  });

  it("--apply --yes writes the recomputed modelType (and displayName where applicable) for every mismatch", async () => {
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "seedance-1-5-pro" },
      data: { modelType: "uncategorized", displayName: "Seedance 1.5 Pro" },
    });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "wan/2-7-r2v" },
      data: { modelType: "video" },
    });
    expect(prisma.modelPricing.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { modelId: "flux-2" } })
    );
    expect(result.applied).toBe(2);
  });
});
