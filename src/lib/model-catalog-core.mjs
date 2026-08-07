const LLM_SEGMENTS = new Set(["claude", "codex", "grok", "gemini"]);
// Market doc paths that CONTAIN an LLM-vendor token ("grok", "gemini") but are
// real MEDIA generation models, not chat models. Exported because kie-sync.js's
// own inferModelType has an independent "gemini"/"grok" substring → "llm" check
// that was silently dropping gemini-omni-* and grok-imagine/extend from every
// sync run (docs/model-audit/video-market.md root cause #10) — that file must
// consult the SAME list, not a private copy.
export const MEDIA_EXCEPTIONS = ["grok-imagine", "gemini-omni-video", "gemini-omni-audio", "gemini-omni-character"];

// ── KIE sitemap-slug → real API model-id normalization (fix class B) ───────
// The sync used to hyphenate EVERY `<letters><digits>` family segment
// (`rest[0].replace(/^([a-z]+)(\d+)$/, "$1-$2")`) on the theory that KIE's API
// wants the hyphenated form. Live/doc verification (docs/model-audit/
// image-market.md, root cause #8) proved that rule is per-family, not global:
//   · flux2 → flux-2   CORRECT (live-verified: `flux-2/pro-text-to-image` is
//                      the real model field — image-market.md, Flux 2 section)
//   · qwen2 → qwen-2   WRONG — the real API id is unhyphenated `qwen2/*`
//                      (image-market.md documents the broken active `qwen-2/*`
//                      pair vs the correct deactivated `qwen2/*` rows)
//   · qwen3 → qwen-3   WRONG for the same reason (`qwen3/text-to-image` /
//                      `qwen3/image-to-image` are the documented real ids)
// So: an EXPLICIT per-family mapping. A family absent from this table keeps
// its original sitemap segment verbatim.
export const KIE_FAMILY_SEGMENT_MAP = {
  // image-market.md, Flux 2 section: real model field is `flux-2/…` — the one
  // family where the old hyphenation rule was verified correct.
  flux2: "flux-2",
};

// Full-id corrections where the real `model` string differs from the doc-page
// URL slug in a way no segment rule can derive (version dots, version-prefixed
// vendor folders, missing version segments, bare ids with no folder prefix).
// Keyed by the URL-derived id (after KIE_FAMILY_SEGMENT_MAP), value = the
// doc-verified real API model id. Each entry cites its audit source.
export const KIE_MODEL_ID_CORRECTIONS = {
  // video-market.md (Bytedance): real id uses a version DOT — the stored
  // dash form 422s ("seedance-1-5-pro" confirmed live-422'd).
  "bytedance/seedance-1-5-pro": "bytedance/seedance-1.5-pro",
  // video-market.md (Kling): real ids are version-prefixed vendor folders.
  "kling/text-to-video": "kling-2.6/text-to-video",
  "kling/image-to-video": "kling-2.6/image-to-video",
  "kling/kling-3-0": "kling-3.0/video", // confirmed live-422'd under the slug form
  "kling/motion-control": "kling-2.6/motion-control",
  "kling/motion-control-v3": "kling-3.0/motion-control",
  "kling/v25-turbo-image-to-video-pro": "kling/v2-5-turbo-image-to-video-pro",
  "kling/v25-turbo-text-to-video-pro": "kling/v2-5-turbo-text-to-video-pro",
  // video-market.md (PixVerse): every real id carries a `-v6` version segment
  // the URL slug omits.
  "pixverse/text-to-video": "pixverse-v6/text-to-video",
  "pixverse/image-to-video": "pixverse-v6/image-to-video",
  "pixverse/transition": "pixverse-v6/transition",
  "pixverse/extend": "pixverse-v6/extend",
  "pixverse/reference-to-video": "pixverse-v6/reference-to-video",
  // video-market.md (Grok Imagine 1.5 preview): real model string breaks the
  // vendor/action slug pattern entirely — dashes, no slash.
  "grok-imagine/1-5-preview": "grok-imagine-video-1-5-preview",
  // image-market.md root cause #9 (bare-model prefix drift): these exact ids
  // are BARE — no `google/`/`gpt/`/`z-image/` folder prefix. Scoped to the
  // precise ids the audit names; plain `google/nano-banana` (and imagen4 etc.)
  // IS live-verified working WITH its prefix and must not be touched.
  "google/nanobanana2": "nano-banana-2",
  "google/nano-banana-2-lite": "nano-banana-2-lite",
  "google/pro-image-to-image": "nano-banana-pro",
  "gpt/gpt-image-2-text-to-image": "gpt-image-2-text-to-image",
  "gpt/gpt-image-2-image-to-image": "gpt-image-2-image-to-image",
  "z-image/z-image": "z-image",
  // image-market.md (Seedream / GPT-Image 1.5): dot-vs-hyphen version slugs;
  // the folder-index page `market/seedream/seedream` documents Seedream 3.0,
  // whose real id is `bytedance/seedream`.
  "seedream/seedream": "bytedance/seedream",
  "seedream/4-5-text-to-image": "seedream/4.5-text-to-image",
  "seedream/4-5-edit": "seedream/4.5-edit",
  "gpt-image/1-5-text-to-image": "gpt-image/1.5-text-to-image",
  "gpt-image/1-5-image-to-image": "gpt-image/1.5-image-to-image",
};

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
  // Reference-to-video models REQUIRE a source image (the provider rejects a
  // text-only payload with "first_frame_image_url cannot be empty"). They are
  // image-INPUT models, so they belong with i2v in the pool typing, NOT with
  // text-to-video — previously "video" put them in getRunnableModelsForType's
  // t2v pool, where the agent's planner hint and fallback chain offered them
  // for text-only steps and every such step failed at the provider (measured
  // production incident, 2026-08-06: happyhorse-1-1/reference-to-video and
  // pixverse-v6/transition were the fallback candidates for a linen-film
  // text-to-video step). The studio pickers are unaffected: they filter by
  // capability STRING via capability-groups.js (r2v: ["reference-to-video"]),
  // which this modelType mapping never touched.
  "reference-to-video": "i2v",
  // Recast takes an identity IMAGE plus the scene VIDEO, so it is an
  // image-input model for pool typing — never offer it for a text-only step.
  recast: "i2v",
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

