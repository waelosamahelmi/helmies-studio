import { describe, it, expect } from "vitest";
import { slugToTitle, toPublicModelId } from "@/lib/model-catalog-core.mjs";

// URGENT production fix — display names were mangled by a naive per-segment
// titlecasing (titleFromSlug) that never rejoined a hyphen-split version
// number and never distinguished a vendor folder from the model's own brand.
// These are the exact examples measured on the live catalog.

describe("slugToTitle", () => {
  it('fixes "Bytedance Seedance 1 5 Pro" -> "Seedance 1.5 Pro" (drops the vendor folder, rejoins the version number)', () => {
    expect(slugToTitle("bytedance/seedance-1-5-pro", { capability: "video" })).toBe("Seedance 1.5 Pro");
  });

  it("rejoins a hyphen-split version number even with no vendor folder present", () => {
    expect(slugToTitle("seedance-1-5-pro", { capability: "video" })).toBe("Seedance 1.5 Pro");
  });

  it('fixes "Generate 4 O Image" via the explicit override for a known worst offender', () => {
    expect(slugToTitle("generate-4-o-image")).toBe("GPT-4o Image");
  });

  it('strips a redundant "Text To Image" suffix once the model is already categorized as image ("Flux 2 Flex Text To Image" -> "Flux 2 Flex")', () => {
    expect(slugToTitle("flux-2/flex-text-to-image", { capability: "text-to-image" })).toBe("Flux 2 Flex");
  });

  it("does NOT drop a folder segment that is the model's own brand, not an upstream vendor (e.g. Wan)", () => {
    expect(slugToTitle("wan/2-7-image-to-video", { capability: "image-to-video" })).toMatch(/^Wan /);
  });

  it("preserves a dotted version number already present", () => {
    expect(slugToTitle("model-2-0-thing")).toBe("Model 2.0 Thing");
  });

  it("does not strip a suffix that doesn't actually match the capability phrase", () => {
    expect(slugToTitle("wan2.7-image-pro", { capability: "text-to-image" })).toBe("Wan2.7 Image Pro");
  });

  it("returns the input unchanged for a falsy id", () => {
    expect(slugToTitle("")).toBe("");
    expect(slugToTitle(null)).toBeNull();
  });
});

describe("toPublicModelId — hides the upstream provider baked into a real modelId", () => {
  it('strips "alibaba:" from a real Alibaba modelId', () => {
    expect(toPublicModelId("alibaba:qwen-image-max", "Alibaba")).toBe("qwen-image-max");
  });

  it("leaves an id with no matching provider prefix unchanged", () => {
    expect(toPublicModelId("seedance-1-5-pro", "KIE")).toBe("seedance-1-5-pro");
  });

  it("is case-insensitive about the provider name", () => {
    expect(toPublicModelId("Alibaba:qwen-image-max", "alibaba")).toBe("qwen-image-max");
  });

  it("passes through a falsy modelId or providerName untouched", () => {
    expect(toPublicModelId(null, "Alibaba")).toBeNull();
    expect(toPublicModelId("alibaba:x", null)).toBe("alibaba:x");
  });
});
