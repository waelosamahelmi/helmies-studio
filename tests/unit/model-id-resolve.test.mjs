import { describe, it, expect, vi } from "vitest";
import { resolveModelPricingRow } from "@/lib/model-catalog-core.mjs";

// URGENT production fix, requirement 4 (hide upstream providers): the real
// modelId (e.g. Alibaba's "alibaba:qwen-image-max") is the routing key used
// everywhere (pricing, provider resolution, job dispatch), so it can never
// change — but the public catalog now hands back a stripped, provider-free
// id ("qwen-image-max"). resolveModelPricingRow is what lets every one of
// those routing lookups accept EITHER form back from a client and still
// find the real row, without ever needing a schema change.
//
// `prisma` is passed in (not imported) specifically so every call site's
// own already-mocked-in-tests client works here with zero new mocking —
// see providers.js/model-catalog.js/pricing-engine.js/credits.js/
// generate-async-enqueue's own tests, none of which needed updating for
// this.

function fakePrisma({ exact = null, byPrefix = null, findFirstThrows = false } = {}) {
  return {
    modelPricing: {
      findUnique: vi.fn(async () => exact),
      findFirst: vi.fn(async () => {
        if (findFirstThrows) throw new Error("findFirst not supported by this test double");
        return byPrefix;
      }),
    },
  };
}

describe("resolveModelPricingRow", () => {
  it("resolves the real id directly — the exact-match fast path every existing/internal caller already uses", async () => {
    const row = { modelId: "seedance-1-5-pro" };
    const prisma = fakePrisma({ exact: row });
    const result = await resolveModelPricingRow(prisma, "seedance-1-5-pro");
    expect(result).toBe(row);
    expect(prisma.modelPricing.findFirst).not.toHaveBeenCalled();
  });

  it("resolves a public (provider-prefix-stripped) id back to its real prefixed row", async () => {
    const row = { modelId: "alibaba:qwen-image-max", providerName: "Alibaba" };
    const prisma = fakePrisma({ exact: null, byPrefix: row });
    const result = await resolveModelPricingRow(prisma, "qwen-image-max");
    expect(result).toBe(row);
    expect(prisma.modelPricing.findUnique).toHaveBeenCalledWith({ where: { modelId: "qwen-image-max" } });
    expect(prisma.modelPricing.findFirst).toHaveBeenCalledWith({ where: { modelId: { endsWith: ":qwen-image-max" } } });
  });

  it("returns null for an id that matches nothing at all", async () => {
    const prisma = fakePrisma({ exact: null, byPrefix: null });
    expect(await resolveModelPricingRow(prisma, "no-such-model")).toBeNull();
  });

  it("returns null (never throws) when the underlying client has no findFirst at all", async () => {
    const prisma = { modelPricing: { findUnique: vi.fn(async () => null) } }; // no findFirst defined
    await expect(resolveModelPricingRow(prisma, "anything")).resolves.toBeNull();
  });

  it("returns null (never throws) when findFirst itself errors", async () => {
    const prisma = fakePrisma({ exact: null, findFirstThrows: true });
    await expect(resolveModelPricingRow(prisma, "anything")).resolves.toBeNull();
  });

  it("returns null immediately for a falsy candidate id, without querying", async () => {
    const prisma = fakePrisma();
    expect(await resolveModelPricingRow(prisma, "")).toBeNull();
    expect(await resolveModelPricingRow(prisma, null)).toBeNull();
    expect(prisma.modelPricing.findUnique).not.toHaveBeenCalled();
  });

  it("forwards a select clause to both the exact and fallback query", async () => {
    const row = { managedBySync: true };
    const prisma = fakePrisma({ exact: null, byPrefix: row });
    await resolveModelPricingRow(prisma, "qwen-image-max", { managedBySync: true });
    expect(prisma.modelPricing.findUnique).toHaveBeenCalledWith({
      where: { modelId: "qwen-image-max" },
      select: { managedBySync: true },
    });
    expect(prisma.modelPricing.findFirst).toHaveBeenCalledWith({
      where: { modelId: { endsWith: ":qwen-image-max" } },
      select: { managedBySync: true },
    });
  });
});
