// ── Catalog verification (BUG 1) ───────────────────────────────────────────
// src/lib/kie-sync.js builds the KIE half of the catalog by crawling
// https://docs.kie.ai/sitemap.xml and turning DOC-PAGE PATHS into model ids.
// Plenty of those pages are not callable models at all, so the id we store
// is not an id the provider's API has ever heard of. Measured on live
// production (2026-08-04): all-time 27 failed / 5 completed generations, and
// only three model ids have EVER succeeded. Live probes of the stored ids:
//
//   z-image/z-image            → {"code":422,"msg":"The model name you specified is not supported…"}
//   google/nano-banana-2-lite  → same
//   generate-4-o-image         → same
//   suno/generate-music        → same
//   veo3                       → same
//   flux-2/pro-text-to-image   → {"code":500,"msg":"aspect_ratio is required"}   (callable!)
//   elevenlabs/…-turbo-2-5     → {"code":500,"msg":"text is required"}           (callable!)
//
// This module is the pure, dependency-free classifier the sweep
// (scripts/verify-catalog.mjs) runs over each probe response. It is separate
// from the script so it can be unit-tested against captured fixtures without
// a network or a database.
//
// CRITICAL, and the reason the classifier cannot simply read res.status:
// KIE answers createTask with **HTTP 200** and puts the real status in the
// response ENVELOPE (`{ code: 422, msg: "…", data: null }`). Every probe
// above came back HTTP 200. effectiveStatus() below resolves that.

export const VERDICT = {
  CALLABLE: "callable",
  NEEDS_PARAM: "needs-param",
  NOT_CALLABLE: "not-callable",
  INCONCLUSIVE: "inconclusive",
};

// Verdicts that mean "this model can serve a generation". needs-param is
// callable: the provider recognised the model and only rejected the
// parameters, which src/lib/provider-payload-core.mjs then fills in.
const CALLABLE_VERDICTS = new Set([VERDICT.CALLABLE, VERDICT.NEEDS_PARAM]);

export function isCallableVerdict(verdict) {
  return CALLABLE_VERDICTS.has(verdict);
}

// The provider's real status. KIE: HTTP 200 + `{code:422}` envelope.
// DashScope: a true HTTP status plus a string `code` ("AccessDenied",
// "InvalidParameter") that is NOT numeric and must not be mistaken for one.
export function effectiveStatus({ status, body } = {}) {
  const envelope = body && typeof body === "object" ? Number(body.code) : NaN;
  if (Number.isFinite(envelope) && envelope >= 100 && envelope < 600) return envelope;
  const http = Number(status);
  return Number.isFinite(http) ? http : 0;
}

// Every message-ish field the two providers use, flattened to one string.
export function messageOf(body) {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (typeof body !== "object") return String(body);
  const parts = [
    body.msg,
    body.message,
    body.error,
    typeof body.code === "string" ? body.code : null,
    body.output?.message,
    body.data?.msg,
    body.data?.message,
    body.detail,
  ].filter((p) => typeof p === "string" && p);
  if (parts.length) return parts.join(" — ");
  try {
    return JSON.stringify(body).slice(0, 500);
  } catch {
    return "";
  }
}

// "This id is not a model on this route." Includes DashScope's misleadingly
// worded AccessDenied ("current user api does not support asynchronous
// calls"), which live probing proved is per-model-and-route, not per-account
// — see src/lib/alibaba-provider-core.mjs's routing header.
const NOT_SUPPORTED_RE =
  /model name you specified is not supported|model not exist|model does not exist|unsupported model|unknown model|no such model|invalid model|model_not_found|accessdenied|access denied|does not support (?:a)?synchronous calls/i;

