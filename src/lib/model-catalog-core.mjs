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

// ── modelType single source of truth (URGENT production fix) ──────────────
// ModelPricing.modelType and ModelPricing.capability used to be computed
// independently — kie-sync.js's own inferModelType(path) guessed a modelType
// straight from the URL text, completely separately from the capability
// inferKieModelFromUrl (below) derived from that SAME text, and the two
// disagreed constantly (e.g. every Bytedance Seedance model landed with
// capability="video" but modelType="image", because inferModelType's regex
// list had no case for "seedance" and fell through to its "image" default).
// Every place that wrote modelType now MUST go through this one function
// instead of guessing its own. A capability with no entry here — including
// null/undefined, and a bare/generic "image" or "video" capability a sync's
// own fallback produced because it couldn't tell direction from the slug —
// intentionally returns null. Callers must treat that as UNCATEGORIZED
// (never displayed to end users, see serializeCatalogModel/getCatalogModels
// in model-catalog.js) rather than silently guess a category for it; the
// model needs its capability fixed at the sync source.
export const CAPABILITY_TO_MODEL_TYPE = {
  "text-to-image": "image",
  "image-to-image": "i2i",
  "text-to-video": "video",
  "image-to-video": "i2v",
  "video-to-video": "v2v",
  "reference-to-video": "video",
  "avatar-video": "lipsync",
  "text-to-speech": "audio",
  audio: "audio",
  "image-upscale": "i2i",
  "video-upscale": "v2v",
  "background-removal": "i2i",
};

export const UNCATEGORIZED_MODEL_TYPE = "uncategorized";

export function modelTypeForCapability(capability) {
  if (!capability) return null;
  return CAPABILITY_TO_MODEL_TYPE[capability] || null;
}

// ── Display names ───────────────────────────────────────────────────────────
// KIE's sitemap gives us a URL slug, not a clean product name, so every KIE-
// synced model's displayName was auto-titled from that slug. The naive
// titleFromSlug this replaces treated "/" and "-" identically and never
// re-joined split version numbers, which is how "bytedance/seedance-1-5-pro"
// became "Bytedance Seedance 1 5 Pro" (leaking the upstream vendor AND
// splitting "1.5" into two words) and "flux-2/flex-text-to-image" became
// "Flux 2 Flex Text To Image" (redundantly repeating the capability the
// model is already filed under). slugToTitle fixes both: it drops a leading
// vendor/company folder segment (a small, explicit, extend-as-you-find-them
// set — NOT a blanket drop, since plenty of folder segments are the actual
// model brand, e.g. "wan/2-7-image-to-video" must keep "Wan"), re-joins
// numeric run-ons into dotted version numbers, and strips a trailing phrase
// that just repeats the model's own capability.
const VENDOR_FOLDER_NAMES = new Set(["bytedance"]);

// Worst-offender exact overrides, keyed by either the full modelId or just
// its final path segment (so they still match whether or not a vendor
// folder prefixes the real id). Add to this as more bad names turn up.
export const DISPLAY_NAME_OVERRIDES = {
  "generate-4-o-image": "GPT-4o Image",
};

const CAPABILITY_SUFFIX_WORDS = {
  "text-to-image": ["text", "to", "image"],
  "image-to-image": ["image", "to", "image"],
  "text-to-video": ["text", "to", "video"],
  "image-to-video": ["image", "to", "video"],
  "video-to-video": ["video", "to", "video"],
  "reference-to-video": ["reference", "to", "video"],
  "text-to-speech": ["text", "to", "speech"],
  "image-upscale": ["image", "upscale"],
  "video-upscale": ["video", "upscale"],
  "background-removal": ["background", "removal"],
  "avatar-video": ["avatar", "video"],
};