// ── Media-input gate for TEXT-ONLY step kinds (URGENT production fix) ──────
// A model whose schema REQUIRES an image/video/audio upload (input_urls,
// first_frame_image_url, reference_image_urls, ...) can never run on a text
// prompt alone — the provider rejects it (measured, 2026-08-06:
// kling-3.0/motion-control → 500 "This field is required" for its required
// input_urls/video_urls; pixverse-v6/transition → 422 "first_frame_image_url
// cannot be empty"). Such models are coarse-`video`-capability rows with no
// textual marker to distinguish them, so the ONLY honest signal is the
// schema's own required fields. Reads the same per-field shape
// validateModelInput/applyRequiredDefaults already use (fields.*.required,
// plus the providerRequired list written by verify-catalog.mjs) so this gate
// can never disagree with what a submit actually validates. A row with no
// schema (or no required fields) is treated as text-capable — the historical
// behavior, never narrowed by guesswork.
export function requiresMediaInput(row) {
  const schema = row?.inputSchema;
  if (!schema || typeof schema !== "object") return false;
  const fields = schema.fields && typeof schema.fields === "object" ? schema.fields : {};
  const required = [];
  for (const [name, field] of Object.entries(fields)) {
    if (field && (field.required === true || field.required === "true")) required.push(name);
  }
  if (Array.isArray(schema.providerRequired)) required.push(...schema.providerRequired);
  // A required field whose name names a media upload. Kept deliberately
  // tight (url/list tokens only): `sound`, `multi_shots`, `mode`, `quality`,
  // `duration`, `aspect_ratio` etc. are rendering settings, not media.
  return required.some((f) => typeof f === "string" && /url|_list|upload/i.test(f.trim()));
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
  // `suno-voice-` prefixes the ENTIRE 8-step Suno voice-clone workflow
  // (validate, validate-info, record-info, regenerate, check-voice, generate
  // + the two callbacks) — the old rule only matched the literal token
  // "voice-generate", scattering 6 of the 8 steps into the generic "utility"
  // bucket and across two studio surfaces (docs/model-audit/audio-music.md).
  ["voice-clone", /suno-voice-|voice-generate|voice-clone|persona/],
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

export function inferCapability(path) {
  // Output-type misfilings (docs/model-audit/audio-music.md): despite their
  // Suno-family tokens, `cover-suno` generates album-cover IMAGES
  // (`/api/v1/suno/cover/generate` — "Generate personalized cover images")
  // and `create-music-video` renders an MP4 VIDEO (`/api/v1/mp4/generate`).
  // Both must be classified by what comes OUT, before the suno/music tokens
  // below would sweep them into "audio".
  if (/cover-suno/.test(path)) return "image";
  if (/create-music-video/.test(path)) return "video";
  if (/text-to-image|text2image/.test(path)) return "text-to-image";
  if (/image-to-image|image-edit|edit-image|remix|character-edit/.test(path)) return "image-to-image";
  // Lip-sync/avatar markers must win over the generic video-direction
  // markers: `volcengine/video-to-video-lip-sync` contains the literal
  // substring "video-to-video", so with the old ordering it was filed as
  // plain video-to-video and landed in the V2V studio instead of lipsync
  // (video-market.md root cause #9). "omni-character" covers the root-level
  // gemini-omni-character page (a character/avatar asset constructor —
  // video-market.md, Gemini Omni section).
  if (/lip-sync|avatar|omnihuman|infinitalk|from-audio|omni-character/.test(path)) return "avatar-video";
  if (IMAGE_TO_VIDEO_MARKERS.test(path)) return "image-to-video";
  if (TEXT_TO_VIDEO_MARKERS.test(path)) return "text-to-video";
  if (VIDEO_TO_VIDEO_MARKERS.test(path)) return "video-to-video";
  if (/reference-to-video|r2v/.test(path)) return "reference-to-video";
  /* Identity transfer — one face/subject placed into an existing clip that
     keeps its own timing and blocking. These carry `image_url` + `video_url`
     (or `input_urls` + `video_urls`) and, on the Kling family, an explicit
     `character_orientation`. Must be tested BEFORE the coarse `video|kling|
     wan` catch-all below, which otherwise files them as plain "video" and
     drops them out of every picker that filters by group. */
  if (/recast|motion-control|animate-replace|animate-move/.test(path)) return "recast";
  if (/upscale/.test(path)) return path.includes("video") ? "video-upscale" : "image-upscale";
  if (/remove-background/.test(path)) return "background-removal";
  if (/text-to-speech|tts|dialogue|voice/.test(path)) return "text-to-speech";
  if (/audio|music|suno|sound/.test(path)) return "audio";
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
    // Exact-match against the FULL first segment on purpose: a root-level
    // market page like "gemini-omni-video" is its own family and must NOT be
    // treated as family "gemini" (video-market.md root cause #10).
    if (LLM_SEGMENTS.has(family) && !MEDIA_EXCEPTIONS.some((item) => path.includes(item))) return null;
    if (["quickstart", "common"].includes(family) || rest.length < 1) return null;
    // Single-segment ROOT-LEVEL market pages are real models whose family IS
    // the page slug (market/gemini-omni-video, market/omnihuman-1-5 — both
    // documented against the real createTask endpoint, video-market.md).
    // The old `rest.length < 2` guard silently dropped every one of them.
    let modelId = rest.join("/");
    // Per-family sitemap-slug → API-id segment mapping (flux2 → flux-2 only;
    // see KIE_FAMILY_SEGMENT_MAP's header — the old blanket
    // `<letters><digits>` hyphenation broke qwen2/qwen3).
    const mappedFirst = KIE_FAMILY_SEGMENT_MAP[rest[0]];
    if (mappedFirst) {
      modelId = [mappedFirst, ...rest.slice(1)].join("/");
    }
    // Doc-verified full-id corrections (version dots, Kling version prefixes,
    // PixVerse -v6, bare ids — see KIE_MODEL_ID_CORRECTIONS's header).
    modelId = KIE_MODEL_ID_CORRECTIONS[modelId] || modelId;
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
  // ── Suno-suite operations (EDITSv1 M3; docs/model-audit/audio-music.md).
  // Replace-mode: every one of these rows shipped with the fabricated
  // `{ prompt }` stub (audit root cause #2); these are the REAL parameter
  // sets, in the studio's canonical spellings — audio-payload-core.mjs owns
  // the wire translation (prompt→content, audio_url→uploadUrl/audioUrl,
  // style→tags, snake→camel).
  // Route-only text ops:
  "boost-music-style": { replace: true, fields: {
    // Wire field is `content` — the style description to boost.
    prompt: { type: "string", required: true, maxLength: 1000 },
  } },
  "generate-lyrics": { replace: true, fields: {
    prompt: { type: "string", required: true, maxLength: 200 },
  } },
  "generate-sounds": { replace: true, fields: {
    prompt: { type: "string", required: true, maxLength: 500 },
    engine: { type: "string", required: false, enum: ["V5", "V5_5"], default: "V5_5" },
  } },
  // Upload-driven ops — `audio_url` is the studio's canonical upload field
  // (AudioToolsStudio's Dropzone already supplies it).
  "upload-and-cover-audio": { replace: true, fields: {
    prompt: { type: "string", required: true, maxLength: 5000 },
    audio_url: { type: "string", format: "uri", required: true },
    instrumental: { type: "boolean", required: false },
    style: { type: "string", required: false, maxLength: 1000 },
    title: { type: "string", required: false, maxLength: 100 },
    negative_tags: { type: "string", required: false, maxLength: 500 },
    vocal_gender: { type: "string", required: false, enum: ["m", "f"] },
  } },
  "upload-and-extend-audio": { replace: true, fields: {
    audio_url: { type: "string", format: "uri", required: true },
    // Seconds into the uploaded track the extension continues from;
    // supplying one switches the op into custom-parameter mode.
    continue_at: { type: "number", required: false, minimum: 0 },
    prompt: { type: "string", required: false, maxLength: 5000 },
    style: { type: "string", required: false, maxLength: 1000 },
    title: { type: "string", required: false, maxLength: 100 },
  } },
  "add-instrumental": { replace: true, fields: {
    audio_url: { type: "string", format: "uri", required: true },
    title: { type: "string", required: true, maxLength: 100 },
    // Wire field is `tags` — style tags for the generated instrumental.
    style: { type: "string", required: true, maxLength: 500 },
    negative_tags: { type: "string", required: true, maxLength: 500 },
  } },
  "add-vocals": { replace: true, fields: {
    audio_url: { type: "string", format: "uri", required: true },
    prompt: { type: "string", required: true, maxLength: 5000 },
    title: { type: "string", required: true, maxLength: 100 },
    style: { type: "string", required: true, maxLength: 1000 },
    negative_tags: { type: "string", required: true, maxLength: 500 },
  } },
  "separate-vocals": { replace: true, fields: {
    // Wire field is `audioUrl` (camelCase — the casing WAS the bug).
    audio_url: { type: "string", format: "uri", required: true },
    type: { type: "string", required: false, enum: ["separate_vocal", "split_stem", "split_stem_advanced"], default: "separate_vocal" },
  } },
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
// non-curated model gets exactly the default it always got.
//
// EDITSv1 M2 (audit class D): an entry can instead declare `replace: true`,
// meaning its `fields` ARE the model's complete real parameter set and the
// generic default must NOT bleed through — the audits (docs/model-audit/
// image-market.md, video-market.md) proved the generic `resolution`/
// `aspect_ratio`/`num_images` trio is fabricated for essentially every
// market model, so merging it under a real schema would keep advertising
// parameters the provider rejects. Every family entry added by the M2 pass
// is replace-mode; the original audio entries keep the merge behaviour they
// shipped with.
export function schemaForModel(modelId, capability) {
  const base = defaultSchemaForCapability(capability);
  const curated = curatedSchemaEntry(modelId);
  if (!curated) return base;
  if (curated.replace === true) return { fields: { ...curated.fields } };
  return { fields: { ...base.fields, ...curated.fields } };
}

// ═══════════════════════════════════════════════════════════════════════════
// EDITSv1 M2 — real vendor-family schemas (audit class D)
// ═══════════════════════════════════════════════════════════════════════════
// Every entry below is transcribed VERBATIM from the per-family audits in
// docs/model-audit/image-market.md and docs/model-audit/video-market.md
// (which were themselves extracted from the live docs.kie.ai pages), plus
// docs/model-audit/{image,video}-dedicated.md for the dedicated-API rows.
// Never invent a parameter: extending this block means reading the audit —
// or the provider doc — first.
//
// All entries are `replace: true` (see schemaForModel above): their `fields`
// are the model's COMPLETE real parameter set, and the generic fabricated
// default (`resolution: 1k/2k/4k`, 5-value `aspect_ratio`, `num_images`)
// must not bleed through.
//
// Keys use the canonical form curatedSchemaEntry resolves to: lowercase,
// "/"→"-", hyphenated digit pairs re-dotted ("seedance-1-5-pro" →
// "seedance-1.5-pro"). Where the live DB row's id differs from the real API
// model string (wrong vendor prefix, missing version segment — audit classes
// 1/7/9), the entry is ALSO registered under the current row's key so the
// row gets its real schema today, before its id is repointed.

// Terse field constructors — schema shape is identical to the hand-written
// entries above (type/required/enum/min/max/…), these only cut repetition.
const mkStr = (extra = {}) => ({ type: "string", required: false, ...extra });
const mkNum = (extra = {}) => ({ type: "number", required: false, ...extra });
const mkBool = (extra = {}) => ({ type: "boolean", required: false, ...extra });
const mkArr = (extra = {}) => ({ type: "array", required: false, ...extra });
const mkUri = (extra = {}) => ({ type: "string", format: "uri", required: false, ...extra });
const mkEnum = (values, extra = {}) => ({
  type: typeof values[0] === "number" ? "number" : "string",
  required: false,
  enum: values,
  ...extra,
});

// Shared enum sets, exactly as the audits list them.
const SEEDREAM_IMAGE_SIZES = ["square", "square_hd", "portrait_4_3", "portrait_3_2", "portrait_16_9", "landscape_4_3", "landscape_3_2", "landscape_16_9", "landscape_21_9"];
const SEEDREAM_45_ASPECTS = ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"];
const NANO_BANANA_ASPECTS_11 = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"];
const NANO_BANANA_2_ASPECTS_15 = ["1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5", "5:4", "1:8", "8:1", "9:16", "16:9", "21:9", "auto"];
const GPT_IMAGE_2_ASPECTS_16 = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"];
const FLUX2_ASPECTS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"];
const IDEOGRAM_SPEEDS = ["TURBO", "BALANCED", "QUALITY"];
const IDEOGRAM_V3_STYLES = ["AUTO", "GENERAL", "REALISTIC", "DESIGN"];
const IDEOGRAM_CHARACTER_STYLES = ["AUTO", "REALISTIC", "FICTION"];
const IDEOGRAM_IMAGE_SIZES = ["square", "square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"];
const QWEN_RATIO_SIZES = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
const RES_1K2K = ["1K", "2K"];
const RES_1K2K4K = ["1K", "2K", "4K"];
const WAN_VIDEO_RES = ["720p", "1080p"];
const WAN_ASPECTS_5 = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const KLING_ASPECTS = ["1:1", "16:9", "9:16"];
const PIXVERSE_QUALITIES = ["360p", "540p", "720p", "1080p"];
const PIXVERSE_ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"];
const MINIMAX_RES = ["768P", "2K"];
const UPSCALE_FACTORS = ["1", "2", "4"];

// ── Image families ─────────────────────────────────────────────────────────
const SEEDREAM_SCHEMAS = {
  // Seedream 3.0 — real model field `bytedance/seedream`.
  "bytedance-seedream": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_size: mkEnum(SEEDREAM_IMAGE_SIZES),
    guidance_scale: mkNum({ minimum: 1, maximum: 10 }),
    seed: mkNum(),
  } },
  "bytedance-seedream-v4-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_size: mkEnum(SEEDREAM_IMAGE_SIZES),
    image_resolution: mkEnum(RES_1K2K4K),
    max_images: mkNum({ minimum: 1, maximum: 6 }),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "bytedance-seedream-v4-edit": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_urls: mkArr({ required: true, maxItems: 10 }),
    image_size: mkEnum(SEEDREAM_IMAGE_SIZES),
    image_resolution: mkEnum(RES_1K2K4K),
    max_images: mkNum({ minimum: 1, maximum: 6 }),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "seedream-4.5-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 3000 }),
    aspect_ratio: mkEnum(SEEDREAM_45_ASPECTS, { required: true }),
    quality: mkEnum(["basic", "high"], { required: true }),
    nsfw_checker: mkBool(),
  } },
  "seedream-4.5-edit": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 3000 }),
    image_urls: mkArr({ required: true, maxItems: 14 }),
    aspect_ratio: mkEnum(SEEDREAM_45_ASPECTS, { required: true }),
    quality: mkEnum(["basic", "high"], { required: true }),
    nsfw_checker: mkBool(),
  } },
  "seedream-5-lite-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, minLength: 3, maxLength: 3000 }),
    aspect_ratio: mkEnum(SEEDREAM_45_ASPECTS, { required: true }),
    quality: mkEnum(["basic", "high", "ultra"], { required: true }),
    output_format: mkEnum(["png", "jpeg"]),
    nsfw_checker: mkBool(),
  } },
  "seedream-5-pro-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, minLength: 3, maxLength: 5000 }),
    aspect_ratio: mkEnum(SEEDREAM_45_ASPECTS, { required: true }),
    quality: mkEnum(["basic", "high"], { required: true }),
    output_format: mkEnum(["png", "jpeg"]),
    nsfw_checker: mkBool(),
  } },
  "seedream-5-pro-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ required: true, maxItems: 10 }),
    aspect_ratio: mkEnum(SEEDREAM_45_ASPECTS, { required: true }),
    quality: mkEnum(["basic", "high"], { required: true }),
    output_format: mkEnum(["png", "jpeg"], { default: "png" }),
    nsfw_checker: mkBool(),
  } },
};

