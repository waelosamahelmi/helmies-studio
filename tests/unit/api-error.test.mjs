import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase E2 Task E2.1 — uniform API error envelope.
//
// apiError({ status, code, title, message, retryable, details, cause }) →
// NextResponse.json({ error, code, title, errorId, retryable, details, ...extra })
// with the HTTP status preserved. `error` STAYS A STRING (apiFetch's
// `data?.error || ...` contract in src/lib/client-fetch.js depends on it).
// The full `cause` is logged server-side via log.error(code, { errorId, err })
// and must NEVER appear in the response body.

vi.mock("@/lib/log", () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { log } from "@/lib/log";
import { apiError, ERROR_CODES, newErrorId } from "@/lib/api-error";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ERROR_CODES — canonical table", () => {
  it("contains every canonical code with a default title and message", () => {
    const canonical = [
      "bad_request", "unauthorized", "forbidden", "not_found", "rate_limited",
      "invalid_model", "model_not_priced", "invalid_params", "missing_provider_key",
      "insufficient_credits", "unsupported_setting", "content_policy",
      "provider_timeout", "internal",
    ];
    for (const code of canonical) {
      expect(ERROR_CODES[code], `missing code ${code}`).toBeTruthy();
      expect(typeof ERROR_CODES[code].title).toBe("string");
      expect(ERROR_CODES[code].title.length).toBeGreaterThan(0);
      expect(typeof ERROR_CODES[code].message).toBe("string");
      expect(ERROR_CODES[code].message.length).toBeGreaterThan(0);
    }
  });

  it("never names an upstream provider in any default title or message", () => {
    const forbidden = /kie|alibaba|dashscope|openrouter|deepseek|suno|elevenlabs/i;
    for (const [code, def] of Object.entries(ERROR_CODES)) {
      expect(def.title, `title of ${code}`).not.toMatch(forbidden);
      expect(def.message, `message of ${code}`).not.toMatch(forbidden);
    }
  });
});

describe("newErrorId", () => {
  it("returns an 8-char lowercase hex-ish id, unique across calls", () => {
    const a = newErrorId();
    const b = newErrorId();
    expect(a).toMatch(/^[0-9a-f-]{8}$/);
    expect(b).toMatch(/^[0-9a-f-]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe("apiError — envelope shape", () => {
  it("returns { error, code, title, errorId, retryable, details } with the given status", async () => {
    const res = apiError({ status: 422, code: "invalid_params", details: ["duration: not offered"] });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
    expect(body.code).toBe("invalid_params");
    expect(body.title).toBe(ERROR_CODES.invalid_params.title);
    expect(body.errorId).toMatch(/^[0-9a-f-]{8}$/);
    expect(body.retryable).toBe(false);
    expect(body.details).toEqual(["duration: not offered"]);
  });

  it("defaults status/title/message from the code table when not given", async () => {
    const res = apiError({ code: "rate_limited" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe(ERROR_CODES.rate_limited.message);
    expect(body.title).toBe(ERROR_CODES.rate_limited.title);
    expect(body.retryable).toBe(true); // rate limits are retryable by default
  });

  it("explicit title/message/retryable override the table defaults", async () => {
    const res = apiError({
      status: 422, code: "internal",
      title: "Planning failed", message: "We couldn't plan this.", retryable: true,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("We couldn't plan this.");
    expect(body.title).toBe("Planning failed");
    expect(body.retryable).toBe(true);
  });

  it("generates a fresh errorId per call, and accepts a caller-provided one", async () => {
    const a = await apiError({ code: "internal" }).json();
    const b = await apiError({ code: "internal" }).json();
    expect(a.errorId).not.toBe(b.errorId);

    const pinned = await apiError({ code: "internal", errorId: "abcd1234" }).json();
    expect(pinned.errorId).toBe("abcd1234");
  });

  it("spreads extra fields into the body (retryAfter, credits, cost) without clobbering the envelope", async () => {
    const res = apiError({ code: "rate_limited", extra: { retryAfter: 12 } });
    const body = await res.json();
    expect(body.retryAfter).toBe(12);
    expect(body.code).toBe("rate_limited");

    const res2 = apiError({ code: "insufficient_credits", extra: { credits: 3, cost: 25 } });
    expect(res2.status).toBe(402);
    const body2 = await res2.json();
    expect(body2.credits).toBe(3);
    expect(body2.cost).toBe(25);
  });

  it("interpolates {placeholders} in the default message from extra fields", async () => {
    const body = await apiError({ code: "insufficient_credits", extra: { credits: 3, cost: 25 } }).json();
    expect(body.error).toBe("This generation needs 25 credits but you have 3.");
    expect(body.error).not.toMatch(/\{|\}/);
  });

  it("leaves unmatched {placeholders} readable when no extra is given", async () => {
    const body = await apiError({ code: "insufficient_credits" }).json();
    // No fabricated numbers — falls back to a generic phrasing, still no raw braces.
    expect(body.error).not.toMatch(/\{|\}/);
  });
});

describe("apiError — cause handling", () => {
  it("logs the cause via log.error(code, { errorId, err }) and never puts it in the body", async () => {
    const cause = new Error("pg: connection refused at 10.0.0.5:5432 password=hunter2");
    const res = apiError({ status: 500, code: "internal", cause });
    const body = await res.json();

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("connection refused");
    expect(raw).not.toContain("hunter2");
    expect(body.error).toBe(ERROR_CODES.internal.message);

    expect(log.error).toHaveBeenCalledTimes(1);
    const [event, fields] = log.error.mock.calls[0];
    expect(event).toBe("internal");
    expect(fields.errorId).toBe(body.errorId);
    expect(fields.err).toBe(cause);
  });

  it("does not log at all when there is no cause", () => {
    apiError({ status: 404, code: "not_found" });
    expect(log.error).not.toHaveBeenCalled();
  });

  it("passes extra server-side context into the log line, never into the body", async () => {
    const cause = new Error("boom");
    const res = apiError({ code: "internal", cause, context: { tool: "image", model: "m1" } });
    const body = await res.json();
    expect(body.tool).toBeUndefined();
    expect(body.model).toBeUndefined();
    const [, fields] = log.error.mock.calls[0];
    expect(fields.tool).toBe("image");
    expect(fields.model).toBe("m1");
  });
});
