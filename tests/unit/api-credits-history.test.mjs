import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/credits history must read from CreditLedger (via the wallet relation),
// not the legacy CreditTransaction table — the wallet is the source of truth
// and admin/automation/agent mutations no longer write CreditTransaction rows.

vi.mock("@/lib/session", () => ({
  getCurrentUserWithCredits: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: { findFirst: vi.fn() },
    creditLedger: { findMany: vi.fn() },
    creditTransaction: { findMany: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { GET } from "@/app/api/credits/route.js";

const LEDGER_ROW = {
  id: "cl1",
  amount: 50,
  type: "topup",
  description: "Stripe top-up",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1", credits: 100 });
  prisma.subscription.findFirst.mockResolvedValue(null);
  prisma.creditLedger.findMany.mockResolvedValue([LEDGER_ROW]);
});

describe("GET /api/credits — history reads CreditLedger", () => {
  it("queries creditLedger via the wallet relation, not creditTransaction", async () => {
    const res = await GET(new Request("http://test/api/credits"));
    expect(res.status).toBe(200);

    expect(prisma.creditLedger.findMany).toHaveBeenCalledWith({
      where: { wallet: { userId: "u1" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amount: true, type: true, description: true, createdAt: true },
    });
    expect(prisma.creditTransaction.findMany).not.toHaveBeenCalled();
  });

  it("returns recentTransactions with the keys the UI reads", async () => {
    const res = await GET(new Request("http://test/api/credits"));
    const body = await res.json();

    expect(body.recentTransactions).toHaveLength(1);
    expect(Object.keys(body.recentTransactions[0]).sort()).toEqual(
      ["amount", "createdAt", "description", "id", "type"].sort()
    );
    expect(body.recentTransactions[0]).toMatchObject({
      id: "cl1",
      amount: 50,
      type: "topup",
      description: "Stripe top-up",
    });
  });
});
