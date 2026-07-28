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

const PROVIDERS = {
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
      requestId: data.taskId || data.data?.taskId || data.request_id || data.data?.request_id,
      status: data.state || data.data?.state || data.status,
      outputs: [],
    }),
    buildPollUrl: (requestId) => `/api/v1/jobs/recordInfo?taskId=${requestId}`,
    parsePoll: (data) => {
      let outputs = [];
      if (data.resultJson) {
        try {
          const r = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson;
          outputs = r.resultUrls || r.result_urls || [];
        } catch {}
      }
      return { status: (data.state || "").toLowerCase(), outputs, error: data.failMsg || data.error };
    },
    isSync: false,
    apiVersion: 1,
  },
  alibaba: {
    name: "Alibaba",
    type: "image+video",
    get baseUrl() {
      const workspaceId = process.env.ALIBABA_WORKSPACE_ID;
      return workspaceId
        ? `https://${workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`
        : "https://dashscope.aliyuncs.com/compatible-mode/v1";
    },
    getKey: () => process.env.ALIBABA_KEY,
    buildUrl: (endpoint) => {
      const e = (endpoint || "").toLowerCase();
      if (e.includes("video") || e.includes("t2v") || e.includes("i2v") || e.includes("v2v") || e.startsWith("wan-2")) {
        return "/video/generations";
      }
      return "/images/generations";
    },
    formatPayload: (model, prompt, params) => {
      const { endpoint: _ep, callBackUrl: _cb, webhook_url: _wh, ...rest } = params;
      return { model, input: { prompt, ...rest } };
    },
    parseResult: (data) => {
      // Image generations return synchronously as an array of { url }
      if (Array.isArray(data)) {
        return { requestId: null, status: "succeeded", outputs: data.map((d) => d?.url).filter(Boolean) };
      }
      return {
        requestId: data.task_id || data.id,
        status: data.status,
        outputs: data.output ? [data.output.video_url || data.output.url].filter(Boolean) : [],
      };
    },
    buildPollUrl: (requestId) => `/video/generations/${requestId}`,
    parsePoll: (data) => ({
      status: (data.status || "").toLowerCase(),
      outputs: data.output ? [data.output.video_url || data.output.url].filter(Boolean) : [],
      error: data.error,
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

const DEFAULT_PROVIDER = "kie";

// Map any providerName (DB ModelPricing.providerName, ProviderConfig.name) to an adapter key.
// Unknown names resolve to KIE (the primary provider) — never to a removed provider.
function resolveAdapterKey(providerName) {
  const n = (providerName || "").toLowerCase();
  if (n.includes("alibaba") || n.includes("qwen") || n.includes("dashscope")) return "alibaba";
  if (n.includes("kie")) return "kie";
  return "kie";
}

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
      const name = resolveAdapterKey(pricing.providerName);
      const p = PROVIDERS[name];
      return { name, ...p, apiKey: p.getKey() };
    }
  } catch {}
  const p = PROVIDERS[DEFAULT_PROVIDER];
  return { name: DEFAULT_PROVIDER, ...p, apiKey: p.getKey() };
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
      return { provider, requestId: null, submitData: result, immediateResult: { ...responseData, outputs: parsed.outputs } };
    }
    if (responseData.outputs && responseData.outputs.length > 0) {
      return { provider, requestId: null, submitData: result, immediateResult: responseData };
    }
    throw new Error(brandError(result.message || result.msg || responseData.error || "No task ID returned"));
  }

  return { provider, requestId, submitData: result };
}

function defaultParsePoll(data) {
  const outputs = data.outputs || (data.output ? [data.output.video_url || data.output.url].filter(Boolean) : []);
  return { status: (data.status || data.state || "").toLowerCase(), outputs, error: data.error || data.message };
}

export async function pollProviderResult(provider, requestId, maxAttempts = 900, interval = 2000) {
  const key = provider.apiKey || provider.getKey();

  let pollInterval = interval;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    try {
      const pollPath = provider.buildPollUrl
        ? provider.buildPollUrl(requestId)
        : `/api/v1/jobs/recordInfo?taskId=${requestId}`;
      const pollRes = await fetch(`${provider.baseUrl}${pollPath}`, {
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
      const parsed = provider.parsePoll ? provider.parsePoll(data) : defaultParsePoll(data);
      const status = (parsed.status || "").toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") {
        const outputs = parsed.outputs || [];
        return { ...data, outputs, url: outputs[0], outputUrl: outputs[0] };
      }
      if (status === "failed" || status === "error" || status === "fail") {
        throw new Error(brandError(parsed.error || ""));
      }
      // pending/waiting/generating/processing — keep polling with gentle backoff
      pollInterval = Math.min(10000, pollInterval + 1000);
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error(BRANDED_ERRORS.timeout);
}

export async function submitAndPoll(providerName, endpoint, payload, maxAttempts = 900, interval = 2000) {
  const { provider, requestId, submitData, immediateResult } = await submitOnly(providerName, endpoint, payload);

  if (immediateResult) {
    const outputs = immediateResult.outputs || immediateResult.output || [];
    return { ...immediateResult, outputs, url: outputs[0], outputUrl: outputs[0] };
  }

  if (!requestId) return submitData;

  return pollProviderResult(provider, requestId, maxAttempts, interval);
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

// Media provider fallback order: KIE primary, Alibaba secondary.
const FALLBACK_CHAIN = ["kie", "alibaba"];

// Reads ProviderConfig activity for media adapters only.
// Returns null when no config rows exist (env-only mode → all providers eligible).
async function getProviderActivity() {
  try {
    const rows = await prisma.providerConfig.findMany({ select: { name: true, isActive: true } });
    if (!rows.length) return null;
    const activity = {};
    for (const row of rows) {
      const n = (row.name || "").toLowerCase();
      // Only media adapters participate in the fallback chain; unrelated configs (e.g. OpenRouter) are ignored here.
      if (n.includes("alibaba") || n.includes("qwen") || n.includes("dashscope")) activity.alibaba = row.isActive;
      else if (n.includes("kie")) activity.kie = row.isActive;
    }
    return activity;
  } catch {
    return null;
  }
}

export async function resolveProviderWithFallback(modelId) {
  const primary = await resolveProvider(modelId);
  const activity = await getProviderActivity();
  const chain = [primary.name, ...FALLBACK_CHAIN.filter((n) => n !== primary.name)];
  return chain
    .filter((name) => !activity || activity[name] !== false)
    .map((name) => {
      const p = PROVIDERS[name];
      return p ? { name, ...p, apiKey: p.getKey() } : null;
    })
    .filter(Boolean);
}
