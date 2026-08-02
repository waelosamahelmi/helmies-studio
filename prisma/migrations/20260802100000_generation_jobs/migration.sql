-- Durable generation job queue (Phase 4A). Replaces synchronous in-request
-- provider submission with a Postgres-backed queue: enqueueJob writes a row
-- here, a worker claims it with SELECT ... FOR UPDATE SKIP LOCKED (see
-- src/lib/job-queue.js), and the runner drives it through queued -> running
-- -> succeeded/failed (or dead after maxAttempts / timeout, always with
-- credits refunded). No FK to User — like StripeEvent/AnonRateLimit, this is
-- a standalone, id-addressed table (see tests/integration/setup.mjs's
-- explicit truncate list).

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "providerRequestId" TEXT,
    "providerName" TEXT,
    "endpoint" TEXT,
    "payload" JSONB NOT NULL,
    "timeoutAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_generationId_key" ON "GenerationJob"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_idempotencyKey_key" ON "GenerationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GenerationJob_status_nextRunAt_idx" ON "GenerationJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_leaseUntil_idx" ON "GenerationJob"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "GenerationJob_timeoutAt_idx" ON "GenerationJob"("timeoutAt");
