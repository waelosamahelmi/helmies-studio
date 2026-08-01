import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    modelPricing: { findUnique: vi.fn() },
    providerConfig: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { POST } from "@/app/api/models/quote/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/models/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/models/quote", () => {
  it("returns credits without disclosing provider cost or markup", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1",
      isActive: true,
      isDeprecated: false,
      providerName: "Alibaba",
      inputSchema: { fields: {} },
      pricingRules: { rules: [{ when: {}, price: 0.04, unit: "fixed" }] },
    });
    prisma.providerConfig.findUnique.mockResolvedValue({ markup: 2.5 });

    const res = await POST(jsonReq({ modelId: "m1", params: {} }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toHaveProperty("valid", true);
    expect(json).toHaveProperty("modelId", "m1");
    expect(json).toHaveProperty("credits");
    expect(typeof json.credits).toBe("number");

    expect(json).not.toHaveProperty("providerCost");
    expect(json).not.toHaveProperty("markup");
    expect(json).not.toHaveProperty("unitPrice");
    expect(json).not.toHaveProperty("multiplier");
    expect(json).not.toHaveProperty("matchedRule");
    expect(json).not.toHaveProperty("pricing");
    expect(json).not.toHaveProperty("pricingRules");
    expect(json).not.toHaveProperty("provider");
  });

  it("returns validation errors without leaking pricing data when input is invalid", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({
      modelId: "m1",
      isActive: true,
      isDeprecated: false,
      providerName: "Alibaba",
      inputSchema: { fields: { prompt: { type: "string", required: true } } },
      pricingRules: { rules: [{ when: {}, price: 0.04, unit: "fixed" }] },
    });

    const res = await POST(jsonReq({ modelId: "m1", params: {} }));
    expect(res.status).toBe(422);
    const json = await res.json();

    expect(json).toHaveProperty("valid", false);
    expect(json).toHaveProperty("errors");
    expect(Array.isArray(json.errors)).toBe(true);

    expect(json).not.toHaveProperty("providerCost");
    expect(json).not.toHaveProperty("markup");
    expect(json).not.toHaveProperty("credits");
  });
});
