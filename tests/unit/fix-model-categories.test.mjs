import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), update: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { planFixes, run } from "../../scripts/fix-model-categories.mjs";
import { schemaForModel } from "../../src/lib/model-catalog-core.mjs";

// planFixes is the pure planning core of scripts/fix-model-categories.mjs —
// no DB access, so it's tested directly against plain row arrays here.
// run()'s actual dry-run-writes-nothing / apply-writes / idempotent-second-
// run DB behavior is additionally covered end-to-end against the real test
// DB in tests/integration/model-catalog-categories.int.test.mjs.

describe("planFixes", () => {
  it("corrects a bare-video-capability row stuck under the wrong modelType (measured production bug) — 'video' is a real, mapped capability", () => {
    const rows = [
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Seedance 1.5 Pro" },
    ];
    const { modelTypeFixes, needsAttention, capabilityFixes } = planFixes(rows);
    expect(modelTypeFixes).toEqual([
      { modelId: "seedance-1-5-pro", providerName: "KIE", capability: "video", from: "image", to: "video" },
    ]);
    // "video" maps directly (see CAPABILITY_TO_MODEL_TYPE) — no recovery
    // needed, and it must NOT be flagged as needing attention.
    expect(needsAttention).toEqual([]);
    expect(capabilityFixes).toEqual([]);
  });

  it("reports a modelType mismatch that resolves to a real category (reference-to-video stuck under image)", () => {
    const rows = [
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2V" },
    ];
    const { modelTypeFixes, needsAttention } = planFixes(rows);
    // Reference-to-video is an image-INPUT capability (its modelType is i2v,
    // never "video" — see CAPABILITY_TO_MODEL_TYPE's header) so the backfill
    // writes i2v and the model drops out of every text-to-video pool.
    expect(modelTypeFixes).toEqual([
      { modelId: "wan/2-7-r2v", providerName: "KIE", capability: "reference-to-video", from: "image", to: "i2v" },
    ]);
    expect(needsAttention).toEqual([]);
  });

  it("reports nothing for a row that already agrees", () => {
    const rows = [
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Flux 2" },
    ];
    const { modelTypeFixes, needsAttention, displayNameFixes } = planFixes(rows);
    expect(modelTypeFixes).toEqual([]);
    expect(needsAttention).toEqual([]);
    expect(displayNameFixes).toEqual([]);
  });

  it("flags a null-capability row as needing attention when nothing on the row can recover it", () => {
    // No inputModalities/outputModalities, and "mystery-model" matches no
    // text pattern inferCapability recognizes either — genuinely
    // unidentifiable, unlike the recovery cases below.
    const rows = [
      { modelId: "mystery-model", providerName: "KIE", modelType: "uncategorized", capability: null, displayName: "Mystery Model" },
    ];
    const { modelTypeFixes, needsAttention, capabilityFixes } = planFixes(rows);
    expect(modelTypeFixes).toEqual([]);
    expect(capabilityFixes).toEqual([]);
    expect(needsAttention).toEqual([
      { modelId: "mystery-model", providerName: "KIE", capability: null, currentModelType: "uncategorized" },
    ]);
  });

  // ── Recovering a capability instead of just hiding the row ──────────────
  // (production-preview finding: null-capability rows must not be silently
  // hidden — recover what's genuinely identifiable first.)
  it("recovers a null-capability row from unambiguous modalities and fixes its modelType in the same pass", () => {
    const rows = [
      {
        modelId: "mystery-image-1", providerName: "KIE", modelType: "uncategorized", capability: null,
        displayName: "Mystery Image 1", inputModalities: ["text"], outputModalities: ["image"],
      },
    ];
    const { capabilityFixes, modelTypeFixes, needsAttention } = planFixes(rows);
    expect(capabilityFixes).toEqual([
      { modelId: "mystery-image-1", providerName: "KIE", from: null, to: "text-to-image" },
    ]);
    expect(modelTypeFixes).toEqual([
      { modelId: "mystery-image-1", providerName: "KIE", capability: null, from: "uncategorized", to: "image" },
    ]);
    expect(needsAttention).toEqual([]);
  });

  it("recovers a null-capability row from the same text-based inference every synced model gets its capability from, when modalities are absent", () => {
    const rows = [
      { modelId: "some-seedance-model", providerName: "KIE", modelType: "uncategorized", capability: null, displayName: "Some Seedance Model" },
    ];
    const { capabilityFixes, needsAttention } = planFixes(rows);
    expect(capabilityFixes).toEqual([
      { modelId: "some-seedance-model", providerName: "KIE", from: null, to: "video" },
    ]);
    expect(needsAttention).toEqual([]);
  });

  // ── BUG FIX: Text-to-Video listed models that cannot do text-to-video ────
  // Coarse "video" already maps directly to a modelType (the null-capability
  // recovery branch above never runs for it), so a row stuck there was NEVER
  // re-examined for a more precise direction — even once its own id/endpoint
  // carried an unambiguous short-form marker inferCapability now recognizes
  // ("-i2v"/"-v2v"/"-t2v"). This is what backfills the LIVE production rows
  // this bug affected (measured: wan-2.6-v2v was the cheapest model in the
  // T2V pool) once the operator runs the script with --apply --yes.
  it("recovers a precise video direction for a row stuck under coarse 'video' whose own id now carries an unambiguous marker", () => {
    const rows = [
      { modelId: "wan-2.6-v2v", providerName: "KIE", modelType: "video", capability: "video", displayName: "Wan 2.6 V2V" },
      { modelId: "wan-2.6-flash-i2v", providerName: "KIE", modelType: "video", capability: "video", displayName: "Wan 2.6 Flash I2v" },
      { modelId: "wan-2.5-t2v", providerName: "KIE", modelType: "video", capability: "video", displayName: "Wan 2.5 T2v" },
    ];
    const { capabilityFixes, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual([
      { modelId: "wan-2.6-v2v", providerName: "KIE", from: "video", to: "video-to-video" },
      { modelId: "wan-2.6-flash-i2v", providerName: "KIE", from: "video", to: "image-to-video" },
      { modelId: "wan-2.5-t2v", providerName: "KIE", from: "video", to: "text-to-video" },
    ]);
    expect(modelTypeFixes).toEqual([
      { modelId: "wan-2.6-v2v", providerName: "KIE", capability: "video", from: "video", to: "v2v" },
      { modelId: "wan-2.6-flash-i2v", providerName: "KIE", capability: "video", from: "video", to: "i2v" },
      // wan-2.5-t2v's modelType is already "video" and text-to-video also
      // maps to "video" — no modelType change, only the capability itself.
    ]);
  });

  it("leaves a coarse 'video' row completely alone when its id carries no unambiguous direction marker (kling/*, bytedance/seedance-*, wan-animate-*)", () => {
    const rows = [
      { modelId: "bytedance/seedance-2", providerName: "KIE", modelType: "video", capability: "video", displayName: "Seedance 2" },
      { modelId: "wan-animate-move", providerName: "KIE", modelType: "video", capability: "video", displayName: "Wan Animate Move" },
      { modelId: "kling/pro", providerName: "KIE", modelType: "video", capability: "video", displayName: "Kling Pro" },
    ];
    const { capabilityFixes, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual([]);
    expect(modelTypeFixes).toEqual([]);
  });

  it("is idempotent: re-planning a row already recovered to a precise video direction reports nothing further", () => {
    const rows = [
      { modelId: "wan-2.6-v2v", providerName: "KIE", modelType: "v2v", capability: "video-to-video", displayName: "Wan 2.6 V2V" },
    ];
    const { capabilityFixes, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual([]);
    expect(modelTypeFixes).toEqual([]);
  });

  it("does not recover — and still flags needing attention — a capability this mapping has never heard of (the sync's own 'media' fallback) with no other signal", () => {
    const rows = [
      { modelId: "totally-unknown-thing", providerName: "KIE", modelType: "image", capability: "media", displayName: "Totally Unknown Thing" },
    ];
    const { capabilityFixes, needsAttention, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual([]);
    expect(needsAttention).toEqual([
      { modelId: "totally-unknown-thing", providerName: "KIE", capability: "media", currentModelType: "image" },
    ]);
    expect(modelTypeFixes).toEqual([
      { modelId: "totally-unknown-thing", providerName: "KIE", capability: "media", from: "image", to: "uncategorized" },
    ]);
  });

  it("recomputes a stale KIE displayName (mangled slug auto-titling) but never touches an Alibaba row's hand-authored name", () => {
    const rows = [
      { modelId: "bytedance/seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Bytedance Seedance 1 5 Pro" },
      { modelId: "alibaba:qwen-image-max", providerName: "Alibaba", modelType: "image", capability: "text-to-image", displayName: "Qwen Image Max" },
    ];
    const { displayNameFixes } = planFixes(rows);
    expect(displayNameFixes).toEqual([
      { modelId: "bytedance/seedance-1-5-pro", providerName: "KIE", from: "Bytedance Seedance 1 5 Pro", to: "Seedance 1.5 Pro" },
    ]);
  });

  // ── URGENT production fix: persistently rewrite an Alibaba (or any
  // non-KIE) displayName still leaking a "<providerName>:" prefix (measured
  // bug: two live audio rows persisted as "Alibaba:qwen3 TTS Flash" /
  // "Alibaba:qwen3 TTS Instruct Flash") — this is a DIFFERENT bug than the
  // KIE-slug-staleness fix above (a leaked prefix, not a mangled slug) and
  // uses the SAME sanitizeDisplayName the live public serializer already
  // calls (model-catalog-core.mjs), so both agree on what counts as a leak.
  it("rewrites an Alibaba displayName that still leaks a '<providerName>:' prefix, fixing casing via the shared sanitizeDisplayName", () => {
    const rows = [
      { modelId: "alibaba:qwen3-tts-flash", providerName: "Alibaba", modelType: "audio", capability: "text-to-speech", displayName: "Alibaba:qwen3 TTS Flash" },
      { modelId: "alibaba:qwen3-tts-instruct-flash", providerName: "Alibaba", modelType: "audio", capability: "text-to-speech", displayName: "Alibaba:qwen3 TTS Instruct Flash" },
    ];
    const { displayNameFixes } = planFixes(rows);
    expect(displayNameFixes).toEqual([
      { modelId: "alibaba:qwen3-tts-flash", providerName: "Alibaba", from: "Alibaba:qwen3 TTS Flash", to: "Qwen3 TTS Flash" },
      { modelId: "alibaba:qwen3-tts-instruct-flash", providerName: "Alibaba", from: "Alibaba:qwen3 TTS Instruct Flash", to: "Qwen3 TTS Instruct Flash" },
    ]);
  });

  it("does not flag an Alibaba displayName with no provider-prefix leak", () => {
    const rows = [
      { modelId: "alibaba:qwen-image-max", providerName: "Alibaba", modelType: "image", capability: "text-to-image", displayName: "Qwen Image Max" },
    ];
    const { displayNameFixes } = planFixes(rows);
    expect(displayNameFixes).toEqual([]);
  });

  it("is idempotent: re-planning against already-fixed rows reports nothing", () => {
    const fixedRows = [
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "video", capability: "video", displayName: "Seedance 1.5 Pro" },
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "i2v", capability: "reference-to-video", displayName: "Wan 2.7 R2V" },
      { modelId: "mystery-image-1", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Mystery Image 1", inputModalities: ["text"], outputModalities: ["image"] },
      { modelId: "alibaba:qwen3-tts-flash", providerName: "Alibaba", modelType: "audio", capability: "text-to-speech", displayName: "Qwen3 TTS Flash" },
    ];
    const { modelTypeFixes, displayNameFixes, capabilityFixes } = planFixes(fixedRows);
    expect(modelTypeFixes).toEqual([]);
    expect(displayNameFixes).toEqual([]);
    expect(capabilityFixes).toEqual([]);
  });
});

describe("run() — dry-run vs apply (mocked DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "seedance-1-5-pro", providerName: "KIE", modelType: "image", capability: "video", displayName: "Bytedance Seedance 1 5 Pro" },
      // wan/2-7-r2v gained a curated (replace-mode) schema in the M2 pass —
      // the fixture carries the already-correct stored schema so this
      // describe stays about the modelType/capability backfill only.
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2V", inputSchema: schemaForModel("wan/2-7-r2v", "reference-to-video") },
      { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Flux 2" },
      {
        modelId: "mystery-image-1", providerName: "KIE", modelType: "uncategorized", capability: null,
        displayName: "Mystery Image 1", inputModalities: ["text"], outputModalities: ["image"],
      },
    ]);
  });

  it("dry run (default) writes nothing", async () => {
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.modelTypeFixes.length).toBeGreaterThan(0);
    expect(result.capabilityFixes.length).toBeGreaterThan(0);
  });

  it("refuses --apply without --yes and writes nothing", async () => {
    await expect(run({ apply: true, yes: false })).rejects.toThrow(/--yes/);
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
  });

  it("--apply --yes writes the recomputed modelType/displayName/capability for every fixable row", async () => {
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "seedance-1-5-pro" },
      data: { modelType: "video", displayName: "Seedance 1.5 Pro" },
    });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "wan/2-7-r2v" },
      data: { modelType: "i2v" },
    });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "mystery-image-1" },
      data: { modelType: "image", capability: "text-to-image" },
    });
    expect(prisma.modelPricing.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { modelId: "flux-2" } })
    );
    expect(result.applied).toBe(3);
  });
});

