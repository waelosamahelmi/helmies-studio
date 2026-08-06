import { describe, it, expect, vi, beforeEach } from "vitest";

// URGENT production fix — the runnable-model gate.
//
// Production incident this locks down: agents.js's entire image fallback
// chain was flux-dev -> nano-banana -> qwen-image. flux-dev and nano-banana
// are BOTH isActive:false, isDeprecated:true, endpoint:NULL in production —
// estimateCredits/the agent executor never checked any of that, so a
// planner naming either one got quoted, debited, and then 500'd at
// execution. isRunnableModelRow/resolveRunnableModel/getRunnableModelsForType
// are the single shared gate every caller (agent executor, its live
// fallback pool, the planner's model hint) now goes through instead.

vi.mock("@/lib/prisma", () => ({
  default: {
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { isRunnableModelRow, runnableProviderModelId, requiresMediaInput } from "@/lib/model-catalog-core.mjs";
import { resolveRunnableModel, getRunnableModelsForType } from "@/lib/model-catalog";

const RUNNABLE_ROW = {
  modelId: "google/nano-banana-2-lite",
  isActive: true,
  isDeprecated: false,
  endpoint: "google/nano-banana-2-lite",
  providerModelId: "google/nano-banana-2-lite",
  providerName: "KIE",
  capability: "text-to-image",
  modelType: "image",
  creditsCost: 3,
};

// The exact production shape reported for flux-dev/nano-banana.
const PRODUCTION_FLUX_DEV = {
  modelId: "flux-dev",
  isActive: false,
  isDeprecated: true,
  endpoint: null,
  providerModelId: null,
  providerName: "KIE",
  capability: "text-to-image",
  modelType: "image",
  creditsCost: 2,
};

describe("isRunnableModelRow", () => {
  it("accepts a real synced row — active, non-deprecated, endpoint set", () => {
    expect(isRunnableModelRow(RUNNABLE_ROW)).toBe(true);
  });

  it("rejects a missing row", () => {
    expect(isRunnableModelRow(null)).toBe(false);
    expect(isRunnableModelRow(undefined)).toBe(false);
  });

  it("rejects an inactive row even with a real endpoint", () => {
    expect(isRunnableModelRow({ ...RUNNABLE_ROW, isActive: false })).toBe(false);
  });

  it("rejects a deprecated row even though isActive is still true", () => {
    expect(isRunnableModelRow({ ...RUNNABLE_ROW, isDeprecated: true })).toBe(false);
  });

  // Hand-priced rows (an admin's setModelPricing, or a fixture like this
  // one) never set endpoint/providerModelId at all — only a sync does. The
  // studio path (generation-handler.js/generate/async's route) already
  // falls back to the row's own modelId in that case
  // (`dbPricing?.endpoint || staticModel?.endpoint || model`), so this gate
  // must accept it too, not invent a stricter rule the working path
  // doesn't itself enforce. Regression coverage: an earlier, stricter
  // version of this function rejected such rows outright, which broke
  // tests/e2e's own seeded "e2e-image-model" fixture (isActive:true,
  // endpoint/providerModelId both unset) end-to-end.
  it("accepts an active, non-deprecated row with neither endpoint nor providerModelId — its own modelId is a usable fallback identifier", () => {
    expect(isRunnableModelRow({ ...RUNNABLE_ROW, endpoint: null, providerModelId: null })).toBe(true);
  });

  it("accepts a row that has providerModelId but a null endpoint", () => {
    expect(isRunnableModelRow({ ...RUNNABLE_ROW, endpoint: null })).toBe(true);
  });

  it("accepts a row that has endpoint but a null providerModelId", () => {
    expect(isRunnableModelRow({ ...RUNNABLE_ROW, providerModelId: null })).toBe(true);
  });

  it("rejects the exact production flux-dev/nano-banana shape", () => {
    expect(isRunnableModelRow(PRODUCTION_FLUX_DEV)).toBe(false);
    expect(isRunnableModelRow({ ...PRODUCTION_FLUX_DEV, modelId: "nano-banana" })).toBe(false);
  });
});

describe("runnableProviderModelId", () => {
  it("prefers providerModelId — strips a DB-only namespace prefix (Alibaba's 'alibaba:' rows)", () => {
    expect(
      runnableProviderModelId({ modelId: "alibaba:qwen-image-max", providerModelId: "qwen-image-max", endpoint: "qwen-image-max" }),
    ).toBe("qwen-image-max");
  });

  it("falls back to the row's own modelId when providerModelId is absent — NEVER to endpoint", () => {
    // Regression: an earlier version fell back to `endpoint` here. For a
    // hand-priced row (no sync ever ran) endpoint can be a completely
    // unrelated string — tests/e2e's own "e2e-input-model" fixture has
    // endpoint:"e2e-input-endpoint", which resolveModelPricingRow can
    // never look back up (it only indexes by modelId, or a ":<id>" suffix
    // of it) — falling back to it silently produced an unresolvable id
    // that estimateCredits then priced at the generic per-tool fallback
    // instead of the row's real cost.
    expect(runnableProviderModelId({ modelId: "m1", endpoint: "e1" })).toBe("m1");
    expect(runnableProviderModelId({ modelId: "m1" })).toBe("m1");
  });

  it("returns null for a missing row", () => {
    expect(runnableProviderModelId(null)).toBeNull();
  });
});

describe("resolveRunnableModel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a real, active, non-deprecated row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(RUNNABLE_ROW);
    const row = await resolveRunnableModel("google/nano-banana-2-lite");
    expect(row?.modelId).toBe("google/nano-banana-2-lite");
  });

  it("rejects the production flux-dev row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(PRODUCTION_FLUX_DEV);
    expect(await resolveRunnableModel("flux-dev")).toBeNull();
  });

  it("returns null when no row exists at all", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    prisma.modelPricing.findFirst.mockResolvedValue(null);
    expect(await resolveRunnableModel("totally-made-up-id")).toBeNull();
  });

  it("degrades to null rather than throwing when the DB lookup fails", async () => {
    prisma.modelPricing.findUnique.mockRejectedValue(new Error("db unreachable"));
    await expect(resolveRunnableModel("anything")).resolves.toBeNull();
  });
});

