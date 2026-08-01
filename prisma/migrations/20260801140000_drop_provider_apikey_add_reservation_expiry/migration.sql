-- Phase 3 Tasks 7 + 9 (shared migration).
--
-- Task 7: ProviderConfig.apiKey was a dead plaintext key column — runtime
-- provider keys come from env only (src/lib/providers.js reads
-- process.env.KIE_KEY / ALIBABA_KEY / OPENROUTER_KEY) and no consumer reads
-- this column (verified Phase 1). Drop it so a plaintext key can never be
-- stored here again.
--
-- Task 9: CreditReservation.expiresAt lets reserveCredits' existing
-- (previously ignored) expiresInMinutes parameter actually expire a
-- reservation, so an automated sweep can release stuck holds.

-- AlterTable
ALTER TABLE "ProviderConfig" DROP COLUMN "apiKey";

-- AlterTable
ALTER TABLE "CreditReservation" ADD COLUMN "expiresAt" TIMESTAMP(3);
