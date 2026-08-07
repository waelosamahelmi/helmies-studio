import { describe, it, expect } from "vitest";
import { maxImagesFromFields } from "@/components/studio/useModelCatalog";
import { imageReferenceSlot } from "@/lib/entity-core.mjs";

/* Regression: the hook derived maxImages from images_list/reference_images
   only. Measured against the live catalog that returned 0 for ALL 31 image
   models, because the families that actually take references name the field
   something else — so every piece of UI gated on `maxImages > 0` was dead,
   including the Cast studio's "generate the missing angles" control. */

const SCHEMAS = {
  "nano-banana-pro": { fields: { prompt: {}, image_input: {}, aspect_ratio: {} } },
  "bytedance/seedance-2": { fields: { prompt: {}, reference_image_urls: {}, first_frame_url: {} } },
  "kling/v3-turbo-image-to-video": { fields: { prompt: {}, image_urls: {}, resolution: {} } },
  "wan/2-7-r2v": { fields: { prompt: {}, reference_image: {}, reference_voice: {} } },
  "flux-2/pro-text-to-image": { fields: { prompt: {}, resolution: {}, aspect_ratio: {} } },
};

describe("maxImagesFromFields", () => {
  it("recognises every reference field the live catalog actually uses", () => {
    expect(maxImagesFromFields(SCHEMAS["nano-banana-pro"].fields)).toBeGreaterThan(0);
    expect(maxImagesFromFields(SCHEMAS["bytedance/seedance-2"].fields)).toBeGreaterThan(0);
    expect(maxImagesFromFields(SCHEMAS["kling/v3-turbo-image-to-video"].fields)).toBeGreaterThan(0);
    expect(maxImagesFromFields(SCHEMAS["wan/2-7-r2v"].fields)).toBe(1);
  });

  it("returns 0 for a text-only model", () => {
    expect(maxImagesFromFields(SCHEMAS["flux-2/pro-text-to-image"].fields)).toBe(0);
    expect(maxImagesFromFields({})).toBe(0);
  });

  it("honours an explicit maxItems over the assumed cap", () => {
    expect(maxImagesFromFields({ image_input: { maxItems: 14 } })).toBe(14);
    // maxItems is absent far more often than not; a present array field must
    // still mean "at least one" rather than "none".
    expect(maxImagesFromFields({ image_input: {} })).toBeGreaterThan(0);
  });

  it("agrees with the server's own reference-slot detection", () => {
    // If these two ever disagree, a studio offers a model whose references
    // the server then has nowhere to write.
    for (const [id, schema] of Object.entries(SCHEMAS)) {
      const uiAccepts = maxImagesFromFields(schema.fields) > 0;
      const serverAccepts = !!imageReferenceSlot(schema);
      expect(uiAccepts, `${id} disagreed`).toBe(serverAccepts);
    }
  });
});
