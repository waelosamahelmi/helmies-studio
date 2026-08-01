-- Phase 3 Task 9 review fix.
--
-- 20260801140000 added CreditReservation.expiresAt as a nullable column with
-- no backfill. sweepExpiredReservations queries {status: 'active',
-- expiresAt: {lt: now}} — SQL comparisons against NULL are UNKNOWN, so any
-- reservation created before that deploy (expiresAt still NULL) is never
-- matched by that filter and stays stuck forever, not even counted.
--
-- Backfill every still-active legacy reservation to expire 30 minutes after
-- it was created — the same default reserveCredits uses for expiresInMinutes
-- (src/lib/wallet.js) — so the existing sweep can pick it up on its next run.
-- This is belt-and-suspenders: src/lib/wallet.js's sweepExpiredReservations
-- was also changed in the same fix to match NULL-expiresAt rows directly
-- (createdAt older than 30 minutes), so a legacy reservation can never be
-- permanently invisible even if this backfill were somehow missed on a given
-- database.

UPDATE "CreditReservation" SET "expiresAt" = "createdAt" + INTERVAL '30 minutes' WHERE "expiresAt" IS NULL AND "status" = 'active';
