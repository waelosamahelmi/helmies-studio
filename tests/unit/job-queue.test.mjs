import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const generationJob = {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  };
  const prisma = { generationJob, $queryRaw: vi.fn() };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import {
  enqueueJob,
  claimNextJob,
  heartbeatJob,
  completeJob,
  failJob,
  reapExpiredLeases,
  findTimedOutJobs,
} from "@/lib/job-queue";

beforeEach(() => vi.clearAllMocks());

describe("enqueueJob — double-submit guard", () => {
  it("creates a new row on the happy path", async () => {
    const created = { id: "job1", generationId: "gen1", status: "queued" };
    prisma.generationJob.create.mockResolvedValue(created);

    const result = await enqueueJob({
      generationId: "gen1",
      userId: "u1",
      idempotencyKey: "idem1",
      payload: { prompt: "x" },
      providerName: "kie",
      endpoint: "/v1/generate",
    });

    expect(result).toBe(created);
    expect(prisma.generationJob.findUnique).not.toHaveBeenCalled();
    const data = prisma.generationJob.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      generationId: "gen1",
      userId: "u1",
      idempotencyKey: "idem1",
      providerName: "kie",
      endpoint: "/v1/generate",
    });
    expect(data.timeoutAt).toBeInstanceOf(Date);
  });

  it("defaults timeoutAt to 30 minutes out when timeoutMs is omitted", async () => {
    prisma.generationJob.create.mockResolvedValue({ id: "job1" });
    const before = Date.now();

    await enqueueJob({ generationId: "gen1", userId: "u1", idempotencyKey: "idem1", payload: {} });

    const after = Date.now();
    const data = prisma.generationJob.create.mock.calls[0][0].data;
    expect(data.timeoutAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60000);
    expect(data.timeoutAt.getTime()).toBeLessThanOrEqual(after + 30 * 60000);
  });

  it("returns the EXISTING job (never throws) when idempotencyKey collides — simulated P2002", async () => {
    const existing = { id: "job1", generationId: "gen1", idempotencyKey: "idem1", status: "queued" };
    prisma.generationJob.create.mockRejectedValue({ code: "P2002", meta: { target: ["idempotencyKey"] } });
    prisma.generationJob.findUnique.mockResolvedValue(existing);

    const result = await enqueueJob({
      generationId: "gen1",
      userId: "u1",
      idempotencyKey: "idem1",
      payload: { prompt: "x" },
    });

    expect(result).toBe(existing);
    expect(prisma.generationJob.findUnique.mock.calls[0][0]).toEqual({ where: { idempotencyKey: "idem1" } });
  });

  it("re-throws a P2002 on a different unique constraint (e.g. generationId) instead of swallowing it", async () => {
    prisma.generationJob.create.mockRejectedValue({ code: "P2002", meta: { target: ["generationId"] } });

    await expect(
      enqueueJob({ generationId: "gen1", userId: "u1", idempotencyKey: "idem1", payload: {} })
    ).rejects.toMatchObject({ code: "P2002" });
    expect(prisma.generationJob.findUnique).not.toHaveBeenCalled();
  });

  it("also recognizes the real Prisma 7 + adapter-pg P2002 shape (meta.driverAdapterError.cause.constraint.fields, quoted identifiers) — not just the classic meta.target array", async () => {
    const existing = { id: "job1", idempotencyKey: "idem1" };
    prisma.generationJob.create.mockRejectedValue({
      code: "P2002",
      meta: {
        modelName: "GenerationJob",
        driverAdapterError: { cause: { constraint: { fields: ['"idempotencyKey"'] } } },
      },
    });
    prisma.generationJob.findUnique.mockResolvedValue(existing);

    const result = await enqueueJob({ generationId: "gen1", userId: "u1", idempotencyKey: "idem1", payload: {} });

    expect(result).toBe(existing);
  });

  it("uses the provided db client instead of the default prisma singleton", async () => {
    const tx = { generationJob: { create: vi.fn().mockResolvedValue({ id: "job1" }) } };

    await enqueueJob({ generationId: "gen1", userId: "u1", idempotencyKey: "idem1", payload: {} }, tx);

    expect(tx.generationJob.create).toHaveBeenCalled();
    expect(prisma.generationJob.create).not.toHaveBeenCalled();
  });
});

describe("claimNextJob — single atomic SKIP LOCKED statement", () => {
  it("issues exactly one $queryRaw call using FOR UPDATE SKIP LOCKED against GenerationJob", async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await claimNextJob("worker-1", {});

    expect(result).toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const strings = prisma.$queryRaw.mock.calls[0][0];
    const sql = Array.from(strings).join(" ");
    expect(sql).toMatch(/UPDATE "GenerationJob"/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(/"status" = 'queued'/);
    expect(sql).toMatch(/RETURNING/);
  });

  it("returns the claimed row when the statement returns one", async () => {
    const row = { id: "job1", status: "running", lockedBy: "worker-1" };
    prisma.$queryRaw.mockResolvedValue([row]);

    const result = await claimNextJob("worker-1", {});

    expect(result).toEqual(row);
  });

  it("passes workerId and the computed lease expiry as bound values", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    const before = Date.now();

    await claimNextJob("worker-9", { leaseMs: 60000 });

    const after = Date.now();
    const [, workerId, leaseUntil] = prisma.$queryRaw.mock.calls[0];
    expect(workerId).toBe("worker-9");
    expect(leaseUntil).toBeInstanceOf(Date);
    expect(leaseUntil.getTime()).toBeGreaterThanOrEqual(before + 60000);
    expect(leaseUntil.getTime()).toBeLessThanOrEqual(after + 60000);
  });
});