const IMAGEN4_FIELDS = (defaultAspect) => ({
  prompt: mkStr({ required: true, maxLength: 5000 }),
  negative_prompt: mkStr(),
  aspect_ratio: mkEnum(["1:1", "16:9", "9:16", "3:4", "4:3", "auto"], { default: defaultAspect }),
  seed: mkNum(),
});

const GOOGLE_IMAGE_SCHEMAS = {
  "google-imagen4": { replace: true, fields: IMAGEN4_FIELDS("1:1") },
  "google-imagen4-fast": { replace: true, fields: IMAGEN4_FIELDS("16:9") },
  "google-imagen4-ultra": { replace: true, fields: IMAGEN4_FIELDS("1:1") },
  "google-nano-banana": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    output_format: mkEnum(["png", "jpeg"]),
    aspect_ratio: mkEnum(NANO_BANANA_ASPECTS_11),
    image_size: mkEnum(NANO_BANANA_ASPECTS_11),
    nsfw_checker: mkBool(),
  } },
  "google-nano-banana-edit": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ required: true, maxItems: 10 }),
    output_format: mkEnum(["png", "jpeg"]),
    aspect_ratio: mkEnum(NANO_BANANA_ASPECTS_11),
  } },
  // Real model field is the BARE `nano-banana-2` (no google/ prefix).
  "nano-banana-2": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 20000 }),
    image_input: mkArr({ maxItems: 14 }),
    aspect_ratio: mkEnum(NANO_BANANA_2_ASPECTS_15),
    resolution: mkEnum(RES_1K2K4K),
    output_format: mkEnum(["png", "jpg"]),
  } },
  "nano-banana-2-lite": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 20000 }),
    aspect_ratio: mkEnum(NANO_BANANA_2_ASPECTS_15, { required: true }),
    image_urls: mkArr({ maxItems: 10 }),
  } },
  "nano-banana-pro": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 10000 }),
    image_input: mkArr({ maxItems: 8 }),
    aspect_ratio: mkEnum(NANO_BANANA_ASPECTS_11),
    resolution: mkEnum(RES_1K2K4K),
    output_format: mkEnum(["png", "jpg"]),
  } },
};

const FLUX2_T2I_FIELDS = {
  prompt: mkStr({ required: true, minLength: 3, maxLength: 5000 }),
  aspect_ratio: mkEnum(FLUX2_ASPECTS, { required: true }),
  resolution: mkEnum(RES_1K2K, { required: true, default: "1K" }),
  nsfw_checker: mkBool(),
};
const FLUX2_I2I_FIELDS = {
  prompt: mkStr({ required: true }),
  input_urls: mkArr({ required: true, minItems: 1, maxItems: 8 }),
  aspect_ratio: mkEnum([...FLUX2_ASPECTS, "auto"], { required: true }),
  resolution: mkEnum(RES_1K2K, { required: true, default: "1K" }),
  nsfw_checker: mkBool(),
};
const FLUX2_SCHEMAS = {
  "flux-2-pro-text-to-image": { replace: true, fields: FLUX2_T2I_FIELDS },
  "flux-2-pro-image-to-image": { replace: true, fields: FLUX2_I2I_FIELDS },
  "flux-2-flex-text-to-image": { replace: true, fields: FLUX2_T2I_FIELDS },
  "flux-2-flex-image-to-image": { replace: true, fields: FLUX2_I2I_FIELDS },
};

