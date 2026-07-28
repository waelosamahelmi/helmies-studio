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
        metadata: { error: (originalError || "").slice(0, 500) },
      },
    }).catch(() => {});
  }
}

const MODEL_ENDPOINT_MAP = {
  // Image T2I
  "nano-banana": "google/nano-banana/text-to-image",
  "nano-banana-2-lite": "google/nano-banana-2-lite/text-to-image",
  "nano-banana-pro": "google/nano-banana-pro/text-to-image",
  "imagen4": "google/imagen4",
  "imagen4-fast": "google/imagen4-fast",
  "imagen4-ultra": "google/imagen4-ultra",
  "flux-dev": "wavespeed-ai/flux-dev",
  "flux-schnell": "wavespeed-ai/flux-schnell",
  "flux-2-dev": "wavespeed-ai/flux-2-dev/text-to-image",
  "flux-2-pro": "wavespeed-ai/flux-2-pro/text-to-image",
  "flux-2-flex": "wavespeed-ai/flux-2-flex/text-to-image",
  "flux-kontext-dev": "wavespeed-ai/flux-kontext-dev",
  "flux-kontext-pro": "wavespeed-ai/flux-kontext-pro",
  "midjourney": "midjourney/text-to-image",
  "gpt-image-1.5": "openai/gpt-image-1.5/text-to-image",
  "gpt-image-2": "openai/gpt-image-2/text-to-image",
  "seedream-v4": "bytedance/seedream-v4",
  "seedream-5-lite": "bytedance/seedream-v5.0-lite",
  "seedream-5-pro": "bytedance/seedream-v5.0-pro",
  "qwen-image": "wavespeed-ai/qwen-image/text-to-image",
  "wan-2.7-image": "alibaba/wan-2.7/text-to-image",
  "wan-2.7-image-pro": "alibaba/wan-2.7/text-to-image-pro",
  "grok-imagine-text-to-image": "x-ai/grok-imagine-image/text-to-image",
  "ideogram-v3": "ideogram-ai/ideogram-v3-balanced",
  "hunyuan-image-3": "wavespeed-ai/hunyuan-image-3",
  "kling-text-to-image": "kwaivgi/kling-image-o1",
  "z-image": "wavespeed-ai/z-image/base",
  // I2I
  "flux-kontext-dev-edit": "wavespeed-ai/flux-kontext-dev",
  "flux-kontext-pro-edit": "wavespeed-ai/flux-kontext-pro/multi",
  "nano-banana-edit": "google/nano-banana/edit",
  "nano-banana-pro-edit": "google/nano-banana-pro/edit",
  "gpt-image-1.5-edit": "openai/gpt-image-1.5/edit",
  "gpt-image-2-edit": "openai/gpt-image-2/edit",
  "seedream-v4-edit": "bytedance/seedream-v4/edit",
  "seedream-5-pro-edit": "bytedance/seedream-v5.0-pro/edit",
  "kling-image-edit": "kwaivgi/kling-image-o3/edit",
  "ideogram-v3-edit": "ideogram-ai/ideogram-v3-quality",
  "ideogram-v3-remix": "ideogram-ai/ideogram-v3-quality",
  "image-upscale": "pruna-ai/p-image/upscale",
  "remove-background": "ideogram-ai/remove-background",
  "crisp-upscale": "recraft-ai/recraft-crisp-upscale",
  // Video T2V
  "veo3": "google/veo3/text-to-video",
  "veo3-fast": "google/veo3-fast/text-to-video",
  "sora-2": "openai/sora-2/text-to-video",
  "kling-3-0": "kwaivgi/kling-v3.0-std/text-to-video",
  "kling-v2.1-master": "kwaivgi/kling-v2.1-t2v-master",
  "kling-v2.5-turbo-pro": "kwaivgi/kling-v2.5-turbo-pro/text-to-video",
  "kling-v3-turbo": "kwaivgi/kling-v3-turbo-std/text-to-video",
  "kling-text-to-video": "kwaivgi/kling-video-o1/text-to-video",
  "seedance-2": "bytedance/seedance-2.0/text-to-video",
  "seedance-2-fast": "bytedance/seedance-2.0-fast/text-to-video",
  "seedance-2-mini": "bytedance/seedance-2.0-mini/text-to-video",
  "seedance-1.5-pro": "bytedance/seedance-v1.5-pro/text-to-video",
  "hailuo-02-standard": "minimax/hailuo-02/standard",
  "hailuo-02-pro": "minimax/hailuo-02/pro",
  "hailuo-2.3": "minimax/hailuo-2.3/t2v-standard",
  "wan-2.5-t2v": "alibaba/wan-2.5/text-to-video",
  "wan-2.6-t2v": "alibaba/wan-2.6/text-to-video",
  "wan-2.7-t2v": "alibaba/wan-2.7/text-to-video",
  "grok-imagine-text-to-video": "x-ai/grok-imagine-video/text-to-video",
  "runway-aleph": "runwayml/gen4-aleph",
  // I2V
  "veo3-i2v": "google/veo3/image-to-video",
  "kling-v2.1-standard-i2v": "kwaivgi/kling-v2.1-i2v-standard",
  "kling-v2.1-pro-i2v": "kwaivgi/kling-v2.1-i2v-pro",
  "kling-v2.1-master-i2v": "kwaivgi/kling-v2.1-i2v-master",
  "kling-v2.5-turbo-pro-i2v": "kwaivgi/kling-v2.5-turbo-pro/image-to-video",
  "kling-v3-turbo-i2v": "kwaivgi/kling-v3-turbo-std/image-to-video",
  "kling-image-to-video": "kwaivgi/kling-video-o1/image-to-video",
  "seedance-2-i2v": "bytedance/seedance-2.0/image-to-video",
  "seedance-1.5-pro-i2v": "bytedance/seedance-v1.5-pro/image-to-video",
  "hailuo-02-i2v-standard": "minimax/hailuo-02/i2v-standard",
  "hailuo-02-i2v-pro": "minimax/hailuo-02/i2v-pro",
  "hailuo-2.3-i2v": "minimax/hailuo-2.3/i2v-standard",
  "hailuo-2.3-pro-i2v": "minimax/hailuo-2.3/i2v-pro",
  "wan-2.5-i2v": "alibaba/wan-2.5/image-to-video",
  "wan-2.6-i2v": "alibaba/wan-2.6/image-to-video",
  "wan-2.6-flash-i2v": "alibaba/wan-2.6/image-to-video-flash",
  "wan-2.7-i2v": "alibaba/wan-2.7/image-to-video",
  "wan-2.2-turbo-i2v": "wavespeed-ai/wan-2.2/image-to-video",
  // V2V
  "wan-2.6-v2v": "alibaba/wan-2.6/image-to-video",
  "wan-2.6-flash-v2v": "alibaba/wan-2.6/image-to-video-flash",
  "wan-2.7-video-edit": "alibaba/wan-2.7/video-edit",
  "video-upscale": "wavespeed-ai/video-upscaler",
  "kling-ai-avatar-standard": "kwaivgi/kling-v2-ai-avatar-standard",
  "kling-ai-avatar-pro": "kwaivgi/kling-v2-ai-avatar-pro",
  "wan-animate-move": "wavespeed-ai/wan-2.2/animate",
  "wan-animate-replace": "wavespeed-ai/wan-2.2/animate",
  // Lipsync
  "wan-speech-to-video": "wavespeed-ai/wan-2.2/speech-to-video",
  "infinitetalk": "wavespeed-ai/infinitetalk",
  "volcengine-lipsync": "sync/lipsync-3",
  // Audio
  "elevenlabs-tts-turbo": "elevenlabs/turbo-v2.5",
  "elevenlabs-tts-multilingual": "elevenlabs/multilingual-v2",
  "elevenlabs-tts-v3": "elevenlabs/eleven-v3",
  "audio-isolation": "elevenlabs/multilingual-v1",
  // Extend
  "veo3-extend": "google/veo3/video-extend",
  "grok-imagine-extend": "x-ai/grok-imagine-video/video-extend",
  "runway-extend": "runwayml/gen4-turbo",
  // Audio downmix
  "lipsync": "sync/lipsync-3",
};

