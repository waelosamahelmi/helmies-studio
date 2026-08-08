/**
 * KIE Model & Pricing Sync
 * 
 * Fetches KIE's sitemap to discover all available models,
 * parses their IDs, types, and providers,
 * and syncs pricing to the database.
 * 
 * Pricing is derived from KIE's published rates (kie.ai/pricing)
 * with the standard 2.5x markup applied.
 * 
 * This module is called by:
 * - POST /api/admin/sync/kie  (manual trigger)
 * - CRON /api/cron/sync-kie   (daily auto-sync)
 */

import prisma from "@/lib/prisma";
import { CURATED_SCHEMAS, inferKieModelFromUrl, MEDIA_EXCEPTIONS, modelTypeForCapability, schemaForModel, slugToTitle, UNCATEGORIZED_MODEL_TYPE } from "@/lib/model-catalog-core.mjs";
import { readVerification, verificationAllowsActive, withProviderRequired, STATUS_PENDING, VERIFICATION_KEY } from "@/lib/catalog-verification.mjs";
import { calculateCredits } from "@/lib/pricing-engine";
import { getPricing, KIE_PRICING_OVERRIDES, DEFAULT_PRICING } from "@/lib/kie-pricing-core.mjs";
import { mayActivate } from "@/lib/model-dictionary.mjs";

export { getPricing };

// Curated per-model parameter schemas (EDITSv1 E1.2). The data physically
// lives in model-catalog-core.mjs because the persistent backfill
// (scripts/fix-model-categories.mjs) runs under plain node where this
// file's "@/lib/..." imports can't resolve — re-exported here so sync-side
// callers and tests keep one import site.
export { CURATED_SCHEMAS };

const KIE_SITEMAP_URL = "https://docs.kie.ai/sitemap.xml";
const MARKUP = 2.5;
const CREDIT_TO_EUR = 0.01;

// Known KIE pricing (per unit) from kie.ai/pricing
// These are maintained manually and can be overridden by admin

// Default pricing by task type (fallback when no override exists)

// Map KIE sitemap path segments to model types
function inferModelType(path) {
  const p = path.toLowerCase();
  if (p.includes("text-to-image") || p.includes("t2i")) return "image";
  if (p.includes("image-to-image") || p.includes("edit") || p.includes("remix") || p.includes("remove-background")) return "i2i";
  if (p.includes("text-to-video") || p.includes("t2v")) return "video";
  if (p.includes("image-to-video") || p.includes("i2v")) return "i2v";
  if (p.includes("video-to-video") || p.includes("v2v") || p.includes("video-edit") || p.includes("videoedit")) return "v2v";
  if (p.includes("lip-sync") || p.includes("lipsync") || p.includes("speech-to-video") || p.includes("infinitalk") || p.includes("omnihuman") || p.includes("omni-character")) return "lipsync";
  if (p.includes("text-to-speech") || p.includes("tts") || p.includes("text-to-dialogue")) return "audio";
  if (p.includes("music") || p.includes("suno") || p.includes("vocals") || p.includes("midi") || p.includes("audio-isolation") || p.includes("sounds")) return "audio";
  if (p.includes("upscale") && p.includes("video")) return "v2v";
  if (p.includes("upscale")) return "i2i";
  // Root-level Gemini-Omni MEDIA pages, typed before the LLM-vendor check
  // below would swallow them ("gemini-omni-character" is already caught by
  // the "omni-character" lipsync rule above).
  if (p.includes("gemini-omni-video")) return "video";
  if (p.includes("gemini-omni-audio")) return "audio";
  // MEDIA_EXCEPTIONS guard (video-market.md root cause #10): this substring
  // check used to type EVERY path containing "gemini"/"grok" as "llm", and
  // fetchKieModels unconditionally skips "llm" — silently dropping the
  // gemini-omni-* media models (and grok-imagine/extend, whose "extend" rule
  // sits BELOW this line) from every sync run. The exceptions list already
  // existed in model-catalog-core.mjs but only guarded inferKieModelFromUrl's
  // separate LLM_SEGMENTS check — it was never consulted here, where the
  // actual drop happened.
  if (
    !MEDIA_EXCEPTIONS.some((item) => p.includes(item)) &&
    (p.includes("chat") || p.includes("claude") || p.includes("gemini") || p.includes("grok") || p.includes("codex"))
  ) return "llm";
  if (p.includes("avatar")) return "video";
  if (p.includes("animate")) return "video";
  if (p.includes("extend")) return "video";
  return "image"; // default
}

