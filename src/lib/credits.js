import prisma from "@/lib/prisma";
import { calculateCredits } from "@/lib/pricing-engine";
import { resolveModelPricingRow } from "@/lib/model-catalog-core.mjs";
export { SUBSCRIPTION_CREDITS, PLAN_IDS, CREDIT_COSTS } from "@/lib/plan-constants";

export async function getCreditCost(tool, model) {
  if (model) {
    try {
      // Tolerant of the "public" (provider-prefix-stripped) id the catalog
      // now hands back to clients — see resolveModelPricingRow's header.
      const dbPricing = await resolveModelPricingRow(prisma, model);
      if (dbPricing?.creditsCost) return dbPricing.creditsCost;
    } catch {}
  }
  const { CREDIT_COSTS: costs } = await import("@/lib/plan-constants");
  const toolCosts = costs[tool];
  return toolCosts?.default || 1;
}

export async function getLiveCreditCost(providerCost) {
  return calculateCredits(providerCost);
}
