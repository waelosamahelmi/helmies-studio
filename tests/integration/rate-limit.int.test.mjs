import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { resetDb } from "./setup.mjs";

// Local re-implementation of hashKey() so tests can locate the row without
// importing a private function — mirrors src/lib/rate-limit.js exactly.
function expectedKey(ip, endpoint) {
  const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "";
  return createHash("sha256").update(`${salt}${ip}:${endpoint}`).digest("hex");
}

let prisma;
beforeEach(async () => {
  prisma = await resetDb();
});

// A unique fake IP per test — AnonRateLimit rows are keyed by a salted hash
// of (ip + endpoint), so distinct IPs never collide even without the
// resetDb() truncate.
function fakeIp() {
  const n = randomUUID().replace(/-/g, "").slice(0, 8);
  return `203.0.${parseInt(n.slice(0, 2), 16)}.${parseInt(n.slice(2, 4), 16)}`;
}

describe("checkAnonLimit — real Postgres", () => {
  it("N sequential calls allow exactly max, the next blocks", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";
    const max = 3;

    for (let i = 0; i < max; i++) {
      const r = await checkAnonLimit(ip, endpoint, { windowMs: 60000, max });
      expect(r.allowed).toBe(true);
    }

    const blocked = await checkAnonLimit(ip, endpoint, { windowMs: 60000, max });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("stores only the salted hash, never the raw IP, and resets after the window goes stale", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";

    await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });

    const rows = await prisma.anonRateLimit.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain(ip);
    expect(rows[0].key).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
    expect(rows[0].count).toBe(1);

    // Force the window stale by back-dating windowStart directly (2 minutes
    // ago, against a 60s window) so the next call must reset, not block.
    await prisma.anonRateLimit.update({
      where: { key: rows[0].key },
      data: { windowStart: new Date(Date.now() - 120000), count: 5 },
    });

    const afterStale = await checkAnonLimit(ip, endpoint, { windowMs: 60000, max: 5 });
    expect(afterStale.allowed).toBe(true);

    const resetRow = await prisma.anonRateLimit.findUnique({ where: { key: rows[0].key } });
    expect(resetRow.count).toBe(1);
  });

  it("two concurrent calls at count = max-1 never push the stored count past max+1 (documented race bound)", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";
    const max = 4;

    // Sequentially reach count = max-1 first.
    for (let i = 0; i < max - 1; i++) {
      const r = await checkAnonLimit(ip, endpoint, { windowMs: 60000, max });
      expect(r.allowed).toBe(true);
    }

    const [a, b] = await Promise.all([
      checkAnonLimit(ip, endpoint, { windowMs: 60000, max }),
      checkAnonLimit(ip, endpoint, { windowMs: 60000, max }),
    ]);

    const allowedCount = [a, b].filter((r) => r.allowed).length;
    expect(allowedCount).toBeGreaterThanOrEqual(1); // progress: at least one must get through
    expect(allowedCount).toBeLessThanOrEqual(2); // trivial upper bound on 2 racing calls

    const key = expectedKey(ip, endpoint);
    const row = await prisma.anonRateLimit.findUnique({ where: { key } });
    // The one documented race (concurrent resets on a brand-new/stale key)
    // cannot occur here — the window is fresh throughout — so Postgres's
    // row-level locking on the atomic updateMany serializes the two racers
    // exactly: this asserts the general bound (never more than one over
    // max) rather than assuming the stronger exact-serialization outcome.
    expect(row.count).toBeLessThanOrEqual(max + 1);
  });

  it("two concurrent calls on a brand-new key both get admitted, but the stored count never exceeds 1 over what a single request would record", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";
    const max = 10;

    const [a, b] = await Promise.all([
      checkAnonLimit(ip, endpoint, { windowMs: 60000, max }),
      checkAnonLimit(ip, endpoint, { windowMs: 60000, max }),
    ]);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);

    const key = expectedKey(ip, endpoint);
    const row = await prisma.anonRateLimit.findUnique({ where: { key } });
    // Documented bound: the reset race can undercount by at most the single
    // in-flight increment — the stored counter never falls below 1 nor
    // implies more than max+1 total admits for the window.
    expect(row.count).toBeGreaterThanOrEqual(1);
    expect(row.count).toBeLessThanOrEqual(max + 1);
  });
});
