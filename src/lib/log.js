// Helmies Studio — Structured logging (Phase 7 Task 1)
//
// log.info(event, fields) / log.warn(...) / log.error(...) each print ONE
// JSON line: { ts, level, event, ...redact(fields) }. `event` is a stable
// snake_case identifier for what happened (e.g. "generation_settled"), not a
// prose sentence — a human-readable detail belongs inside `fields`, not in
// `event` itself, so log lines stay grep/parse-friendly across call sites.
//
// redact() runs automatically inside every log call — callers never have to
// remember to sanitize anything themselves. It walks the ENTIRE fields tree
// (plain objects and arrays, to a bounded depth), not just the top level —
// a field buried inside a nested object or inside an array of objects is
// exactly as sensitive as one at the top, and an earlier version of this
// function only checked top-level keys:
//   - any KEY matching /key|secret|token|password|authorization/i, at any
//     depth, is dropped entirely (not even a placeholder value survives —
//     the field is simply absent from the line). Matching is
//     case-insensitive, so `Authorization`, `apiKey`, `API_KEY` etc. are all
//     caught.
//   - any KEY matching the prompt family (`prompt`, `promptText`,
//     `negative_prompt`, `negativePrompt`, ... — case-insensitively) is
//     replaced by `<key>Chars: N`, where N is the value's length if it's a
//     string, or the length of its JSON-stringified form otherwise (so a
//     non-string prompt-shaped value — an object, an array — never crashes
//     this function and never leaks its content, only a size). The prompt
//     text itself never reaches the log, per the contract's "never log
//     secrets, prompts, or media" rule.
//   - an `err` field (at any depth) holding a real Error instance is
//     reduced to `{ message }` when NODE_ENV === "production", or
//     `{ message, stack }` otherwise — a stack trace is genuinely useful
//     locally/in CI but must never land in a production log line. The
//     message text itself is additionally scrubbed for secret-SHAPED
//     substrings (a key/secret/token/password/authorization label
//     immediately followed by what looks like its value, or a bearer-token
//     shape) — an upstream error message is free text an attacker-controlled
//     or misconfigured dependency could embed a real credential into (e.g.
//     "invalid api key: sk-proj-abc123..."), so it gets the same treatment
//     as a structured field even though it isn't one. A non-Error `err`
//     value (already a plain string/object) passes through the normal
//     object/array walk like any other field.
//
// Deliberately dependency-free (no imports at all): this file is loaded two
// ways — bundled by Next/Vite via the "@/lib/log" alias, and directly under
// plain `node` (scripts/worker.mjs, and transitively src/lib/job-runner.js,
// src/lib/job-queue.js, src/lib/wallet.js, which already use relative
// ".js"-extended imports for exactly this reason — see wallet.js's header).
// Both a relative "./log.js" specifier and the "@/lib/log" alias resolve to
// this same file, and having no imports of its own means there is nothing
// here that could resolve differently between the two loaders.

const SENSITIVE_KEY_RE = /key|secret|token|password|authorization/i;
// ...except for a few field NAMES that contain "key" while never holding a
// credential. The substring match above is deliberately broad — it must catch
// apiKey, api_key, providerKey, x-api-key and anything else a call site
// invents — but broad matching also silently ate real diagnostics:
//
//   log.warn("alerts_webhook_not_configured", { count, keys: [...] })
//
// logged the COUNT of firing alerts and dropped WHICH ONES, so 2044 lines of
// "something is alerting" carried no way to tell what. The names below are
// plural or compound English words describing labels, not secrets:
//   keys       — a list of identifiers (alert keys, cache keys, map keys)
//   keywords   — search/SEO terms
//   keyframes  — animation timing points
// A singular "key" is NOT here and stays redacted: that is the name a bare
// credential actually travels under. Anything ending in -Key (apiKey,
// providerKey, idempotencyKey) is likewise untouched by this exemption.
const SENSITIVE_KEY_EXEMPT_RE = /^(keys|keywords|keyframes)$/i;
// Matches "prompt", "promptText", "negative_prompt", "negativePrompt",
// "negative-prompt", all case-insensitively — but NOT "promptChars" (the
// key this function itself produces), since only "text" or nothing may
// follow "prompt" here.
const PROMPT_KEY_RE = /^(negative[_-]?)?prompt(text)?$/i;
// A cap, not a tuning knob — bounds recursion against a pathological
// caller-supplied object without needing a real limit in practice; five
// levels comfortably covers every real call site in this codebase.
const MAX_REDACT_DEPTH = 5;

