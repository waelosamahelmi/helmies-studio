import { test } from "vitest";
import assert from "node:assert/strict";
import { CAPABILITY_GROUPS, matchesGroup } from "@/lib/capability-groups";
import { CAPABILITY_TO_MODEL_TYPE } from "@/lib/model-catalog-core.mjs";

// ── EDITSv1 E1.1: capability groups must tell the truth ────────────────────
// The live catalog files ~14 genuinely working video models under the COARSE
// capability "video" (see CAPABILITY_TO_MODEL_TYPE's header in
// model-catalog-core.mjs — a production preview confirmed they're real
// models, not artifacts), yet no group included "video", so every one of
// them was invisible in every video model picker. Same story for
// "reference-to-video": a real capability the serializer emits, in no group
// at all.

test("ttv includes the coarse 'video' capability (mirrors how tti already includes coarse 'image')", () => {
  assert.ok(CAPABILITY_GROUPS.ttv.includes("text-to-video"));
  assert.ok(CAPABILITY_GROUPS.ttv.includes("video"));
});

test("a new r2v group covers reference-to-video", () => {
  assert.deepEqual(CAPABILITY_GROUPS.r2v, ["reference-to-video"]);
});

test("v2v covers video-upscale", () => {
  assert.ok(CAPABILITY_GROUPS.v2v.includes("video-upscale"));
});

test("every capability the catalog can serve maps into at least one group", () => {
  // CAPABILITY_TO_MODEL_TYPE is the single source of truth for what a
  // non-admin catalog response can carry as `capability` (anything outside
  // it serializes as UNCATEGORIZED and is never shown — see
  // serializeCatalogModel). Every one of those values must be reachable
  // from some studio's group filter.
  const allGroupCaps = new Set(Object.values(CAPABILITY_GROUPS).flat());
  for (const capability of Object.keys(CAPABILITY_TO_MODEL_TYPE)) {
    assert.ok(
      allGroupCaps.has(capability),
      `capability "${capability}" is served by the public catalog but belongs to NO group — models carrying it are invisible in every picker`,
    );
  }
});

test("matchesGroup routes coarse-video models into ttv and reference-to-video into r2v", () => {
  assert.equal(matchesGroup({ capability: "video" }, "ttv"), true);
  assert.equal(matchesGroup({ capability: "video" }, "i2v"), false);
  assert.equal(matchesGroup({ capability: "reference-to-video" }, "r2v"), true);
  assert.equal(matchesGroup({ capability: "reference-to-video" }, "ttv"), false);
  assert.equal(matchesGroup({ capability: "video-upscale" }, "v2v"), true);
});

test("matchesGroup is safe on null models and unknown groups", () => {
  assert.equal(matchesGroup(null, "ttv"), false);
  assert.equal(matchesGroup({ capability: "text-to-video" }, "no-such-group"), false);
});
