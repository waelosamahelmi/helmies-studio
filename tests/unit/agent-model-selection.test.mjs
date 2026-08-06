import { describe, it, expect, vi, beforeEach } from "vitest";

// URGENT production hotfix — agent model selection.
//
// Production incident: POST /api/agent/step 500'd on
//   { agent: "image", params: { model: "flux-dev", prompt: "...", aspect_ratio: "16:9" } }
// flux-dev (and its whole hardcoded fallback chain: nano-banana, then
// qwen-image) is isActive:false / isDeprecated:true in production, so the
// step was quoted, debited, and then failed executing a model that could
// never run. This file locks down the fix end to end, using the REAL
// estimateCredits/resolveRunnableModel/getRunnableModelsForType (not
// mocked) driven by a mocked Prisma "catalog" — so the money math and the
// catalog gate are exercised together, not asserted against a stub.

vi.mock("@/lib/prisma", () => {
  const models = {
    agentRun: { create: vi.fn(), update: vi.fn() },
    generation: { create: vi.fn() },
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});

vi.mock("@/lib/wallet", () => ({
  getWallet: vi.fn(),
  debitWallet: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/security", () => ({ detectAbuse: vi.fn() }));

vi.mock("@/lib/generation", () => ({
  generateImage: vi.fn(),
  generateI2I: vi.fn(),
  generateVideo: vi.fn(),
  generateI2V: vi.fn(),
  processLipSync: vi.fn(),
  generateAudio: vi.fn(),
  processRecast: vi.fn(),
  runClipping: vi.fn(),
  runMotionGraphics: vi.fn(),
  generateMarketingAd: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  llmComplete: vi.fn(),
  llmStream: vi.fn(),
  resolveProvider: vi.fn().mockResolvedValue({ name: "kie" }),
  brandForUser: vi.fn((m) => m || "An unexpected error occurred. Please try again."),
}));

import prisma from "@/lib/prisma";
import { getWallet, debitWallet, refundCredits } from "@/lib/wallet";
import { detectAbuse } from "@/lib/security";
import { generateImage, generateVideo, generateI2V } from "@/lib/generation";
import { executeAgentStep, executeStepWithRetry, defaultRunnableModel, resolveUserRequestedModels, pinUserRequestedModels } from "@/lib/agents";

// The exact production shape reported for the two dead models that used to
// be the ENTIRE hardcoded image fallback chain.
const FLUX_DEV = {
  modelId: "flux-dev", isActive: false, isDeprecated: true, endpoint: null, providerModelId: null,
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 10,
};
const NANO_BANANA_OLD = {
  modelId: "nano-banana", isActive: false, isDeprecated: true, endpoint: null, providerModelId: null,
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 10,
};
// Real, runnable replacements — the kind of rows a live sync actually writes.
const NANO_BANANA_2 = {
  modelId: "google/nano-banana-2-lite", isActive: true, isDeprecated: false,
  endpoint: "google/nano-banana-2-lite", providerModelId: "google/nano-banana-2-lite",
  providerName: "KIE", capability: "text-to-image", modelType: "image", creditsCost: 3,
};
const QWEN_IMAGE_MAX = {
  modelId: "alibaba:qwen-image-max", isActive: true, isDeprecated: false,
  endpoint: "qwen-image-max", providerModelId: "qwen-image-max",
  providerName: "Alibaba", capability: "text-to-image", modelType: "image", creditsCost: 6,
};

function seedCatalog(rows) {
  prisma.modelPricing.findUnique.mockImplementation(async ({ where }) =>
    rows.find((r) => r.modelId === where.modelId) || null,
  );
  prisma.modelPricing.findFirst.mockImplementation(async ({ where }) => {
    const needle = where?.modelId?.endsWith;
    return (needle && rows.find((r) => r.modelId.endsWith(needle))) || null;
  });
  prisma.modelPricing.findMany.mockResolvedValue(rows);
}

function approvedPlan(steps) {
  return { steps, summary: "s", estimate: { total: 99, breakdown: steps.map(() => ({ credits: 99 })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  detectAbuse.mockResolvedValue({ flagged: false });
  prisma.agentRun.create.mockResolvedValue({ id: "run1" });
  prisma.agentRun.update.mockResolvedValue({});
  prisma.generation.create.mockResolvedValue({ id: "gen1" });
  prisma.providerConfig.findUnique.mockResolvedValue(null);
  getWallet.mockResolvedValue({ available: 1000 });
  debitWallet.mockResolvedValue({});
  refundCredits.mockResolvedValue({});
});

describe("executeAgentStep — validate before charging (never debit for a model that cannot run)", () => {
  it("a deprecated model is swapped for the cheapest runnable substitute and debitWallet is charged the SUBSTITUTE's re-quote, not the dead model's", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_2, QWEN_IMAGE_MAX]);
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const step = { agent: "image", task: "Generate a hero image", params: { model: "flux-dev", prompt: "a kettle", aspect_ratio: "16:9" } };
    const result = await executeAgentStep("u1", { plan: approvedPlan([step]), stepIndex: 0 });

    // Substituted to the CHEAPEST runnable model (nano-banana-2, 3 credits)
    // over the pricier one (qwen-image-max, 6) — never the dead flux-dev.
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0][0]).toMatchObject({ endpoint: "google/nano-banana-2-lite" });

    expect(debitWallet).toHaveBeenCalledTimes(1);
    expect(debitWallet.mock.calls[0][1]).toBe(3); // the substitute's re-quote, NOT flux-dev's stale 10
    expect(result.creditsUsed).toBe(3);

    // The Generation row records the model that actually ran.
    expect(prisma.generation.create.mock.calls[0][0].data.model).toBe("google/nano-banana-2-lite");
  });

  it("never calls debitWallet at all when no runnable substitute fits the step's approved budget", async () => {
    // flux-dev's own stale quote is only 1 credit — cheaper than every real
    // runnable replacement (3 and 6) — so a substitution would overspend
    // the approved budget. The step must fail with ZERO debit rather than
    // silently charging more than was approved.
    seedCatalog([{ ...FLUX_DEV, creditsCost: 1 }, NANO_BANANA_2, QWEN_IMAGE_MAX]);

    const step = { agent: "image", task: "Generate a hero image", params: { model: "flux-dev", prompt: "a kettle" } };
    const err = await executeAgentStep("u1", { plan: approvedPlan([step]), stepIndex: 0 }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("model_unavailable");
    expect(err.message).toMatch(/no longer available/i);
    expect(err.message).not.toMatch(/kie|alibaba|dashscope/i); // never leaks the provider

    expect(debitWallet).not.toHaveBeenCalled();
    expect(refundCredits).not.toHaveBeenCalled(); // nothing to refund — nothing was ever charged
    expect(generateImage).not.toHaveBeenCalled(); // the dead model is never even attempted
    expect(prisma.agentRun.create).not.toHaveBeenCalled(); // fails before the AgentRun row is even written
  });

  it("never calls debitWallet when the catalog has no runnable model for this capability at all", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_OLD]); // both deprecated, no replacement of any kind

    const step = { agent: "image", task: "Generate a hero image", params: { model: "flux-dev", prompt: "x" } };
    const err = await executeAgentStep("u1", { plan: approvedPlan([step]), stepIndex: 0 }).catch((e) => e);

    expect(err.code).toBe("model_unavailable");
    expect(debitWallet).not.toHaveBeenCalled();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("a runnable model is executed unchanged — no substitution, no extra catalog cost", async () => {
    seedCatalog([NANO_BANANA_2]);
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const step = { agent: "image", task: "hero", params: { model: "google/nano-banana-2-lite", prompt: "a kettle" } };
    const result = await executeAgentStep("u1", { plan: approvedPlan([step]), stepIndex: 0 });

    expect(generateImage.mock.calls[0][0]).toMatchObject({ endpoint: "google/nano-banana-2-lite" });
    expect(debitWallet.mock.calls[0][1]).toBe(3);
    expect(result.creditsUsed).toBe(3);
  });

  // ── Regression test: the exact production incident ──────────────────────
  it("REGRESSION: { agent: image, params: { model: flux-dev } } never 500s — it runs on a substituted model", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_OLD, NANO_BANANA_2, QWEN_IMAGE_MAX]);
    generateImage.mockResolvedValue({ url: "https://cdn.example/hero.png" });

    const step = { agent: "image", params: { model: "flux-dev" } };
    const result = await executeAgentStep("u1", { plan: approvedPlan([step]), stepIndex: 0 }).catch((e) => e);

    // Either outcome is acceptable per spec (run on a substitute, or a
    // clean actionable error) — but it must NEVER be an unbranded crash.
    if (result instanceof Error) {
      expect(result.code).toBe("model_unavailable");
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      expect(result.output).toBeDefined();
      expect(generateImage).toHaveBeenCalledTimes(1);
      expect(generateImage.mock.calls[0][0].endpoint).not.toBe("flux-dev");
    }
    // With this catalog (a comfortable runnable replacement available) the
    // fix's actual, correct behavior is to succeed on the substitute.
    expect(result).not.toBeInstanceOf(Error);
    expect(generateImage.mock.calls[0][0].endpoint).toBe("google/nano-banana-2-lite");
  });
});

