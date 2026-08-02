-- Phase 6 review fix (Important 3): persist the caller's per-step input
-- overrides on TemplateRun so advanceTemplateRun executes later steps with
-- the SAME inputs quoteTemplate priced and reserveCredits reserved for —
-- previously later steps were enqueued with {} (bare graph defaults),
-- silently ignoring any caller override the user was actually charged for.
-- Additive-only, backfilled to '{}' for existing rows via the column default.

-- AlterTable
ALTER TABLE "TemplateRun" ADD COLUMN "inputs" JSONB NOT NULL DEFAULT '{}';
