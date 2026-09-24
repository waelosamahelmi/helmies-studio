// Helmies Studio — how a completion actually leaves the building.
//
// There used to be five places that each built their own fetch against
// OpenRouter: llmComplete, llmStream, the agent chat route, and the two
// vision readers. Five copies of one URL meant the studio's entire text half
// — planner, scenario writer, script breakdown, photo reading, voice notes —
// hung off a single prepaid balance, and on 2026-09-20 that balance hit zero
// while KIE, which pays for every image and video, held ~9,900 credits.
//
// KIE serves LLMs too. Measured against the live API on 2026-09-21, because
// its docs and its behaviour disagree in ways that matter:
//
//   · THE MODEL IS IN THE PATH. POST /<slug>/v1/chat/completions, no `model`
//     field. The shared /api/v1/chat/completions answers "not supported".
//   · EVERY FAILURE IS HTTP 200. A bad key, an empty balance, a model in
//     maintenance — all arrive as 200 + application/json {code, msg}, even
//     when a stream was asked for. `res.ok` is therefore meaningless here: a
//     reply is only a completion if it has `choices`, and only a stream if
//     its content-type says text/event-stream.
//   · input_audio IS SILENTLY DROPPED. The model answers "No audio file was
//     provided". The same bytes as a data: URI inside an image_url part are
//     heard perfectly — KIE types ALL media as image_url. So parts are
//     translated per provider, not just the base URL swapped.
//   · max_tokens IS ACCEPTED AND IGNORED (asked 15, got 253, finish "stop").
//     A caller cannot cap a KIE reply, and `truncated` never fires on it.
//
// Worker-safe: relative imports only (see runnable-models.js's header).

import { DEFAULT_LLM, llmModel } from "./llm-models.mjs";

export const LLM_PROVIDERS = {
  kie: {
    getKey: () => process.env.KIE_KEY,
    url: (wireModel) => `https://api.kie.ai/${wireModel}/v1/chat/completions`,
    wireModel: (row) => row.kie || null,
    headers: (key) => ({ "Content-Type": "application/json", Authorization: `Bearer ${key}` }),
  },
  openrouter: {
    getKey: () => process.env.OPENROUTER_KEY,
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    wireModel: (row) => row.id,
    headers: (key) => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
      "X-Title": "Helmies Studio",
    }),
  },
};

const DEFAULT_ORDER = ["kie", "openrouter"];

/* KIE first: it is the balance that is already watched and topped up, and the
   measured price for the default model is lower there. LLM_PROVIDER_ORDER
   reorders or drops a provider without a deploy; unknown names are ignored
   rather than trusted. */