describe("executeStepWithRetry — catalog-driven fallback selection returns only runnable models", () => {
  it("never attempts the deprecated model — substitutes and succeeds on the first try", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_2, QWEN_IMAGE_MAX]);
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const step = { agent: "image", params: { model: "flux-dev", prompt: "x" } };
    const { output, model, credits } = await executeStepWithRetry(step, [], 0, { quoted: 10, max: 10 });

    expect(output).toBe("https://cdn.example/img.png");
    expect(model).toBe("google/nano-banana-2-lite");
    expect(credits).toBe(3);
    expect(generateImage).toHaveBeenCalledTimes(1); // flux-dev was never even tried
  });

  it("falls through to a second runnable fallback (never a deprecated one) when the substitute itself fails", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_2, QWEN_IMAGE_MAX]);
    generateImage
      .mockRejectedValueOnce(new Error("provider down")) // nano-banana-2 (the substitute) fails
      .mockResolvedValueOnce({ url: "https://cdn.example/img2.png" }); // qwen-image-max succeeds

    const step = { agent: "image", params: { model: "flux-dev", prompt: "x" } };
    const { output, model } = await executeStepWithRetry(step, [], 0, { quoted: 10, max: 10 });

    expect(output).toBe("https://cdn.example/img2.png");
    // The UNPREFIXED providerModelId — the real id Alibaba's API expects,
    // not the DB-only "alibaba:" namespacing prefix (see
    // runnableProviderModelId's header in model-catalog-core.mjs).
    expect(model).toBe("qwen-image-max");
    expect(generateImage).toHaveBeenCalledTimes(2);
    for (const call of generateImage.mock.calls) {
      expect(call[0].endpoint).not.toBe("flux-dev");
      expect(call[0].endpoint).not.toBe("nano-banana");
    }
  });

  it("throws a clear, actionable error (never a raw crash) when no runnable model exists for the capability", async () => {
    seedCatalog([FLUX_DEV, NANO_BANANA_OLD]);

    const step = { agent: "image", params: { model: "flux-dev", prompt: "x" } };
    const err = await executeStepWithRetry(step, [], 0, { quoted: 10, max: 10 }).catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("model_unavailable");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("a step naming an already-runnable model is executed unchanged", async () => {
    seedCatalog([NANO_BANANA_2]);
    generateImage.mockResolvedValue({ url: "https://cdn.example/img.png" });

    const step = { agent: "image", params: { model: "google/nano-banana-2-lite", prompt: "x" } };
    const { model } = await executeStepWithRetry(step, [], 0, null);

    expect(model).toBe("google/nano-banana-2-lite");
    expect(generateImage).toHaveBeenCalledTimes(1);
  });

  it("workflow step kinds outside image/video/audio (e.g. a persona/unknown kind) are never gated by the catalog check", async () => {
    // No catalog rows seeded at all — if the gate applied here it would
    // hard-fail; it must not, since this kind names no ModelPricing model.
    seedCatalog([]);
    const { llmComplete } = await import("@/lib/providers");
    llmComplete.mockResolvedValue("some text");

    const step = { agent: "creative_director", task: "plan", params: { prompt: "plan" } };
    const { output } = await executeStepWithRetry(step, [], 0, null);
    expect(output).toBe("some text");
  });
});

