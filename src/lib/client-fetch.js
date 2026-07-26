const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function fetchWithTimeout(input, init, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(input, init = {}) {
  const timeout = init.timeout || DEFAULT_TIMEOUT;
  const retries = init.retries ?? MAX_RETRIES;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, timeout);

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("auth:required"));
        }
        throw new ApiError("Unauthorized", 401);
      }

      if (res.status === 429 && attempt < retries) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : RETRY_DELAY * (attempt + 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        let data;
        try { data = await res.json(); } catch { data = null; }
        throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
      }

      return res;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e.name === "AbortError") throw new ApiError("Request timed out", 408);
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new ApiError("Network error", 0);
}

export async function apiJson(input, init = {}) {
  const res = await apiFetch(input, init);
  return res.json();
}
