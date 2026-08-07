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
  for (const id of ["kling/pro", "bytedance/seedance-2", "wan-speech-to-video", "pixverse/transition"]) {
    assert.equal(inferCapability(id), "video", `${id} should stay coarse "video" — no unambiguous marker`);
  }
});

// The `animate-*` and `motion-control` families DO carry an unambiguous
// marker: every one of them REQUIRES both an image and a video
// (`image_url*` + `video_url*`, or `input_urls*` + `video_urls*`) — they
// place an identity into existing footage. Filing them as coarse "video"
// put them in the ttv group, where the planner could pick one for a
// text-only step and the provider rejected every such run. They are their
// own capability now; see CAPABILITY_GROUPS.recast.
test("inferCapability: identity-transfer families are recast, not coarse video", () => {
  for (const id of ["wan-animate-move", "wan-animate-replace", "wan/2-2-animate-move", "kling-3.0/motion-control"]) {
    assert.equal(inferCapability(id), "recast", `${id} requires an image AND a video — it is identity transfer`);
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
  for (const id of [...t2vIds, "kling/pro", "bytedance/seedance-2", "wan-speech-to-video"]) {
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
  // BUG 3: the image family is NOT on text2image/image-synthesis. Live
  // probing on 2026-08-04 got 403 AccessDenied there for 9 of the 10 catalog
  // image models (including this one) while the synchronous
  // multimodal-generation route returned a real image — see
  // src/lib/alibaba-provider-core.mjs's header for the full matrix and
  // tests/unit/alibaba-routing.test.mjs for the per-model coverage.
  assert.match(getAlibabaApiPath("qwen-image-2.0-pro"), /multimodal-generation/);
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

// ── M1 fix B: KIE sitemap-slug → real API model-id normalization ──────────
// docs/model-audit/image-market.md (root causes #8/#9) and video-market.md
// (root cause #7) verified, per family, what the real `model` field is. The
// old blanket `<letters><digits>` → `<letters>-<digits>` hyphenation was
// correct ONLY for flux2 and actively broke qwen2/qwen3; the rest of the
// corrections (version dots, Kling version prefixes, PixVerse -v6, bare ids)
// are doc-pinned one by one here.
function kieId(url) {
  return inferKieModelFromUrl(url)?.modelId ?? null;
}

test("KIE id normalization: flux2 → flux-2 (the one live-verified hyphenation — image-market.md, Flux 2)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/flux2/pro-text-to-image"), "flux-2/pro-text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/flux2/pro-image-to-image"), "flux-2/pro-image-to-image");
});

test("KIE id normalization: qwen2/qwen3 stay UNHYPHENATED (image-market.md root cause #8 — the API id is qwen2/*, the hyphenated qwen-2/* rows 422)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/qwen2/image-edit"), "qwen2/image-edit");
  assert.equal(kieId("https://docs.kie.ai/market/qwen2/text-to-image"), "qwen2/text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/qwen3/text-to-image"), "qwen3/text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/qwen3/image-to-image"), "qwen3/image-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/qwen3-pro/text-to-image"), "qwen3-pro/text-to-image");
});

test("KIE id corrections: bytedance/seedance-1-5-pro gets its version DOT (video-market.md — dash form confirmed live-422'd)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/bytedance/seedance-1-5-pro"), "bytedance/seedance-1.5-pro");
  // Siblings whose slug IS the real id are untouched.
  assert.equal(kieId("https://docs.kie.ai/market/bytedance/seedance-2"), "bytedance/seedance-2");
});

test("KIE id corrections: Kling version-prefixed ids (video-market.md, Kling section)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/kling/text-to-video"), "kling-2.6/text-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/kling/image-to-video"), "kling-2.6/image-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/kling/kling-3-0"), "kling-3.0/video");
  assert.equal(kieId("https://docs.kie.ai/market/kling/motion-control"), "kling-2.6/motion-control");
  assert.equal(kieId("https://docs.kie.ai/market/kling/motion-control-v3"), "kling-3.0/motion-control");
  assert.equal(kieId("https://docs.kie.ai/market/kling/v25-turbo-text-to-video-pro"), "kling/v2-5-turbo-text-to-video-pro");
  assert.equal(kieId("https://docs.kie.ai/market/kling/v25-turbo-image-to-video-pro"), "kling/v2-5-turbo-image-to-video-pro");
  // Kling ids the doc confirms match their slug exactly stay verbatim.
  assert.equal(kieId("https://docs.kie.ai/market/kling/v2-1-master-text-to-video"), "kling/v2-1-master-text-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/kling/v3-turbo-text-to-video"), "kling/v3-turbo-text-to-video");
});

test("KIE id corrections: PixVerse ids carry the -v6 version segment the slug omits (video-market.md, PixVerse section)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/pixverse/text-to-video"), "pixverse-v6/text-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/pixverse/image-to-video"), "pixverse-v6/image-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/pixverse/transition"), "pixverse-v6/transition");
  assert.equal(kieId("https://docs.kie.ai/market/pixverse/extend"), "pixverse-v6/extend");
  assert.equal(kieId("https://docs.kie.ai/market/pixverse/reference-to-video"), "pixverse-v6/reference-to-video");
});

