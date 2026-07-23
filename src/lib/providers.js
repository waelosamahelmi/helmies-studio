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
  wavespeed: {
    name: "WaveSpeed",
    type: "image+video+audio+lipsync",
    baseUrl: "https://api.wavespeed.ai",
    getKey: () => process.env.WAVESPEED_KEY,
    buildUrl: (endpoint) => `/api/v3/${endpoint}`,
    buildPollUrl: (baseUrl, requestId) => `${baseUrl}/api/v3/predictions/${requestId}/result`,
    isSync: false,
    apiVersion: 3,
  },
  atlas: {
    name: "Atlas Cloud",
    type: "image+video",
    baseUrl: "https://api.atlascloud.ai",
    getKey: () => process.env.ATLAS_KEY,
    buildUrl: (endpoint) => `/api/v1/${endpoint}`,
    buildPollUrl: (baseUrl, requestId) => `${baseUrl}/api/v1/predictions/${requestId}/result`,
    isSync: false,
    apiVersion: 1,
  },
  alibaba: {
    name: "Alibaba Cloud (Qwen)",
    type: "image+video+llm",
    baseUrl: process.env.ALIBABA_WORKSPACE_ID
      ? `https://${process.env.ALIBABA_WORKSPACE_ID}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
      : "https://dashscope.aliyuncs.com",
    getKey: () => process.env.ALIBABA_KEY,
    buildUrl: (endpoint) => `/api/v1/${endpoint}`,
    buildPollUrl: (baseUrl, requestId) => `${baseUrl}/api/v1/predictions/${requestId}/result`,
    isSync: false,
    apiVersion: 1,
  },
  openrouter: {
    name: "OpenRouter",
    type: "llm",
    baseUrl: "https://openrouter.ai/api/v1",
    getKey: () => process.env.OPENROUTER_KEY,
    buildUrl: () => `/chat/completions`,
    buildPollUrl: () => null,
    isSync: true,
    apiVersion: 1,
  },
};

const DEFAULT_PROVIDER = "wavespeed";

export function getProvider(name) {
  return PROVIDERS[name] || PROVIDERS[DEFAULT_PROVIDER];
}

export function getActiveProviders() {
  return Object.entries(PROVIDERS).filter(([_, p]) => {
    try { return !!p.getKey(); } catch { return false; }
  });
}

// ── Resolve which provider to use for a given model ──
// Checks DB ModelPricing → ProviderConfig, falls back to WaveSpeed
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
  return { name: DEFAULT_PROVIDER, ...PROVIDERS[DEFAULT_PROVIDER] };
}

// Resolve the correct endpoint slug for a model on a given provider.
// Falls back to the model's default `endpoint` field if no provider-specific override exists.
export function resolveEndpoint(model, providerName) {
  if (model.endpoints && model.endpoints[providerName]) {
    return model.endpoints[providerName];
  }
  return model.endpoint || model.id;
}

// ── Universal submit+poll ──
export async function submitAndPoll(providerName, endpoint, payload, maxAttempts = 900, interval = 2000) {
  const { provider, requestId, submitData } = await submitOnly(providerName, endpoint, payload);
  if (!requestId) return submitData;

  const key = provider.apiKey || provider.getKey();
  const pollUrl = provider.buildPollUrl
    ? provider.buildPollUrl(provider.baseUrl, requestId)
    : `${provider.baseUrl}/api/v3/predictions/${requestId}/result`;

  let pollInterval = interval;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const pollRes = await fetch(pollUrl, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!pollRes.ok) {
        if (pollRes.status >= 500) continue;
        const txt = await pollRes.text();
        throw new Error(brandError(txt));
      }
      const body = await pollRes.json();
      const data = provider.apiVersion >= 3 ? (body.data || body) : body;
      const status = data.status?.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") {
        return provider.apiVersion >= 3
          ? { ...data, outputs: data.outputs, url: data.outputs?.[0], outputUrl: data.outputs?.[0] }
          : data;
      }
      if (status === "failed" || status === "error") throw new Error(brandError(data.error || ""));
      pollInterval = Math.min(10000, pollInterval + 1000);
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error(BRANDED_ERRORS.timeout);
}

// ── Submit only (no polling) — returns requestId for webhook/async flows ──
export async function submitOnly(providerName, endpoint, payload) {
  let provider;
  if (typeof providerName === "object" && providerName.name) {
    provider = providerName;
  } else {
    provider = getProvider(providerName);
  }
  const key = provider.apiKey || provider.getKey();
  const path = provider.buildUrl ? provider.buildUrl(endpoint) : `/api/v3/${endpoint}`;
  const url = `${provider.baseUrl}${path}`;

  const headers = { "Content-Type": "application/json" };
  if (provider.apiVersion >= 3) {
    headers["Authorization"] = `Bearer ${key}`;
  } else {
    headers["x-api-key"] = key;
    headers["Authorization"] = `Bearer ${key}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const body = await res.json();
  const data = provider.apiVersion >= 3 ? (body.data || body) : body;
  const requestId = data.request_id || data.id;
  return { provider, requestId, submitData: data };
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
const FALLBACK_CHAIN = ["wavespeed", "atlas", "alibaba"];

export async function resolveProviderWithFallback(modelId) {
  const primary = await resolveProvider(modelId);
  const chain = [primary.name, ...FALLBACK_CHAIN.filter((n) => n !== primary.name)];
  return chain.map((name) => {
    const p = PROVIDERS[name];
    return p ? { name, ...p } : null;
  }).filter(Boolean);
}

// ── Fetch live model list from WaveSpeed ──
export async function fetchWaveSpeedModels() {
  const key = process.env.WAVESPEED_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.wavespeed.ai/api/v3/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    if (body.code !== 200) return [];
    return (body.data || []).map((m) => ({
      id: m.model_id,
      name: m.name,
      basePrice: m.base_price,
      type: m.type,
      description: m.description,
      apiSchema: m.api_schema?.api_schemas?.[0] || null,
    }));
  } catch {
    return [];
  }
}

// ── Fetch live pricing for a specific model from WaveSpeed ──
export async function fetchWaveSpeedPricing(modelId, inputs = {}) {
  const key = process.env.WAVESPEED_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.wavespeed.ai/api/v3/model/pricing", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, inputs }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.code !== 200) return null;
    return body.data;
  } catch {
    return null;
  }
}

// ── Fetch live account balance from WaveSpeed ──
export async function fetchWaveSpeedBalance() {
  const key = process.env.WAVESPEED_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.wavespeed.ai/api/v3/balance", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body.code !== 200) return null;
    return body.data;
  } catch {
    return null;
  }
}