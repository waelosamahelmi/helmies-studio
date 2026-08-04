import { test } from "vitest";
import assert from "node:assert/strict";
import { calculateProviderQuote, validateModelInput, inferKieModelFromUrl, sanitizeCatalogDescription, sanitizeDisplayName, audioKind, inferCapability } from "@/lib/model-catalog-core.mjs";
import { CAPABILITY_GROUPS, matchesGroup } from "@/lib/capability-groups";
import { formatAlibabaPayload, getAlibabaApiPath } from "@/lib/alibaba-provider-core.mjs";

test("quotes a fixed per-image model with output count", () => {
  const quote = calculateProviderQuote({ unit: "image", rules: [{ price: 0.03 }] }, { num_images: 4 });
  assert.equal(quote.providerCost, 0.12);
  assert.equal(quote.quantity, 4);
});

test("quotes video seconds using the matching resolution tier", () => {
  const quote = calculateProviderQuote({
    unit: "second",
    rules: [
      { when: { resolution: "720p" }, price: 0.1 },
      { when: { resolution: "1080p" }, price: 0.15 },
    ],
  }, { duration: 10, resolution: "1080p" });
  assert.equal(quote.providerCost, 1.5);
  assert.equal(quote.unitPrice, 0.15);
});

test("quotes mode and resolution combinations", () => {
  const quote = calculateProviderQuote({
    unit: "second",
    rules: [
      { when: { mode: "standard", resolution: "720p" }, price: 0.04 },
      { when: { mode: "professional", resolution: "720p" }, price: 0.08 },
    ],
  }, { duration: 6, resolution: "720P", mode: "professional" });
  assert.equal(quote.providerCost, 0.48);
});

test("rejects a quote when no pricing rule matches", () => {
  assert.throws(() => calculateProviderQuote({
    unit: "second",
    rules: [{ when: { resolution: "720p" }, price: 0.1 }],
  }, { duration: 5, resolution: "4k" }), /No pricing rule/);
});

test("validates required inputs, enum values, ranges, and arrays", () => {
  const schema = {
    fields: {
      prompt: { type: "string", required: true, minLength: 2 },
      duration: { type: "number", required: true, enum: [5, 10, 15] },
      resolution: { type: "string", enum: ["720p", "1080p"] },
      images_list: { type: "array", maxItems: 3 },
    },
  };
  assert.deepEqual(validateModelInput(schema, { prompt: "Film", duration: 10, resolution: "1080P", images_list: ["a"] }), []);
  const errors = validateModelInput(schema, { prompt: "", duration: 7, images_list: [1, 2, 3, 4] });
  assert.equal(errors.length, 3);
});

test("infers non-LLM KIE capabilities from official documentation URLs", () => {
  const video = inferKieModelFromUrl("https://docs.kie.ai/market/wan/2-7-image-to-video");
  assert.equal(video.modelId, "wan/2-7-image-to-video");
  assert.equal(video.capability, "image-to-video");
  assert.deepEqual(video.inputModalities, ["text", "image"]);
  assert.equal(inferKieModelFromUrl("https://docs.kie.ai/market/claude/claude-opus-5"), null);
});

// ── BUG FIX: Text-to-Video listed models that cannot do text-to-video ─────
// The coarse "video" capability legitimately belongs in CAPABILITY_GROUPS.ttv
// (capability-groups.js) for models whose id gives NO direction signal — but
// several production ids DO carry an unambiguous short-form direction marker
// ("-i2v"/"-v2v"/"-t2v", not the spelled-out "image-to-video" the earlier
// rules already caught) that inferCapability used to ignore, falling all the
// way through to the coarse "video" catch-all. Measured production example:
// wan-2.6-v2v (a video-to-video model) was the CHEAPEST model in the T2V
// pool. These tests pin the exact marker rules and the conservative "leave
// it alone with no signal" behavior.
test("inferCapability: '-i2v' suffix maps to image-to-video even without the spelled-out phrase", () => {
  for (const id of ["wan-2.2-turbo-i2v", "wan-2.5-i2v", "wan-2.6-flash-i2v", "wan-2.6-i2v", "wan-2.7-i2v", "wan/2-2-turbo-i2v"]) {
    assert.equal(inferCapability(id), "image-to-video", `${id} should be image-to-video`);
  }
});