// ── URGENT production fix: persistently rewrite a displayName that still
// leaks a "<providerName>:" prefix (measured bug: two live Alibaba audio
// rows — qwen3-tts-flash, qwen3-tts-instruct-flash — persisted as
// "Alibaba:qwen3 TTS Flash" / "Alibaba:qwen3 TTS Instruct Flash") — this is
// the SAME sanitizeDisplayName the live public serializer calls
// (model-catalog.js), so this script fixes both rows at rest instead of
// relying on scrubbing happening only at read time.
describe("run() — displayName provider-prefix backfill (dry-run / apply / idempotent second run)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const flashRow = {
    modelId: "alibaba:qwen3-tts-flash", providerName: "Alibaba", modelType: "audio", capability: "text-to-speech",
    displayName: "Alibaba:qwen3 TTS Flash",
  };
  const instructRow = {
    modelId: "alibaba:qwen3-tts-instruct-flash", providerName: "Alibaba", modelType: "audio", capability: "text-to-speech",
    displayName: "Alibaba:qwen3 TTS Instruct Flash",
  };

  it("dry run reports both leaking displayNames but writes nothing", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([flashRow, instructRow]);
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.displayNameFixes).toEqual([
      { modelId: "alibaba:qwen3-tts-flash", providerName: "Alibaba", from: "Alibaba:qwen3 TTS Flash", to: "Qwen3 TTS Flash" },
      { modelId: "alibaba:qwen3-tts-instruct-flash", providerName: "Alibaba", from: "Alibaba:qwen3 TTS Instruct Flash", to: "Qwen3 TTS Instruct Flash" },
    ]);
  });

  it("--apply --yes fixes both rows", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([flashRow, instructRow]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "alibaba:qwen3-tts-flash" },
      data: { displayName: "Qwen3 TTS Flash" },
    });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "alibaba:qwen3-tts-instruct-flash" },
      data: { displayName: "Qwen3 TTS Instruct Flash" },
    });
    expect(result.applied).toBe(2);
  });

  it("is idempotent: a second run against the already-fixed rows writes nothing", async () => {
    const fixedFlash = { ...flashRow, displayName: "Qwen3 TTS Flash" };
    const fixedInstruct = { ...instructRow, displayName: "Qwen3 TTS Instruct Flash" };
    prisma.modelPricing.findMany.mockResolvedValue([fixedFlash, fixedInstruct]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.displayNameFixes).toEqual([]);
  });
});

