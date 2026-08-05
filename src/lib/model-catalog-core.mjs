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
// instead of guessing its own.
//
// "image" and "video" ARE real, first-class capability values here, not a
// broken fallback to paper over — a read-only preview of this mapping
// against the actual production catalog (before the first version of this
// fix shipped) found that treating them as unmapped/uncategorized would
// have hidden 28 genuinely working models (14 image, 14 video) that KIE's
// sync legitimately files under the coarse capability with no more specific
// hyphenated direction available (modalitiesForCapability, below, already
// had entries for both, independently confirming they're an intentional,
// supported value, not an artifact of the bug this fix targets). A
// capability with NO entry here at all (including null/undefined, and
// anything else unrecognized, e.g. the sync's own last-resort "media")
// still returns null — callers must treat that as UNCATEGORIZED (never
// displayed to end users, see serializeCatalogModel/getCatalogModels in
// model-catalog.js) UNLESS inferCapabilityFromRow (below) can recover a
// real capability for it from data already on the row.
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
  image: "image",
  video: "video",
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

// Known initialisms that naive title-casing gets wrong — "ai" -> "Ai",
// "4k" -> "4k" (digits are already "uppercase" so charAt(0).toUpperCase()
// is a no-op, and the rest lowercases the letter), etc. Keyed lowercase;
// extend as more turn up in the live catalog.
const ACRONYM_TOKENS = { ai: "AI", hd: "HD", "4k": "4K", "3d": "3D", tts: "TTS", sfx: "SFX" };