// ── URGENT production fix: the heuristic (no-LLM) planner's default audio
// model must be a real GENERATOR, not a transformer.
//
// Production incident: defaultRunnableModel("audio") picked the plain
// cheapest active+non-deprecated row whose modelType is "audio" — which
// resolved to "boost-music-style", an "enhancement" utility (audioKind,
// model-catalog-core.mjs) that transforms an EXISTING track and cannot run
// as a from-scratch generation step at all. The fix reuses audioKind (the
// SAME honest sub-classification MusicStudio/AudioStudio already gate their
// pools on) to prefer a genuine composer ("music") or reader ("tts") over a
// transformer, while keeping the runnable gate (isActive/isDeprecated, via
// getRunnableModelsForType) completely unchanged.
describe("defaultRunnableModel — the audio default picks a generator, not a transformer", () => {
  beforeEach(() => vi.clearAllMocks());

  const BOOST_MUSIC_STYLE = {
    modelId: "boost-music-style", isActive: true, isDeprecated: false,
    endpoint: "boost-music-style", providerModelId: "boost-music-style",
    providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 1, // cheapest
  };
  const REPLACE_SECTION = {
    modelId: "replace-section", isActive: true, isDeprecated: false,
    endpoint: "replace-section", providerModelId: "replace-section",
    providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 2,
  };
  const GENERATE_MUSIC = {
    modelId: "generate-music", isActive: true, isDeprecated: false,
    endpoint: "generate-music", providerModelId: "generate-music",
    providerName: "KIE", capability: "audio", modelType: "audio", creditsCost: 5, // pricier than the transformers
  };
  const ELEVENLABS_TTS = {
    modelId: "elevenlabs-text-to-speech-turbo-2.5", isActive: true, isDeprecated: false,
    endpoint: "elevenlabs-text-to-speech-turbo-2.5", providerModelId: "elevenlabs-text-to-speech-turbo-2.5",
    providerName: "KIE", capability: "text-to-speech", modelType: "audio", creditsCost: 8, // pricier still
  };

  it("REGRESSION: production resolved the audio default to 'boost-music-style' (a transformer) — the fix picks the composer even though it costs more", async () => {
    seedCatalog([BOOST_MUSIC_STYLE, REPLACE_SECTION, GENERATE_MUSIC]);
    expect(await defaultRunnableModel("audio")).toBe("generate-music");
  });

  it("prefers a TTS reader over both a transformer and a composer when the step explicitly wants a voice", async () => {
    seedCatalog([BOOST_MUSIC_STYLE, GENERATE_MUSIC, ELEVENLABS_TTS]);
    expect(await defaultRunnableModel("audio", { wantsVoice: true })).toBe("elevenlabs-text-to-speech-turbo-2.5");
  });

  it("still prefers the composer over the transformer when no voice was requested, even with a TTS row present", async () => {
    seedCatalog([BOOST_MUSIC_STYLE, GENERATE_MUSIC, ELEVENLABS_TTS]);
    expect(await defaultRunnableModel("audio")).toBe("generate-music");
  });

  it("falls back to the plain cheapest runnable row when the catalog has NO generator of either kind — never worse than the old behavior", async () => {
    seedCatalog([BOOST_MUSIC_STYLE, REPLACE_SECTION]);
    expect(await defaultRunnableModel("audio")).toBe("boost-music-style");
  });

  it("non-audio kinds are unaffected — still the plain cheapest runnable row for the type", async () => {
    // getRunnableModelsForType relies on the DB's own orderBy(creditsCost)
    // for "cheapest first" (it does no client-side re-sort) — seeded here
    // in that same already-cost-ordered shape, matching every other
    // getRunnableModelsForType-driven test in this file/model-catalog-
    // runnable.test.mjs.
    seedCatalog([NANO_BANANA_2, QWEN_IMAGE_MAX]);
    expect(await defaultRunnableModel("image")).toBe("google/nano-banana-2-lite");
  });

  it("degrades to the last-resort fallback id when the catalog lookup itself fails", async () => {
    prisma.modelPricing.findMany.mockRejectedValue(new Error("db unreachable"));
    expect(await defaultRunnableModel("audio")).toBe("suno-v4.5");
  });
});

