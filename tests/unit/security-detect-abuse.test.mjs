import { describe, it, expect, vi, beforeEach } from "vitest";

// detectAbuse's refund-volume check must read CreditLedger (via the wallet
// relation) — refunds write CreditLedger rows now (type "refund"), not
// CreditTransaction, so the old creditTransaction.count query was
// permanently zero and could never flag excessive refund abuse.

vi.mock("@/lib/prisma", () => ({
  default: {
    generation: { count: vi.fn() },
    creditLedger: { count: vi.fn() },
    creditTransaction: { count: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));

import prisma from "@/lib/prisma";
import { detectAbuse } from "@/lib/security";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generation.count.mockResolvedValue(0);
  prisma.creditLedger.count.mockResolvedValue(0);
});

describe("detectAbuse — refund volume via CreditLedger", () => {
  it("counts refunds from creditLedger scoped through the wallet relation, not creditTransaction", async () => {
    await detectAbuse("u1");

    expect(prisma.creditLedger.count).toHaveBeenCalledTimes(1);
    const [{ where }] = prisma.creditLedger.count.mock.calls[0];
    expect(where.wallet).toEqual({ userId: "u1" });
    expect(where.type).toBe("refund");
    expect(where.createdAt.gte).toBeInstanceOf(Date);

    expect(prisma.creditTransaction.count).not.toHaveBeenCalled();
  });

  it("flags excessive refund requests", async () => {
    prisma.creditLedger.count.mockResolvedValue(21);
    const result = await detectAbuse("u1");
    expect(result).toEqual({ flagged: true, reason: "Excessive refund requests" });
  });

  it("does not flag at or below the threshold", async () => {
    prisma.creditLedger.count.mockResolvedValue(20);
    const result = await detectAbuse("u1");
    expect(result).toEqual({ flagged: false });
  });
});
