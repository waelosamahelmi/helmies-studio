-- EDITSv1 Phase E8 Task E8.4: promo codes stop being a table nothing reads.
--
-- PromoRedemption is what makes `maxUsesPerUser` enforceable — until now
-- there was no record of who had redeemed what, and `currentUses` was never
-- incremented by anything either. The compound unique below is the
-- enforcement mechanism: one redemption per user per code becomes true by
-- construction, so a double-submitted form loses the race inside Postgres
-- rather than granting credits twice.
--
-- Additive: no existing row is touched, and the new PromoCode column is
-- nullable.

-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN "stripeCouponId" TEXT;

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_userId_key"
    ON "PromoRedemption"("promoCodeId", "userId");

-- CreateIndex
CREATE INDEX "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey"
    FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