const GROK_IMAGINE_SCHEMAS = {
  "grok-imagine-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    aspect_ratio: mkEnum(["2:3", "3:2", "1:1", "16:9", "9:16"], { default: "1:1" }),
    enable_pro: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "grok-imagine-image-to-image": { replace: true, fields: {
    image_urls: mkArr({ required: true, maxItems: 1 }),
    prompt: mkStr(), // genuinely optional on this model per the doc
    nsfw_checker: mkBool(),
  } },
  "grok-imagine-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    aspect_ratio: mkEnum(["2:3", "3:2", "1:1", "16:9", "9:16"], { default: "2:3" }),
    mode: mkEnum(["fun", "normal", "spicy"], { default: "normal" }),
    duration: mkNum({ minimum: 6, maximum: 30 }),
    resolution: mkEnum(["480p", "720p", "1080p"], { default: "480p" }),
    nsfw_checker: mkBool(),
  } },
  "grok-imagine-image-to-video": { replace: true, fields: {
    image_urls: mkArr({ maxItems: 7 }),
    task_id: mkStr(),
    index: mkNum({ minimum: 0, maximum: 5 }),
    prompt: mkStr({ maxLength: 5000 }),
    mode: mkEnum(["fun", "normal", "spicy"]),
    duration: mkNum({ minimum: 6, maximum: 30 }),
    resolution: mkEnum(["480p", "720p", "1080p"]),
    aspect_ratio: mkEnum(["2:3", "3:2", "1:1", "16:9", "9:16"], { default: "16:9" }),
    nsfw_checker: mkBool(),
  } },
  "grok-imagine-upscale": { replace: true, fields: {
    task_id: mkStr({ required: true }),
    resolution: mkEnum(["720p", "1080p"], { default: "720p" }),
  } },
  "grok-imagine-extend": { replace: true, fields: {
    task_id: mkStr({ required: true }),
    prompt: mkStr({ required: true }),
    extend_at: mkNum({ minimum: 2 }),
    extend_times: mkStr({ required: true }),
  } },
};

const GPT_IMAGE_SCHEMAS = {
  "gpt-image-1.5-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    aspect_ratio: mkEnum(["1:1", "2:3", "3:2"], { required: true }),
    quality: mkEnum(["medium", "high"], { required: true }),
  } },
  "gpt-image-1.5-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    input_urls: mkArr({ required: true, maxItems: 16 }),
    aspect_ratio: mkEnum(["1:1", "2:3", "3:2"], { required: true }),
    quality: mkEnum(["medium", "high"], { required: true }),
  } },
  // Real model fields are BARE `gpt-image-2-*` (no gpt/ prefix).
  "gpt-image-2-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 20000 }),
    aspect_ratio: mkEnum(GPT_IMAGE_2_ASPECTS_16),
    resolution: mkEnum(RES_1K2K4K),
  } },
  "gpt-image-2-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 20000 }),
    input_urls: mkArr({ required: true, maxItems: 16 }),
    aspect_ratio: mkEnum(GPT_IMAGE_2_ASPECTS_16),
    resolution: mkEnum(RES_1K2K4K),
  } },
};

const IDEOGRAM_SCHEMAS = {
  "ideogram-v3-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    style: mkEnum(IDEOGRAM_V3_STYLES),
    expand_prompt: mkBool(),
    image_size: mkEnum(IDEOGRAM_IMAGE_SIZES),
    seed: mkNum(),
    negative_prompt: mkStr(),
  } },
  "ideogram-v3-edit": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    mask_url: mkUri({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    expand_prompt: mkBool(),
    seed: mkNum(),
  } },
  "ideogram-v3-remix": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    style: mkEnum(IDEOGRAM_V3_STYLES),
    expand_prompt: mkBool(),
    image_size: mkEnum(IDEOGRAM_IMAGE_SIZES),
    num_images: mkEnum(["1", "2", "3", "4"]), // string enum per the real API
    seed: mkNum(),
    strength: mkNum({ minimum: 0.01, maximum: 1 }),
    negative_prompt: mkStr(),
  } },
  "ideogram-character": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    reference_image_urls: mkArr({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    style: mkEnum(IDEOGRAM_CHARACTER_STYLES),
    expand_prompt: mkBool(),
    num_images: mkEnum(["1", "2", "3", "4"]),
    image_size: mkEnum(IDEOGRAM_IMAGE_SIZES),
    seed: mkNum(),
    negative_prompt: mkStr(),
  } },
  "ideogram-character-edit": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    mask_url: mkUri({ required: true }),
    reference_image_urls: mkArr({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    style: mkEnum(IDEOGRAM_CHARACTER_STYLES),
    expand_prompt: mkBool(),
    num_images: mkEnum(["1", "2", "3", "4"]),
  } },
  "ideogram-character-remix": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    reference_image_urls: mkArr({ required: true }),
    rendering_speed: mkEnum(IDEOGRAM_SPEEDS),
    style: mkEnum(IDEOGRAM_CHARACTER_STYLES),
    expand_prompt: mkBool(),
    image_size: mkEnum(IDEOGRAM_IMAGE_SIZES),
    num_images: mkEnum(["1", "2", "3", "4"]),
    seed: mkNum(),
    strength: mkNum({ minimum: 0.01, maximum: 1 }),
    negative_prompt: mkStr(),
  } },
};

const QWEN_SCHEMAS = {
  "qwen-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_size: mkStr(), // named presets (doc lists no closed enum)
    num_inference_steps: mkNum({ minimum: 2, maximum: 250 }),
    seed: mkNum(),
    guidance_scale: mkNum({ minimum: 0, maximum: 20 }),
    enable_safety_checker: mkBool(),
    output_format: mkStr(),
    negative_prompt: mkStr(),
    acceleration: mkEnum(["none", "regular", "high"]),
    nsfw_checker: mkBool(),
  } },
  "qwen-image-edit": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    acceleration: mkEnum(["none", "regular", "high"]),
    image_size: mkStr(),
    num_inference_steps: mkNum({ minimum: 2, maximum: 250 }),
    seed: mkNum(),
    guidance_scale: mkNum({ minimum: 0, maximum: 20 }),
    sync_mode: mkBool(),
    num_images: mkEnum(["1", "2", "3", "4"]),
    enable_safety_checker: mkBool(),
    output_format: mkStr(),
    negative_prompt: mkStr(),
    nsfw_checker: mkBool(),
  } },
  "qwen-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    strength: mkNum({ minimum: 0, maximum: 1 }),
    output_format: mkStr(),
    acceleration: mkEnum(["none", "regular", "high"]),
    negative_prompt: mkStr(),
    seed: mkNum(),
    num_inference_steps: mkNum({ minimum: 2, maximum: 250 }),
    guidance_scale: mkNum({ minimum: 0, maximum: 20 }),
    enable_safety_checker: mkBool(),
    nsfw_checker: mkBool(),
  } },
  // Vendor segment is `qwen2` (never `qwen-2`) per every live qwen2 doc page.
  "qwen2-image-edit": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 800 }),
    image_url: mkUri({ required: true }),
    image_size: mkEnum(QWEN_RATIO_SIZES, { default: "16:9" }),
    seed: mkNum(),
    output_format: mkStr(),
    nsfw_checker: mkBool(),
  } },
  "qwen3-text-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 800 }),
    resolution: mkEnum(RES_1K2K),
    image_size: mkEnum(QWEN_RATIO_SIZES, { default: "16:9" }),
    output_format: mkStr(),
    prompt_extend: mkBool({ default: true }),
    nsfw_checker: mkBool(),
    negative_prompt: mkStr(),
    seed: mkNum(),
  } },
  "qwen3-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ required: true, minItems: 1, maxItems: 3 }),
    resolution: mkEnum(RES_1K2K),
    image_size: mkEnum(QWEN_RATIO_SIZES),
    output_format: mkStr(),
    prompt_extend: mkBool({ default: true }),
    nsfw_checker: mkBool(),
    negative_prompt: mkStr(),
    seed: mkNum(),
  } },
  // The Pro edit row. Same shape as the standard edit above, but the docs
  // give it an 800-character prompt ceiling, an explicit png|jpeg enum
  // instead of a free string, and no documented cap on how many images it
  // takes.
  "qwen3-pro-image-to-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 800 }),
    image_urls: mkArr({ required: true, minItems: 1 }),
    resolution: mkEnum(RES_1K2K, { default: "1K" }),
    image_size: mkEnum(QWEN_RATIO_SIZES, { default: "16:9" }),
    output_format: mkEnum(["png", "jpeg"], { default: "png" }),
    prompt_extend: mkBool({ default: true }),
    negative_prompt: mkStr({ maxLength: 5000 }),
    seed: mkNum({ minimum: 0, maximum: 2147483647 }),
    nsfw_checker: mkBool({ default: true }),
  } },
};