// Extract model ID from sitemap URL path
function extractModelId(path) {
  // Remove market/ prefix and category
  let cleaned = path.replace(/^market\//, "").replace(/^cn\/market\//, "");
  
  // Remove legacy API prefixes
  cleaned = cleaned.replace(/^suno-api\//, "").replace(/^veo3-api\//, "").replace(/^runway-api\//, "");
  cleaned = cleaned.replace(/^flux-kontext-api\//, "").replace(/^4o-image-api\//, "");
  
  // Remove common-api, file-upload-api, etc
  if (cleaned.startsWith("common-api") || cleaned.startsWith("file-upload-api")) return null;
  
  // Skip sub-model endpoints (human-identification, subject-detection, etc)
  if (cleaned.includes("human-identification") || cleaned.includes("subject-detection")) return null;
  if (cleaned.includes("get-task-detail") || cleaned.includes("get-account-credits")) return null;
  if (cleaned.includes("download-url") || cleaned.includes("webhook-verification")) return null;
  if (cleaned.includes("upload-file")) return null;
  
  // Skip /cn/ duplicates
  if (path.startsWith("cn/")) return null;
  
  // Get the last segment as the model ID
  const segments = cleaned.split("/");
  const modelId = segments[segments.length - 1];
  
  if (!modelId || modelId.length < 2) return null;
  
  return modelId;
}

// Extract provider from sitemap path
function extractProvider(path) {
  const parts = path.replace(/^market\//, "").replace(/^cn\/market\//, "").split("/");
  return parts[0] || "unknown";
}

/**
 * Fetch and parse KIE sitemap to discover all available models.
 * Returns array of { modelId, provider, type, docsUrl }
 */
export async function fetchKieModels() {
  try {
    const res = await fetch(KIE_SITEMAP_URL, {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status}`);
    
    const xml = await res.text();
    
    // Extract all URLs from sitemap
    const urls = [];
    const regex = /<loc>(.*?)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1]);
    }
    
    // Parse each URL into a model entry
    const models = [];
    const seen = new Set();
    
    for (const url of urls) {
      // Parse the path after docs.kie.ai/
      const urlPath = new URL(url).pathname.slice(1); // remove leading /
      
      // Skip /cn/ duplicates
      if (urlPath.startsWith("cn/")) continue;
      
      // Skip non-model pages
      if (urlPath.startsWith("common-api") || urlPath.startsWith("file-upload-api")) continue;
      if (urlPath.includes("get-task-detail") || urlPath.includes("get-account-credits")) continue;
      if (urlPath.includes("download-url") || urlPath.includes("webhook-verification")) continue;
      if (urlPath.includes("upload-file") || urlPath.includes("quickstart")) continue;
      
      const inferred = inferKieModelFromUrl(url);
      const legacySuite = /^(suno-api|veo3-api|4o-image-api|flux-kontext-api|runway-api)\//.test(urlPath);
      if (!inferred && !legacySuite) continue;
      if (/callbacks|details|download|get-|quickstart/.test(urlPath)) continue;

      const modelId = inferred?.modelId || extractModelId(urlPath);
      if (!modelId || seen.has(modelId)) continue;
      
      const provider = extractProvider(urlPath);
      const type = inferModelType(urlPath);
      if (type === "llm") continue;
      const capability = inferred?.capability || (
        type === "image" ? "text-to-image" : type === "i2i" ? "image-to-image" :
        type === "video" ? "text-to-video" : type === "i2v" ? "image-to-video" :
        type === "v2v" ? "video-to-video" : type === "lipsync" ? "avatar-video" :
        type === "audio" ? "audio" : "media"
      );
      
      seen.add(modelId);
      models.push({
        modelId,
        providerModelId: inferred?.providerModelId || modelId,
        endpoint: inferred?.endpoint || modelId,
        // slugToTitle (not the naive per-segment titlecasing this replaced)
        // re-joins split version numbers, drops known vendor-folder
        // segments, and strips a redundant trailing capability phrase — see
        // its header comment in model-catalog-core.mjs for the exact bugs
        // ("Bytedance Seedance 1 5 Pro", "Generate 4 O Image") this fixes.
        displayName: inferred?.displayName || slugToTitle(modelId, { capability }),
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        type,
        capability,
        inputModalities: inferred?.inputModalities || ["text"],
        outputModalities: inferred?.outputModalities || [type === "audio" ? "audio" : type.includes("v") || type === "video" || type === "lipsync" ? "video" : "image"],
        // Curated fields (a model's REAL parameters, see CURATED_SCHEMAS in
        // model-catalog-core.mjs) merged over the generic default for its
        // capability; non-curated models get exactly the default.
        inputSchema: schemaForModel(modelId, capability),
        docsUrl: url,
      });
    }
    
    return models;
  } catch (e) {
    console.error("fetchKieModels error:", e.message);
    return [];
  }
}

/**
 * Get pricing for a model — uses override table, then defaults by type.
 */

/**
 * Sync all KIE models and pricing to the database.
 * - Adds new models
 * - Updates pricing for existing models
 * - Deactivates models no longer on KIE (marks isActive=false, doesn't delete)
 * 
 * Returns { added, updated, deactivated, total }
 */
export async function syncKieModels() {
  const kieModels = await fetchKieModels();
  
  if (kieModels.length === 0) {
    return { added: 0, updated: 0, deactivated: 0, total: 0, error: "No models fetched from KIE" };
  }
  
  // Get all existing KIE pricing entries
  const existing = await prisma.modelPricing.findMany({
    where: { providerName: "KIE" },
  });
  const existingMap = new Map(existing.map((e) => [e.modelId, e]));
  
  let added = 0;
  let updated = 0;
  const seenIds = new Set();
  
  for (const model of kieModels) {
    seenIds.add(model.modelId);
    const existingRow = existingMap.get(model.modelId);
    const providerCost = getPricing(model.modelId, model.type);
    const creditsCost = calculateCredits(providerCost, MARKUP);
    const pricingRules = { currency: "USD", unit: model.type === "image" || model.type === "i2i" ? "image" : "fixed", rules: [{ price: providerCost }] };
    // modelType is ALWAYS derived from capability (single source of truth —
    // see modelTypeForCapability's header). model.type above is the old
    // path-text guess; it still drives the default pricing unit and modality
    // fallback above/below, but it must never be what lands in the DB's
    // modelType column — that was the entire bug (see the header comment on
    // CAPABILITY_TO_MODEL_TYPE for the Bytedance Seedance example). A
    // capability this doesn't recognize (including a bare "video"/"image"
    // fallback the inference above can't tell a direction for) is written
    // as UNCATEGORIZED, not guessed — it needs a real capability fixed at
    // the sync source, and getCatalogModels/serializeCatalogModel (model-
    // catalog.js) never show an UNCATEGORIZED row to end users.
    const modelType = modelTypeForCapability(model.capability) || UNCATEGORIZED_MODEL_TYPE;

    // ── Defensive sync (BUG 1) ────────────────────────────────────────────
    // The catalog is built by crawling docs.kie.ai's sitemap, and a doc page
    // is not proof of a callable model — 27 of the 32 generations this app
    // has ever run failed, most of them with "The model name you specified
    // is not supported". This block stops the sync from PRESENTING an
    // unproven id as usable, without touching prisma/schema.prisma:
    //
    //   • A row whose recorded verdict is not-callable is never resurrected.
    //     (This whole loop used to write `isActive: true` unconditionally,
    //     so the next nightly cron undid every deactivation — an operator's
    //     as well as the sweep's.)
    //   • A model the crawl has NEVER SEEN BEFORE is created inactive and
    //     marked verification.status = "pending". It becomes usable only
    //     once scripts/verify-catalog.mjs proves a real submit reaches it.
    //     New slugs are exactly the population that turned out to be
    //     uncallable, and gating only NEW rows means shipping this cannot
    //     take the live catalog offline the way gating every unverified row
    //     would (every pre-existing row keeps whatever activity it has until
    //     the sweep gives it a real verdict).
    //   • verification + any provider-required fields the sweep discovered
    //     are carried forward instead of being overwritten by the sync's
    //     freshly-derived blobs.
    const existingVerification = readVerification(existingRow?.constraints);
    const verification = existingRow
      ? existingVerification
      : { status: STATUS_PENDING, callable: null, verdict: null, reason: "awaiting first verification probe", checkedAt: null };
    /* THE DICTIONARY DECIDES WHAT MAY BE SERVED (task 15).
       This sync builds ids by crawling a documentation sitemap, which
       invented rows the provider had never heard of, guessed prices for
       sixty of them, and filed video models as image models. So it may
       still discover and describe a model — it may no longer decide that
       one is live. A row the checked-in dictionary does not describe is
       synced as INACTIVE, whatever this crawl believes. */
    const permitted = mayActivate(model.modelId);
    const isActive = permitted.ok && verificationAllowsActive(
      verification ? { [VERIFICATION_KEY]: verification } : null,
      // Fallback for a pre-existing row with no verdict yet: keep the
      // activity it already has rather than flipping it either way.
      existingRow ? existingRow.isActive !== false : true,
    );
    if (!permitted.ok && existingRow?.isActive) {
      console.warn(`[sync] deactivating "${model.modelId}" — ${permitted.reason}`);
    }
    const existingProviderRequired = Array.isArray(existingRow?.inputSchema?.providerRequired)
      ? existingRow.inputSchema.providerRequired
      : [];
    const inputSchema = withProviderRequired(model.inputSchema, existingProviderRequired);

    const modelData = {
      modelType,
      providerName: "KIE",
      providerModelId: model.providerModelId,
      endpoint: model.endpoint,
      displayName: model.displayName,
      // No genuinely useful description text is available from the sitemap
      // crawl — the old template (`${displayName} via the KIE Market
      // API.`) just re-stated the display name and named the upstream
      // provider (which must stay hidden from end users, same as
      // providerName/the modelId prefix — see toPublicModelId's header).
      // Consistent with alibaba-catalog.js's default when a model has no
      // hand-authored description: prefer null over inventing marketing
      // copy — the UI already has an empty-state for a missing description
      // (src/app/models/ModelsClient.js renders it conditionally).
      description: null,
      capability: model.capability,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      inputSchema,
      constraints: verification
        ? { ...(model.inputSchema?.ui || {}), [VERIFICATION_KEY]: verification }
        : (model.inputSchema?.ui || {}),
      pricingRules,
      billingUnit: pricingRules.unit,
      currency: "USD",
      regions: ["global"],
      sourceUrl: model.docsUrl,
      sourceUpdatedAt: new Date(),
      catalogVersion: `kie-sitemap-${new Date().toISOString().slice(0, 10)}`,
      managedBySync: true,
      isDeprecated: false,
      providerCost,
      creditsCost,
      isActive,
    };

    if (existingMap.has(model.modelId)) {
      await prisma.modelPricing.update({
        where: { modelId: model.modelId },
        data: modelData,
      });
      updated++;
    } else {
      // Insert new model
      await prisma.modelPricing.create({
        data: { modelId: model.modelId, ...modelData },
      }).catch(() => {
        // May already exist with different providerName
      });
      added++;
    }
  }
  
  // Deactivate models that are no longer in KIE's sitemap
  let deactivated = 0;
  for (const [modelId, entry] of existingMap) {
    if (!seenIds.has(modelId) && entry.isActive) {
      await prisma.modelPricing.update({
        where: { modelId },
        data: { isActive: false, isDeprecated: true },
      }).catch(() => {});
      deactivated++;
    }
  }
  
  return { added, updated, deactivated, total: kieModels.length };
}

export { KIE_PRICING_OVERRIDES, DEFAULT_PRICING, MARKUP };
