import { test } from "vitest";
import assert from "node:assert/strict";
import { CAPABILITY_GROUPS, matchesGroup } from "@/lib/capability-groups";
import { CAPABILITY_TO_MODEL_TYPE, inferCapability } from "@/lib/model-catalog-core.mjs";

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

// ── BUG FIX: Text-to-Video listed models that cannot do text-to-video ─────
// Real production ids (e.g. wan-2.6-v2v) carried an unambiguous short-form
// direction marker inferCapability used to ignore, so they fell through to
// coarse "video" and landed in ttv even though they need a source
// image/clip. inferCapability (model-catalog-core.mjs) now assigns the
// precise capability for a marked id; this pins that the precise capability
// routes it OUT of ttv and into the correct direction group.
test("no image-to-video/video-to-video model (via a marked id) ends up in ttv — it routes to i2v/v2v instead", () => {
  const i2vModel = { capability: inferCapability("wan-2.6-flash-i2v") };
  const v2vModel = { capability: inferCapability("wan-2.6-v2v") };
  assert.equal(i2vModel.capability, "image-to-video");
  assert.equal(v2vModel.capability, "video-to-video");
  assert.equal(matchesGroup(i2vModel, "ttv"), false);
  assert.equal(matchesGroup(i2vModel, "i2v"), true);
  assert.equal(matchesGroup(v2vModel, "ttv"), false);
  assert.equal(matchesGroup(v2vModel, "v2v"), true);
});

test("a markerless video id stays coarse 'video' and correctly stays IN ttv (not a bug to fix — no direction signal exists)", () => {
  const multiModel = { capability: inferCapability("bytedance/seedance-2") };
  assert.equal(multiModel.capability, "video");
  assert.equal(matchesGroup(multiModel, "ttv"), true);
});

// ── BUG FIX: video generators filed as image models ────────────────────────
// Measured on live production (2026-08-05): generate-ai-video,
// generate-aleph-video, generate-veo-3-video were ACTIVE with
// capability="text-to-image" — placing them in the tti group (Image studio)
// where none of them can run. inferCapability's new trailing-"-video" rule
// (model-catalog-core.mjs) resolves them to the coarse "video" capability,
// which routes into ttv, never tti.
test("the three legacy-suite video generators resolve out of tti and into ttv, not the image pool", () => {
  for (const id of ["generate-ai-video", "generate-aleph-video", "generate-veo-3-video"]) {
    const model = { capability: inferCapability(id) };
    assert.equal(model.capability, "video", `${id} should carry the video capability`);
    assert.equal(matchesGroup(model, "tti"), false, `${id} must not be in tti (the image pool)`);
    assert.equal(matchesGroup(model, "ttv"), true, `${id} must be in ttv (the video pool)`);
  }
});
