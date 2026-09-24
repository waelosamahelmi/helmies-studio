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

import { pricedFieldsFor } from "./kie-price-schedules.mjs";

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
  // Settings a model's PRICE depends on (kie-price-schedules.mjs). A price rule
  // only matches a value that is present, so these are filled from the model's
  // own schema and sent — what is quoted is then exactly what runs.
  "rendering_speed",
  "model_tier",
  "type",
]);

// Canonical value preferred when a field's schema offers a choice. Used ONLY
// when the value is actually one of the field's own declared enum values —
// otherwise the enum's first entry wins, so this can never introduce a value
// the model doesn't accept. 16:9 is the studio's own default framing (see
// generation.js's runMotionGraphics/generateMarketingAd, which already
// hard-default to it) and is the first entry of every video aspect enum.
export const CANONICAL_FIELD_DEFAULTS = {
  aspect_ratio: "16:9",
  // Five seconds is the studio's ordinary clip. Used only where the model's
  // own declaration allows it — inside its enum, or inside its min..max. A
  // range with no default used to fill to its MINIMUM: one second on pixverse.
  duration: 5,
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
  // Only settings the model actually declares: a schedule is written against
  // the live schema, but a schema can change under it.
  for (const name of pricedFieldsFor(modelId)) if (schema?.fields?.[name]) push(name);
  return out;
}

function isAbsent(value) {
  return value === undefined || value === null || value === "";
}

