import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";

// URGENT production fix — end-to-end verification against a real Postgres
// database (the shared test container; see tests/integration/setup.mjs's
// own host-allowlist guard). ModelPricing is NOT part of resetDb()'s
// TRUNCATE list (it's a shared catalog table, not per-test user data —
// other concurrent suites/agents may have their own rows in it), so this
// file scopes every row it touches under a run-unique modelId prefix and
// deletes exactly those rows again afterward, never asserting on the
// table's total contents.
//
// This seed mirrors the shape of a READ-ONLY preview a coordinator ran
// against the REAL production catalog (189 active, non-deprecated rows)
// that caught a real gap in a first version of this fix: bare "image" and
// "video" capability values were left unmapped, which would have HIDDEN 28
// genuinely working models (14 image, 14 video) plus 20 null-capability
// and 1 "media"-capability row — 49 total, on top of 8 rows that legitimately
// needed recategorizing (a mapped-but-misfiled capability, e.g.
// reference-to-video/video-to-video stuck under the wrong modelType).
//
//   8  recategorize bucket: 5 reference-to-video + 3 video-to-video rows,
//      each stored under the wrong modelType — corrected to a REAL category.
//   28 bare "image"/"video" capability rows (14 each) — these are REAL,
//      already-correctly-stored models (modelType already matches their
//      capability); the only thing wrong was the mapping gap that would
//      have hidden them. After the fix: zero changes needed, just visible.
//   20 null-capability rows — split so the recovery mechanism
//      (inferCapabilityFromRow: modalities first, then the same
//      text-based inference every other synced model already gets its
//      capability from) recovers some and not others:
//        5 recoverable from unambiguous modalities
//        5 recoverable from endpoint/modelId text (no modalities present)
//        10 genuinely unrecoverable (no modalities, no recognizable text)
//   1  "media"-capability row (the sync's own last-resort fallback) — given
//      modalities that unambiguously produce an image, demonstrating the
//      "if it produces an image, map it to image" recovery path.
//   132 already-correct control rows spread across all 7 real modes —
//      never touched, confirming the fix doesn't disturb working data.
//
// 8 + 28 + 20 + 1 + 132 = 189, matching the production preview exactly.

const PREFIX = `zz-test-catalog-fix2-${randomUUID()}-`;
const TOTAL_SEEDED = 8 + 28 + 20 + 1 + 132; // 189

function baseRow(suffix, fields) {
  return {
    modelId: `${PREFIX}${suffix}`,
    providerName: "KIE",
    displayName: suffix,
    providerCost: 0.05,
    creditsCost: 5,
    isActive: true,
    isDeprecated: false,
    ...fields,
  };
}

