import { describe, it, expect, vi, beforeEach } from "vitest";

// admin/refunds POST already grants through the wallet ledger (grantCredits,
// which writes a CreditLedger row) — it must not also double-write a legacy
// CreditTransaction row for the same refund.

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
// tests/unit/origin-check.test.mjs — stub it here so this test keeps
// focusing on the refund-grant behavior without needing matching Origin
// headers.
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

vi.mock("@/lib/wallet", () => ({
  grantCredits: vi.fn(),
  getWallet: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    refund: { create: vi.fn() },
    user: { update: vi.fn() },
    creditTransaction: { create: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { grantCredits, getWallet } from "@/lib/wallet";
import { POST } from "@/app/api/admin/refunds/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/refunds", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getWallet.mockResolvedValue({ available: 100 });
  grantCredits.mockResolvedValue({ available: 150 });
  prisma.refund.create.mockResolvedValue({ id: "r1" });
  prisma.user.update.mockResolvedValue({});
});

describe("POST /api/admin/refunds — no legacy creditTransaction double-write", () => {
  it("grants via the wallet ledger only, without a redundant creditTransaction row", async () => {
    const res = await POST(jsonReq({ userId: "u1", amount: 50, reason: "Bad output" }));
    expect(res.status).toBe(200);

    expect(grantCredits).toHaveBeenCalledWith("u1", 50, "refund", "Bad output", null);
    expect(prisma.creditTransaction.create).not.toHaveBeenCalled();
  });
});