// ── URGENT production fix: persistently rewrite descriptions that still
// leak the upstream provider identity (measured bug: kie-sync.js used to
// write `${displayName} via the KIE Market API.` for every synced row) —
// this is the SAME sanitizeCatalogDescription the live public serializer
// calls (model-catalog.js), so this script fixes the 175+ existing rows at
// rest instead of relying on scrubbing happening only at read time.
describe("run() — description backfill (dry-run / apply / idempotent second run)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const leakingRow = {
    modelId: "widget-1", providerName: "KIE", modelType: "image", capability: "text-to-image",
    displayName: "Widget 1", description: "Widget 1 via the KIE Market API.",
  };

  it("dry run reports the leaking description but writes nothing", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([leakingRow]);
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.descriptionFixes).toEqual([
      {
        modelId: "widget-1",
        providerName: "KIE",
        from: "Widget 1 via the KIE Market API.",
        to: "Widget 1 via the Market API.",
      },
    ]);
  });

  it("--apply --yes persistently rewrites the leaking description", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([leakingRow]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "widget-1" },
      data: { description: "Widget 1 via the Market API." },
    });
    expect(result.applied).toBe(1);
  });

  it("is idempotent: re-running against the already-fixed row writes nothing", async () => {
    const fixedRow = { ...leakingRow, description: "Widget 1 via the Market API." };
    prisma.modelPricing.findMany.mockResolvedValue([fixedRow]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.descriptionFixes).toEqual([]);
  });

  it("does not flag a description with no provider token at all", () => {
    const clean = { modelId: "flux-2", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Flux 2", description: "A fast, sharp text-to-image model." };
    const { descriptionFixes } = planFixes([clean]);
    expect(descriptionFixes).toEqual([]);
  });
});