describe("getRunnableModelsForType — fallback/substitution pool returns only runnable models", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes inactive/deprecated rows but keeps a hand-priced row with no endpoint/providerModelId, cheapest runnable first", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      PRODUCTION_FLUX_DEV,
      { ...PRODUCTION_FLUX_DEV, modelId: "nano-banana" },
      // Active + non-deprecated, but never synced (an admin's own
      // setModelPricing, or a test fixture like tests/e2e's
      // "e2e-image-model", neither of which ever sets endpoint/
      // providerModelId) — its own modelId is a usable fallback identifier
      // (see isRunnableModelRow's header), so it must still appear here.
      { modelId: "hand-priced-row", isActive: true, isDeprecated: false, endpoint: null, providerModelId: null, capability: "text-to-image", modelType: "image", creditsCost: 1 },
      RUNNABLE_ROW, // creditsCost 3
      { modelId: "alibaba:qwen-image-max", isActive: true, isDeprecated: false, endpoint: "qwen-image-max", providerModelId: "qwen-image-max", capability: "text-to-image", modelType: "image", creditsCost: 6 },
    ]);

    const results = await getRunnableModelsForType("image", { limit: 5 });
    const ids = results.map((r) => r.modelId);

    expect(ids).not.toContain("flux-dev");
    expect(ids).not.toContain("nano-banana");
    expect(ids).toEqual(["hand-priced-row", "google/nano-banana-2-lite", "alibaba:qwen-image-max"]); // cheapest first
  });

  it("filters by modelType/capability — a video row never appears in the image pool", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "alibaba:wan2.6-t2v", isActive: true, isDeprecated: false, endpoint: "wan2.6-t2v", providerModelId: "wan2.6-t2v", capability: "text-to-video", modelType: "video", creditsCost: 8 },
    ]);
    expect(await getRunnableModelsForType("image", { limit: 5 })).toEqual([]);
  });

  it("excludes ids via excludeModelIds, matching either the real modelId or its public providerModelId form", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "alibaba:qwen-image-max", isActive: true, isDeprecated: false, endpoint: "qwen-image-max", providerModelId: "qwen-image-max", capability: "text-to-image", modelType: "image", creditsCost: 6 },
    ]);
    expect(await getRunnableModelsForType("image", { excludeModelIds: ["qwen-image-max"] })).toEqual([]);
    expect(await getRunnableModelsForType("image", { excludeModelIds: ["alibaba:qwen-image-max"] })).toEqual([]);
  });

  it("respects the limit", async () => {
    prisma.modelPricing.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        modelId: `m${i}`, isActive: true, isDeprecated: false, endpoint: `m${i}`, providerModelId: `m${i}`,
        capability: "text-to-image", modelType: "image", creditsCost: i + 1,
      })),
    );
    const results = await getRunnableModelsForType("image", { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("never throws when the DB is unavailable — degrades to an empty result", async () => {
    prisma.modelPricing.findMany.mockRejectedValue(new Error("db unreachable"));
    await expect(getRunnableModelsForType("image")).resolves.toEqual([]);
  });

  it("returns nothing for a falsy modelType", async () => {
    await expect(getRunnableModelsForType(null)).resolves.toEqual([]);
    await expect(getRunnableModelsForType("")).resolves.toEqual([]);
  });

  // ── 2026-08-06 incident: text-to-video steps sent to image-required models ──
  it("excludes from the VIDEO pool any row whose schema requires a media upload — motion-control/transition rows can never run on a text prompt", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      // kling-3.0/motion-control's curated schema REQUIRES input_urls +
      // video_urls (a motion-transfer model). Live shape, 2026-08-06.
      { modelId: "kling-3.0/motion-control", isActive: true, isDeprecated: false, endpoint: "kling-3.0/motion-control", providerModelId: "kling-3.0/motion-control", capability: "video", modelType: "video", creditsCost: 8,
        inputSchema: { fields: { prompt: { type: "string", required: false }, input_urls: { type: "array", required: true }, video_urls: { type: "array", required: true } } } },
      // pixverse-v6/transition requires first/last frame images. Live shape.
      { modelId: "pixverse-v6/transition", isActive: true, isDeprecated: false, endpoint: "pixverse-v6/transition", providerModelId: "pixverse-v6/transition", capability: "video", modelType: "video", creditsCost: 8,
        inputSchema: { fields: { prompt: { type: "string", required: true }, first_frame_image_url: { type: "string", format: "uri", required: true }, last_frame_image_url: { type: "string", format: "uri", required: true } } } },
      // A genuine t2v row — required fields are all rendering settings.
      { modelId: "kling-3.0/video", isActive: true, isDeprecated: false, endpoint: "kling-3.0/video", providerModelId: "kling-3.0/video", capability: "video", modelType: "video", creditsCost: 8,
        inputSchema: { fields: { prompt: { type: "string", required: true }, sound: { type: "boolean", default: false, required: true }, multi_shots: { type: "boolean", default: false, required: true } } } },
    ]);

    const ids = (await getRunnableModelsForType("video", { limit: 5 })).map((r) => r.modelId);
    expect(ids).toEqual(["kling-3.0/video"]);
  });

  it("keeps a media-required row in its OWN pool type (reference-to-video → i2v) — still offered for image-input steps", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "happyhorse-1-1/reference-to-video", isActive: true, isDeprecated: false, endpoint: "happyhorse-1-1/reference-to-video", providerModelId: "happyhorse-1-1/reference-to-video", capability: "reference-to-video", modelType: "video", creditsCost: 8,
        inputSchema: { fields: { prompt: { type: "string", required: true }, reference_image_url: { type: "string", format: "uri", required: true } } } },
    ]);
    expect(await getRunnableModelsForType("video", { limit: 5 })).toEqual([]);
    expect((await getRunnableModelsForType("i2v", { limit: 5 })).map((r) => r.modelId)).toEqual(["happyhorse-1-1/reference-to-video"]);
  });
});