// Free-text scrub for err.message: unlike the structured key-based
// redaction above (which strips a field because of its KEY), an error
// message has no keys — this looks for a sensitive LABEL word immediately
// followed by a value that is actually secret-SHAPED (long, key-charset),
// so it doesn't mangle ordinary prose like "Authorization failed for user"
// (where the word after "Authorization" plainly isn't a secret).
const SECRET_LABEL_VALUE_RE = /\b(api[-_ ]?key|secret|token|password|authorization)\b(\s*[:=]?\s*)(\S+)/gi;
const BEARER_VALUE_RE = /\bBearer\s+(\S+)/gi;
const SECRET_VALUE_SHAPE_RE = /^[A-Za-z0-9_\-.]{12,}$/;

function looksLikeSecretValue(raw) {
  return SECRET_VALUE_SHAPE_RE.test(raw.replace(/[,.;)]+$/, ""));
}

function scrubSecretShapedText(str) {
  if (typeof str !== "string") return str;
  let out = str.replace(BEARER_VALUE_RE, (match, value) =>
    looksLikeSecretValue(value) ? "Bearer [redacted]" : match
  );
  out = out.replace(SECRET_LABEL_VALUE_RE, (match, label, sep, value) =>
    looksLikeSecretValue(value) ? `${label}${sep}[redacted]` : match
  );
  return out;
}

function serializeErr(err) {
  if (!(err instanceof Error)) return err;
  const production = process.env.NODE_ENV === "production";
  // The stack trace's own first line is "<Error name>: <message>" (V8's
  // default format) — scrubbing only `message` and leaving `stack` verbatim
  // would let the exact same secret-shaped text right back in through the
  // sibling field, so both go through the same scrub.
  return {
    message: scrubSecretShapedText(err.message),
    ...(production ? {} : { stack: scrubSecretShapedText(err.stack) }),
  };
}

// Length of a prompt-family value for the `<key>Chars` marker. Strings use
// their own length; anything else (object, array, number, null/undefined)
// is measured via its JSON-stringified form so this never throws and never
// reports the actual content, only a size.
function promptLength(v) {
  if (typeof v === "string") return v.length;
  if (v == null) return 0;
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

function redactValue(value, depth) {
  if (depth > MAX_REDACT_DEPTH) return "[max depth exceeded]";
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value && typeof value === "object" && !(value instanceof Error)) {
    return redactObject(value, depth + 1);
  }
  return value;
}

function redactObject(obj, depth) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k) && !SENSITIVE_KEY_EXEMPT_RE.test(k)) continue;
    if (PROMPT_KEY_RE.test(k)) {
      out[`${k}Chars`] = promptLength(v);
      continue;
    }
    if (k === "err") {
      out.err = serializeErr(v);
      continue;
    }
    out[k] = redactValue(v, depth);
  }
  return out;
}

// Exported so tests (and any call site that wants to pre-sanitize before
// composing fields further) can exercise the sanitization rules directly,
// independent of the console output plumbing in `write` below.
export function redact(fields) {
  if (!fields || typeof fields !== "object") return {};
  return redactObject(fields, 0);
}

function write(sink, level, event, fields) {
  const line = { ts: new Date().toISOString(), level, event, ...redact(fields) };
  sink(JSON.stringify(line));
}

export const log = {
  info(event, fields) {
    write((s) => console.log(s), "info", event, fields);
  },
  warn(event, fields) {
    write((s) => console.warn(s), "warn", event, fields);
  },
  error(event, fields) {
    write((s) => console.error(s), "error", event, fields);
  },
};

export default log;
