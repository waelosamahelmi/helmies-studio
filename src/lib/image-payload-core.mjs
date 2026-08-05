// ── Dedicated IMAGE API adapters (audit class E — image-dedicated.md) ──────
// KIE ships two image models on their OWN endpoints, each with its own flat
// request body and its own poll route — neither is on the generic Market
// route (`/api/v1/jobs/createTask`) at all:
//
//   4o Image      POST /api/v1/gpt4o-image/generate
//                 GET  /api/v1/gpt4o-image/record-info?taskId=…
//   Flux Kontext  POST /api/v1/flux/kontext/generate
//                 GET  /api/v1/flux/kontext/record-info?taskId=…
//
// Until this module existed, `generate-4-o-image` and `generate-or-edit-image`
// were submitted to the Market route as `{model:"generate-4-o-image", input:{…}}`
// and answered 422 "The model name you specified is not supported" — every
// user submit against them was a guaranteed failure (docs/model-audit/
// image-dedicated.md documents both, field by field, from the real doc pages).
//
// This module mirrors src/lib/audio-payload-core.mjs exactly: canonical
// studio params in, the exact per-family provider body/path out;
// providers.js's KIE adapter delegates here from buildUrl/formatPayload/
// buildPollUrl/parsePoll and learns no field spellings of its own. Same two
// hard rules as the audio module: content is never invented, and each family
// forwards a WHITELIST — anything else is dropped rather than posted.
// Dependency-free by design (loaded under plain node via scripts/worker.mjs).

export const IMAGE_FAMILY = {
  GPT4O: "gpt4o-image",
  FLUX_KONTEXT: "flux-kontext",
};

export const GPT4O_SUBMIT_PATH = "/api/v1/gpt4o-image/generate";
export const GPT4O_POLL_PATH = "/api/v1/gpt4o-image/record-info";
export const FLUX_KONTEXT_SUBMIT_PATH = "/api/v1/flux/kontext/generate";
export const FLUX_KONTEXT_POLL_PATH = "/api/v1/flux/kontext/record-info";

