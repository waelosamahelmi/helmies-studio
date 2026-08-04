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
