import { describe, it, expect } from "vitest";
import {
  imageModelsFor, videoModelsFor, voiceModelsFor,
  supportsAspect, isVideoModel, takesFirstFrame, estimateProjectCost,
  textToImageModelsFor, pickTextToImageModel, saysItIsNotAStill, shotDurationLimits,
} from "@/lib/project-models.mjs";

const model = (id, fields, extra = {}) => ({ id, credits: 10, schema: { fields }, ...extra });

const CATALOG = [
  // A still model that can be shown a face.
  model("seedream-edit", { prompt: {}, image_urls: {}, aspect_ratio: { enum: ["9:16", "16:9"] } }),
  // A still model that cannot — it would invent the person every shot.
  model("z-image", { prompt: {}, aspect_ratio: { enum: ["9:16", "16:9"] } }),
  // A still model that does not shoot vertical.
  model("wide-only", { prompt: {}, image_urls: {}, aspect_ratio: { enum: ["16:9"] } }),
  // Video that can start from an approved still.
  model("seedance", { prompt: {}, duration: {}, first_frame_url: {}, aspect_ratio: { enum: ["9:16", "16:9"] } }),
  // Video that cannot be given a frame — text to video only.
  model("veo-t2v", { prompt: {}, duration: {}, aspect_ratio: { enum: ["9:16"] } }),
  // A voice.
  model("gemini-tts", { text: {}, voice_name: { enum: ["Kore"] } }),
];

describe("only models a production can actually use", () => {
  it("offers a still model that takes a reference, and refuses one that cannot", () => {
    // The whole point of the cast is that a face survives thirty shots. A
    // model with nowhere to put the reference cannot do that, however good.
    const ids = imageModelsFor(CATALOG, { aspectRatio: "9:16" }).map((m) => m.id);
    expect(ids).toContain("seedream-edit");
    expect(ids).not.toContain("z-image");
  });

  it("refuses a still model that does not shoot the project's ratio", () => {
    const ids = imageModelsFor(CATALOG, { aspectRatio: "9:16" }).map((m) => m.id);
    expect(ids).not.toContain("wide-only");
    expect(imageModelsFor(CATALOG, { aspectRatio: "16:9" }).map((m) => m.id)).toContain("wide-only");
  });

  it("never offers a video model as an image editor", () => {
    // This actually shipped: three video rows were stored as
    // capability "text-to-image" and appeared in the identity picker.
    const ids = imageModelsFor(CATALOG, {}).map((m) => m.id);
    expect(ids).not.toContain("seedance");
    expect(ids).not.toContain("veo-t2v");
  });

  it("offers only video models that can start from an approved still", () => {
    const ids = videoModelsFor(CATALOG, { aspectRatio: "9:16" }).map((m) => m.id);
    expect(ids).toEqual(["seedance"]);
  });

  it("finds the voices and nothing else", () => {
    expect(voiceModelsFor(CATALOG).map((m) => m.id)).toEqual(["gemini-tts"]);
  });

  it("lets a model with no declared ratios through rather than hiding it", () => {
    // An absent enum means the model takes what it is given. Treating that
    // as "unsupported" would empty the picker for whole families.
    expect(supportsAspect(model("x", { prompt: {}, image_urls: {} }), "9:16")).toBe(true);
  });

  it("reads the schema, not the label", () => {
    expect(isVideoModel(model("v", { duration: {} }))).toBe(true);
    expect(isVideoModel(model("i", { prompt: {} }))).toBe(false);
    expect(takesFirstFrame(model("v", { duration: {}, first_frame_url: {} }))).toBe(true);
    expect(takesFirstFrame(model("v", { duration: {} }))).toBe(false);
  });
});

describe("what a production costs from here", () => {
  const scenes = [
    { shots: 4, rendered: 4 },
    { shots: 6, rendered: 2 },
    { shots: 2, rendered: 0 },
  ];

  it("counts a still plus a clip for every shot", () => {
    const e = estimateProjectCost(scenes, { imageCredits: 12, videoCredits: 88 });
    expect(e.shots).toBe(12);
    expect(e.perShot).toBe(100);
    expect(e.total).toBe(1200);
  });

  it("does not charge again for shots already rendered", () => {
    // The useful number is what finishing costs, not what the film would
    // have cost from scratch.
    const e = estimateProjectCost(scenes, { imageCredits: 12, videoCredits: 88 });
    expect(e.remaining).toBe(6);
    expect(e.toFinish).toBe(600);
  });

  it("says it does not know rather than quoting zero", () => {
    // A confident "0 cr" on a project with no models chosen is a lie that
    // reads as free.
    const e = estimateProjectCost(scenes, {});
    expect(e.known).toBe(false);
    expect(e.toFinish).toBe(0);
  });

  it("survives a project with no scenes", () => {
    expect(estimateProjectCost([], { imageCredits: 5, videoCredits: 5 })).toMatchObject({ shots: 0, toFinish: 0 });
  });
});

