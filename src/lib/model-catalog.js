// Relative + explicit extension (not the "@/lib/..." bundler-only alias
// used elsewhere in this app — see src/lib/wallet.js/job-queue.js's
// identical header comments for the precedent): this module is also loaded
// transitively under plain `node` — scripts/seed-templates.mjs (Phase 6
// Task 4) imports src/lib/template-quote.js's canPublish, which imports
// quoteCatalogModel from here — and Node's strict ESM resolver has no
// knowledge of the "@/" alias at all, only Next/Vite's bundler does.
import prisma from "./prisma.js";
import { ALIBABA_MEDIA_MODELS } from "./alibaba-catalog.js";
import {
  calculateProviderQuote, defaultSchemaForCapability, providerCostToCredits, validateModelInput,
  modelTypeForCapability, UNCATEGORIZED_MODEL_TYPE, slugToTitle, toPublicModelId, resolveModelPricingRow,
  inferCapabilityFromRow,
} from "./model-catalog-core.mjs";

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

// KIE's displayName is ALWAYS sync-derived from its docs URL slug (there is
// no admin path that ever writes a custom one — see admin/models/route.js
// and admin/pricing/route.js's setModelPricing, neither of which touch
// displayName), so recomputing it here with the fixed slugToTitle is a pure
// improvement, applied live to every row regardless of whether a fresh sync
// has run yet. Alibaba's displayName, by contrast, is hand-authored right
// in alibaba-catalog.js's model() calls — that IS the "provider-supplied"
// name the task asks us to prefer, so it's left alone (falling back to
// slugToTitle only if a future row somehow has none).
function displayNameFor(model, capability) {
  if (model.providerName === "KIE") {
    return slugToTitle(model.modelId, { capability }) || model.displayName || model.modelId;
  }
  return model.displayName || slugToTitle(model.modelId, { capability }) || model.modelId;
}

// A row's own capability might be null, or something this mapping doesn't
// recognize at all (the sync's own last-resort "media") — try recovering a
// real one via inferCapabilityFromRow (modalities first, then the same
// text-based inference every other synced model already gets its
// capability from — see its header in model-catalog-core.mjs) before
// giving up. Used everywhere modelType is derived so a recoverable row is
// never reported (or hidden) as uncategorized just because the sync never
// set — or mis-set — its capability column.
function resolveEffectiveCapability(model) {
  if (modelTypeForCapability(model.capability)) return model.capability;
  return inferCapabilityFromRow(model) || model.capability || null;
}

// isAdmin controls two things the public catalog must never leak (see
// toPublicModelId's header and the URGENT-fix task notes): the upstream
// provider identity (providerName/provider — dropped entirely) and a
// provider-prefixed real id (e.g. Alibaba's "alibaba:qwen-image-max" —
// stripped to "qwen-image-max"; resolveModelPricingRow below is what makes
// that safe to hand back to a client — see its own header). The real id
// is NEVER changed at rest; only what this function returns to a non-admin
// caller differs.
export function serializeCatalogModel(model, { includeCosts = false, isAdmin = false } = {}) {
  // modelType is re-derived from capability HERE too, not just trusted from
  // whatever the DB column says — belt-and-suspenders against a row that
  // hasn't been through a sync/backfill since this fix landed. capability
  // itself is resolveEffectiveCapability's job: recover one from the row's
  // modalities/endpoint when the stored value is null/unmapped before
  // falling back to UNCATEGORIZED, so a genuinely-identifiable model is
  // never hidden just because its capability column is empty or stale. A
  // capability that's STILL unresolvable is never shown to a non-admin
  // caller (requirement: uncategorized models must not appear in any
  // user-facing list) — the admin path still gets it, flagged via
  // isUncategorized, so whoever owns the sync can go fix it for good.
  const capability = resolveEffectiveCapability(model);
  const effectiveType = modelTypeForCapability(capability);
  const isUncategorized = effectiveType === null;
  const publicId = isAdmin ? model.modelId : toPublicModelId(model.modelId, model.providerName);
  const base = {
    id: publicId,
    modelId: publicId,
    providerModelId: model.providerModelId || model.modelId,
    endpoint: model.endpoint || model.modelId,
    displayName: displayNameFor(model, capability),
    description: model.description,
    modelType: isUncategorized ? UNCATEGORIZED_MODEL_TYPE : effectiveType,
    capability,
    inputModalities: model.inputModalities || [],
    outputModalities: model.outputModalities || [],
    schema: model.inputSchema || null,
    constraints: model.constraints || {},
    billingUnit: model.billingUnit,
    currency: model.currency,
    regions: model.regions || [],
    credits: model.creditsCost,
    background: model.background,
    backgroundOverlay: model.backgroundOverlay,
    textColor: model.textColor,
    sourceUrl: model.sourceUrl,
    catalogVersion: model.catalogVersion,
    isDeprecated: model.isDeprecated,
    isUncategorized,
  };
  if (isAdmin) {
    base.provider = model.providerName;
    base.providerName = model.providerName;
  }
  if (includeCosts) {
    base.providerCost = model.providerCost;
    base.pricing = model.pricingRules || null;
  }
  return base;
}

