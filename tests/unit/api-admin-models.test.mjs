import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
}));
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) =>
    Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
}));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import prisma from "@/lib/prisma";
import { POST } from "@/app/api/admin/models/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/models — margin floor (code review follow-up)", () => {
  it("rejects a below-cost creditsCost on a brand-new model row", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    const res = await POST(jsonReq({ modelId: "m1", modelType: "image", providerCost: 0.75, creditsCost: 5 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/below its provider cost/);
    expect(prisma.modelPricing.upsert).not.toHaveBeenCalled();
  });

  // This route does a PARTIAL update — a request that only changes
  // creditsCost must still be floored against whatever providerCost is
  // ALREADY on the row, not just what this one request happened to include.
  it("rejects a creditsCost-only update that would drop below the EXISTING row's provider cost", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "m1", providerCost: 0.75, creditsCost: 100 });
    const res = await POST(jsonReq({ modelId: "m1", creditsCost: 5 }));
    expect(res.status).toBe(400);
    expect(prisma.modelPricing.upsert).not.toHaveBeenCalled();
  });

  it("a valid update (creditsCost above the floor) still succeeds", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "m1", providerCost: 0.1, creditsCost: 10 });
    prisma.modelPricing.upsert.mockResolvedValue({});
    const res = await POST(jsonReq({ modelId: "m1", creditsCost: 25 }));
    expect(res.status).toBe(200);
    expect(prisma.modelPricing.upsert).toHaveBeenCalled();
  });

  it("does not floor a brand-new model with no providerCost supplied at all (defaults to 0)", async () => {
    prisma.modelPricing.findUnique.mockResolvedValue(null);
    prisma.modelPricing.upsert.mockResolvedValue({});
    const res = await POST(jsonReq({ modelId: "new-model", modelType: "image", creditsCost: 1 }));
    expect(res.status).toBe(200);
    expect(prisma.modelPricing.upsert).toHaveBeenCalled();
  });
});
