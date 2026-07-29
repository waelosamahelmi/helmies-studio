const VIDEO_ENDPOINT = "/api/v1/services/aigc/video-generation/video-synthesis";
const IMAGE_ENDPOINT = "/api/v1/services/aigc/text2image/image-synthesis";

export function getAlibabaApiPath(endpoint = "") {
  return /video|t2v|i2v|v2v|r2v|animate|avatar|emo|liveportrait/i.test(endpoint) ? VIDEO_ENDPOINT : IMAGE_ENDPOINT;
}

export function formatAlibabaPayload(model, prompt, params = {}) {
  const { endpoint: _endpoint, callBackUrl: _callback, webhook_url: _webhook, ...rest } = params;
  const input = { prompt };
  const parameters = {};
  const inputMap = { image_url: "img_url", video_url: "video_url", audio_url: "audio_url", images_list: "reference_images" };
  const parameterKeys = new Set(["negative_prompt", "size", "n", "seed", "duration", "prompt_extend", "watermark", "audio", "mode", "resolution", "aspect_ratio"]);
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined || value === null) continue;
    if (inputMap[key]) input[inputMap[key]] = value;
    else if (parameterKeys.has(key)) parameters[key] = value;
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
