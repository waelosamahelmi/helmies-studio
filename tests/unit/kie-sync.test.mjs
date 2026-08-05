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

// ── M1 fix C: vendors the sync silently dropped ────────────────────────────
// video-market.md root cause #10: inferModelType's "gemini"/"grok" substring
// check typed the gemini-omni-* MEDIA pages (and grok-imagine/extend) as
// "llm", and fetchKieModels unconditionally skips "llm" — so these real,
// documented generation models never entered the catalog on ANY sync run.
// MEDIA_EXCEPTIONS (model-catalog-core.mjs) is now consulted by BOTH paths.
// The sitemap below uses the REAL production URLs (verified against the live
// https://docs.kie.ai/sitemap.xml on 2026-08-05).
const DROPPED_VENDORS_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://docs.kie.ai/market/gemini-omni-video</loc></url>
  <url><loc>https://docs.kie.ai/market/gemini-omni-audio</loc></url>
  <url><loc>https://docs.kie.ai/market/gemini-omni-character</loc></url>
  <url><loc>https://docs.kie.ai/market/omnihuman-1-5</loc></url>
  <url><loc>https://docs.kie.ai/market/minimax-h3/text-to-video</loc></url>
  <url><loc>https://docs.kie.ai/market/minimax-h3/image-to-video</loc></url>
  <url><loc>https://docs.kie.ai/market/minimax-h3/reference-to-video</loc></url>
  <url><loc>https://docs.kie.ai/market/grok-imagine/extend</loc></url>
  <url><loc>https://docs.kie.ai/market/google/gemini-3-1-flash-tts</loc></url>
  <url><loc>https://docs.kie.ai/market/chat/gpt-5-2</loc></url>
  <url><loc>https://docs.kie.ai/market/gemini/gemini-3-flash</loc></url>
</urlset>`;

describe("syncKieModels — gemini-omni/omnihuman/minimax-h3/grok-extend survive the sync filter chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(DROPPED_VENDORS_SITEMAP_XML) }),
    );
    prismaMock.modelPricing.findMany.mockResolvedValue([]);
    prismaMock.modelPricing.create.mockResolvedValue({});
    prismaMock.modelPricing.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createdIds() {
    return prismaMock.modelPricing.create.mock.calls.map(([{ data }]) => data.modelId);
  }

  it("creates rows for every real media model in the fixture — and still skips genuine LLM chat pages", async () => {
    const result = await syncKieModels();
    const ids = createdIds();
    // Root-level Gemini-Omni media pages (previously typed "llm" and dropped).
    expect(ids).toContain("gemini-omni-video");
    expect(ids).toContain("gemini-omni-audio");
    expect(ids).toContain("gemini-omni-character");
    // Root-level omnihuman-1-5 (previously dropped by the rest.length < 2 guard).
    expect(ids).toContain("omnihuman-1-5");
    // MiniMax-H3 — all 3 documented models pass the chain.
    expect(ids).toContain("minimax-h3/text-to-video");
    expect(ids).toContain("minimax-h3/image-to-video");
    expect(ids).toContain("minimax-h3/reference-to-video");
    // grok-imagine/extend — previously "grok" → llm before the "extend" rule.
    expect(ids).toContain("grok-imagine/extend");
    // Gemini TTS market page keeps working (tts rule already ran first).
    expect(ids).toContain("google/gemini-3-1-flash-tts");
    // Genuine LLM pages are still excluded on both paths.
    expect(ids).not.toContain("chat/gpt-5-2");
    expect(ids.some((id) => id.includes("gemini-3-flash"))).toBe(false);
    // 11 fixture URLs − chat/gpt-5-2 (llm) − gemini/gemini-3-flash (LLM family) = 9.
    expect(result.added).toBe(9);
  });

  it("types the recovered vendors as media, not llm — capability/modality fields are real", async () => {
    await syncKieModels();
    const byId = new Map(prismaMock.modelPricing.create.mock.calls.map(([{ data }]) => [data.modelId, data]));
    expect(byId.get("gemini-omni-video").capability).toBe("video");
    expect(byId.get("gemini-omni-audio").capability).toBe("audio");
    expect(byId.get("gemini-omni-character").capability).toBe("avatar-video");
    expect(byId.get("omnihuman-1-5").capability).toBe("avatar-video");
    expect(byId.get("minimax-h3/text-to-video").capability).toBe("text-to-video");
    expect(byId.get("minimax-h3/image-to-video").capability).toBe("image-to-video");
    expect(byId.get("minimax-h3/reference-to-video").capability).toBe("reference-to-video");
    expect(byId.get("grok-imagine/extend").capability).toBe("video-to-video");
  });
});
