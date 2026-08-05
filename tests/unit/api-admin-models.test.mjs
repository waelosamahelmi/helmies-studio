import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { modelPricing: { upsert: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn().mockResolvedValue(undefined),
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

// ── EDITSv1 M3 — admin inputSchema editing ─────────────────────────────────
import { logAudit } from "@/lib/security";

describe("POST /api/admin/models — inputSchema editing", () => {
  beforeEach(() => {
    prisma.modelPricing.findUnique.mockResolvedValue({ modelId: "m1", providerCost: 0.01, creditsCost: 10 });
    prisma.modelPricing.upsert.mockResolvedValue({});
  });

  const goodSchema = {
    fields: {
      prompt: { type: "string", required: true },
      quality: { type: "string", required: false, enum: ["720p", "1080p"], default: "720p" },
    },
  };

  it("accepts a valid schema, persists it, and writes an AuditLog entry", async () => {
    const res = await POST(jsonReq({ modelId: "m1", inputSchema: goodSchema }));
    expect(res.status).toBe(200);
    const call = prisma.modelPricing.upsert.mock.calls[0][0];
    expect(call.update.inputSchema).toEqual(goodSchema);
    expect(logAudit).toHaveBeenCalledWith(
      "admin_edit_model_schema",
      "model_pricing",
      "m1",
      { fields: ["prompt", "quality"] },
      expect.anything(),
    );
  });

  it("rejects a non-object schema (400, nothing written)", async () => {
    for (const bad of ["not json data", 42, [1, 2], { fields: [] }, { nope: {} }]) {
      prisma.modelPricing.upsert.mockClear();
      const res = await POST(jsonReq({ modelId: "m1", inputSchema: bad }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
      expect(prisma.modelPricing.upsert).not.toHaveBeenCalled();
    }
  });

  it("rejects a field with an invalid type or a non-scalar enum", async () => {
    const badType = { fields: { x: { type: "func" } } };
    expect((await POST(jsonReq({ modelId: "m1", inputSchema: badType }))).status).toBe(400);
    const badEnum = { fields: { x: { type: "string", enum: [{ nested: true }] } } };
    expect((await POST(jsonReq({ modelId: "m1", inputSchema: badEnum }))).status).toBe(400);
    // Functions-shaped junk smuggled as an attribute name is rejected too.
    const junk = { fields: { x: { type: "string", onClick: "alert(1)" } } };
    expect((await POST(jsonReq({ modelId: "m1", inputSchema: junk }))).status).toBe(400);
  });

  it("a pricing-only update writes NO schema and NO schema audit entry", async () => {
    await POST(jsonReq({ modelId: "m1", creditsCost: 25 }));
    const call = prisma.modelPricing.upsert.mock.calls[0][0];
    expect(call.update.inputSchema).toBeUndefined();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("keeps the verification sweep's providerRequired list when the admin round-trips it", async () => {
    const withPR = { ...goodSchema, providerRequired: ["quality"] };
    const res = await POST(jsonReq({ modelId: "m1", inputSchema: withPR }));
    expect(res.status).toBe(200);
    expect(prisma.modelPricing.upsert.mock.calls[0][0].update.inputSchema.providerRequired).toEqual(["quality"]);
  });
});
