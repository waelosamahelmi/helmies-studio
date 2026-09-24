/* What the video studios OFFER has to be what the chosen model can do. Each
   case here is an option that was on screen and changed nothing, or a model in
   a picker whose run the provider refused after credits were held. Schemas are
   copied from live ModelPricing rows (2026-09-21). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alsoOfferedInVideoMode, aspectRatiosFromFields, durationRangeFromFields, lastFrameFieldFrom,
  maxImagesFromFields, requiresField, resolutionsFromFields, videoEditPool,
} from "@/components/studio/useModelCatalog";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

describe("duration", () => {
  it("a min..max range becomes a control instead of nothing (pixverse: 1-15)", () => {
    expect(durationRangeFromFields({ duration: { type: "number", minimum: 1, maximum: 15 } })).toEqual({ min: 1, max: 15, default: 5 });
  });
  it("uses the model's own default when it sits inside the range", () => {
    expect(durationRangeFromFields({ duration: { type: "number", minimum: 2, maximum: 15, default: 8 } }).default).toBe(8);
  });
  it("starts at the minimum when five seconds is not on offer (grok: 6-30)", () => {
    expect(durationRangeFromFields({ duration: { type: "number", minimum: 6, maximum: 30 } })).toEqual({ min: 6, max: 30, default: 6 });
  });
  it("never offers a sentinel as a length: seedance-2.5's -1 and wan edit's 0 clamp to one second", () => {
    expect(durationRangeFromFields({ duration: { type: "number", minimum: -1, maximum: 30, default: 5 } })).toEqual({ min: 1, max: 30, default: 5 });
    expect(durationRangeFromFields({ duration: { type: "number", minimum: 0, maximum: 10, default: 0 } })).toEqual({ min: 1, max: 10, default: 5 });
  });
  it("fixed lengths are not a range, and neither is a string enum", () => {
    expect(durationRangeFromFields({ duration: { type: "number", enum: [5, 10] } })).toBeNull();
    expect(durationRangeFromFields({ duration: { type: "string", enum: ["5", "10"] } })).toBeNull();
    expect(durationRangeFromFields({})).toBeNull();
  });
});

describe("resolution and ratio", () => {
  it("reads pixverse's resolution from `quality`", () => {
    expect(resolutionsFromFields({ quality: { enum: ["360p", "540p", "720p", "1080p"] } })).toEqual(["360p", "540p", "720p", "1080p"]);
  });
  it("never mistakes an image QUALITY TIER for a resolution", () => {
    expect(resolutionsFromFields({ quality: { enum: ["basic", "high"] } })).toEqual([]);
    expect(resolutionsFromFields({ quality: { enum: ["medium", "high"] } })).toEqual([]);
  });
  it("prefers a real resolution field over quality", () => {
    expect(resolutionsFromFields({ resolution: { enum: ["720p", "1080p"] }, quality: { enum: ["360p"] } })).toEqual(["720p", "1080p"]);
  });
  it("reads wan 2.7's aspect ratio from `ratio`", () => {
    expect(aspectRatiosFromFields({ ratio: { enum: ["16:9", "9:16"] } })).toEqual(["16:9", "9:16"]);
    expect(aspectRatiosFromFields({ prompt: {} })).toEqual([]);
  });
  it("the studios show no fallback ratios, lengths or resolutions a model would ignore", () => {
    for (const file of ["VideoStudio.js", "VideoEditStudio.js", "MarketingStudio.js"]) {
      const src = read(`src/components/studio/${file}`);
      expect(src, file).not.toMatch(/FALLBACK_(RATIOS|DURATIONS|RES)\s*=/);
    }
  });
});

describe("image inputs", () => {
  it("counts the three families that were invisible", () => {
    expect(maxImagesFromFields({ prompt: {}, input_urls: { type: "array" } })).toBeGreaterThan(0);       // flux-2, gpt-image, seedance 1.5
    expect(maxImagesFromFields({ prompt: {}, image_references: { type: "array" } })).toBeGreaterThan(0); // pixverse r2v
    expect(maxImagesFromFields({ prompt: {}, first_frame_url: {}, last_frame_url: {} })).toBe(1);        // minimax-h3, wan 2.7
  });
  it("finds the last-frame field under each family's spelling, and only when there is one", () => {
    expect(lastFrameFieldFrom({ first_frame_url: {}, last_frame_url: {} })).toBe("last_frame_url");
    expect(lastFrameFieldFrom({ image_url: {}, end_image_url: {} })).toBe("end_image_url");
    expect(lastFrameFieldFrom({ image_url: {}, tail_image_url: {} })).toBe("tail_image_url");
    expect(lastFrameFieldFrom({ last_frame_image_url: {} })).toBe("last_frame_image_url");
    expect(lastFrameFieldFrom({ image_urls: {}, prompt: {} })).toBeNull();
  });
  it("a model that REQUIRES its last frame (pixverse transition) cannot be run without one", () => {
    const src = read("src/components/studio/VideoStudio.js");
    expect(src).toContain("requiresField(model, model.lastFrameField)");
    expect(src).toContain("(needsLastFrame && !endFrame?.url)");
    expect(requiresField({ schema: { fields: { last_frame_image_url: { required: true } } } }, "last_frame_image_url")).toBe(true);
    expect(requiresField({ schema: { fields: { last_frame_url: { required: false } } } }, "last_frame_url")).toBe(false);
  });
  it("VideoStudio gates the anchor on it and always sends `last_frame_url`", () => {
    const src = read("src/components/studio/VideoStudio.js");
    expect(src).toContain("!!model?.lastFrameField");
    expect(src).toContain("if (canPinLastFrame && endFrame?.url) params.last_frame_url = endFrame.url;");
    expect(src).not.toContain("first_frame_url = startFrame");
  });
});

describe("video pickers", () => {
  const seedance2 = { id: "bytedance/seedance-2", capability: "video", maxImages: 4, fieldNames: ["prompt", "reference_image_urls", "first_frame_url"] };
  const veo = { id: "generate-veo-3-video", capability: "video", maxImages: 4, fieldNames: ["prompt", "image_urls"] };
  const textOnly = { id: "some/text-video", capability: "video", maxImages: 0, fieldNames: ["prompt"] };
  const wanT2v = { id: "wan/2-7-text-to-video", capability: "text-to-video", maxImages: 0, fieldNames: ["prompt", "ratio"] };

  it("Image to Video also offers coarse video models that take a still", () => {
    expect(alsoOfferedInVideoMode(seedance2, "i2v")).toBe(true);
    expect(alsoOfferedInVideoMode(veo, "i2v")).toBe(true);
    expect(alsoOfferedInVideoMode(textOnly, "i2v")).toBe(false);
    expect(alsoOfferedInVideoMode(wanT2v, "i2v")).toBe(false);
  });
  it("Cast also offers the ones that declare reference_image_urls", () => {
    expect(alsoOfferedInVideoMode(seedance2, "cast")).toBe(true);
    expect(alsoOfferedInVideoMode(veo, "cast")).toBe(false);
  });
  it("adds, never removes: Text to Video is untouched", () => {
    for (const m of [seedance2, veo, textOnly, wanT2v]) expect(alsoOfferedInVideoMode(m, "ttv")).toBe(false);
  });
  it("Cast names the reference field from the model's schema, not from its id", () => {
    const src = read("src/components/studio/VideoStudio.js");
    expect(src).toContain('declares("reference_image_urls")');
    expect(src).not.toMatch(/\/pixverse\/\.test\(id\)/);
  });
});

describe("camera move", () => {
  const src = read("src/components/studio/VideoStudio.js");
  it("is direction in the brief — `camera_motion` is a field no model has", () => {
    expect(src).not.toContain("params.camera_motion");
    expect(src).toContain("prompt: withCameraMove(prompt, move)");
  });
  it("every move but Static carries words, and Static carries none", () => {
    const block = src.slice(src.indexOf("const MOVES = ["), src.indexOf("export function withCameraMove"));
    const briefs = [...block.matchAll(/value: "(\w+)".*?brief: "([^"]*)"/g)].map((m) => [m[1], m[2]]);
    expect(briefs.length).toBe(4);
    for (const [value, brief] of briefs) expect(brief === "", value).toBe(value === "static");
  });
});

describe("video edit jobs", () => {
  const field = (required) => ({ type: "string", required });
  const row = (id, capability, fields = {}) => ({ id, capability, schema: { fields } });
  const MODELS = [
    row("wan/2-7-videoedit", "video-to-video", { video_url: field(true) }),
    row("happyhorse/video-edit", "video-to-video", { video_url: field(true) }),
    row("generate-aleph-video", "video-to-video", { video_url: field(true) }),
    row("pixverse-v6/extend", "video-to-video", { video_url: field(false), taskId: field(false) }),
    row("grok-imagine/extend", "video-to-video", { task_id: field(true), extend_times: field(true) }),
    row("ai-clipping", "video-to-video", { video_url: field(true) }),
    row("topaz/video-upscale", "video-upscale", { video_url: field(true) }),
    row("kling-3.0/motion-control", "recast", { input_urls: field(true), video_urls: field(true) }),
  ];
  const ids = (job) => videoEditPool(MODELS, job).map((m) => m.id);

  it("Restyle offers restylers only — no extender, no upscaler, no clipping engine", () => {
    expect(ids("restyle")).toEqual(["wan/2-7-videoedit", "happyhorse/video-edit", "generate-aleph-video"]);
  });
  it("Extend offers extenders only", () => {
    expect(ids("extend")).toEqual(["pixverse-v6/extend"]);
  });
  it("Upscale is its own job", () => {
    expect(ids("upscale")).toEqual(["topaz/video-upscale"]);
  });
  it("Recast is its own capability", () => {
    expect(ids("recast")).toEqual(["kling-3.0/motion-control"]);
  });
  it("a model that REQUIRES a provider-side task_id is offered nowhere — an upload cannot satisfy it", () => {
    expect(requiresField(MODELS[4], "task_id")).toBe(true);
    for (const job of ["restyle", "extend", "upscale", "recast"]) expect(ids(job)).not.toContain("grok-imagine/extend");
  });
  it("no model is offered under two jobs", () => {
    const all = ["restyle", "extend", "upscale", "recast"].flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
  });

  const src = read("src/components/studio/VideoEditStudio.js");
  it("has no Retime job: it only appended words to a restyle prompt", () => {
    const jobs = src.slice(src.indexOf("const JOBS = {"), src.indexOf("const ORIENTATIONS"));
    expect(jobs).not.toMatch(/^\s*retime:/m);
    expect(jobs).toMatch(/^\s*upscale:/m);
    expect(src).not.toContain("const SPEEDS");
  });
  it("the upscaler is never asked for a prompt", () => {
    expect(src).toContain("if (!upscaling) params.prompt = prompt.trim();");
    expect(src).toContain("recasting ? recastDock : upscaling ? upscaleDock :");
  });
  it("quotes recast with the very params it submits", () => {
    expect(src).toContain("recasting ? recastParams || {} : editParams");
    expect(src).toContain("const params = { ...recastParams };");
  });
});

describe("marketing", () => {
  const src = read("src/components/studio/MarketingStudio.js");
  it("the campaign format is in the brief, not a `campaign_format` param", () => {
    const submit = src.slice(src.indexOf("const generate = useCallback"), src.indexOf("/* ── Controls"));
    expect(submit).not.toContain("campaign_format");
    expect(submit).toContain("chosenFormat.prompt");
  });
  it("offers no image-to-video model: it never collects a source still", () => {
    expect(src).not.toContain('matchesGroup(m, "i2v")');
    expect(src).toContain('matchesGroup(m, "ttv")');
  });
  it("sends references only to a model that has somewhere to put them, and quotes what it sends", () => {
    expect(src).toContain("if (maxRefs > 0 && references.length) out.images_list = references.slice(0, maxRefs);");
    expect(src).toContain('useCreditCost("marketing", model?.id || "", settings)');
    expect(src).toContain("...settings,");
  });
});