test("inferCapability: '-v2v' suffix and '/extend' (video extend) map to video-to-video", () => {
  for (const id of ["wan-2.6-v2v", "wan-2.6-flash-v2v", "pixverse/extend"]) {
    assert.equal(inferCapability(id), "video-to-video", `${id} should be video-to-video`);
  }
});

test("inferCapability: '-t2v' suffix maps to text-to-video even without the spelled-out phrase", () => {
  for (const id of ["wan-2.5-t2v", "wan-2.6-t2v", "wan-2.7-t2v"]) {
    assert.equal(inferCapability(id), "text-to-video", `${id} should be text-to-video`);
  }
});

test("inferCapability: the spelled-out phrases still work exactly as before (regression)", () => {
  assert.equal(inferCapability("wan-2-6-image-to-video"), "image-to-video");
  assert.equal(inferCapability("wan-2-6-text-to-video"), "text-to-video");
  assert.equal(inferCapability("wan-2-6-video-to-video"), "video-to-video");
  assert.equal(inferCapability("wan-2-7-videoedit"), "video-to-video");
});

test("inferCapability: img2vid also maps to image-to-video", () => {
  assert.equal(inferCapability("runway-img2vid"), "image-to-video");
});

test("inferCapability: an id with NO direction marker at all still falls through to the coarse 'video' fallback — conservative by design", () => {
  for (const id of ["kling/pro", "bytedance/seedance-2", "wan-animate-move", "wan-animate-replace", "wan-speech-to-video", "wan/2-2-animate-move", "pixverse/transition"]) {
    assert.equal(inferCapability(id), "video", `${id} should stay coarse "video" — no unambiguous marker`);
  }
});

test("inferCapability: an id with no signal whatsoever falls through to the last-resort 'media'", () => {
  assert.equal(inferCapability("some-totally-unrecognized-thing"), "media");
});

test("Group membership: no image-to-video/video-to-video model ends up in the ttv group; markers route to i2v/v2v", () => {
  const i2vIds = ["wan-2.2-turbo-i2v", "wan-2.5-i2v", "wan-2.6-flash-i2v", "wan-2.6-i2v", "wan-2.7-i2v"];
  const v2vIds = ["wan-2.6-v2v", "wan-2.6-flash-v2v", "pixverse/extend"];
  const t2vIds = ["wan-2.5-t2v", "wan-2.6-t2v", "wan-2.7-t2v"];

  for (const id of i2vIds) {
    const capability = inferCapability(id);
    assert.equal(matchesGroup({ capability }, "ttv"), false, `${id} (${capability}) must not be in ttv`);
    assert.equal(matchesGroup({ capability }, "i2v"), true, `${id} (${capability}) must be in i2v`);
  }
  for (const id of v2vIds) {
    const capability = inferCapability(id);
    assert.equal(matchesGroup({ capability }, "ttv"), false, `${id} (${capability}) must not be in ttv`);
    assert.equal(matchesGroup({ capability }, "v2v"), true, `${id} (${capability}) must be in v2v`);
  }
  // Genuinely t2v/multi ids stay in ttv, whether marker-precise or coarse.
  for (const id of [...t2vIds, "kling/pro", "bytedance/seedance-2", "wan-animate-move", "wan-speech-to-video"]) {
    const capability = inferCapability(id);
    assert.equal(matchesGroup({ capability }, "ttv"), true, `${id} (${capability}) must be in ttv`);
  }
  assert.ok(CAPABILITY_GROUPS.ttv.includes("video")); // coarse video is still valid for markerless ids
});

