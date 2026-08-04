// ── Alibaba (DashScope) routing (BUG 3) ────────────────────────────────────
// Every Alibaba generation in production failed with
//   403 {"code":"AccessDenied","message":"current user api does not support
//        asynchronous calls"}
// which reads like an account entitlement problem. It is NOT. Live probes
// against the production workspace endpoint on 2026-08-04 (one request per
// model, deliberately-invalid `size` so a reachable model answers with a free
// 400 instead of a paid generation) proved the message is DashScope's way of
// saying "this model is not served on the route you called":
//
//   POST /api/v1/services/aigc/text2image/image-synthesis  + X-DashScope-Async
//     403 AccessDenied ×9  (wan2.7-image-pro, wan2.7-image, wan2.6-image,
//                           qwen-image-2.0-pro, qwen-image-2.0, qwen-image-max,
//                           qwen-image-edit-max, qwen-image-edit-plus,
//                           z-image-turbo)
//     200 ×1               (qwen-image-plus — the only one still routed there)
//
//   POST /api/v1/services/aigc/multimodal-generation/generation  (NO async header)
//     400 InvalidParameter ×10 — i.e. ALL TEN image models pass the access
//     gate and reach their own validator. A full run with a valid size
//     returned 200 and a real image URL:
//       z-image-turbo → output.choices[0].message.content[0].image = https://…png
//     (The same account 403s with "does not support SYNCHRONOUS calls" on the
//     image-synthesis route, so this is per-route, not per-account.)
//
//   POST /api/v1/services/aigc/video-generation/video-synthesis + async
//     200 task_id ×11 (every wan t2v/i2v/r2v/videoedit model) — already right
//     403 ×2          (wan2.2-animate-move / -mix)
//   POST /api/v1/services/aigc/image2video/video-synthesis + async
//     400 InvalidParameter.DataInspection for both animate models — i.e. they
//     pass the gate there.
//
// So: the image family must be called SYNCHRONOUSLY on multimodal-generation
// (returning an immediate result, which submitOnly's existing `immediateResult`
// contract already supports), the video family stays on the async task API,
// and the animate pair moves to the image2video route.

const SYNC_IMAGE_ENDPOINT = "/api/v1/services/aigc/multimodal-generation/generation";
const ASYNC_VIDEO_ENDPOINT = "/api/v1/services/aigc/video-generation/video-synthesis";
const ASYNC_ANIMATE_ENDPOINT = "/api/v1/services/aigc/image2video/video-synthesis";

export const ALIBABA_ROUTES = {
  syncImage: { name: "syncImage", path: SYNC_IMAGE_ENDPOINT, isAsync: false },
  asyncVideo: { name: "asyncVideo", path: ASYNC_VIDEO_ENDPOINT, isAsync: true },
  asyncAnimate: { name: "asyncAnimate", path: ASYNC_ANIMATE_ENDPOINT, isAsync: true },
};

const ANIMATE_RE = /animate/i;
const VIDEO_RE = /video|t2v|i2v|v2v|r2v|avatar|emo|liveportrait/i;

export function getAlibabaRoute(endpoint = "") {
  const text = String(endpoint || "");
  if (ANIMATE_RE.test(text)) return ALIBABA_ROUTES.asyncAnimate;
  if (VIDEO_RE.test(text)) return ALIBABA_ROUTES.asyncVideo;
  return ALIBABA_ROUTES.syncImage;
}

export function getAlibabaApiPath(endpoint = "") {
  return getAlibabaRoute(endpoint).path;
}

// The async task API is opt-in per request via this header; the synchronous
// multimodal route must NOT carry it (that account 403s "does not support
// asynchronous calls" when it does).
export function getAlibabaHeaders(endpoint = "") {
  return getAlibabaRoute(endpoint).isAsync ? { "X-DashScope-Async": "enable" } : {};
}

export function isAlibabaSyncEndpoint(endpoint = "") {
  return !getAlibabaRoute(endpoint).isAsync;
}

// Sizes for the sync image route, derived from the tightest constraint any
// catalog model reported during probing: qwen-image-plus accepts EXACTLY
// 1664*928, 1472*1104, 1328*1328, 1104*1472, 928*1664, and every other image
// model's own limits (area 262144–4194304, or 589824–16777216, or
// 512*512–2048*2048) contain all five. Using this set means one aspect ratio
// table works for the whole family.
export const ASPECT_TO_SIZE = {
  "1:1": "1328*1328",
  "16:9": "1664*928",
  "9:16": "928*1664",
  "4:3": "1472*1104",
  "3:4": "1104*1472",
};

