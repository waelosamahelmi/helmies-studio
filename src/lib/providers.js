// Relative, ".js"-extended imports (not the "@/lib/..." alias used
// elsewhere in this file's exports' consumers): this module is also loaded
// transitively by scripts/worker.mjs under plain `node` (Phase 4A Task 4,
// via src/lib/job-runner.js). The "@/" alias is a Next/Vite bundler feature
// only — plain Node has no notion of it at all (not even an extension
// problem; the specifier is simply unresolvable), so both imports below
// were changed from the alias form to resolve identically in both contexts.
import prisma from "./prisma.js";
import { formatAlibabaPayload, getAlibabaApiPath } from "./alibaba-provider-core.mjs";
import { resolveModelPricingRow } from "./model-catalog-core.mjs";
import { log } from "./log.js";

const BRANDED_ERRORS = {
  rate_limit: "Too many requests. Please wait a moment and try again.",
  invalid_api_key: "Provider authentication failed. Our team has been notified.",
  model_not_found: "This model is temporarily unavailable. Please try another.",
  timeout: "The request took too long. Please try again.",
  content_filter: "The request was blocked by safety filters.",
  insufficient_balance: "Provider balance is low. Please contact support.",
  server_error: "Something went wrong on our end. Please try again.",
  unknown: "An unexpected error occurred. Please try again.",
};

export function brandError(providerError) {
  const lower = (providerError || "").toLowerCase();
  if (lower.includes("rate") || lower.includes("429")) return BRANDED_ERRORS.rate_limit;
  if (lower.includes("api key") || lower.includes("api_key") || lower.includes("apikey") || lower.includes("unauthorized") || lower.includes("401")) return BRANDED_ERRORS.invalid_api_key;
  if (lower.includes("not found") || lower.includes("404")) return BRANDED_ERRORS.model_not_found;
  if (lower.includes("timeout") || lower.includes("timed out")) return BRANDED_ERRORS.timeout;
  if (lower.includes("content") || lower.includes("filter") || lower.includes("safety")) return BRANDED_ERRORS.content_filter;
  if (lower.includes("balance") || lower.includes("credit") || lower.includes("insufficient")) return BRANDED_ERRORS.insufficient_balance;
  if (lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("server")) return BRANDED_ERRORS.server_error;
  return BRANDED_ERRORS.unknown;
}

// Idempotent user-facing branding: a message that is already one of the
// branded strings passes through unchanged (re-running brandError on it
// would downgrade it to "unknown").
const BRANDED_VALUES = new Set(Object.values(BRANDED_ERRORS));
export function brandForUser(message) {
  const msg = message || "";
  if (BRANDED_VALUES.has(msg)) return msg;
  return brandError(msg);
}

// ── URGENT production fix: never discard a provider/LLM error again ───────
// Every `throw new Error(brandError(txt))` site below used to hand the raw
// provider/LLM response straight to brandError and then let `txt` fall out
// of scope forever — nothing ever logged it. In production, src/lib/log.js
// also strips stacks, so the combination made the real cause of a failure
// unrecoverable from the server logs (this file's own header incident: a
// database-forensics session was the only way to find out flux-dev was
// dead, because the actual KIE/Alibaba error text was never written down
// anywhere). Every such site now calls logRawProviderError(...) first —
// provider/adapter name, endpoint/model, HTTP status, and the raw body
// (truncated) via the structured logger, which already redacts secrets —
// then throws via brandedError(...) below instead of `new Error(brandError(...))`
// directly.
//
// brandedError keeps the SAME user-facing contract every existing caller
// already relies on (`.message` is the branded string — brandForUser/
// brandError re-derive from it, generateHandler.js and agents.js both
// propagate `.message` straight to the client), but attaches the raw
// reason as the error's native (ES2022) `.cause` — including a stack in
// non-production — so anything that later logs this error's cause (e.g.
// apiError's own `log.error(code, { errorId, err: cause })`) has more than
// the generic branded string to trace an errorId back to a real reason.
function brandedError(rawReason) {
  const reasonText = String(rawReason ?? "").slice(0, 2000);
  const cause = { message: reasonText };
  if (process.env.NODE_ENV !== "production") cause.stack = new Error(reasonText).stack;
  return new Error(brandError(rawReason), { cause });
}

