/* The studios speak one vocabulary and the models speak thirty. These schemas
   are copied from live ModelPricing rows (2026-09-21); each case is a run that
   either 422'd in validateModelInput or reached the provider without its image. */
import { describe, expect, it } from "vitest";
import { adaptInputsToSchema, applyRequiredDefaults } from "../../src/lib/provider-payload-core.mjs";
import { validateModelInput } from "../../src/lib/model-catalog-core.mjs";

const str = (extra = {}) => ({ type: "string", required: false, ...extra });
const arr = (extra = {}) => ({ type: "array", required: false, ...extra });
const PROMPT = { type: "string", required: true };
const IMG = "https://cdn/a.png";
const END = "https://cdn/z.png";

const adapt = (params, fields, opts) => adaptInputsToSchema(params, { fields }, opts).params;

describe("the source image reaches whichever field the model calls it", () => {
  it("image_url → image_urls (grok, kling 2.6, wan 2.6, pixverse i2v)", () => {
    expect(adapt({ image_url: IMG }, { prompt: PROMPT, image_urls: arr({ required: true }) })).toEqual({ image_urls: [IMG] });
  });
  it("image_url → input_urls (flux-2, gpt-image edit)", () => {
    expect(adapt({ image_url: IMG }, { prompt: PROMPT, input_urls: arr() })).toEqual({ input_urls: [IMG] });
  });
  it("image_url → image (recraft: a real one-field schema, not a placeholder)", () => {
    expect(adapt({ image_url: IMG }, { image: str({ required: true }) })).toEqual({ image: IMG });
  });
  it("image_url → first_frame_url when the model has no image_url (minimax-h3, wan 2.7)", () => {
    expect(adapt({ image_url: IMG }, { prompt: PROMPT, first_frame_url: str(), last_frame_url: str() })).toEqual({ first_frame_url: IMG });
  });
  it("falls back to the reference array when that is the model's only image slot (seedance 2.5)", () => {
    expect(adapt({ image_url: IMG }, { prompt: PROMPT, reference_image_urls: arr() })).toEqual({ reference_image_urls: [IMG] });
  });
  it("respects maxItems when a list lands in an array field", () => {
    expect(adapt({ images_list: ["a", "b", "c"] }, { prompt: PROMPT, image_input: arr({ maxItems: 2 }) })).toEqual({ image_input: ["a", "b"] });
  });
  it("an array arriving at a single-value field sends the first item", () => {
    expect(adapt({ image_urls: [IMG, END] }, { prompt: PROMPT, image_url: str() })).toEqual({ image_url: IMG });
  });
});

describe("frames and clips", () => {
  it("last_frame_url → tail_image_url (kling 2.5 turbo) / end_image_url (hailuo, seedance v1)", () => {
    expect(adapt({ image_url: IMG, last_frame_url: END }, { image_url: str(), tail_image_url: str() })).toEqual({ image_url: IMG, tail_image_url: END });
    expect(adapt({ image_url: IMG, last_frame_url: END }, { image_url: str(), end_image_url: str() })).toEqual({ image_url: IMG, end_image_url: END });
  });
  it("video_url → video_urls (wan 2.6 v2v, kling motion-control)", () => {
    expect(adapt({ video_url: "https://cdn/v.mp4" }, { prompt: PROMPT, video_urls: arr({ required: true }) })).toEqual({ video_urls: ["https://cdn/v.mp4"] });
  });
});

describe("framing", () => {
  it("aspect_ratio → ratio (wan 2.7 t2v)", () => {
    expect(adapt({ aspect_ratio: "9:16" }, { prompt: PROMPT, ratio: str({ enum: ["16:9", "9:16"] }) })).toEqual({ ratio: "9:16" });
  });
  it("9:16 is portrait_16_9 — the long side is named first", () => {
    const image_size = str({ enum: ["square", "square_hd", "portrait_16_9", "landscape_16_9"] });
    expect(adapt({ aspect_ratio: "9:16" }, { prompt: PROMPT, image_size })).toEqual({ image_size: "portrait_16_9" });
    expect(adapt({ aspect_ratio: "16:9" }, { prompt: PROMPT, image_size })).toEqual({ image_size: "landscape_16_9" });
    expect(adapt({ aspect_ratio: "1:1" }, { prompt: PROMPT, image_size })).toEqual({ image_size: "square_hd" });
  });
  it("an image_size with NO stored enum still gets the orientation words (qwen)", () => {
    expect(adapt({ aspect_ratio: "16:9" }, { prompt: PROMPT, image_size: str() })).toEqual({ image_size: "landscape_16_9" });
  });
  it("a translated shape the model does not offer is dropped, so its own default applies", () => {
    expect(adapt({ aspect_ratio: "21:9" }, { prompt: PROMPT, image_size: str({ enum: ["square", "landscape_16_9"] }) })).toEqual({});
  });
  it("resolution → quality (pixverse)", () => {
    expect(adapt({ resolution: "720p" }, { prompt: PROMPT, quality: str({ enum: ["360p", "720p"] }) })).toEqual({ quality: "720p" });
  });
});

