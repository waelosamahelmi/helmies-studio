import { getProvider, brandError } from "@/lib/providers";

function getKey(provider) {
  const key = provider?.apiKey || provider?.getKey?.();
  if (!key) throw new Error("Provider API key is not set");
  return key;
}

async function pollForResult(requestId, maxAttempts = 900, interval = 2000, provider) {
  const key = getKey(provider);
  const pollUrl = provider.buildPollUrl
    ? provider.buildPollUrl(provider.baseUrl, requestId)
    : `${provider.baseUrl}/api/v1/predictions/${requestId}/result`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(pollUrl, {
        headers: { "Content-Type": "application/json", "x-api-key": key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        if (res.status >= 500) continue;
        const txt = await res.text();
        throw new Error(brandError(txt));
      }
      const data = await res.json();
      const status = data.status?.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success")
        return data;
      if (status === "failed" || status === "error")
        throw new Error(brandError(data.error || ""));
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error("Generation timed out");
}

async function submitAndPoll(endpoint, payload, maxAttempts = 60) {
  const provider = payload._provider;
  const baseUrl = provider?.baseUrl || getProvider("muapi").baseUrl;
  const key = provider?.apiKey || provider?.getKey?.() || getProvider("muapi").getKey();
  const { _provider, ...rest } = payload;
  const path = provider?.buildUrl ? provider.buildUrl(endpoint) : `/api/v1/${endpoint}`;
  const url = `${baseUrl}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(rest),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }
  const submitData = await res.json();
  const requestId = submitData.request_id || submitData.id;
  if (!requestId) return submitData;
  const result = await pollForResult(requestId, maxAttempts, 2000, provider || getProvider("muapi"));
  const outputUrl = result.outputs?.[0] || result.url || result.output?.url;
  return { ...result, url: outputUrl, requestId };
}

export async function generateImage(params) {
  const endpoint = params.endpoint || params.model;
  const payload = { prompt: params.prompt };
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.quality) payload.quality = params.quality;
  if (params.width) payload.width = params.width;
  if (params.height) payload.height = params.height;
  if (params.num_images) payload.num_images = params.num_images;
  if (params.image_url) {
    payload.image_url = params.image_url;
    payload.strength = params.strength || 0.6;
  }
  if (params.images_list) payload.images_list = params.images_list;
  if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
  if (params.seed && params.seed !== -1) payload.seed = params.seed;
  return submitAndPoll(endpoint, payload, 60);
}

export async function generateI2I(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.prompt) payload.prompt = params.prompt;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.images_list) payload.images_list = params.images_list;
  if (params.swap_url) payload.swap_url = params.swap_url;
  if (params.name) payload.name = params.name;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.quality) payload.quality = params.quality;
  if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
  return submitAndPoll(endpoint, payload, 60);
}

export async function generateVideo(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.prompt) payload.prompt = params.prompt;
  if (params.request_id) payload.request_id = params.request_id;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.duration) payload.duration = params.duration;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.quality) payload.quality = params.quality;
  if (params.mode) payload.mode = params.mode;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.images_list?.length > 0) payload.images_list = params.images_list;
  if (params.videos_list?.length > 0) payload.videos_list = params.videos_list;
  return submitAndPoll(endpoint, payload, 900);
}

export async function generateI2V(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.prompt) payload.prompt = params.prompt;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.images_list?.length > 0) payload.images_list = params.images_list;
  if (params.last_image) payload.last_image = params.last_image;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.duration) payload.duration = params.duration;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.quality) payload.quality = params.quality;
  if (params.mode) payload.mode = params.mode;
  if (params.name) payload.name = params.name;
  return submitAndPoll(endpoint, payload, 900);
}

export async function processV2V(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.video_url) payload.video_url = params.video_url;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.prompt) payload.prompt = params.prompt;
  return submitAndPoll(endpoint, payload, 900);
}

export async function processLipSync(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.audio_url) payload.audio_url = params.audio_url;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.video_url) payload.video_url = params.video_url;
  if (params.prompt) payload.prompt = params.prompt || "";
  if (params.resolution) payload.resolution = params.resolution;
  if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;
  return submitAndPoll(endpoint, payload, 900);
}

export async function generateAudio(params) {
  const modelId = params._modelId || params.model;
  const endpoint = params.endpoint || modelId;
  const payload = {};
  const skipKeys = ["_modelId", "endpoint", "model"];
  for (const key in params) {
    if (!skipKeys.includes(key) && params[key] !== undefined && params[key] !== null) {
      payload[key] = params[key];
    }
  }
  return submitAndPoll(endpoint, payload, 900);
}

export async function processRecast(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.video_url) payload.video_url = params.video_url;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.prompt) payload.prompt = params.prompt;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.character_orientation) payload.character_orientation = params.character_orientation;
  return submitAndPoll(endpoint, payload, 900);
}

export async function runClipping(params) {
  const payload = {
    video_url: params.video_url,
    num_highlights: params.num_highlights || 3,
    aspect_ratio: params.aspect_ratio || "9:16",
    return_coordinates_only: !!params.return_coordinates_only,
  };
  return submitAndPoll("ai-clipping", payload, 900);
}

export async function runMotionGraphics(params) {
  const payload = {
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || "16:9",
    duration_seconds: params.duration_seconds || 6,
  };
  return submitAndPoll("motion-graphics", payload, 900);
}

export async function runMotionGraphicsEdit(params) {
  const payload = {
    request_id: params.request_id,
    edit_prompt: params.edit_prompt,
    aspect_ratio: params.aspect_ratio || "16:9",
    duration_seconds: params.duration_seconds || 6,
  };
  return submitAndPoll("motion-graphics-edit", payload, 900);
}

export async function generateMarketingAd(params) {
  const endpoint = params.resolution === "1080p" ? "sd-2-vip-omni-reference-1080p" : "seedance-2-vip-omni-reference";
  const payload = {
    prompt: params.prompt,
    aspect_ratio: params.aspect_ratio || "16:9",
    duration: params.duration || 5,
    images_list: params.images_list || [],
    video_files: params.video_files || [],
  };
  return submitAndPoll(endpoint, payload, 900);
}

export async function uploadFile(file) {
  const provider = getProvider("muapi");
  const key = getKey(provider);
  const url = `${provider.baseUrl}/api/v1/upload_file`;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": key },
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(brandError(txt));
  }
  const data = await res.json();
  return data.url || data.file_url || data.data?.url;
}