// ── EDITSv1 E1.2: curated schema backfill ──────────────────────────────────
// The rows already in the DB were synced with defaultSchemaForCapability's
// generic `{ prompt }` audio schema, so the studios' schema-gated controls
// (style, title, instrumental, voice, stability…) never render for them.
// The backfill rewrites the stored inputSchema for CURATED ids only — a
// model without a curated entry is never touched (no invented parameters).
describe("run() — curated schema backfill (dry-run / apply / idempotent second run)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const staleMusicRow = {
    modelId: "generate-music", providerName: "KIE", modelType: "audio", capability: "audio",
    displayName: "Generate Music",
    inputSchema: { fields: { prompt: { type: "string", required: true, maxLength: 5000 } } },
  };
  // convert-to-wav needs a prior generation's taskId/audioId (no UI yet) and
  // deliberately has NO curated schema — it must never be touched. (The old
  // exemplar here, generate-lyrics, GAINED a curated schema in EDITSv1 M3.)
  const nonCuratedAudioRow = {
    modelId: "convert-to-wav", providerName: "KIE", modelType: "audio", capability: "audio",
    displayName: "Convert To Wav",
    inputSchema: { fields: { prompt: { type: "string", required: true, maxLength: 5000 } } },
  };

  it("planFixes flags a curated id whose stored schema is still the generic default, and leaves non-curated rows alone", () => {
    const { schemaFixes } = planFixes([staleMusicRow, nonCuratedAudioRow]);
    expect(schemaFixes).toHaveLength(1);
    expect(schemaFixes[0].modelId).toBe("generate-music");
    expect(schemaFixes[0].to.fields.style).toMatchObject({ type: "string" });
    expect(schemaFixes[0].to.fields.instrumental).toMatchObject({ type: "boolean" });
    expect(schemaFixes[0].to.fields.duration).toMatchObject({ type: "number", enum: [30, 60, 120, 180, 240] });
    // The generic prompt field survives the merge.
    expect(schemaFixes[0].to.fields.prompt).toBeTruthy();
  });

  it("dry run reports the schema fix but writes nothing", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([staleMusicRow, nonCuratedAudioRow]);
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.schemaFixes).toHaveLength(1);
  });

  it("--apply --yes writes the curated schema for the stale row only", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([staleMusicRow, nonCuratedAudioRow]);
    const result = await run({ apply: true, yes: true });
    expect(result.applied).toBe(1);
    const call = prisma.modelPricing.update.mock.calls.find(([args]) => args.where.modelId === "generate-music");
    expect(call).toBeTruthy();
    expect(call[0].data.inputSchema.fields.vocal_gender).toMatchObject({ enum: ["m", "f"] });
    expect(prisma.modelPricing.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { modelId: "convert-to-wav" } }),
    );
  });

  it("is idempotent: a second run against the already-backfilled row writes nothing", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([staleMusicRow]);
    const first = await run({ apply: true, yes: true });
    expect(first.applied).toBe(1);
    const [{ data }] = prisma.modelPricing.update.mock.calls[0];

    vi.clearAllMocks();
    prisma.modelPricing.findMany.mockResolvedValue([{ ...staleMusicRow, inputSchema: data.inputSchema }]);
    const second = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(second.applied).toBe(0);
    expect(second.schemaFixes).toEqual([]);
  });
});

