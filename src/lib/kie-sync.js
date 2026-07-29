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
import { defaultSchemaForCapability, inferKieModelFromUrl } from "@/lib/model-catalog-core.mjs";
import { calculateCredits } from "@/lib/pricing-engine";

const KIE_SITEMAP_URL = "https://docs.kie.ai/sitemap.xml";
const MARKUP = 2.5;
const CREDIT_TO_EUR = 0.01;

// Known KIE pricing (per unit) from kie.ai/pricing
// These are maintained manually and can be overridden by admin
const KIE_PRICING_OVERRIDES = {
  // Image — per image
  "nano-banana-2-lite": 0.04,
  "nano-banana-pro": 0.09,
  "nano-banana": 0.04,
  "imagen4": 0.038,
  "imagen4-fast": 0.018,
  "imagen4-ultra": 0.058,
  "flux-dev": 0.012,
  "flux-schnell": 0.003,
  "flux-2-dev": 0.012,
  "flux-kontext-dev": 0.02,
  "flux-kontext-pro": 0.04,
  "midjourney": 0.10,
  "gpt-image-1.5": 0.03,
  "gpt-image-2": 0.03,
  "gpt-image-2-text-to-image": 0.03,
  "gpt-image-2-image-to-image": 0.03,
  "hunyuan-image-3": 0.10,
  "qwen-text-to-image": 0.02,
  "wan-2-5-text-to-image": 0.03,
  "wan-2-7-image": 0.02,
  "wan-2-7-image-pro": 0.04,
  "kling-text-to-image": 0.028,
  "kling-image-edit": 0.028,
  "ideogram-v3-text-to-image": 0.06,
  "grok-imagine-text-to-image": 0.022,
  "seedream-v4-text-to-image": 0.027,
  "seedream-v4-edit": 0.027,
  "seedream-5-lite-text-to-image": 0.035,
  "seedream-5-pro-text-to-image": 0.045,
  "seedream-5-pro-image-to-image": 0.045,
  "z-image": 0.004,
  "topaz-image-upscale": 0.01,
  "recraft-remove-background": 0.02,
  "recraft-crisp-upscale": 0.004,
  
  // Video — per video (5s base)
  "veo3": 1.28,
  "veo3_fast": 1.20,
  "sora-2-text-to-video": 0.40,
  "kling-3-0": 0.42,
  "kling-text-to-video": 0.42,
  "kling-image-to-video": 0.42,
  "kling-v2-1-standard": 0.25,
  "kling-v2-1-pro": 0.45,
  "kling-v2-1-master-text-to-video": 1.30,
  "kling-v2-1-master-image-to-video": 1.30,
  "kling-v25-turbo-text-to-video-pro": 0.35,
  "kling-v25-turbo-image-to-video-pro": 0.35,
  "kling-v3-turbo-text-to-video": 0.42,
  "kling-v3-turbo-image-to-video": 0.42,
  "kling-motion-control": 0.42,
  "kling-motion-control-v3": 0.42,
  "kling-ai-avatar-standard": 0.42,
  "kling-ai-avatar-pro": 0.56,
  "seedance-2": 0.57,
  "seedance-2-fast": 0.50,
  "seedance-2-mini": 0.60,
  "seedance-1-5-pro": 0.26,
  "seedance-2.0-i2v": 0.57,
  "wan-2-6-text-to-video": 0.50,
  "wan-2-6-image-to-video": 0.50,
  "wan-2-6-video-to-video": 0.50,
  "wan-2-6-flash-image-to-video": 0.25,
  "wan-2-6-flash-video-to-video": 0.25,
  "wan-2-5-text-to-video": 0.25,
  "wan-2-5-image-to-video": 0.25,
  "wan-2-7-text-to-video": 0.50,
  "wan-2-7-image-to-video": 0.50,
  "wan-2-7-videoedit": 0.50,
  "wan-2-7-r2v": 0.50,
  "wan-2-2-a14b-text-to-video-turbo": 0.05,
  "wan-2-2-a14b-image-to-video-turbo": 0.05,
  "wan-2-2-animate-move": 0.10,
  "wan-2-2-animate-replace": 0.10,
  "hailuo-02-text-to-video-standard": 0.23,
  "hailuo-02-image-to-video-standard": 0.23,
  "hailuo-02-text-to-video-pro": 0.48,
  "hailuo-02-image-to-video-pro": 0.48,
  "hailuo-2-3-text-to-video-standard": 0.28,
  "hailuo-2-3-image-to-video-standard": 0.28,
  "hailuo-2-3-image-to-video-pro": 0.49,
  "grok-imagine-text-to-video": 0.05,
  "grok-imagine-image-to-video": 0.05,
  "grok-imagine-extend": 0.05,
  "grok-imagine-1-5-preview": 0.05,
  "runway-aleph": 0.05,
  "runway-generate-ai-video": 0.05,
  "runway-extend-ai-video": 0.05,
  "topaz-video-upscale": 0.025,
  "video-upscaler": 0.025,
  "watermark-remover": 0.05,
  
  // Audio/Music
  "suno-v5.5": 0.002,
  "suno-v5": 0.002,
  "suno-v4.5-plus": 0.002,
  "suno-v4.5": 0.002,
  "suno-v4.5-all": 0.002,
  "suno-v4": 0.002,
  "elevenlabs-text-to-speech-turbo-2.5": 0.07,
  "elevenlabs-text-to-speech-multilingual-v2": 0.07,
  "elevenlabs-text-to-dialogue-v3": 0.07,
  "elevenlabs-audio-isolation": 0.02,
  "gemini-3-1-flash-tts": 0.05,
  "gemini-2-5-pro-tts": 0.10,
  
  // Lipsync
  "veed-lipsync": 0.10,
  "sync-lipsync-v3": 0.10,
  "infinitetalk": 0.15,
  "wan-2-2-a14b-speech-to-video-turbo": 0.10,
  "volcengine-video-to-video-lip-sync": 0.08,
  "omnihuman-1-5": 0.20,
  "gemini-omni-character": 0.15,
  "gemini-omni-video": 0.15,
  "gemini-omni-audio": 0.10,
  
  // LLM (per call, approximate)

  // I2I sub-models
  "1-5-image-to-image": 0.03,
  "1-5-text-to-image": 0.03,
  "4-5-edit": 0.035,
  "4-5-text-to-image": 0.035,
  "5-lite-image-to-image": 0.035,
  "5-lite-text-to-image": 0.035,
  "5-pro-image-to-image": 0.045,
  "5-pro-text-to-image": 0.045,
  "character-edit": 0.06,
  "character-remix": 0.06,
  "character": 0.04,
  "v3-edit": 0.06,
  "v3-remix": 0.06,
  "crisp-upscale": 0.004,

  // Audio sub-models (Suno suite)
  "generate-music": 0.002,
  "extend-music": 0.002,
  "upload-and-cover-audio": 0.002,
  "upload-and-extend-audio": 0.002,
  "add-instrumental": 0.002,
  "add-vocals": 0.002,
  "cover-suno": 0.002,
  "replace-section": 0.002,
  "generate-persona": 0.002,
  "generate-mashup": 0.002,
  "generate-lyrics": 0.001,
  "generate-sounds": 0.002,
  "suno-voice-generate": 0.002,
  "generate-midi": 0.002,
  "create-music-video": 0.005,
  "separate-vocals": 0.002,
  "convert-to-wav": 0.001,
  "boost-music-style": 0.002,
  "audio-isolation": 0.01,
  "elevenlabs-audio-isolation": 0.01,

  // LLM (per call, approximate based on KIE pricing)
  "gemini-2.5-flash": 0.001,
  "gemini-2.5-flash-openai": 0.001,
  "gemini-3-flash": 0.002,
  "gemini-3-flash-v1beta": 0.002,
  "gemini-3-5-flash": 0.002,
  "gemini-3-5-flash-openai": 0.002,
  "gemini-3-6-flash": 0.002,
  "gemini-3-6-flash-openai": 0.002,
  "gemini-2-5-pro": 0.005,
  "gemini-3-pro": 0.01,
  "gemini-3-1-pro": 0.01,
  "claude-haiku-4-5": 0.002,
  "claude-opus-4-5": 0.005,
  "claude-opus-4-6": 0.005,
  "claude-opus-4-7": 0.005,
  "claude-opus-4-8": 0.005,
  "claude-opus-5": 0.005,
  "claude-sonnet-4-5": 0.003,
  "claude-sonnet-4-6": 0.003,
  "cluade-fable-5": 0.003,
  "cluade-sonnet-5": 0.003,
  "gpt-5-2": 0.005,
  "gpt-5-4": 0.005,
  "gpt-5-5": 0.005,
  "gpt-5-6-luna": 0.005,
  "gpt-5-6-sol": 0.005,
  "gpt-5-6-terra": 0.005,
  "grok-4-3": 0.003,
  "grok-4-5": 0.003,
  "gpt-codex": 0.005,
  "gemini-2.5-flash-llm": 0.000645,
};

