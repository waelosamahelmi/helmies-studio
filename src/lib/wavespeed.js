import { getProvider, brandError } from "@/lib/providers";

export async function wavespeedSyncImage(params) {
  const provider = getProvider("wavespeed");
  const key = provider.getKey();
  if (!key) throw new Error("WaveSpeed API key not configured");

  const endpoint = params.endpoint || params.model;
  const url = `${provider.baseUrl}/api/v3/${endpoint}`;

  const payload = { prompt: params.prompt, enable_sync_mode: true };
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.width) payload.width = params.width;
  if (params.height) payload.height = params.height;
  if (params.num_images) payload.num_images = params.num_images;
  if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
  if (params.seed && params.seed !== -1) payload.seed = params.seed;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }

  const body = await res.json();
  const data = body.data || body;
  const outputUrl = data.outputs?.[0] || data.url || data.output?.url;
  return { url: outputUrl, requestId: data.request_id || data.id };
}
