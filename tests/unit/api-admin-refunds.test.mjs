import { describe, it, expect, vi, beforeEach } from "vitest";

// admin/refunds POST already grants through the wallet ledger (grantCredits,
// which writes a CreditLedger row) — it must not also double-write a legacy
// CreditTransaction row for the same refund.

vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

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