// Seedream/Seedance variants
const SEEDREAM_MAP = {
  "seedream-v4": "bytedance/seedream-v4",
  "seedream-5-lite": "bytedance/seedream-v5.0-lite",
  "seedream-5-pro": "bytedance/seedream-v5.0-pro",
  "seedream-v4-edit": "bytedance/seedream-v4/edit",
  "seedream-5-pro-edit": "bytedance/seedream-v5.0-pro/edit",
};


const PROVIDERS = {
  wavespeed: {
    name: "WaveSpeed",
    type: "image+video+audio+lipsync+recast",
    baseUrl: "https://api.wavespeed.ai",
    getKey: () => process.env.WAVESPEED_KEY,
    buildUrl: (endpoint) => {
      const mapped = MODEL_ENDPOINT_MAP[endpoint] || endpoint;
      return `/api/v3/${mapped}`;
    },
    formatPayload: (model, prompt, params) => {
      const { endpoint: _ep, callBackUrl: _cb, webhook_url: _wh, ...rest } = params;
      return { prompt, ...rest };
    },
    parseResult: (data) => ({
      requestId: data.id || data.request_id,
      status: data.status,
      outputs: data.outputs || [],
    }),
    isSync: false,
    apiVersion: 3,
  },
  kie: {
    name: "KIE",
    type: "llm+generation",
    baseUrl: "https://api.kie.ai",
    getKey: () => process.env.KIE_KEY,
    buildUrl: () => "/api/v1/jobs/createTask",
    formatPayload: (model, prompt, params) => {
      const { endpoint: _ep, ...rest } = params;
      return {
        model,
        input: { prompt, ...rest },
        callBackUrl: params.callBackUrl || params.webhook_url || `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`,
      };
    },
    parseResult: (data) => ({
      requestId: data.data?.taskId || data.data?.request_id,
      status: data.data?.state || data.status,
      outputs: [],
    }),
    isSync: false,
    apiVersion: 1,
  },
};