function titleCaseToken(token) {
  if (/^[\d.]+$/.test(token)) return token; // pure number / version ("1.5") — leave as-is
  const acronym = ACRONYM_TOKENS[token.toLowerCase()];
  if (acronym) return acronym;
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

// ── Hiding the upstream provider identity baked into DISPLAYNAME ──────────
// toPublicModelId (above) strips a "<providerName>:" prefix from the real
// id; a hand-authored displayName can bake the exact same prefix into the
// human-readable name instead (measured production bug: two Alibaba audio
// rows — qwen3-tts-flash and qwen3-tts-instruct-flash — shipped as
// "Alibaba:qwen3 TTS Flash" / "Alibaba:qwen3 TTS Instruct Flash" while every
// other mode (image 39, video 58, i2v 23) already reported zero such
// leaks). Stripping the prefix alone would leave the remainder's casing
// exactly as hand-typed ("qwen3 TTS Flash", lowercase "q") — so this re-runs
// every remaining word through the SAME titleCaseToken/ACRONYM_TOKENS
// machinery slugToTitle (above) already uses, not a second casing
// implementation, so "qwen3" -> "Qwen3" and "TTS" (already in
// ACRONYM_TOKENS) stays "TTS". Only a genuine LEADING "<providerName>:" is
// ever touched, mirroring toPublicModelId's own "prefix only" contract —
// "Qwen" (or any other word) appearing anywhere else in a name, not
// immediately after the provider and a colon, is never stripped.
export function sanitizeDisplayName(displayName, providerName) {
  if (!displayName || !providerName) return displayName;
  const prefix = `${providerName}:`.toLowerCase();
  const trimmed = String(displayName).trim();
  if (!trimmed.toLowerCase().startsWith(prefix)) return displayName;
  const rest = trimmed.slice(prefix.length).trim();
  if (!rest) return displayName;
  return rest.split(/\s+/).map(titleCaseToken).join(" ");
}

// ── Hiding upstream provider identity baked into DESCRIPTION text ─────────
// toPublicModelId (above) and serializeCatalogModel's provider/providerName
// dropping (model-catalog.js) hide the upstream vendor from every
// structured field — but kie-sync.js used to write it straight into the one
// field every end user actually reads: `${displayName} via the KIE Market
// API.`. This is the single point both the public catalog serializer (live,
// for the 175+ rows already in the DB) and the fix-model-categories.mjs
// backfill (persistent, for the same rows) share, so "what counts as a
// provider token" and "what counts as too mangled to show" is defined
// exactly once.
//
// "Qwen" is deliberately NOT here — it's a model FAMILY name (Alibaba's
// Qwen-Image line), not an upstream vendor identity, and stripping it would
// blank out the model's own name for no privacy benefit.
const PROVIDER_IDENTITY_TOKENS = ["KIE", "Alibaba", "DashScope", "WaveSpeed", "OpenRouter"];

// Purely connective words that describe nothing on their own once the
// provider token next to them is gone — "Foo via the KIE Market API." ->
// "Foo via the Market API." still describes Foo, but "via the KIE Market
// API." with no subject at all -> "via the Market API." is 100% filler. A
// result made up ENTIRELY of these words (post-scrub) is degenerate.
const DESCRIPTION_FILLER_WORDS = new Set([
  "via", "the", "by", "from", "using", "powered", "platform", "market", "api", "a", "an", "of", "on", "with",
]);

export function sanitizeCatalogDescription(description) {
  if (!description) return null;
  const original = String(description);
  let text = original;
  let matched = false;
  for (const token of PROVIDER_IDENTITY_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`, "gi");
    if (re.test(text)) matched = true;
    text = text.replace(re, "");
  }
  // Nothing to scrub — return the original untouched (no risk of mangling
  // legitimate text that never named a provider in the first place).
  if (!matched) return original;

  // Collapse whitespace/punctuation left behind by a removed token (e.g.
  // "Foo  Market" -> "Foo Market", "Foo ." -> "Foo.").
  text = text.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
  if (!text) return null;

  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const meaningful = words.filter((w) => !DESCRIPTION_FILLER_WORDS.has(w));
  if (meaningful.length === 0) return null;

  return text;
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

// ── Runnable-model gate (URGENT production fix) ────────────────────────────
// generation-handler.js and generate/async's route already refuse to BILL a
// model unless its ModelPricing row exists, is active, and isn't deprecated
// (their own `!dbPricing || isActive===false || isDeprecated` checks) — this
// is the single place that exact gate lives so every other caller can share
// it instead of re-deriving a looser copy.
//
// Production incident this targets: agents.js's entire image fallback chain
// was `flux-dev` → `nano-banana` → `qwen-image` — the first two are
// isActive:false + isDeprecated:true in production, so a planner naming
// either one (or falling through the dead chain to them) had nowhere left
// to go.
//
// The endpoint/providerModelId check below intentionally does NOT require
// either to be non-null on its own — an earlier version of this function
// did, and it broke every hand-priced row that isn't written by a sync
// (measured regression: tests/e2e's own seeded "e2e-image-model" fixture,
// and identically any row an admin prices by hand via
// pricing-engine.js's setModelPricing, since NEITHER path ever sets
// endpoint/providerModelId — only kie-sync's inferKieModelFromUrl and
// model-catalog.js's Alibaba sync do). generation-handler.js/generate/
// async's route never hard-require either field either: both derive
// `endpoint: dbPricing?.endpoint || staticModel?.endpoint || model` and
// `model: dbPricing?.providerModelId || staticModel?.providerModelId ||
// model`, falling back to the row's own modelId — which
// resolveModelPricingRow guarantees is present on any row it returns — so
// that IS "a usable endpoint" per the working studio path, and this
// mirrors it rather than inventing a stricter rule. Kept as an explicit
// OR-chain (not collapsed to true) so the precedence documents itself and
// stays visually paired with runnableProviderModelId's own chain below.
export function isRunnableModelRow(row) {
  if (!row) return false;
  if (row.isActive !== true) return false;
  if (row.isDeprecated === true) return false;
  return !!(row.endpoint || row.providerModelId || row.modelId);
}

// The identifier to actually hand a provider adapter for a runnable row —
// providerModelId first, since that's what strips a DB-only namespacing
// prefix (Alibaba's sync writes modelId as "alibaba:qwen-image-max" but
// providerModelId as the bare "qwen-image-max" the real Alibaba API
// expects — see alibaba-catalog.js's model() and this file's own
// toPublicModelId header) that the upstream provider has never heard of.
// Matches the derivation generation-handler.js/generate/async's route use
// for the outgoing payload's `model` field
// (`dbPricing?.providerModelId || staticModel?.providerModelId || model`,
// where that final fallback `model` is effectively the row's own modelId).
//
// Deliberately does NOT fall back to `endpoint` here (an earlier version
// did): for every row a SYNC writes, endpoint and providerModelId are the
// same string, so it made no difference there — but for a hand-priced row
// (an admin's setModelPricing, or a fixture like tests/e2e's own
// "e2e-input-model"), endpoint can be an arbitrary, unrelated string with
// no connection to the model's real identifier at all. Falling back to it
// as "the model to send the provider" produced a value
// resolveModelPricingRow could never look back up (modelId is the only
// thing it indexes on, plus its own ":<id>" suffix form) — silently
// mis-billing the step at pricing-engine.js's generic per-tool fallback
// cost instead of the row's real creditsCost, and sending the WRONG
// identifier to the provider adapter. The row's own modelId is always
// present and always resolves, so it — not endpoint — is the correct
// second choice.
export function runnableProviderModelId(row) {
  return row?.providerModelId || row?.modelId || null;
}

// ── Audio subcategorization (EDITSv1 E1.1) ─────────────────────────────────
// The sync files EVERY audio utility under the coarse capability "audio"
// (and every speech model under "text-to-speech") — far too coarse for
// honest studio pools: "convert-to-wav" is not a composer, "generate-music"
// is not a sound effect, and the old AudioStudio filter that tried to
// separate them read `m.provider`, a field the public catalog never emits
// (dead code by construction). audioKind() is the replacement: the honest
// sub-kind, inferred from id/endpoint TOKENS first (a model's own name is
// the most specific signal we have), then the capability as fallback.
//
// ORDER MATTERS — each rule is checked before the ones after it:
//   dialogue     "text-to-dialogue-v3" would otherwise match the tts rule
//   tts          plain speech readers
//   voice-clone  "suno-voice-generate" carries capability text-to-speech but
//                is a voice cloner, not a reader — its id token must win
//                over the capability fallback
//   sfx          sound effects
//   enhancement  "boost-music-style" contains "music" — isolation/boost/
//                separation must be classified before the music family
//   conversion   format/notation converters
//   music        ONLY a from-scratch composer — see below
//   utility      anything else that is still genuinely audio
// A model outside the audio family (or no model at all) returns null.
//
// music (BUG FIX: production Music studio listed utilities, not composers):
// the old rule (`generate-music|extend-music|add-instrumental|add-vocals|
// cover|mashup|replace-section|suno`) matched anything that shared a token
// with the Suno composition family, which swept every TRANSFORMER of an
// EXISTING track in with the genuine composers — extend-music,
// upload-and-cover-audio (via bare "cover"), add-instrumental, add-vocals,
// cover-suno, replace-section, generate-mashup all landed as "music", so
// MusicStudio's cost-sorted pick could land on replace-section (its
// cheapest entry), a section-replacer that cannot compose anything from
// scratch. Only "generate-music" itself and a bare versioned Suno engine
// selector ("suno-v5", "suno-v4.5-plus", ...) — the actual from-scratch
// generate flow, see CURATED_SCHEMAS's SUNO_MUSIC_FIELDS — are genuine
// composers; every transformer above now falls through with no match and
// lands on the "utility" catch-all below, which is exactly the bucket
// AudioToolsStudio already pools ("enhancement"/"conversion"/"utility").
const AUDIO_KIND_RULES = [
  ["dialogue", /text-to-dialogue|dialogue/],
  ["tts", /text-to-speech|tts/],
  ["voice-clone", /voice-generate|voice-clone|persona/],
  ["sfx", /generate-sounds|sound-effect|sfx/],
  ["enhancement", /audio-isolation|boost-music|separate-vocals|enhance/],
  ["conversion", /convert-to-wav|to-wav|convert|generate-midi/],
  ["music", /\bgenerate-music\b|\bsuno-v[\d.]+\b/],
];

export const AUDIO_KINDS = ["tts", "dialogue", "voice-clone", "music", "sfx", "enhancement", "conversion", "utility"];

export function audioKind(model) {
  const capability = model?.capability;
  if (capability !== "audio" && capability !== "text-to-speech") return null;
  const text = [model?.modelId, model?.id, model?.endpoint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const [kind, re] of AUDIO_KIND_RULES) {
    if (re.test(text)) return kind;
  }
  // No id/endpoint token — the capability itself is the only signal left.
  return capability === "text-to-speech" ? "tts" : "utility";
}

// Precise short-form video-direction markers (BUG FIX: production
// Text-to-Video listed models that cannot do text-to-video). CAPABILITY_
// GROUPS.ttv (capability-groups.js) folds the coarse "video" capability in
// alongside "text-to-video" because ~27 live models legitimately carry no
// more specific value — but several of those 27 DO carry an unambiguous
// short-form direction suffix in their own id/endpoint (KIE and Alibaba both
// use "-i2v"/"-v2v"/"-t2v", not always the spelled-out "image-to-video" the
// rules below already matched) that was being ignored, so an image-to-video
// or video-to-video model (needs a source image/clip and will fail with
// none) landed in the ttv pool — measured production example: wan-2.6-v2v,
// a video-to-video model, was the CHEAPEST entry in the T2V pool.
//
// Checked BEFORE the coarse "video"/generic-vendor fallback further down so
// an unambiguous marker always wins over it. `\b` anchors each short marker
// so it only matches as its own token (preceded/followed by a non-word
// character or the string boundary) — "wan-2.6-flash-i2v" matches, a
// hypothetical unrelated "musi2vc" would not.
//
// Deliberately narrow: an id with NO such marker (kling/*, bytedance/
// seedance-*, wan-animate-*, wan-speech-to-video, wan/2-2-*) is left
// completely alone here and still falls through to the coarse "video" rule
// below — those genuinely accept text+image+video with no single direction,
// so coarse "video" (and therefore ttv) is the CORRECT bucket for them, not
// a bug to fix. Only move a model when its id is unambiguous.
const IMAGE_TO_VIDEO_MARKERS = /image-to-video|-i2v\b|img2vid/;
const TEXT_TO_VIDEO_MARKERS = /text-to-video|-t2v\b/;
const VIDEO_TO_VIDEO_MARKERS = /video-to-video|videoedit|video-edit|style-transform|-v2v\b|\/extend\b/;

// Precise "ends in a trailing -video token" shape (BUG FIX: three real KIE
// video generators — generate-ai-video, generate-aleph-video, generate-veo-
// 3-video — measured ACTIVE in production with modelType "image"/capability
// "text-to-image"). Their ids carry no "market/" vendor folder and none of
// the specific direction markers above, so the only signal available is the
// id's own trailing "-video" token. Root cause: these are legacy-suite doc
// pages (kie-sync.js's suno-api/veo3-api/runway-api branch) that never even
// reach THIS function — kie-sync.js's own separate, older inferModelType()
// has no bare "video" keyword case at all and silently defaults every
// unmatched id to "image", so inferCapability was never consulted for them
// in the first place. Named explicitly here (rather than left as an
// accident of the generic image/video keyword fallback further down) so
// both kie-sync.js (going forward) and scripts/fix-model-categories.mjs
// (backfilling rows synced before this fix) can share ONE precise,
// independently-testable rule via isUnambiguousVideoId, exported below —
// used there to recover a row whose STORED capability already cleanly
// mapped to an image modelType (so the null-capability recovery path never
// re-examines it) but is provably wrong.
//
// Anchored to the FINAL "-"/"/"-separated token, matching the discipline
// every other marker above already follows. A word that merely CONTAINS
// "video" without ENDING in it (e.g. a hypothetical "videowall-backdrop"
// image tool, if one ever existed) is left alone.
const TRAILING_VIDEO_MARKER = /(?:^|[-/])video$/;

// "create-music-video" also ends in a trailing "-video" token — but a music
// video is a track's visual accompaniment (audioKind's "music" family), not
// this app's own video-generation surface, so it must NOT be swept up by
// isUnambiguousVideoId (used standalone by scripts/fix-model-categories.mjs
// to recover a row already stuck under a wrongly-but-cleanly-mapped image
// capability — that caller has no ordering to fall back on the way
// inferCapability's own if-chain does, since it isn't re-deriving the
// capability from scratch). Mirrors inferCapability's OWN audio rule
// verbatim (checked before the trailing-video rule in that function's
// ordering) so both agree on what "audio family" means, in exactly one
// place each independently defines its half of the check.
const AUDIO_FAMILY_MARKER = /audio|music|suno|sound/;

export function isUnambiguousVideoId(id) {
  const text = String(id || "").toLowerCase();
  return TRAILING_VIDEO_MARKER.test(text) && !AUDIO_FAMILY_MARKER.test(text);
}

export function inferCapability(path) {
  if (/text-to-image|text2image/.test(path)) return "text-to-image";
  if (/image-to-image|image-edit|edit-image|remix|character-edit/.test(path)) return "image-to-image";
  if (IMAGE_TO_VIDEO_MARKERS.test(path)) return "image-to-video";
  if (TEXT_TO_VIDEO_MARKERS.test(path)) return "text-to-video";
  if (VIDEO_TO_VIDEO_MARKERS.test(path)) return "video-to-video";
  if (/reference-to-video|r2v/.test(path)) return "reference-to-video";
  if (/lip-sync|avatar|omnihuman|infinitalk|from-audio/.test(path)) return "avatar-video";
  if (/upscale/.test(path)) return path.includes("video") ? "video-upscale" : "image-upscale";
  if (/remove-background/.test(path)) return "background-removal";
  if (/text-to-speech|tts|dialogue|voice/.test(path)) return "text-to-speech";
  if (/audio|music|suno|sound/.test(path)) return "audio";
  if (TRAILING_VIDEO_MARKER.test(path)) return "video";
  if (/image|imagen|seedream|flux|ideogram|qwen|recraft|gpt-image|nano-banana|z-image/.test(path)) return "image";
  if (/video|kling|wan|seedance|hailuo|pixverse|happyhorse|runway|veo/.test(path)) return "video";
  return "media";
}

// ── Recovering a capability the row never got, or got as something this
// mapping doesn't recognize ("media") ──────────────────────────────────────
// A null/unmapped capability must NOT be silently hidden if it can be
// recovered from data already sitting on the row — hiding a genuinely
// working model is a worse regression than the miscategorization bug this
// whole fix targets (see the production preview numbers cited on
// CAPABILITY_TO_MODEL_TYPE's header: 28 of the models that mapping alone
// would have hidden were real image/video models using the coarse
// capability). Tried in order, each strictly more speculative than the last:
//
//   1. outputModalities/inputModalities — a structured, reliable signal
//      (what actually comes out of a generation is definitional, not a
//      guess). Only trusted when unambiguous: a "video" output with BOTH
//      "image" and "video" in its inputs could be either reference-to-video
//      or video-to-video — modalitiesForCapability (above) gives both an
//      identical-shaped signature, so that specific case is left alone
//      rather than guessed.
//   2. the SAME text-based inferCapability (above) already trusted to
//      assign every OTHER synced model its capability in the first
//      place — run against endpoint/providerModelId/modelId. This is not a
//      new guess introduced to paper over missing data; it's the existing,
//      already-relied-on mechanism, applied to a row that fell through it
//      (e.g. added via some other path, or lost its capability to a
//      migration/manual edit) without ever getting one.
//
// A row where both signals are absent or still ambiguous keeps returning
// null — genuinely unidentifiable, not a recoverable gap.
function inferCapabilityFromModalities(inputModalities, outputModalities) {
  const out = new Set((Array.isArray(outputModalities) ? outputModalities : []).map(String));
  const inp = new Set((Array.isArray(inputModalities) ? inputModalities : []).map(String));
  if (out.size !== 1) return null;
  const [outType] = out;
  if (outType === "image") return inp.has("image") ? "image-to-image" : "text-to-image";
  if (outType === "video") {
    if (inp.has("image") && inp.has("video")) return null; // ambiguous: reference-to-video vs video-to-video
    if (inp.has("video")) return "video-to-video";
    if (inp.has("image")) return "image-to-video";
    return "text-to-video";
  }
  if (outType === "audio") return "audio";
  return null;
}

export function inferCapabilityFromRow(row) {
  const fromModalities = inferCapabilityFromModalities(row?.inputModalities, row?.outputModalities);
  if (fromModalities) return fromModalities;
  const text = row?.endpoint || row?.providerModelId || row?.modelId;
  if (!text) return null;
  const guessed = inferCapability(String(text).toLowerCase());
  // inferCapability's own last-resort fallback is literally "media" when
  // it can't tell anything at all from the text either — that's the same
  // "genuinely can't tell" signal as everywhere else, not a usable answer.
  return guessed === "media" ? null : guessed;
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

// ── Curated per-model schemas (EDITSv1 E1.2) ───────────────────────────────
// defaultSchemaForCapability (above) gives audio the generic `{ prompt }`
// and nothing else — so every studio control that is honestly gated on the
// model's own schema fields (the only capability signal the public catalog
// emits) never rendered for the Suno music family or the ElevenLabs voices.
// This map carries each known family's REAL parameters, ported from the
// hand-maintained flags in src/lib/models.js's AUDIO_MODELS entries
// (hasStyle/hasTitle/hasInstrumental/hasVocalGender/hasNegativeTags for
// Suno; hasVoice/hasStability/hasSimilarity/hasSpeed for ElevenLabs TTS;
// hasVoice alone for the v3 dialogue model). It must NEVER invent a
// parameter the upstream API doesn't accept — extending it means reading
// the provider docs first.
//
// The map lives HERE (not in kie-sync.js, which re-exports it) because the
// persistent backfill (scripts/fix-model-categories.mjs) runs under plain
// node, where kie-sync.js's "@/lib/..." alias imports cannot resolve; this
// module is dependency-free by design.
const SUNO_MUSIC_FIELDS = {
  style: { type: "string", required: false, maxLength: 1000 },
  title: { type: "string", required: false, maxLength: 100 },
  instrumental: { type: "boolean", required: false },
  vocal_gender: { type: "string", required: false, enum: ["m", "f"] },
  negative_tags: { type: "string", required: false, maxLength: 500 },
  duration: { type: "number", required: false, enum: [30, 60, 120, 180, 240] },
};

const ELEVENLABS_TTS_FIELDS = {
  voice: { type: "string", required: false },
  stability: { type: "number", required: false, minimum: 0, maximum: 1 },
  similarity_boost: { type: "number", required: false, minimum: 0, maximum: 1 },
  speed: { type: "number", required: false, minimum: 0.7, maximum: 1.2 },
};

export const CURATED_SCHEMAS = {
  // Suno composition family — the generate/extend flows accept the full
  // custom-mode parameter set.
  "generate-music": { fields: SUNO_MUSIC_FIELDS },
  "extend-music": { fields: SUNO_MUSIC_FIELDS },
  // Legacy Suno version-pinned ids (static-list era) — same generate flow,
  // same parameters; harmless if a given id never exists as a DB row.
  "suno-v5.5": { fields: SUNO_MUSIC_FIELDS },
  "suno-v5": { fields: SUNO_MUSIC_FIELDS },
  "suno-v4.5-plus": { fields: SUNO_MUSIC_FIELDS },
  "suno-v4.5": { fields: SUNO_MUSIC_FIELDS },
  "suno-v4.5-all": { fields: SUNO_MUSIC_FIELDS },
  "suno-v4": { fields: SUNO_MUSIC_FIELDS },
  // ElevenLabs speech.
  "elevenlabs-text-to-speech-turbo-2.5": { fields: ELEVENLABS_TTS_FIELDS },
  "elevenlabs-text-to-speech-multilingual-v2": { fields: ELEVENLABS_TTS_FIELDS },
  // The v3 dialogue model only takes a voice (models.js: hasVoice, nothing
  // else) — no stability/similarity/speed.
  "elevenlabs-text-to-dialogue-v3": { fields: { voice: { type: "string", required: false } } },
};

// The DB id and the curated key can spell the same model differently — a
// sitemap-derived id keeps its vendor folder and hyphenated version
// ("elevenlabs/text-to-speech-turbo-2-5") while the curated key uses the
// canonical dotted form ("elevenlabs-text-to-speech-turbo-2.5"). Normalize
// deterministically instead of duplicating every key: exact match first,
// then "/"→"-", then hyphenated digit runs re-dotted ("2-5" → "2.5").
export function curatedSchemaEntry(modelId) {
  if (!modelId) return null;
  const raw = String(modelId).toLowerCase();
  const slashless = raw.replace(/\//g, "-");
  const dotted = slashless.replace(/(\d)-(\d)/g, "$1.$2");
  return CURATED_SCHEMAS[raw] || CURATED_SCHEMAS[slashless] || CURATED_SCHEMAS[dotted] || null;
}

// The one schema builder every writer (sync + backfill) goes through:
// curated fields spread OVER the generic default for the capability, so a
// curated model keeps prompt/etc. and gains its real parameters, and a
// non-curated model gets exactly the default it always got. Video models
// keep the generic enums (KIE's documented common set) unless a curated
// entry says otherwise — no fictional per-model claims.
export function schemaForModel(modelId, capability) {
  const base = defaultSchemaForCapability(capability);
  const curated = curatedSchemaEntry(modelId);
  if (!curated) return base;
  return { fields: { ...base.fields, ...curated.fields } };
}