const Z_IMAGE_SCHEMAS = {
  // Real model field is BARE `z-image`.
  "z-image": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1000 }),
    aspect_ratio: mkEnum(["1:1", "4:3", "3:4", "16:9", "9:16"], { required: true }),
    nsfw_checker: mkBool(),
  } },
};

const TOPAZ_SCHEMAS = {
  "topaz-image-upscale": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    upscale_factor: mkEnum(UPSCALE_FACTORS, { required: true, default: "2" }),
  } },
  "topaz-video-upscale": { replace: true, fields: {
    video_url: mkUri({ required: true }),
    upscale_factor: mkEnum(UPSCALE_FACTORS, { default: "2" }),
  } },
};

const RECRAFT_SCHEMAS = {
  // Recraft's required field is literally named `image` — not `image_url`.
  "recraft-remove-background": { replace: true, fields: {
    image: mkUri({ required: true }),
  } },
  "recraft-crisp-upscale": { replace: true, fields: {
    image: mkUri({ required: true }),
  } },
};

// ── KIE-Wan (all 18 market combos; providerName=KIE, generic job route —
// entirely separate from the retired alibaba:wan* rows) ────────────────────
const WAN_SCHEMAS = {
  "wan-2.2-a14b-image-to-video-turbo": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    prompt: mkStr({ required: true }),
    resolution: mkEnum(["480p", "720p"], { default: "720p" }),
    enable_prompt_expansion: mkBool(),
    seed: mkNum(),
    acceleration: mkEnum(["none", "regular"]),
    nsfw_checker: mkBool(),
  } },
  "wan-2.2-a14b-text-to-video-turbo": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    resolution: mkEnum(["480p", "720p"]),
    aspect_ratio: mkEnum(["16:9", "9:16"]),
    enable_prompt_expansion: mkBool(),
    seed: mkNum(),
    acceleration: mkEnum(["none", "regular"]),
    nsfw_checker: mkBool(),
  } },
  "wan-2.2-a14b-speech-to-video-turbo": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    num_frames: mkNum({ minimum: 40, maximum: 120 }),
    frames_per_second: mkNum({ minimum: 4, maximum: 60 }),
    resolution: mkEnum(["480p", "580p", "720p"]),
    negative_prompt: mkStr(),
    seed: mkNum(),
    num_inference_steps: mkNum(),
    guidance_scale: mkNum(),
    shift: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.2-animate-move": { replace: true, fields: {
    video_url: mkUri({ required: true }),
    image_url: mkUri({ required: true }),
    resolution: mkEnum(["480p", "580p", "720p"]),
    nsfw_checker: mkBool(),
  } },
  "wan-2.2-animate-replace": { replace: true, fields: {
    video_url: mkUri({ required: true }),
    image_url: mkUri({ required: true }),
    resolution: mkEnum(["480p", "580p", "720p"], { default: "480p" }),
    nsfw_checker: mkBool(),
  } },
  "wan-2.5-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 800 }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["5", "10"], { required: true }),
    resolution: mkEnum(WAN_VIDEO_RES),
    negative_prompt: mkStr(),
    enable_prompt_expansion: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.5-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 800 }),
    duration: mkEnum(["5", "10"], { required: true }),
    aspect_ratio: mkEnum(["16:9", "9:16", "1:1"]),
    resolution: mkEnum(WAN_VIDEO_RES),
    negative_prompt: mkStr(),
    enable_prompt_expansion: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.6-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_urls: mkArr({ required: true, maxItems: 1 }),
    duration: mkEnum(["5", "10", "15"], { default: "5" }),
    resolution: mkEnum(WAN_VIDEO_RES, { default: "1080p" }),
    multi_shots: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.6-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkEnum(["5", "10", "15"]),
    resolution: mkEnum(WAN_VIDEO_RES),
    multi_shots: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.6-video-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    video_urls: mkArr({ required: true, maxItems: 3 }),
    duration: mkEnum(["5", "10"]),
    resolution: mkEnum(WAN_VIDEO_RES),
    multi_shots: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.6-flash-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1500 }),
    image_urls: mkArr({ required: true, maxItems: 1 }),
    // Pricing-relevant per the doc; defaulted false (no audio) so a studio
    // submit that never surfaces the control quotes the cheaper tier.
    audio: mkBool({ required: true, default: false }),
    duration: mkEnum(["5", "10", "15"]),
    resolution: mkEnum(WAN_VIDEO_RES),
    multi_shots: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.6-flash-video-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1500 }),
    video_urls: mkArr({ required: true, maxItems: 3 }),
    duration: mkEnum(["5", "10"]),
    resolution: mkEnum(WAN_VIDEO_RES),
    audio: mkBool({ default: false }),
    multi_shots: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    negative_prompt: mkStr(),
    audio_url: mkUri(),
    resolution: mkEnum(WAN_VIDEO_RES, { default: "1080p" }),
    // The field is literally named `ratio` on this model — NOT aspect_ratio.
    ratio: mkEnum(WAN_ASPECTS_5, { default: "16:9" }),
    duration: mkNum({ minimum: 2, maximum: 15, default: 5 }),
    prompt_extend: mkBool({ default: true }),
    watermark: mkBool({ default: false }),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    negative_prompt: mkStr(),
    first_frame_url: mkUri(),
    last_frame_url: mkUri(),
    first_clip_url: mkUri(),
    driving_audio_url: mkUri(),
    resolution: mkEnum(WAN_VIDEO_RES, { default: "1080p" }),
    duration: mkNum({ minimum: 2, maximum: 15, default: 5 }),
    prompt_extend: mkBool(),
    watermark: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-videoedit": { replace: true, fields: {
    video_url: mkUri({ required: true }),
    prompt: mkStr({ maxLength: 5000 }), // genuinely optional here
    negative_prompt: mkStr(),
    reference_image: mkUri(),
    resolution: mkEnum(WAN_VIDEO_RES),
    aspect_ratio: mkEnum(WAN_ASPECTS_5),
    duration: mkNum({ minimum: 0, maximum: 10, default: 0 }),
    audio_setting: mkEnum(["auto", "origin"]),
    prompt_extend: mkBool(),
    watermark: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-r2v": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    negative_prompt: mkStr(),
    reference_image: mkArr({ maxItems: 5 }),
    reference_video: mkArr({ maxItems: 5 }),
    first_frame: mkUri(),
    reference_voice: mkUri(),
    resolution: mkEnum(WAN_VIDEO_RES),
    aspect_ratio: mkEnum(WAN_ASPECTS_5, { default: "16:9" }),
    duration: mkNum({ minimum: 2, maximum: 10, default: 5 }),
    prompt_extend: mkBool(),
    watermark: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    input_urls: mkArr(),
    aspect_ratio: mkEnum(["1:1", "16:9", "4:3", "21:9", "3:4", "9:16", "8:1", "1:8"]),
    enable_sequential: mkBool(),
    n: mkNum({ minimum: 1 }),
    resolution: mkEnum(RES_1K2K4K),
    thinking_mode: { required: false },
    color_palette: { required: false },
    bbox_list: { required: false },
    watermark: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
  "wan-2.7-image-pro": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    input_urls: mkArr({ maxItems: 9 }),
    aspect_ratio: mkEnum(["1:1", "16:9", "4:3", "21:9", "3:4", "9:16", "8:1", "1:8"]),
    enable_sequential: mkBool(),
    n: mkNum({ minimum: 1 }),
    resolution: mkEnum(RES_1K2K4K),
    thinking_mode: { required: false },
    color_palette: { required: false },
    bbox_list: { required: false },
    watermark: mkBool(),
    seed: mkNum(),
    nsfw_checker: mkBool(),
  } },
};

