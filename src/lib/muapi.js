const BASE_URL = "https://api.muapi.ai";

function getKey() {
  const key = process.env.MUAPI_KEY;
  if (!key) throw new Error("MUAPI_KEY is not set");
  return key;
}

async function pollForResult(requestId, maxAttempts = 900, interval = 2000) {
  const pollUrl = `${BASE_URL}/api/v1/predictions/${requestId}/result`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(pollUrl, {
        headers: { "Content-Type": "application/json", "x-api-key": getKey() },
      });
      if (!res.ok) {
        if (res.status >= 500) continue;
        const txt = await res.text();
        throw new Error(`Poll failed: ${res.status} - ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const status = data.status?.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success")
        return data;
      if (status === "failed" || status === "error")
        throw new Error(`Generation failed: ${data.error || "Unknown"}`);
    } catch (e) {
      if (attempt === maxAttempts) throw e;
    }
  }
  throw new Error("Generation timed out");
}

async function submitAndPoll(endpoint, payload, maxAttempts = 60) {
  const url = `${BASE_URL}/api/v1/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": getKey() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API request failed: ${res.status} ${res.statusText} - ${txt.slice(0, 200)}`);
  }
  const submitData = await res.json();
  const requestId = submitData.request_id || submitData.id;
  if (!requestId) return submitData;
  const result = await pollForResult(requestId, maxAttempts);
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
  if (params.seed && params.seed !== -1) payload.seed = params.seed;
  return submitAndPoll(endpoint, payload, 60);
}

export async function generateVideo(params) {
  const endpoint = params.endpoint || params.model;
  const payload = {};
  if (params.prompt) payload.prompt = params.prompt;
  if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
  if (params.duration) payload.duration = params.duration;
  if (params.resolution) payload.resolution = params.resolution;
  if (params.quality) payload.quality = params.quality;
  if (params.mode) payload.mode = params.mode;
  if (params.image_url) payload.image_url = params.image_url;
  if (params.images_list?.length > 0) payload.images_list = params.images_list;
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
  return submitAndPoll(endpoint, payload, 900);
}

export async function uploadFile(file) {
  const url = `${BASE_URL}/api/v1/upload_file`;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": getKey() },
    body: formData,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload failed: ${res.status} - ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.url || data.file_url || data.data?.url;
}