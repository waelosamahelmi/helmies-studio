import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// URGENT production fix — kie-sync.js used to write
// `${model.displayName} via the KIE Market API.` into every synced row's
// description, which is the one field every end user actually reads (even
// after providerName was hidden from the public catalog response). Measured
// on live production: 35 of 39 image-model descriptions plainly named
// "KIE". The sync has no genuinely useful description text available from
// the sitemap crawl, so it must write null instead of inventing/leaking
// anything — the UI already has an empty-state for a missing description
// (src/app/models/ModelsClient.js).
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    modelPricing: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

import { syncKieModels, CURATED_SCHEMAS } from "@/lib/kie-sync";
import { defaultSchemaForCapability } from "@/lib/model-catalog-core.mjs";

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/market/nano-banana-pro/text-to-image</loc></url>
</urlset>`;

describe("syncKieModels — description must never leak the upstream provider identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SITEMAP_XML) }),
    );
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes a description with no provider token for a newly-added model (prefers null over inventing text)", async () => {
    const result = await syncKieModels();

    expect(result.added).toBe(1);
    expect(prismaMock.modelPricing.create).toHaveBeenCalledTimes(1);
    const [{ data }] = prismaMock.modelPricing.create.mock.calls[0];
    expect(data.description).toBeNull();
    expect(data.description == null || !/kie/i.test(data.description)).toBe(true);
  });

  it("also writes no provider token in the description when updating an already-existing row", async () => {
    prismaMock.modelPricing.findMany.mockResolvedValueOnce([
      { modelId: "nano-banana-pro/text-to-image", isActive: true },
    ]);

    const result = await syncKieModels();

    expect(result.updated).toBe(1);
    expect(prismaMock.modelPricing.update).toHaveBeenCalledTimes(1);
    const [{ data }] = prismaMock.modelPricing.update.mock.calls[0];
    expect(data.description).toBeNull();
  });
});

// ── EDITSv1 E1.2: honest per-model schemas ─────────────────────────────────
// defaultSchemaForCapability("audio") is `{ prompt }` and nothing else, so
// every Suno music model's style/title/instrumental/vocal_gender/
// negative_tags controls — and every ElevenLabs voice/stability control —
// never rendered: the studios gate controls on the model's own schema
// fields (the only capability signal the public catalog emits). The curated
// map ports the REAL parameter flags from src/lib/models.js's Suno and
// ElevenLabs entries; it must never invent a parameter KIE doesn't accept.
const CURATED_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/suno-api/generate-music</loc></url>
  <url><loc>https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5</loc></url>
  <url><loc>https://docs.kie.ai/market/nano-banana-pro/text-to-image</loc></url>
</urlset>`;

describe("syncKieModels — curated schemas expose each model's real parameters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CURATED_SITEMAP_XML) }),
    );
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createdRow(modelId) {
    const call = prismaMock.modelPricing.create.mock.calls.find(([{ data }]) => data.modelId === modelId);
    expect(call, `expected a create for ${modelId}`).toBeTruthy();
    return call[0].data;
  }

  it("a Suno music model's schema carries its real style/title/instrumental/vocal_gender/negative_tags/duration fields, on top of the generic prompt", async () => {
    await syncKieModels();
    const row = createdRow("generate-music");
    const fields = row.inputSchema.fields;
    expect(fields.prompt).toBeTruthy();
    expect(fields.style).toMatchObject({ type: "string" });
    expect(fields.title).toMatchObject({ type: "string" });
    expect(fields.instrumental).toMatchObject({ type: "boolean" });
    expect(fields.vocal_gender).toMatchObject({ type: "string", enum: ["m", "f"] });
    expect(fields.negative_tags).toMatchObject({ type: "string" });
    expect(fields.duration).toMatchObject({ type: "number", enum: [30, 60, 120, 180, 240] });
  });

  it("an ElevenLabs TTS model's schema carries voice/stability/similarity_boost/speed — matched even though the DB id spells the version differently than the curated key", async () => {
    await syncKieModels();
    const row = createdRow("elevenlabs/text-to-speech-turbo-2-5");
    const fields = row.inputSchema.fields;
    expect(fields.prompt).toBeTruthy();
    expect(fields.voice).toMatchObject({ type: "string" });
    expect(fields.stability).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
    expect(fields.similarity_boost).toMatchObject({ type: "number", minimum: 0, maximum: 1 });
    expect(fields.speed).toMatchObject({ type: "number" });
  });

  it("a non-curated model keeps the plain generic schema for its capability — no invented fields", async () => {
    await syncKieModels();
    const row = createdRow("nano-banana-pro/text-to-image");
    expect(row.inputSchema).toEqual(defaultSchemaForCapability("text-to-image"));
  });

  it("CURATED_SCHEMAS only ever ADDS fields over the generic default — the generic prompt field always survives", () => {
    for (const [modelId, entry] of Object.entries(CURATED_SCHEMAS)) {
      expect(entry.fields, `${modelId} curated entry must declare fields`).toBeTruthy();
      expect(entry.fields.prompt, `${modelId} must not override the prompt field`).toBeUndefined();
    }
  });
});

// ── BUG FIX: video generators filed as image models ────────────────────────
// Measured on live production (2026-08-05): generate-ai-video, generate-
// aleph-video, generate-veo-3-video were ACTIVE with modelType "image" /
// capability "text-to-image". Root cause: these are pages under KIE's
// "legacy suite" doc paths (runway-api/, veo3-api/) that never go through
// inferKieModelFromUrl at all — capability instead fell to this file's own,
// older inferModelType() type-table, which has no bare "video" keyword case
// and silently defaults every unmatched id to "image".
const VIDEO_LEGACY_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/runway-api/generate-ai-video</loc></url>
  <url><loc>https://docs.kie.ai/runway-api/generate-aleph-video</loc></url>
  <url><loc>https://docs.kie.ai/veo3-api/generate-veo-3-video</loc></url>
  <url><loc>https://docs.kie.ai/4o-image-api/generate-4-o-image</loc></url>
  <url><loc>https://docs.kie.ai/suno-api/create-music-video</loc></url>
</urlset>`;

describe("syncKieModels — legacy-suite video generators resolve to the video capability, not image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(VIDEO_LEGACY_SITEMAP_XML) }));
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllGlobals());

  function createdRow(modelId) {
    const call = prismaMock.modelPricing.create.mock.calls.find(([{ data }]) => data.modelId === modelId);
    expect(call, `expected a create for ${modelId}`).toBeTruthy();
    return call[0].data;
  }

  it("writes capability=text-to-video / modelType=video for all three real video generators", async () => {
    await syncKieModels();
    for (const id of ["generate-ai-video", "generate-aleph-video", "generate-veo-3-video"]) {
      const row = createdRow(id);
      expect(row.capability, `${id} capability`).toBe("text-to-video");
      expect(row.modelType, `${id} modelType`).toBe("video");
    }
  });

  it("leaves a genuine image endpoint under the same legacy-suite family untouched", async () => {
    await syncKieModels();
    const row = createdRow("generate-4-o-image");
    expect(row.capability).toBe("text-to-image");
    expect(row.modelType).toBe("image");
  });

  it("leaves a music-video id classified as audio, never swept up by the trailing '-video' fix", async () => {
    await syncKieModels();
    const row = createdRow("create-music-video");
    expect(row.capability).toBe("audio");
    expect(row.modelType).toBe("audio");
  });
});
