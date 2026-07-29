const LLM_SEGMENTS = new Set(["claude", "codex", "grok", "gemini"]);
const MEDIA_EXCEPTIONS = ["grok-imagine", "gemini-omni-video", "gemini-omni-audio", "gemini-omni-character"];

function normalizeScalar(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

function ruleMatches(when = {}, params = {}) {
  return Object.entries(when).every(([key, expected]) => {
    const actual = normalizeScalar(params[key]);
    if (Array.isArray(expected)) return expected.map(normalizeScalar).includes(actual);
    return actual === normalizeScalar(expected);
  });
}

function quantityForUnit(unit, params) {
  switch (unit) {
    case "second": return Number(params.duration ?? params.duration_seconds ?? 0);
    case "image": return Number(params.num_images ?? params.n ?? 1);
    case "character": return String(params.text ?? params.prompt ?? "").length;
    case "minute": return Number(params.duration_minutes ?? ((params.duration ?? 0) / 60));
    case "megapixel": {
      const width = Number(params.width || 0);
      const height = Number(params.height || 0);
      return width && height ? (width * height) / 1_000_000 : Number(params.megapixels || 1);
    }
    case "task":
    case "fixed": return 1;
    default: throw new Error(`Unsupported billing unit: ${unit}`);
  }
}

export function calculateProviderQuote(pricing, params = {}) {
  if (!pricing || !Array.isArray(pricing.rules) || !pricing.rules.length) {
    throw new Error("Model has no verified pricing rules");
  }
  const rule = pricing.rules.find((candidate) => ruleMatches(candidate.when || {}, params));
  if (!rule || !Number.isFinite(Number(rule.price))) {
    throw new Error("No pricing rule matches the requested model parameters");
  }
  const unit = rule.unit || pricing.unit || "fixed";
  const quantity = quantityForUnit(unit, params);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`A positive ${unit} quantity is required`);
  const multiplier = Number(rule.multiplier || 1);
  const providerCost = Number((Number(rule.price) * quantity * multiplier).toFixed(6));
  return {
    providerCost,
    currency: pricing.currency || "USD",
    unit,
    unitPrice: Number(rule.price),
    quantity,
    multiplier,
    matchedRule: rule,
  };
}

export function providerCostToCredits(providerCost, markup = 2.5, creditValue = 0.01) {
  if (!Number.isFinite(providerCost) || providerCost < 0) throw new Error("Invalid provider cost");
  if (!Number.isFinite(markup) || markup <= 0) throw new Error("Invalid provider markup");
  return Math.max(1, Math.ceil((providerCost * markup) / creditValue));
}

export function validateModelInput(schema, params = {}) {
  if (!schema?.fields) return [];
  const errors = [];
  for (const [name, field] of Object.entries(schema.fields)) {
    const value = params[name];
    const missing = value === undefined || value === null || value === "";
    if (field.required && missing) {
      errors.push({ field: name, code: "required", message: `${name} is required` });
      continue;
    }
    if (missing) continue;
    if (field.type === "string" && typeof value !== "string") errors.push({ field: name, code: "type", message: `${name} must be a string` });
    if (field.type === "number" && !Number.isFinite(Number(value))) errors.push({ field: name, code: "type", message: `${name} must be a number` });
    if (field.type === "boolean" && typeof value !== "boolean") errors.push({ field: name, code: "type", message: `${name} must be a boolean` });
    if (field.type === "array" && !Array.isArray(value)) errors.push({ field: name, code: "type", message: `${name} must be an array` });
    if (field.minLength != null && String(value).length < field.minLength) errors.push({ field: name, code: "minLength", message: `${name} is too short` });
    if (field.maxLength != null && String(value).length > field.maxLength) errors.push({ field: name, code: "maxLength", message: `${name} is too long` });
    if (field.minimum != null && Number(value) < field.minimum) errors.push({ field: name, code: "minimum", message: `${name} is below the minimum` });
    if (field.maximum != null && Number(value) > field.maximum) errors.push({ field: name, code: "maximum", message: `${name} exceeds the maximum` });
    if (field.maxItems != null && Array.isArray(value) && value.length > field.maxItems) errors.push({ field: name, code: "maxItems", message: `${name} has too many items` });
    if (field.minItems != null && Array.isArray(value) && value.length < field.minItems) errors.push({ field: name, code: "minItems", message: `${name} has too few items` });
    if (field.enum && !field.enum.map(normalizeScalar).includes(normalizeScalar(value))) errors.push({ field: name, code: "enum", message: `${name} is not supported` });
  }
  return errors;
}

