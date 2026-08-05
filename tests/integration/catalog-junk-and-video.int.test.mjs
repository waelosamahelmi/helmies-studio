import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";

// Two catalog-quality bugs, measured on LIVE production (2026-08-05):
//
// BUG 1 — non-generation documentation endpoints filed as "models". KIE's
// docs sitemap has pages for a webhook callback, a request validator, and a
// status/record lookup — none of them a model a generation can be submitted
// to — and five of them (all under the Suno voice-clone family) were ACTIVE
// in the audio pool: suno-voice-generate-callback, suno-voice-record-info,
// suno-voice-validate, suno-voice-validate-callback, suno-voice-validate-info.
//
// BUG 2 — video generators filed as image models. Three legacy-suite doc
// pages (generate-ai-video, generate-aleph-video, generate-veo-3-video) were
// ACTIVE with modelType="image"/capability="text-to-image", so they showed
// in the Image studio and could not run there.
//
// This exercises the FULL stack a studio actually reads from: seed rows
// shaped exactly like the real, currently-active catalog (see
// scripts/fix-model-categories.mjs's planFixes for the pure logic this
// backfills), run the SAME backfill an operator runs against production,
// then read them back through getCatalogModels/matchesGroup/audioKind — the
// exact functions src/components/studio/{Music,Image}Studio.js use to build
// each studio's model picker (those components are off-limits to touch
// directly, so this test drives their own shared library functions instead
// of rendering React).
//
// ModelPricing is a SHARED catalog table (not part of resetDb()'s TRUNCATE
// list — other concurrent suites may have their own rows in it), so every
// row here is scoped under a run-unique modelId prefix and cleaned up after,
// mirroring tests/integration/model-catalog-categories.int.test.mjs.

import { matchesGroup } from "@/lib/capability-groups";
import { audioKind } from "@/lib/model-catalog-core.mjs";

const PREFIX = `zz-test-junkvideo-${randomUUID()}-`;

const JUNK_SUFFIXES = [
  "suno-voice-generate-callback",
  "suno-voice-record-info",
  "suno-voice-validate",
  "suno-voice-validate-callback",
  "suno-voice-validate-info",
];
const VIDEO_SUFFIXES = ["generate-ai-video", "generate-aleph-video", "generate-veo-3-video"];

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

  // BUG 1: the five junk endpoints, seeded exactly as measured on
  // production — ACTIVE, capability "audio" (the coarse bucket every Suno
  // family id lands under), no verification block yet (they predate the
  // fix, same as the real rows).
  for (const suffix of JUNK_SUFFIXES) {
    rows.push(baseRow(suffix, { modelType: "audio", capability: "audio", constraints: {} }));
  }
  // The REAL generator these doc pages are about — a similar-looking id
  // (shares the "suno-voice-" prefix and the word "generate") that must
  // stay untouched and visible.
  rows.push(baseRow("suno-voice-generate", { modelType: "audio", capability: "text-to-speech", constraints: {} }));

  // BUG 2: the three video generators, seeded exactly as measured on
  // production — ACTIVE, modelType "image", capability "text-to-image".
  for (const suffix of VIDEO_SUFFIXES) {
    rows.push(baseRow(suffix, { modelType: "image", capability: "text-to-image" }));
  }
  // A similar-looking REAL image model under the same legacy-suite family
  // (shares the "generate-" prefix and lands via the same code path) that
  // must stay filed as image.
  rows.push(baseRow("generate-4-o-image", { modelType: "image", capability: "text-to-image" }));
  // A similar-looking id that DOES end in "-video" but is legitimately
  // audio (a music video is the track's visual accompaniment, not this
  // app's own video-generation surface) — must stay filed as audio/utility,
  // never swept into the video fix.
  rows.push(baseRow("create-music-video", { modelType: "audio", capability: "audio" }));

  return rows;
}

async function cleanup(prisma) {
  await prisma.modelPricing.deleteMany({ where: { modelId: { startsWith: PREFIX } } });
}