function buildSeed() {
  const rows = [];

  // ── 8: recategorize bucket (mapped capability, wrong modelType) ────────
  for (let i = 0; i < 5; i++) {
    rows.push(baseRow(`r2v-${i}`, { modelType: "image", capability: "reference-to-video" }));
  }
  for (let i = 0; i < 3; i++) {
    rows.push(baseRow(`v2v-${i}`, { modelType: "i2i", capability: "video-to-video" }));
  }

  // ── 28: bare image/video capability, ALREADY correctly stored ──────────
  // (the exact gap: these were fine all along, only the mapping hid them)
  for (let i = 0; i < 14; i++) {
    rows.push(baseRow(`bare-image-${i}`, { modelType: "image", capability: "image" }));
  }
  for (let i = 0; i < 14; i++) {
    rows.push(baseRow(`bare-video-${i}`, { modelType: "video", capability: "video" }));
  }

  // ── 20: null-capability, split by recoverability ───────────────────────
  // Every null-capability/media row below is deliberately stored under
  // modelType="audio" — an arbitrary placeholder guaranteed to differ from
  // every possible target here (none of these rows recover to audio, and
  // "uncategorized" never existed as a real column value before this fix),
  // so every one of them is a genuine, demonstrable mismatch pre-apply.
  const NULL_CAP_PLACEHOLDER_TYPE = "audio";

  // 5 recoverable from unambiguous modalities.
  const modalityRecoverable = [
    { io: ["text"], out: ["image"] },       // -> text-to-image
    { io: ["text"], out: ["image"] },       // -> text-to-image
    { io: ["text", "image"], out: ["video"] }, // -> image-to-video
    { io: ["text", "image"], out: ["video"] }, // -> image-to-video
    { io: ["text"], out: ["video"] },       // -> text-to-video
  ];
  modalityRecoverable.forEach((m, i) => {
    rows.push(baseRow(`null-cap-modality-${i}`, {
      modelType: NULL_CAP_PLACEHOLDER_TYPE, capability: null, inputModalities: m.io, outputModalities: m.out,
    }));
  });
  // 5 recoverable only from endpoint/modelId text (no modalities set).
  const textRecoverableSlugs = ["flux-mystery-a", "flux-mystery-b", "kling-mystery-a", "kling-mystery-b", "qwen-mystery-a"];
  textRecoverableSlugs.forEach((slug, i) => {
    rows.push(baseRow(`null-cap-text-${i}`, { modelType: NULL_CAP_PLACEHOLDER_TYPE, capability: null, endpoint: slug }));
  });
  // 10 genuinely unrecoverable — no modalities, endpoint text matches nothing.
  for (let i = 0; i < 10; i++) {
    rows.push(baseRow(`null-cap-unrecoverable-${i}`, { modelType: NULL_CAP_PLACEHOLDER_TYPE, capability: null, endpoint: `qzx-${i}-nnn` }));
  }

  // ── 1: "media"-capability row, recoverable via modalities (image output) ──
  rows.push(baseRow("media-row", {
    modelType: NULL_CAP_PLACEHOLDER_TYPE, capability: "media", inputModalities: ["text"], outputModalities: ["image"],
  }));

  // ── 132: already-correct control rows across all 7 real modes ──────────
  const controlCounts = { image: 19, i2i: 19, video: 19, i2v: 19, v2v: 19, lipsync: 19, audio: 18 };
  const capabilityForMode = {
    image: "text-to-image", i2i: "image-to-image", video: "text-to-video", i2v: "image-to-video",
    v2v: "video-to-video", lipsync: "avatar-video", audio: "audio",
  };
  for (const [mode, count] of Object.entries(controlCounts)) {
    for (let i = 0; i < count; i++) {
      rows.push(baseRow(`control-${mode}-${i}`, { modelType: mode, capability: capabilityForMode[mode] }));
    }
  }

  return rows;
}

async function cleanup(prisma) {
  await prisma.modelPricing.deleteMany({ where: { modelId: { startsWith: PREFIX } } });
}

