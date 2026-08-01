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

import prisma from "@/lib/prisma";
import { GET, POST } from "@/app/api/admin/providers/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/providers", () => {
  it("never returns apiKey — only hasApiKey and last4", async () => {
    prisma.providerConfig.findMany.mockResolvedValue([
      { id: "p1", name: "KIE", apiKey: "sk-secret-abcd1234", markup: 2.5, isActive: true },
      { id: "p2", name: "Alibaba", apiKey: null, markup: 2.5, isActive: true },
    ]);
    const res = await GET(new Request("http://test/api/admin/providers"));
    const rows = await res.json();
    for (const row of rows) expect(row).not.toHaveProperty("apiKey");
    expect(rows[0]).toMatchObject({ hasApiKey: true, apiKeyLast4: "1234" });
    expect(rows[1]).toMatchObject({ hasApiKey: false, apiKeyLast4: null });
  });
});

describe("POST /api/admin/providers", () => {
  it("does not overwrite the stored key when apiKey is blank or masked", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "", markup: 3 }));
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "••••1234", markup: 3 }));
    for (const call of prisma.providerConfig.upsert.mock.calls) {
      expect(call[0].update).not.toHaveProperty("apiKey");
    }
  });

  it("writes a genuinely new key", async () => {
    prisma.providerConfig.upsert.mockResolvedValue({});
    await POST(jsonReq({ name: "KIE", type: "media", apiKey: "sk-new-key-9", markup: 3 }));
    expect(prisma.providerConfig.upsert.mock.calls[0][0].update)
      .toHaveProperty("apiKey", "sk-new-key-9");
  });
});
