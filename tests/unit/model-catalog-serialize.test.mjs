import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() }, providerConfig: { findUnique: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { serializeCatalogModel, getCatalogModels, getCatalogModel } from "@/lib/model-catalog";

const row = {
  modelId: "m1", displayName: "M1", providerName: "KIE", modelType: "image",
  capability: "text-to-image", creditsCost: 10, providerCost: 0.04, pricingRules: { perImage: 0.04 },
};

describe("serializeCatalogModel", () => {
  it("hides provider cost basis by default (public shape)", () => {
    const pub = serializeCatalogModel(row);
    expect(pub).not.toHaveProperty("providerCost");
    expect(pub.pricing).toBeUndefined();
    expect(pub.credits).toBe(10); // retail price stays public
  });

  it("includes cost basis for internal/admin callers", () => {
    const internal = serializeCatalogModel(row, { includeCosts: true });
    expect(internal.providerCost).toBe(0.04);
    expect(internal.pricing).toEqual({ perImage: 0.04 });
  });

  // ── URGENT fix: modelType is re-derived from capability, not trusted blindly ──
  describe("modelType — single source of truth, re-derived from capability", () => {
    it("derives modelType from capability even if the stored column disagrees (drift protection)", () => {
      // This is the measured production bug: a Bytedance Seedance row had
      // capability="video" but a stored modelType of "image". The serializer
      // must present the CORRECT type regardless of what's stored.
      const drifted = { ...row, modelType: "image", capability: "video" };
      const pub = serializeCatalogModel(drifted);
      // "video" is a bare/generic capability with no entry in the mapping —
      // it must never be guessed into "video" modelType; it's uncategorized.
      expect(pub.modelType).toBe("uncategorized");
      expect(pub.isUncategorized).toBe(true);
    });

    it("a reference-to-video row is corrected to modelType video even if stored as image", () => {
      const drifted = { ...row, modelType: "image", capability: "reference-to-video" };
      expect(serializeCatalogModel(drifted).modelType).toBe("video");
    });

    it("a video-to-video row is corrected to modelType v2v even if stored as i2i", () => {
      const drifted = { ...row, modelType: "i2i", capability: "video-to-video" };
      expect(serializeCatalogModel(drifted).modelType).toBe("v2v");
    });

    it("null/missing capability is uncategorized, not whatever modelType happens to be stored", () => {
      const noCapability = { ...row, modelType: "image", capability: null };
      const pub = serializeCatalogModel(noCapability);
      expect(pub.modelType).toBe("uncategorized");
      expect(pub.isUncategorized).toBe(true);
    });
  });

  // ── URGENT fix: hide upstream providers from end users ──────────────────
  describe("provider hiding (requirement 4)", () => {
    const alibabaRow = {
      modelId: "alibaba:qwen-image-max", displayName: "Qwen Image Max", providerName: "Alibaba",
      capability: "text-to-image", creditsCost: 20,
    };

    it("public shape exposes neither providerName nor a provider-prefixed id", () => {
      const pub = serializeCatalogModel(alibabaRow);
      expect(pub).not.toHaveProperty("providerName");
      expect(pub).not.toHaveProperty("provider");
      expect(pub.id).toBe("qwen-image-max");
      expect(pub.modelId).toBe("qwen-image-max");
    });

    it("admin shape still exposes provider and the real id", () => {
      const admin = serializeCatalogModel(alibabaRow, { isAdmin: true });
      expect(admin.provider).toBe("Alibaba");
      expect(admin.providerName).toBe("Alibaba");
      expect(admin.id).toBe("alibaba:qwen-image-max");
      expect(admin.modelId).toBe("alibaba:qwen-image-max");
    });

    it("a KIE row (no provider prefix in its id) is unaffected by id stripping", () => {
      const pub = serializeCatalogModel(row);
      expect(pub.id).toBe("m1");
      expect(pub).not.toHaveProperty("providerName");
    });
  });

  // ── URGENT fix: display names ────────────────────────────────────────────
  describe("display names", () => {
    it("recomputes a KIE row's displayName from its slug (fixes stale mangled names live, no re-sync required)", () => {
      const mangled = {
        modelId: "bytedance/seedance-1-5-pro", displayName: "Bytedance Seedance 1 5 Pro",
        providerName: "KIE", capability: "video", creditsCost: 5,
      };
      expect(serializeCatalogModel(mangled).displayName).toBe("Seedance 1.5 Pro");
    });

    it("prefers Alibaba's hand-authored displayName over slug derivation", () => {
      const alibabaRow = {
        modelId: "alibaba:qwen-image-max", displayName: "Qwen Image Max", providerName: "Alibaba",
        capability: "text-to-image", creditsCost: 20,
      };
      expect(serializeCatalogModel(alibabaRow).displayName).toBe("Qwen Image Max");
    });
  });
});

describe("getCatalogModels — never returns an uncategorized row to a non-admin caller", () => {
  it("excludes a row whose capability doesn't map even if the stored modelType claims a real category", async () => {
    // The exact shape of the bug: a video-capability row stored under
    // modelType="image" must never come back from an image-mode query.
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", creditsCost: 5, isActive: true, isDeprecated: false },
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", creditsCost: 5, isActive: true, isDeprecated: false },
    ]);
    const models = await getCatalogModels({ modelType: "image" });
    expect(models.map((m) => m.id)).toEqual(["flux-2"]);
  });

  it("an admin call sees the uncategorized row too, flagged", async () => {
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", creditsCost: 5, isActive: true, isDeprecated: false },
    ]);
    const models = await getCatalogModels({ modelType: "image", isAdmin: true });
    expect(models).toHaveLength(1);
    expect(models[0].isUncategorized).toBe(true);
  });
});

describe("getCatalogModel — id resolution and uncategorized gating", () => {
  it("resolves a public (provider-prefix-stripped) id back to the real Alibaba row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValueOnce(null); // no exact match on the public id
    prisma.modelPricing.findFirst.mockResolvedValueOnce({
      modelId: "alibaba:qwen-image-max", providerName: "Alibaba", capability: "text-to-image", creditsCost: 20,
    });
    const model = await getCatalogModel("qwen-image-max");
    expect(model.id).toBe("qwen-image-max");
    expect(prisma.modelPricing.findFirst).toHaveBeenCalledWith({ where: { modelId: { endsWith: ":qwen-image-max" } } });
  });

  it("returns null for an uncategorized row to a non-admin caller", async () => {
    prisma.modelPricing.findUnique.mockResolvedValueOnce({
      modelId: "seedance-1-5-pro", providerName: "KIE", capability: "video", creditsCost: 5,
    });
    expect(await getCatalogModel("seedance-1-5-pro")).toBeNull();
  });

  it("returns the uncategorized row for an admin caller", async () => {
    prisma.modelPricing.findUnique.mockResolvedValueOnce({
      modelId: "seedance-1-5-pro", providerName: "KIE", capability: "video", creditsCost: 5,
    });
    const model = await getCatalogModel("seedance-1-5-pro", { isAdmin: true });
    expect(model.isUncategorized).toBe(true);
  });
});
