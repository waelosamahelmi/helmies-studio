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
//
// UPDATED for the Alibaba retirement (EDITSv1 M2 — owner decision KIE-only):
// resolution never returns the Alibaba adapter any more; an Alibaba-priced
// row now resolves to KIE, and the fallback chain is KIE-only. The
// spread-order invariant is still asserted — on the KIE entries.

vi.mock("@/lib/prisma", () => {
  const models = {
    modelPricing: { findUnique: vi.fn(), findFirst: vi.fn() },
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
  it("returns a lowercase, directly-indexable adapter key (never a display name)", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "kling/text-to-video",
      providerName: "KIE",
    });

    const result = await resolveProvider("kling/text-to-video");

    expect(result.name).toBe("kie");
    expect(result.baseUrl).toBe(PROVIDERS.kie.baseUrl);
    // The invariant that was violated: the returned name must be a real,
    // directly-indexable PROVIDERS key.
    expect(PROVIDERS[result.name]).toBeDefined();
  });

  it("resolves an Alibaba-providerName row to KIE — the retired adapter never serves new work", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "wan2.5-t2v",
      providerName: "Alibaba",
    });

    const result = await resolveProvider("wan2.5-t2v");

    expect(result.name).toBe("kie");
    expect(result.baseUrl).toBe(PROVIDERS.kie.baseUrl);
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

  // URGENT fix, requirement 4: the public catalog hands back a stripped id
  // ("qwen-image-max" instead of "alibaba:qwen-image-max") — routing must
  // still resolve the real row (and, post-retirement, land on KIE).
  it("resolves a public (provider-prefix-stripped) id via its real, prefixed row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null); // no exact match on the stripped id
    prisma.modelPricing.findFirst.mockResolvedValue({ modelId: "alibaba:qwen-image-max", providerName: "Alibaba" });

    const result = await resolveProvider("qwen-image-max");

    expect(result.name).toBe("kie"); // retired provider → default adapter
    expect(prisma.modelPricing.findFirst).toHaveBeenCalledWith({ where: { modelId: { endsWith: ":qwen-image-max" } } });
  });
});

describe("resolveProviderWithFallback — retirement-era chain shape", () => {
  it("keeps a non-empty, KIE-only chain for a managedBySync Alibaba model", async () => {
    prisma.modelPricing.findUnique.mockImplementation(() =>
      Promise.resolve({ modelId: "wan2.5-t2v", providerName: "Alibaba", managedBySync: true })
    );

    const chain = await resolveProviderWithFallback("wan2.5-t2v");

    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0].baseUrl).toBe(PROVIDERS.kie.baseUrl);
    expect(chain.map((p) => p.name)).not.toContain("alibaba");
    expect(PROVIDERS[chain[0].name]).toBeDefined();
  });
});

describe("resolveProviderWithFallback — provider kill switch (Phase 7 Task 3)", () => {
  it("throws a clear error naming the model when KIE — the only live provider — is disabled", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null); // default provider ("kie"), non-managedBySync
    prisma.providerConfig.findMany.mockResolvedValue([{ name: "kie", isActive: false }]);

    // Pre-retirement this fell through to the Alibaba fallback; with Alibaba
    // retired there is nowhere left to go, and the honest answer is the
    // operator-facing failure, not a silent submit to a dead provider.
    await expect(resolveProviderWithFallback("some-model")).rejects.toThrow(
      /some-model.*disabled/i
    );
  });

  it("throws the same clear error when every provider is disabled", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    prisma.providerConfig.findMany.mockResolvedValue([
      { name: "kie", isActive: false },
      { name: "alibaba", isActive: false },
    ]);

    await expect(resolveProviderWithFallback("some-model")).rejects.toThrow(
      /some-model.*disabled/i
    );
  });
});