// ── Kling ──────────────────────────────────────────────────────────────────
// Duration typing (M-straggler, live probe 2026-08-05): `kling-2.6/
// text-to-video` answered 500 "duration it must be a string" when sent a
// NUMBER — the whole Kling family takes its 5/10 enum as STRINGS ("5"/"10"),
// which video-market.md already records for the image-to-video and
// v2.5-turbo-image siblings. Every fixed 5/10 enum below is therefore a
// string enum; only the v3-turbo pair keeps a numeric duration (the doc
// gives it a free 3–15s RANGE, not an enum — no string evidence there).
const KLING_SCHEMAS = {
  // Real model field is version-prefixed `kling-2.6/text-to-video`.
  "kling-2.6-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    sound: mkBool({ required: true, default: false }),
    aspect_ratio: mkEnum(KLING_ASPECTS, { required: true }),
    duration: mkEnum(["5", "10"], { required: true, default: "5" }),
  } },
  "kling-2.6-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ required: true }),
    sound: mkBool({ required: true, default: false }),
    duration: mkEnum(["5", "10"], { required: true }),
  } },
  "kling-v2.5-turbo-image-to-video-pro": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    tail_image_url: mkUri(),
    duration: mkEnum(["5", "10"], { default: "5" }),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1 }),
  } },
  "kling-v2.5-turbo-text-to-video-pro": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkEnum(["5", "10"]),
    aspect_ratio: mkEnum(["16:9", "9:16", "1:1"]),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1, default: 0.5 }),
  } },
  // The avatar pair takes NO duration/resolution/aspect_ratio at all.
  "kling-ai-avatar-standard": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    prompt: mkStr({ required: true }),
  } },
  "kling-ai-avatar-pro": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    prompt: mkStr({ required: true }),
  } },
  "kling-v2.1-master-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["5", "10"]),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1, default: 0.5 }),
  } },
  "kling-v2.1-master-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkEnum(["5", "10"], { default: "5" }),
    aspect_ratio: mkEnum(["16:9", "9:16", "1:1"], { default: "16:9" }),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1 }),
  } },
  "kling-v2.1-pro": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["5", "10"]),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1 }),
    tail_image_url: mkUri(),
  } },
  "kling-v2.1-standard": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["5", "10"]),
    negative_prompt: mkStr(),
    cfg_scale: mkNum({ minimum: 0, maximum: 1 }),
  } },
  // Real model `kling-2.6/motion-control`.
  "kling-2.6-motion-control": { replace: true, fields: {
    prompt: mkStr(),
    input_urls: mkArr({ required: true }),
    video_urls: mkArr({ required: true }),
    character_orientation: mkEnum(["image", "video"], { required: true }),
    mode: mkEnum(["720p", "1080p"], { required: true }),
  } },
  // Real model `kling-3.0/motion-control`.
  "kling-3.0-motion-control": { replace: true, fields: {
    prompt: mkStr(),
    input_urls: mkArr({ required: true }),
    video_urls: mkArr({ required: true }),
    mode: mkEnum(["std", "pro"]),
    character_orientation: mkEnum(["image", "video"]),
    background_source: mkEnum(["input_video", "input_image"]),
  } },
  // Real model `kling-3.0/video` (stored row: kling/kling-3-0).
  // `sound` is provider-required: the live probe (2026-08-05) answered
  // 500 "This field is required" on a payload without it — see
  // PROVIDER_REQUIRED_FIELDS in provider-payload-core.mjs. required+default
  // lets applyRequiredDefaults fill it (sound is a FILLABLE rendering
  // setting) instead of every prompt-only submit failing.
  "kling-3.0-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr(),
    sound: mkBool({ required: true, default: false }),
    duration: mkEnum(["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]),
    aspect_ratio: mkEnum(["16:9", "9:16", "1:1"]),
    mode: mkEnum(["std", "pro", "4K"]),
    // Probe round 3 (2026-08-05): 422 "multi_shots cannot be empty" once
    // the other settings were supplied — required with a single-shot
    // default so applyRequiredDefaults can fill it.
    multi_shots: mkBool({ required: true, default: false }),
    multi_prompt: { required: false },
    kling_elements: { required: false },
  } },
  "kling-v3-turbo-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkNum({ required: true, minimum: 3, maximum: 15, default: 5 }),
    aspect_ratio: mkEnum(["1:1", "9:16", "16:9"], { required: true }),
    resolution: mkEnum(["720p", "1080p"], { required: true }),
  } },
  "kling-v3-turbo-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ required: true }),
    duration: mkNum({ required: true, minimum: 3, maximum: 15, default: 5 }),
    resolution: mkEnum(["720p", "1080p"], { required: true, default: "720p" }),
  } },
};

// ── Google Gemini TTS ──────────────────────────────────────────────────────
// The voice is a named preset, not a description. Without this the row
// carried only `prompt`, so every request went out with no voice_name — a
// required field — and the caller had no way to pick or audition a voice.
export const GEMINI_TTS_VOICES = [
  "Achernar", "Achird", "Algenib", "Algieba", "Alnilam", "Aoede", "Autonoe",
  "Callirrhoe", "Charon", "Despina", "Enceladus", "Erinome", "Fenrir",
  "Gacrux", "Iapetus", "Kore", "Laomedeia", "Leda", "Orus", "Puck",
  "Pulcherrima", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar",
  "Sulafat", "Umbriel", "Vindemiatrix", "Zephyr", "Zubenelgenubi",
];

const GEMINI_TTS_SCHEMAS = {
  "google-gemini-3-1-flash-tts": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    voice_name: mkEnum(GEMINI_TTS_VOICES, { required: true, default: "Charon" }),
  } },
};

// ── Bytedance Seedance ─────────────────────────────────────────────────────
const SEEDANCE_2_BASE_FIELDS = {
  prompt: mkStr({ required: true }),
  first_frame_url: mkUri(),
  last_frame_url: mkUri(),
  reference_image_urls: mkArr(),
  reference_video_urls: mkArr(),
  reference_audio_urls: mkArr(),
  generate_audio: mkBool(),
  aspect_ratio: mkEnum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"]),
  duration: mkNum({ minimum: 4, maximum: 15, default: 5 }),
  web_search: mkBool(),
  nsfw_checker: mkBool(),
};
const SEEDANCE_SCHEMAS = {
  "bytedance-seedance-2": { replace: true, fields: {
    ...SEEDANCE_2_BASE_FIELDS,
    return_last_frame: mkBool(),
    resolution: mkEnum(["480p", "720p", "1080p", "4k"]),
  } },
  "bytedance-seedance-2-fast": { replace: true, fields: {
    ...SEEDANCE_2_BASE_FIELDS,
    return_last_frame: mkBool(),
    resolution: mkEnum(["480p", "720p"]),
  } },
  "bytedance-seedance-2-mini": { replace: true, fields: {
    ...SEEDANCE_2_BASE_FIELDS,
    resolution: mkEnum(["480p", "720p"]),
  } },
  // Seedance 2.5 does NOT extend the 2.x base: it drops first_frame_url and
  // last_frame_url entirely (a `frame_key` handle replaces them) and caps
  // resolution at 720p, so it cannot do the first/last-frame chaining the
  // 2.0 row is used for. In exchange it takes a 30k-character prompt, runs
  // to 30 seconds, and addresses individual references from inside the
  // prompt (@Image1, @Image2) — which is how you put two versions of the
  // same face in one frame and say which is which.
  "bytedance-seedance-2-5": { replace: true, fields: {
    prompt: mkStr({ maxLength: 30000 }),
    frame_key: mkStr(),
    reference_image_urls: mkArr(),
    reference_video_urls: mkArr(),
    reference_audio_urls: mkArr(),
    generate_audio: mkBool({ default: true }),
    return_last_frame: mkBool(),
    resolution: mkEnum(["480p", "720p"], { default: "720p" }),
    aspect_ratio: mkEnum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"], { default: "adaptive" }),
    duration: mkNum({ minimum: -1, maximum: 30, default: 5 }),
    output_format: mkEnum(["mp4", "mov"], { default: "mp4" }),
    web_search: mkBool({ default: false }),
    nsfw_checker: mkBool({ default: true }),
  } },
  // Real model field uses a DOT: `bytedance/seedance-1.5-pro`.
  "bytedance-seedance-1.5-pro": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    input_urls: mkArr(),
    aspect_ratio: mkEnum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"], { required: true }),
    resolution: mkEnum(["480p", "720p", "1080p"]),
    duration: mkNum({ required: true, minimum: 4, maximum: 12 }),
    fixed_lens: mkBool(),
    generate_audio: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "bytedance-v1-pro-fast-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    resolution: mkEnum(["720p", "1080p"]),
    duration: mkEnum(["5", "10"]),
    nsfw_checker: mkBool(),
  } },
  "bytedance-v1-pro-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    resolution: mkEnum(["480p", "720p", "1080p"]),
    duration: mkEnum([5, 10]),
    camera_fixed: mkBool(),
    seed: mkNum(),
    enable_safety_checker: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "bytedance-v1-pro-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    aspect_ratio: mkEnum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]),
    resolution: mkEnum(["480p", "720p", "1080p"]),
    duration: mkEnum([5, 10]),
    camera_fixed: mkBool(),
    seed: mkNum(),
    enable_safety_checker: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "bytedance-v1-lite-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    resolution: mkEnum(["480p", "720p", "1080p"]),
    duration: mkEnum(["5", "10"]),
    camera_fixed: mkBool(),
    seed: mkNum(),
    enable_safety_checker: mkBool(),
    end_image_url: mkUri(),
    nsfw_checker: mkBool(),
  } },
  "bytedance-v1-lite-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 10000 }),
    aspect_ratio: mkEnum(["16:9", "4:3", "1:1", "3:4", "9:16", "9:21"], { default: "16:9" }),
    resolution: mkEnum(["480p", "720p", "1080p"], { default: "720p" }),
    duration: mkEnum([5, 10], { default: 5 }),
    camera_fixed: mkBool(),
    seed: mkNum({ default: -1 }),
    enable_safety_checker: mkBool(),
    nsfw_checker: mkBool(),
  } },
};