function titleCaseToken(token) {
  if (/^[\d.]+$/.test(token)) return token; // pure number / version ("1.5") — leave as-is
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function slugToTitle(rawId, { capability } = {}) {
  if (!rawId) return rawId;
  const segments = String(rawId).split("/").filter(Boolean);
  const basename = segments[segments.length - 1];

  if (DISPLAY_NAME_OVERRIDES[rawId]) return DISPLAY_NAME_OVERRIDES[rawId];
  if (DISPLAY_NAME_OVERRIDES[basename]) return DISPLAY_NAME_OVERRIDES[basename];

  // Drop a leading vendor/company folder segment — it duplicates the
  // upstream provider identity we deliberately hide elsewhere (see
  // toPublicModelId) and was never part of the model's own name.
  const kept = segments.length > 1 && VENDOR_FOLDER_NAMES.has(segments[0].toLowerCase())
    ? segments.slice(1)
    : segments;

  let tokens = kept.join("-").split("-").filter(Boolean);

  // Re-join tokens a hyphen split apart that read as one unit: "1","5" -> a
  // dotted version "1.5"; "4","o" -> the compact suffix "4o"; "v2","1" -> a
  // dotted "v2.1".
  const merged = [];
  for (const tok of tokens) {
    const prev = merged[merged.length - 1];
    if (/^\d+$/.test(tok) && prev && /^[\d.]+$/.test(prev)) {
      merged[merged.length - 1] = `${prev}.${tok}`;
    } else if (/^[a-z]$/i.test(tok) && prev && /^\d+$/.test(prev)) {
      merged[merged.length - 1] = `${prev}${tok.toLowerCase()}`;
    } else if (/^v\d+$/i.test(prev || "") && /^\d+$/.test(tok)) {
      merged[merged.length - 1] = `${prev}.${tok}`;
    } else {
      merged.push(tok);
    }
  }
  tokens = merged;

  // Strip a trailing phrase that just repeats the capability this model is
  // already categorized under (e.g. "... Text To Image" on an image model).
  const suffixWords = capability && CAPABILITY_SUFFIX_WORDS[capability];
  if (suffixWords && tokens.length > suffixWords.length) {
    const tail = tokens.slice(-suffixWords.length).map((t) => t.toLowerCase());
    if (tail.join(" ") === suffixWords.join(" ")) {
      tokens = tokens.slice(0, -suffixWords.length);
    }
  }

  return tokens.map(titleCaseToken).join(" ");
}

// ── Hiding the upstream provider from end users ────────────────────────────
// The real modelId is the routing key (ModelPricing.modelId is what every
// lookup — pricing, provider resolution, job dispatch — is keyed on), so it
// can never change. Some of those real ids bake the upstream vendor straight
// in as a namespacing prefix (Alibaba's sync writes "alibaba:qwen-image-max"
// specifically so it can never collide with a KIE model of the same name).
// toPublicModelId strips that prefix for anything the public catalog
// response hands back to a browser; resolveModelPricingRow (below) is the
// other half — it accepts either form back from a client and always
// resolves to the real row, so stripping the prefix here never breaks
// routing.
export function toPublicModelId(modelId, providerName) {
  if (!modelId || !providerName) return modelId;
  const prefix = `${providerName}:`.toLowerCase();
  return modelId.toLowerCase().startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

// Resolves a model id a client handed back to the real ModelPricing row.
// Exact match is tried first — the overwhelming majority of calls (every
// internal id, and every already-real id) resolve here with the exact same
// query this replaced, so nothing already working changes. Only on a miss
// do we look for a row whose REAL modelId ends with ":<candidateId>", which
// is how a provider-prefixed real id (e.g. "alibaba:qwen-image-max") maps
// back from the public form toPublicModelId hands out ("qwen-image-max").
// `prisma` is passed in (not imported) so this stays a pure, dependency-free
// module usable from every caller's own already-mocked-in-tests client.
export async function resolveModelPricingRow(prisma, candidateId, selectOpt) {
  if (!candidateId) return null;
  const args = selectOpt ? { select: selectOpt } : {};
  const exact = await prisma.modelPricing.findUnique({ where: { modelId: candidateId }, ...args });
  if (exact) return exact;
  try {
    return await prisma.modelPricing.findFirst({ where: { modelId: { endsWith: `:${candidateId}` } }, ...args });
  } catch {
    return null;
  }
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
    let modelId = rest.join("/");
    // KIE sitemap uses simplified slugs (e.g., flux2, qwen2) but the API
    // expects hyphenated model IDs (e.g., flux-2, qwen-2). Normalize the
    // first segment to match what KIE's createTask endpoint actually accepts.
    const normalizedFirst = rest[0]?.replace(/^([a-z]+)(\d+)$/, "$1-$2") || rest[0];
    if (normalizedFirst !== rest[0]) {
      modelId = [normalizedFirst, ...rest.slice(1)].join("/");
    }
    const capability = inferCapability(modelId);
    const [inputModalities, outputModalities] = modalitiesForCapability(capability);
    return { modelId, providerModelId: modelId, endpoint: modelId, displayName: slugToTitle(modelId, { capability }), capability, inputModalities, outputModalities, sourceUrl: url };
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
