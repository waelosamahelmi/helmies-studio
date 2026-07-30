import prisma from "@/lib/prisma";
import { calculateCredits } from "@/lib/pricing-engine";
export { SUBSCRIPTION_CREDITS, PLAN_IDS, CREDIT_COSTS } from "@/lib/plan-constants";

export async function getCreditCost(tool, model) {
  if (model) {
    try {
      const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } });
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
