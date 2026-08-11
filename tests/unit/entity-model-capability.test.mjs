import { describe, it, expect } from "vitest";
import {
  needsImageReference,
  acceptsImageReference,
  pickImageCapableSibling,
  imageReferenceSlot,
} from "@/lib/entity-core.mjs";

/* A face that was never sent cannot come back in the picture.
   ──────────────────────────────────────────────────────────────────────────
   The live failure these tests pin down: an agent step carrying entityIds for
   a character with six reference photographs was planned onto
   seedream/5-pro-text-to-image, whose inputSchema has no image field at all.
   imageReferenceSlot() returned null, injectEntities therefore attached ZERO
   images while still writing the written descriptor block, and the request
   went to the provider looking complete — a paragraph describing the person
   and no photograph of them. The prompt literally read "Replace the person in
   the image ... use the provided reference images".

   The provider drew a stranger in an invented background, the step reported
   "succeeded", and the credits were spent. Nothing in the pipeline objected,
   because nothing compared what the step HAD against what the model could
   RECEIVE. That comparison is what these functions are. */

/* Fixtures copied from the live catalog rows: ModelPricing.inputSchema.fields
   is an OBJECT KEYED BY FIELD NAME, not an array of {name}. Getting that shape
   wrong in a test would make every assertion below pass for the wrong reason —
   pickField would find nothing and report "no image slot" for every row,
   including the ones that have one. */
const T2I = {
  modelId: "seedream/5-pro-text-to-image",
  capability: "text-to-image",
  creditsCost: 10,
  inputSchema: {
    fields: {
      prompt: { type: "string", required: true },
      quality: { type: "string", enum: ["basic", "high"], required: true },
      aspect_ratio: { type: "string", required: true },
    },
  },
};
const I2I = {
  modelId: "seedream/5-pro-image-to-image",
  capability: "image-to-image",
  creditsCost: 12,
  inputSchema: {
    fields: {
      prompt: { type: "string", required: true },
      quality: { type: "string", enum: ["basic", "high"], required: true },
      image_urls: { type: "array", maxItems: 10, required: true },
    },
  },
};
const OTHER_I2I = {
  modelId: "flux-2/pro-image-to-image",
  capability: "image-to-image",
  creditsCost: 10,
  inputSchema: { fields: { image_url: { type: "string", required: true } } },
};
const CHEAP_I2I = {
  modelId: "gpt-image/1.5-image-to-image",
  capability: "image-to-image",
  creditsCost: 8,
  inputSchema: { fields: { image_urls: { type: "array", required: true } } },
};

/* The cheap traps that share the "i2i" pool with real editors. Each takes an
   image and none can render a person from a reference, so a plain
   cheapest-capable pick lands on the 1-credit upscaler and hands back the
   reference photo essentially unchanged. */
const UPSCALER = {
  modelId: "recraft/crisp-upscale",
  capability: "image-upscale",
  creditsCost: 1,
  inputSchema: { fields: { image_url: { type: "string", required: true } } },
};
const BG_REMOVER = {
  modelId: "recraft/remove-background",
  capability: "background-removal",
  creditsCost: 5,
  inputSchema: { fields: { image_url: { type: "string", required: true } } },
};
/* Takes an image, but produces TIME, not a frame — isStillImageModel's job. */
const I2V = {
  modelId: "kling/image-to-video",
  capability: "image-to-image",
  creditsCost: 6,
  inputSchema: { fields: { image_url: { type: "string", required: true }, duration: { type: "number" } } },
};

/* Nine ACTIVE catalog rows call their image array `input_urls`, not
   `image_urls` — the gpt-image, flux-2 and wan families. The field was absent
   from IMAGE_REFERENCE_FIELDS, so imageReferenceSlot() reported "no image
   slot" for all of them and injectEntities dropped the reference photographs
   the same way it did for a text-to-image row: descriptor written, pictures
   never sent. Four of the nine are image-to-image models, i.e. exactly the
   rows a corrected planner would reach for. */