// ── BUG FIX: Text-to-Video listed models that cannot do text-to-video —
// end-to-end through run() (dry-run writes nothing / apply corrects
// capabilities / second run is a no-op), the exact production remediation
// path: DATABASE_URL="postgresql://postgres:test@localhost:55432/test" node
// scripts/fix-model-categories.mjs --apply --yes.
describe("run() — coarse-'video' direction backfill (dry-run / apply / idempotent second run)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const v2vRow = { modelId: "wan-2.6-v2v", providerName: "KIE", modelType: "video", capability: "video", displayName: "Wan 2.6 V2V" };
  // seedance-2 gained a curated (replace-mode) schema in the M2 pass — give
  // the fixture the already-correct stored schema so this describe stays
  // purely about the capability backfill, as originally intended.
  const noSignalRow = {
    modelId: "bytedance/seedance-2", providerName: "KIE", modelType: "video", capability: "video",
    displayName: "Seedance 2", inputSchema: schemaForModel("bytedance/seedance-2", "video"),
  };

  it("dry run reports the recovered direction but writes nothing, and leaves the markerless row alone", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([v2vRow, noSignalRow]);
    const result = await run({ apply: false, yes: false });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.capabilityFixes).toEqual([
      { modelId: "wan-2.6-v2v", providerName: "KIE", from: "video", to: "video-to-video" },
    ]);
  });

  it("--apply --yes writes the recovered capability (and its modelType) for the marked row only", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([v2vRow, noSignalRow]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith({
      where: { modelId: "wan-2.6-v2v" },
      data: { modelType: "v2v", capability: "video-to-video" },
    });
    expect(prisma.modelPricing.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { modelId: "bytedance/seedance-2" } }),
    );
    expect(result.applied).toBe(1);
  });

  it("is idempotent: a second run against the already-recovered row writes nothing", async () => {
    const fixedRow = { ...v2vRow, modelType: "v2v", capability: "video-to-video" };
    prisma.modelPricing.findMany.mockResolvedValue([fixedRow, noSignalRow]);
    const result = await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).not.toHaveBeenCalled();
    expect(result.applied).toBe(0);
    expect(result.capabilityFixes).toEqual([]);
  });
});

