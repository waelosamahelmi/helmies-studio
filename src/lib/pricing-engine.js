import prisma from "@/lib/prisma";
import { calculateProviderQuote, providerCostToCredits, resolveModelPricingRow } from "@/lib/model-catalog-core.mjs";

const DEFAULT_MARKUP = 2.5;
const CREDIT_TO_EUR = 0.01;

// ── Provider cost → credits with markup ──
export function calculateCredits(providerCost, markup = DEFAULT_MARKUP) {
  if (!providerCost || providerCost <= 0) return 1;
  const credits = Math.ceil((providerCost * markup) / CREDIT_TO_EUR);
  return Math.max(1, credits);
}

// Resolve markup from DB provider config, fall back to default
async function resolveMarkup(providerName) {
  if (!providerName) return DEFAULT_MARKUP;
  try {
    const config = await prisma.providerConfig.findUnique({ where: { name: providerName } });
    return config?.markup || DEFAULT_MARKUP;
  } catch {
    return DEFAULT_MARKUP;
  }
}

// ── Estimate credits for a task before execution ──
export async function estimateCredits(tool, model, params = {}) {
  // Tolerant of the "public" (provider-prefix-stripped) id the catalog now
  // hands back to clients — see resolveModelPricingRow's header.
  const pricing = await resolveModelPricingRow(prisma, model).catch(() => null);
  if (pricing) {
    if (pricing.pricingRules) {
      try {
        const quote = calculateProviderQuote(pricing.pricingRules, params);
        const markup = await resolveMarkup(pricing.providerName);
        return providerCostToCredits(quote.providerCost, markup, CREDIT_TO_EUR);
      } catch {
        // A parameter-specific rule may require a choice the caller has not made yet.
        // Fall through to the model's verified default quote rather than treating it as free.
      }
    }
    // Recalculate if we have providerCost but stale creditsCost
    if (pricing.providerCost > 0 && pricing.creditsCost <= 1) {
      const markup = await resolveMarkup(pricing.providerName);
      const recalculated = calculateCredits(pricing.providerCost, markup);
      return recalculated;
    }
    return pricing.creditsCost;
  }

  const fallback = getFallbackCost(tool, model, params);
  return fallback;
}

function getFallbackCost(tool, model, params) {
  const costs = {
    image: 2, i2i: 3, video: 10, i2v: 12, v2v: 8,
    lipsync: 8, audio: 5, recast: 12, cinema: 4,
    motion: 8, clipping: 6, marketing: 15, influencer: 3, llm: 1,
  };

  let base = costs[tool] || 2;

  if (params.duration && params.duration > 10) base += Math.ceil((params.duration - 10) / 5) * 2;
  if (params.resolution === "4k" || params.resolution === "4K") base += 4;
  if (params.resolution === "2k" || params.resolution === "2K") base += 2;
  if (params.num_images && params.num_images > 1) base += (params.num_images - 1) * 2;
  if (params.images_list?.length > 1) base += Math.ceil(params.images_list.length / 2);

  return base;
}

// ── Estimate multi-step agent task ──
export async function estimateAgentTask(steps) {
  let total = 0;
  const breakdown = [];
  for (const step of steps) {
    const tool = step.tool || step.agent || "image";
    const model = step.model || step.params?.model || tool;
    const cost = await estimateCredits(tool, model, step.params || {});
    total += cost;
    breakdown.push({ step: step.name || step.task || tool, tool, model, credits: cost });
  }
  return { total, breakdown };
}

// ── Format credits as EUR ──
export function creditsToEUR(credits) {
  return (credits * CREDIT_TO_EUR).toFixed(2);
}

// ── Margin floor (code review follow-up) ──
// Neither setProviderMarkup nor setModelPricing validated anything before
// this: an admin could set a model's creditsCost below what the provider
// actually costs (quantified example the review found: wan2.6-i2v-flash at
// 1080p+audio costs ~$0.075/sec — a 10s video costs the provider ~$0.75, but
// creditsCost:5 (worth €0.05 at CREDIT_TO_EUR) was accepted with no
// rejection, ~€0.64+ lost per generation), or set a provider's markup below
// 1.0 (charging less than cost on every model priced through it). Reuses
// CREDIT_TO_EUR — no second pricing constant invented. MIN_MARKUP is
// breakeven (1.0), the absolute floor: below it, calculateCredits' own
// formula (providerCost * markup / CREDIT_TO_EUR) computes fewer credits
// than the provider cost actually converts to, i.e. a guaranteed loss on
// every generation priced through that markup.
export const MIN_MARKUP = 1.0;

// Throws — never silently clamps — when a markup would price below
// breakeven. Exported so every write path that can set a provider's markup
// (setProviderMarkup below, and src/app/api/admin/providers/route.js, which
// upserts ProviderConfig.markup directly) shares this one check.
export function assertMarkupAboveFloor(markup) {
  const value = Number(markup);
  if (!Number.isFinite(value) || value < MIN_MARKUP) {
    throw new Error(`Markup must be at least ${MIN_MARKUP} (breakeven) — got ${markup}`);
  }
}

// Throws — never silently clamps — when creditsCost would price a model's
// generations below its own recorded provider cost. No-ops when
// providerCost is 0/unset: a brand-new model row with its real cost not yet
// known has nothing to floor against (mirrors setModelPricing's own
// pre-existing "no provider cost on record" shape) — this is deliberately
// not a loophole in practice, since providerCost is populated by the
// catalog sync / KIE test flow before a model is ever exposed for real use.
// Exported so every write path that can set creditsCost (setModelPricing
// below, and src/app/api/admin/models/route.js's partial-update POST)
// shares this one check.
export function assertCreditsCoverCost(providerCost, creditsCost) {
  if (!providerCost || providerCost <= 0) return;
  const minCredits = Math.ceil(providerCost / CREDIT_TO_EUR);
  if (!(Number(creditsCost) >= minCredits)) {
    throw new Error(
      `creditsCost ${creditsCost} would price this model below its provider cost (${providerCost}) — minimum is ${minCredits} credits at CREDIT_TO_EUR=${CREDIT_TO_EUR}`
    );
  }
}

// ── Admin: update markup for a provider ──
export async function setProviderMarkup(providerName, markup) {
  assertMarkupAboveFloor(markup);
  await prisma.providerConfig.upsert({
    where: { name: providerName },
    create: { name: providerName, type: "image+video", markup },
    update: { markup },
  });
}

// ── Admin: set model pricing ──
export async function setModelPricing(modelId, modelType, providerName, providerCost, creditsCost) {
  assertCreditsCoverCost(providerCost, creditsCost);
  await prisma.modelPricing.upsert({
    where: { modelId },
    create: { modelId, modelType, providerName, providerCost, creditsCost },
    update: { providerCost, creditsCost, providerName },
  });
}

// ── Admin: get all model pricing ──
export async function getAllPricing() {
  return prisma.modelPricing.findMany({ orderBy: { modelType: "asc" } });
}

export { DEFAULT_MARKUP, CREDIT_TO_EUR };
