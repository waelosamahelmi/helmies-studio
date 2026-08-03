import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { log } from "@/lib/log";

// Helmies Studio — uniform API error envelope (EDITSv1 §10, Task E2.1).
//
// Every error response from a converted route goes through apiError() and
// has the shape:
//
//   { error, code, title, errorId, retryable, details, ...extra }
//
// with the HTTP status carried on the response, where:
//   - `error`   is a STRING — the user-facing message. This key predates the
//     envelope and stays a string forever: src/lib/client-fetch.js builds
//     ApiError(data?.error || ...) from it, and every existing consumer
//     renders it directly.
//   - `code`    is one of ERROR_CODES below — a stable machine-readable
//     identifier, never free text.
//   - `title`   is a short human heading for the client's ErrorPanel.
//   - `errorId` is an 8-char id echoed in the server-side log line so a
//     support request ("it failed with ID ab12cd34") can be matched to the
//     full cause without ever sending that cause to the client.
//   - `retryable` hints whether an immediate retry can plausibly succeed.
//   - `details` is an optional array of field-level validation strings
//     (422s keep their details).
//   - `extra` fields (retryAfter, credits, cost, model, ...) are ADDITIVE —
//     each route keeps whatever extra keys its clients already read.
//
// The `cause` (the real Error) is logged via log.error(code, { errorId,
// err }) — src/lib/log.js redacts secrets/prompts automatically — and is
// NEVER serialized into the response body.
//
// Providers (KIE/Alibaba/DashScope/...) must never appear in any default
// title or message here — locked in by tests/unit/api-error.test.mjs.

export const ERROR_CODES = {
  bad_request: {
    status: 400,
    title: "Check the request",
    message: "Something about this request wasn't right. Adjust it and try again.",
  },
  unauthorized: {
    status: 401,
    title: "Sign in required",
    message: "Please sign in to continue.",
  },
  forbidden: {
    status: 403,
    title: "Not allowed",
    message: "You don't have access to this.",
  },
  not_found: {
    status: 404,
    title: "Not found",
    message: "We couldn't find what you were looking for.",
  },
  rate_limited: {
    status: 429,
    title: "Slow down a moment",
    message: "Too many requests. Please wait a moment and try again.",
    retryable: true,
  },
  invalid_model: {
    status: 422,
    title: "Model unavailable",
    message: "This model is temporarily unavailable. Please pick another.",
  },
  model_not_priced: {
    status: 422,
    title: "Model unavailable",
    message: "This model isn't available right now. Please pick another model.",
  },
  invalid_params: {
    status: 422,
    title: "Check your settings",
    message: "Some settings aren't valid for this model. Adjust them and try again.",
  },
  missing_provider_key: {
    status: 502,
    title: "Service unavailable",
    message: "Provider authentication failed. Our team has been notified.",
  },
  insufficient_credits: {
    status: 402,
    title: "Not enough credits",
    message: "This generation needs {cost} credits but you have {credits}.",
    fallback: "You don't have enough credits for this generation.",
  },
  unsupported_setting: {
    status: 422,
    title: "Not supported",
    message: "That option isn't supported here.",
  },
  content_policy: {
    status: 422,
    title: "Blocked by safety filters",
    message: "The request was blocked by safety filters. Adjust the prompt and try again.",
  },
  provider_timeout: {
    status: 504,
    title: "Taking too long",
    message: "The request took too long. Please try again.",
    retryable: true,
  },
  internal: {
    status: 500,
    title: "Something went wrong",
    message: "Something went wrong on our end. Please try again.",
    retryable: true,
  },
};

// 8 chars of a UUID — matches the pre-existing DirectorPlanError id shape
// (src/lib/director-planner.js), which this generalizes.
export function newErrorId() {
  return randomUUID().slice(0, 8);
}

// Replace {token} placeholders from `vars`. If the TABLE default still has
// unresolved placeholders afterwards (the route didn't pass the numbers),
// fall back to the code's placeholder-free fallback rather than showing raw
// braces to a user.
function interpolate(message, vars, fallback) {
  const out = message.replace(/\{(\w+)\}/g, (m, key) =>
    vars && vars[key] != null ? String(vars[key]) : m,
  );
  if (/\{\w+\}/.test(out)) return fallback ?? out.replace(/\{(\w+)\}/g, "$1");
  return out;
}

export function apiError({
  status,
  code = "internal",
  title,
  message,
  retryable,
  details = null,
  cause = null,
  errorId = newErrorId(),
  extra = {},
  context = {},
} = {}) {
  const def = ERROR_CODES[code] || ERROR_CODES.internal;
  const resolvedStatus = status ?? def.status;
  const resolvedTitle = title ?? def.title;
  const resolvedMessage =
    message != null ? message : interpolate(def.message, extra, def.fallback);
  const resolvedRetryable = retryable ?? def.retryable ?? false;

  if (cause != null) {
    log.error(code, { errorId, status: resolvedStatus, ...context, err: cause });
  }

  return NextResponse.json(
    {
      ...extra,
      error: resolvedMessage,
      code,
      title: resolvedTitle,
      errorId,
      retryable: resolvedRetryable,
      details,
    },
    { status: resolvedStatus },
  );
}

export default apiError;