export function providerOrder() {
  const asked = String(process.env.LLM_PROVIDER_ORDER || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter((n) => LLM_PROVIDERS[n]);
  return asked.length ? [...new Set(asked)] : DEFAULT_ORDER;
}

/** True when at least one provider could take a completion. Replaces the six
    scattered `process.env.OPENROUTER_KEY` checks that each decided, alone,
    whether the studio "has an LLM". */
export function hasLlm() {
  return providerOrder().some((name) => Boolean(LLM_PROVIDERS[name].getKey()));
}

/* A provider that just said "no key / no money" will say it again for the next
   few minutes. Without this, every completion pays a wasted round-trip to the
   empty wallet before reaching the full one. Process-local on purpose: it is
   an optimisation, never the reason a provider is skipped for good. */
const BENCH_MS = 5 * 60 * 1000;
const benched = new Map();
const isBenched = (name) => (benched.get(name) || 0) > Date.now();
export function resetLlmBench() { benched.clear(); }

/**
 * Every (provider, wire model) pair worth trying, in order.
 *
 * The requested model's own routes come first. If none of them can carry the
 * call, the DEFAULT model's routes follow — a different model, which is why
 * the result reports `model` so a caller can say so. `needs` keeps that
 * fallback honest: a call carrying audio is never handed to a model that
 * cannot hear, because that failure is a confident wrong answer, not an error.
 */
export function llmAttempts(modelId, { needs = [] } = {}) {
  const order = providerOrder();
  const attempts = [];
  const seen = new Set();
  const covers = (row) => needs.every((n) => n === "text" || row.modalities.includes(n));
  for (const row of [llmModel(modelId), llmModel(DEFAULT_LLM)]) {
    if (!row || !covers(row)) continue;
    for (const name of order) {
      // No key is not a failed route, it is not a route: skipping it here keeps
      // "provider X failed" in the log meaning that provider X was asked.
      if (!LLM_PROVIDERS[name].getKey()) continue;
      const wireModel = LLM_PROVIDERS[name].wireModel(row);
      const tag = `${name}:${wireModel}`;
      if (!wireModel || seen.has(tag)) continue;
      seen.add(tag);
      attempts.push({ provider: name, wireModel, model: row.id });
    }
  }
  // Benched providers go last rather than away: if everything else fails they
  // are still worth one try — the bench is a guess about the next few minutes.
  return [...attempts.filter((a) => !isBenched(a.provider)), ...attempts.filter((a) => isBenched(a.provider))];
}

/* KIE types every media part as image_url and takes inline bytes as a data:
   URI. OpenAI-shaped input_audio / video_url / file parts are what the rest of
   the app builds (agent-multimodal.mjs), so they are rewritten here — at the
   one boundary that knows which provider is on the other end. */
const AUDIO_MIME = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", flac: "audio/flac", aac: "audio/aac" };

export function toKieMessages(messages = []) {
  return messages.map((m) => {
    if (!Array.isArray(m?.content)) return m;
    const content = m.content.map((part) => {
      if (part?.type === "input_audio" && part.input_audio?.data) {
        const mime = AUDIO_MIME[String(part.input_audio.format || "wav").toLowerCase()] || "audio/wav";
        return { type: "image_url", image_url: { url: `data:${mime};base64,${part.input_audio.data}` } };
      }
      if (part?.type === "video_url" && part.video_url?.url) {
        return { type: "image_url", image_url: { url: part.video_url.url } };
      }
      if (part?.type === "file" && (part.file?.file_data || part.file?.url)) {
        return { type: "image_url", image_url: { url: part.file.file_data || part.file.url } };
      }
      return part;
    });
    return { ...m, content };
  });
}

function buildBody(provider, wireModel, messages, options, stream) {
  const body = {
    messages: provider === "kie" ? toKieMessages(messages) : messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
    stream,
  };
  if (provider !== "kie") body.model = wireModel;
  if (options.responseFormat) body.response_format = options.responseFormat;
  return body;
}

function failure(attempt, status, raw) {
  const err = new Error(String(raw || `LLM provider responded ${status}`).slice(0, 2000));
  err.provider = attempt.provider;
  err.model = attempt.model;
  err.status = status;
  err.raw = String(raw ?? "");
  return err;
}

async function attemptOnce(attempt, messages, options, stream) {
  const p = LLM_PROVIDERS[attempt.provider];
  const key = p.getKey();

  const res = await fetch(p.url(attempt.wireModel), {
    method: "POST",
    headers: p.headers(key),
    body: JSON.stringify(buildBody(attempt.provider, attempt.wireModel, messages, options, stream)),
    signal: options.signal || AbortSignal.timeout(options.timeout || 60000),
  });

  if (!res.ok) throw failure(attempt, res.status, await res.text().catch(() => ""));

  if (stream) {
    // A refusal to a streaming call still comes back as JSON, with a 200.
    const type = String(res.headers?.get?.("content-type") || "");
    if (type.includes("application/json")) {
      const raw = await res.text().catch(() => "");
      let code = 502;
      try { code = Number(JSON.parse(raw).code) || 502; } catch { /* keep 502 */ }
      throw failure(attempt, code, raw);
    }
    return { body: res.body };
  }

  const data = await res.json();
  if (!Array.isArray(data?.choices)) {
    throw failure(attempt, Number(data?.code) || 502, JSON.stringify(data));
  }
  return { data };
}

/**
 * Send one completion, trying each route until one carries it.
 *
 * Resolves to `{ data | body, provider, model, substituted }` — `data` is an
 * OpenAI-shaped completion (non-stream), `body` an OpenAI-shaped SSE stream.
 * Rejects with the LAST failure, carrying `.provider`, `.status`, `.raw`, and
 * `.attempts` (every failure, for the log). `onFailure` is told about each
 * failed route so the caller's logger records the real upstream text once.
 */
export async function llmSend(messages, options = {}) {
  const stream = Boolean(options.stream);
  const requested = options.model || DEFAULT_LLM;
  const attempts = llmAttempts(requested, { needs: options.needs || [] });
  const failures = [];

  for (const attempt of attempts) {
    try {
      const out = await attemptOnce(attempt, messages, options, stream);
      return {
        ...out,
        provider: attempt.provider,
        model: attempt.model,
        substituted: attempt.model !== requested ? requested : null,
      };
    } catch (e) {
      const err = e?.provider ? e : failure(attempt, 0, e?.message || String(e));
      if (err.status === 401 || err.status === 402) benched.set(attempt.provider, Date.now() + BENCH_MS);
      failures.push(err);
      try { options.onFailure?.(err); } catch { /* a logger must never take a completion down */ }
      // The caller hung up; trying the next provider would answer nobody.
      if (options.signal?.aborted) break;
    }
  }

  const last = failures[failures.length - 1] || failure({ provider: "none", model: requested }, 503, "No LLM provider is configured");
  last.attempts = failures;
  throw last;
}