// ── M1 fix B: persisting the doc-verified id corrections on production rows
// (docs/model-audit/image-market.md #8/#9, video-market.md #7).
describe("planFixes — modelId corrections (fix B)", () => {
  it("renames a broken-id row in place when no corrected twin exists", () => {
    const rows = [
      { modelId: "kling/kling-3-0", providerName: "KIE", modelType: "video", capability: "video", displayName: "Kling 3 0", isActive: true, isDeprecated: false },
    ];
    const { idFixes } = planFixes(rows);
    expect(idFixes).toEqual([
      { modelId: "kling/kling-3-0", providerName: "KIE", action: "rename", to: "kling-3.0/video" },
    ]);
  });

  it("deactivates the broken qwen-2 row and reactivates its correctly-spelled deactivated twin — never leaves both active", () => {
    const rows = [
      { modelId: "qwen-2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image", displayName: "Qwen2 Image Edit", isActive: true, isDeprecated: false },
      { modelId: "qwen2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image", displayName: "Qwen2 Image Edit", isActive: false, isDeprecated: true },
    ];
    const { idFixes } = planFixes(rows);
    expect(idFixes).toEqual([
      {
        modelId: "qwen-2/image-edit",
        providerName: "KIE",
        action: "deactivate-in-favor-of-twin",
        twinModelId: "qwen2/image-edit",
        deactivateOld: true,
        reactivateTwin: true,
      },
    ]);
  });

  it("never resurrects a twin whose recorded verification verdict is not-callable", () => {
    const rows = [
      { modelId: "qwen-2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image", displayName: "Qwen2 Image Edit", isActive: true, isDeprecated: false },
      {
        modelId: "qwen2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image",
        displayName: "Qwen2 Image Edit", isActive: false, isDeprecated: true,
        constraints: { verification: { status: "verified", verdict: "not-callable", callable: false } },
      },
    ];
    const { idFixes } = planFixes(rows);
    expect(idFixes).toHaveLength(1);
    expect(idFixes[0].reactivateTwin).toBe(false);
    expect(idFixes[0].deactivateOld).toBe(true);
  });

  it("is idempotent: a renamed row (now under its corrected id) and a settled twin pair report nothing", () => {
    const rows = [
      { modelId: "kling-3.0/video", providerName: "KIE", modelType: "video", capability: "video", displayName: "Kling 3.0 Video", isActive: true, isDeprecated: false },
      { modelId: "qwen-2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image", displayName: "Qwen2 Image Edit", isActive: false, isDeprecated: true },
      { modelId: "qwen2/image-edit", providerName: "KIE", modelType: "i2i", capability: "image-to-image", displayName: "Qwen2 Image Edit", isActive: true, isDeprecated: false },
    ];
    const { idFixes } = planFixes(rows);
    expect(idFixes).toEqual([]);
  });

  it("--apply --yes rewrites modelId/providerModelId/endpoint together on a rename, and deactivates+reactivates on a twin pair", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "bytedance/seedance-1-5-pro", providerName: "KIE", modelType: "video", capability: "video", displayName: "Bytedance Seedance 1.5 Pro", isActive: true, isDeprecated: false },
      { modelId: "qwen-2/text-to-image", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Qwen2 Text To Image", isActive: true, isDeprecated: false },
      { modelId: "qwen2/text-to-image", providerName: "KIE", modelType: "image", capability: "text-to-image", displayName: "Qwen2 Text To Image", isActive: false, isDeprecated: true },
    ]);
    await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: "bytedance/seedance-1-5-pro" },
        data: expect.objectContaining({
          modelId: "bytedance/seedance-1.5-pro",
          providerModelId: "bytedance/seedance-1.5-pro",
          endpoint: "bytedance/seedance-1.5-pro",
        }),
      }),
    );
    expect(prisma.modelPricing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: "qwen-2/text-to-image" },
        data: expect.objectContaining({ isActive: false, isDeprecated: true }),
      }),
    );
    expect(prisma.modelPricing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: "qwen2/text-to-image" },
        data: { isActive: true, isDeprecated: false },
      }),
    );
  });
});