// ── Hailuo (the 02 pro tiers take NO video-shape fields at all) ───────────
const HAILUO_SCHEMAS = {
  "hailuo-2.3-image-to-video-pro": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["6", "10"], { default: "6" }),
    resolution: mkEnum(["768P", "1080P"]), // uppercase P — the real enum
    nsfw_checker: mkBool(),
  } },
  "hailuo-2.3-image-to-video-standard": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 5000 }),
    image_url: mkUri({ required: true }),
    duration: mkEnum(["6", "10"], { default: "6" }),
    resolution: mkEnum(["768P", "1080P"]),
    nsfw_checker: mkBool(),
  } },
  "hailuo-02-text-to-video-pro": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1500 }),
    prompt_optimizer: mkBool(),
    nsfw_checker: mkBool({ default: false }),
  } },
  "hailuo-02-image-to-video-pro": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1500 }),
    image_url: mkUri({ required: true }),
    end_image_url: mkUri(),
    prompt_optimizer: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "hailuo-02-text-to-video-standard": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkEnum(["6", "10"]),
    prompt_optimizer: mkBool(),
    nsfw_checker: mkBool(),
  } },
  "hailuo-02-image-to-video-standard": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_url: mkUri({ required: true }),
    end_image_url: mkUri(),
    duration: mkEnum(["6", "10"], { default: "10" }),
    resolution: mkEnum(["512P", "768P"], { default: "768P" }),
    prompt_optimizer: mkBool(),
    nsfw_checker: mkBool(),
  } },
};

// ── PixVerse (`quality`, never `resolution`; real ids carry `-v6`) ─────────
const PIXVERSE_SCHEMAS = {
  // `quality` is provider-required on text-to-video despite the doc marking
  // it optional-with-default: the live probe (2026-08-05) answered 500
  // "This field is required" on a payload without it — see
  // PROVIDER_REQUIRED_FIELDS in provider-payload-core.mjs. required+default
  // lets applyRequiredDefaults fill "720p".
  "pixverse-v6-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    aspect_ratio: mkEnum(PIXVERSE_ASPECTS, { default: "16:9" }),
    quality: mkEnum(PIXVERSE_QUALITIES, { required: true, default: "720p" }),
    duration: mkNum({ required: true, minimum: 1, maximum: 15 }),
    generate_audio_switch: mkBool(),
    generate_multi_clip_switch: mkBool(),
    seed: mkNum(),
  } },
  "pixverse-v6-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, minLength: 3, maxLength: 5000 }),
    image_urls: mkArr({ required: true, maxItems: 2 }),
    quality: mkEnum(PIXVERSE_QUALITIES, { required: true }),
    duration: mkNum({ minimum: 1, maximum: 15 }),
    template_id: mkStr(),
    generate_audio_switch: mkBool(),
    generate_multi_clip_switch: mkBool(),
    seed: mkNum(),
  } },
  "pixverse-v6-transition": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    first_frame_image_url: mkUri({ required: true }),
    last_frame_image_url: mkUri({ required: true }),
    quality: mkEnum(PIXVERSE_QUALITIES, { required: true }),
    duration: mkNum({ required: true, minimum: 1, maximum: 15 }),
    generate_audio_switch: mkBool(),
    seed: mkNum(),
  } },
  "pixverse-v6-extend": { replace: true, fields: {
    prompt: mkStr({ required: true, minLength: 3, maxLength: 5000 }),
    duration: mkNum({ required: true, minimum: 1, maximum: 15 }),
    quality: mkEnum(PIXVERSE_QUALITIES, { required: true }),
    taskId: mkStr(),
    video_url: mkUri(),
    generate_audio_switch: mkBool(),
    seed: mkNum(),
  } },
  "pixverse-v6-reference-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, minLength: 3, maxLength: 5000 }),
    image_references: mkArr({ required: true, minItems: 1, maxItems: 7 }),
    aspect_ratio: mkEnum(PIXVERSE_ASPECTS, { default: "16:9" }),
    quality: mkEnum(PIXVERSE_QUALITIES, { default: "720p" }),
    duration: mkNum({ minimum: 1, maximum: 15, default: 5 }),
    generate_audio_switch: mkBool(),
    seed: mkNum(),
  } },
};

// ── MiniMax-H3 (uppercase `768P`/`2K` — no lowercase variant exists) ───────
const MINIMAX_H3_SCHEMAS = {
  "minimax-h3-text-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 7000 }),
    aspect_ratio: mkEnum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], { required: true }),
    duration: mkNum({ required: true, minimum: 4, maximum: 15 }),
    resolution: mkEnum(MINIMAX_RES, { default: "2K" }),
  } },
  "minimax-h3-image-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 7000 }),
    duration: mkNum({ required: true, minimum: 4, maximum: 15 }),
    first_frame_url: mkUri(),
    last_frame_url: mkUri(),
    resolution: mkEnum(MINIMAX_RES),
  } },
  "minimax-h3-reference-to-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 7000 }),
    duration: mkNum({ required: true, minimum: 4, maximum: 15 }),
    reference_image_urls: mkArr({ maxItems: 9 }),
    reference_video_urls: mkArr({ maxItems: 3 }),
    reference_audio_urls: mkArr({ maxItems: 3 }),
    aspect_ratio: mkStr({ default: "adaptive" }),
    resolution: mkEnum(MINIMAX_RES, { default: "2K" }),
  } },
};

// ── Infinitalk / Gemini-Omni / OmniHuman / Volcengine ─────────────────────
const AVATAR_MISC_SCHEMAS = {
  "infinitalk-from-audio": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    prompt: mkStr({ required: true, maxLength: 5000 }),
    resolution: mkEnum(["480p", "720p"], { default: "480p" }),
    seed: mkNum({ minimum: 10000, maximum: 1000000 }),
  } },
  "gemini-omni-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    duration: mkEnum(["4", "6", "8", "10"], { required: true }),
    image_urls: mkArr(),
    audio_ids: mkArr(),
    video_list: mkArr(),
    character_ids: mkArr(),
    aspect_ratio: mkEnum(["16:9", "9:16"]),
    seed: mkNum(),
    resolution: mkEnum(["720p", "1080p", "4k"]),
  } },
  "gemini-omni-audio": { replace: true, fields: {
    // audio_id is one of ~30 preset voice ids the doc enumerates on its own
    // page — left un-enumed rather than transcribing a partial list.
    audio_id: mkStr({ required: true }),
    name: mkStr({ required: true, maxLength: 210 }),
    voice_description: mkStr({ maxLength: 20000 }),
    example_dialogue: mkStr({ maxLength: 120 }),
  } },
  "gemini-omni-character": { replace: true, fields: {
    descriptions: mkStr({ required: true }),
    image_urls: mkArr({ required: true, maxItems: 1 }),
    audio_ids: mkArr(),
    character_name: mkStr(),
  } },
  "omnihuman-1.5": { replace: true, fields: {
    image_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    mask_url: mkArr({ maxItems: 5 }),
    prompt: mkStr({ maxLength: 300 }),
    // Bare numbers, not "720p"/"1080p".
    output_resolution: mkEnum(["720", "1080"], { default: "1080" }),
    pe_fast_mode: mkBool(),
    seed: mkNum({ default: -1 }),
  } },
  "omnihuman-1.5-human-identification": { replace: true, fields: {
    image_url: mkUri({ required: true }),
  } },
  "omnihuman-1.5-subject-detection": { replace: true, fields: {
    image_url: mkUri({ required: true }),
  } },
  // Volcengine lipsync has NO prompt field at all.
  "volcengine-video-to-video-lip-sync": { replace: true, fields: {
    mode: mkEnum(["lite", "basic"], { required: true }),
    video_url: mkUri({ required: true }),
    audio_url: mkUri({ required: true }),
    separate_vocal: mkBool(),
    open_scenedet: mkBool(),
    align_audio: mkBool({ default: true }),
    align_audio_reverse: mkBool(),
    templ_start_seconds: mkNum(),
  } },
};