// Logs the RAW (unbranded) provider/LLM failure once, server-side only —
// see brandedError's header above for why this exists. `body` is truncated
// to 2000 chars (a raw HTML error page or a huge JSON blob is still useful
// as a prefix; logging it unbounded is not worth the log-volume risk).
// Never throws itself — a logging failure must never mask the real error.
function logRawProviderError(event, fields) {
  try {
    const { body, ...rest } = fields || {};
    log.error(event, { ...rest, body: body != null ? String(body).slice(0, 2000) : undefined });
  } catch { /* logging must never mask the real error */ }
}

export async function logProviderError(provider, endpoint, originalError, userId) {
  console.error(`[Provider:${provider}] ${endpoint}:`, originalError);
  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "provider_error",
        resource: provider,
        resourceId: endpoint,
        metadata: { error: (originalError || "").slice(0, 500) },
      },
    }).catch(() => {});
  }
}

export const PROVIDERS = {
  kie: {
    name: "KIE",
    type: "llm+generation",
    baseUrl: "https://api.kie.ai",
    getKey: () => process.env.KIE_KEY,
    buildUrl: () => "/api/v1/jobs/createTask",
    formatPayload: (model, prompt, params) => {
      const { endpoint: _ep, ...rest } = params;
      return {
        model,
        input: { prompt, ...rest },
        callBackUrl: params.callBackUrl || params.webhook_url || `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`,
      };
    },
    parseResult: (data) => ({
      requestId: data.taskId || data.data?.taskId || data.request_id || data.data?.request_id,
      status: data.state || data.data?.state || data.status,
      outputs: [],
    }),
    buildPollUrl: (requestId) => `/api/v1/jobs/recordInfo?taskId=${requestId}`,
    parsePoll: (data) => {
      let outputs = [];
      if (data.resultJson) {
        try {
          const r = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
          outputs = r.resultUrls || r.result_urls || [];
        } catch {}
      }
      return { status: (data.state || "").toLowerCase(), outputs, error: data.failMsg || data.error };
    },
    isSync: false,
    apiVersion: 1,
  },
  alibaba: {
    name: "Alibaba",
    type: "image+video",
    get baseUrl() {
      const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
      return workspaceId
        ? `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com`
        : "https://dashscope.aliyuncs.com";
    },
    getKey: () => process.env.ALIBABA_KEY,
    headers: { "X-DashScope-Async": "enable" },
    buildUrl: getAlibabaApiPath,
    formatPayload: formatAlibabaPayload,
    parseResult: (data) => {
      // Image generations return synchronously as an array of { url }
      if (Array.isArray(data)) {
        return { requestId: null, status: "succeeded", outputs: data.map((d) => d?.url).filter(Boolean) };
      }
      return {
        requestId: data.output?.task_id || data.task_id || data.id,
        status: data.output?.task_status || data.status,
        outputs: data.output?.results ? data.output.results.map(r => r.url || r.b64_image).filter(Boolean) : (data.output ? [data.output.video_url || data.output.url].filter(Boolean) : []),
      };
    },
    buildPollUrl: (requestId) => `/api/v1/tasks/${requestId}`,
    parsePoll: (data) => ({
      status: (data.output?.task_status || data.status || "").toLowerCase(),
      outputs: data.output?.results ? data.output.results.map(r => r.url || r.b64_image).filter(Boolean) : (data.output ? [data.output.video_url || data.output.url].filter(Boolean) : []),
      error: data.output?.message || data.error,
    }),
    isSync: false,
    apiVersion: 1,
  },
};

const LLM_PROVIDER = {
  baseUrl: "https://openrouter.ai/api/v1",
  getKey: () => process.env.OPENROUTER_KEY,
  defaultModel: "deepseek/deepseek-v4-flash",
  models: {
    "gemini-2.5-flash": "deepseek/deepseek-v4-flash",
    "gemini-2.5-flash-openai": "deepseek/deepseek-v4-flash",
    "gemini-2.5-pro": "deepseek/deepseek-v4-flash",
    "google/gemini-2.5-flash-openai": "deepseek/deepseek-v4-flash",
    "google/gemini-3.6-flash": "deepseek/deepseek-v4-flash",
  },
};