test("formats Alibaba native model payloads", () => {
  const payload = formatAlibabaPayload("wan2.7-i2v", "Camera circles the subject", {
    image_url: "https://cdn.example/source.jpg",
    duration: 10,
    resolution: "1080p",
    aspect_ratio: "16:9",
    endpoint: "wan2.7-i2v",
  });
  assert.equal(payload.model, "wan2.7-i2v");
  assert.equal(payload.input.img_url, "https://cdn.example/source.jpg");
  assert.equal(payload.parameters.duration, 10);
  assert.equal(payload.parameters.size, "1920*1080");
  assert.equal(payload.parameters.resolution, undefined);
  assert.equal(payload.input.endpoint, undefined);
});

test("routes Alibaba media models to their DashScope service", () => {
  assert.match(getAlibabaApiPath("wan2.7-t2v"), /video-generation/);
  assert.match(getAlibabaApiPath("qwen-image-2.0-pro"), /text2image/);
});

// ── URGENT production fix: hide upstream provider identity baked into
// description TEXT, not just structured fields (measured bug: 35 of 39
// live image-model descriptions plainly named "KIE" even though
// providerName was already hidden from the public catalog response) ──────
test("sanitizeCatalogDescription strips a known provider token and keeps the rest of the sentence", () => {
  const cleaned = sanitizeCatalogDescription("Nano Banana Pro via the KIE Market API.");
  assert.doesNotMatch(cleaned, /kie/i);
  assert.match(cleaned, /Nano Banana Pro/);
});

test("sanitizeCatalogDescription does NOT strip 'Qwen' — it's a model family, not an upstream provider", () => {
  assert.equal(
    sanitizeCatalogDescription("Qwen Image Max via the KIE Market API."),
    "Qwen Image Max via the Market API.",
  );
});

test("sanitizeCatalogDescription is case-insensitive and matches whole-word provider tokens (Alibaba, DashScope, WaveSpeed, OpenRouter)", () => {
  assert.doesNotMatch(sanitizeCatalogDescription("Routed via alibaba's DashScope backend."), /alibaba/i);
  assert.doesNotMatch(sanitizeCatalogDescription("Served through WaveSpeed and OpenRouter."), /wavespeed|openrouter/i);
});

test("sanitizeCatalogDescription returns null for a description that becomes degenerate (only filler words) after scrubbing", () => {
  // No subject at all once "KIE" is removed — "via the Market API." is
  // pure connective filler, not a real description of anything.
  assert.equal(sanitizeCatalogDescription("via the KIE Market API."), null);
});

test("sanitizeCatalogDescription leaves a description with no provider token completely unchanged", () => {
  const original = "4K generation, editing, brand-color control, text rendering, and up to nine references.";
  assert.equal(sanitizeCatalogDescription(original), original);
});

test("sanitizeCatalogDescription returns null for null/empty input", () => {
  assert.equal(sanitizeCatalogDescription(null), null);
  assert.equal(sanitizeCatalogDescription(""), null);
});

// ── URGENT production fix: hide upstream provider identity baked into
// DISPLAYNAME, not just the id/description (measured bug: two live Alibaba
// audio rows — qwen3-tts-flash, qwen3-tts-instruct-flash — reported
// displayName "Alibaba:qwen3 TTS Flash" / "Alibaba:qwen3 TTS Instruct
// Flash" even though the public catalog already strips the same
// "alibaba:" prefix from the id) ────────────────────────────────────────
test("sanitizeDisplayName strips a leading '<providerName>:' prefix and re-cases the remainder via the same acronym/title-case machinery as slugToTitle", () => {
  assert.equal(sanitizeDisplayName("Alibaba:qwen3 TTS Flash", "Alibaba"), "Qwen3 TTS Flash");
  assert.equal(sanitizeDisplayName("Alibaba:qwen3 TTS Instruct Flash", "Alibaba"), "Qwen3 TTS Instruct Flash");
});

test("sanitizeDisplayName leaves a displayName with no provider prefix completely unchanged", () => {
  assert.equal(sanitizeDisplayName("Qwen Image Max", "Alibaba"), "Qwen Image Max");
  assert.equal(sanitizeDisplayName("Seedance 1.5 Pro", "KIE"), "Seedance 1.5 Pro");
  assert.equal(sanitizeDisplayName("GPT-4o Image", "KIE"), "GPT-4o Image");
  assert.equal(sanitizeDisplayName("Generate AI Video", "KIE"), "Generate AI Video");
});

