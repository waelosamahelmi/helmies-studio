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
