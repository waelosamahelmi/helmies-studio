import { describe, it, expect } from "vitest";
import { modelTypeForCapability, CAPABILITY_TO_MODEL_TYPE, UNCATEGORIZED_MODEL_TYPE } from "@/lib/model-catalog-core.mjs";

// URGENT production fix: ModelPricing.modelType and .capability used to be
// computed independently and could disagree (see model-catalog-core.mjs's
// header on CAPABILITY_TO_MODEL_TYPE for the measured production example —
// Bytedance Seedance models had capability="video" but modelType="image").
// modelTypeForCapability is the ONE function every write path now routes
// through, so this test exhaustively locks down the mapping the task spec
// gave us, plus the "never guess" behavior for anything outside it.
//
// A first version of this mapping left the BARE "image"/"video" capability
// values unmapped, treating them as an unreliable sync fallback — a
// read-only preview against the REAL production catalog caught that this
// was wrong: they're genuine, valid, coarse-but-real capability values (see
// modalitiesForCapability in model-catalog-core.mjs, which already had
// entries for both independently) and hiding them would have hidden 28
// working models. That's the exact gap this test's "bare capability" cases
// now lock down the OPPOSITE way.

describe("modelTypeForCapability — the single source of truth for modelType", () => {
  // reference-to-video is an IMAGE-INPUT model: the provider rejects a
  // text-only payload ("first_frame_image_url cannot be empty", measured
  // 2026-08-06). It belongs with i2v in the pool typing so the agent's
  // text-to-video pool (getRunnableModelsForType("video")) can never offer
  // it for a text-only step. Studio pickers are unaffected — they filter by
  // capability STRING (capability-groups.js's r2v group), not modelType.
  const expected = {
    "text-to-image": "image",
    "image-to-image": "i2i",
    "text-to-video": "video",
    "image-to-video": "i2v",
    "video-to-video": "v2v",
    "reference-to-video": "i2v",
    // Recast takes an identity IMAGE plus the scene VIDEO, so it types as an
    // image-input model for the same reason reference-to-video does: the
    // text-only pool must never be able to offer it.
    recast: "i2v",
    "avatar-video": "lipsync",
    "text-to-speech": "audio",
    audio: "audio",
    "image-upscale": "i2i",
    "video-upscale": "v2v",
    "background-removal": "i2i",
    image: "image",
    video: "video",
  };

  it.each(Object.entries(expected))("maps capability %s -> modelType %s", (capability, modelType) => {
    expect(modelTypeForCapability(capability)).toBe(modelType);
  });

  it("covers every mapping exactly (no more, no fewer, than the corrected table)", () => {
    expect(CAPABILITY_TO_MODEL_TYPE).toEqual(expected);
  });

  it("returns null for null/undefined capability", () => {
    expect(modelTypeForCapability(null)).toBeNull();
    expect(modelTypeForCapability(undefined)).toBeNull();
    expect(modelTypeForCapability("")).toBeNull();
  });

  // The exact gap a first version of this mapping got wrong: bare "image"
  // and "video" are real, first-class capability values a sync can
  // legitimately emit when it can't determine a more specific hyphenated
  // direction — NOT a broken fallback to hide. This is the regression test
  // for that production-preview finding.
  it("maps bare/generic 'image' and 'video' capabilities directly — they are real values, not hidden", () => {
    expect(modelTypeForCapability("video")).toBe("video");
    expect(modelTypeForCapability("image")).toBe("image");
  });

  it("still returns null for 'media' — the sync's own last-resort fallback when it can tell NOTHING from the slug", () => {
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
