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
