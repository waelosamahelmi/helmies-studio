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
 * Algorithm (increment-first, atomic):
 *   1. Try `updateMany({ where: { key, windowStart: { gte: cutoff },
 *      count: { lt: max } }, data: { count: { increment: 1 } } })`.
 *      If it matches a row (count === 1 returned by updateMany), the
 *      increment landed atomically — allowed.
 *   2. Otherwise nothing matched: either the key has never been seen, the
 *      window has gone stale, or the window is fresh and already at max.
 *      Read the row to tell which:
 *        - Missing or stale (windowStart < cutoff) -> upsert a reset
 *          (count: 1, windowStart: now) -> allowed.
 *        - Fresh and count >= max -> blocked, with retryAfter computed
 *          from windowStart + windowMs.
 *
 * Race bound: Postgres evaluates UPDATE ... WHERE under row-level locking,
 * so two concurrent updateMany calls against the SAME existing row can never
 * both succeed when doing so would push count past max — the second call
 * waits for the first's lock, then re-evaluates `count < max` against the
 * already-incremented row and finds it false. The one real race is on reset:
 * if two callers land in step 2 at once for a brand-new key (or right as a
 * window goes stale), both may see "missing/stale" and both upsert a reset.
 * Postgres serializes the two `ON CONFLICT (key) DO UPDATE` statements, so
 * the stored row still ends at count: 1, but both callers get
 * `allowed: true`. This is the only window where the algorithm can admit a
 * request beyond what a fully serialized version would — and it can only
 * ever admit ONE extra request beyond `max` per window, never more, because
 * every other path (the atomic increment, and blocking once fresh+at-max)
 * is race-free.
 */
export async function checkAnonLimit(ip, endpoint, { windowMs, max }) {
  const key = hashKey(ip, endpoint);
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);

  const inc = await prisma.anonRateLimit.updateMany({
    where: { key, windowStart: { gte: cutoff }, count: { lt: max } },
    data: { count: { increment: 1 } },
  });

  if (inc.count === 1) {
    return { allowed: true };
  }

  const existing = await prisma.anonRateLimit.findUnique({ where: { key } });

  if (!existing || existing.windowStart < cutoff) {
    await prisma.anonRateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
    return { allowed: true };
  }

  const retryAfter = Math.ceil((existing.windowStart.getTime() + windowMs - now.getTime()) / 1000);
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
