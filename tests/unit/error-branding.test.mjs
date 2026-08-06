// E2.2 — provider error branding fixes.
//
// The production incident this locks down: submitOnly calls
// brandError("invalid_api_key") when a provider key is missing, but the old
// matcher only checked for "api key" (with a space) — so a missing key
// surfaced to users as "An unexpected error occurred", hiding a
// configuration problem behind a generic message.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));

const { brandError, brandForUser } = await import("@/lib/providers.js");

describe("brandError key-shaped inputs", () => {
  it("brands the literal internal token invalid_api_key as an auth failure", () => {
    expect(brandError("invalid_api_key")).toBe("Provider authentication failed. Our team has been notified.");
  });

  it("brands api_key / apikey spellings", () => {
    expect(brandError("missing api_key for provider")).toMatch(/authentication failed/i);
    expect(brandError("bad apikey")).toMatch(/authentication failed/i);
  });

  it("still brands the human spellings and 401", () => {
    expect(brandError("Invalid API key supplied")).toMatch(/authentication failed/i);
    expect(brandError("401 unauthorized")).toMatch(/authentication failed/i);
  });

  it("keeps the other categories intact", () => {
    expect(brandError("429 too many requests")).toMatch(/wait a moment/i);
    expect(brandError("model not found")).toMatch(/temporarily unavailable/i);
    expect(brandError("request timed out")).toMatch(/took too long/i);
  });
});

// A real production image generation failed with the provider's one-word
// `failMsg: "nsfw"` and the user was shown "An unexpected error occurred.
// Please try again." — the content branch matched "content"/"filter"/
// "safety" and nothing else, so a bare moderation verdict fell through to
// `unknown` and the user never learned their PROMPT was the problem.
describe("brandError bare moderation tokens", () => {
  const CONTENT = "The request was blocked by safety filters.";

  for (const token of ["nsfw", "NSFW", "sensitive", "moderation", "prohibited", "policy", "blocked"]) {
    it(`brands the bare token "${token}" as a content-filter refusal`, () => {
      expect(brandError(token)).toBe(CONTENT);
    });
  }

  it("brands the tokens inside a real provider sentence", () => {
    expect(brandError("Request rejected: nsfw content detected")).toBe(CONTENT);
    expect(brandError("SENSITIVE_WORD_ERROR")).toBe(CONTENT);
    expect(brandError("prompt violates the provider policy")).toBe(CONTENT);
    expect(brandError("This prompt is prohibited")).toBe(CONTENT);
  });

  it("only matches a token standing on its own", () => {
    // "unblocked"/"policyholder" embed a token but mean something else — they
    // must keep falling through to the existing buckets, not become a
    // content refusal.
    expect(brandError("account unblocked")).not.toBe(CONTENT);
    expect(brandError("policyholder record missing")).not.toBe(CONTENT);
  });

  it("leaves every pre-existing mapping intact", () => {
    expect(brandError("429 too many requests")).toMatch(/wait a moment/i);
    expect(brandError("invalid_api_key")).toMatch(/authentication failed/i);
    expect(brandError("AccessDenied")).toMatch(/isn't available to run right now/i);
    expect(brandError("The model name you specified is not supported")).toMatch(/temporarily unavailable/i);
    expect(brandError("request timed out")).toMatch(/took too long/i);
    expect(brandError("insufficient balance")).toMatch(/balance is low/i);
    expect(brandError("upstream 503 service unavailable")).toMatch(/on our end/i);
    expect(brandError("something inexplicable")).toBe("An unexpected error occurred. Please try again.");
  });

  it("stays branded and never names a provider", () => {
    expect(brandForUser("nsfw")).toBe(CONTENT);
    expect(brandForUser(brandError("nsfw"))).toBe(CONTENT);
    expect(brandForUser("nsfw")).not.toMatch(/kie|alibaba|dashscope|suno|elevenlabs|openrouter/i);
  });
});

describe("brandError upstream outages", () => {
  it("brands the provider's bare 'internal error' failMsg as a retryable server problem", () => {
    // Live terminal body, every ElevenLabs generation on 2026-08-05:
    // {"state":"fail","failCode":"500","failMsg":"internal error, please try
    //  again later.","creditsConsumed":0}
    const branded = brandError("internal error, please try again later.");
    expect(branded).toBe("Something went wrong on our end. Please try again.");
    // job-runner.js's RETRYABLE_PATTERNS keys off this exact wording, so
    // branding it correctly is what makes the job retry instead of dying.
    expect(branded).toMatch(/something went wrong on our end/i);
  });
});

describe("brandError missing-field verdicts (2026-08-06 incident)", () => {
  // KIE answers a payload missing a required field with a NAMELESS
  // {"code":500,"msg":"This field is required"} or a named variant like
  // "first_frame_image_url cannot be empty". Neither matched any bucket, so
  // a text-only step sent to an image-required model (kling-3.0/motion-
  // control, pixverse-v6/transition) told the user "An unexpected error
  // occurred" about a fixable input problem.
  const INPUT_ERROR = "Some required settings are missing for this model. Please adjust the settings and try again.";

  it("brands the nameless 'This field is required' verdict", () => {
    expect(brandError("This field is required")).toBe(INPUT_ERROR);
  });

  it("brands the named 'cannot be empty' verdicts", () => {
    expect(brandError("first_frame_image_url cannot be empty")).toBe(INPUT_ERROR);
    expect(brandError("multi_shots cannot be empty")).toBe(INPUT_ERROR);
  });

  it("does not disturb the server_error bucket for real outages", () => {
    expect(brandError("internal error, please try again later.")).toMatch(/on our end/i);
    expect(brandError("503 upstream unavailable")).toMatch(/on our end/i);
  });

  it("stays branded and never names a provider", () => {
    expect(brandForUser(brandError("This field is required"))).toBe(INPUT_ERROR);
    expect(brandForUser("This field is required")).not.toMatch(/kie|alibaba|dashscope/i);
  });
});

describe("brandForUser idempotence", () => {
  it("passes an already-branded message through unchanged", () => {
    const branded = brandError("invalid_api_key");
    expect(brandForUser(branded)).toBe(branded);
  });

  it("brands a raw provider message", () => {
    expect(brandForUser("upstream 503 service unavailable")).toMatch(/on our end/i);
  });

  it("never emits a provider name", () => {
    for (const input of ["KIE returned 500", "alibaba dashscope timeout", "invalid_api_key", "", null]) {
      expect(brandForUser(input)).not.toMatch(/kie|alibaba|dashscope|wavespeed|openrouter/i);
    }
  });

  it("maps empty input to the unknown message", () => {
    expect(brandForUser("")).toBe("An unexpected error occurred. Please try again.");
  });
});
