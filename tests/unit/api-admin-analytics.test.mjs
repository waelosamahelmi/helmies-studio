import { describe, it, expect, vi, beforeEach } from "vitest";

// admin/analytics' revenue aggregate must read CreditLedger types
// "topup"/"subscription_grant" — Stripe grants write those CreditLedger
// types now, not CreditTransaction "topup"/"subscription", so the old
// creditTransaction.aggregate query under-reported (eventually zero)
// revenue.

vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
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

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { count: vi.fn().mockResolvedValue(0) },
    generation: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { creditsUsed: 0, providerCost: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    creditLedger: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500 } }) },
    creditTransaction: { aggregate: vi.fn() },
  },
}));

import prisma from "@/lib/prisma";
import { GET } from "@/app/api/admin/analytics/route.js";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/analytics — revenue reads CreditLedger", () => {
  it("aggregates creditLedger amounts for topup/subscription_grant, not creditTransaction", async () => {
    prisma.creditLedger.aggregate.mockResolvedValue({ _sum: { amount: 500 } });

    const res = await GET(new Request("http://test/api/admin/analytics"));
    expect(res.status).toBe(200);

    expect(prisma.creditLedger.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: { type: { in: ["subscription_grant", "topup"] } },
    });
    expect(prisma.creditTransaction.aggregate).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.totals.creditsGranted).toBe(500);
  });
});