const INPUT_URLS_I2I = {
  modelId: "flux-2/pro-image-to-image",
  capability: "image-to-image",
  creditsCost: 10,
  inputSchema: {
    fields: {
      prompt: { type: "string", required: true },
      input_urls: { type: "array", maxItems: 8, minItems: 1, required: true },
    },
  },
};

describe("input_urls is a real image slot", () => {
  it("is detected, so entity references actually travel", () => {
    expect(imageReferenceSlot(INPUT_URLS_I2I.inputSchema)?.field).toBe("input_urls");
    expect(acceptsImageReference(INPUT_URLS_I2I)).toBe(true);
  });

  it("makes these rows eligible as substitutes", () => {
    const pick = pickImageCapableSibling("z-image/text-to-image", [INPUT_URLS_I2I]);
    expect(pick?.modelId).toBe("flux-2/pro-image-to-image");
  });

  it("counts as a supplied source image on the step side too", () => {
    expect(needsImageReference({ params: { input_urls: ["https://x.test/a.png"] } })).toBe(true);
    expect(needsImageReference({ params: { input_urls: [] } })).toBe(false);
  });

  it("still prefers an explicit reference slot when a model has both", () => {
    const both = {
      modelId: "some/model",
      capability: "image-to-image",
      inputSchema: {
        fields: {
          input_urls: { type: "array", required: true },
          reference_image_urls: { type: "array", required: false },
        },
      },
    };
    expect(imageReferenceSlot(both.inputSchema).field).toBe("reference_image_urls");
  });
});

describe("acceptsImageReference", () => {
  it("is false for the text-to-image row that caused the bug", () => {
    expect(acceptsImageReference(T2I)).toBe(false);
    expect(imageReferenceSlot(T2I.inputSchema)).toBeNull();
  });

  it("is true for its image-to-image sibling", () => {
    expect(acceptsImageReference(I2I)).toBe(true);
    expect(imageReferenceSlot(I2I.inputSchema)?.field).toBe("image_urls");
  });

  it("does not throw on a row with no schema at all", () => {
    expect(acceptsImageReference(null)).toBe(false);
    expect(acceptsImageReference({})).toBe(false);
  });
});

describe("needsImageReference", () => {
  it("is true when the step names entities (the live case)", () => {
    expect(needsImageReference({ entityIds: ["cmsjfy6si00022bktd02xinsq"] })).toBe(true);
  });

  it("is true when a source image is already in params, with no entityIds", () => {
    // Editing/replacing a supplied photo is image-to-image work however the
    // step was labelled.
    expect(needsImageReference({ params: { image_url: "https://x.test/a.png" } })).toBe(true);
    expect(needsImageReference({ params: { image_urls: ["https://x.test/a.png"] } })).toBe(true);
  });

  it("is false for a genuine text-to-image step", () => {
    expect(needsImageReference({ entityIds: [], params: { prompt: "a red car" } })).toBe(false);
    expect(needsImageReference({})).toBe(false);
  });

  it("treats an EMPTY image field as absent, not present", () => {
    expect(needsImageReference({ params: { image_urls: [] } })).toBe(false);
    expect(needsImageReference({ params: { image_url: "" } })).toBe(false);
  });
});

