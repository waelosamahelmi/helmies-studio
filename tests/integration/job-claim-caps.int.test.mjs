import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./setup.mjs";

/* B1.4 — one user cannot take the whole queue, and one provider cannot be
   hammered. Both caps live INSIDE the claim statement, so these tests go
   through claimNextJob against real Postgres: a cap checked outside the
   statement is a race two workers would both win, and only the database can
   prove it holds. */

beforeEach(async () => { await resetDb(); });

async function enqueue(enqueueJob, { userId, providerName = "kie", n = 1 }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await enqueueJob({
      generationId: `gen-${randomUUID()}`,
      userId,
      idempotencyKey: `idem-${randomUUID()}`,
      payload: { prompt: `job ${i}` },
      providerName,
      endpoint: "/v1/generate",
    }));
  }
  return out;
}

const claimAll = async (claimNextJob, { userCap, providerCap } = {}) => {
  const got = [];
  for (let i = 0; i < 40; i++) {
    const job = await claimNextJob(`worker-${i}`, { ...(userCap ? { userCap } : {}), ...(providerCap ? { providerCap } : {}) });
    if (!job) break;
    got.push(job);
  }
  return got;
};

describe("claimNextJob — per-user concurrency cap", () => {
  it("stops one user's film from taking every worker", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    const hog = `user-${randomUUID()}`;
    await enqueue(enqueueJob, { userId: hog, n: 10 });

    const claimed = await claimAll(claimNextJob, { userCap: 3 });
    expect(claimed).toHaveLength(3);
    expect(new Set(claimed.map((j) => j.userId))).toEqual(new Set([hog]));

    // The rest are untouched, not failed — a cap is a delay, never a drop.
    const stillQueued = await (await import("@/lib/prisma")).default.generationJob.count({ where: { status: "queued" } });
    expect(stillQueued).toBe(7);
  });

  it("lets the next user through instead of making them wait behind it", async () => {
    // This is the whole point. Before the cap, ORDER BY nextRunAt meant the
    // person who enqueued one image waited for somebody else's 130-shot film.
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    const hog = `user-${randomUUID()}`;
    const other = `user-${randomUUID()}`;
    await enqueue(enqueueJob, { userId: hog, n: 8 });
    await enqueue(enqueueJob, { userId: other, n: 1 });

    const claimed = await claimAll(claimNextJob, { userCap: 2 });
    const byUser = claimed.map((j) => j.userId);
    expect(byUser.filter((u) => u === hog)).toHaveLength(2);
    expect(byUser.filter((u) => u === other)).toHaveLength(1);
  });

  it("releases the next job as soon as one finishes", async () => {
    const { enqueueJob, claimNextJob, completeJob } = await import("@/lib/job-queue");
    const user = `user-${randomUUID()}`;
    await enqueue(enqueueJob, { userId: user, n: 4 });

    const first = await claimAll(claimNextJob, { userCap: 2 });
    expect(first).toHaveLength(2);

    await completeJob(first[0].id, {});
    const next = await claimNextJob("worker-later", { userCap: 2 });
    expect(next).not.toBeNull();
    expect(next.userId).toBe(user);
  });
});

describe("claimNextJob — per-provider concurrency cap", () => {
  it("holds a provider at its ceiling however many users are pushing", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    for (let i = 0; i < 6; i++) {
      await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, providerName: "kie", n: 1 });
    }
    const claimed = await claimAll(claimNextJob, { userCap: 10, providerCap: 2 });
    expect(claimed).toHaveLength(2);
  });

  it("does not let one provider's ceiling block a different provider", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, providerName: "kie", n: 4 });
    await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, providerName: "openrouter", n: 2 });

    const claimed = await claimAll(claimNextJob, { userCap: 10, providerCap: 2 });
    const byProvider = claimed.map((j) => j.providerName);
    expect(byProvider.filter((p) => p === "kie")).toHaveLength(2);
    expect(byProvider.filter((p) => p === "openrouter")).toHaveLength(2);
  });

  it("never blocks a job that names no provider", async () => {
    // Internal steps (assembly, title, export) carry providerName null and
    // must not be gated by somebody else's provider being busy.
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, providerName: "kie", n: 3 });
    await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, providerName: null, n: 2 });

    const claimed = await claimAll(claimNextJob, { userCap: 10, providerCap: 1 });
    expect(claimed.filter((j) => j.providerName === "kie")).toHaveLength(1);
    expect(claimed.filter((j) => j.providerName === null)).toHaveLength(2);
  });
});

describe("claimNextJob — the caps do not break what already worked", () => {
  it("still never hands one job to two workers", async () => {
    const { enqueueJob, claimNextJob } = await import("@/lib/job-queue");
    for (let i = 0; i < 5; i++) await enqueue(enqueueJob, { userId: `user-${randomUUID()}`, n: 1 });

    const claims = await Promise.all(Array.from({ length: 20 }, (_, i) => claimNextJob(`w-${i}`, {})));
    const got = claims.filter(Boolean);
    expect(got).toHaveLength(5);
    expect(new Set(got.map((j) => j.id)).size).toBe(5);
  });
});
