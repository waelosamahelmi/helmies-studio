import crypto from "crypto";
import prisma from "@/lib/prisma";

/**
 * Durable, hashed-IP anonymous rate limiter (Phase 3 Task 4).
 *
 * Replaces two in-process limiters that didn't survive a restart and don't
 * work across multiple PM2 instances: src/lib/security.js's old `anonBuckets`
 * Map and the register route's old local `attempts` Map.
 *
 * Key: sha256((RATE_LIMIT_SALT || NEXTAUTH_SECRET) + ip + ":" + endpoint).
 * Raw client IPs are never persisted — only the salted hash is written to
 * the AnonRateLimit table (privacy per contract §4.4). Set RATE_LIMIT_SALT
 * in production; NEXTAUTH_SECRET is only a fallback so this keeps working
 * if it's unset.
 *
 * Algorithm: ONE atomic statement handles first-touch, mid-window increment,
 * and stale-window reset in a single round trip —
 *   `INSERT ... ON CONFLICT ("key") DO UPDATE ... RETURNING "count", "windowStart"`.
 *   - No existing row: the INSERT branch runs, count starts at 1.
 *   - Existing row, window stale (windowStart < cutoff): the CASE resets
 *     count to 1 and windowStart to now.
 *   - Existing row, window fresh: the CASE increments count and leaves
 *     windowStart alone.
 * `allowed = returned count <= max`; otherwise blocked, with retryAfter
 * computed from the returned windowStart. There is no separate "blocked"
 * read — the same statement that decides always also returns the value the
 * decision is based on, so there's nothing left to go stale between a check
 * and a response.
 *
 * Guarantee: EXACT — never more than `max` admitted per window. Not a bound,
 * an invariant. `INSERT ... ON CONFLICT DO UPDATE` runs as a single atomic
 * statement under Postgres row-level locking: concurrent callers targeting
 * the same key serialize on that row (the second waits for the first's lock
 * to release, then its CASE expressions evaluate against the
 * already-written row) — there is no read-then-write gap for two racers to
 * both observe "missing" or "stale" and both reset.
 *
 * This replaced an earlier three-step version (try an `updateMany`, then on
 * a miss separately `findUnique`, then separately `upsert` a reset) that had
 * exactly that gap: every racer in a burst could independently observe
 * "missing/stale" via its own `findUnique` and independently upsert its own
 * reset, all believing they were first. Proven empirically: 30 concurrent
 * calls against a brand-new key with `max: 5` admitted 24–27, not 5 (see
 * tests/integration/rate-limit.int.test.mjs's REGRESSION case). The stored
 * `count` stayed low throughout (upserts kept resetting it to 1), which is
 * why row-count-based assertions didn't catch it — only asserting on how
 * many *results* came back `allowed: true` does.
 */
export async function checkAnonLimit(ip, endpoint, { windowMs, max }) {
  const key = hashKey(ip, endpoint);
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);

  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO "AnonRateLimit" ("key", "count", "windowStart")
     VALUES ($1, 1, $2)
     ON CONFLICT ("key") DO UPDATE
     SET "count" = CASE WHEN "AnonRateLimit"."windowStart" < $3 THEN 1 ELSE "AnonRateLimit"."count" + 1 END,
         "windowStart" = CASE WHEN "AnonRateLimit"."windowStart" < $3 THEN $2 ELSE "AnonRateLimit"."windowStart" END
     RETURNING "count", "windowStart"`,
    key,
    now,
    cutoff,
  );

  const row = rows[0];
  const count = Number(row.count);

  if (count <= max) {
    return { allowed: true };
  }

  const windowStart = row.windowStart instanceof Date ? row.windowStart : new Date(row.windowStart);
  const retryAfter = Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000);
  return { allowed: false, retryAfter };
}

function hashKey(ip, endpoint) {
  const salt = process.env.RATE_LIMIT_SALT || process.env.NEXTAUTH_SECRET || "";
  return crypto.createHash("sha256").update(`${salt}${ip}:${endpoint}`).digest("hex");
}

// Prefer x-real-ip (nginx sets it on this deployment and it can't be spoofed
// by the client the way x-forwarded-for's leftmost hop can be, by prepending
// entries — the Phase 2 review's header-rotation note). Fall back to the
// first x-forwarded-for hop, then "unknown".
export function clientIp(req) {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}