describe("catalog-junk-and-video: BUG 1 (non-generation endpoints) + BUG 2 (video-as-image) — backfill through the real studio-pool query path", () => {
  afterEach(async () => {
    const { default: prisma } = await import("@/lib/prisma");
    await cleanup(prisma);
  });

  it("BUG 1: each of the 5 junk ids is deactivated by the backfill and excluded from every studio pool; the real generator stays visible and in the audio pool", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { getCatalogModels } = await import("@/lib/model-catalog");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });

    const applied = await run({ apply: true, yes: true });
    const mine = (list) => list.filter((f) => f.modelId.startsWith(PREFIX));
    expect(mine(applied.nonGenerationFixes)).toHaveLength(5);

    // Public, default (active-only) listing — exactly what a studio reads.
    const visibleAudio = await getCatalogModels({ modelType: "audio" });
    const visibleIds = visibleAudio.filter((m) => m.modelId.startsWith(PREFIX)).map((m) => m.modelId);
    for (const suffix of JUNK_SUFFIXES) {
      expect(visibleIds, `${suffix} must not be in the public audio pool`).not.toContain(`${PREFIX}${suffix}`);
    }
    // The real generator IS still there, and still routes into the audio
    // group every studio filters on.
    expect(visibleIds).toContain(`${PREFIX}suno-voice-generate`);
    const realGenerator = visibleAudio.find((m) => m.modelId === `${PREFIX}suno-voice-generate`);
    expect(matchesGroup(realGenerator, "audio")).toBe(true);

    // Admin view proves WHY: deactivated with a recorded not-callable
    // verdict, not silently deleted or miscategorized.
    const adminAll = await getCatalogModels({ includeInactive: true, isAdmin: true });
    for (const suffix of JUNK_SUFFIXES) {
      const row = adminAll.find((m) => m.modelId === `${PREFIX}${suffix}`);
      expect(row, `${suffix} should still exist for admin`).toBeTruthy();
      expect(row.constraints.verification).toMatchObject({ verdict: "not-callable", callable: false });
    }

    // Idempotent: a second apply is a no-op.
    const second = await run({ apply: true, yes: true });
    expect(mine(second.nonGenerationFixes)).toEqual([]);
  });

  it("BUG 2: the three video generators resolve to a video capability/modelType and land in the video pool, never the image pool; similar-looking real models are untouched", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { getCatalogModels } = await import("@/lib/model-catalog");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });

    await run({ apply: true, yes: true });

    const imagePool = (await getCatalogModels({ modelType: "image" })).filter((m) => m.modelId.startsWith(PREFIX));
    const videoPool = (await getCatalogModels({ modelType: "video" })).filter((m) => m.modelId.startsWith(PREFIX));

    for (const suffix of VIDEO_SUFFIXES) {
      const id = `${PREFIX}${suffix}`;
      expect(imagePool.map((m) => m.modelId), `${suffix} must NOT be in the image pool`).not.toContain(id);
      const inVideo = videoPool.find((m) => m.modelId === id);
      expect(inVideo, `${suffix} must be in the video pool`).toBeTruthy();
      expect(inVideo.modelType).toBe("video");
      expect(matchesGroup(inVideo, "tti")).toBe(false);
      expect(matchesGroup(inVideo, "ttv")).toBe(true);
    }

    // The real legacy-suite image sibling stays exactly where it was.
    const sibling = imagePool.find((m) => m.modelId === `${PREFIX}generate-4-o-image`);
    expect(sibling).toBeTruthy();
    expect(matchesGroup(sibling, "tti")).toBe(true);

    // The music-video id is NOT swept into video — it's audio, and its
    // audioKind is the same non-composer "utility" bucket every other
    // track-transformer lands in (never the Music studio's actual pool).
    const musicVideo = (await getCatalogModels({ modelType: "audio" })).find((m) => m.modelId === `${PREFIX}create-music-video`);
    expect(musicVideo).toBeTruthy();
    expect(matchesGroup(musicVideo, "ttv")).toBe(false);
    expect(audioKind(musicVideo)).toBe("utility");

    // Idempotent: a second apply changes nothing further.
    const second = await run({ apply: true, yes: true });
    const mine = (list) => list.filter((f) => f.modelId.startsWith(PREFIX));
    expect(mine(second.capabilityFixes)).toEqual([]);
  });

  it("dry run writes nothing for either bug class", async () => {
    const { default: prisma } = await import("@/lib/prisma");
    const { run } = await import("../../scripts/fix-model-categories.mjs");

    await prisma.modelPricing.createMany({ data: buildSeed() });

    const before = await run({ apply: false, yes: false });
    const mine = (list) => list.filter((f) => f.modelId.startsWith(PREFIX));
    expect(mine(before.nonGenerationFixes)).toHaveLength(5);
    expect(mine(before.capabilityFixes).filter((f) => f.to === "text-to-video")).toHaveLength(3);

    const rows = await prisma.modelPricing.findMany({ where: { modelId: { startsWith: PREFIX } } });
    for (const suffix of JUNK_SUFFIXES) {
      const row = rows.find((r) => r.modelId === `${PREFIX}${suffix}`);
      expect(row.isActive).toBe(true); // untouched — dry run wrote nothing
    }
    for (const suffix of VIDEO_SUFFIXES) {
      const row = rows.find((r) => r.modelId === `${PREFIX}${suffix}`);
      expect(row.capability).toBe("text-to-image"); // untouched — dry run wrote nothing
    }
  });
});
