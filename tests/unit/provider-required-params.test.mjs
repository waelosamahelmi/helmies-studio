// BUG 2 — required provider parameters were never sent.
//
// Production evidence (live KIE probes, 2026-08-04, prompt-only payload):
//   flux-2/pro-text-to-image  → {"code":500,"msg":"aspect_ratio is required"}
//   flux-2/flex-text-to-image → succeeds (it does not require one)
//   elevenlabs/…-turbo-2-5    → {"code":500,"msg":"text is required"}
// Every payload builder in the app copied across only what the caller passed,
// so a model whose provider requires a field the studio leaves blank could
// never be submitted. src/lib/provider-payload-core.mjs is the single place
// that gap is closed, and src/lib/providers.js's submitOnly — the one choke
// point every studio AND agent submit passes through — applies it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyRequiredDefaults, defaultForField, providerRequiredFields, FILLABLE_FIELDS,
} from "@/lib/provider-payload-core.mjs";
import { defaultSchemaForCapability } from "@/lib/model-catalog-core.mjs";

describe("applyRequiredDefaults — fills a required field from the schema", () => {
  it("fills a required aspect_ratio from the field's own enum", () => {
    const schema = { fields: { prompt: { type: "string", required: true }, aspect_ratio: { type: "string", required: true, enum: ["1:1", "16:9", "9:16"] } } };
    const { params, filled } = applyRequiredDefaults({ prompt: "a cat" }, schema);
    expect(params.aspect_ratio).toBe("16:9");
    expect(filled).toEqual({ aspect_ratio: "16:9" });
  });

  it("fills a required resolution from the field's own enum (first entry, the cheapest)", () => {
    const schema = { fields: { resolution: { type: "string", required: true, enum: ["480p", "720p", "1080p"] } } };
    const { params } = applyRequiredDefaults({}, schema);
    expect(params.resolution).toBe("480p");
  });

  it("fills a required duration from the field's own enum", () => {
    const schema = { fields: { duration: { type: "number", required: true, enum: [5, 8, 10] } } };
    const { params } = applyRequiredDefaults({}, schema);
    expect(params.duration).toBe(5);
  });

  it("prefers an explicit `default` over the enum", () => {
    const schema = { fields: { resolution: { type: "string", required: true, enum: ["480p", "720p"], default: "720p" } } };
    expect(applyRequiredDefaults({}, schema).params.resolution).toBe("720p");
  });

  it("uses the canonical 16:9 only when the enum actually offers it", () => {
    const offered = { fields: { aspect_ratio: { type: "string", required: true, enum: ["1:1", "4:3", "16:9"] } } };
    expect(applyRequiredDefaults({}, offered).params.aspect_ratio).toBe("16:9");

    const notOffered = { fields: { aspect_ratio: { type: "string", required: true, enum: ["21:9", "1:1"] } } };
    expect(applyRequiredDefaults({}, notOffered).params.aspect_ratio).toBe("21:9");
  });

  it("falls back to a numeric minimum when there is no enum and no default", () => {
    const schema = { fields: { duration: { type: "number", required: true, minimum: 2, maximum: 30 } } };
    expect(applyRequiredDefaults({}, schema).params.duration).toBe(2);
  });
});

describe("applyRequiredDefaults — never overrides a caller-supplied value", () => {
  it("leaves an explicit aspect_ratio alone", () => {
    const schema = { fields: { aspect_ratio: { type: "string", required: true, enum: ["1:1", "16:9"] } } };
    const { params, filled } = applyRequiredDefaults({ aspect_ratio: "1:1" }, schema);
    expect(params.aspect_ratio).toBe("1:1");
    expect(filled).toEqual({});
  });

  it("leaves a falsy-but-meaningful value alone (duration 0 / prompt_extend false)", () => {
    const schema = { fields: { duration: { type: "number", required: true, enum: [5, 10] }, prompt_extend: { type: "boolean", required: true } } };
    const { params, filled } = applyRequiredDefaults({ duration: 0, prompt_extend: false }, schema);
    expect(params.duration).toBe(0);
    expect(params.prompt_extend).toBe(false);
    expect(filled).toEqual({});
  });

  it("does not mutate the params object it was given", () => {
    const schema = { fields: { aspect_ratio: { type: "string", required: true, enum: ["16:9"] } } };
    const original = { prompt: "a cat" };
    applyRequiredDefaults(original, schema);
    expect(original).toEqual({ prompt: "a cat" });
  });
});

