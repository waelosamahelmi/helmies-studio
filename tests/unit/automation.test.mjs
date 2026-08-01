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
import { runAutomation, autoDisableFailingModels, autoSuspendAbusiveUsers } from "@/lib/automation";

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

// Prisma 7 hotfix: `having` aggregate filters must be scoped to the grouped
// field (e.g. `having: { model: { _count: { gte: N } } }`), not a bare
// `having: { _count: { gte: N } }`. The bare form throws
// "Unknown argument `_count`" at the live database and has meant this cron
// leg has never actually executed in production.
describe("groupBy having clause — Prisma 7 field-scoped aggregate filter", () => {
  it("autoDisableFailingModels scopes having under the `model` field it groups by", async () => {
    await autoDisableFailingModels();

    expect(prisma.generation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["model"],
        having: { model: { _count: { gte: 5 } } },
      })
    );
  });

  it("autoSuspendAbusiveUsers scopes having under the `userId` field it groups by", async () => {
    await autoSuspendAbusiveUsers();

    expect(prisma.generation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["userId"],
        having: { userId: { _count: { gte: 100 } } },
      })
    );
  });
});

// Task: runAutomation used Promise.all, so one rejecting leg discarded the
// results of the other two — this is why the reservation sweep never ran
// even after it was wired up. Promise.allSettled must isolate each leg.
describe("runAutomation — per-leg failure isolation", () => {
  it("keeps models/users intact and reports an error for reservations when only that leg rejects", async () => {
    sweepExpiredReservations.mockRejectedValueOnce(new Error("reservation sweep boom"));

    const result = await runAutomation();

    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("timestamp");
    expect(result.models).toEqual({ disabled: [], checked: 0 });
    expect(result.users).toEqual({ suspended: [], checked: 0 });
    expect(result.reservations).toEqual({ error: "reservation sweep boom" });
  });

  it("keeps users/reservations intact and reports an error for models when only that leg rejects", async () => {
    prisma.generation.groupBy.mockRejectedValueOnce(new Error("groupBy boom"));

    const result = await runAutomation();

    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result.models).toEqual({ error: "groupBy boom" });
    expect(result.users).toEqual({ suspended: [], checked: 0 });
    expect(result.reservations).toEqual({ released: 2, settled: 1, skipped: 0 });
  });
});