// Default pricing by task type (fallback when no override exists)
const DEFAULT_PRICING = {
  "text-to-image": 0.03,
  "image-to-image": 0.04,
  "text-to-video": 0.30,
  "image-to-video": 0.30,
  "video-to-video": 0.30,
  "text-to-speech": 0.05,
  "text-to-music": 0.002,
  "audio": 0.005,
  "tts": 0.05,
  "lip-sync": 0.10,
  "speech-to-video": 0.10,
  "video-upscale": 0.025,
  "image-upscale": 0.01,
  "chat": 0.001,
  "llm": 0.001,
};

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
  if (p.includes("chat") || p.includes("claude") || p.includes("gemini") || p.includes("grok") || p.includes("codex")) return "llm";
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
        displayName: inferred?.displayName || modelId.split(/[-/]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        type,
        capability,
        inputModalities: inferred?.inputModalities || ["text"],
        outputModalities: inferred?.outputModalities || [type === "audio" ? "audio" : type.includes("v") || type === "video" || type === "lipsync" ? "video" : "image"],
        inputSchema: defaultSchemaForCapability(capability),
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
function getPricing(modelId, type) {
  // Check overrides first
  if (KIE_PRICING_OVERRIDES[modelId]) {
    return KIE_PRICING_OVERRIDES[modelId];
  }
  
  // Try matching by partial key — only if key is a meaningful prefix/suffix
  for (const [key, price] of Object.entries(KIE_PRICING_OVERRIDES)) {
    // Only match if the key is at least 5 chars and is a prefix or suffix
    if (key.length >= 5 && (modelId.startsWith(key) || modelId.endsWith(key) || key.startsWith(modelId) || key.endsWith(modelId))) {
      return price;
    }
  }
  
  // Fall back to default pricing by type
  const typeKey = type === "image" ? "text-to-image" :
                  type === "i2i" ? "image-to-image" :
                  type === "video" ? "text-to-video" :
                  type === "i2v" ? "image-to-video" :
                  type === "v2v" ? "video-to-video" :
                  type === "lipsync" ? "lip-sync" :
                  type === "audio" ? "text-to-music" :
                  type === "llm" ? "chat" : "text-to-image";
  
  return DEFAULT_PRICING[typeKey] || 0.03;
}

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
    const providerCost = getPricing(model.modelId, model.type);
    const creditsCost = calculateCredits(providerCost, MARKUP);
    const pricingRules = { currency: "USD", unit: model.type === "image" || model.type === "i2i" ? "image" : "fixed", rules: [{ price: providerCost }] };
    const modelData = {
      modelType: model.type,
      providerName: "KIE",
      providerModelId: model.providerModelId,
      endpoint: model.endpoint,
      displayName: model.displayName,
      description: `${model.displayName} via the KIE Market API.`,
      capability: model.capability,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      inputSchema: model.inputSchema,
      constraints: model.inputSchema?.ui || {},
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
      isActive: true,
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
