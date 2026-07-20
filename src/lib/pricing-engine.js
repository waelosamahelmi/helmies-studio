import prisma from "@/lib/prisma";

const DEFAULT_MARKUP = 2.5;
const CREDIT_TO_EUR = 0.01;

// ── Provider cost → credits with markup ──
export function calculateCredits(providerCost, markup = DEFAULT_MARKUP) {
  const credits = Math.ceil((providerCost * markup) / CREDIT_TO_EUR);
  return Math.max(1, credits);
}

// ── Estimate credits for a task before execution ──
export async function estimateCredits(tool, model, params = {}) {
  const pricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
  if (pricing) return pricing.creditsCost;

  const fallback = getFallbackCost(tool, model, params);
  return fallback;
}

function getFallbackCost(tool, model, params) {
  const costs = {
    image: 2,
    i2i: 3,
    video: 10,
    i2v: 12,
    v2v: 8,
    lipsync: 8,
    audio: 5,
    recast: 12,
    cinema: 4,
    motion: 8,
    clipping: 6,
    marketing: 15,
    influencer: 3,
    llm: 1,
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

// ── Admin: update markup for a provider ──
export async function setProviderMarkup(providerName, markup) {
  await prisma.providerConfig.upsert({
    where: { name: providerName },
    create: { name: providerName, type: "image+video", apiKey: "", markup },
    update: { markup },
  });
}

// ── Admin: set model pricing ──
export async function setModelPricing(modelId, modelType, providerName, providerCost, creditsCost) {
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