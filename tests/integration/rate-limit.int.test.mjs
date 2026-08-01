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

  it("two concurrent calls at count = max-1 admit EXACTLY one (single atomic statement, no race)", async () => {
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
    expect(allowedCount).toBe(1); // EXACT — Postgres row-locking on the single INSERT ON CONFLICT statement serializes these.

    const key = expectedKey(ip, endpoint);
    const row = await prisma.anonRateLimit.findUnique({ where: { key } });
    expect(row.count).toBe(max + 1); // (max-1) sequential + 2 concurrent = max+1 total attempts recorded.
  });

  it("N concurrent calls on a brand-new key are all admitted when N <= max, and the stored count is EXACTLY N", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";
    const max = 10;
    const N = 6;

    const results = await Promise.all(
      Array.from({ length: N }, () => checkAnonLimit(ip, endpoint, { windowMs: 60000, max }))
    );

    expect(results.every((r) => r.allowed)).toBe(true);

    const key = expectedKey(ip, endpoint);
    const row = await prisma.anonRateLimit.findUnique({ where: { key } });
    expect(row.count).toBe(N);
  });

  // REGRESSION GUARD (Fix 2, review round 2): the previous multi-step
  // implementation (updateMany, then a separate findUnique, then a separate
  // upsert) let every racer in a burst independently observe "missing/stale"
  // and independently upsert a reset, so the RESULTS admitted could wildly
  // exceed max even though the STORED row.count stayed low (which is why
  // row.count-based assertions alone missed it — confirmed by running this
  // exact test against that implementation first: it admitted 24/30, not 5).
  // This test asserts on results, not the row, and is the real regression
  // guard for Fix 1's single-statement rewrite.
  it("REGRESSION: 30 concurrent calls on a brand-new key with max:5 admit EXACTLY 5", async () => {
    const { checkAnonLimit } = await import("@/lib/rate-limit");
    const ip = fakeIp();
    const endpoint = "/api/contact";
    const max = 5;

    const results = await Promise.all(
      Array.from({ length: 30 }, () => checkAnonLimit(ip, endpoint, { windowMs: 60000, max }))
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(max);
  });
});