// A missing/invalid REQUIRED parameter — the model itself is fine.
// Ordered alternatives; the first capturing group that matched is the field.
const REQUIRED_FIELD_PATTERNS = [
  /(?:^|[^\w])([a-z0-9_.]+)\s+is\s+required\b/i,
  /\bfield\s+required:\s*([a-z0-9_.]+)/i,
  /\bmissing\s+(?:the\s+)?required\s+(?:parameter|field|param|argument)[:\s"'`]*([a-z0-9_.]+)/i,
  /\brequired\s+(?:parameter|field|param|argument)[:\s"'`]*([a-z0-9_.]+)/i,
  /\bparameter\s+['"`]?([a-z0-9_.]+)['"`]?\s+is\s+(?:required|missing)/i,
];

// Wording that means "the model ran the request through its own validator"
// — i.e. the model exists and is reachable, only the values were wrong.
// Includes the media-fetch rejections a probe's PLACEHOLDER asset URL
// provokes (DashScope: "InvalidParameter.DataInspection — Failed to find the
// requested media resource during the data inspection process"). Those are
// the cheapest possible proof a model is reachable: the request got all the
// way to the model's own validator and was refused for free.
const PARAM_REJECTED_RE =
  /invalidparameter|invalid[_ ]parameter|does not match the allowed|out of range|must be between|must be in |is not supported for|illegal|unsupported (?:size|resolution|duration|aspect)|datainspection|data inspection|failed to (?:find|download|fetch) the requested media|(?:image|video|audio) (?:url|file) (?:is )?(?:invalid|unreachable|not accessible)|download.*(?:failed|timeout)/i;

export function extractRequiredField(message) {
  const text = String(message || "");
  for (const re of REQUIRED_FIELD_PATTERNS) {
    const m = re.exec(text);
    if (m && m[1]) {
      // "input.media" → "media": providers name nested fields with a path.
      const field = m[1].split(".").pop();
      // Guard against matching a sentence fragment like "a value is required".
      if (/^[a-z][a-z0-9_]*$/i.test(field)) return field;
    }
  }
  return null;
}

/**
 * Classify one probe response.
 *
 * @param {object} probe
 * @param {number} [probe.status]  HTTP status (ignored when an envelope code is present)
 * @param {object|string} [probe.body]  parsed JSON body, or raw text
 * @param {Error|string} [probe.error]  transport-level failure (timeout, DNS, socket)
 * @returns {{ verdict: string, callable: boolean|null, status: number, missingField: string|null, reason: string }}
 */
export function classifyProbeResponse(probe = {}) {
  const { error } = probe;
  const make = (verdict, reason, missingField = null, status = 0) => ({
    verdict,
    callable: verdict === VERDICT.INCONCLUSIVE ? null : isCallableVerdict(verdict),
    status,
    missingField,
    reason: String(reason || "").slice(0, 400),
  });

  // Transport failure — we learned nothing about the model. NEVER deactivate.
  if (error) {
    return make(VERDICT.INCONCLUSIVE, `transport failure: ${error?.message || error}`);
  }

  const status = effectiveStatus(probe);
  const message = messageOf(probe.body);

  if (status >= 200 && status < 300) {
    return make(VERDICT.CALLABLE, "provider accepted the submit", null, status);
  }

  // A missing-required-parameter answer proves the model exists, whatever
  // status the provider chose to dress it in (KIE uses 500 for this).
  const missingField = extractRequiredField(message);
  if (missingField) {
    return make(VERDICT.NEEDS_PARAM, message, missingField, status);
  }

  if (NOT_SUPPORTED_RE.test(message)) {
    return make(VERDICT.NOT_CALLABLE, message, null, status);
  }

  // Rate limiting is the definition of transient.
  if (status === 429) return make(VERDICT.INCONCLUSIVE, message || "rate limited", null, status);

  // A broken/expired key or a quota problem says nothing about this model.
  if (status === 401 || /unauthorized|invalid api ?key|token (?:expired|invalid)|insufficient (?:balance|credit|quota)|arrearage/i.test(message)) {
    return make(VERDICT.INCONCLUSIVE, message || "authentication/quota problem", null, status);
  }

  if (status >= 500) {
    // An unrelated 5xx is a provider outage, not a dead model.
    return make(VERDICT.INCONCLUSIVE, message || `provider ${status}`, null, status);
  }

  if (status === 400 || status === 422 || status === 404) {
    // The model's own validator answered → it exists and is reachable.
    if (PARAM_REJECTED_RE.test(message)) {
      return make(VERDICT.NEEDS_PARAM, message, null, status);
    }
    // 404 with no other signal is a routing/id miss → not callable.
    if (status === 404) return make(VERDICT.NOT_CALLABLE, message || "404", null, status);
    return make(VERDICT.INCONCLUSIVE, message || `provider ${status}`, null, status);
  }

  if (status === 403) {
    return make(VERDICT.NOT_CALLABLE, message || "403 forbidden", null, status);
  }

  return make(VERDICT.INCONCLUSIVE, message || `unclassified status ${status}`, null, status);
}

// ── Where the verdict is stored (no schema change) ─────────────────────────
// prisma/schema.prisma is off-limits and ModelPricing has no verification
// column — but it already has TWO Json columns the sync itself writes:
// `constraints` (today: just inputSchema.ui) and `inputSchema`. The verdict
// lives under constraints.verification and the discovered required fields
// under inputSchema.providerRequired. Both are additive keys inside blobs
// the app already round-trips, so nothing structural changes and no
// migration is needed. constraints — NOT `description` — is deliberate:
// description is rendered to end users, and a reason like "model name not
// supported by KIE" would leak the upstream provider identity the rest of
// the catalog goes to some length to hide (see model-catalog-core.mjs's
// sanitizeCatalogDescription).
export const VERIFICATION_KEY = "verification";

// A row the sync has just discovered but nothing has ever probed.
export const STATUS_PENDING = "pending";

export function readVerification(constraints) {
  const v = constraints && typeof constraints === "object" ? constraints[VERIFICATION_KEY] : null;
  return v && typeof v === "object" ? v : null;
}

export function writeVerification(constraints, verification) {
  const base = constraints && typeof constraints === "object" && !Array.isArray(constraints) ? constraints : {};
  return { ...base, [VERIFICATION_KEY]: verification };
}

// Whether a row may be presented to users as usable.
//   verified callable      → yes
//   verified not-callable  → no (and the sync must never resurrect it)
//   pending (never probed) → no — a brand-new sitemap slug is exactly the
//                            thing that turned out to be uncallable 84% of
//                            the time; it becomes usable once the sweep
//                            proves it.
//   no verification block  → yes — every row that predates this feature
//                            keeps its existing activity untouched, so
//                            shipping this cannot take the live catalog
//                            offline.
export function verificationAllowsActive(constraints, fallback = true) {
  const v = readVerification(constraints);
  if (!v) return fallback;
  if (v.status === STATUS_PENDING) return false;
  if (typeof v.callable === "boolean") return v.callable;
  if (v.verdict) return isCallableVerdict(v.verdict);
  return fallback;
}

// Merge a discovered required field into an inputSchema blob, idempotently.
export function withProviderRequired(inputSchema, fields) {
  const list = (Array.isArray(fields) ? fields : [fields]).filter((f) => typeof f === "string" && f);
  if (!list.length) return inputSchema;
  const base = inputSchema && typeof inputSchema === "object" && !Array.isArray(inputSchema) ? inputSchema : {};
  const existing = Array.isArray(base.providerRequired) ? base.providerRequired : [];
  const merged = [...existing];
  for (const f of list) if (!merged.includes(f)) merged.push(f);
  if (merged.length === existing.length) return base;
  return { ...base, providerRequired: merged };
}

// ── Non-generation documentation endpoints (BUG 1: junk "models") ─────────
// kie-sync.js turns every docs.kie.ai PAGE into a candidate model id, but a
// provider's doc site also carries pages for polling a task's status,
// running a separate request validator, or receiving a webhook callback —
// none of those are a model a generation can ever be submitted to. Measured
// on live production (2026-08-05), ACTIVE in the audio pool and visible in
// the Music studio's model picker:
//   suno-voice-generate-callback, suno-voice-record-info, suno-voice-validate,
//   suno-voice-validate-callback, suno-voice-validate-info
//
// This is checked against the model's own id BEFORE any network probe runs
// — free and deterministic, unlike scripts/verify-catalog.mjs's sweep, which
// spends a real provider request per model. classifyNonGenerationEndpoint
// (below) returns the SAME shape classifyProbeResponse does, carrying the
// SAME VERDICT.NOT_CALLABLE this file already defines, so "not usable" has
// exactly one definition regardless of which mechanism decided it — a
// caller feeds either classifier's output through verificationAllowsActive
// (or buildVerification, below) identically.
//
// Each rule is checked against the id's own BASENAME (the final "/"
// segment, lowercased) and anchored to a token boundary, never a bare
// substring — so a genuinely-named generator is never caught by
// coincidence:
//   "-callback"  a SUFFIX only — a model that merely mentions "callback"
//                mid-name (none exist today) would be untouched
//   "validate"   bounded by hyphens/string-edges on both sides — does not
//                fire on a hypothetical "invalidated-frames" tool
//   "-info"      a SUFFIX only — "info" appearing mid-word (e.g. a
//                hypothetical "infographic-maker") is left alone; this
//                also covers "record-info" (get/query a stored record) as
//                one case of the same suffix, without a redundant rule
// Real, currently-active generators that a naive "contains generate/info/
// get" rule would have wrongly swept up (kept OUT of this list on purpose):
// "suno-voice-generate" (the actual voice-cloning generator — the callback/
// validate/info pages above are ABOUT this same generator, not it) and
// "suno-voice-regenerate"/"suno-voice-check-voice" (no "-callback" suffix,
// no "validate" token, no "-info" suffix — real actions, not doc-only
// pages, so this rule correctly leaves them alone; extend this list with a
// new named rule, never a broadened existing one, if either ever turns out
// to be a documentation-only page too).
const NON_GENERATION_ENDPOINT_RULES = [
  ["callback", /-callback$/],
  ["validate", /(?:^|-)validate(?:-|$)/],
  ["info", /-info$/],
];

// The name of the first rule that matches, or null. Exposed separately from
// the boolean check below so a verdict's `reason` can name exactly which
// rule fired, for an operator reading scripts/fix-model-categories.mjs's
// output or ModelPricing.constraints.verification directly.
export function nonGenerationEndpointRule(modelId) {
  const basename = String(modelId || "").toLowerCase().split("/").pop();
  for (const [name, re] of NON_GENERATION_ENDPOINT_RULES) {
    if (re.test(basename)) return name;
  }
  return null;
}

export function isNonGenerationEndpoint(modelId) {
  return nonGenerationEndpointRule(modelId) !== null;
}

// The classification a real submit probe would eventually reach for one of
// these pages anyway (KIE would answer "model name not supported", exactly
// classifyProbeResponse's own NOT_CALLABLE case) — produced here in the
// IDENTICAL shape { verdict, callable, status, missingField, reason } so
// every consumer (kie-sync.js, scripts/fix-model-categories.mjs) builds the
// stored verification block through the same buildVerification (below) a
// real probe result would, never a parallel "not usable" representation.
export function classifyNonGenerationEndpoint(modelId) {
  const rule = nonGenerationEndpointRule(modelId);
  if (!rule) return null;
  return {
    verdict: VERDICT.NOT_CALLABLE,
    callable: false,
    status: 0,
    missingField: null,
    reason: `documentation endpoint, not a generation model (matched rule: "${rule}")`,
  };
}

// The ModelPricing.constraints.verification block a classification implies
// — the SAME shape scripts/verify-catalog.mjs's updateForVerdict already
// writes from a real probe's classifyProbeResponse output (status:
// "verified", verdict, callable, reason, providerStatus, checkedAt), so a
// row deactivated by a static id rule and a row deactivated by a live probe
// are indistinguishable to verificationAllowsActive and every reader of
// this column. `method` additionally records HOW the verdict was reached —
// "static-id-rule" here, so an operator looking at a deactivated row never
// mistakes a zero-cost pattern match for a probe that actually spent a
// provider request.
export function buildVerification(classification, { now = new Date(), method = "static-id-rule" } = {}) {
  if (!classification) return null;
  return {
    status: "verified",
    verdict: classification.verdict,
    callable: isCallableVerdict(classification.verdict),
    reason: classification.reason,
    providerStatus: classification.status,
    checkedAt: now.toISOString(),
    method,
  };
}
