import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for a resolveProvider() bug: both of its return
// statements did `{ name, ...p, apiKey: p.getKey() }`, where `p` is a
// PROVIDERS[key] entry that carries its OWN `name` field holding the
// DISPLAY name ("KIE", "Alibaba"). Object-spread applies `...p` AFTER the
// `name` shorthand, so `p.name` silently clobbers the correctly-computed
// lowercase adapter key. resolveProviderWithFallback then builds its chain
// from `primary.name` and re-indexes PROVIDERS[name] — PROVIDERS["Alibaba"]
// is undefined, so the real primary gets dropped by `.filter(Boolean)`.
//
// Fix: put `name` AFTER the spread in every return statement so the
// adapter key wins: `{ ...p, name, apiKey: p.getKey() }`.

vi.mock("@/lib/prisma", () => {
  const models = {
    modelPricing: { findUnique: vi.fn() },
    providerConfig: { findMany: vi.fn() },
  };
  return { default: models };
});

import prisma from "@/lib/prisma";
import { resolveProvider, resolveProviderWithFallback, PROVIDERS, DEFAULT_PROVIDER } from "@/lib/providers";

beforeEach(() => {
  vi.clearAllMocks();
  // Env-only mode: no ProviderConfig rows means every adapter is eligible.
  prisma.providerConfig.findMany.mockResolvedValue([]);
});

describe("resolveProvider — the adapter key must survive the PROVIDERS spread", () => {
  it("returns .name === 'alibaba' (not the display name 'Alibaba') and the Alibaba adapter's baseUrl", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "wan2.5-t2v",
      providerName: "Alibaba",
    });

    const result = await resolveProvider("wan2.5-t2v");

    expect(result.name).toBe("alibaba");
    expect(result.baseUrl).toBe(PROVIDERS.alibaba.baseUrl);
    // The invariant that was violated: the returned name must be a real,
    // directly-indexable PROVIDERS key.
    expect(PROVIDERS[result.name]).toBeDefined();
  });

  it("falls back to .name === DEFAULT_PROVIDER ('kie') when there is no ModelPricing row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);

    const result = await resolveProvider("some-unpriced-model");

    expect(result.name).toBe("kie");
    expect(result.name).toBe(DEFAULT_PROVIDER);
    expect(result.baseUrl).toBe(PROVIDERS.kie.baseUrl);
    expect(PROVIDERS[result.name]).toBeDefined();
  });
});

describe("resolveProviderWithFallback — the Alibaba primary must not be dropped from the chain", () => {
  it("keeps a non-empty chain with the Alibaba adapter first for a managedBySync Alibaba model", async () => {
    prisma.modelPricing.findUnique.mockImplementation(() =>
      Promise.resolve({ modelId: "wan2.5-t2v", providerName: "Alibaba", managedBySync: true })
    );

    const chain = await resolveProviderWithFallback("wan2.5-t2v");

    expect(chain.length).toBeGreaterThan(0);
    // Assert on adapter identity (baseUrl), not on a string that could pass
    // for the wrong reason.
    expect(chain[0].baseUrl).toBe(PROVIDERS.alibaba.baseUrl);
    expect(PROVIDERS[chain[0].name]).toBeDefined();
  });
});
