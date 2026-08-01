import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { findMany: vi.fn(), findUnique: vi.fn() }, providerConfig: { findUnique: vi.fn() } },
}));

import { serializeCatalogModel } from "@/lib/model-catalog";

const row = {
  modelId: "m1", displayName: "M1", providerName: "KIE", modelType: "image",
  creditsCost: 10, providerCost: 0.04, pricingRules: { perImage: 0.04 },
};

describe("serializeCatalogModel", () => {
  it("hides provider cost basis by default (public shape)", () => {
    const pub = serializeCatalogModel(row);
    expect(pub).not.toHaveProperty("providerCost");
    expect(pub.pricing).toBeUndefined();
    expect(pub.credits).toBe(10); // retail price stays public
  });

  it("includes cost basis for internal/admin callers", () => {
    const internal = serializeCatalogModel(row, { includeCosts: true });
    expect(internal.providerCost).toBe(0.04);
    expect(internal.pricing).toEqual({ perImage: 0.04 });
  });
});
