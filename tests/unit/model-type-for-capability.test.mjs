import { describe, it, expect } from "vitest";
import { modelTypeForCapability, CAPABILITY_TO_MODEL_TYPE, UNCATEGORIZED_MODEL_TYPE } from "@/lib/model-catalog-core.mjs";

// URGENT production fix: ModelPricing.modelType and .capability used to be
// computed independently and could disagree (see model-catalog-core.mjs's
// header on CAPABILITY_TO_MODEL_TYPE for the measured production example —
// Bytedance Seedance models had capability="video" but modelType="image").
// modelTypeForCapability is the ONE function every write path now routes
// through, so this test exhaustively locks down the mapping the task spec
// gave us, plus the "never guess" behavior for anything outside it.

describe("modelTypeForCapability — the single source of truth for modelType", () => {
  const expected = {
    "text-to-image": "image",
    "image-to-image": "i2i",
    "text-to-video": "video",
    "image-to-video": "i2v",
    "video-to-video": "v2v",
    "reference-to-video": "video",
    "avatar-video": "lipsync",
    "text-to-speech": "audio",
    audio: "audio",
    "image-upscale": "i2i",
    "video-upscale": "v2v",
    "background-removal": "i2i",
  };

  it.each(Object.entries(expected))("maps capability %s -> modelType %s", (capability, modelType) => {
    expect(modelTypeForCapability(capability)).toBe(modelType);
  });

  it("covers every mapping exactly (no more, no fewer, than the task's table)", () => {
    expect(CAPABILITY_TO_MODEL_TYPE).toEqual(expected);
  });

  it("returns null for null/undefined capability", () => {
    expect(modelTypeForCapability(null)).toBeNull();
    expect(modelTypeForCapability(undefined)).toBeNull();
    expect(modelTypeForCapability("")).toBeNull();
  });

  it("returns null for a bare/generic capability a sync's own fallback can produce — never guesses a direction for it", () => {
    // This is exactly how the Bytedance Seedance bug happened: a sync's own
    // best-guess inference couldn't tell text-to-video from image-to-video
    // just from the slug and fell back to a bare "video"/"image". Guessing
    // a modelType for that here would just reintroduce the same class of
    // bug under a different name.
    expect(modelTypeForCapability("video")).toBeNull();
    expect(modelTypeForCapability("image")).toBeNull();
    expect(modelTypeForCapability("media")).toBeNull();
  });

  it("returns null for an unknown/typo'd capability", () => {
    expect(modelTypeForCapability("text-to-widget")).toBeNull();
  });

  it("exposes the UNCATEGORIZED sentinel used wherever a null result must still be written to a NOT NULL modelType column", () => {
    expect(UNCATEGORIZED_MODEL_TYPE).toBe("uncategorized");
    expect(modelTypeForCapability("bogus") || UNCATEGORIZED_MODEL_TYPE).toBe("uncategorized");
  });
});
