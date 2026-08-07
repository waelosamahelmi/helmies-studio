// ── Required-parameter defaulting (BUG 2) ──────────────────────────────────
// Production incident this targets: `flux-2/pro-text-to-image` is a perfectly
// callable model that failed EVERY generation with
//   {"code":500,"msg":"aspect_ratio is required"}
// while its sibling `flux-2/flex-text-to-image` (which HAS succeeded in
// production) does not require it. Nothing in the app ever filled a declared
// parameter the caller happened to omit: every payload builder
// (src/lib/generation.js's per-capability builders, generate/async's route,
// agents.js, director-executor.js, template-runner.js) copies across only
// what the caller passed, so a model whose provider requires a field the
// studio's own UI leaves blank could never be submitted successfully.
//
// This module is the ONE place that fills those gaps. It is dependency-free
// (no prisma, no "@/" alias) so it can be imported from src/lib/providers.js
// — which runs both inside Next AND under plain `node` via scripts/worker.mjs
// — and unit-tested without a database. src/lib/providers.js's submitOnly()
// calls it immediately before provider.formatPayload(), which is the single
// choke point EVERY submit goes through:
//
//   studio (sync)  route → handleGeneration → generation.js → submitOnly
//   studio (async) route → job-queue → job-runner → submitOnly
//   agent          agents.js → generation.js → submitOnly
//   director       director-executor → generation.js → submitOnly
//   template       template-runner → job-queue → job-runner → submitOnly
//
// Two hard rules, both covered by tests:
//   1. A caller-supplied value is NEVER overridden — only an absent
//      (undefined / null / "") field is ever filled.
//   2. Content is NEVER invented. Only fields on FILLABLE_FIELDS below (pure
//      rendering settings) can be defaulted; `prompt`, `image_url`,
//      `video_url`, `audio_url` and friends are deliberately excluded — a
//      missing prompt or reference URL is a real caller error and must
//      surface as one, not be papered over with a fabricated value.

// Fields whose value is a rendering SETTING rather than user content. Only
// these may be auto-filled. Deliberately excludes every *_url/prompt/text
// field (see rule 2 above) and `seed` (silently pinning a seed would make
// every generation for that model identical).
export const FILLABLE_FIELDS = new Set([
  "aspect_ratio",
  "resolution",
  "duration",
  "duration_seconds",
  "size",
  "n",
  "num_images",
  "quality",
  "mode",
  "output_format",
  "prompt_extend",
  // EDITSv1 M2 (audit class D): additional pure rendering/pricing settings
  // several real vendor schemas hard-require (see CURATED_SCHEMAS in
  // model-catalog-core.mjs) — Kling's `sound`, Wan flash's pricing-relevant
  // `audio` (defaulted false = cheaper tier), Topaz's `upscale_factor`,
  // Kling motion-control's `character_orientation`, Wan 2.7's `ratio`
  // (its literal field name for aspect ratio), and the Seedream family's
  // `image_size`/`image_resolution`/`max_images`. Still no *_url/prompt/
  // text/seed — content is never invented.
  "sound",
  // A named voice preset is a rendering setting, not content: the words are
  // the prompt, and which voice reads them has a sensible neutral default.
  // Required on google/gemini-3-1-flash-tts, so without this any caller that
  // did not name a voice was rejected outright.
  "voice_name",
  "voice",
  "audio",
  // kling-3.0/video (probe round 3, 2026-08-05): with sound/aspect_ratio/
  // mode supplied the provider answered 422 "multi_shots cannot be empty" —
  // a boolean shot-structure setting (single vs multi shot), not content.
  "multi_shots",
  "upscale_factor",
  "character_orientation",
  "ratio",
  "image_size",
  "image_resolution",
  "max_images",
]);

// Canonical value preferred when a field's schema offers a choice. Used ONLY
// when the value is actually one of the field's own declared enum values —
// otherwise the enum's first entry wins, so this can never introduce a value
// the model doesn't accept. 16:9 is the studio's own default framing (see
// generation.js's runMotionGraphics/generateMarketingAd, which already
// hard-default to it) and is the first entry of every video aspect enum.
export const CANONICAL_FIELD_DEFAULTS = {
  aspect_ratio: "16:9",
  n: 1,
  num_images: 1,
};

