import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), update: vi.fn() } },
}));

import prisma from "@/lib/prisma";
import { planFixes, run } from "../../scripts/fix-model-categories.mjs";

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
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
    ];
    const { modelTypeFixes, needsAttention } = planFixes(rows);
    expect(modelTypeFixes).toEqual([
      { modelId: "wan/2-7-r2v", providerName: "KIE", capability: "reference-to-video", from: "image", to: "video" },
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
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "video", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
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
      { modelId: "wan/2-7-r2v", providerName: "KIE", modelType: "image", capability: "reference-to-video", displayName: "Wan 2.7 R2v" },
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
      data: { modelType: "video" },
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
