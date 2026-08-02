import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
});

async function enqueueFive(enqueueJob) {
  const jobs = [];
  for (let i = 0; i < 5; i++) {
    const generationId = `gen-${randomUUID()}`;
    jobs.push(
      await enqueueJob({
        generationId,
        userId: `user-${randomUUID()}`,
        idempotencyKey: `idem-${randomUUID()}`,
        payload: { prompt: `job ${i}` },
        providerName: "kie",
        endpoint: "/v1/generate",
      })
    );
  }
  return jobs;
}

describe("claimNextJob — real Postgres SKIP LOCKED concurrency", () => {
  it("never hands the same job to two workers: 20 concurrent claims on 5 jobs -> exactly 5 distinct claims", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    await enqueueFive(enqueueJob);

    // 20 concurrent claimNextJob calls chasing only 5 claimable jobs. Assert
    // on the CLAIM RESULTS returned to each caller, never on a stored
    // counter — the Phase 3 rate-limit bug (src/lib/rate-limit.js's header)
    // hid exactly there: a stored count can look correct even when the
    // multi-step logic that produced it let extra callers through.
    const claims = await Promise.all(
      Array.from({ length: 20 }, (_, i) => claimNextJob(`worker-${i}`, {}))
    );

    const got = claims.filter(Boolean);
    expect(got).toHaveLength(5); // no over-claim: exactly the 5 enqueued jobs, not more
    expect(new Set(got.map((j) => j.id)).size).toBe(5); // no duplicate ids: no two workers got the same row
    expect(claims.filter((c) => c === null)).toHaveLength(15); // the other 15 callers correctly got nothing

    // Every claimed row is fully transitioned: running, leased, owned by the
    // worker that received it, attempts incremented exactly once.
    for (const job of got) {
      expect(job.status).toBe("running");
      expect(job.leaseUntil).not.toBeNull();
      expect(job.attempts).toBe(1);
    }
    const lockedByValues = new Set(got.map((j) => j.lockedBy));
    expect(lockedByValues.size).toBe(5); // each claimed job locked by a distinct worker

    // Independently confirm against the database: exactly 5 rows are
    // running, none are still queued.
    const running = await prisma.generationJob.findMany({ where: { status: "running" } });
    const queued = await prisma.generationJob.findMany({ where: { status: "queued" } });
    expect(running).toHaveLength(5);
    expect(queued).toHaveLength(0);
  });

  it("a job with a future nextRunAt is not claimable yet", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    const job = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
    });
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { nextRunAt: new Date(Date.now() + 60000) },
    });

    const claimed = await claimNextJob("worker-1", {});
    expect(claimed).toBeNull();
  });

  it("claims in nextRunAt order (oldest-due first)", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    const later = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
    });
    const earlier = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
    });
    const now = new Date();
    await prisma.generationJob.update({ where: { id: later.id }, data: { nextRunAt: new Date(now.getTime() + 5000) } });
    await prisma.generationJob.update({ where: { id: earlier.id }, data: { nextRunAt: new Date(now.getTime() - 5000) } });

    const claimed = await claimNextJob("worker-1", {});
    expect(claimed.id).toBe(earlier.id);
  });
});

describe("enqueueJob — real Postgres double-submit guard", () => {
  it("a duplicate idempotencyKey returns the same existing row instead of throwing", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const idempotencyKey = `idem-${randomUUID()}`;
    const first = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey,
      payload: { prompt: "first" },
    });

    const second = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey,
      payload: { prompt: "second, should be ignored" },
    });

    expect(second.id).toBe(first.id);
    const rows = await prisma.generationJob.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(1);
  });

  it("20 concurrent enqueues with the same idempotencyKey all resolve to the same single row", async () => {
    const { enqueueJob } = await import("@/lib/job-queue");
    const idempotencyKey = `idem-${randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        enqueueJob({
          generationId: `gen-${randomUUID()}`,
          userId: `user-${randomUUID()}`,
          idempotencyKey,
          payload: { prompt: `attempt ${i}` },
        })
      )
    );

    const distinctIds = new Set(results.map((r) => r.id));
    expect(distinctIds.size).toBe(1);

    const rows = await prisma.generationJob.findMany({ where: { idempotencyKey } });
    expect(rows).toHaveLength(1);
  });
});

describe("failJob / reapExpiredLeases / findTimedOutJobs — real Postgres", () => {
  it("failJob retryable under maxAttempts requeues, then a second failure at maxAttempts goes dead", async () => {
    const { enqueueJob, claimNextJob, failJob } = await import("@/lib/job-queue");
    await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutMs: 60000,
    });
    // maxAttempts defaults to 3.
    const claim1 = await claimNextJob("worker-1", {});
    const r1 = await failJob(claim1.id, "timeout", { retryable: true });
    expect(r1).toEqual({ status: "queued", willRetry: true });

    await prisma.generationJob.update({ where: { id: claim1.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    const claim2 = await claimNextJob("worker-2", {});
    expect(claim2.id).toBe(claim1.id);
    expect(claim2.attempts).toBe(2);

    const r2 = await failJob(claim2.id, "timeout again", { retryable: true });
    expect(r2).toEqual({ status: "queued", willRetry: true });

    await prisma.generationJob.update({ where: { id: claim1.id }, data: { nextRunAt: new Date(Date.now() - 1000) } });
    const claim3 = await claimNextJob("worker-3", {});
    expect(claim3.attempts).toBe(3);

    const r3 = await failJob(claim3.id, "final timeout", { retryable: true });
    expect(r3).toEqual({ status: "dead", willRetry: false });

    const finalRow = await prisma.generationJob.findUnique({ where: { id: claim1.id } });
    expect(finalRow.status).toBe("dead");
  });

  it("reapExpiredLeases requeues a running job whose lease expired, and it becomes claimable again", async () => {
    const { enqueueJob, claimNextJob, reapExpiredLeases } = await import("@/lib/job-queue");
    await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
    });
    const claimed = await claimNextJob("worker-crash", { leaseMs: 1 });
    // Force the lease into the past directly (don't wait on the clock).
    await prisma.generationJob.update({ where: { id: claimed.id }, data: { leaseUntil: new Date(Date.now() - 1000) } });

    const count = await reapExpiredLeases();
    expect(count).toBe(1);

    const row = await prisma.generationJob.findUnique({ where: { id: claimed.id } });
    expect(row.status).toBe("queued");
    expect(row.lockedBy).toBeNull();
    expect(row.leaseUntil).toBeNull();

    const reclaimed = await claimNextJob("worker-new", {});
    expect(reclaimed.id).toBe(claimed.id);
  });

  it("findTimedOutJobs returns a non-terminal job past its timeoutAt, and excludes terminal ones", async () => {
    const { enqueueJob, completeJob, findTimedOutJobs } = await import("@/lib/job-queue");
    const timedOut = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutMs: -1000, // already in the past
    });
    const succeeded = await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId: `user-${randomUUID()}`,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: {},
      timeoutMs: -1000,
    });
    await completeJob(succeeded.id, {});

    const rows = await findTimedOutJobs();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(timedOut.id);
    expect(ids).not.toContain(succeeded.id);
  });
});
