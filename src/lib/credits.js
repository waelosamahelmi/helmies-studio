import prisma from "@/lib/prisma";
import { calculateCredits } from "@/lib/pricing-engine";

export const CREDIT_COSTS = {
  image: { default: 2 },
  i2i: { default: 3 },
  video: { default: 10 },
  i2v: { default: 12 },
  v2v: { default: 8 },
  lipsync: { default: 8 },
  audio: { default: 5 },
  recast: { default: 12 },
  cinema: { default: 4 },
  motion: { default: 8 },
  clipping: { default: 6 },
  marketing: { default: 15 },
  influencer: { default: 3 },
};

export async function getCreditCost(tool, model) {
  if (model) {
    try {
      const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } });
      if (dbPricing?.creditsCost) return dbPricing.creditsCost;
    } catch {}
  }
  const toolCosts = CREDIT_COSTS[tool];
  return toolCosts?.default || 1;
}

export async function getLiveCreditCost(providerCost) {
  return calculateCredits(providerCost);
}

export const SUBSCRIPTION_CREDITS = {
  free: 100,
  starter: 1000,
  studio: 3000,
  pro: 10000,
};

export const PLAN_IDS = {
  [process.env.STRIPE_PRICE_STARTER]: "starter",
  [process.env.STRIPE_PRICE_STUDIO]: "studio",
  [process.env.STRIPE_PRICE_PRO]: "pro",
};
