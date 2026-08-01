import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    generation: { groupBy: vi.fn() },
    user: { findUnique: vi.fn() },
    modelPricing: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/wallet", () => ({
  adjustWalletTo: vi.fn(),
  sweepExpiredReservations: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { sweepExpiredReservations } from "@/lib/wallet";
import { runAutomation } from "@/lib/automation";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generation.groupBy.mockResolvedValue([]);
  sweepExpiredReservations.mockResolvedValue({ released: 2, settled: 1, skipped: 0 });
});

describe("runAutomation — reservation expiry sweep wiring (Task 9)", () => {
  it("calls sweepExpiredReservations and surfaces its result under `reservations`", async () => {
    const result = await runAutomation();
    expect(sweepExpiredReservations).toHaveBeenCalledTimes(1);
    expect(result.reservations).toEqual({ released: 2, settled: 1, skipped: 0 });
  });

  it("still returns the existing models/users automation results alongside it", async () => {
    const result = await runAutomation();
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("timestamp");
  });
});
