import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolvePriceId, PLACEHOLDER_PRICE_ID, REAL_PRICE_ID } from "../../scripts/seed-plans.mjs";

// Production incident: every SubscriptionPlan.stripePriceId row literally
// contained the placeholder "price_..." because STRIPE_PRICE_* was unset
// on the server, and the old seed script wrote `process.env.X` straight
// through — undefined became a Prisma no-op, but a literal placeholder
// string is truthy/non-empty, so it passed every existing guard and reached
// the Stripe SDK verbatim, which 500s with "No such price". The seed script
// must treat "missing", "empty", and "placeholder-shaped" as the SAME
// outcome — write null, never a value Stripe will reject.
//
// Importing the script only pulls in its pure `resolvePriceId` export —
// the DB-touching seed loop is gated behind an `isMain` check in
// scripts/seed-plans.mjs so import here never opens a real Prisma
// connection.

const ENV_VAR = "STRIPE_PRICE_TEST_PLAN";

beforeEach(() => {
  delete process.env[ENV_VAR];
});

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe("resolvePriceId", () => {
  it("returns null with no env var name at all (e.g. the free plan)", () => {
    expect(resolvePriceId(null)).toEqual({ value: null, reason: null });
  });

  it("returns null + reason when the env var is unset", () => {
    expect(resolvePriceId(ENV_VAR)).toEqual({ value: null, reason: "not set" });
  });

  it("returns null + reason when the env var is an empty string", () => {
    process.env[ENV_VAR] = "";
    expect(resolvePriceId(ENV_VAR)).toEqual({ value: null, reason: "empty" });
  });

  it("returns null + reason when the env var is blank (whitespace only)", () => {
    process.env[ENV_VAR] = "   ";
    expect(resolvePriceId(ENV_VAR).value).toBeNull();
  });

  it.each(["price_...", "price_", "price_.", "price_.."])(
    "treats the literal placeholder %j as absent",
    (placeholder) => {
      process.env[ENV_VAR] = placeholder;
      const result = resolvePriceId(ENV_VAR);
      expect(result.value).toBeNull();
      expect(result.reason).toContain("placeholder");
    }
  );

  it("treats a value that doesn't start with price_<real chars> as absent", () => {
    process.env[ENV_VAR] = "not-a-price-id";
    const result = resolvePriceId(ENV_VAR);
    expect(result.value).toBeNull();
    expect(result.reason).toContain("does not look like a Stripe price id");
  });

  it("accepts a real-looking Stripe price id", () => {
    process.env[ENV_VAR] = "price_1NxxABCDEFghijk123";
    expect(resolvePriceId(ENV_VAR)).toEqual({ value: "price_1NxxABCDEFghijk123", reason: null });
  });

  it("trims surrounding whitespace on an otherwise-real id", () => {
    process.env[ENV_VAR] = "  price_1NxxABCDEFghijk123  ";
    expect(resolvePriceId(ENV_VAR).value).toBe("price_1NxxABCDEFghijk123");
  });
});

describe("shared placeholder/real-id regexes", () => {
  it("PLACEHOLDER_PRICE_ID matches only the dots-after-price_ shape", () => {
    expect(PLACEHOLDER_PRICE_ID.test("price_...")).toBe(true);
    expect(PLACEHOLDER_PRICE_ID.test("price_")).toBe(true);
    expect(PLACEHOLDER_PRICE_ID.test("price_1Nxx")).toBe(false);
  });

  it("REAL_PRICE_ID requires price_ followed by at least one more character", () => {
    expect(REAL_PRICE_ID.test("price_1NxxABC123")).toBe(true);
    expect(REAL_PRICE_ID.test("price_studio_monthly")).toBe(true);
    expect(REAL_PRICE_ID.test("price_")).toBe(false);
    expect(REAL_PRICE_ID.test("prix_123")).toBe(false);
    // Placeholder rejection is PLACEHOLDER_PRICE_ID's job, checked first by
    // resolvePriceId — REAL_PRICE_ID alone (a "starts with price_ and has
    // content" check) is intentionally permissive about the placeholder's
    // dots-only content, since ordering handles the exclusion.
    expect(REAL_PRICE_ID.test("price_...")).toBe(true);
  });
});
