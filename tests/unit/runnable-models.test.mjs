import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase 0.2 / G1.4 — the unified worker-safe model resolver.
// Driven by a mocked Prisma catalog (same pattern as
// agent-model-selection.test.mjs) so the runnable gate, the cheapest-first
// pool, the substitution ceiling, and the last-resort verify gate are all
// exercised against realistic rows, not stubs of the module under test.

vi.mock("@/lib/prisma", () => {
  const prisma = {
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import {
  LAST_RESORT_FALLBACKS,
  defaultRunnableModelForKind,
  getFallbackCandidates,
  pickSubstituteModel,
  verifyLastResortIds,
} from "@/lib/runnable-models.js";

const IMG_CHEAP = {
  modelId: "google/nano-banana-2-lite", isActive: true, isDeprecated: false,
  endpoint: "google/nano-banana-2-lite", providerModelId: "google/nano-banana-2-lite",
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 3,
};
const IMG_EXPENSIVE = {
  modelId: "seedream/4.5-text-to-image", isActive: true, isDeprecated: false,
  endpoint: "seedream/4-5-text-to-image", providerModelId: "seedream/4.5-text-to-image",
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 8,
};
const IMG_DEAD = {
  modelId: "flux-dev", isActive: false, isDeprecated: true, endpoint: null, providerModelId: null,
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 10,
};
const MUSIC_GEN = {
  modelId: "suno-v4.5", isActive: true, isDeprecated: false,
  endpoint: "suno/v45", providerModelId: "suno-v4.5",
  providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 5,
};
const AUDIO_ENHANCER = {
  modelId: "boost-music-style", isActive: true, isDeprecated: false,
  endpoint: "audio/boost", providerModelId: "boost-music-style",
  providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 1,
};
const VIDEO_MEDIA_REQUIRED = {
  modelId: "kling-3.0/motion-control", isActive: true, isDeprecated: false,
  endpoint: "kling/v3/motion-control", providerModelId: "kling-3.0/motion-control",
  providerName: "KIE", capability: "video-edit", modelType: "video", creditsCost: 9,
  inputSchema: { fields: { video_url: { type: "string", required: true } } },
};
const VIDEO_T2V = {
  modelId: "wan/2-7-text-to-video", isActive: true, isDeprecated: false,
  endpoint: "wan/2-7-text-to-video", providerModelId: "wan/2-7-text-to-video",
  providerName: "KIE", capability: "text-to-video", modelType: "video", creditsCost: 10,
};

function seedCatalog(rows) {
  prisma.modelPricing.findUnique.mockImplementation(async ({ where }) =>
    rows.find((r) => r.modelId === where.modelId) || null,
  );
  prisma.modelPricing.findFirst.mockImplementation(async ({ where }) => {
    const needle = where?.modelId?.endsWith;
    return (needle && rows.find((r) => r.modelId.endsWith(needle))) || null;
  });
  prisma.modelPricing.findMany.mockImplementation(async ({ orderBy } = {}) => {
    const rowsCopy = [...rows];
    // Honor the creditsCost ascending orderBy the real query uses.
    if (Array.isArray(orderBy) && orderBy[0]?.creditsCost === "asc") {
      rowsCopy.sort((a, b) => (a.creditsCost ?? 0) - (b.creditsCost ?? 0));
    }
    return rowsCopy;
  });
  prisma.providerConfig.findUnique.mockResolvedValue(null);
}

beforeEach(() => vi.clearAllMocks());

describe("defaultRunnableModelForKind", () => {
  it("returns the cheapest runnable image model, never a deprecated one", async () => {
    seedCatalog([IMG_DEAD, IMG_EXPENSIVE, IMG_CHEAP]);
    await expect(defaultRunnableModelForKind("image")).resolves.toBe("google/nano-banana-2-lite");
  });

  it("audio prefers a genuine generator (music) over a cheaper enhancement utility", async () => {
    seedCatalog([AUDIO_ENHANCER, MUSIC_GEN]);
    await expect(defaultRunnableModelForKind("audio")).resolves.toBe("suno-v4.5");
  });

  it("audio picks a spoken-voice generator when wantsVoice is set", async () => {
    const TTS = {
      modelId: "elevenlabs/text-to-speech", isActive: true, isDeprecated: false,
      endpoint: "elevenlabs/tts", providerModelId: "elevenlabs/text-to-speech",
      providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 4,
    };
    seedCatalog([MUSIC_GEN, TTS]);
    await expect(defaultRunnableModelForKind("audio", { wantsVoice: true })).resolves.toBe("elevenlabs/text-to-speech");
  });

  it("video never resolves to a media-required model (motion-control/transition rows)", async () => {
    seedCatalog([VIDEO_MEDIA_REQUIRED, VIDEO_T2V]);
    await expect(defaultRunnableModelForKind("video")).resolves.toBe("wan/2-7-text-to-video");
  });

  it("falls back to the last-resort id only when the live catalog yields nothing", async () => {
    // Documented contract (matches the pre-0.2 agents.js behavior): the
    // last-resort id is returned UNVERIFIED here — verification
    // (verifyLastResortIds) gates the substitution/fallback paths that
    // actually charge money; the planner default surfaces as a clean
    // provider error if the id is truly gone.
    prisma.modelPricing.findMany.mockRejectedValue(new Error("db down"));
    prisma.modelPricing.findUnique.mockRejectedValue(new Error("db down"));
    prisma.modelPricing.findFirst.mockRejectedValue(new Error("db down"));
    await expect(defaultRunnableModelForKind("image")).resolves.toBe("google/nano-banana-2-lite");
  });
});

describe("pickSubstituteModel", () => {
  const estimateFn = async (_kind, modelId) => (modelId === "seedream/4.5-text-to-image" ? 8 : 3);

  it("picks the cheapest runnable substitute that fits the ceiling", async () => {
    seedCatalog([IMG_DEAD, IMG_CHEAP, IMG_EXPENSIVE]);
    const sub = await pickSubstituteModel({
      agentKind: "image", excludeModel: "flux-dev", params: {}, ceiling: 5, estimateFn,
    });
    expect(sub).toEqual({ model: "google/nano-banana-2-lite", credits: 3 });
  });

  it("skips candidates whose re-quote exceeds the ceiling", async () => {
    seedCatalog([IMG_DEAD, IMG_CHEAP, IMG_EXPENSIVE]);
    const sub = await pickSubstituteModel({
      agentKind: "image", excludeModel: "flux-dev", params: {}, ceiling: 1, estimateFn,
    });
    expect(sub).toBeNull();
  });

  it("never returns the excluded (broken) model even if it is the cheapest", async () => {
    seedCatalog([IMG_CHEAP, IMG_EXPENSIVE]);
    const sub = await pickSubstituteModel({
      agentKind: "image", excludeModel: "google/nano-banana-2-lite", params: {}, ceiling: 10, estimateFn,
    });
    expect(sub?.model).toBe("seedream/4.5-text-to-image");
  });
});

describe("getFallbackCandidates", () => {
  it("returns [] for non-catalog kinds (storyboard/assembly/export/llm)", async () => {
    seedCatalog([IMG_CHEAP]);
    await expect(getFallbackCandidates("storyboard")).resolves.toEqual([]);
    await expect(getFallbackCandidates("assembly")).resolves.toEqual([]);
  });

  it("returns live catalog ids before any last-resort entry", async () => {
    seedCatalog([IMG_EXPENSIVE, IMG_CHEAP]);
    const ids = await getFallbackCandidates("image", [], 2);
    expect(ids[0]).toBe("google/nano-banana-2-lite");
    expect(ids).toContain("seedream/4.5-text-to-image");
  });
});

describe("LAST_RESORT_FALLBACKS hygiene (G1.4)", () => {
  it("contains no known-dead ids", () => {
    const all = Object.values(LAST_RESORT_FALLBACKS).flat();
    expect(all).not.toContain("wan2.6-t2v"); // retired-adapter-only id, removed
    expect(all).not.toContain("flux-dev");
    expect(all).not.toContain("nano-banana");
  });

  it("every listed id resolves against a live-shaped catalog", async () => {
    seedCatalog([IMG_CHEAP, IMG_EXPENSIVE, MUSIC_GEN, VIDEO_T2V]);
    const imageVerified = await verifyLastResortIds(LAST_RESORT_FALLBACKS.image);
    expect(imageVerified).toContain("google/nano-banana-2-lite");
    const audioVerified = await verifyLastResortIds(LAST_RESORT_FALLBACKS.audio);
    expect(audioVerified).toContain("suno-v4.5");
  });

  it("verifyLastResortIds drops ids with no runnable catalog row", async () => {
    seedCatalog([{ ...IMG_CHEAP, isActive: false }]);
    await expect(verifyLastResortIds(["google/nano-banana-2-lite"])).resolves.toEqual([]);
  });
});