describe("heartbeatJob — lease ownership guard", () => {
  it("returns false when the worker no longer owns the lease (updateMany matches zero rows)", async () => {
    prisma.generationJob.updateMany.mockResolvedValue({ count: 0 });

    const result = await heartbeatJob("job1", "worker-1", {});

    expect(result).toBe(false);
    const where = prisma.generationJob.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "job1", lockedBy: "worker-1" });
  });

  it("returns true and extends leaseUntil when the worker still owns the lease", async () => {
    prisma.generationJob.updateMany.mockResolvedValue({ count: 1 });
    const before = Date.now();

    const result = await heartbeatJob("job1", "worker-1", { leaseMs: 120000 });

    const after = Date.now();
    expect(result).toBe(true);
    const call = prisma.generationJob.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "job1", lockedBy: "worker-1" });
    expect(call.data.leaseUntil).toBeInstanceOf(Date);
    expect(call.data.leaseUntil.getTime()).toBeGreaterThanOrEqual(before + 120000);
    expect(call.data.leaseUntil.getTime()).toBeLessThanOrEqual(after + 120000);
  });
});

describe("completeJob", () => {
  it("marks the job succeeded, clears the lease, and stores providerRequestId", async () => {
    prisma.generationJob.update.mockResolvedValue({ id: "job1", status: "succeeded" });

    await completeJob("job1", { providerRequestId: "req_123" });

    const call = prisma.generationJob.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "job1" });
    expect(call.data).toMatchObject({
      status: "succeeded",
      leaseUntil: null,
      lockedBy: null,
      providerRequestId: "req_123",
    });
  });
});

describe("failJob — retry/dead state machine", () => {
  it("retryable under maxAttempts: goes back to queued with a future nextRunAt and willRetry:true", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", attempts: 1, maxAttempts: 3 });
    prisma.generationJob.update.mockResolvedValue({});
    const before = Date.now();

    const result = await failJob("job1", "provider 503", { retryable: true });

    const after = Date.now();
    expect(result).toEqual({ status: "queued", willRetry: true });
    const call = prisma.generationJob.update.mock.calls[0][0];
    expect(call.data.status).toBe("queued");
    expect(call.data.lastError).toBe("provider 503");
    expect(call.data.leaseUntil).toBeNull();
    expect(call.data.lockedBy).toBeNull();
    // attempts=1 -> delay = 2^1 * 30s = 60s
    expect(call.data.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + 60000);
    expect(call.data.nextRunAt.getTime()).toBeLessThanOrEqual(after + 60000);
  });

  it("caps the exponential backoff at 15 minutes", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", attempts: 10, maxAttempts: 20 });
    prisma.generationJob.update.mockResolvedValue({});
    const before = Date.now();

    await failJob("job1", "provider 503", { retryable: true });

    const after = Date.now();
    const call = prisma.generationJob.update.mock.calls[0][0];
    const cap = 15 * 60 * 1000;
    expect(call.data.nextRunAt.getTime()).toBeGreaterThanOrEqual(before + cap);
    expect(call.data.nextRunAt.getTime()).toBeLessThanOrEqual(after + cap);
  });

  it("at maxAttempts: goes dead with willRetry:false even though retryable is true", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", attempts: 3, maxAttempts: 3 });
    prisma.generationJob.update.mockResolvedValue({});

    const result = await failJob("job1", "provider 503", { retryable: true });

    expect(result).toEqual({ status: "dead", willRetry: false });
    const call = prisma.generationJob.update.mock.calls[0][0];
    expect(call.data.status).toBe("dead");
    expect(call.data.lastError).toBe("provider 503");
  });

  it("non-retryable error goes straight to dead regardless of remaining attempts", async () => {
    prisma.generationJob.findUnique.mockResolvedValue({ id: "job1", attempts: 0, maxAttempts: 3 });
    prisma.generationJob.update.mockResolvedValue({});

    const result = await failJob("job1", "400 bad request", { retryable: false });

    expect(result).toEqual({ status: "dead", willRetry: false });
  });
});

describe("reapExpiredLeases — crashed-worker recovery", () => {
  it("moves running rows with an expired lease back to queued and returns the count", async () => {
    prisma.generationJob.updateMany.mockResolvedValue({ count: 2 });

    const count = await reapExpiredLeases();

    expect(count).toBe(2);
    const call = prisma.generationJob.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe("running");
    expect(call.where.leaseUntil.lt).toBeInstanceOf(Date);
    expect(call.data).toMatchObject({ status: "queued", leaseUntil: null, lockedBy: null });
  });
});

describe("findTimedOutJobs — never touches credits", () => {
  it("returns non-terminal rows whose timeoutAt has passed", async () => {
    const rows = [{ id: "job1", status: "running", timeoutAt: new Date(0) }];
    prisma.generationJob.findMany.mockResolvedValue(rows);

    const result = await findTimedOutJobs();

    expect(result).toBe(rows);
    const call = prisma.generationJob.findMany.mock.calls[0][0];
    expect(call.where.timeoutAt.lt).toBeInstanceOf(Date);
    expect(call.where.status.notIn).toEqual(expect.arrayContaining(["succeeded", "failed", "dead"]));
  });
});