describe("applyRequiredDefaults — never invents content", () => {
  it("does not fabricate a prompt, image_url, video_url or audio_url", () => {
    const schema = {
      fields: {
        prompt: { type: "string", required: true },
        image_url: { type: "string", required: true, format: "uri" },
        video_url: { type: "string", required: true, format: "uri" },
        audio_url: { type: "string", required: true, format: "uri" },
      },
    };
    const { params, filled } = applyRequiredDefaults({}, schema);
    expect(params).toEqual({});
    expect(filled).toEqual({});
  });

  it("never fills a seed (that would pin every generation to one output)", () => {
    expect(FILLABLE_FIELDS.has("seed")).toBe(false);
    const { params } = applyRequiredDefaults({}, { fields: { seed: { type: "number", required: true, minimum: 1 } } });
    expect(params.seed).toBeUndefined();
  });

  it("skips a required setting whose schema offers no value at all", () => {
    const { params } = applyRequiredDefaults({}, { fields: { quality: { type: "string", required: true } } });
    expect(params.quality).toBeUndefined();
  });

  it("is a no-op for a null/absent schema", () => {
    expect(applyRequiredDefaults({ prompt: "x" }, null).params).toEqual({ prompt: "x" });
    expect(applyRequiredDefaults({ prompt: "x" }, {}).filled).toEqual({});
  });
});

describe("providerRequiredFields — fields the provider requires but the schema calls optional", () => {
  it("knows flux-2/pro-text-to-image requires aspect_ratio (observed 500 'aspect_ratio is required')", () => {
    expect(providerRequiredFields("flux-2/pro-text-to-image", null)).toContain("aspect_ratio");
  });

  it("fills it even though defaultSchemaForCapability marks aspect_ratio optional", () => {
    const schema = defaultSchemaForCapability("text-to-image");
    expect(schema.fields.aspect_ratio.required).toBe(false);
    const { params, filled } = applyRequiredDefaults({ prompt: "a cat" }, schema, { modelId: "flux-2/pro-text-to-image" });
    expect(schema.fields.aspect_ratio.enum).toContain(params.aspect_ratio);
    expect(filled.aspect_ratio).toBeTruthy();
  });

  it("leaves the sibling flux-2/flex-text-to-image untouched — it does not require one", () => {
    const schema = defaultSchemaForCapability("text-to-image");
    const { filled } = applyRequiredDefaults({ prompt: "a cat" }, schema, { modelId: "flux-2/flex-text-to-image" });
    expect(filled).toEqual({});
  });

  it("knows kling-3.0/video requires `sound` (observed nameless 500 'This field is required', probe 2026-08-05)", () => {
    expect(providerRequiredFields("kling-3.0/video", null)).toContain("sound");
    // A follow-up probe WITH sound failed identically, so the remaining
    // doc-listed rendering settings are treated as required too.
    // ...and probe round 3 named the last one: "multi_shots cannot be empty".
    expect(providerRequiredFields("kling-3.0/video", null)).toEqual(expect.arrayContaining(["aspect_ratio", "mode", "multi_shots"]));
    expect(FILLABLE_FIELDS.has("multi_shots")).toBe(true);
    expect(providerRequiredFields("pixverse-v6/text-to-video", null)).toContain("aspect_ratio");
    // …and the curated schema's required+default(false) means it actually
    // gets filled on a prompt-only submit rather than 500ing.
    const schema = { fields: { sound: { type: "boolean", required: true, default: false }, mode: { type: "string", enum: ["std", "pro", "4K"] } } };
    const { params, filled } = applyRequiredDefaults({ prompt: "x" }, schema, { modelId: "kling-3.0/video" });
    expect(params.sound).toBe(false);
    // aspect_ratio (canonical 16:9) and mode (enum's first entry, std) are
    // filled too — the follow-up probe proved sound alone is not enough.
    expect(filled).toEqual({ sound: false, aspect_ratio: "16:9", mode: "std" });
  });

  it("knows pixverse-v6/text-to-video requires `quality` (same nameless 500, probe 2026-08-05)", () => {
    expect(providerRequiredFields("pixverse-v6/text-to-video", null)).toContain("quality");
    const schema = { fields: { quality: { type: "string", required: true, enum: ["360p", "540p", "720p", "1080p"], default: "720p" } } };
    const { params } = applyRequiredDefaults({ prompt: "x" }, schema, { modelId: "pixverse-v6/text-to-video" });
    expect(params.quality).toBe("720p");
  });

  it("reads a field the verification sweep recorded on the row (inputSchema.providerRequired)", () => {
    const schema = { fields: { resolution: { type: "string", required: false, enum: ["720p", "1080p"] } }, providerRequired: ["resolution"] };
    expect(applyRequiredDefaults({}, schema).params.resolution).toBe("720p");
  });

  it("still never invents content for a sweep-recorded content field", () => {
    const schema = { fields: {}, providerRequired: ["image_url"] };
    expect(applyRequiredDefaults({}, schema).params.image_url).toBeUndefined();
  });
});

