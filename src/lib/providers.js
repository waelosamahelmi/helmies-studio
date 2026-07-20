import prisma from "@/lib/prisma";

const BRANDED_ERRORS = {
  rate_limit: "Too many requests. Please wait a moment and try again.",
  invalid_api_key: "Provider authentication failed. Our team has been notified.",
  model_not_found: "This model is temporarily unavailable. Please try another.",
  timeout: "The request took too long. Please try again.",
  content_filter: "The request was blocked by safety filters.",
  insufficient_balance: "Provider balance is low. Please contact support.",
  server_error: "Something went wrong on our end. Please try again.",
  unknown: "An unexpected error occurred. Please try again.",
};

export function brandError(providerError) {
  const lower = (providerError || "").toLowerCase();
  if (lower.includes("rate") || lower.includes("429")) return BRANDED_ERRORS.rate_limit;
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401")) return BRANDED_ERRORS.invalid_api_key;
  if (lower.includes("not found") || lower.includes("404")) return BRANDED_ERRORS.model_not_found;
  if (lower.includes("timeout") || lower.includes("timed out")) return BRANDED_ERRORS.timeout;
  if (lower.includes("content") || lower.includes("filter") || lower.includes("safety")) return BRANDED_ERRORS.content_filter;
  if (lower.includes("balance") || lower.includes("credit") || lower.includes("insufficient")) return BRANDED_ERRORS.insufficient_balance;
  if (lower.includes("500") || lower.includes("502") || lower.includes("503") || lower.includes("server")) return BRANDED_ERRORS.server_error;
  return BRANDED_ERRORS.unknown;
}

export async function logProviderError(provider, endpoint, originalError, userId) {
  console.error(`[Provider:${provider}] ${endpoint}:`, originalError);
  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "provider_error",
        resource: provider,
        resourceId: endpoint,
        metadata: { error: originalError?.slice(0, 500) },
      },
    }).catch(() => {});
  }
}

// ── Provider registry ──
const PROVIDERS = {
  muapi: {
    name: "MuAPI",
    type: "image+video+audio+lipsync",
    baseUrl: "https://api.muapi.ai",
    getKey: () => process.env.MUAPI_KEY,
  },
  atlas: {
    name: "Atlas Cloud",
    type: "image+video",
    baseUrl: "https://api.atlascloud.ai",
    getKey: () => process.env.ATLAS_KEY,
  },
  alibaba: {
    name: "Alibaba Cloud (Qwen)",
    type: "image+video+llm",
    baseUrl: process.env.ALIBABA_WORKSPACE_ID
      ? `https://${process.env.ALIBABA_WORKSPACE_ID}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
      : "https://dashscope.aliyuncs.com",
    getKey: () => process.env.ALIBABA_KEY,
  },
  wavespeed: {
    name: "WaveSpeed",
    type: "image+video",
    baseUrl: "https://api.wavespeed.ai",
    getKey: () => process.env.WAVESPEED_KEY,
  },
  openrouter: {
    name: "OpenRouter",
    type: "llm",
    baseUrl: "https://openrouter.ai/api/v1",
    getKey: () => process.env.OPENROUTER_KEY,
  },
};

export function getProvider(name) {
  return PROVIDERS[name] || PROVIDERS.muapi;
}

export function getActiveProviders() {
  return Object.entries(PROVIDERS).filter(([_, p]) => {
    try { return !!p.getKey(); } catch { return false; }
  });
}

// ── Resolve which provider to use for a given model ──
// Checks DB ModelPricing → ProviderConfig, falls back to MuAPI
export async function resolveProvider(modelId) {
  try {
    const pricing = await prisma.modelPricing.findUnique({ where: { modelId } });
    if (pricing?.providerName) {
      const dbProvider = await prisma.providerConfig.findFirst({ where: { name: pricing.providerName, isActive: true } });
      if (dbProvider) {
        const envProvider = PROVIDERS[dbProvider.name.toLowerCase()];
        if (envProvider) return { name: dbProvider.name.toLowerCase(), ...envProvider, apiKey: dbProvider.apiKey, baseUrl: dbProvider.baseUrl || envProvider.baseUrl, markup: dbProvider.markup };
      }
    }
  } catch {}
  return { name: "muapi", ...PROVIDERS.muapi };
}

// ── Universal submit+poll ──
export async function submitAndPoll(providerName, endpoint, payload, maxAttempts = 900, interval = 2000) {
  let provider;
  if (typeof providerName === "object" && providerName.name) {
    provider = providerName;
  } else {
    provider = getProvider(providerName);
  }
  const url = `${provider.baseUrl}/api/v1/${endpoint}`;
  const key = provider.apiKey || provider.getKey();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    const branded = brandError(txt);
    throw new Error(branded);
  }

  const submitData = await res.json();
  const requestId = submitData.request_id || submitData.id;
  if (!requestId) return submitData;

  const pollUrl = `${provider.baseUrl}/api/v1/predictions/${requestId}/result`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const pollRes = await fetch(pollUrl, {
        headers: { "Content-Type": "application/json", "x-api-key": key, Authorization: `Bearer ${key}` },
      });
      if (!pollRes.ok) {
        if (pollRes.status >= 500) continue;
        const txt = await pollRes.text();
        throw new Error(brandError(txt));
      }
      const data = await pollRes.json();
      const status = data.status?.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") return data;
      if (status === "failed" || status === "error") throw new Error(brandError(data.error || ""));
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error(BRANDED_ERRORS.timeout);
}

// ── LLM completion (OpenRouter) ──
export async function llmComplete(messages, options = {}) {
  const provider = getProvider("openrouter");
  const key = provider.getKey();
  if (!key) throw new Error("LLM provider not configured");

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
      "X-Title": "Helmies Studio",
    },
    body: JSON.stringify({
      model: options.model || "qwen/qwen-2.5-72b-instruct",
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── LLM streaming (OpenRouter) ──
export async function llmStream(messages, options = {}) {
  const provider = getProvider("openrouter");
  const key = provider.getKey();
  if (!key) throw new Error("LLM provider not configured");

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://studio.helmies.fi",
      "X-Title": "Helmies Studio",
    },
    body: JSON.stringify({
      model: options.model || "qwen/qwen-2.5-72b-instruct",
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  return res.body;
}

// ── Provider-level fallback chain ──
const FALLBACK_CHAIN = ["muapi", "wavespeed", "atlas"];

export async function resolveProviderWithFallback(modelId) {
  const primary = await resolveProvider(modelId);
  const chain = [primary.name, ...FALLBACK_CHAIN.filter((n) => n !== primary.name)];
  return chain.map((name) => {
    const p = PROVIDERS[name];
    return p ? { name, ...p } : null;
  }).filter(Boolean);
}