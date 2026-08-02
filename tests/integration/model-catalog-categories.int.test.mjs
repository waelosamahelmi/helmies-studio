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
// The seed below deliberately mirrors the EXACT pattern measured on the
// live catalog in the task this fixes: 10 rows with capability="video"
// filed under modelType="image" (the Bytedance Seedance bug), 4 with
// capability="reference-to-video" also under "image", 2 with
// capability="video-to-video" filed under "i2i", and 19 rows with a null
// capability spread across modelTypes (3 image, 5 i2v, 5 v2v, 2 audio, 1
// lipsync, 3 video) — the same shape as the numbers reported for
// production — plus 3 already-correct control rows that must never move.
//
// "uncategorized" is a brand-new sentinel this fix introduces (nothing was
// ever stored that way before), so every one of the 10 bare-"video" rows
// AND all 19 null-capability rows shows up as a modelType MISMATCH (their
// stored value isn't "uncategorized" yet) as well as NEEDING ATTENTION
// (their capability itself is null/unmapped and can't be auto-corrected) —
// those two lists overlap for exactly those 29 rows.

const PREFIX = `zz-test-catalog-fix-${randomUUID()}-`;
const TOTAL_SEEDED = 10 + 4 + 2 + 19 + 3; // 38

function baseRow(suffix, { modelType, capability, providerName = "KIE" }) {
  return {
    modelId: `${PREFIX}${suffix}`,
    modelType,
    capability,
    providerName,
    displayName: suffix,
    providerCost: 0.05,
    creditsCost: 5,
    isActive: true,
    isDeprecated: false,
  };
}

function buildSeed() {
  const rows = [];
  // 10 video-capability rows miscategorized as "image" (Bytedance Seedance).
  for (let i = 0; i < 10; i++) {
    rows.push(baseRow(`seedance-${i}`, { modelType: "image", capability: "video" }));
  }
  // 4 reference-to-video rows miscategorized as "image".
  for (let i = 0; i < 4; i++) {
    rows.push(baseRow(`r2v-${i}`, { modelType: "image", capability: "reference-to-video" }));
  }
  // 2 video-to-video rows miscategorized as "i2i".
  for (let i = 0; i < 2; i++) {
    rows.push(baseRow(`v2v-${i}`, { modelType: "i2i", capability: "video-to-video" }));
  }
  // 19 null-capability rows spread across modelTypes — needs attention,
  // never auto-fixable.
  const nullSpread = [["image", 3], ["i2v", 5], ["v2v", 5], ["audio", 2], ["lipsync", 1], ["video", 3]];
  let n = 0;
  for (const [modelType, count] of nullSpread) {
    for (let i = 0; i < count; i++) {
      rows.push(baseRow(`null-cap-${modelType}-${n++}`, { modelType, capability: null }));
    }
  }
  // 3 already-correct control rows that must NEVER be touched.
  rows.push(baseRow("control-image", { modelType: "image", capability: "text-to-image" }));
  rows.push(baseRow("control-i2v", { modelType: "i2v", capability: "image-to-video" }));
  rows.push(baseRow("control-alibaba", { modelType: "video", capability: "text-to-video", providerName: "Alibaba" }));
  return rows;
}

async function cleanup(prisma) {
  await prisma.modelPricing.deleteMany({ where: { modelId: { startsWith: PREFIX } } });
}

