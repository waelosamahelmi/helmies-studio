import { describe, it, expect, vi, beforeEach } from "vitest";

// src/lib/metrics.js's collectMetrics() — pure aggregation math against a
// fully mocked prisma + reconciliation module. Real seeded-row aggregation
// is covered by tests/integration/metrics.int.test.mjs (real Postgres);
// this file exercises the arithmetic (zero-division, cents conversion,
// oldestQueuedAgeSec null-vs-set, provider attempts/failures merge) and the
// route's admin gate, both of which don't need a real database.

const reconcileAllMock = vi.fn();
vi.mock("@/lib/reconciliation", () => ({
  reconcileAll: (...args) => reconcileAllMock(...args),
}));

async function* emptyReconcile() {}

const prismaMock = {
  generation: { count: vi.fn() },
  generationJob: { count: vi.fn(), findFirst: vi.fn(), groupBy: vi.fn() },
  creditLedger: { findMany: vi.fn() },
  stripeEvent: { count: vi.fn() },
  user: { count: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
  reconcileAllMock.mockReturnValue(emptyReconcile());
  prismaMock.generation.count.mockResolvedValue(0);
  prismaMock.generationJob.count.mockResolvedValue(0);
  prismaMock.generationJob.findFirst.mockResolvedValue(null);
  prismaMock.generationJob.groupBy.mockResolvedValue([]);
  prismaMock.creditLedger.findMany.mockResolvedValue([]);
  prismaMock.stripeEvent.count.mockResolvedValue(0);
  prismaMock.user.count.mockResolvedValue(0);
});

describe("collectMetrics — generations.successRate", () => {
  it("is 0, not NaN/Infinity, when there are zero generations in the window", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    prismaMock.generation.count.mockResolvedValue(0);

    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.generations.total).toBe(0);
    expect(metrics.generations.successRate).toBe(0);
  });

  it("computes a percentage rounded to one decimal when generations exist", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    // count() is called in order: total, succeeded, failed
    prismaMock.generation.count
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(2) // succeeded
      .mockResolvedValueOnce(1); // failed

    const metrics = await collectMetrics({ sinceHours: 24 });
    expect(metrics.generations).toEqual({ total: 3, succeeded: 2, failed: 1, successRate: 66.7 });
  });
});

describe("collectMetrics — jobs.oldestQueuedAgeSec (worker-liveness signal)", () => {
  it("is null when nothing is queued", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    prismaMock.generationJob.findFirst.mockResolvedValue(null);

    const metrics = await collectMetrics({});
    expect(metrics.jobs.oldestQueuedAgeSec).toBeNull();
  });

  it("grows with the age of a stale queued job's nextRunAt", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    const staleSince = new Date(Date.now() - 90_000); // 90s ago
    prismaMock.generationJob.findFirst.mockResolvedValue({ nextRunAt: staleSince });

    const metrics = await collectMetrics({});
    expect(metrics.jobs.oldestQueuedAgeSec).toBeGreaterThanOrEqual(89);
    expect(metrics.jobs.oldestQueuedAgeSec).toBeLessThanOrEqual(95);
  });
});

describe("collectMetrics — credits and revenue arithmetic", () => {
  it("sums grant/spend/refund ledger rows and converts topup/subscription credits to cents", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    // findMany call order in the Promise.all: granted, spent(generation), refunded, topup, subscription
    prismaMock.creditLedger.findMany
      .mockResolvedValueOnce([{ amount: 100 }, { amount: 50 }]) // granted (signup/topup/subscription_grant/promo)
      .mockResolvedValueOnce([{ amount: -30 }, { amount: -20 }]) // spent — "generation" rows are negative
      .mockResolvedValueOnce([{ amount: 15 }]) // refunded
      .mockResolvedValueOnce([{ amount: 40 }]) // topup only
      .mockResolvedValueOnce([{ amount: 10 }]); // subscription_grant only

    const metrics = await collectMetrics({});
    expect(metrics.credits).toEqual({ granted: 150, spent: 50, refunded: 15 });
    // CREDIT_TO_EUR = 0.01 -> *100 = 1 cent per credit exactly.
    expect(metrics.revenue).toEqual({ topupCents: 40, subscriptionCents: 10 });
  });
});

describe("collectMetrics — providers merges attempts and failures per provider", () => {
  it("reports 0 failures for a provider with attempts but no dead jobs", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    prismaMock.generationJob.groupBy
      .mockResolvedValueOnce([
        { providerName: "kie", _sum: { attempts: 12 } },
        { providerName: "alibaba", _sum: { attempts: 3 } },
      ])
      .mockResolvedValueOnce([{ providerName: "alibaba", _count: { _all: 2 } }]);

    const metrics = await collectMetrics({});
    expect(metrics.providers).toEqual([
      { name: "kie", attempts: 12, failures: 0 },
      { name: "alibaba", attempts: 3, failures: 2 },
    ]);
  });
});

describe("collectMetrics — reconciliation reuses src/lib/reconciliation.js's reconcileAll", () => {
  it("counts walletsChecked and drifted from the real reconcileWallet reports", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    async function* threeWallets() {
      yield { ok: true };
      yield { ok: false };
      yield { ok: true };
    }
    reconcileAllMock.mockReturnValue(threeWallets());

    const metrics = await collectMetrics({});
    expect(metrics.reconciliation).toEqual({ walletsChecked: 3, drifted: 1 });
  });
});

describe("collectMetrics — webhooks and users", () => {
  it("passes through stripeEvent and user counts for the window", async () => {
    const { collectMetrics } = await import("@/lib/metrics");
    prismaMock.stripeEvent.count.mockResolvedValue(7);
    prismaMock.user.count.mockResolvedValue(4);

    const metrics = await collectMetrics({});
    expect(metrics.webhooks).toEqual({ stripeEventsProcessed: 7 });
    expect(metrics.users).toEqual({ signups: 4 });
  });
});

describe("GET /api/admin/metrics — admin gate", () => {
  it("a non-admin caller gets 403, never the metrics payload", async () => {
    vi.resetModules();
    vi.doMock("@/lib/authz", () => ({
      requireAdminUser: vi.fn().mockRejectedValue(
        Object.assign(new Error("Forbidden"), { status: 403, publicMessage: "Forbidden" })
      ),
      authzResponse: (e) =>
        Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
    }));
    vi.doMock("@/lib/metrics", () => ({ collectMetrics: vi.fn() }));

    const { GET } = await import("@/app/api/admin/metrics/route.js");
    const { collectMetrics } = await import("@/lib/metrics");

    const res = await GET(new Request("http://test/api/admin/metrics"));
    expect(res.status).toBe(403);
    expect(collectMetrics).not.toHaveBeenCalled();
  });

  it("an admin caller gets 200 with collectMetrics' payload", async () => {
    vi.resetModules();
    const payload = { generations: { total: 0, succeeded: 0, failed: 0, successRate: 0 } };
    vi.doMock("@/lib/authz", () => ({
      requireAdminUser: vi.fn().mockResolvedValue({ id: "admin1" }),
      authzResponse: (e) =>
        Response.json({ error: e?.publicMessage ?? "Internal error" }, { status: e?.status ?? 500 }),
    }));
    vi.doMock("@/lib/metrics", () => ({ collectMetrics: vi.fn().mockResolvedValue(payload) }));

    const { GET } = await import("@/app/api/admin/metrics/route.js");
    const res = await GET(new Request("http://test/api/admin/metrics"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(payload);
  });
});