describe("what may draw a room from a description", () => {
  // This shipped wrong: pressing "Draw it" on an environment ran
  // hailuo/02-text-to-video-pro. Two causes, both here.
  const WITH_UNKNOWNS = [
    ...CATALOG,
    // A row whose schema we simply do not have.
    { id: "mystery-model", credits: 500, schema: null },
    { id: "hailuo/02-text-to-video-pro", credits: 400, schema: { fields: { prompt: {}, duration: {} } } },
    { id: "cheap-draft", credits: 1, schema: { fields: { prompt: {}, aspect_ratio: { enum: ["16:9"] } } } },
  ];

  it("excludes a model whose schema we do not have, instead of assuming it is safe", () => {
    // CAUSE 1: `m.schema?.fields || {}` made an unknown model look like it
    // had no video fields, so it passed every check.
    const ids = textToImageModelsFor(WITH_UNKNOWNS, {}).map((m) => m.id);
    expect(ids).not.toContain("mystery-model");
  });

  it("never offers a text-to-video model for drawing a still", () => {
    const ids = textToImageModelsFor(WITH_UNKNOWNS, {}).map((m) => m.id);
    expect(ids).not.toContain("hailuo/02-text-to-video-pro");
    expect(ids).not.toContain("seedance");
  });

  it("does not pick the most expensive row in the catalog", () => {
    // CAUSE 2: ranking by price DESCENDING picks whatever the priciest row
    // happens to be, which is how a video model won.
    const picked = pickTextToImageModel(WITH_UNKNOWNS, {});
    expect(picked).toBeTruthy();
    expect(picked.credits).toBeLessThan(400);
  });

  it("uses the project's own image model when it can do the job", () => {
    const picked = pickTextToImageModel(WITH_UNKNOWNS, { preferred: "cheap-draft", aspectRatio: "16:9" });
    expect(picked.id).toBe("cheap-draft");
  });

  it("ignores a preferred model that cannot do the job", () => {
    // The project's image model may be an EDIT model, which cannot draw
    // something from nothing.
    const picked = pickTextToImageModel(WITH_UNKNOWNS, { preferred: "hailuo/02-text-to-video-pro" });
    expect(picked.id).not.toBe("hailuo/02-text-to-video-pro");
  });

  it("returns null rather than something wrong when nothing fits", () => {
    expect(pickTextToImageModel([{ id: "v", schema: { fields: { duration: {} } } }], {})).toBeNull();
    expect(pickTextToImageModel([], {})).toBeNull();
  });
});

describe("when the catalog's own schema is wrong", () => {
  // Both of these were in the usable pool IN PRODUCTION after the first
  // fix, because their stored schema declares no duration field. The
  // schema is a claim, not a fact.
  const LIARS = [
    { id: "hailuo/02-text-to-video-pro", modelType: "video", credits: 400, schema: { fields: { prompt: {} } } },
    { id: "wan/2-2-a14b-text-to-video-turbo", credits: 300, schema: { fields: { prompt: {} } } },
    { id: "topaz/image-upscale", modelType: "i2i", credits: 3, schema: { fields: { prompt: {} } } },
    { id: "good/text-to-image", modelType: "image", credits: 8, schema: { fields: { prompt: {} } } },
  ];

  it("refuses a model that says video in its own name, whatever its schema claims", () => {
    const ids = textToImageModelsFor(LIARS, {}).map((m) => m.id);
    expect(ids).not.toContain("hailuo/02-text-to-video-pro");
    expect(ids).not.toContain("wan/2-2-a14b-text-to-video-turbo");
  });

  it("refuses an upscaler, which needs the image it is meant to produce", () => {
    expect(textToImageModelsFor(LIARS, {}).map((m) => m.id)).not.toContain("topaz/image-upscale");
  });

  it("still keeps the models that genuinely draw", () => {
    expect(textToImageModelsFor(LIARS, {}).map((m) => m.id)).toEqual(["good/text-to-image"]);
  });

  it("does not treat a missing modelType as a claim about what it is", () => {
    // An absent type is silence, not a denial — judging it would empty the
    // pool for every row the catalog has not categorised.
    expect(saysItIsNotAStill({ id: "plain-drawer" })).toBe(false);
    expect(saysItIsNotAStill({ id: "plain-drawer", modelType: "video" })).toBe(true);
  });
});

describe("how long a shot may be", () => {
  // Ten seconds was a constant, not a fact. Seedance 2.5 holds thirty —
  // capping at the lowest common denominator chops a conversation into
  // five clips where one would do: five generations, five cuts, five
  // chances for the room to change.
  it("reads the ceiling off the model rather than assuming ten", () => {
    expect(shotDurationLimits({ schema: { fields: { duration: { maximum: 30, minimum: -1 } } } }))
      .toMatchObject({ max: 30 });
    expect(shotDurationLimits({ schema: { fields: { duration: { maximum: 15, minimum: 4 } } } }))
      .toEqual({ min: 4, max: 15 });
  });

  it("treats minimum:-1 as 'the model decides', not a real floor", () => {
    // A negative minimum is a sentinel; using it would allow a 0-second
    // shot, which bills a full clip for nothing.
    expect(shotDurationLimits({ schema: { fields: { duration: { maximum: 30, minimum: -1 } } } }).min)
      .toBeGreaterThan(0);
  });

  it("reads an enum of allowed lengths", () => {
    expect(shotDurationLimits({ schema: { fields: { duration: { enum: ["5", "10", "15"] } } } }))
      .toEqual({ min: 5, max: 15 });
  });

  it("falls back to the safe ten when a model says nothing", () => {
    expect(shotDurationLimits({ schema: { fields: { prompt: {} } } })).toEqual({ min: 4, max: 10 });
    expect(shotDurationLimits(null)).toEqual({ min: 4, max: 10 });
  });
});