test("sanitizeDisplayName does NOT strip 'Qwen' when it isn't a leading '<providerName>:' prefix — it's a model family name, not an upstream provider tag", () => {
  // "Qwen" here is just the first word of the name, not "Alibaba:" — only
  // an exact leading "<providerName>:" match is ever stripped.
  assert.equal(sanitizeDisplayName("Qwen Image Max", "Alibaba"), "Qwen Image Max");
  assert.equal(sanitizeDisplayName("Qwen:Image Max", "Qwen"), "Image Max"); // would only strip if providerName itself were "Qwen"
});

test("sanitizeDisplayName is case-insensitive when matching the provider prefix", () => {
  assert.equal(sanitizeDisplayName("alibaba:qwen3 tts flash", "Alibaba"), "Qwen3 TTS Flash");
});

test("sanitizeDisplayName returns the input unchanged for null/empty displayName or providerName", () => {
  assert.equal(sanitizeDisplayName(null, "Alibaba"), null);
  assert.equal(sanitizeDisplayName("Qwen Image Max", null), "Qwen Image Max");
  assert.equal(sanitizeDisplayName("", "Alibaba"), "");
});

// ── EDITSv1 E1.1: audio subcategorization ─────────────────────────────────
// Every KIE audio utility lands in the DB as the coarse capability "audio"
// (and every speech model as "text-to-speech"), which is far too coarse for
// honest studio pools: "convert-to-wav" is not a composer and
// "generate-music" is not a sound effect. audioKind() infers the honest
// sub-kind from id/endpoint tokens (capability alone as fallback). The
// token precedence below is load-bearing — each case here pins one rule.

test("audioKind: dialogue tokens win over the tts capability fallback", () => {
  assert.equal(audioKind({ capability: "text-to-speech", modelId: "elevenlabs-text-to-dialogue-v3" }), "dialogue");
});

test("audioKind: plain TTS ids are tts", () => {
  assert.equal(audioKind({ capability: "text-to-speech", modelId: "elevenlabs-text-to-speech-turbo-2.5" }), "tts");
  assert.equal(audioKind({ capability: "text-to-speech", modelId: "gemini-3-1-flash-tts" }), "tts");
  // No id token at all — the text-to-speech capability itself means tts.
  assert.equal(audioKind({ capability: "text-to-speech", modelId: "some-new-speech-model" }), "tts");
});

test("audioKind: voice-generate/persona beat the tts capability (suno-voice-generate is a voice cloner, not a reader)", () => {
  assert.equal(audioKind({ capability: "text-to-speech", modelId: "suno-voice-generate" }), "voice-clone");
  assert.equal(audioKind({ capability: "audio", modelId: "generate-persona" }), "voice-clone");
});

test("audioKind: sound-effect ids are sfx", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "generate-sounds" }), "sfx");
});

test("audioKind: enhancement tokens (isolation, boost, separation) beat the music tokens", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "audio-isolation" }), "enhancement");
  assert.equal(audioKind({ capability: "audio", modelId: "elevenlabs-audio-isolation" }), "enhancement");
  // "boost-music-style" contains "music" — the enhancement rule must run first.
  assert.equal(audioKind({ capability: "audio", modelId: "boost-music-style" }), "enhancement");
  assert.equal(audioKind({ capability: "audio", modelId: "separate-vocals" }), "enhancement");
});

test("audioKind: conversion ids (wav, midi) are conversion", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "convert-to-wav" }), "conversion");
  assert.equal(audioKind({ capability: "audio", modelId: "generate-midi" }), "conversion");
});

// ── BUG FIX: Music listed utilities, not composers ─────────────────────────
// Only a genuine FROM-SCRATCH composer is "music" — "generate-music" itself
// and a bare versioned Suno engine selector ("suno-v5", ...). Every id that
// TRANSFORMS/EXTENDS/COVERS an existing track used to share a token with the
// Suno family (a bare "cover"/"mashup"/"suno" substring) and landed as
// "music" too — this is the fix, superseding the old, too-broad test above.
test("audioKind: only a from-scratch composer is music", () => {
  for (const id of ["generate-music", "suno-v5", "suno-v4.5-plus", "suno-v4"]) {
    assert.equal(audioKind({ capability: "audio", modelId: id }), "music", `${id} should be music`);
  }
});