function titleFromSlug(slug) {
  return slug.split(/[\/-]/).filter(Boolean).map((part) => /^v?\d/.test(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function inferCapability(path) {
  if (/text-to-image|text2image/.test(path)) return "text-to-image";
  if (/image-to-image|image-edit|edit-image|remix|character-edit/.test(path)) return "image-to-image";
  if (/image-to-video/.test(path)) return "image-to-video";
  if (/text-to-video/.test(path)) return "text-to-video";
  if (/video-to-video|videoedit|video-edit|style-transform/.test(path)) return "video-to-video";
  if (/reference-to-video|r2v/.test(path)) return "reference-to-video";
  if (/lip-sync|avatar|omnihuman|infinitalk|from-audio/.test(path)) return "avatar-video";
  if (/upscale/.test(path)) return path.includes("video") ? "video-upscale" : "image-upscale";
  if (/remove-background/.test(path)) return "background-removal";
  if (/text-to-speech|tts|dialogue|voice/.test(path)) return "text-to-speech";
  if (/audio|music|suno|sound/.test(path)) return "audio";
  if (/image|imagen|seedream|flux|ideogram|qwen|recraft|gpt-image|nano-banana|z-image/.test(path)) return "image";
  if (/video|kling|wan|seedance|hailuo|pixverse|happyhorse|runway|veo/.test(path)) return "video";
  return "media";
}

function modalitiesForCapability(capability) {
  const map = {
    "text-to-image": [["text"], ["image"]], "image-to-image": [["text", "image"], ["image"]],
    "image-to-video": [["text", "image"], ["video"]], "text-to-video": [["text"], ["video"]],
    "video-to-video": [["text", "video"], ["video"]], "reference-to-video": [["text", "image", "video"], ["video"]],
    "avatar-video": [["image", "audio", "video"], ["video"]], "video-upscale": [["video"], ["video"]],
    "image-upscale": [["image"], ["image"]], "background-removal": [["image"], ["image"]],
    "text-to-speech": [["text"], ["audio"]], audio: [["text", "audio"], ["audio"]], image: [["text", "image"], ["image"]], video: [["text", "image", "video"], ["video"]],
  };
  return map[capability] || [["text"], ["image"]];
}

export function inferKieModelFromUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.hostname !== "docs.kie.ai" || parsed.pathname.startsWith("/cn/")) return null;
  const path = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (!path.includes("/")) return null;
  const parts = path.split("/");
  const marketIndex = parts.indexOf("market");
  if (marketIndex >= 0) {
    const rest = parts.slice(marketIndex + 1);
    const family = rest[0];
    if (LLM_SEGMENTS.has(family) && !MEDIA_EXCEPTIONS.some((item) => path.includes(item))) return null;
    if (["quickstart", "common"].includes(family) || rest.length < 2) return null;
    const modelId = rest.join("/");
    const capability = inferCapability(modelId);
    const [inputModalities, outputModalities] = modalitiesForCapability(capability);
    return { modelId, providerModelId: modelId, endpoint: modelId, displayName: titleFromSlug(modelId), capability, inputModalities, outputModalities, sourceUrl: url };
  }
  return null;
}

export function defaultSchemaForCapability(capability) {
  const fields = { prompt: { type: "string", required: !["image-upscale", "video-upscale", "background-removal"].includes(capability), maxLength: 5000 } };
  if (capability.includes("image-to") || capability === "image-to-image" || capability === "image-upscale" || capability === "background-removal" || capability === "avatar-video") fields.image_url = { type: "string", required: true, format: "uri" };
  if (capability.includes("video-to") || capability === "video-upscale") fields.video_url = { type: "string", required: true, format: "uri" };
  if (capability.includes("video") || capability === "avatar-video") {
    fields.duration = { type: "number", required: false, enum: [5, 8, 10] };
    fields.resolution = { type: "string", required: false, enum: ["480p", "720p", "1080p"] };
    fields.aspect_ratio = { type: "string", required: false, enum: ["16:9", "9:16", "1:1"] };
  } else if (capability.includes("image") || capability === "image") {
    fields.aspect_ratio = { type: "string", required: false, enum: ["1:1", "4:3", "3:4", "16:9", "9:16"] };
    fields.resolution = { type: "string", required: false, enum: ["1k", "2k", "4k"] };
    fields.num_images = { type: "number", required: false, minimum: 1, maximum: 4 };
  }
  return { fields };
}
