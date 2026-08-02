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
// Phase 8 Task A2's 6th leg — mocked explicitly so its wiring (and failure
// isolation) is tested directly, rather than relying on the incidental
// TypeErrors an unmocked collectMetrics() would throw against the partial
// prisma mock above (which is what job-runner/job-queue's unmocked legs
// already silently depend on in this file — see "still returns the
// existing models/users..." below, unchanged).
vi.mock("@/lib/metrics", () => ({ collectMetrics: vi.fn() }));
vi.mock("@/lib/alerts", () => ({
  evaluateAlerts: vi.fn(),
  filterDueAlerts: vi.fn(),
  deliverAlerts: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { sweepExpiredReservations } from "@/lib/wallet";
import { collectMetrics } from "@/lib/metrics";
import { evaluateAlerts, filterDueAlerts, deliverAlerts } from "@/lib/alerts";
import { runAutomation, autoDisableFailingModels, autoSuspendAbusiveUsers } from "@/lib/automation";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.generation.groupBy.mockResolvedValue([]);
  sweepExpiredReservations.mockResolvedValue({ released: 2, settled: 1, skipped: 0 });
  collectMetrics.mockResolvedValue({ jobs: {}, generations: {}, reconciliation: {}, providers: [], webhooks: {} });
  evaluateAlerts.mockReturnValue([]);
  filterDueAlerts.mockResolvedValue([]);
  deliverAlerts.mockResolvedValue({ delivered: false, count: 0 });
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

// Phase 8 Task A2 — the 6th leg: alert evaluation/delivery reuses Phase 7's
// collectMetrics() and follows the SAME Promise.allSettled isolation as
// every leg above it.
describe("runAutomation — alerts leg (Task A2)", () => {
  it("calls collectMetrics once and wires its result through evaluateAlerts -> filterDueAlerts -> deliverAlerts", async () => {
    const metrics = { jobs: { oldestQueuedAgeSec: 999 }, generations: {}, reconciliation: {}, providers: [], webhooks: {} };
    const rawAlerts = [{ key: "worker_liveness", severity: "critical" }];
    const dueAlerts = [{ key: "worker_liveness", severity: "critical" }];
    collectMetrics.mockResolvedValue(metrics);
    evaluateAlerts.mockReturnValue(rawAlerts);
    filterDueAlerts.mockResolvedValue(dueAlerts);
    deliverAlerts.mockResolvedValue({ delivered: true, count: 1 });

    const result = await runAutomation();

    expect(collectMetrics).toHaveBeenCalledTimes(1);
    expect(evaluateAlerts).toHaveBeenCalledWith(metrics);
    expect(filterDueAlerts).toHaveBeenCalledWith(rawAlerts);
    expect(deliverAlerts).toHaveBeenCalledWith(dueAlerts);
    expect(result.alerts).toEqual({ evaluated: 1, fired: 1, delivery: { delivered: true, count: 1 } });
  });

  it("a rejecting alerts leg (e.g. collectMetrics throws) never blocks or masks the other five legs", async () => {
    collectMetrics.mockRejectedValueOnce(new Error("metrics boom"));

    const result = await runAutomation();

    expect(result.alerts).toEqual({ error: "metrics boom" });
    expect(result.models).toEqual({ disabled: [], checked: 0 });
    expect(result.users).toEqual({ suspended: [], checked: 0 });
    expect(result.reservations).toEqual({ released: 2, settled: 1, skipped: 0 });
  });

  it("a rejecting models leg never blocks the alerts leg from still running", async () => {
    prisma.generation.groupBy.mockRejectedValueOnce(new Error("groupBy boom"));
    deliverAlerts.mockResolvedValue({ delivered: false, count: 0 });

    const result = await runAutomation();

    expect(result.models).toEqual({ error: "groupBy boom" });
    expect(result.alerts).toEqual({ evaluated: 0, fired: 0, delivery: { delivered: false, count: 0 } });
  });
});
