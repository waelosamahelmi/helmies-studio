import prisma from "@/lib/prisma";
import { ALIBABA_MEDIA_MODELS } from "@/lib/alibaba-catalog";
import { calculateProviderQuote, defaultSchemaForCapability, providerCostToCredits, validateModelInput } from "@/lib/model-catalog-core.mjs";

const DEFAULT_MARKUP = 2.5;

function defaultParamsFor(model) {
  const params = {};
  for (const [name, field] of Object.entries(model.inputSchema?.fields || {})) {
    if (field.enum?.length) params[name] = field.enum[0];
    else if (name === "duration") params[name] = 5;
    else if (name === "n" || name === "num_images") params[name] = 1;
    else if (field.type === "boolean") params[name] = false;
    else if (field.required && field.type === "string") params[name] = name.includes("url") ? "https://example.com/input" : "preview";
  }
  return params;
}

function toDbData(model, markup = DEFAULT_MARKUP) {
  let providerCost = 0;
  let creditsCost = 0;
  let isActive = model.isActive !== false;
  try {
    providerCost = calculateProviderQuote(model.pricingRules, defaultParamsFor(model)).providerCost;
    creditsCost = providerCostToCredits(providerCost, markup);
  } catch {
    isActive = false;
  }
  return {
    modelType: model.modelType,
    providerName: "Alibaba",
    providerModelId: model.providerModelId,
    endpoint: model.endpoint,
    displayName: model.displayName,
    description: model.description,
    capability: model.capability,
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    inputSchema: model.inputSchema || defaultSchemaForCapability(model.capability),
    constraints: model.constraints || {},
    pricingRules: { ...model.pricingRules, sourceUrl: model.pricingSourceUrl },
    billingUnit: model.billingUnit,
    currency: model.currency,
    regions: model.regions,
    sourceUrl: model.sourceUrl,
    sourceUpdatedAt: new Date(),
    catalogVersion: model.catalogVersion,
    managedBySync: true,
    isDeprecated: false,
    background: model.background,
    providerCost,
    creditsCost,
    isActive,
  };
}

export async function syncAlibabaModels() {
  const config = await prisma.providerConfig.findUnique({ where: { name: "Alibaba" } }).catch(() => null);
  const markup = config?.markup || DEFAULT_MARKUP;
  const existing = await prisma.modelPricing.findMany({ where: { providerName: "Alibaba", managedBySync: true } });
  const existingIds = new Set(existing.map((row) => row.modelId));
  const seen = new Set();
  let added = 0;
  let updated = 0;
  for (const model of ALIBABA_MEDIA_MODELS) {
    seen.add(model.modelId);
    const data = toDbData(model, markup);
    await prisma.modelPricing.upsert({
      where: { modelId: model.modelId },
      create: { modelId: model.modelId, ...data },
      update: data,
    });
    if (existingIds.has(model.modelId)) updated++;
    else added++;
  }
  const stale = existing.filter((row) => !seen.has(row.modelId));
  if (stale.length) {
    await prisma.modelPricing.updateMany({ where: { id: { in: stale.map((row) => row.id) } }, data: { isActive: false, isDeprecated: true } });
  }
  return { provider: "Alibaba", added, updated, deactivated: stale.length, total: ALIBABA_MEDIA_MODELS.length };
}

export function serializeCatalogModel(model) {
  return {
    id: model.modelId,
    modelId: model.modelId,
    providerModelId: model.providerModelId || model.modelId,
    endpoint: model.endpoint || model.modelId,
    displayName: model.displayName || model.modelId,
    description: model.description,
    provider: model.providerName,
    modelType: model.modelType,
    capability: model.capability || model.modelType,
    inputModalities: model.inputModalities || [],
    outputModalities: model.outputModalities || [],
    schema: model.inputSchema || null,
    constraints: model.constraints || {},
    pricing: model.pricingRules || null,
    billingUnit: model.billingUnit,
    currency: model.currency,
    regions: model.regions || [],
    credits: model.creditsCost,
    providerCost: model.providerCost,
    background: model.background,
    backgroundOverlay: model.backgroundOverlay,
    textColor: model.textColor,
    sourceUrl: model.sourceUrl,
    catalogVersion: model.catalogVersion,
    isDeprecated: model.isDeprecated,
  };
}

export async function getCatalogModels({ capability, modelType, provider, includeInactive = false } = {}) {
  const where = {
    ...(includeInactive ? {} : { isActive: true, isDeprecated: false }),
    ...(capability ? { capability } : {}),
    ...(modelType ? { modelType } : {}),
    ...(provider ? { providerName: { equals: provider, mode: "insensitive" } } : {}),
  };
  const rows = await prisma.modelPricing.findMany({ where, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }, { modelId: "asc" }] });
  return rows.map(serializeCatalogModel);
}

export async function getCatalogModel(modelId) {
  const row = await prisma.modelPricing.findUnique({ where: { modelId } });
  return row ? serializeCatalogModel(row) : null;
}

export async function quoteCatalogModel(modelId, params = {}) {
  const row = await prisma.modelPricing.findUnique({ where: { modelId } });
  if (!row || !row.isActive || row.isDeprecated) throw new Error("Model is unavailable");
  const errors = validateModelInput(row.inputSchema, params);
  if (errors.length) return { valid: false, errors };
  if (!row.pricingRules) throw new Error("Model has no verified pricing");
  const quote = calculateProviderQuote(row.pricingRules, params);
  const config = await prisma.providerConfig.findUnique({ where: { name: row.providerName } }).catch(() => null);
  const markup = config?.markup || DEFAULT_MARKUP;
  return { valid: true, modelId, provider: row.providerName, ...quote, markup, credits: providerCostToCredits(quote.providerCost, markup) };
}