// Same normalization ladder as audio-payload-core.mjs / curatedSchemaEntry.
function normalizeId(modelId) {
  const raw = String(modelId || "").toLowerCase();
  return {
    raw,
    slashless: raw.replace(/\//g, "-"),
    dotted: raw.replace(/\//g, "-").replace(/(\d)-(\d)/g, "$1.$2"),
  };
}

const GPT4O_RE = /(^|[^a-z0-9])generate-4-o-image($|[^a-z0-9])|gpt4o-image/;
// `generate-or-edit-image` is the live row's id; the legacy deactivated
// flux-kontext-* Market slugs are ALSO this family (Pro/Max are a body
// param on the one dedicated endpoint, never separate models) so if one is
// ever resurrected it routes correctly instead of 422ing on the Market path.
const FLUX_KONTEXT_RE = /(^|[^a-z0-9])generate-or-edit-image($|[^a-z0-9])|flux-kontext/;

/**
 * The dedicated image family a model id belongs to, or null when this module
 * has nothing to say about it (every Market-route model).
 */
export function imageProviderFamily(modelId) {
  const { raw, slashless, dotted } = normalizeId(modelId);
  if (!raw) return null;
  const probe = `${raw} ${slashless} ${dotted}`;
  if (GPT4O_RE.test(probe)) return IMAGE_FAMILY.GPT4O;
  if (FLUX_KONTEXT_RE.test(probe)) return IMAGE_FAMILY.FLUX_KONTEXT;
  return null;
}

function isAbsent(value) {
  return value === undefined || value === null || value === "";
}

function firstString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

// The caller's reference images, whatever shape they arrived in — an array
// stays an array (bounded), a lone string becomes a one-item array.
function asUrlArray(value, max) {
  if (Array.isArray(value)) {
    const urls = value.filter((u) => typeof u === "string" && u);
    return urls.length ? urls.slice(0, max) : null;
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return null;
}

// ── 4o Image ───────────────────────────────────────────────────────────────
// Real body per image-dedicated.md: `size` (required enum 1:1|3:2|2:3),
// at least one of `prompt`/`filesUrl`; optional maskUrl, nVariants (1|2|4),
// isEnhance, enableFallback, fallbackModel (FLUX_MAX|GPT_IMAGE_1).
export const GPT4O_SIZES = ["1:1", "3:2", "2:3"];

export function buildGpt4oImageBody(prompt, params = {}) {
  const body = {};
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;

  // `size` is the provider's own name; `aspect_ratio` is the studio's
  // canonical spelling for the same setting — accepted only when the value
  // is one the endpoint actually takes.
  const size = firstString(params.size, params.aspect_ratio);
  if (size && GPT4O_SIZES.includes(size)) body.size = size;

  const files = asUrlArray(params.filesUrl ?? params.image_urls ?? params.image_url ?? params.fileUrl, 5);
  if (files) body.filesUrl = files;

  const mask = firstString(params.maskUrl, params.mask_url);
  if (mask) body.maskUrl = mask;

  const n = Number(params.nVariants ?? params.num_images ?? params.n);
  if ([1, 2, 4].includes(n)) body.nVariants = n;

  if (typeof params.isEnhance === "boolean") body.isEnhance = params.isEnhance;
  if (typeof params.enableFallback === "boolean") body.enableFallback = params.enableFallback;
  const fallbackModel = firstString(params.fallbackModel);
  if (fallbackModel && ["FLUX_MAX", "GPT_IMAGE_1"].includes(fallbackModel)) body.fallbackModel = fallbackModel;

  return body;
}

// ── Flux Kontext ───────────────────────────────────────────────────────────
// One endpoint, tier selected via a body param `model` (flux-kontext-pro |
// flux-kontext-max). The studio's canonical name for that selector is
// `model_tier` — it can NOT be `model` because submitOnly's payload
// destructuring reserves that key for the catalog model id.
export const FLUX_KONTEXT_TIERS = ["flux-kontext-pro", "flux-kontext-max"];
export const FLUX_KONTEXT_DEFAULT_TIER = "flux-kontext-pro";
export const FLUX_KONTEXT_ASPECT_RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "16:21"];

export function resolveFluxKontextTier(modelId, params = {}) {
  const explicit = firstString(params.model_tier, params.modelTier)?.toLowerCase();
  if (explicit && FLUX_KONTEXT_TIERS.includes(explicit)) return explicit;
  const { dotted } = normalizeId(modelId);
  if (/flux-kontext-max/.test(dotted)) return "flux-kontext-max";
  return FLUX_KONTEXT_DEFAULT_TIER;
}

export function buildFluxKontextBody(modelId, prompt, params = {}) {
  const body = { model: resolveFluxKontextTier(modelId, params) };
  const text = firstString(params.prompt, prompt);
  if (text !== null) body.prompt = text;

  // The real API is camelCase (`aspectRatio`, `inputImage`, …); the studio's
  // canonical names are snake_case. Both spellings are accepted in.
  const aspect = firstString(params.aspectRatio, params.aspect_ratio);
  if (aspect) body.aspectRatio = aspect;

  const input = firstString(params.inputImage, params.image_url) || asUrlArray(params.image_urls, 1)?.[0] || null;
  if (input) body.inputImage = input;

  const outputFormat = firstString(params.outputFormat, params.output_format);
  if (outputFormat) body.outputFormat = outputFormat;

  const upsampling = params.promptUpsampling ?? params.prompt_upsampling;
  if (typeof upsampling === "boolean") body.promptUpsampling = upsampling;
  const translation = params.enableTranslation ?? params.enable_translation;
  if (typeof translation === "boolean") body.enableTranslation = translation;
  const tolerance = Number(params.safetyTolerance ?? params.safety_tolerance);
  if (Number.isFinite(tolerance)) body.safetyTolerance = tolerance;
  const uploadCn = params.uploadCn ?? params.upload_cn;
  if (typeof uploadCn === "boolean") body.uploadCn = uploadCn;
  const watermark = firstString(params.watermark);
  if (watermark) body.watermark = watermark;

  return body;
}

/**
 * The complete provider request for one dedicated-image submit, or null when
 * the model is not one of the two dedicated families.
 * `callBackUrl` is deliberately NOT added here — providers.js owns that.
 *
 * @returns {{ path: string, body: object, family: string } | null}
 */
export function formatImageRequest(modelId, prompt, params = {}) {
  const family = imageProviderFamily(modelId);
  if (!family) return null;
  if (family === IMAGE_FAMILY.GPT4O) {
    return { family, path: GPT4O_SUBMIT_PATH, body: buildGpt4oImageBody(prompt, params) };
  }
  return { family, path: FLUX_KONTEXT_SUBMIT_PATH, body: buildFluxKontextBody(modelId, prompt, params) };
}

/** The submit path a model needs, or null for "the caller's default". */
export function imageSubmitPath(modelId) {
  const family = imageProviderFamily(modelId);
  if (family === IMAGE_FAMILY.GPT4O) return GPT4O_SUBMIT_PATH;
  if (family === IMAGE_FAMILY.FLUX_KONTEXT) return FLUX_KONTEXT_SUBMIT_PATH;
  return null;
}

/** The poll path a model needs, or null for "the caller's default". */
export function imagePollPath(modelId, requestId) {
  const family = imageProviderFamily(modelId);
  const id = encodeURIComponent(requestId);
  if (family === IMAGE_FAMILY.GPT4O) return `${GPT4O_POLL_PATH}?taskId=${id}`;
  if (family === IMAGE_FAMILY.FLUX_KONTEXT) return `${FLUX_KONTEXT_POLL_PATH}?taskId=${id}`;
  return null;
}

// ── Poll parsing ───────────────────────────────────────────────────────────
// 4o: `data.status` in GENERATING/SUCCESS/CREATE_TASK_FAILED/GENERATE_FAILED
// (plus a numeric `successFlag`); outputs at `data.response.resultUrls[]`.
// Flux Kontext: `data.successFlag` 0=generating 1=success 2/3=failed;
// output at `data.response.resultImageUrl` (single image — originImageUrl is
// a 10-minute echo of the INPUT, never treated as an output).
const GPT4O_FAILURES = new Set(["CREATE_TASK_FAILED", "GENERATE_FAILED"]);

export function parseGpt4oImagePoll(data) {
  if (!data || typeof data !== "object") return { status: "pending", outputs: [], error: undefined };
  const status = String(data.status || "");
  const flag = Number(data.successFlag);
  const outputs = Array.isArray(data.response?.resultUrls)
    ? data.response.resultUrls.filter((u) => typeof u === "string" && u)
    : [];
  if (GPT4O_FAILURES.has(status) || flag === 2 || flag === 3) {
    return { status: "failed", outputs: [], error: data.errorMessage || data.errorCode || status || "generation failed" };
  }
  if ((status === "SUCCESS" || flag === 1) && outputs.length) {
    return { status: "success", outputs, error: undefined };
  }
  return { status: "pending", outputs: [], error: undefined };
}

export function parseFluxKontextPoll(data) {
  if (!data || typeof data !== "object") return { status: "pending", outputs: [], error: undefined };
  const flag = Number(data.successFlag);
  const url = data.response?.resultImageUrl;
  if (flag === 2 || flag === 3) {
    return { status: "failed", outputs: [], error: data.errorMessage || data.errorCode || "generation failed" };
  }
  if (flag === 1 && typeof url === "string" && url) {
    return { status: "success", outputs: [url], error: undefined };
  }
  return { status: "pending", outputs: [], error: undefined };
}

/**
 * Model-keyed poll dispatch, or null when the model isn't a dedicated image
 * family (the caller then keeps its existing parser chain).
 */
export function parseImagePoll(data, modelId) {
  const family = imageProviderFamily(modelId);
  if (family === IMAGE_FAMILY.GPT4O) return parseGpt4oImagePoll(data);
  if (family === IMAGE_FAMILY.FLUX_KONTEXT) return parseFluxKontextPoll(data);
  return null;
}