describe("requiresMediaInput — schema-driven media-input gate for text-only step kinds", () => {
  it("returns true only when a REQUIRED field names a media upload", () => {
    expect(requiresMediaInput({ inputSchema: { fields: { input_urls: { type: "array", required: true }, video_urls: { type: "array", required: true } } } })).toBe(true);
    expect(requiresMediaInput({ inputSchema: { fields: { first_frame_image_url: { type: "string", format: "uri", required: true } } } })).toBe(true);
    expect(requiresMediaInput({ inputSchema: { fields: { image_url: { type: "string", format: "uri", required: true } } } })).toBe(true);
  });

  it("returns false when required fields are rendering settings, not media", () => {
    expect(requiresMediaInput({ inputSchema: { fields: { prompt: { type: "string", required: true }, sound: { type: "boolean", default: false, required: true }, multi_shots: { type: "boolean", default: false, required: true }, aspect_ratio: { type: "string", required: true }, duration: { type: "number", required: true }, quality: { type: "string", required: true } } } })).toBe(false);
  });

  it("treats an optional media field as NOT required — the caller can omit it", () => {
    expect(requiresMediaInput({ inputSchema: { fields: { prompt: { type: "string", required: true }, image_url: { type: "string", format: "uri", required: false } } } })).toBe(false);
  });

  it("returns false for a row with no schema — never narrows an unverified model by guesswork", () => {
    expect(requiresMediaInput({ inputSchema: null })).toBe(false);
    expect(requiresMediaInput({})).toBe(false);
    expect(requiresMediaInput(null)).toBe(false);
  });
});