describe("scripts/fix-model-categories.mjs against a test DB seeded to the corrected production shape (189 rows)", () => {
  afterEach(async () => {
    const { default: prisma } = await import("@/lib/prisma");
    await cleanup(prisma);
  });

  it("dry run: 8 recategorized (mapped-but-misfiled), 11 recovered capabilities, only 10 genuinely-unidentifiable rows hidden", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });

    const mine = (list) => list.filter((r) => r.modelId.startsWith(PREFIX));

    const before = await run({ apply: false, yes: false });
    const capabilityFixes = mine(before.capabilityFixes);
    const modelTypeFixes = mine(before.modelTypeFixes);
    const needsAttention = mine(before.needsAttention);

    // 11 recovered: 5 modality-based + 5 text-based + the 1 media row.
    expect(capabilityFixes).toHaveLength(11);
    expect(capabilityFixes.filter((f) => f.modelId.includes("null-cap-modality"))).toHaveLength(5);
    expect(capabilityFixes.filter((f) => f.modelId.includes("null-cap-text"))).toHaveLength(5);
    expect(capabilityFixes.find((f) => f.modelId.includes("media-row"))).toMatchObject({ from: "media", to: "text-to-image" });

    // Only the 10 genuinely unrecoverable rows are hidden — small, and each
    // one really has no usable signal (no modalities, unrecognizable text).
    expect(needsAttention).toHaveLength(10);
    expect(needsAttention.every((n) => n.modelId.includes("null-cap-unrecoverable"))).toBe(true);

    // modelType rewrites: 8 (recategorize bucket) + 20 (all null-capability
    // rows move off whatever placeholder they were stored under, recovered
    // or not) + 1 (media row) = 29. The 28 bare image/video rows need NONE
    // — they were already correctly stored, only the mapping hid them.
    expect(modelTypeFixes).toHaveLength(29);
    expect(modelTypeFixes.some((f) => f.modelId.includes("bare-image") || f.modelId.includes("bare-video"))).toBe(false);

    // ── APPLY ──────────────────────────────────────────────────────────
    const applied = await run({ apply: true, yes: true });
    expect(mine(applied.modelTypeFixes)).toHaveLength(29);

    const r2v0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}r2v-0` } });
    expect(r2v0.modelType).toBe("video");
    const v2v0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}v2v-0` } });
    expect(v2v0.modelType).toBe("v2v");
    const bareImage0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}bare-image-0` } });
    expect(bareImage0.modelType).toBe("image"); // untouched
    const bareVideo0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}bare-video-0` } });
    expect(bareVideo0.modelType).toBe("video"); // untouched
    const recoveredModality0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}null-cap-modality-0` } });
    expect(recoveredModality0.capability).toBe("text-to-image");
    expect(recoveredModality0.modelType).toBe("image");
    const recoveredText0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}null-cap-text-0` } }); // flux-mystery-a
    expect(recoveredText0.capability).toBe("image");
    expect(recoveredText0.modelType).toBe("image");
    const mediaRow = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}media-row` } });
    expect(mediaRow.capability).toBe("text-to-image");
    expect(mediaRow.modelType).toBe("image");
    const stillUnrecoverable0 = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}null-cap-unrecoverable-0` } });
    expect(stillUnrecoverable0.modelType).toBe("uncategorized");
    expect(stillUnrecoverable0.capability).toBeNull(); // never invented

    // ── AFTER: second dry run is a no-op (idempotent) ───────────────────
    const after = await run({ apply: false, yes: false });
    expect(mine(after.modelTypeFixes)).toHaveLength(0);
    expect(mine(after.capabilityFixes)).toHaveLength(0);
    expect(mine(after.needsAttention)).toHaveLength(10); // unchanged — still genuinely unrecoverable
  });

  it("final per-mode visible counts: only the 10 unrecoverable rows are missing from every listing", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { getCatalogModels } = await import("@/lib/model-catalog");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });
    await run({ apply: true, yes: true });

    const mine = (list) => list.filter((r) => r.modelId.startsWith(PREFIX));

    const counts = {};
    for (const mode of ["image", "i2i", "video", "i2v", "v2v", "lipsync", "audio"]) {
      counts[mode] = mine(await getCatalogModels({ modelType: mode, includeInactive: true })).length;
    }

    // image: 19 control + 14 bare-image + (2 modality text-to-image + 3
    //   text-based flux/flux/qwen recoveries + the media row) = 19+14+2+3+1 = 39
    expect(counts.image).toBe(39);
    // i2i: 19 control, untouched by any recovery in this seed.
    expect(counts.i2i).toBe(19);
    // video: 19 control + 14 bare-video + 5 (recategorized reference-to-
    //   video) + (1 modality text-to-video + 2 kling text-based) = 19+14+5+3 = 41
    expect(counts.video).toBe(41);
    // i2v: 19 control + 2 modality-recovered image-to-video = 21
    expect(counts.i2v).toBe(21);
    // v2v: 19 control + 3 (recategorized video-to-video) = 22
    expect(counts.v2v).toBe(22);
    expect(counts.lipsync).toBe(19);
    expect(counts.audio).toBe(18);

    const totalVisible = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(totalVisible).toBe(TOTAL_SEEDED - 10); // every row except the 10 genuinely unrecoverable ones

    const adminAll = mine(await getCatalogModels({ includeInactive: true, isAdmin: true }));
    expect(adminAll).toHaveLength(TOTAL_SEEDED);
    expect(adminAll.filter((m) => m.isUncategorized)).toHaveLength(10);
  });
});
