// Helmies Studio — Structured logging (Phase 7 Task 1)
//
// log.info(event, fields) / log.warn(...) / log.error(...) each print ONE
// JSON line: { ts, level, event, ...redact(fields) }. `event` is a stable
// snake_case identifier for what happened (e.g. "generation_settled"), not a
// prose sentence — a human-readable detail belongs inside `fields`, not in
// `event` itself, so log lines stay grep/parse-friendly across call sites.
//
// redact() runs automatically inside every log call — callers never have to
// remember to sanitize anything themselves:
//   - any field whose KEY matches /key|secret|token|password|authorization/i
//     is dropped entirely (not even a placeholder value survives — the
//     field is simply absent from the line).
//   - a `prompt` string field is replaced by `promptChars: N` (its length)
//     — the prompt text itself never reaches the log, per the contract's
//     "never log secrets, prompts, or media" rule.
//   - an `err` field holding a real Error instance is reduced to
//     `{ message }` when NODE_ENV === "production", or `{ message, stack }`
//     otherwise — a stack trace is genuinely useful locally/in CI but must
//     never land in a production log line. A non-Error `err` value (already
//     a plain string/object) passes through unchanged.
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

function serializeErr(err) {
  if (!(err instanceof Error)) return err;
  const production = process.env.NODE_ENV === "production";
  return { message: err.message, ...(production ? {} : { stack: err.stack }) };
}

// Exported so tests (and any call site that wants to pre-sanitize before
// composing fields further) can exercise the sanitization rules directly,
// independent of the console output plumbing in `write` below.
export function redact(fields) {
  if (!fields || typeof fields !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (k === "prompt" && typeof v === "string") {
      out.promptChars = v.length;
      continue;
    }
    if (k === "err") {
      out.err = serializeErr(v);
      continue;
    }
    out[k] = v;
  }
  return out;
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
