import { describe, it, expect, vi, beforeEach } from "vitest";

// pruneTerminalJobs (src/lib/job-queue.js, Phase 4B Task 4) — retention sweep
// for already-terminal GenerationJob rows. Mirrors tests/unit/job-queue.test.mjs's
// mock shape.
vi.mock("@/lib/prisma", () => {
  const generationJob = { deleteMany: vi.fn() };
  const generation = { groupBy: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  const modelPricing = { findUnique: vi.fn(), update: vi.fn() };
  const auditLog = { create: vi.fn() };
  return { default: { generationJob, generation, user, modelPricing, auditLog } };
});

vi.mock("@/lib/wallet", () => ({
  adjustWalletTo: vi.fn(),
  sweepExpiredReservations: vi.fn(),
  settleReservation: vi.fn(),
  releaseReservation: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("@/lib/providers", () => ({
  submitOnly: vi.fn(),
  pollProviderResult: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock("@/lib/storage/ingest", () => ({
  ingestFromUrl: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { pruneTerminalJobs } from "@/lib/job-queue";
import { sweepExpiredReservations } from "@/lib/wallet";
import { runAutomation } from "@/lib/automation";

beforeEach(() => vi.clearAllMocks());

describe("pruneTerminalJobs — retention sweep for terminal GenerationJob rows", () => {
  it("deletes only succeeded/failed/dead rows past the cutoff, defaulting olderThanDays to 30", async () => {
    prisma.generationJob.deleteMany.mockResolvedValue({ count: 3 });
    const before = Date.now();

    const result = await pruneTerminalJobs();

    const after = Date.now();
    expect(result).toEqual({ deleted: 3 });
    const call = prisma.generationJob.deleteMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ in: expect.arrayContaining(["succeeded", "failed", "dead"]) });
    expect(call.where.status.in).toHaveLength(3);
    const cutoff = call.where.updatedAt.lt;
    expect(cutoff).toBeInstanceOf(Date);
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - THIRTY_DAYS_MS - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - THIRTY_DAYS_MS + 1000);
  });

  it("never includes queued or running in the status filter — a non-terminal row is never a candidate regardless of age", async () => {
    prisma.generationJob.deleteMany.mockResolvedValue({ count: 0 });

    await pruneTerminalJobs({ olderThanDays: 1 });

    const call = prisma.generationJob.deleteMany.mock.calls[0][0];
    expect(call.where.status.in).not.toContain("queued");
    expect(call.where.status.in).not.toContain("running");
  });

  it("honors a custom olderThanDays cutoff", async () => {
    prisma.generationJob.deleteMany.mockResolvedValue({ count: 0 });
    const before = Date.now();

    await pruneTerminalJobs({ olderThanDays: 7 });

    const after = Date.now();
    const cutoff = prisma.generationJob.deleteMany.mock.calls[0][0].where.updatedAt.lt;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - SEVEN_DAYS_MS - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - SEVEN_DAYS_MS + 1000);
  });

  it("returns { deleted: 0 } when nothing matches", async () => {
    prisma.generationJob.deleteMany.mockResolvedValue({ count: 0 });

    const result = await pruneTerminalJobs({ olderThanDays: 90 });

    expect(result).toEqual({ deleted: 0 });
  });
});

describe("runAutomation — retention is the fifth leg, isolated like every other leg", () => {
  beforeEach(() => {
    prisma.generation.groupBy.mockResolvedValue([]);
    prisma.generation.findUnique.mockResolvedValue(null);
    sweepExpiredReservations.mockResolvedValue({ released: 0, settled: 0, skipped: 0 });
    prisma.generationJob.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("returns all five legs, surfacing pruneTerminalJobs's result under `retention`", async () => {
    const result = await runAutomation();

    expect(result.retention).toEqual({ deleted: 2 });
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("jobs");
    expect(result).toHaveProperty("timestamp");
  });

  it("isolates a rejecting retention leg — the other four legs are untouched", async () => {
    prisma.generationJob.deleteMany.mockRejectedValueOnce(new Error("retention sweep boom"));

    const result = await runAutomation();

    expect(result.retention).toEqual({ error: "retention sweep boom" });
    expect(result).toHaveProperty("models");
    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("reservations");
    expect(result).toHaveProperty("jobs");
  });

  it("keeps retention intact when a DIFFERENT leg rejects", async () => {
    sweepExpiredReservations.mockRejectedValueOnce(new Error("reservation sweep boom"));

    const result = await runAutomation();

    expect(result.reservations).toEqual({ error: "reservation sweep boom" });
    expect(result.retention).toEqual({ deleted: 2 });
  });
});