test("KIE id corrections: bare-model prefix drift — exactly the audit-named ids lose their folder prefix, nothing else (image-market.md root cause #9)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/google/nanobanana2"), "nano-banana-2");
  assert.equal(kieId("https://docs.kie.ai/market/google/nano-banana-2-lite"), "nano-banana-2-lite");
  assert.equal(kieId("https://docs.kie.ai/market/google/pro-image-to-image"), "nano-banana-pro");
  assert.equal(kieId("https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image"), "gpt-image-2-text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image"), "gpt-image-2-image-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/z-image/z-image"), "z-image");
  // Scope guard: plain google/nano-banana (and imagen4) are live-verified
  // working WITH their prefix — the strip must never widen to the folder.
  assert.equal(kieId("https://docs.kie.ai/market/google/nano-banana"), "google/nano-banana");
  assert.equal(kieId("https://docs.kie.ai/market/google/nano-banana-edit"), "google/nano-banana-edit");
  assert.equal(kieId("https://docs.kie.ai/market/google/imagen4"), "google/imagen4");
});

test("KIE id corrections: dotted-version slugs (image-market.md — Seedream 4.5, GPT-Image 1.5; the folder-index page is Seedream 3.0 = bytedance/seedream)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/seedream/4-5-text-to-image"), "seedream/4.5-text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/seedream/4-5-edit"), "seedream/4.5-edit");
  assert.equal(kieId("https://docs.kie.ai/market/seedream/seedream"), "bytedance/seedream");
  assert.equal(kieId("https://docs.kie.ai/market/gpt-image/1-5-text-to-image"), "gpt-image/1.5-text-to-image");
  assert.equal(kieId("https://docs.kie.ai/market/gpt-image/1-5-image-to-image"), "gpt-image/1.5-image-to-image");
  // 5-lite/5-pro have no decimal point — untouched.
  assert.equal(kieId("https://docs.kie.ai/market/seedream/5-lite-text-to-image"), "seedream/5-lite-text-to-image");
});

test("KIE id corrections: grok-imagine/1-5-preview maps to its non-conforming real id (video-market.md)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/grok-imagine/1-5-preview"), "grok-imagine-video-1-5-preview");
});

// ── M1 fix C: root-level (single-segment) market pages are real models ─────
// video-market.md: gemini-omni-video/-audio/-character and omnihuman-1-5 are
// all documented against the real createTask endpoint but were dropped by the
// old `rest.length < 2` guard. The LLM check must exact-match the FULL
// segment, so "gemini-omni-video" is never treated as family "gemini".
test("KIE sync: single-segment market pages (gemini-omni-*, omnihuman-1-5) pass inferKieModelFromUrl with a real capability", () => {
  const video = inferKieModelFromUrl("https://docs.kie.ai/market/gemini-omni-video");
  assert.equal(video?.modelId, "gemini-omni-video");
  assert.equal(video?.capability, "video");
  const audio = inferKieModelFromUrl("https://docs.kie.ai/market/gemini-omni-audio");
  assert.equal(audio?.modelId, "gemini-omni-audio");
  assert.equal(audio?.capability, "audio");
  const character = inferKieModelFromUrl("https://docs.kie.ai/market/gemini-omni-character");
  assert.equal(character?.modelId, "gemini-omni-character");
  assert.equal(character?.capability, "avatar-video");
  const omnihuman = inferKieModelFromUrl("https://docs.kie.ai/market/omnihuman-1-5");
  assert.equal(omnihuman?.modelId, "omnihuman-1-5");
  assert.equal(omnihuman?.capability, "avatar-video");
});

test("KIE sync: genuinely-LLM market families are still rejected — exact family match, and quickstart stays out", () => {
  assert.equal(inferKieModelFromUrl("https://docs.kie.ai/market/gemini/gemini-3-flash"), null);
  assert.equal(inferKieModelFromUrl("https://docs.kie.ai/market/claude/claude-opus-5"), null);
  assert.equal(inferKieModelFromUrl("https://docs.kie.ai/market/quickstart"), null);
});

test("KIE sync: MiniMax-H3 URLs pass inferKieModelFromUrl unchanged (video-market.md — vendor absent from catalog; no code gate may eat these)", () => {
  assert.equal(kieId("https://docs.kie.ai/market/minimax-h3/text-to-video"), "minimax-h3/text-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/minimax-h3/image-to-video"), "minimax-h3/image-to-video");
  assert.equal(kieId("https://docs.kie.ai/market/minimax-h3/reference-to-video"), "minimax-h3/reference-to-video");
});

// ── M1 fix G: output-type misfilings + substring collisions ────────────────
test("inferCapability: cover-suno outputs IMAGES and create-music-video outputs VIDEO (audio-music.md) — never classified audio", () => {
  assert.equal(inferCapability("cover-suno"), "image");
  assert.equal(inferCapability("create-music-video"), "video");
});

test("inferCapability: lipsync markers beat the video-to-video substring (video-market.md root cause #9 — volcengine/video-to-video-lip-sync)", () => {
  assert.equal(inferCapability("volcengine/video-to-video-lip-sync"), "avatar-video");
  // The plain v2v ids the old ordering served are unchanged.
  assert.equal(inferCapability("wan/2-6-video-to-video"), "video-to-video");
  assert.equal(inferCapability("wan-2-7-videoedit"), "video-to-video");
});

test("audioKind: every Suno voice-clone workflow step classifies voice-clone (audio-music.md — old rule caught only the literal 'voice-generate')", () => {
  for (const id of [
    "suno-voice-generate",
    "suno-voice-generate-callback",
    "suno-voice-validate",
    "suno-voice-validate-callback",
    "suno-voice-validate-info",
    "suno-voice-record-info",
    "suno-voice-regenerate",
    "suno-voice-check-voice",
  ]) {
    assert.equal(audioKind({ capability: "text-to-speech", modelId: id }), "voice-clone", `${id} should be voice-clone`);
  }
});
