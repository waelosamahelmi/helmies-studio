-- Stopping a run, and clearing away the ones that failed.
--
-- hiddenAt: a failed generation is DISMISSED, never destroyed. It records
-- what went wrong and what it cost, and that is what a refund argument gets
-- settled with — provenance outlives somebody's wish for a tidy grid.
ALTER TABLE "public"."Generation" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Generation_userId_hiddenAt_idx" ON "public"."Generation"("userId", "hiddenAt");

-- cancelRequested: cooperative cancel, checked by the worker on the same
-- tick as its heartbeat. A job still queued is dropped and its reservation
-- released; one already at a provider is left to finish, because the
-- provider bills us whether or not we are still listening.
ALTER TABLE "public"."GenerationJob" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
