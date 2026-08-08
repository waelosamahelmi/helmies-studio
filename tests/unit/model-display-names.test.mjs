import { describe, it, expect } from "vitest";
import { slugToTitle, resolveDisplayNames, variantTag } from "@/lib/model-catalog-core.mjs";

describe("brands are spelled the way their makers spell them", () => {
  it("fixes the ones naive title-casing got wrong", () => {
    // A catalog that misspells its own suppliers reads as one nobody maintains.
    expect(slugToTitle("gpt-image-2-text-to-image", { capability: "text-to-image" })).toBe("GPT Image 2");
    expect(slugToTitle("minimax-h3/text-to-video", { capability: "text-to-video" })).toBe("MiniMax H3");
    expect(slugToTitle("happyhorse/image-to-video", { capability: "image-to-video" })).toBe("HappyHorse");
    expect(slugToTitle("pixverse-v6/text-to-video", { capability: "text-to-video" })).toBe("PixVerse V6");
    expect(slugToTitle("wan/2-7-r2v", {})).toBe("Wan 2.7 R2V");
    expect(slugToTitle("wan/2-2-a14b-text-to-video-turbo", {})).toBe("Wan 2.2 A14B Text To Video Turbo");
  });

  it("never shows an internal route name as if it were the model's name", () => {
    // "Generate Veo 3 Video" is a verb phrase nobody calls it, and it sorts
    // under G.
    expect(slugToTitle("generate-veo-3-video", {})).toBe("Veo 3");
    expect(slugToTitle("generate-aleph-video", {})).toBe("Runway Aleph");
  });

  it("gives ByteDance's V-series a brand, since dropping the vendor folder left it with none", () => {
    expect(slugToTitle("bytedance/v1-pro-text-to-video", { capability: "text-to-video" })).toBe("Seedance V1 Pro");
  });
});

describe("a name is only correct relative to the ones beside it", () => {
  const CATALOG = [
    { modelId: "happyhorse/text-to-video", modelType: "video", capability: "text-to-video" },
    { modelId: "happyhorse/reference-to-video", modelType: "video", capability: "reference-to-video" },
    { modelId: "seedream/5-pro-text-to-image", modelType: "image", capability: "text-to-image" },
  ];

  it("separates two models whose only difference was the phrase that got stripped", () => {
    // Both rendered as "HappyHorse" and the picker showed the same name
    // twice with no way to tell them apart.
    const names = resolveDisplayNames(CATALOG);
    expect(names.get("happyhorse/text-to-video")).toBe("HappyHorse (from text)");
    expect(names.get("happyhorse/reference-to-video")).toBe("HappyHorse (from references)");
  });

  it("leaves a name that was already unique completely alone", () => {
    // Tagging every model would make the whole catalog noisier to fix a
    // problem only a few rows have.
    expect(resolveDisplayNames(CATALOG).get("seedream/5-pro-text-to-image")).toBe("Seedream 5 Pro");
  });

  it("does not tag across pickers a user never sees together", () => {
    const names = resolveDisplayNames([
      { modelId: "topaz/image-upscale", modelType: "i2i", capability: "image-upscale" },
      { modelId: "topaz/video-upscale", modelType: "v2v", capability: "video-upscale" },
    ]);
    expect(names.get("topaz/image-upscale")).toBe("Topaz");
    expect(names.get("topaz/video-upscale")).toBe("Topaz");
  });

  it("falls back to the id tail rather than leaving two identical names", () => {
    const names = resolveDisplayNames([
      { modelId: "acme/alpha", modelType: "video", displayName: "Acme" },
      { modelId: "acme/beta", modelType: "video", displayName: "Acme" },
    ]);
    expect(new Set(names.values()).size).toBe(2);
  });

  it("reads a tag off the id, or admits there is none", () => {
    expect(variantTag("x/image-to-video")).toBe("from a still");
    expect(variantTag("x/plain")).toBeNull();
  });
});