describe("pickImageCapableSibling", () => {
  it("prefers the literal text-to-image -> image-to-image twin", () => {
    // Keeps the user on the model and quality tier they picked, even though
    // two cheaper capable rows exist.
    const pick = pickImageCapableSibling(T2I.modelId, [CHEAP_I2I, OTHER_I2I, I2I]);
    expect(pick.modelId).toBe("seedream/5-pro-image-to-image");
  });

  it("falls back to the same provider family before leaving it", () => {
    const familyOnly = {
      modelId: "seedream/4-image-edit",
      capability: "image-edit",
      creditsCost: 20,
      inputSchema: { fields: { image_url: { type: "string", required: true } } },
    };
    // No exact twin in the list, so the seedream row wins over cheaper rivals.
    const pick = pickImageCapableSibling(T2I.modelId, [CHEAP_I2I, OTHER_I2I, familyOnly]);
    expect(pick.modelId).toBe("seedream/4-image-edit");
  });

  it("falls back to the cheapest capable model when the family has none", () => {
    const pick = pickImageCapableSibling("z-image/text-to-image", [OTHER_I2I, CHEAP_I2I]);
    expect(pick.modelId).toBe("gpt-image/1.5-image-to-image");
  });

  it("never returns a model that cannot take an image", () => {
    expect(pickImageCapableSibling(T2I.modelId, [T2I])).toBeNull();
    expect(pickImageCapableSibling(T2I.modelId, [])).toBeNull();
    expect(pickImageCapableSibling(T2I.modelId)).toBeNull();
  });

  it("refuses an upscaler even though it is the cheapest image-taking row", () => {
    // The live "i2i" pool really is ordered this way: recraft/crisp-upscale at
    // 1cr sorts above every genuine editor. Picking it would return the
    // reference photo back, upscaled, instead of a new render.
    expect(pickImageCapableSibling(T2I.modelId, [UPSCALER, BG_REMOVER])).toBeNull();
    const pick = pickImageCapableSibling(T2I.modelId, [UPSCALER, BG_REMOVER, CHEAP_I2I]);
    expect(pick.modelId).toBe("gpt-image/1.5-image-to-image");
  });

  it("refuses a model that takes an image but renders video", () => {
    expect(pickImageCapableSibling(T2I.modelId, [I2V])).toBeNull();
  });

  it("every returned candidate accepts an image, whatever the input", () => {
    for (const planned of [T2I.modelId, "unknown/model", "", null]) {
      const pick = pickImageCapableSibling(planned, [T2I, CHEAP_I2I, OTHER_I2I, I2I]);
      if (pick) expect(acceptsImageReference(pick)).toBe(true);
    }
  });
});

describe("the pairing that was missing", () => {
  it("detects the exact live mismatch: entityIds planned onto a text-only model", () => {
    const step = { entityIds: ["cmsjfy6si00022bktd02xinsq"], params: { prompt: "Replace the person in the image" } };
    const mismatch = needsImageReference(step) && !acceptsImageReference(T2I);
    expect(mismatch).toBe(true);

    // ...and that it is correctable rather than merely detectable.
    const fixed = pickImageCapableSibling(T2I.modelId, [I2I, CHEAP_I2I]);
    expect(acceptsImageReference(fixed)).toBe(true);
  });

  it("leaves an honest text-to-image step untouched", () => {
    const step = { entityIds: [], params: { prompt: "a red car on a beach" } };
    expect(needsImageReference(step) && !acceptsImageReference(T2I)).toBe(false);
  });
});

/* Where the replacement is looked up, which is not where you would guess.
   ──────────────────────────────────────────────────────────────────────────
   modelTypeForCapability maps "text-to-image" -> "image" but
   "image-to-image" -> "i2i". They are different pools. Searching the "image"
   pool for an image-capable replacement returns nothing that takes an image,
   which is not an empty-catalog problem — it is structural, and it silently
   produced a WORSE substitute (seedream/4.5-edit) before the caller was
   pointed at "i2i". agent-runner.js therefore asks for "i2i" explicitly. */
describe("capability routing (why the caller asks for the i2i pool)", () => {
  it("text-to-image and image-to-image live in different modelType buckets", async () => {
    const { modelTypeForCapability } = await import("@/lib/model-catalog-core.mjs");
    expect(modelTypeForCapability("text-to-image")).toBe("image");
    expect(modelTypeForCapability("image-to-image")).toBe("i2i");
    // Same bucket would make the distinction moot; different buckets is the
    // whole reason the lookup has to name "i2i".
    expect(modelTypeForCapability("text-to-image")).not.toBe(modelTypeForCapability("image-to-image"));
  });
});