describe("video pool — text-only steps must never get image-required models (2026-08-06 production incident)", () => {
  // The exact rows the incident produced: all 8 cr, capability "video", but
  // kling-3.0/motion-control's curated schema REQUIRES input_urls/video_urls
  // (a motion-transfer model) and the happyhorse reference row needs a
  // reference image — neither can run on a text prompt alone.
  const KLING_MOTION = {
    modelId: "kling-3.0/motion-control", isActive: true, isDeprecated: false,
    endpoint: "kling-3.0/motion-control", providerModelId: "kling-3.0/motion-control",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 8,
    inputSchema: { fields: { prompt: { type: "string", required: false }, input_urls: { type: "array", required: true }, video_urls: { type: "array", required: true } } },
  };
  const HAPPYHORSE_REF = {
    modelId: "happyhorse-1-1/reference-to-video", isActive: true, isDeprecated: false,
    endpoint: "happyhorse-1-1/reference-to-video", providerModelId: "happyhorse-1-1/reference-to-video",
    providerName: "KIE", capability: "reference-to-video", modelType: "video", creditsCost: 8,
    inputSchema: { fields: { prompt: { type: "string", required: true }, reference_image_url: { type: "string", format: "uri", required: true } } },
  };
  const KLING_3_0_VIDEO = {
    modelId: "kling-3.0/video", isActive: true, isDeprecated: false,
    endpoint: "kling-3.0/video", providerModelId: "kling-3.0/video",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 8,
    inputSchema: { fields: { prompt: { type: "string", required: true }, sound: { type: "boolean", default: false, required: true }, multi_shots: { type: "boolean", default: false, required: true } } },
  };
  const SEEDANCE_2 = {
    modelId: "bytedance/seedance-2", isActive: true, isDeprecated: false,
    endpoint: "bytedance/seedance-2", providerModelId: "bytedance/seedance-2",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 143,
    inputSchema: { fields: { prompt: { type: "string", required: true }, aspect_ratio: { type: "string", enum: ["16:9", "9:16"] }, duration: { type: "number", minimum: 4, maximum: 15 } } },
  };

  it("defaultRunnableModel('video') skips the media-required rows and picks a text-capable model", async () => {
    seedCatalog([KLING_MOTION, HAPPYHORSE_REF, KLING_3_0_VIDEO]);
    expect(await defaultRunnableModel("video")).toBe("kling-3.0/video");
  });

  it("executeStepWithRetry substitutes a media-required PRIMARY on a text-only step — no wasted provider call", async () => {
    seedCatalog([KLING_MOTION, HAPPYHORSE_REF, KLING_3_0_VIDEO]);
    generateVideo.mockResolvedValue({ url: "https://cdn.example/clip.mp4" });

    const step = { agent: "video", task: "Clip 1", params: { model: "kling-3.0/motion-control", prompt: "sunlight through curtains", aspect_ratio: "9:16" } };
    const { output, model } = await executeStepWithRetry(step, [], 0, { quoted: 8, max: 8 });

    expect(output).toBe("https://cdn.example/clip.mp4");
    expect(model).toBe("kling-3.0/video");
    expect(generateVideo).toHaveBeenCalledTimes(1);
    expect(generateVideo.mock.calls[0][0]).toMatchObject({ endpoint: "kling-3.0/video" });
  });

  it("the SAME media-required model is allowed when the step actually carries an image (i2v)", async () => {
    seedCatalog([KLING_MOTION, KLING_3_0_VIDEO]);
    generateI2V.mockResolvedValue({ url: "https://cdn.example/animated.mp4" });

    const step = { agent: "video", task: "Animate the still", params: { model: "kling-3.0/motion-control", prompt: "move the cloth", image_url: "/api/media/local/x.png" } };
    const { output, model } = await executeStepWithRetry(step, [], 0, { quoted: 8, max: 8 });

    expect(output).toBe("https://cdn.example/animated.mp4");
    expect(model).toBe("kling-3.0/motion-control");
    expect(generateI2V).toHaveBeenCalledTimes(1);
    expect(generateI2V.mock.calls[0][0]).toMatchObject({ endpoint: "kling-3.0/motion-control", image_url: "/api/media/local/x.png" });
  });
});