export const DEFAULT_PROVIDER = "kie";

// Map any providerName (DB ModelPricing.providerName, ProviderConfig.name) to an adapter key.
// Unknown names resolve to KIE (the primary provider) — never to a removed provider.
//
// Exported (Phase 4A Task 8) so callers that need the pure, correctly-
// normalized lowercase adapter key can get it directly without going
// through resolveProvider() below, or without needing a ModelPricing
// lookup's other fields at all (e.g. scripts/adopt-legacy-generations.mjs).
//
// resolveProvider's two return statements previously read
// `{ name, ...p, apiKey: p.getKey() }`: `p` (PROVIDERS[key]) carries its own
// display-name `name` field (e.g. "Alibaba", "KIE"), and object-spread order
// meant `...p` was applied AFTER the `name` shorthand, so `p.name` silently
// overwrote the normalized key computed just above it —
// `resolveProvider(modelId).name` came back as the mixed-case display name,
// never the lowercase adapter key getProvider() indexes PROVIDERS by, which
// in turn dropped the real primary from resolveProviderWithFallback's chain
// (`PROVIDERS[primary.name]` missed the index and `.filter(Boolean)` threw
// it away). Fixed by putting `name` AFTER the spread in both resolveProvider
// return statements and in resolveProviderWithFallback's own `.map()` below,
// so the adapter key always wins. resolveAdapterKey itself never had this
// bug and remains safe — and cheaper for callers that only need the key —
// to call directly.
export function resolveAdapterKey(providerName) {
  const n = (providerName || "").toLowerCase();
  if (n.includes("alibaba") || n.includes("qwen") || n.includes("dashscope")) return "alibaba";
  if (n.includes("kie")) return "kie";
  return "kie";
}

export function getProvider(name) {
  return PROVIDERS[name] || PROVIDERS[DEFAULT_PROVIDER];
}

export function getActiveProviders() {
  return Object.entries(PROVIDERS).filter(([_, p]) => {
    try { return !!p.getKey(); } catch { return false; }
  });
}

export async function resolveProvider(modelId) {
  try {
    // resolveModelPricingRow tolerates the "public" (provider-prefix-
    // stripped) id the catalog now hands out publicly — see its header
    // comment in model-catalog-core.mjs — falling straight through to an
    // exact match (this exact query, unchanged) for every already-real id.
    const pricing = await resolveModelPricingRow(prisma, modelId);
    if (pricing?.providerName) {
      const name = resolveAdapterKey(pricing.providerName);
      const p = PROVIDERS[name];
      return { ...p, name, apiKey: p.getKey() };
    }
  } catch {}
  const p = PROVIDERS[DEFAULT_PROVIDER];
  return { ...p, name: DEFAULT_PROVIDER, apiKey: p.getKey() };
}

