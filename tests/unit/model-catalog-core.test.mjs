import { test } from "vitest";
import assert from "node:assert/strict";
import { calculateProviderQuote, validateModelInput, inferKieModelFromUrl, sanitizeCatalogDescription, sanitizeDisplayName, audioKind } from "@/lib/model-catalog-core.mjs";
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

test("audioKind: the Suno composition family is music", () => {
  for (const id of ["generate-music", "extend-music", "add-instrumental", "add-vocals", "cover-suno", "upload-and-cover-audio", "replace-section", "generate-mashup", "suno-v5"]) {
    assert.equal(audioKind({ capability: "audio", modelId: id }), "music", `${id} should be music`);
  }
});

test("audioKind: anything else with capability audio is utility", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "generate-lyrics" }), "utility");
  assert.equal(audioKind({ capability: "audio", modelId: "create-music-video" }), "utility");
  assert.equal(audioKind({ capability: "audio", modelId: "upload-and-extend-audio" }), "utility");
});

test("audioKind: reads the endpoint when the id itself carries no token, and returns null outside the audio family", () => {
  assert.equal(audioKind({ capability: "audio", modelId: "acme-model", endpoint: "generate-music" }), "music");
  assert.equal(audioKind({ capability: "text-to-video", modelId: "generate-music" }), null);
  assert.equal(audioKind(null), null);
});