describe("user-requested model resolution — 'use seedance 2' is honored deterministically (2026-08-06 incident)", () => {
  const KLING_3_0_VIDEO = {
    modelId: "kling-3.0/video", isActive: true, isDeprecated: false,
    endpoint: "kling-3.0/video", providerModelId: "kling-3.0/video",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 8,
    inputSchema: { fields: { prompt: { type: "string", required: true } } },
  };
  const SEEDANCE_2 = {
    modelId: "bytedance/seedance-2", isActive: true, isDeprecated: false,
    endpoint: "bytedance/seedance-2", providerModelId: "bytedance/seedance-2",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 143,
    inputSchema: { fields: { prompt: { type: "string", required: true } } },
  };
  const SEEDANCE_2_FAST = {
    modelId: "bytedance/seedance-2-fast", isActive: true, isDeprecated: false,
    endpoint: "bytedance/seedance-2-fast", providerModelId: "bytedance/seedance-2-fast",
    providerName: "KIE", capability: "video", modelType: "video", creditsCost: 125,
    inputSchema: { fields: { prompt: { type: "string", required: true } } },
  };

  it("resolves 'use seedance 2' from the conversation to bytedance/seedance-2 — not the -fast variant", async () => {
    seedCatalog([KLING_3_0_VIDEO, SEEDANCE_2, SEEDANCE_2_FAST]);
    const requested = await resolveUserRequestedModels({
      conversation: [{ role: "user", content: "Use seedance 2 for the videos" }],
    });
    expect(requested).toEqual([
      { kind: "video", row: expect.objectContaining({ modelId: "bytedance/seedance-2" }) },
    ]);
  });

  it("resolves the dotted 'seedance 2.0' spelling identically", async () => {
    seedCatalog([KLING_3_0_VIDEO, SEEDANCE_2]);
    const requested = await resolveUserRequestedModels({
      userMessage: "Revision: For videos use seedance 2.0",
    });
    expect(requested[0].row.modelId).toBe("bytedance/seedance-2");
  });

  it("pins the resolved model onto every video step and marks the summary", async () => {
    const plan = {
      summary: "4 slow cinematic clips",
      steps: [
        { agent: "video", task: "Clip 1", params: { prompt: "x", aspect_ratio: "9:16" } },
        { agent: "video", task: "Clip 2", params: { prompt: "y", aspect_ratio: "9:16" } },
        { agent: "music", task: "Score", params: { prompt: "ambient" } },
      ],
    };
    pinUserRequestedModels(plan, [{ kind: "video", row: SEEDANCE_2 }]);
    expect(plan.steps[0].params.model).toBe("bytedance/seedance-2");
    expect(plan.steps[0].params.endpoint).toBe("bytedance/seedance-2");
    expect(plan.steps[1].params.model).toBe("bytedance/seedance-2");
    expect(plan.steps[2].params.model).toBeUndefined(); // other kinds untouched
    expect(plan.summary).toMatch(/pinned to your request/i);
  });

  it("returns nothing for an ambiguous bare-vendor mention ('use kling' matches many rows)", async () => {
    seedCatalog([KLING_3_0_VIDEO, SEEDANCE_2]);
    const requested = await resolveUserRequestedModels({
      conversation: [{ role: "user", content: "use kling for the shots" }],
    });
    expect(requested).toEqual([]);
  });
});