describe("defaultForField", () => {
  it("returns undefined when it has nothing to go on", () => {
    expect(defaultForField("quality", { type: "string" })).toBeUndefined();
  });

  it("falls back to the canonical default when the field itself is unknown", () => {
    expect(defaultForField("aspect_ratio", undefined)).toBe("16:9");
  });
});

// ── The single choke point: submitOnly applies it for BOTH paths ───────────
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { modelPricing: { findUnique: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

describe("submitOnly fills required params for every caller (studio and agent alike)", () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KIE_KEY = "test-key";
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 200, msg: "success", data: { taskId: "task-1" } }),
      text: () => Promise.resolve("{}"),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KIE_KEY;
  });

  function sentBody() {
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  }

  it("sends the required aspect_ratio flux-2/pro rejects the submit without", async () => {
    prismaMock.modelPricing.findUnique.mockResolvedValue({
      modelId: "flux-2/pro-text-to-image",
      inputSchema: { fields: { prompt: { type: "string", required: true }, aspect_ratio: { type: "string", required: true, enum: ["1:1", "16:9"] } } },
    });
    const { submitOnly } = await import("@/lib/providers.js");
    await submitOnly("kie", "flux-2/pro-text-to-image", { model: "flux-2/pro-text-to-image", prompt: "a cat" });
    expect(sentBody().input.aspect_ratio).toBe("16:9");
  });

  it("keeps the caller's own aspect_ratio", async () => {
    prismaMock.modelPricing.findUnique.mockResolvedValue({
      modelId: "flux-2/pro-text-to-image",
      inputSchema: { fields: { aspect_ratio: { type: "string", required: true, enum: ["1:1", "16:9"] } } },
    });
    const { submitOnly } = await import("@/lib/providers.js");
    await submitOnly("kie", "flux-2/pro-text-to-image", { model: "flux-2/pro-text-to-image", prompt: "a cat", aspect_ratio: "9:16" });
    expect(sentBody().input.aspect_ratio).toBe("9:16");
  });

  it("submits unchanged when the catalog lookup fails — a DB hiccup must never block a generation", async () => {
    prismaMock.modelPricing.findUnique.mockRejectedValue(new Error("db down"));
    const { submitOnly } = await import("@/lib/providers.js");
    await submitOnly("kie", "some-model", { model: "some-model", prompt: "a cat" });
    expect(sentBody().input).toEqual({ prompt: "a cat" });
  });
});
