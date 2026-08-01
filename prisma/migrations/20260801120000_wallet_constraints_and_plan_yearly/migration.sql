-- SubscriptionPlan: yearly Stripe price
ALTER TABLE "public"."SubscriptionPlan" ADD COLUMN "stripePriceIdYearly" TEXT;

-- Wallet balances can never go negative (defense-in-depth behind the
-- conditional updates in src/lib/wallet.js)
ALTER TABLE "public"."CreditWallet" ADD CONSTRAINT "CreditWallet_available_nonnegative" CHECK ("available" >= 0);
ALTER TABLE "public"."CreditWallet" ADD CONSTRAINT "CreditWallet_reserved_nonnegative" CHECK ("reserved" >= 0);