// ── E2E provider short-circuit (Phase 5 Task 2) ────────────────────────────
// Set ONLY by playwright.config.mjs's "worker" webServer entry — undefined
// in every real deployment (dev, prod, unit/integration tests). This exists
// because tests/e2e/fixtures/intercept.mjs's page.route() stubs can only
// ever see requests the BROWSER makes; the actual KIE call for an async
// generation happens server-side, inside the durable job runner
// (src/lib/job-runner.js), which only runs under the separate
// scripts/worker.mjs process the E2E harness starts alongside `next start`
// — a process page.route has no way to reach (see intercept.mjs's header
// for the full explanation, written when Task 1 first identified this gap).
// A prompt containing E2E_FORCE_FAIL_MARKER simulates a real, non-retryable
// provider failure end-to-end (used by the "generation failure refunds"
// journey); every other prompt "succeeds" against a real 1x1 PNG written
// once to public/media, so the UI gets back a genuinely servable image —
// not a fabricated URL — and job-runner's ingestFirstOutput never makes a
// network call at all (the "/api/media/local/" prefix is its own existing
// already-ingested short-circuit, not new here).
//
// SAFETY: this is in the money path (it stands in for a real provider call
// that would otherwise cost real credits/dollars), so activating it
// requires BOTH the env var AND DATABASE_URL's HOSTNAME being exactly
// "localhost" or "127.0.0.1" — a deliberate second lock. E2E_MOCK_PROVIDERS
// alone is a single string comparison a stray/misconfigured env var could
// flip in a real deployment; requiring a local hostname too means a
// production database (whose hostname is never localhost) can NEVER take
// this branch no matter how E2E_MOCK_PROVIDERS ends up set, so a real
// generation can never be silently answered with the fixture image instead
// of an actual provider call. The check below parses DATABASE_URL with the
// URL API and compares `.hostname` exactly — it is NOT a substring/regex
// test over the whole connection string, because that previously let a
// remote host whose credentials merely CONTAINED the word "localhost" (e.g.
// a password like "localhost123") activate the mock; an unparseable URL is
// treated as NOT local (fails closed). Same pattern as tests/e2e/fixtures/
// seed.mjs and db.mjs's own local-only guards. tests/unit/
// providers-e2e-mock.test.mjs asserts this lock holds — E2E_MOCK_PROVIDERS=1
// against a non-local DATABASE_URL (including one whose credentials contain
// the literal string "localhost") must still take the real (and here,
// correctly-erroring-on-a-missing-key) path.
function isLocalDatabaseUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const E2E_MOCK_PROVIDERS =
  process.env.E2E_MOCK_PROVIDERS === "1" &&
  isLocalDatabaseUrl(process.env.DATABASE_URL || "");
export const E2E_FORCE_FAIL_MARKER = "__E2E_FORCE_FAIL__";

const E2E_FIXTURE_KEY = "e2e-fixture.png";
// 1x1 transparent PNG — smallest valid image a browser <img> can render.
const E2E_FIXTURE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

let e2eFixtureReady = null;
function ensureE2EFixture() {
  if (!e2eFixtureReady) {
    e2eFixtureReady = (async () => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dir = join(process.cwd(), "public", "media");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, E2E_FIXTURE_KEY), Buffer.from(E2E_FIXTURE_PNG_BASE64, "base64"));
    })();
  }
  return e2eFixtureReady;
}

async function submitOnlyMock(provider, payload) {
  const prompt = payload?.prompt;
  if (typeof prompt === "string" && prompt.includes(E2E_FORCE_FAIL_MARKER)) {
    // Not retryable — job-runner.js's isRetryableError only matches 5xx/
    // timeout/network/rate-limit wording, none of which this is, so the job
    // goes straight to `dead` and refunds on the first attempt instead of
    // eating a 30s+ backoff.
    throw new Error("E2E forced provider failure");
  }
  await ensureE2EFixture();
  return {
    provider,
    requestId: null,
    submitData: { e2eMock: true },
    immediateResult: { outputs: [`/api/media/local/${E2E_FIXTURE_KEY}`] },
  };
}

