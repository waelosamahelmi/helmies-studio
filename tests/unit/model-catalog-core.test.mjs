import { test } from "vitest";
import assert from "node:assert/strict";
import { calculateProviderQuote, validateModelInput, inferKieModelFromUrl, sanitizeCatalogDescription, sanitizeDisplayName } from "@/lib/model-catalog-core.mjs";
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