// Fields a provider is known to require even though the model's stored
// schema marks them optional. Evidence-only — every entry here must come
// from an observed provider response, never a guess:
//   flux-2/pro-text-to-image → {"code":500,"msg":"aspect_ratio is required"}
//     (live KIE probe, prompt-only payload, 2026-08-04)
// scripts/verify-catalog.mjs discovers these at scale and records them per
// row in ModelPricing.inputSchema.providerRequired, which
// providerRequiredFields() below reads FIRST — this static map is only the
// bootstrap for what has already been proved by hand.
export const PROVIDER_REQUIRED_FIELDS = {
  "flux-2/pro-text-to-image": ["aspect_ratio"],
  //   kling-3.0/video → {"code":500,"msg":"This field is required"} (nameless)
  //     (live KIE probes, 2026-08-05: prompt+duration failed; adding `sound`
  //     alone STILL failed the same way, so every rendering setting the doc
  //     lists — docs/model-audit/video-market.md, kling/kling-3-0: sound,
  //     aspect_ratio, and mode (resolution is derived from mode+aspect) —
  //     is treated as provider-required and filled from the schema defaults)
  //     Probe round 3 (sound+aspect_ratio+mode supplied) advanced to a
  //     NAMED error: {"code":422,"msg":"multi_shots cannot be empty"} —
  //     so multi_shots is required too (filled false = single shot).
  "kling-3.0/video": ["sound", "aspect_ratio", "mode", "multi_shots"],
  //   pixverse-v6/text-to-video → {"code":500,"msg":"This field is required"}
  //     (live KIE probes, 2026-08-05: prompt+duration failed; adding
  //     `quality` alone STILL failed identically — so `aspect_ratio` (the
  //     one remaining doc-listed rendering setting with a default) is
  //     hard-required too, same pattern as flux-2/pro-text-to-image)
  "pixverse-v6/text-to-video": ["quality", "aspect_ratio"],
};

function normalizeKey(modelId) {
  return String(modelId || "").toLowerCase();
}

