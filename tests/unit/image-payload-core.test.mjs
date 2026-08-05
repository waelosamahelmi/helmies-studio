// Dedicated image adapters (audit class E) — payload and poll shapes pinned
// to docs/model-audit/image-dedicated.md's documented examples.
import { describe, it, expect } from "vitest";
import {
  IMAGE_FAMILY,
  imageProviderFamily,
  imageSubmitPath,
  imagePollPath,
  formatImageRequest,
  buildGpt4oImageBody,
  buildFluxKontextBody,
  resolveFluxKontextTier,
  parseGpt4oImagePoll,
  parseFluxKontextPoll,
  parseImagePoll,
} from "../../src/lib/image-payload-core.mjs";

describe("imageProviderFamily", () => {
  it("claims the two dedicated ids and nothing else", () => {
    expect(imageProviderFamily("generate-4-o-image")).toBe(IMAGE_FAMILY.GPT4O);
    expect(imageProviderFamily("generate-or-edit-image")).toBe(IMAGE_FAMILY.FLUX_KONTEXT);
    expect(imageProviderFamily("flux-kontext-max")).toBe(IMAGE_FAMILY.FLUX_KONTEXT);
    expect(imageProviderFamily("flux-2/pro-text-to-image")).toBeNull();
    expect(imageProviderFamily("google/nano-banana")).toBeNull();
    expect(imageProviderFamily("generate-music")).toBeNull();
    expect(imageProviderFamily(null)).toBeNull();
  });
});

describe("4o Image", () => {
  it("routes to POST /api/v1/gpt4o-image/generate with the real flat body", () => {
    expect(imageSubmitPath("generate-4-o-image")).toBe("/api/v1/gpt4o-image/generate");
    const req = formatImageRequest("generate-4-o-image", "a red square", {
      size: "3:2",
      image_url: "https://cdn.example/in.png",
      maskUrl: "https://cdn.example/mask.png",
      num_images: 2,
      isEnhance: true,
      negative_prompt: "should be dropped",
    });
    expect(req.path).toBe("/api/v1/gpt4o-image/generate");
    expect(req.body).toEqual({
      prompt: "a red square",
      size: "3:2",
      filesUrl: ["https://cdn.example/in.png"],
      maskUrl: "https://cdn.example/mask.png",
      nVariants: 2,
      isEnhance: true,
    });
  });

  it("only accepts the real size enum (1:1|3:2|2:3) and never invents one", () => {
    expect(buildGpt4oImageBody("x", { aspect_ratio: "2:3" }).size).toBe("2:3");
    expect(buildGpt4oImageBody("x", { aspect_ratio: "16:9" }).size).toBeUndefined();
    expect(buildGpt4oImageBody("x", {}).size).toBeUndefined();
  });

  it("caps filesUrl at 5 and drops invalid nVariants", () => {
    const urls = Array.from({ length: 7 }, (_, i) => `https://cdn.example/${i}.png`);
    const body = buildGpt4oImageBody("x", { filesUrl: urls, nVariants: 3 });
    expect(body.filesUrl).toHaveLength(5);
    expect(body.nVariants).toBeUndefined();
  });

  it("polls the record-info route and parses SUCCESS/failed/pending", () => {
    expect(imagePollPath("generate-4-o-image", "t-1")).toBe("/api/v1/gpt4o-image/record-info?taskId=t-1");
    expect(
      parseGpt4oImagePoll({ status: "SUCCESS", successFlag: 1, response: { resultUrls: ["https://cdn.example/a.png"] } }),
    ).toEqual({ status: "success", outputs: ["https://cdn.example/a.png"], error: undefined });
    expect(parseGpt4oImagePoll({ status: "GENERATING", successFlag: 0 }).status).toBe("pending");
    const failed = parseGpt4oImagePoll({ status: "GENERATE_FAILED", successFlag: 2, errorMessage: "boom" });
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("boom");
    // SUCCESS with no URLs yet is NOT done.
    expect(parseGpt4oImagePoll({ status: "SUCCESS", response: { resultUrls: [] } }).status).toBe("pending");
  });
});

describe("Flux Kontext", () => {
  it("routes to POST /api/v1/flux/kontext/generate with camelCase fields", () => {
    expect(imageSubmitPath("generate-or-edit-image")).toBe("/api/v1/flux/kontext/generate");
    const req = formatImageRequest("generate-or-edit-image", "a cat", {
      aspect_ratio: "16:21",
      image_url: "https://cdn.example/in.jpg",
      output_format: "png",
      prompt_upsampling: true,
      safety_tolerance: 3,
      resolution: "1k", // fabricated legacy field — must be dropped
    });
    expect(req.path).toBe("/api/v1/flux/kontext/generate");
    expect(req.body).toEqual({
      model: "flux-kontext-pro",
      prompt: "a cat",
      aspectRatio: "16:21",
      inputImage: "https://cdn.example/in.jpg",
      outputFormat: "png",
      promptUpsampling: true,
      safetyTolerance: 3,
    });
  });

  it("selects the tier from model_tier or the model id, defaulting to pro", () => {
    expect(resolveFluxKontextTier("generate-or-edit-image", {})).toBe("flux-kontext-pro");
    expect(resolveFluxKontextTier("generate-or-edit-image", { model_tier: "flux-kontext-max" })).toBe("flux-kontext-max");
    expect(resolveFluxKontextTier("flux-kontext-max", {})).toBe("flux-kontext-max");
    expect(resolveFluxKontextTier("generate-or-edit-image", { model_tier: "bogus" })).toBe("flux-kontext-pro");
    expect(buildFluxKontextBody("generate-or-edit-image", "x", {}).model).toBe("flux-kontext-pro");
  });

  it("inputImage stays optional — a pure text-to-image submit is valid", () => {
    const body = buildFluxKontextBody("generate-or-edit-image", "just text", {});
    expect(body.inputImage).toBeUndefined();
    expect(body.prompt).toBe("just text");
  });

  it("parses successFlag 0/1/2/3 and reads resultImageUrl only", () => {
    expect(imagePollPath("generate-or-edit-image", "t-2")).toBe("/api/v1/flux/kontext/record-info?taskId=t-2");
    expect(parseFluxKontextPoll({ successFlag: 0 }).status).toBe("pending");
    expect(
      parseFluxKontextPoll({ successFlag: 1, response: { resultImageUrl: "https://cdn.example/out.jpg", originImageUrl: "https://cdn.example/in.jpg" } }),
    ).toEqual({ status: "success", outputs: ["https://cdn.example/out.jpg"], error: undefined });
    expect(parseFluxKontextPoll({ successFlag: 3, errorMessage: "nope" })).toEqual({ status: "failed", outputs: [], error: "nope" });
  });
});

describe("parseImagePoll dispatch", () => {
  it("returns null for non-dedicated models so callers keep their own chain", () => {
    expect(parseImagePoll({ state: "success" }, "flux-2/pro-text-to-image")).toBeNull();
    expect(parseImagePoll({}, null)).toBeNull();
  });
});
