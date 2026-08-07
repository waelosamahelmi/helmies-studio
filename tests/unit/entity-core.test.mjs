import { describe, it, expect } from "vitest";
import {
  validateEntityPayload,
  normalizeReferences,
  entityPromptBlock,
  selectEntityReferences,
  computeAttributeDigest,
  imageReferenceSlot,
  voiceReferenceSlot,
  applyEntityReferences,
  isAllowedReferenceUrl,
  IDENTITY_PACK,
  missingPackAngles,
  isStillImageModel,
} from "@/lib/entity-core.mjs";

const ref = (over = {}) => ({
  id: over.id || `r-${over.kind}`,
  url: over.url || `https://cdn.example/${over.kind}.png`,
  kind: "other",
  label: "",
  locked: false,
  source: "user",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const character = (over = {}) => ({
  kind: "character",
  name: "Wael",
  description: "A man in his thirties, tired.",
  attributes: { hair: "short dark hair", eyes: "brown", build: "lean" },
  references: [],
  ...over,
});

describe("validateEntityPayload", () => {
  it("accepts a character and drops attribute keys it does not understand", () => {
    const { valid, value } = validateEntityPayload("character", {
      name: "  Wael  ",
      description: "Tired.",
      attributes: { hair: "dark", vibe: "mysterious", eyes: "" },
    });
    expect(valid).toBe(true);
    expect(value.name).toBe("Wael");
    expect(value.attributes).toEqual({ hair: "dark" }); // vibe dropped, empty eyes skipped
  });

  it("rejects a missing name, an over-long description and an unknown kind", () => {
    expect(validateEntityPayload("character", {}).valid).toBe(false);
    expect(validateEntityPayload("character", { name: "x", description: "y".repeat(2001) }).valid).toBe(false);
    expect(validateEntityPayload("alien", { name: "x" }).valid).toBe(false);
  });

  it("allows a partial update to omit the name", () => {
    const { valid, value } = validateEntityPayload("character", { description: "New." }, { partial: true });
    expect(valid).toBe(true);
    expect(value.name).toBeUndefined();
  });
});

describe("reference urls", () => {
  it("allows our own media and https, and nothing else", () => {
    expect(isAllowedReferenceUrl("/api/media/local/x.png")).toBe(true);
    expect(isAllowedReferenceUrl("https://cdn.example/x.png")).toBe(true);
    expect(isAllowedReferenceUrl("http://cdn.example/x.png")).toBe(false);
    expect(isAllowedReferenceUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedReferenceUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedReferenceUrl("")).toBe(false);
  });

  it("coerces an unknown reference kind to 'other' rather than failing the save", () => {
    const errors = [];
    const out = normalizeReferences("character", [{ url: "https://cdn.example/a.png", kind: "left_ear" }], errors);
    expect(errors).toEqual([]);
    expect(out[0].kind).toBe("other");
  });
});

describe("entityPromptBlock", () => {
  it("leads with the name and writes attributes densely", () => {
    const block = entityPromptBlock(character());
    expect(block.startsWith("Wael — ")).toBe(true);
    expect(block).toContain("hair: short dark hair");
    expect(block).toContain("eyes: brown");
  });

  it("labels products and environments so the model knows what it is looking at", () => {
    expect(entityPromptBlock({ kind: "product", name: "Bottle", attributes: {} })).toContain("(product)");
    expect(entityPromptBlock({ kind: "environment", name: "The Room", attributes: {} })).toContain("(location)");
  });
});

describe("selectEntityReferences", () => {
  const refs = [
    ref({ id: "wide", kind: "full_body" }),
    ref({ id: "front", kind: "face_front" }),
    ref({ id: "gen", kind: "face_34", source: "generated" }),
    ref({ id: "sheet", kind: "sheet" }),
  ];

  it("puts face references first for dialogue and body references first for a wide shot", () => {
    const dialogue = selectEntityReferences(character({ references: refs }), { purpose: "dialogue", max: 2 });
    expect(dialogue.map((r) => r.id)).toEqual(["front", "gen"]);

    const wide = selectEntityReferences(character({ references: refs }), { purpose: "wide", max: 2 });
    expect(wide.map((r) => r.id)).toEqual(["wide", "sheet"]);
  });

  it("a locked reference outranks everything, whatever the purpose", () => {
    const withLocked = [...refs, ref({ id: "pinned", kind: "action", locked: true })];
    const out = selectEntityReferences(character({ references: withLocked }), { purpose: "closeup", max: 2 });
    expect(out[0].id).toBe("pinned");
  });

  it("prefers the user's own upload over a generated one at equal rank", () => {
    const tie = [
      ref({ id: "generated", kind: "face_front", source: "generated", url: "https://cdn.example/g.png" }),
      ref({ id: "uploaded", kind: "face_front", source: "user", url: "https://cdn.example/u.png" }),
    ];
    const out = selectEntityReferences(character({ references: tie }), { purpose: "dialogue", max: 1 });
    expect(out[0].id).toBe("uploaded");
  });

  it("respects the cap, de-duplicates by url, and survives an entity with no references", () => {
    const dupes = [ref({ id: "a", kind: "face_front", url: "https://cdn.example/same.png" }),
                   ref({ id: "b", kind: "face_34", url: "https://cdn.example/same.png" })];
    expect(selectEntityReferences(character({ references: dupes }), { max: 4 })).toHaveLength(1);
    expect(selectEntityReferences(character({ references: refs }), { max: 0 })).toEqual([]);
    expect(selectEntityReferences(character(), {})).toEqual([]);
  });
});

describe("model-aware reference slots", () => {
  // Real field sets, taken from the live catalog rows these models expose.
  const seedance2 = { fields: { prompt: {}, duration: {}, reference_image_urls: {}, first_frame_url: {}, last_frame_url: {} } };
  const wanR2v = { fields: { prompt: {}, reference_image: {}, reference_video: {}, reference_voice: {}, first_frame: {} } };
  const nanoBananaPro = { fields: { prompt: {}, image_input: {}, aspect_ratio: {} } };
  const klingI2v = { fields: { prompt: {}, duration: {}, image_urls: {}, resolution: {} } };
  const textOnly = { fields: { prompt: {}, duration: {} } };

  it("finds each family's own reference field", () => {
    expect(imageReferenceSlot(seedance2)).toMatchObject({ field: "reference_image_urls", multiple: true });
    expect(imageReferenceSlot(wanR2v)).toMatchObject({ field: "reference_image", multiple: false });
    expect(imageReferenceSlot(nanoBananaPro)).toMatchObject({ field: "image_input", multiple: true });
    expect(imageReferenceSlot(klingI2v)).toMatchObject({ field: "image_urls", multiple: true });
    expect(imageReferenceSlot(textOnly)).toBeNull();
  });

  it("prefers a true reference field over a generic image slot", () => {
    // Both present: sending identity through image_url would mean "animate
    // this frame", which is a different instruction entirely.
    const both = { fields: { prompt: {}, image_url: {}, reference_image_urls: {} } };
    expect(imageReferenceSlot(both).field).toBe("reference_image_urls");
  });

  it("finds the voice slot where a family exposes one", () => {
    expect(voiceReferenceSlot(wanR2v)).toMatchObject({ field: "reference_voice" });
    expect(voiceReferenceSlot({ fields: { reference_audio_urls: {} } })).toMatchObject({ field: "reference_audio_urls" });
    expect(voiceReferenceSlot(textOnly)).toBeNull();
  });

  it("appends references without displacing a frame the caller already set", () => {
    const params = applyEntityReferences(
      { prompt: "a", first_frame_url: "https://cdn.example/frame.png" },
      seedance2,
      ["https://cdn.example/face.png"]
    );
    expect(params.first_frame_url).toBe("https://cdn.example/frame.png");
    expect(params.reference_image_urls).toEqual(["https://cdn.example/face.png"]);
  });

  it("merges with existing references, de-duplicates, and caps to the field limit", () => {
    const schema = { fields: { reference_image_urls: { maxItems: 2 } } };
    const params = applyEntityReferences(
      { reference_image_urls: ["https://cdn.example/a.png"] },
      schema,
      ["https://cdn.example/a.png", "https://cdn.example/b.png", "https://cdn.example/c.png"]
    );
    expect(params.reference_image_urls).toEqual(["https://cdn.example/a.png", "https://cdn.example/b.png"]);
  });

  it("never overwrites an explicit single-slot image, and is a no-op with no slot or no urls", () => {
    const kept = applyEntityReferences({ image_url: "https://cdn.example/mine.png" }, { fields: { image_url: {} } }, ["https://cdn.example/x.png"]);
    expect(kept.image_url).toBe("https://cdn.example/mine.png");

    expect(applyEntityReferences({ prompt: "a" }, textOnly, ["https://cdn.example/x.png"])).toEqual({ prompt: "a" });
    expect(applyEntityReferences({ prompt: "a" }, seedance2, [])).toEqual({ prompt: "a" });
  });
});

describe("computeAttributeDigest", () => {
  it("is stable for the same identity and changes when the identity changes", () => {
    const a = character();
    expect(computeAttributeDigest(a)).toBe(computeAttributeDigest(character()));
    expect(computeAttributeDigest(character({ attributes: { hair: "shaved" } }))).not.toBe(computeAttributeDigest(a));
  });

  it("moves when a locked reference is added — that is part of the identity", () => {
    const before = computeAttributeDigest(character());
    const after = computeAttributeDigest(character({ references: [ref({ kind: "face_front", locked: true })] }));
    expect(after).not.toBe(before);
  });
});

describe("source photographs and the identity pack", () => {
  const withSource = character({
    references: [ref({ id: "snap", kind: "source", locked: true, url: "https://cdn.example/snap.jpg" })],
  });

  it("a photograph the user uploaded never claims to be a pack angle", () => {
    // Labelling an arbitrary upload "face_front" would both mislabel it and
    // mark the front as covered, so the real front angle would never be made.
    expect(missingPackAngles(withSource).map((a) => a.kind)).toEqual(IDENTITY_PACK.map((a) => a.kind));
    expect(missingPackAngles(withSource)).toHaveLength(5);
  });

  it("a generated angle does satisfy its own slot", () => {
    const filled = character({
      references: [ref({ kind: "source", locked: true }), ref({ kind: "face_front", source: "generated" })],
    });
    expect(missingPackAngles(filled).map((a) => a.kind)).not.toContain("face_front");
    expect(missingPackAngles(filled)).toHaveLength(4);
  });

  it("building the pack reads the real photograph before anything we generated", () => {
    const mixed = character({
      references: [
        ref({ id: "gen-front", kind: "face_front", source: "generated", url: "https://cdn.example/gen.png" }),
        ref({ id: "snap", kind: "source", locked: true, url: "https://cdn.example/snap.jpg" }),
      ],
    });
    const picked = selectEntityReferences(mixed, { purpose: "identity", max: 2 });
    expect(picked[0].id).toBe("snap");
  });

  it("ordinary shots still reach for the angle they need, with the photograph as backstop", () => {
    const mixed = character({
      references: [
        ref({ id: "snap", kind: "source", url: "https://cdn.example/snap.jpg" }),
        ref({ id: "body", kind: "full_body", url: "https://cdn.example/body.png" }),
      ],
    });
    expect(selectEntityReferences(mixed, { purpose: "wide", max: 1 })[0].id).toBe("body");
    // A character with nothing but a snapshot still gets it, rather than nothing.
    expect(selectEntityReferences(withSource, { purpose: "closeup", max: 1 })[0].id).toBe("snap");
  });

  it("accepts 'source' as a character reference kind rather than coercing it away", () => {
    const errors = [];
    const out = normalizeReferences("character", [{ url: "https://cdn.example/a.jpg", kind: "source" }], errors);
    expect(errors).toEqual([]);
    expect(out[0].kind).toBe("source");
  });
});

describe("isStillImageModel", () => {
  // These three schemas are copied from live catalog rows that are stored as
  // capability "text-to-image", modelType "image", outputModalities
  // ["image"] — and are video generators. Filtering on the catalog's own
  // columns offered Veo 3 as a way to make a character's face.
  const MISFILED_AS_IMAGE = {
    "generate-veo-3-video": { fields: { prompt: {}, duration: {}, watermark: {}, image_urls: {}, model_tier: {}, resolution: {}, aspect_ratio: {} } },
    "generate-ai-video": { fields: { prompt: {}, quality: {}, duration: {}, image_url: {}, watermark: {}, aspect_ratio: {} } },
    "generate-aleph-video": { fields: { seed: {}, prompt: {}, video_url: {}, watermark: {}, aspect_ratio: {}, reference_image: {} } },
  };

  const REAL_IMAGE_EDITORS = {
    "nano-banana-2": { fields: { prompt: {}, resolution: {}, image_input: {}, aspect_ratio: {}, output_format: {} } },
    "google/nano-banana-edit": { fields: { prompt: {}, image_urls: {}, aspect_ratio: {}, output_format: {} } },
    "seedream/4.5-edit": { fields: { prompt: {}, image_urls: {}, aspect_ratio: {} } },
    "qwen3/pro-image-to-image": { fields: { prompt: {}, image_urls: {}, resolution: {}, image_size: {}, seed: {} } },
  };

  it("rejects a video model however the catalog has it filed", () => {
    for (const [id, schema] of Object.entries(MISFILED_AS_IMAGE)) {
      expect(isStillImageModel(schema), `${id} should be rejected`).toBe(false);
    }
  });

  it("keeps the real image editors", () => {
    for (const [id, schema] of Object.entries(REAL_IMAGE_EDITORS)) {
      expect(isStillImageModel(schema), `${id} should be kept`).toBe(true);
    }
  });

  it("rejects anything carrying a duration or naming a video input", () => {
    expect(isStillImageModel({ fields: { prompt: {}, duration: {} } })).toBe(false);
    expect(isStillImageModel({ fields: { prompt: {}, reference_video_urls: {} } })).toBe(false);
    expect(isStillImageModel({ fields: { prompt: {}, video_url: {} } })).toBe(false);
    expect(isStillImageModel(null)).toBe(false);
    expect(isStillImageModel({})).toBe(false);
  });

  it("combined with imageReferenceSlot, leaves exactly the models that can hold a face", () => {
    const all = { ...MISFILED_AS_IMAGE, ...REAL_IMAGE_EDITORS, "flux-2/pro-text-to-image": { fields: { prompt: {}, resolution: {} } } };
    const offered = Object.entries(all)
      .filter(([, schema]) => imageReferenceSlot(schema) && isStillImageModel(schema))
      .map(([id]) => id);
    expect(offered.sort()).toEqual(Object.keys(REAL_IMAGE_EDITORS).sort());
  });
});