describe("scripts/fix-model-categories.mjs against real Postgres", () => {
  afterEach(async () => {
    const { default: prisma } = await import("@/lib/prisma");
    await cleanup(prisma);
  });

  it("dry run reports the exact before counts, apply fixes them, and a second run is a no-op", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });

    const mine = (list) => list.filter((r) => r.modelId.startsWith(PREFIX));

    // ── BEFORE: dry run ────────────────────────────────────────────────
    const before = await run({ apply: false, yes: false });
    const beforeMismatches = mine(before.modelTypeFixes);
    const beforeAttention = mine(before.needsAttention);

    // 10 (seedance) + 4 (r2v) + 2 (v2v) + 19 (null-capability) = 35 rows
    // need their modelType rewritten. The 3 control rows must not appear.
    expect(beforeMismatches).toHaveLength(35);
    expect(beforeMismatches.some((m) => m.modelId.includes("control"))).toBe(false);

    const seedanceFixes = beforeMismatches.filter((m) => m.modelId.includes("seedance"));
    expect(seedanceFixes).toHaveLength(10);
    // Bare "video" has no entry in the mapping — written as uncategorized,
    // never guessed into a real category. That's the whole point of this fix.
    expect(seedanceFixes.every((m) => m.to === "uncategorized")).toBe(true);

    const r2vFixes = beforeMismatches.filter((m) => m.modelId.includes("r2v-"));
    expect(r2vFixes).toHaveLength(4);
    expect(r2vFixes.every((m) => m.to === "video")).toBe(true);

    // NOTE: "v2v-" alone would also match the null-capability "...null-cap-
    // v2v-N" rows below — exclude those explicitly to isolate the 2 real
    // video-to-video control rows.
    const v2vFixes = beforeMismatches.filter((m) => m.modelId.includes("v2v-") && !m.modelId.includes("null-cap"));
    expect(v2vFixes).toHaveLength(2);
    expect(v2vFixes.every((m) => m.to === "v2v")).toBe(true);

    const nullCapFixes = beforeMismatches.filter((m) => m.modelId.includes("null-cap"));
    expect(nullCapFixes).toHaveLength(19);
    expect(nullCapFixes.every((m) => m.to === "uncategorized" && m.capability === null)).toBe(true);

    // 19 null-capability rows + 10 bare-"video" Seedance rows = 29 total
    // rows needing attention (reference-to-video and video-to-video ARE
    // real, mapped capabilities, so those 6 rows are NOT in this list).
    expect(beforeAttention).toHaveLength(29);

    // Dry run must not have written anything.
    const untouchedRow = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}seedance-0` } });
    expect(untouchedRow.modelType).toBe("image");

    // ── APPLY ────────────────────────────────────────────────────────────
    const applied = await run({ apply: true, yes: true });
    expect(mine(applied.modelTypeFixes)).toHaveLength(35); // same plan, now executed

    const fixedSeedance = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}seedance-0` } });
    expect(fixedSeedance.modelType).toBe("uncategorized");
    const fixedR2v = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}r2v-0` } });
    expect(fixedR2v.modelType).toBe("video");
    const fixedV2v = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}v2v-0` } });
    expect(fixedV2v.modelType).toBe("v2v");
    const fixedNullCap = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}null-cap-image-0` } });
    expect(fixedNullCap.modelType).toBe("uncategorized");

    // Control rows must be byte-for-byte untouched.
    const control = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}control-image` } });
    expect(control.modelType).toBe("image");
    const controlI2v = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}control-i2v` } });
    expect(controlI2v.modelType).toBe("i2v");
    const controlAlibaba = await prisma.modelPricing.findUnique({ where: { modelId: `${PREFIX}control-alibaba` } });
    expect(controlAlibaba.modelType).toBe("video");

    // ── AFTER: second dry run is a no-op (idempotent) ───────────────────
    const after = await run({ apply: false, yes: false });
    expect(mine(after.modelTypeFixes)).toHaveLength(0);
    // The 29 rows with a null/unmapped capability still correctly need
    // attention — fixing modelType never invents a capability, so this
    // count is UNCHANGED after apply; only a human fixing the sync source
    // can clear it.
    expect(mine(after.needsAttention)).toHaveLength(29);
  });

  it("getCatalogModels excludes every uncategorized row from a non-admin listing, but the admin path still sees them", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { getCatalogModels } = await import("@/lib/model-catalog");

    await prisma.modelPricing.createMany({ data: buildSeed() });
    const { run } = await import("../../scripts/fix-model-categories.mjs");
    await run({ apply: true, yes: true });

    const mine = (list) => list.filter((r) => r.modelId.startsWith(PREFIX));

    const publicImageModels = mine(await getCatalogModels({ modelType: "image", includeInactive: true }));
    // Only the control image row should ever surface publicly under "image"
    // — every one of the 10 Seedance rows (bare "video") and the 3
    // null-capability rows originally stored as "image" are gone from it.
    expect(publicImageModels.map((m) => m.id)).toEqual([`${PREFIX}control-image`]);

    const publicAll = mine(await getCatalogModels({ includeInactive: true }));
    // Public sees the 3 control rows plus the 4 reference-to-video and 2
    // video-to-video rows — all of those have a REAL, mapped capability, so
    // fixing their modelType is exactly what makes them showable again
    // (previously they were miscategorized, not absent). Only the 29 rows
    // whose capability is itself null/unmapped (the 10 bare-"video"
    // Seedance rows and the 19 null-capability rows) stay invisible.
    expect(publicAll).toHaveLength(9);
    expect(publicAll.every((m) => !m.isUncategorized)).toBe(true);

    const adminAll = mine(await getCatalogModels({ includeInactive: true, isAdmin: true }));
    // Admin sees every one of the 38 seeded rows, including uncategorized ones.
    expect(adminAll).toHaveLength(TOTAL_SEEDED);
    // isUncategorized reflects capability, not "needed a modelType rewrite" —
    // r2v/v2v had the latter but a real, mapped capability, so only the 29
    // truly unmapped rows (10 Seedance + 19 null-capability) are flagged.
    expect(adminAll.filter((m) => m.isUncategorized)).toHaveLength(29);
  });
});