const SYNC_PARAMETER_KEYS = new Set(["negative_prompt", "size", "n", "seed", "prompt_extend", "watermark"]);

// Synchronous multimodal-generation body:
//   { model, input: { messages: [{ role, content: [{image}…, {text}] }] }, parameters }
// Image items come first — the edit models validate "the message must contain
// 1~3 image content items" against that layout.
function formatSyncImagePayload(model, prompt, params = {}) {
  const { endpoint: _endpoint, callBackUrl: _callback, webhook_url: _webhook, ...rest } = params;

  const imageUrls = [];
  if (rest.image_url) imageUrls.push(rest.image_url);
  if (Array.isArray(rest.images_list)) imageUrls.push(...rest.images_list.filter(Boolean));

  const content = imageUrls.map((url) => ({ image: url }));
  if (prompt) content.push({ text: prompt });

  const parameters = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue;
    if (SYNC_PARAMETER_KEYS.has(key)) parameters[key] = value;
  }
  // The studio speaks aspect_ratio; this route speaks size.
  if (!parameters.size) {
    const ratio = rest.aspect_ratio;
    if (ratio && ASPECT_TO_SIZE[ratio]) parameters.size = ASPECT_TO_SIZE[ratio];
  }

  return {
    model,
    input: { messages: [{ role: "user", content }] },
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

const ASYNC_INPUT_MAP = { image_url: "img_url", video_url: "video_url", audio_url: "audio_url", images_list: "reference_images" };
const ASYNC_PARAMETER_KEYS = new Set(["negative_prompt", "size", "n", "seed", "duration", "prompt_extend", "watermark", "audio", "mode", "resolution", "aspect_ratio"]);

// Async task body — unchanged from the shape that already works for the wan
// video family (11/13 models returned a task_id during probing).
function formatAsyncTaskPayload(model, prompt, params = {}) {
  const { endpoint: _endpoint, callBackUrl: _callback, webhook_url: _webhook, ...rest } = params;
  const input = { prompt };
  const parameters = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue;
    if (ASYNC_INPUT_MAP[key]) input[ASYNC_INPUT_MAP[key]] = value;
    else if (ASYNC_PARAMETER_KEYS.has(key)) parameters[key] = value;
    else input[key] = value;
  }
  if (!parameters.size && parameters.resolution) {
    const ratio = parameters.aspect_ratio || "16:9";
    const sizes = {
      "720p": { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960" },
      "1080p": { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440" },
      "480p": { "16:9": "832*480", "9:16": "480*832", "1:1": "640*640" },
    };
    parameters.size = sizes[String(parameters.resolution).toLowerCase()]?.[ratio] || parameters.resolution;
    delete parameters.resolution;
    delete parameters.aspect_ratio;
  }
  return { model, input, parameters };
}

export function formatAlibabaPayload(model, prompt, params = {}) {
  // params still carries `endpoint` (submitOnly only strips model/prompt), and
  // it is the real routing key; the model id is the fallback for callers that
  // don't set one.
  const route = getAlibabaRoute(params?.endpoint || model || "");
  return route.isAsync ? formatAsyncTaskPayload(model, prompt, params) : formatSyncImagePayload(model, prompt, params);
}

// Output URLs from EITHER shape:
//   sync  { output: { choices: [{ message: { content: [{ image: "https://…" }] } }] } }
//   async { output: { results: [{ url }] } } | { output: { video_url | url } }
//   legacy image array [{ url }]
export function parseAlibabaOutputs(data) {
  if (Array.isArray(data)) return data.map((d) => d?.url).filter(Boolean);
  const output = data?.output;
  if (!output) return [];

  if (Array.isArray(output.choices)) {
    const urls = [];
    for (const choice of output.choices) {
      const content = choice?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        if (typeof item?.image === "string") urls.push(item.image);
        else if (typeof item?.video === "string") urls.push(item.video);
        else if (typeof item?.audio === "string") urls.push(item.audio);
        else if (typeof item?.audio?.url === "string") urls.push(item.audio.url);
      }
    }
    if (urls.length) return urls;
  }

  if (Array.isArray(output.results)) return output.results.map((r) => r?.url || r?.b64_image).filter(Boolean);
  return [output.video_url || output.url].filter(Boolean);
}