function sameScalar(a, b) {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  // "5" and 5 are the same length: 22 video models spell durations as strings.
  if (typeof a !== typeof b && Number.isFinite(Number(a)) && Number.isFinite(Number(b))) return Number(a) === Number(b);
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
    if (field.type === "number" && Number.isFinite(Number(field.minimum))) {
      const canonical = CANONICAL_FIELD_DEFAULTS[name];
      const max = Number.isFinite(Number(field.maximum)) ? Number(field.maximum) : Infinity;
      if (typeof canonical === "number" && canonical >= field.minimum && canonical <= max) return canonical;
      return Number(field.minimum);
    }
    // A declared field that offers no guidance at all gets no invented length.
    if (name === "duration") return undefined;
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

// ── Input adaptation: the studio's words → the model's words ───────────────
// The studios speak ONE vocabulary — image_url, video_url, images_list,
// first_frame_url/last_frame_url, aspect_ratio, resolution, duration (a
// number). The 134 live models speak about thirty. Measured across the active
// catalog on 2026-09-21:
//
//   the source image is image_url (33 rows), image_urls (15), input_urls (9),
//     image (2), image_input (1), first_frame_url (5) …
//   the last frame is last_frame_url, end_image_url, tail_image_url or
//     last_frame_image_url depending on the family
//   the source clip is video_url (9) or video_urls (4)
//   aspect ratio is aspect_ratio, ratio, or image_size
//   pixverse spells resolution `quality`
//   `duration` is a STRING enum ("5","10") on 22 video rows and a number on
//     the rest — and every studio sends Number(duration)
//
// Nothing translated between the two, so a run went out in the studio's words
// and either died in validateModelInput as a 422 ("duration must be a string")
// or reached the provider, which ignored the image it did not recognise and
// rendered from text alone — after the credits were held. Production history
// shows it plainly: grok i2v 0/1, kling v2-1-pro 0/2, qwen image-edit 0/1.
//
// This is the one translator. It is driven by the model's OWN schema, never by
// a per-model table, so a model synced tomorrow is handled by the same rules.
// Three of them, and they are the whole contract:
//   1. A value the caller put in a field the model DECLARES is never moved.
//   2. A value is only ever moved into a field the model declares — content
//      is relocated, never invented and never duplicated.
//   3. Only words from the studio's own vocabulary (STUDIO_VOCABULARY) are
//      ever dropped, and only when the model does not declare them. A family
//      with a dedicated body builder (Suno, Veo, Flux Kontext) keeps every
//      key it was given that this module does not know.

// Each slot: the names a CALLER may use (in the order we read them) and the
// names a MODEL may declare (in the order we prefer to fill them).
const INPUT_SLOTS = [
  {
    slot: "image",
    from: ["image_url", "image", "image_urls", "input_urls", "image_input", "images_list", "first_frame_url"],
    // The reference arrays come last: a model like seedance-2.5 has no source
    // image field at all, and its reference slot is how a still reaches it.
    to: ["image_url", "image", "image_urls", "input_urls", "image_input", "first_frame_url", "first_frame_image_url", "first_frame",
      "reference_image_urls", "reference_images", "reference_image"],
  },
  {
    slot: "lastFrame",
    from: ["last_frame_url", "end_image_url", "tail_image_url", "last_frame_image_url"],
    to: ["last_frame_url", "end_image_url", "tail_image_url", "last_frame_image_url"],
  },
  {
    slot: "video",
    from: ["video_url", "video_urls"],
    to: ["video_url", "video_urls"],
  },
  {
    slot: "references",
    from: ["images_list", "reference_image_urls", "reference_images", "image_references", "reference_image"],
    to: ["reference_image_urls", "reference_images", "image_references", "reference_image", "image_input", "image_urls", "input_urls"],
  },
];

// Studio words that are settings or routing hints rather than content. When a
// model does not declare one it is dropped instead of sent: KIE's generic
// Market envelope answers an unknown input key with a bare 500 and
// creditsConsumed 0, which reads like an outage and is really a bad request.
export const STUDIO_VOCABULARY = new Set([
  ...INPUT_SLOTS.flatMap((s) => [...s.from, ...s.to]),
  "aspect_ratio", "ratio", "image_size", "size", "resolution", "quality", "duration",
  "camera_motion", "campaign_format", "negative_prompt", "seed",
]);

const asList = (v) => (Array.isArray(v) ? v : [v]).filter((x) => typeof x === "string" && x);

function placeMedia(field, values) {
  if (field?.type === "array") {
    const max = Number.isInteger(field.maxItems) && field.maxItems > 0 ? field.maxItems : values.length;
    return values.slice(0, max);
  }
  return values[0];
}

// "16:9" against an enum that may spell it "16:9", "landscape_16_9" or
// "1280x720"-style words. Exact match first, then the ratio embedded in a
// longer token. No match returns undefined: the caller's value is dropped and
// applyRequiredDefaults fills the model's own default — a wrong frame shape
// beats a rejected run, and the alternative is sending a value it refuses.
// The words half the image families use for a frame shape. qwen/text-to-image
// and qwen/image-edit take exactly these (docs.kie.ai/market/qwen) but their
// stored schema lost the enum, so it stands in when image_size declares none.
const ORIENTATION_SIZES = ["square", "square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_3_2", "landscape_16_9", "landscape_21_9"];

function matchEnum(field, value, name = "") {
  const want = String(value).toLowerCase();
  const ratio = /^(\d+):(\d+)$/.exec(want);
  let values = Array.isArray(field?.enum) ? field.enum : null;
  if (!values) {
    if (name !== "image_size" || !ratio) return value;
    values = ORIENTATION_SIZES;
  }
  const exact = values.find((v) => String(v).toLowerCase() === want);
  if (exact !== undefined) return exact;
  if (ratio) {
    // 9:16 is "portrait_16_9": these vocabularies name the LONG side first and
    // carry the orientation as a word, so a literal "9_16" search finds nothing.
    const [w, h] = [Number(ratio[1]), Number(ratio[2])];
    const word = w === h ? ["square_hd", "square"] : [`${w > h ? "landscape" : "portrait"}_${Math.max(w, h)}_${Math.min(w, h)}`];
    const named = word.map((t) => values.find((v) => String(v).toLowerCase() === t)).find((v) => v !== undefined);
    if (named !== undefined) return named;
  }
  return undefined;
}

// A number the model wants as "5", a "5" the model wants as a number, and a
// length the model does not offer snapped to the nearest one it does (a plan
// that asks 5s of a model offering 6 or 10 should run at 6, not be refused —
// and the quote is taken AFTER this, so the price shown is for what runs).
// Anything else the caller named directly is left exactly as sent: swapping
// somebody's 9:16 for a default is worse than validation saying "not offered".
function coerceToField(name, field, value) {
  if (!field || typeof field !== "object" || value === undefined || value === null || value === "") return value;
  let next = value;
  if (field.type === "string" && typeof next === "number") next = String(next);
  else if (field.type === "number" && typeof next === "string" && next.trim() !== "" && Number.isFinite(Number(next))) next = Number(next);
  else if (field.type === "boolean" && typeof next === "string" && /^(true|false)$/i.test(next)) next = next.toLowerCase() === "true";

  if (Array.isArray(field.enum) && field.enum.length && typeof next !== "boolean") {
    const matched = matchEnum(field, next, name);
    if (matched !== undefined) return matched;
    const n = Number(next);
    const numeric = field.enum.map((v) => ({ v, n: Number(v) })).filter((e) => Number.isFinite(e.n));
    // Only a real length is snapped. 0 and -1 are sentinels some families use
    // ("auto"), and a sentinel moved to the nearest number becomes a request
    // nobody made.
    if (Number.isFinite(n) && n > 0 && numeric.length === field.enum.length) {
      return numeric.reduce((best, e) => (Math.abs(e.n - n) < Math.abs(best.n - n) ? e : best)).v;
    }
  }
  // The same for a range: grok's clips run 6-30s, and a plan asking for 5 was
  // refused by the provider with "Value must be within the specified range".
  // Positive lengths only — 0 and -1 stay the sentinels they are.
  if (field.type === "number" && typeof next === "number" && next > 0) {
    if (Number.isFinite(Number(field.minimum)) && next < field.minimum) return Number(field.minimum);
    if (Number.isFinite(Number(field.maximum)) && next > field.maximum) return Number(field.maximum);
  }
  return next;
}

/**
 * Translate a studio-vocabulary payload into the model's own field names.
 * Returns a new object; the input is never mutated. `changes` records what
 * moved, was coerced or was dropped, so the submit log can show it.
 *
 * A schema whose only field is `prompt` is a placeholder, not a description
 * of the model — adapting against it would strip real inputs, so
 * the payload passes through untouched.
 */
export function adaptInputsToSchema(params = {}, schema = null, opts = {}) {
  const fields = schema && typeof schema === "object" && schema.fields && typeof schema.fields === "object" ? schema.fields : null;
  const changes = { moved: {}, coerced: {}, dropped: [] };
  const names = fields ? Object.keys(fields) : [];
  const placeholder = names.length === 0 || (names.length === 1 && names[0] === "prompt");
  if (!params || typeof params !== "object" || placeholder) return { params, changes };

  const next = { ...params };
  // A field the PROVIDER is known to require counts as declared even when the
  // stored schema omits it (minimax-h3 demands aspect_ratio this way). Dropping
  // it here would discard the user's 9:16 only for a 16:9 default to be filled.
  const providerRequired = new Set(providerRequiredFields(opts.modelId, schema));
  const has = (name) => Object.prototype.hasOwnProperty.call(fields, name) || providerRequired.has(name);
  const present = (name) => !isAbsent(next[name]) && !(Array.isArray(next[name]) && next[name].length === 0);

  for (const { from, to } of INPUT_SLOTS) {
    // Rule 1: anything already in a declared field stays exactly where it is.
    const stray = from.filter((name) => present(name) && !has(name));
    if (!stray.length) continue;
    const target = to.find((name) => has(name) && !present(name));
    if (!target) continue;
    const values = stray.flatMap((name) => asList(next[name]));
    if (!values.length) continue;
    next[target] = placeMedia(fields[target], values);
    for (const name of stray) { delete next[name]; changes.moved[name] = target; }
  }

  // Framing and size travel under three names, resolution under two.
  // generate-4-o-image spells its ratio `size` (enum "1:1"/"3:2"/"2:3").
  for (const [names, label] of [[["aspect_ratio", "ratio", "image_size", "size"], "aspect"], [["resolution", "quality"], "resolution"]]) {
    const source = names.find((name) => present(name) && !has(name));
    const target = names.find((name) => has(name) && !present(name));
    if (!source || !target) continue;
    const value = matchEnum(fields[target], next[source], target);
    if (value !== undefined) { next[target] = value; changes.moved[source] = target; }
    delete next[source];
    if (value === undefined) changes.dropped.push(`${source} (${label} not offered)`);
  }

  for (const [name, field] of Object.entries(fields)) {
    if (!present(name)) continue;
    const value = coerceToField(name, field, next[name]);
    if (value === next[name]) continue;
    changes.coerced[name] = value;
    next[name] = value;
  }

  // Rule 3: only our own words, and only when the model never declared them.
  for (const name of Object.keys(next)) {
    if (STUDIO_VOCABULARY.has(name) && !has(name)) { delete next[name]; changes.dropped.push(name); }
  }

  return { params: next, changes };
}

export function applyRequiredDefaults(params = {}, schema = null, opts = {}) {
  const fields = schema && typeof schema === "object" && schema.fields && typeof schema.fields === "object" ? schema.fields : {};
  const required = new Set();

  for (const [name, field] of Object.entries(fields)) {
    if (field && field.required === true) required.add(name);
  }
  for (const name of providerRequiredFields(opts.modelId, schema)) required.add(name);

  // Translate first, THEN fill: a required `ratio` the caller sent as
  // `aspect_ratio` is supplied, not absent, and must not be defaulted over.
  const adapted = adaptInputsToSchema(params, schema, opts);

  const filled = {};
  const next = { ...adapted.params };
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

  return { params: next, filled, adapted: adapted.changes };
}
