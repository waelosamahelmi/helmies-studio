import test from "node:test";
import assert from "node:assert/strict";
import { calculateProviderQuote, validateModelInput, inferKieModelFromUrl } from "../src/lib/model-catalog-core.mjs";
import { formatAlibabaPayload, getAlibabaApiPath } from "../src/lib/alibaba-provider-core.mjs";

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