// ── M1 fix G: output-type misfilings + webhook-payload doc pages ───────────
describe("planFixes — G reclassifications and callback-page verdicts", () => {
  it("reclassifies cover-suno (audio→image), create-music-video (audio→video) and the Volcengine lip-sync row (video-to-video→avatar-video)", () => {
    const rows = [
      { modelId: "cover-suno", providerName: "KIE", modelType: "audio", capability: "audio", displayName: "Cover Suno", isActive: true, isDeprecated: false },
      { modelId: "create-music-video", providerName: "KIE", modelType: "audio", capability: "audio", displayName: "Create Music Video", isActive: true, isDeprecated: false },
      { modelId: "volcengine/video-to-video-lip-sync", providerName: "KIE", modelType: "v2v", capability: "video-to-video", displayName: "Volcengine Lip Sync", isActive: true, isDeprecated: false },
    ];
    const { capabilityFixes, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: "cover-suno", to: "image" }),
        expect.objectContaining({ modelId: "create-music-video", to: "video" }),
        expect.objectContaining({ modelId: "volcengine/video-to-video-lip-sync", to: "avatar-video" }),
      ]),
    );
    expect(modelTypeFixes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelId: "cover-suno", to: "image" }),
        expect.objectContaining({ modelId: "create-music-video", to: "video" }),
        expect.objectContaining({ modelId: "volcengine/video-to-video-lip-sync", to: "lipsync" }),
      ]),
    );
  });

  it("is idempotent for the reclassified rows: once stored, nothing is reported", () => {
    const rows = [
      { modelId: "cover-suno", providerName: "KIE", modelType: "image", capability: "image", displayName: "Cover Suno", isActive: true, isDeprecated: false },
      { modelId: "volcengine/video-to-video-lip-sync", providerName: "KIE", modelType: "lipsync", capability: "avatar-video", displayName: "Volcengine Lip Sync", isActive: true, isDeprecated: false },
    ];
    const { capabilityFixes, modelTypeFixes } = planFixes(rows);
    expect(capabilityFixes).toEqual([]);
    expect(modelTypeFixes).toEqual([]);
  });

  it("marks the two pure-callback rows verified not-callable (webhook payload docs, not models) and skips already-marked rows", () => {
    const rows = [
      { modelId: "suno-voice-generate-callback", providerName: "KIE", modelType: "audio", capability: "text-to-speech", displayName: "Suno Voice Generate Callback", isActive: true, isDeprecated: false },
      {
        modelId: "suno-voice-validate-callback", providerName: "KIE", modelType: "audio", capability: "text-to-speech",
        displayName: "Suno Voice Validate Callback", isActive: false, isDeprecated: true,
        constraints: { verification: { status: "verified", verdict: "not-callable", callable: false, reason: "webhook payload documentation page, not a callable model" } },
      },
    ];
    const { notUsableFixes } = planFixes(rows);
    expect(notUsableFixes).toHaveLength(1);
    expect(notUsableFixes[0].modelId).toBe("suno-voice-generate-callback");
    expect(notUsableFixes[0].constraints.verification).toMatchObject({
      status: "verified",
      verdict: "not-callable",
      callable: false,
    });
  });

  it("--apply --yes deactivates a callback row and writes its verdict into constraints", async () => {
    prisma.modelPricing.findMany.mockResolvedValue([
      { modelId: "suno-voice-generate-callback", providerName: "KIE", modelType: "audio", capability: "text-to-speech", displayName: "Suno Voice Generate Callback", isActive: true, isDeprecated: false, constraints: { maxOutputs: 1 } },
    ]);
    await run({ apply: true, yes: true });
    expect(prisma.modelPricing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modelId: "suno-voice-generate-callback" },
        data: expect.objectContaining({
          isActive: false,
          isDeprecated: true,
          constraints: expect.objectContaining({
            maxOutputs: 1,
            verification: expect.objectContaining({ verdict: "not-callable", callable: false }),
          }),
        }),
      }),
    );
  });
});