// Same normalization ladder as model-catalog-core.mjs's curatedSchemaEntry:
// a sitemap-derived id and a hand-written key can spell the same model with
// "/" vs "-".
export function staticProviderRequiredFields(modelId) {
  const raw = normalizeKey(modelId);
  if (!raw) return [];
  const slashless = raw.replace(/\//g, "-");
  return PROVIDER_REQUIRED_FIELDS[raw] || PROVIDER_REQUIRED_FIELDS[slashless] || [];
}

// The union of "the schema says required" and "the provider is known to
// require it". `schema.providerRequired` is written by the verification
// sweep (scripts/verify-catalog.mjs) into the existing inputSchema Json
// column — deliberately OUTSIDE `fields`, so it never turns into a
// validateModelInput hard-failure that would 422 a studio submit that this
// module is about to fill in anyway.
export function providerRequiredFields(modelId, schema) {
  const out = [];
  const push = (name) => {
    if (typeof name === "string" && name && !out.includes(name)) out.push(name);
  };
  for (const name of Array.isArray(schema?.providerRequired) ? schema.providerRequired : []) push(name);
  for (const name of staticProviderRequiredFields(modelId)) push(name);
  return out;
}

function isAbsent(value) {
  return value === undefined || value === null || value === "";
}

function sameScalar(a, b) {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

// The value to fill a field with, drawn from the field's OWN declaration —
// an explicit `default` beats everything, then the canonical preference if
// (and only if) the field's enum actually offers it, then the enum's first
// entry, then a numeric minimum. Returns undefined when the schema gives us
// nothing to go on: we skip the field rather than invent a value.
export function defaultForField(name, field) {
  if (field && typeof field === "object") {
    if (field.default !== undefined) return field.default;
    const values = Array.isArray(field.enum) ? field.enum.filter((v) => v !== undefined && v !== null) : [];
    if (values.length) {
      const canonical = CANONICAL_FIELD_DEFAULTS[name];
      if (canonical !== undefined) {
        const match = values.find((v) => sameScalar(v, canonical));
        if (match !== undefined) return match;
      }
      return values[0];
    }
    if (field.type === "number" && Number.isFinite(Number(field.minimum))) return Number(field.minimum);
  }
  return CANONICAL_FIELD_DEFAULTS[name];
}

/**
 * Fill every REQUIRED-but-absent rendering parameter from the model's own
 * schema. Returns a new params object (the input is never mutated) plus the
 * map of what was filled, so the caller can log it.
 *
 * @param {object} params  the payload built by the caller
 * @param {object} schema  ModelPricing.inputSchema ({ fields, providerRequired })
 * @param {{ modelId?: string }} opts
 * @returns {{ params: object, filled: Record<string, unknown> }}
 */
// ── Media-URL absolutization (audit class A) ────────────────────────────────
// Our upload route deliberately returns APP-RELATIVE URLs (/api/media/local/<key>
// — see src/lib/storage/index.js: presigned URLs expire, app-relative ones
// don't). But a provider's servers cannot fetch a relative path, so any fresh
// user upload used as an i2i/i2v/v2v source silently failed at the provider
// while a re-used PRIOR OUTPUT (already an absolute CDN URL) worked — which is
// exactly why this bug survived testing for so long.
//
// Applied at the single submit choke point (providers.js submitOnly), so the
// studio, async-worker, agent, director and template paths all inherit it.
// Rules: only values starting with "/api/" are rewritten (never absolute URLs,
// never data: URIs, never provider task ids); every media-ish field is covered
// generically — any *_url string, any *_urls / *_list array of strings.
const APP_RELATIVE_PREFIX = "/api/";

export function publicBaseUrl() {
  const base = process.env.NEXTAUTH_URL || "https://studio.helmies.fi";
  return base.replace(/\/+$/, "");
}

function absolutizeValue(value, base) {
  return typeof value === "string" && value.startsWith(APP_RELATIVE_PREFIX) ? `${base}${value}` : value;
}

// Field NAMES are not a reliable way to find media here. That approach
// covered *_url / *_urls / *_list / reference_images and shipped looking
// generic, but the families that matter name their inputs image_input
// (nano-banana), reference_image / first_frame / reference_voice (wan-r2v)
// and reference_video — none of which match. A real identity pack failed
// every angle at the provider because image_input went out as
// "/api/media/local/….png".
//
// So don't guess the field: rewrite any string that IS an app-relative path,
// wherever it sits, including inside nested arrays and objects. There is no
// false-positive risk — a value starting with "/api/" can never be
// meaningful to a provider's servers, whatever field holds it — and nothing
// else is touched (absolute URLs, data: URIs and provider task ids all pass
// through unchanged).
// Fields that carry prose or an identifier rather than a location. A prompt
// that happens to mention a path is text the user wrote, and a provider task
// id is opaque — neither is ours to rewrite, however path-shaped it looks.
const NEVER_A_LOCATION = new Set([
  "prompt", "negative_prompt", "text", "description", "title", "style",
  "taskId", "task_id", "requestId", "request_id", "id", "model", "endpoint", "tool",
]);

function absolutizeDeep(value, base, depth = 0, field = null) {
  if (typeof value === "string") {
    return field && NEVER_A_LOCATION.has(field) ? value : absolutizeValue(value, base);
  }
  if (depth >= 6) return value; // payloads are shallow; this only stops a cycle
  if (Array.isArray(value)) return value.map((v) => absolutizeDeep(v, base, depth + 1, field));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = absolutizeDeep(v, base, depth + 1, k);
    return out;
  }
  return value;
}

export function absolutizeMediaUrls(params = {}) {
  if (!params || typeof params !== "object") return params;
  return absolutizeDeep(params, publicBaseUrl());
}

export function applyRequiredDefaults(params = {}, schema = null, opts = {}) {
  const fields = schema && typeof schema === "object" && schema.fields && typeof schema.fields === "object" ? schema.fields : {};
  const required = new Set();

  for (const [name, field] of Object.entries(fields)) {
    if (field && field.required === true) required.add(name);
  }
  for (const name of providerRequiredFields(opts.modelId, schema)) required.add(name);

  const filled = {};
  const next = { ...params };
  for (const name of required) {
    // Rule 2: never invent content — only rendering settings are fillable.
    if (!FILLABLE_FIELDS.has(name)) continue;
    // Rule 1: never override what the caller supplied.
    if (!isAbsent(next[name])) continue;
    const value = defaultForField(name, fields[name]);
    if (value === undefined) continue;
    next[name] = value;
    filled[name] = value;
  }

  return { params: next, filled };
}
