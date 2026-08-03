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
    it("corrects a bare-video-capability row stored under the wrong modelType — measured production bug", () => {
      // The exact production bug: a Bytedance Seedance row had
      // capability="video" but a stored modelType of "image". "video" IS a
      // real, mapped capability (a read-only preview against production
      // caught a first version of this fix wrongly treating it as
      // unmapped/hidden — see CAPABILITY_TO_MODEL_TYPE's header) — the
      // serializer must present the CORRECT modelType, not hide the row.
      const drifted = { ...row, modelType: "image", capability: "video" };
      const pub = serializeCatalogModel(drifted);
      expect(pub.modelType).toBe("video");
      expect(pub.isUncategorized).toBe(false);
    });

    it("a reference-to-video row is corrected to modelType video even if stored as image", () => {
      const drifted = { ...row, modelType: "image", capability: "reference-to-video" };
      expect(serializeCatalogModel(drifted).modelType).toBe("video");
    });

    it("a video-to-video row is corrected to modelType v2v even if stored as i2i", () => {
      const drifted = { ...row, modelType: "i2i", capability: "video-to-video" };
      expect(serializeCatalogModel(drifted).modelType).toBe("v2v");
    });

    it("null/missing capability is uncategorized when nothing on the row can recover it", () => {
      // modelId "m1" carries no signal inferCapabilityFromRow can use
      // either (no modalities, and the text itself matches nothing) — a
      // genuinely unidentifiable row, unlike the recovery cases below.
      const noCapability = { ...row, modelType: "image", capability: null };
      const pub = serializeCatalogModel(noCapability);
      expect(pub.modelType).toBe("uncategorized");
      expect(pub.isUncategorized).toBe(true);
    });

    it("a capability this mapping has never heard of (not null, just unrecognized) is still uncategorized when unrecoverable", () => {
      const unrecognized = { ...row, modelType: "image", capability: "media" };
      const pub = serializeCatalogModel(unrecognized);
      expect(pub.modelType).toBe("uncategorized");
      expect(pub.isUncategorized).toBe(true);
    });
  });

  // ── Recovering a null/unmapped capability instead of silently hiding it ──
  // (production-preview finding: 20 null-capability rows must not just be
  // hidden — recover what can genuinely be identified first).
  describe("capability recovery from modalities/endpoint (requirement: don't hide what's identifiable)", () => {
    it("recovers a null-capability row from unambiguous outputModalities/inputModalities", () => {
      const recoverable = {
        modelId: "mystery-1", displayName: "Mystery 1", providerName: "KIE", modelType: "uncategorized",
        capability: null, creditsCost: 5, inputModalities: ["text"], outputModalities: ["image"],
      };
      const pub = serializeCatalogModel(recoverable);
      expect(pub.capability).toBe("text-to-image");
      expect(pub.modelType).toBe("image");
      expect(pub.isUncategorized).toBe(false);
    });

    it("recovers an image-to-video row (image+text in, video out)", () => {
      const recoverable = {
        modelId: "mystery-2", providerName: "KIE", modelType: "uncategorized",
        capability: null, creditsCost: 5, inputModalities: ["text", "image"], outputModalities: ["video"],
      };
      expect(serializeCatalogModel(recoverable).modelType).toBe("i2v");
    });

    it("does not guess when output+input modalities are genuinely ambiguous (reference-to-video vs video-to-video)", () => {
      const ambiguous = {
        modelId: "mystery-3", providerName: "KIE", modelType: "uncategorized",
        capability: null, creditsCost: 5, inputModalities: ["text", "image", "video"], outputModalities: ["video"],
      };
      const pub = serializeCatalogModel(ambiguous);
      expect(pub.isUncategorized).toBe(true);
    });

    it("falls back to the same text-based inference every synced model already gets its capability from, when modalities are absent", () => {
      const noModalities = {
        modelId: "some-seedance-model", providerName: "KIE", modelType: "uncategorized",
        capability: null, creditsCost: 5,
      };
      const pub = serializeCatalogModel(noModalities);
      expect(pub.capability).toBe("video");
      expect(pub.modelType).toBe("video");
    });

    it("stays uncategorized when even the text fallback can tell nothing (the sync's own 'media' last resort)", () => {
      const unrecoverable = {
        modelId: "totally-unknown-thing", providerName: "KIE", modelType: "uncategorized",
        capability: null, creditsCost: 5,
      };
      expect(serializeCatalogModel(unrecoverable).isUncategorized).toBe(true);
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

  // ── URGENT fix: hide provider identity baked into DESCRIPTION text ──────
  // (measured production bug: kie-sync.js wrote `${displayName} via the KIE
  // Market API.` — 35 of 39 live image-model descriptions plainly named
  // "KIE" even though providerName was already dropped from this response)
  describe("description — provider identity scrubbed from stored text (requirement 4)", () => {
    it("strips a known provider token from a stored description for the public (non-admin) shape", () => {
      const leaking = { ...row, description: "Foo via the KIE Market API." };
      const pub = serializeCatalogModel(leaking);
      expect(pub.description).not.toMatch(/kie/i);
      expect(pub.description).toMatch(/Foo/);
    });

    it("does NOT strip 'Qwen' — it's a model family name, not an upstream provider", () => {
      const leaking = { ...row, description: "Qwen Image Max via the KIE Market API." };
      const pub = serializeCatalogModel(leaking);
      expect(pub.description).toMatch(/Qwen/);
      expect(pub.description).not.toMatch(/kie/i);
    });

    it("returns null instead of a mangled fragment when scrubbing leaves nothing meaningful", () => {
      const leaking = { ...row, description: "via the KIE Market API." };
      expect(serializeCatalogModel(leaking).description).toBeNull();
    });

    it("leaves a description with no provider token completely untouched", () => {
      const clean = { ...row, description: "Renders crisp product photography from a text prompt." };
      expect(serializeCatalogModel(clean).description).toBe(clean.description);
    });

    it("admin shape still sees the raw, unscrubbed description (admin already sees providerName directly)", () => {
      const leaking = { ...row, description: "Foo via the KIE Market API." };
      const admin = serializeCatalogModel(leaking, { isAdmin: true });
      expect(admin.description).toBe("Foo via the KIE Market API.");
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

describe("getCatalogModels — a stale/wrong modelType can never leak into the wrong mode, and uncategorized rows never reach a non-admin caller", () => {
  it("excludes a bare-video-capability row from an image-mode query even though its stored modelType still says image", async () => {
    // The exact shape of the bug: a video-capability row stored under
    // modelType="image" must never come back from an image-mode query —
    // "video" is a real capability now (see CAPABILITY_TO_MODEL_TYPE), so
    // this row is excluded from IMAGE mode specifically, not hidden
    // entirely (see the next test: it correctly surfaces under video mode).
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", creditsCost: 5, isActive: true, isDeprecated: false },
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", creditsCost: 5, isActive: true, isDeprecated: false },
    ]);
    const models = await getCatalogModels({ modelType: "image" });
    expect(models.map((m) => m.id)).toEqual(["flux-2"]);
  });

  it("the same bare-video-capability row correctly surfaces under a video-mode query", async () => {
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", creditsCost: 5, isActive: true, isDeprecated: false },
    ]);
    const models = await getCatalogModels({ modelType: "video" });
    expect(models.map((m) => m.id)).toEqual(["seedance-1-5-pro"]);
  });

  it("excludes a genuinely uncategorized row (unrecognized capability, unrecoverable) from a non-admin listing", async () => {
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "totally-unknown-thing", providerName: "KIE", modelType: "image", capability: "media", creditsCost: 5, isActive: true, isDeprecated: false },
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", creditsCost: 5, isActive: true, isDeprecated: false },
    ]);
    const models = await getCatalogModels({ modelType: "image" });
    expect(models.map((m) => m.id)).toEqual(["flux-2"]);
  });

  it("an admin call sees the uncategorized row too, flagged", async () => {
    prisma.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "totally-unknown-thing", providerName: "KIE", modelType: "image", capability: "media", creditsCost: 5, isActive: true, isDeprecated: false },
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

  it("returns null for a genuinely uncategorized row to a non-admin caller", async () => {
    prisma.modelPricing.findUnique.mockResolvedValueOnce({
      modelId: "totally-unknown-thing", providerName: "KIE", capability: "media", creditsCost: 5,
    });
    expect(await getCatalogModel("totally-unknown-thing")).toBeNull();
  });

  it("returns the uncategorized row for an admin caller", async () => {
    prisma.modelPricing.findUnique.mockResolvedValueOnce({
      modelId: "totally-unknown-thing", providerName: "KIE", capability: "media", creditsCost: 5,
    });
    const model = await getCatalogModel("totally-unknown-thing", { isAdmin: true });
    expect(model.isUncategorized).toBe(true);
  });
});
