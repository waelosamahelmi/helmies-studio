// Relative + explicit extension (not the "@/lib/..." bundler-only alias
// used elsewhere in this app — see src/lib/wallet.js/job-queue.js's
// identical header comments for the precedent): this module is also loaded
// transitively under plain `node` — scripts/seed-templates.mjs (Phase 6
// Task 4) imports src/lib/template-quote.js's canPublish, which imports
// quoteCatalogModel from here — and Node's strict ESM resolver has no
// knowledge of the "@/" alias at all, only Next/Vite's bundler does.
import prisma from "./prisma.js";
import {
  calculateProviderQuote, defaultSchemaForCapability, providerCostToCredits, validateModelInput,
  modelTypeForCapability, UNCATEGORIZED_MODEL_TYPE, slugToTitle, toPublicModelId, resolveModelPricingRow,
  inferCapabilityFromRow, sanitizeCatalogDescription, sanitizeDisplayName,
  isRunnableModelRow, runnableProviderModelId,
} from "./model-catalog-core.mjs";

const DEFAULT_MARKUP = 2.5;

// ── Alibaba retirement (EDITSv1 M2 — owner decision: KIE-only) ─────────────
// This sync used to upsert (and thereby REACTIVATE) every ALIBABA_MEDIA_MODELS
// entry on each cron/admin run — which would silently undo the retirement
// scripts/retire-alibaba.mjs applies. It now does the opposite: never creates
// or updates catalog rows, and deactivates any Alibaba row still active, so
// a scheduled sync converges on the retired state instead of fighting it.
// Old Generation rows keep resolving/polling fine — see providers.js's
// RETIRED_ADAPTERS header.
export async function syncAlibabaModels() {
  const stillActive = await prisma.modelPricing.findMany({
    where: { providerName: "Alibaba", isActive: true },
    select: { id: true },
  });
  if (stillActive.length) {
    await prisma.modelPricing.updateMany({
      where: { id: { in: stillActive.map((row) => row.id) } },
      data: { isActive: false, isDeprecated: true },
    });
  }
  return { provider: "Alibaba", retired: true, added: 0, updated: 0, deactivated: stillActive.length, total: 0 };
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

// isAdmin controls three things the public catalog must never leak (see
// toPublicModelId's header and the URGENT-fix task notes): the upstream
// provider identity (providerName/provider — dropped entirely), a
// provider-prefixed real id (e.g. Alibaba's "alibaba:qwen-image-max" —
// stripped to "qwen-image-max"; resolveModelPricingRow below is what makes
// that safe to hand back to a client — see its own header), and the SAME
// provider identity when it's baked into the description text instead of a
// structured field (measured production bug: kie-sync.js used to write
// `${displayName} via the KIE Market API.` — 35 of 39 image-model
// descriptions on live production named "KIE" in plain text even after
// providerName was hidden). sanitizeCatalogDescription (model-catalog-
// core.mjs) is applied live here so the 175+ rows already in the DB are
// fixed without waiting for a re-sync/backfill; admin still sees the raw
// stored text (it already sees providerName directly, so there's nothing
// left to hide, and ops needs the unscrubbed text to know a sync still
// needs fixing). The real id and the real description are NEVER changed at
// rest; only what this function returns to a non-admin caller differs.
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
  // Same "hide the upstream provider" requirement as publicId/description
  // above, applied to the human-readable name: a hand-authored displayName
  // (Alibaba's) can bake a "<providerName>:" prefix straight into the name
  // itself (measured production bug: qwen3-tts-flash / qwen3-tts-instruct-
  // flash reported as "Alibaba:qwen3 TTS Flash" / "Alibaba:qwen3 TTS
  // Instruct Flash" — every other mode already reported zero such leaks).
  // sanitizeDisplayName (model-catalog-core.mjs) is applied live here, same
  // as sanitizeCatalogDescription below, so the already-live rows are fixed
  // without waiting for a re-sync/backfill; admin keeps seeing the raw
  // provider-qualified name (it already sees providerName directly, so
  // there's nothing left to hide).
  const rawDisplayName = displayNameFor(model, capability);
  const displayName = isAdmin ? rawDisplayName : sanitizeDisplayName(rawDisplayName, model.providerName);
  const base = {
    id: publicId,
    modelId: publicId,
    providerModelId: model.providerModelId || model.modelId,
    endpoint: model.endpoint || model.modelId,
    displayName,
    description: isAdmin ? model.description : sanitizeCatalogDescription(model.description),
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

// ── Runnable-model resolution (URGENT production fix) ──────────────────────
// Shared by the agent executor (src/lib/agents.js — validate-before-charge,
// live fallback pool, planner hints) and available to any studio-path
// caller that wants the same gate. isRunnableModelRow (model-catalog-
// core.mjs) is the actual rule; this just wires it up to a live DB lookup
// using the SAME id-resolution resolveProvider/generation-handler.js
// already rely on (resolveModelPricingRow tolerates both the real modelId
// and the public/provider-prefix-stripped form a client or planner might
// hand back).
export async function resolveRunnableModel(candidateId) {
  const row = await resolveModelPricingRow(prisma, candidateId).catch(() => null);
  return isRunnableModelRow(row) ? row : null;
}

// The cheapest currently-runnable rows for a coarse modelType ("image",
// "video", "audio", ...), for use as a live fallback/substitution pool —
// replaces a hardcoded model list that goes stale the instant a provider
// deprecates one of its entries (production incident: agents.js's FALLBACKS
// hardcoded flux-dev/nano-banana, both isDeprecated in production while
// still the ENTIRE image fallback chain).
//
// Reuses the SAME effective-capability recovery getCatalogModels uses
// (resolveEffectiveCapability + modelTypeForCapability) so a row whose
// stored `modelType` column is stale is still found correctly — then adds
// isRunnableModelRow on top, which getCatalogModels' public serialization
// deliberately hides (serializeCatalogModel always synthesizes an
// endpoint/providerModelId fallback for display, even when the underlying
// row has neither — see its own header), so this only ever returns models
// an executor can actually submit to a provider.
//
// Never throws — a DB error (including an incompletely-mocked test client)
// degrades to an empty result, same as every other `.catch(() => ...)`
// guard in this module, so callers can always fall back to their own tiny
// last-resort list without a try/catch of their own.
export async function getRunnableModelsForType(modelType, { excludeModelIds = [], limit = 5 } = {}) {
  if (!modelType) return [];
  let rows;
  try {
    rows = await prisma.modelPricing.findMany({
      where: { isActive: true, isDeprecated: false },
      orderBy: [{ creditsCost: "asc" }],
    });
  } catch {
    return [];
  }
  const exclude = new Set((excludeModelIds || []).filter(Boolean));
  const matches = [];
  for (const row of rows) {
    if (exclude.has(row.modelId) || exclude.has(runnableProviderModelId(row))) continue;
    if (!isRunnableModelRow(row)) continue;
    const capability = resolveEffectiveCapability(row);
    if (modelTypeForCapability(capability) !== modelType) continue;
    matches.push(row);
    if (matches.length >= limit) break;
  }
  return matches;
}