// ── Dedicated-API rows (audit class E; adapters in image-payload-core.mjs /
// video-payload-core.mjs own the field-name translation to the wire) ───────
const DEDICATED_API_SCHEMAS = {
  "generate-4-o-image": { replace: true, fields: {
    // At least one of prompt/filesUrl is required — neither alone is.
    prompt: mkStr(),
    size: mkEnum(["1:1", "3:2", "2:3"], { required: true, default: "1:1" }),
    filesUrl: mkArr({ maxItems: 5 }),
    maskUrl: mkUri(),
    nVariants: mkEnum([1, 2, 4]),
    isEnhance: mkBool({ default: false }),
    enableFallback: mkBool({ default: false }),
    fallbackModel: mkEnum(["FLUX_MAX", "GPT_IMAGE_1"]),
  } },
  "generate-or-edit-image": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    // Tier selector (canonical name; the adapter sends it as `model`).
    model_tier: mkEnum(["flux-kontext-pro", "flux-kontext-max"], { default: "flux-kontext-pro" }),
    aspect_ratio: mkEnum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "16:21"], { default: "16:9" }),
    image_url: mkUri(), // optional — edit mode only when present
    output_format: mkEnum(["jpeg", "png"], { default: "jpeg" }),
    prompt_upsampling: mkBool({ default: false }),
    safety_tolerance: mkNum({ minimum: 0, maximum: 6, default: 2 }),
    watermark: mkStr(),
  } },
  "generate-ai-video": { replace: true, fields: {
    prompt: mkStr({ required: true, maxLength: 1800 }),
    duration: mkEnum([5, 10], { required: true, default: 5 }),
    quality: mkEnum(["720p", "1080p"], { required: true, default: "720p" }),
    image_url: mkUri(), // presence flips the endpoint into i2v mode
    aspect_ratio: mkEnum(["16:9", "4:3", "1:1", "3:4", "9:16"], { default: "16:9" }),
    watermark: mkStr(),
  } },
  "extend-ai-video": { replace: true, fields: {
    task_id: mkStr({ required: true }), // a prior Runway generation's taskId
    prompt: mkStr({ required: true }),
    quality: mkEnum(["720p", "1080p"], { required: true, default: "720p" }),
    watermark: mkStr(),
  } },
  "generate-aleph-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    video_url: mkUri({ required: true }),
    aspect_ratio: mkEnum(["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"]),
    seed: mkNum(),
    reference_image: mkUri(),
    watermark: mkStr(),
  } },
  "generate-veo-3-video": { replace: true, fields: {
    prompt: mkStr({ required: true }),
    image_urls: mkArr({ maxItems: 2 }),
    // M-straggler (probes 2026-08-05): the doc's veo3/veo3_fast/veo3_lite
    // enum IS the accepted wire enum (a "veo3.1-fast" probe 422'd "Invalid
    // model") — the original 422 came from OMITTING `model` entirely; the
    // adapter (video-payload-core.mjs buildVeoBody) now always sends one.
    model_tier: mkEnum(["veo3", "veo3_fast", "veo3_lite"], { default: "veo3_fast" }),
    generation_type: mkEnum(["TEXT_2_VIDEO", "FIRST_AND_LAST_FRAMES_2_VIDEO", "REFERENCE_2_VIDEO"]),
    aspect_ratio: mkEnum(["16:9", "9:16", "Auto"], { default: "16:9" }),
    resolution: mkEnum(["720p", "1080p", "4k"], { default: "720p" }),
    duration: mkEnum([4, 6, 8], { default: 8 }),
    watermark: mkStr(),
    enable_translation: mkBool({ default: false }),
  } },
  "extend-video": { replace: true, fields: {
    task_id: mkStr({ required: true }), // a prior Veo3 generation's taskId
    prompt: mkStr({ required: true }),
    seeds: mkNum({ minimum: 10000, maximum: 99999 }),
    model_tier: mkEnum(["fast", "quality", "lite"], { default: "fast" }),
    watermark: mkStr(),
  } },
};

export const M2_FAMILY_SCHEMAS = {
  ...SEEDREAM_SCHEMAS,
  ...GOOGLE_IMAGE_SCHEMAS,
  ...FLUX2_SCHEMAS,
  ...GROK_IMAGINE_SCHEMAS,
  ...GPT_IMAGE_SCHEMAS,
  ...IDEOGRAM_SCHEMAS,
  ...QWEN_SCHEMAS,
  ...Z_IMAGE_SCHEMAS,
  ...TOPAZ_SCHEMAS,
  ...RECRAFT_SCHEMAS,
  ...WAN_SCHEMAS,
  ...KLING_SCHEMAS,
  ...SEEDANCE_SCHEMAS,
  ...GEMINI_TTS_SCHEMAS,
  ...HAILUO_SCHEMAS,
  ...PIXVERSE_SCHEMAS,
  ...MINIMAX_H3_SCHEMAS,
  ...AVATAR_MISC_SCHEMAS,
  ...DEDICATED_API_SCHEMAS,
};

// Current-DB-row aliases: where the live row's id differs from the real API
// model string (wrong vendor prefix / missing version segment / sync's own
// hyphenation bug — audit classes 1/7/8/9), the same schema object is also
// reachable under the row's CURRENT key, so the row gets its real schema
// today, before its id is repointed by the backfill.
const M2_SCHEMA_ALIASES = {
  "seedream-seedream": "bytedance-seedream",
  "seedream-seedream-v4-text-to-image": "bytedance-seedream-v4-text-to-image",
  "seedream-seedream-v4-edit": "bytedance-seedream-v4-edit",
  "google-nanobanana2": "nano-banana-2",
  "google-nano-banana-2-lite": "nano-banana-2-lite",
  "google-pro-image-to-image": "nano-banana-pro",
  "gpt-gpt-image-2-text-to-image": "gpt-image-2-text-to-image",
  "gpt-gpt-image-2-image-to-image": "gpt-image-2-image-to-image",
  "qwen-2-image-edit": "qwen2-image-edit",
  "z-image-z-image": "z-image",
  "kling-text-to-video": "kling-2.6-text-to-video",
  "kling-image-to-video": "kling-2.6-image-to-video",
  "kling-v25-turbo-image-to-video-pro": "kling-v2.5-turbo-image-to-video-pro",
  "kling-v25-turbo-text-to-video-pro": "kling-v2.5-turbo-text-to-video-pro",
  "kling-motion-control": "kling-2.6-motion-control",
  "kling-motion-control-v3": "kling-3.0-motion-control",
  "kling-kling-3.0": "kling-3.0-video",
  "pixverse-text-to-video": "pixverse-v6-text-to-video",
  "pixverse-image-to-video": "pixverse-v6-image-to-video",
  "pixverse-transition": "pixverse-v6-transition",
  "pixverse-extend": "pixverse-v6-extend",
  "pixverse-reference-to-video": "pixverse-v6-reference-to-video",
};

for (const [aliasKey, canonicalKey] of Object.entries(M2_SCHEMA_ALIASES)) {
  M2_FAMILY_SCHEMAS[aliasKey] = M2_FAMILY_SCHEMAS[canonicalKey];
}

Object.assign(CURATED_SCHEMAS, M2_FAMILY_SCHEMAS);
