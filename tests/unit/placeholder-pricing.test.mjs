import { describe, it, expect, vi } from "vitest";
import { isPlaceholderPricing, calculateProviderQuote } from "../../src/lib/model-catalog-core.mjs";

const flat = (price, unit = "image") => ({ unit, currency: "USD", rules: [{ price }] });

describe("isPlaceholderPricing", () => {
  it("catches the real production rows, in both directions", () => {
    // Measured 2026-08-09 against the live catalog.
    expect(isPlaceholderPricing(flat(0.03), 1.28)).toBe(true);   // Veo 3 — 42x under
    expect(isPlaceholderPricing(flat(0.3), 0.025)).toBe(true);   // Topaz upscale — 12x over
    expect(isPlaceholderPricing(flat(0.03), 0.26)).toBe(true);   // seedance-1.5-pro
  });

  it("leaves a rule that agrees with the measured cost alone", () => {
    expect(isPlaceholderPricing(flat(0.57), 0.57)).toBe(false);  // seedance-2, correct
    expect(isPlaceholderPricing(flat(0.5), 0.5)).toBe(false);
  });

  it("judges by ratio, so rounding is not mistaken for a pricing bug", () => {
    // Real row: seedream/4.5-text-to-image stores $0.035 against a $0.03
    // rule. That is a third of a cent, not a wrong price.
    expect(isPlaceholderPricing(flat(0.03), 0.035)).toBe(false);
    // And a factor IS caught however small the absolute numbers are.
    expect(isPlaceholderPricing(flat(0.03), 0.3)).toBe(true);
  });

  it("never second-guesses a REAL schedule", () => {
    // Several rules, a per-unit price, or a `when` condition all mean
    // somebody actually wrote this. Those are exactly the rows that must
    // keep computing from parameters.
    expect(isPlaceholderPricing({ rules: [{ price: 0.1 }, { price: 0.2 }] }, 0.5)).toBe(false);
    expect(isPlaceholderPricing({ unit: "second", rules: [{ price: 0.05 }] }, 0.5)).toBe(false);
    expect(isPlaceholderPricing({ rules: [{ price: 0.03, when: { resolution: "1080p" } }] }, 1.28)).toBe(false);
  });

  it("stays out of the way when there is nothing to compare against", () => {
    expect(isPlaceholderPricing(flat(0.03), 0)).toBe(false);
    expect(isPlaceholderPricing(flat(0.03), null)).toBe(false);
    expect(isPlaceholderPricing(null, 1)).toBe(false);
    expect(isPlaceholderPricing({ rules: [] }, 1)).toBe(false);
  });

  it("does not change what a genuine rule quotes", () => {
    const q = calculateProviderQuote(flat(0.57), {});
    expect(q.providerCost).toBe(0.57);
  });
});

describe("quoting a row with no usable schedule", () => {
  // Clearing the 51 placeholder blocks turned a latent throw into a real
  // one: quoteCatalogModel refused any row without pricingRules, so a model
  // with a perfectly good measured cost became unquotable — it could not be
  // substituted to, and could not be re-quoted mid-run.
  it("falls back to the stored price instead of refusing", async () => {
    vi.resetModules();
    vi.doMock("../../src/lib/prisma.js", () => ({
      default: {
        modelPricing: {
          findUnique: vi.fn(async () => null),
          findFirst: vi.fn(async () => ({
            modelId: "topaz/video-upscale", providerName: "kie", isActive: true, isDeprecated: false,
            inputSchema: null, pricingRules: null, providerCost: 0.025, creditsCost: 7,
          })),
        },
        providerConfig: { findUnique: vi.fn(async () => ({ markup: 2.5 })) },
      },
    }));
    const { quoteCatalogModel } = await import("../../src/lib/model-catalog.js");
    const q = await quoteCatalogModel("topaz/video-upscale", {});
    expect(q).toMatchObject({ valid: true, credits: 7, pricingSource: "stored" });
  });

  it("still refuses a row that has no price at all", async () => {
    vi.resetModules();
    vi.doMock("../../src/lib/prisma.js", () => ({
      default: {
        modelPricing: {
          findUnique: vi.fn(async () => null),
          findFirst: vi.fn(async () => ({
            modelId: "mystery/model", providerName: "kie", isActive: true, isDeprecated: false,
            inputSchema: null, pricingRules: null, providerCost: 0, creditsCost: 0,
          })),
        },
        providerConfig: { findUnique: vi.fn(async () => null) },
      },
    }));
    const { quoteCatalogModel } = await import("../../src/lib/model-catalog.js");
    // Guessing at somebody's money is worse than failing.
    await expect(quoteCatalogModel("mystery/model", {})).rejects.toThrow(/no verified pricing/i);
  });
});
