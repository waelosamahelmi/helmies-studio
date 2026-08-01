import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: { providerConfig: { findMany: vi.fn(), upsert: vi.fn() } },
}));
vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));
// The route imports authzResponse from @/lib/authz directly (Task 1's central
// authz sweep). The real module pulls in @/lib/session -> @/lib/auth ->
// next-auth, which this test environment can't resolve — stub it out with
// the same status/publicMessage -> Response contract.
vi.mock("@/lib/authz", () => ({
  authzResponse: (e) =>
    Response.json(
      { error: e?.publicMessage ?? "Internal error" },
      { status: e?.status ?? 500 },
    ),
}));
// Origin verification (Task 3) is exercised on its own in
// tests/unit/origin-check.test.mjs — stub it here so these tests keep
// focusing on provider-config upsert behavior.
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import prisma from "@/lib/prisma";
import { verifyOrigin } from "@/lib/origin-check";
import { GET, POST } from "@/app/api/admin/providers/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/providers", () => {
  it("returns provider rows with no apiKey-related fields — env is the only key store", async () => {
    prisma.providerConfig.findMany.mockResolvedValue([
      { id: "p1", name: "KIE", type: "media", baseUrl: null, markup: 2.5, isActive: true },
      { id: "p2", name: "Alibaba", type: "media", baseUrl: null, markup: 2.5, isActive: true },
    ]);
    const res = await GET(new Request("http://test/api/admin/providers"));
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty("apiKey");
      expect(row).not.toHaveProperty("hasApiKey");
      expect(row).not.toHaveProperty("apiKeyLast4");
    }
    expect(rows[0]).toMatchObject({ id: "p1", name: "KIE", markup: 2.5, isActive: true });
  });
});

describe("POST /api/admin/providers", () => {
  it("rejects a supplied apiKey with 400 — keys are env-only now", async () => {
    const res = await POST(jsonReq({ name: "KIE", type: "media", apiKey: "sk-live-secret-123", markup: 3 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "Provider keys are configured via environment variables" });
    expect(prisma.providerConfig.upsert).not.toHaveBeenCalled();
  });

  it("upserts only the allowlisted fields on a normal POST", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    const res = await POST(jsonReq({ name: "KIE", type: "media", baseUrl: "https://api.kie.ai", markup: 3, isActive: true }));
    expect(res.status).toBe(200);
    const call = prisma.providerConfig.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ name: "KIE" });
    expect(call.create).not.toHaveProperty("apiKey");
    expect(call.update).not.toHaveProperty("apiKey");
    expect(call.update).toMatchObject({ type: "media", baseUrl: "https://api.kie.ai", markup: 3, isActive: true });
  });

  it("still calls verifyOrigin (Task 3 CSRF check) before writing", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    await POST(jsonReq({ name: "KIE", type: "media", markup: 3 }));
    expect(verifyOrigin).toHaveBeenCalled();
  });
});