export async function submitOnly(providerName, endpoint, payload) {
  let provider;
  if (typeof providerName === "object" && providerName.name) {
    provider = providerName;
  } else {
    provider = getProvider(providerName);
  }

  if (E2E_MOCK_PROVIDERS) {
    return submitOnlyMock(provider, payload);
  }

  const key = provider.apiKey || provider.getKey();
  if (!key) throw new Error(brandError("invalid_api_key"));

  const { model, prompt, ...params } = payload;
  const apiPath = provider.buildUrl(endpoint);
  const url = `${provider.baseUrl}${apiPath}`;
  const body = provider.formatPayload(model || endpoint, prompt, params);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...(provider.headers || {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const txt = await res.text();
    logRawProviderError("provider_submit_http_error", { provider: provider?.name, endpoint, model: model || endpoint, status: res.status, body: txt });
    throw brandedError(txt);
  }

  const result = await res.json();
  const responseData = result.data || result;
  const parsed = provider.parseResult ? provider.parseResult(responseData) : { requestId: responseData.request_id || responseData.id, outputs: responseData.outputs || [] };
  const requestId = parsed.requestId;

  if (!requestId) {
    if (parsed.outputs && parsed.outputs.length > 0) {
      return { provider, requestId: null, submitData: result, immediateResult: { ...responseData, outputs: parsed.outputs } };
    }
    if (responseData.outputs && responseData.outputs.length > 0) {
      return { provider, requestId: null, submitData: result, immediateResult: responseData };
    }
    const reason = result.message || result.msg || responseData.error || "No task ID returned";
    logRawProviderError("provider_submit_no_request_id", { provider: provider?.name, endpoint, model: model || endpoint, body: JSON.stringify(result) });
    throw brandedError(reason);
  }

  return { provider, requestId, submitData: result };
}

function defaultParsePoll(data) {
  const outputs = data.outputs || (data.output ? [data.output.video_url || data.output.url].filter(Boolean) : []);
  return { status: (data.status || data.state || "").toLowerCase(), outputs, error: data.error || data.message };
}

export async function pollProviderResult(provider, requestId, maxAttempts = 900, interval = 2000) {
  const key = provider.apiKey || provider.getKey();

  let pollInterval = interval;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const pollPath = provider.buildPollUrl
        ? provider.buildPollUrl(requestId)
        : `/api/v1/jobs/recordInfo?taskId=${requestId}`;
      const pollRes = await fetch(`${provider.baseUrl}${pollPath}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!pollRes.ok) {
        if (pollRes.status >= 500) continue;
        const txt = await pollRes.text();
        logRawProviderError("provider_poll_http_error", { provider: provider?.name, requestId, status: pollRes.status, attempt, body: txt });
        throw brandedError(txt);
      }
      const body = await pollRes.json();
      const data = body.data || body;
      const parsed = provider.parsePoll ? provider.parsePoll(data) : defaultParsePoll(data);
      const status = (parsed.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") {
        const outputs = parsed.outputs || [];
        return { ...data, outputs, url: outputs[0], outputUrl: outputs[0] };
      }
      if (status === "failed" || status === "error" || status === "fail") {
        logRawProviderError("provider_terminal_failure", { provider: provider?.name, requestId, attempt, body: JSON.stringify(data) });
        const terminalError = brandedError(parsed.error || "");
        terminalError.terminal = true;
        throw terminalError;
      }
      // pending/waiting/generating/processing — keep polling with gentle backoff
      pollInterval = Math.min(10000, pollInterval + 1000);
    } catch (e) {
      // A provider-reported terminal failure will never resolve on a later
      // attempt — retrying it just pins a worker slot (heartbeat keeps the
      // lease alive) for up to maxAttempts * backoff. Fail fast instead.
      if (e?.terminal) throw e;
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error(BRANDED_ERRORS.timeout);
}

export async function submitAndPoll(providerName, endpoint, payload, maxAttempts = 900, interval = 2000) {
  const { provider, requestId, submitData, immediateResult } = await submitOnly(providerName, endpoint, payload);

  if (immediateResult) {
    const outputs = immediateResult.outputs || immediateResult.output || [];
    return { ...immediateResult, outputs, url: outputs[0], outputUrl: outputs[0] };
  }

  if (!requestId) return submitData;

  return pollProviderResult(provider, requestId, maxAttempts, interval);
}

export async function llmComplete(messages, options = {}) {
  const p = LLM_PROVIDER;
  const key = p.getKey();
  if (!key) throw new Error("OPENROUTER_KEY not configured");
  const modelId = p.models[options.model] || p.defaultModel;

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
      "X-Title": "Helmies Studio",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: false,
    }),
    signal: AbortSignal.timeout(options.timeout || 60000),
  });

  if (!res.ok) {
    const txt = await res.text();
    logRawProviderError("llm_complete_http_error", { provider: "openrouter", model: modelId, status: res.status, body: txt });
    throw brandedError(txt);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function llmStream(messages, options = {}) {
  const p = LLM_PROVIDER;
  const key = p.getKey();
  if (!key) throw new Error("OPENROUTER_KEY not configured");
  const modelId = p.models[options.model] || p.defaultModel;

  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
      "X-Title": "Helmies Studio",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: true,
    }),
    signal: AbortSignal.timeout(options.timeout || 60000),
  });

  if (!res.ok) {
    const txt = await res.text();
    logRawProviderError("llm_stream_http_error", { provider: "openrouter", model: modelId, status: res.status, body: txt });
    throw brandedError(txt);
  }

  return res.body;
}

// Media provider fallback order: KIE primary, Alibaba secondary.
const FALLBACK_CHAIN = ["kie", "alibaba"];

// Maps a ProviderConfig.name to the canonical adapter key it represents, or
// null if it isn't a known media adapter (e.g. "OpenRouter"). Case-
// insensitive substring match — production rows are seeded with display
// casing ("KIE", "Alibaba" — scripts/seed-providers.mjs), never the
// lowercase adapter key, so both getProviderActivity below AND
// src/lib/ops-flags.js's setProviderDisabled classify a row through this
// SAME function. That sharing is load-bearing: a lookup and a write must
// never disagree on which row "is" kie/alibaba, or setProviderDisabled
// could create a second row instead of updating the existing production one.
export function classifyProviderConfigName(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("alibaba") || n.includes("qwen") || n.includes("dashscope")) return "alibaba";
  if (n.includes("kie")) return "kie";
  return null;
}

// Reads ProviderConfig activity for media adapters only.
// Returns null when no config rows exist (env-only mode → all providers eligible).
// Exported (Phase 7 Task 3) so src/lib/ops-flags.js's isProviderDisabled can
// read back the EXACT SAME activity computation setProviderDisabled writes
// into — the kill switch reuses this path rather than adding a second one.
//
// Deterministic under duplicate/conflicting rows for the same provider
// (which should never exist going forward — setProviderDisabled matches and
// updates existing rows rather than blind-upserting on the lowercase key —
// but this is the read-side defense in depth for any duplicate that
// predates that fix, or that some other code path creates): a provider is
// "active" only when EVERY row that classifies to it says so. Any single
// row with isActive:false wins, regardless of `rows` iteration order —
// Postgres does not guarantee scan order without an explicit ORDER BY, and
// an unrelated UPDATE to a row can change that order (MVCC creates a new
// tuple version), so "last row in the loop wins" was never safe.
export async function getProviderActivity() {
  try {
    const rows = await prisma.providerConfig.findMany({ select: { name: true, isActive: true } });
    if (!rows.length) return null;
    const activity = {};
    for (const row of rows) {
      const key = classifyProviderConfigName(row.name);
      if (!key) continue; // unrelated config (e.g. OpenRouter) — not part of the media fallback chain
      if (row.isActive === false) activity[key] = false;
      else if (activity[key] !== false) activity[key] = true;
    }
    return activity;
  } catch {
    return null;
  }
}

export async function resolveProviderWithFallback(modelId) {
  const primary = await resolveProvider(modelId);
  const activity = await getProviderActivity();
  const catalogModel = await resolveModelPricingRow(prisma, modelId, { managedBySync: true }).catch(() => null);
  // Provider-native catalog endpoints are not portable across KIE and DashScope.
  // Keep legacy fallback behavior only for old provider-agnostic rows.
  const chain = catalogModel?.managedBySync ? [primary.name] : [primary.name, ...FALLBACK_CHAIN.filter((n) => n !== primary.name)];
  const resolved = chain
    .filter((name) => !activity || activity[name] !== false)
    .map((name) => {
      const p = PROVIDERS[name];
      return p ? { ...p, name, apiKey: p.getKey() } : null;
    })
    .filter(Boolean);

  // Phase 7 Task 3 — provider kill switch: this can ONLY be empty because
  // of the activity filter above (resolveProvider always returns a real,
  // directly-indexable PROVIDERS entry, so `chain` itself is never
  // structurally empty) — i.e. every provider capable of serving this
  // model has been disabled via src/lib/ops-flags.js's setProviderDisabled.
  // Fail fast with a clear message instead of letting a caller hang, or
  // silently proceed with an empty chain that was never going to submit
  // anything.
  if (resolved.length === 0) {
    throw new Error(
      `All providers for model "${modelId}" are currently disabled by an operator. Please try again once one is re-enabled.`
    );
  }

  return resolved;
}