describe("types", () => {
  const stringDuration = { prompt: PROMPT, duration: str({ enum: ["5", "10"] }) };
  it("Number(duration) → the string enum 22 video models declare — and it now VALIDATES", () => {
    expect(validateModelInput({ fields: stringDuration }, { prompt: "x", duration: 5 })).not.toEqual([]);
    const params = adapt({ prompt: "x", duration: 5 }, stringDuration);
    expect(params.duration).toBe("5");
    expect(validateModelInput({ fields: stringDuration }, params)).toEqual([]);
  });
  it("a length the model does not offer runs at the nearest one it does", () => {
    expect(adapt({ duration: 5 }, { prompt: PROMPT, duration: { type: "number", enum: [6, 10] } }).duration).toBe(6);
  });
  it("a positive length outside a min..max range runs at the nearest end (grok: 6-30s, asked 5)", () => {
    const fields = { prompt: PROMPT, duration: { type: "number", minimum: 6, maximum: 30 } };
    expect(adapt({ duration: 5 }, fields).duration).toBe(6);
    expect(adapt({ duration: 45 }, fields).duration).toBe(30);
    expect(adapt({ duration: 0 }, fields).duration).toBe(0);
  });
  it("sentinels are not lengths: 0 and -1 are never snapped", () => {
    expect(adapt({ duration: -1 }, { prompt: PROMPT, duration: { type: "number", enum: [5, 10] } }).duration).toBe(-1);
  });
});

describe("the three rules", () => {
  it("1 — a value already in a declared field is never moved", () => {
    const fields = { prompt: PROMPT, image_url: str(), image_urls: arr() };
    expect(adapt({ image_url: IMG }, fields)).toEqual({ image_url: IMG });
  });
  it("1 — a directly named value outside the enum is left for validation to report, not swapped", () => {
    expect(adapt({ aspect_ratio: "9:16" }, { prompt: PROMPT, aspect_ratio: str({ enum: ["1:1", "16:9"] }) })).toEqual({ aspect_ratio: "9:16" });
  });
  it("2 — nothing is invented: no image in, no image out", () => {
    expect(adapt({ prompt: "x" }, { prompt: PROMPT, image_urls: arr({ required: true }) })).toEqual({ prompt: "x" });
  });
  it("2 — a filled target is never overwritten", () => {
    expect(adapt({ image_url: IMG, image_urls: [END] }, { prompt: PROMPT, image_urls: arr() })).toEqual({ image_urls: [END] });
  });
  it("3 — studio words the model never declared are dropped (KIE 500s on an unknown input key)", () => {
    const out = adapt({ prompt: "x", camera_motion: "dolly", negative_prompt: "blurry", resolution: "1K" }, { prompt: PROMPT, seed: { type: "number" } });
    expect(out).toEqual({ prompt: "x" });
  });
  it("3 — words this module does not know are kept: dedicated builders read their own", () => {
    const out = adapt({ prompt: "x", title: "Anthem", customMode: true, callBackUrl: "u" }, { prompt: PROMPT, style: str() });
    expect(out).toEqual({ prompt: "x", title: "Anthem", customMode: true, callBackUrl: "u" });
  });
  it("a provider-required field counts as declared even when the schema omits it (minimax-h3)", () => {
    const schema = { fields: { prompt: PROMPT, first_frame_url: str() }, providerRequired: ["aspect_ratio"] };
    const { params, filled } = applyRequiredDefaults({ image_url: IMG, aspect_ratio: "9:16" }, schema);
    expect(params).toEqual({ first_frame_url: IMG, aspect_ratio: "9:16" });
    expect(filled).toEqual({});
  });
  it("a `{ prompt }`-only schema is a placeholder: the payload passes through untouched", () => {
    const params = { prompt: "x", image_url: IMG, duration: 5 };
    expect(adapt(params, { prompt: PROMPT })).toEqual(params);
  });
  it("never mutates its input", () => {
    const params = { image_url: IMG, duration: 5 };
    adapt(params, { prompt: PROMPT, image_urls: arr(), duration: str({ enum: ["5"] }) });
    expect(params).toEqual({ image_url: IMG, duration: 5 });
  });
});