const LLM_PROVIDER = {
  baseUrl: "http://localhost:11434",
  getKey: () => "ollama",
  defaultModel: "llama3.2:3b",
  models: {
    "gemini-2.5-flash": "llama3.2:3b",
    "gemini-2.5-flash-openai": "llama3.2:3b",
    "gemini-2.5-pro": "llama3.2:3b",
    "google/gemini-2.5-flash-openai": "llama3.2:3b",
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

export async function resolveProvider(modelId) {
  try {
    const pricing = await prisma.modelPricing.findUnique({ where: { modelId } });
    if (pricing?.providerName) {
      const name = pricing.providerName.toLowerCase();
      const p = PROVIDERS[name] || PROVIDERS.wavespeed;
      return { name, ...p, apiKey: p.getKey() };
    }
  } catch {}
  return { name: "wavespeed", ...PROVIDERS.wavespeed, apiKey: PROVIDERS.wavespeed.getKey() };
}

export async function submitOnly(providerName, endpoint, payload) {
  let provider;
  if (typeof providerName === "object" && providerName.name) {
    provider = providerName;
  } else {
    provider = getProvider(providerName);
  }
  const key = provider.apiKey || provider.getKey();
  if (!key) throw new Error(brandError("invalid_api_key"));

  const { model, prompt, ...params } = payload;
  const apiPath = provider.buildUrl(endpoint);
  const url = `${provider.baseUrl}${apiPath}`;
  const body = provider.formatPayload(model || endpoint, prompt, params);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const result = await res.json();
  const responseData = result.data || result;
  const parsed = provider.parseResult ? provider.parseResult(responseData) : { requestId: responseData.request_id || responseData.id, outputs: responseData.outputs || [] };
  const requestId = parsed.requestId;

  if (!requestId) {
    if (parsed.outputs && parsed.outputs.length > 0) {
      return { provider, requestId: null, submitData: result, immediateResult: responseData };
    }
    if (responseData.outputs && responseData.outputs.length > 0) {
      return { provider, requestId: null, submitData: result, immediateResult: responseData };
    }
    throw new Error(brandError(result.message || result.msg || responseData.error || "No task ID returned"));
  }

  return { provider, requestId, submitData: result };
}

export async function submitAndPoll(providerName, endpoint, payload, maxAttempts = 900, interval = 2000) {
  const { provider, requestId, submitData, immediateResult } = await submitOnly(providerName, endpoint, payload);

  if (immediateResult) {
    const outputs = immediateResult.outputs || immediateResult.output || [];
    return { ...immediateResult, outputs, url: outputs[0], outputUrl: outputs[0] };
  }

  if (!requestId) return submitData;

  const key = provider.apiKey || provider.getKey();

  let pollInterval = interval;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const pollUrl = `${provider.baseUrl}/api/v3/predictions/${requestId}/result`;
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
      const data = body.data || body;
      const status = (data.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") {
        const outputs = data.outputs || data.output || [];
        return { ...data, outputs, url: outputs[0], outputUrl: outputs[0] };
      }
      if (status === "failed" || status === "error") throw new Error(brandError(data.error || data.message || ""));
      if (status === "created" || status === "pending" || status === "processing") {
        pollInterval = Math.min(10000, pollInterval + 1000);
        continue;
      }
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error(BRANDED_ERRORS.timeout);
}

export async function llmComplete(messages, options = {}) {
  const p = LLM_PROVIDER;
  const modelId = p.models[options.model] || p.defaultModel;

  const systemMsg = messages.find(m => m.role === "system");
  const chatMessages = systemMsg ? messages.filter(m => m.role !== "system") : messages;

  const body = {
    model: modelId,
    messages: chatMessages,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2000,
    },
  };
  if (systemMsg) body.system = systemMsg.content;

  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout || 60000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const data = await res.json();
  return data.message?.content || "";
}

export async function llmStream(messages, options = {}) {
  const p = LLM_PROVIDER;
  const modelId = p.models[options.model] || p.defaultModel;

  const systemMsg = messages.find(m => m.role === "system");
  const chatMessages = systemMsg ? messages.filter(m => m.role !== "system") : messages;

  const body = {
    model: modelId,
    messages: chatMessages,
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2000,
    },
  };
  if (systemMsg) body.system = systemMsg.content;

  const res = await fetch(`${p.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout || 120000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  return res.body;
}

const FALLBACK_CHAIN = ["wavespeed", "kie"];

export async function resolveProviderWithFallback(modelId) {
  const primary = await resolveProvider(modelId);
  const chain = [primary.name, ...FALLBACK_CHAIN.filter((n) => n !== primary.name)];
  return chain.map((name) => {
    const p = PROVIDERS[name];
    return p ? { name, ...p, apiKey: p.getKey() } : null;
  }).filter(Boolean);
}

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
      apiPath: m.api_schema?.api_schemas?.[0]?.api_path || null,
      apiSchema: m.api_schema?.api_schemas?.[0] || null,
    }));
  } catch {
    return [];
  }
}

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
