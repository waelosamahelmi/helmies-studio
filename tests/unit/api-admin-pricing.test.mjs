import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { upsert: vi.fn(), findMany: vi.fn() }, providerConfig: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) =>
    Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
}));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/security";
import { POST } from "@/app/api/admin/pricing/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/pricing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/pricing — margin floor (code review follow-up)", () => {
  it("rejects the review's exact quantified scenario (10s @ $0.075/sec ≈ $0.75 cost, creditsCost:5) with 400, and does not write or audit it", async () => {
    const res = await POST(
      jsonReq({ modelId: "wan2.6-i2v-flash", modelType: "i2v", providerName: "KIE", providerCost: 0.75, creditsCost: 5 })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/below its provider cost/);
    expect(prisma.modelPricing.upsert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("a valid update (creditsCost above the floor) still succeeds and is audited", async () => {
    prisma.modelPricing.upsert.mockResolvedValue({});
    const res = await POST(
      jsonReq({ modelId: "m1", modelType: "image", providerName: "KIE", providerCost: 0.1, creditsCost: 25 })
    );
    expect(res.status).toBe(200);
    expect(prisma.modelPricing.upsert).toHaveBeenCalledWith({
      where: { modelId: "m1" },
      create: { modelId: "m1", modelType: "image", providerName: "KIE", providerCost: 0.1, creditsCost: 25 },
      update: { providerCost: 0.1, creditsCost: 25, providerName: "KIE" },
    });
    expect(logAudit).toHaveBeenCalledWith(
      "admin_set_pricing",
      "model_pricing",
      "m1",
      { providerCost: 0.1, creditsCost: 25 },
      expect.anything()
    );
  });
});
