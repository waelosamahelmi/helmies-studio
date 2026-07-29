BEGIN;

ALTER TABLE "public"."ModelPricing"
  ADD COLUMN IF NOT EXISTS "providerModelId" TEXT,
  ADD COLUMN IF NOT EXISTS "endpoint" TEXT,
  ADD COLUMN IF NOT EXISTS "displayName" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "capability" TEXT,
  ADD COLUMN IF NOT EXISTS "inputModalities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "outputModalities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "inputSchema" JSONB,
  ADD COLUMN IF NOT EXISTS "constraints" JSONB,
  ADD COLUMN IF NOT EXISTS "pricingRules" JSONB,
  ADD COLUMN IF NOT EXISTS "billingUnit" TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "regions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "sourceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "catalogVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "managedBySync" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isDeprecated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "replacementModelId" TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ModelPricing_providerName_isActive_idx"
  ON "public"."ModelPricing"("providerName", "isActive");
CREATE INDEX IF NOT EXISTS "ModelPricing_capability_isActive_idx"
  ON "public"."ModelPricing"("capability", "isActive");
CREATE INDEX IF NOT EXISTS "ModelPricing_modelType_isActive_idx"
  ON "public"."ModelPricing"("modelType", "isActive");

UPDATE "public"."ModelPricing"
SET
  "providerModelId" = COALESCE("providerModelId", "modelId"),
  "endpoint" = COALESCE("endpoint", "modelId"),
  "displayName" = COALESCE("displayName", "modelId"),
  "capability" = COALESCE("capability", "modelType"),
  "pricingRules" = COALESCE(
    "pricingRules",
    jsonb_build_object(
      'currency', 'USD',
      'unit', 'fixed',
      'rules', jsonb_build_array(jsonb_build_object('price', "providerCost"))
    )
  )
WHERE "providerModelId" IS NULL
   OR "endpoint" IS NULL
   OR "displayName" IS NULL
   OR "capability" IS NULL
   OR "pricingRules" IS NULL;

COMMIT;