test("audioKind: a track TRANSFORMER (extends/covers/replaces an EXISTING track) is never music — it falls to utility so Audio Tools lists it", () => {
  for (const id of ["extend-music", "add-instrumental", "add-vocals", "cover-suno", "upload-and-cover-audio", "upload-and-extend-audio", "replace-section", "generate-mashup"]) {
    assert.equal(audioKind({ capability: "audio", modelId: id }), "utility", `${id} should be utility, not music`);
  }
});

test("audioKind: anything else with capability audio is utility", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "generate-lyrics" }), "utility");
  assert.equal(audioKind({ capability: "audio", modelId: "create-music-video" }), "utility");
});

test("audioKind: reads the endpoint when the id itself carries no token, and returns null outside the audio family", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "acme-model", endpoint: "generate-music" }), "music");
  assert.equal(audioKind({ capability: "text-to-video", modelId: "generate-music" }), null);
  assert.equal(audioKind(null), null);
});

// ── The exact live production audio sub-model pool (kie-sync.js's "Audio
// sub-models (Suno suite)" pricing overrides) — every one of these must land
// in its stated bucket. Diagnosed from LIVE production: the Music studio's
// pool was these 14 ids (audioKind === "music"); the cost-sorted pick landed
// on "replace-section", a section-replacer that cannot compose from
// scratch. After the fix, only "generate-music" is a composer — every
// transformer moves to a bucket AudioToolsStudio pools
// (enhancement/conversion/utility).
test("audioKind: the exact live production audio pool lands in its stated bucket — Music pool contains no transformer", () => {
  const expected = {
    "generate-music": "music",
    "extend-music": "utility",
    "upload-and-cover-audio": "utility",
    "upload-and-extend-audio": "utility",
    "add-instrumental": "utility",
    "add-vocals": "utility",
    "cover-suno": "utility",
    "replace-section": "utility",
    "generate-persona": "voice-clone",
    "generate-mashup": "utility",
    "generate-lyrics": "utility",
    "generate-sounds": "sfx",
    "suno-voice-generate": "voice-clone",
    "generate-midi": "conversion",
    "create-music-video": "utility",
    "separate-vocals": "enhancement",
    "convert-to-wav": "conversion",
    "boost-music-style": "enhancement",
    "audio-isolation": "enhancement",
  };
  const AUDIO_TOOLS_KINDS = new Set(["enhancement", "conversion", "utility"]);
  for (const [modelId, kind] of Object.entries(expected)) {
    const actual = audioKind({ capability: "audio", modelId });
    assert.equal(actual, kind, `${modelId} should be "${kind}", got "${actual}"`);
    if (kind === "music") {
      assert.ok(!AUDIO_TOOLS_KINDS.has(actual), `${modelId} (music) must not also qualify for Audio Tools`);
    } else if (AUDIO_TOOLS_KINDS.has(kind)) {
      assert.notEqual(actual, "music", `${modelId} must not be in the Music pool`);
    }
  }
  // The Music pool (audioKind === "music") is exactly generate-music.
  const musicPool = Object.keys(expected).filter((id) => audioKind({ capability: "audio", modelId: id }) === "music");
  assert.deepEqual(musicPool, ["generate-music"]);
  // Audio Tools (enhancement/conversion/utility) lists every transformer.
  const audioToolsPool = Object.keys(expected).filter((id) => AUDIO_TOOLS_KINDS.has(audioKind({ capability: "audio", modelId: id })));
  for (const transformer of ["extend-music", "upload-and-cover-audio", "upload-and-extend-audio", "add-instrumental", "add-vocals", "cover-suno", "replace-section", "generate-mashup", "boost-music-style"]) {
    assert.ok(audioToolsPool.includes(transformer), `${transformer} must be listed in Audio Tools`);
  }
});