export async function getCatalogModels({ capability, modelType, provider, includeInactive = false, includeCosts = false, isAdmin = false } = {}) {
  const where = {
    ...(includeInactive ? {} : { isActive: true, isDeprecated: false }),
    ...(capability ? { capability } : {}),
    ...(modelType ? { modelType } : {}),
    ...(provider ? { providerName: { equals: provider, mode: "insensitive" } } : {}),
  };
  // Coarse DB-level exclusion of rows already written as UNCATEGORIZED — an
  // optimization, not the actual guarantee (see the in-memory filter below).
  if (!modelType && !isAdmin) where.modelType = { not: UNCATEGORIZED_MODEL_TYPE };
  const rows = await prisma.modelPricing.findMany({ where, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }, { modelId: "asc" }] });
  // The actual guarantee: re-derive from capability (recovering one via
  // resolveEffectiveCapability where possible) regardless of what the DB's
  // modelType column currently says. Two things this catches that the DB
  // query alone can't: (1) a row that's uncategorized never reaches a
  // non-admin caller, recovered or not; (2) a row whose STORED modelType is
  // stale — e.g. capability="video" but modelType still says "image", the
  // exact shape of the bug this fix targets — can never come back from a
  // query for a DIFFERENT modelType than its true one, even before a
  // backfill/sync has run to correct the column itself.
  const visible = isAdmin ? rows : rows.filter((row) => {
    const effectiveType = modelTypeForCapability(resolveEffectiveCapability(row));
    if (effectiveType === null) return false;
    if (modelType && effectiveType !== modelType) return false;
    return true;
  });
  return visible.map((row) => serializeCatalogModel(row, { includeCosts, isAdmin }));
}

export async function getCatalogModel(modelId, { includeCosts = false, isAdmin = false } = {}) {
  const row = await resolveModelPricingRow(prisma, modelId);
  if (!row) return null;
  if (!isAdmin && modelTypeForCapability(resolveEffectiveCapability(row)) === null) return null;
  return serializeCatalogModel(row, { includeCosts, isAdmin });
}

export async function quoteCatalogModel(modelId, params = {}) {
  const row = await resolveModelPricingRow(prisma, modelId);
  if (!row || !row.isActive || row.isDeprecated) throw new Error("Model is unavailable");
  const errors = validateModelInput(row.inputSchema, params);
  if (errors.length) return { valid: false, errors };
  if (!row.pricingRules) throw new Error("Model has no verified pricing");
  const quote = calculateProviderQuote(row.pricingRules, params);
  const config = await prisma.providerConfig.findUnique({ where: { name: row.providerName } }).catch(() => null);
  const markup = config?.markup || DEFAULT_MARKUP;
  return { valid: true, modelId, provider: row.providerName, ...quote, markup, credits: providerCostToCredits(quote.providerCost, markup) };
}

