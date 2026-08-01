-- Durable, hash-keyed anonymous rate limiting (Phase 3 Task 4). Replaces the
-- in-process anonBuckets Map (src/lib/security.js) and the register route's
-- local `attempts` Map, neither of which survive a restart or work across
-- multiple instances. "key" is sha256(salt + ip + ":" + endpoint) — raw
-- client IPs are never persisted (privacy per contract §4.4).

-- CreateTable
CREATE TABLE "AnonRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonRateLimit_pkey" PRIMARY KEY ("key")
);
