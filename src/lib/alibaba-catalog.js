const PRICING_URL = "https://www.alibabacloud.com/help/en/model-studio/model-pricing";
const IMAGE_DOCS = "https://www.alibabacloud.com/help/en/model-studio/image-model";
const VIDEO_DOCS = "https://www.alibabacloud.com/help/en/model-studio/use-video-generation";
const CATALOG_VERSION = "alibaba-2026-07-30";

const imageSchema = (maxOutputs = 4, maxResolution = "2048x2048", maxImages = 0) => ({
  fields: {
    prompt: { type: "string", required: true, maxLength: 800 },
    negative_prompt: { type: "string", required: false, maxLength: 500 },
    size: { type: "string", required: false, enum: ["1024*1024", "1280*720", "720*1280", "1440*810", "810*1440", "1536*1024", "1024*1536"] },
    n: { type: "number", required: false, minimum: 1, maximum: maxOutputs },
    prompt_extend: { type: "boolean", required: false },
    ...(maxImages ? { images_list: { type: "array", required: false, maxItems: maxImages } } : {}),
  },
  ui: { maxResolution, maxOutputs, maxReferenceImages: maxImages },
});

const videoSchema = ({ image = false, video = false, audio = false, durations = [5, 10, 15], resolutions = ["720p", "1080p"] } = {}) => ({
  fields: {
    prompt: { type: "string", required: !video, maxLength: 1500 },
    ...(image ? { image_url: { type: "string", required: true, format: "uri", providerField: "img_url" } } : {}),
    ...(video ? { video_url: { type: "string", required: true, format: "uri" } } : {}),
    ...(audio ? { audio_url: { type: "string", required: false, format: "uri" }, audio: { type: "boolean", required: false } } : {}),
    duration: { type: "number", required: true, enum: durations },
    resolution: { type: "string", required: true, enum: resolutions },
    prompt_extend: { type: "boolean", required: false },
    watermark: { type: "boolean", required: false },
  },
});

const perImage = (price) => ({ currency: "USD", unit: "image", rules: [{ price }] });
const perSecond = (prices) => ({ currency: "USD", unit: "second", rules: Object.entries(prices).map(([resolution, price]) => ({ when: { resolution }, price })) });

function model(modelId, capability, schema, pricingRules, extra = {}) {
  const output = capability.includes("video") || capability === "reference-to-video" ? "video" : capability.includes("speech") || capability.includes("audio") ? "audio" : "image";
  const inputs = ["text"];
  if (capability.startsWith("image-to") || capability === "image-to-image" || capability === "reference-to-video") inputs.push("image");
  if (capability.startsWith("video-to") || capability === "reference-to-video") inputs.push("video");
  return {
    modelId: `alibaba:${modelId}`,
    providerModelId: modelId,
    endpoint: modelId,
    displayName: extra.displayName || modelId,
    description: extra.description || `Alibaba Model Studio ${capability.replaceAll("-", " ")} model.`,
    modelType: output === "video" ? (capability === "image-to-video" ? "i2v" : capability === "video-to-video" ? "v2v" : "video") : output === "audio" ? "audio" : capability === "image-to-image" ? "i2i" : "image",
    capability,
    inputModalities: inputs,
    outputModalities: [output],
    inputSchema: schema,
    constraints: extra.constraints || {},
    pricingRules,
    billingUnit: pricingRules.unit,
    currency: "USD",
    regions: extra.regions || ["international:singapore"],
    sourceUrl: extra.sourceUrl || (output === "video" ? VIDEO_DOCS : IMAGE_DOCS),
    pricingSourceUrl: PRICING_URL,
    catalogVersion: CATALOG_VERSION,
    background: extra.background || null,
    isActive: extra.isActive !== false,
  };
}

export const ALIBABA_MEDIA_MODELS = [
  model("wan2.7-image-pro", "text-to-image", imageSchema(4, "4096x4096", 9), perImage(0.075), { displayName: "Wan 2.7 Image Pro", description: "4K generation, editing, brand-color control, text rendering, and up to nine references." }),
  model("wan2.7-image", "text-to-image", imageSchema(4, "2048x2048", 9), perImage(0.03), { displayName: "Wan 2.7 Image" }),
  model("wan2.6-image", "image-to-image", imageSchema(4, "2048x2048", 3), perImage(0.03), { displayName: "Wan 2.6 Image" }),
  model("qwen-image-2.0-pro", "image-to-image", imageSchema(6, "2048x2048", 3), perImage(0.075), { displayName: "Qwen Image 2.0 Pro" }),
  model("qwen-image-2.0", "image-to-image", imageSchema(6, "2048x2048", 3), perImage(0.035), { displayName: "Qwen Image 2.0" }),
  model("qwen-image-max", "text-to-image", imageSchema(4, "2048x2048"), perImage(0.075), { displayName: "Qwen Image Max" }),
  model("qwen-image-plus", "text-to-image", imageSchema(4, "2048x2048"), perImage(0.03), { displayName: "Qwen Image Plus" }),
  model("qwen-image-edit-max", "image-to-image", imageSchema(4, "2048x2048", 3), perImage(0.075), { displayName: "Qwen Image Edit Max" }),
  model("qwen-image-edit-plus", "image-to-image", imageSchema(4, "2048x2048", 3), perImage(0.03), { displayName: "Qwen Image Edit Plus" }),
  model("z-image-turbo", "text-to-image", { fields: { ...imageSchema(1, "2048x2048").fields, prompt_extend: { type: "boolean", required: true } } }, { currency: "USD", unit: "image", rules: [{ when: { prompt_extend: false }, price: 0.01434 }, { when: { prompt_extend: true }, price: 0.02868 }] }, { displayName: "Z-Image Turbo", regions: ["china:beijing"] }),
  model("wan2.7-t2v", "text-to-video", videoSchema({ audio: true }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.7 Text to Video" }),
  model("wan2.6-t2v", "text-to-video", videoSchema({ audio: true }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.6 Text to Video" }),
  model("wan2.5-t2v-preview", "text-to-video", videoSchema({ durations: [5, 10], resolutions: ["480p", "720p", "1080p"] }), perSecond({ "480p": 0.05, "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.5 Text to Video Preview" }),
  model("wan2.2-t2v-plus", "text-to-video", videoSchema({ durations: [5], resolutions: ["480p", "1080p"] }), perSecond({ "480p": 0.02, "1080p": 0.10 }), { displayName: "Wan 2.2 Text to Video Plus" }),
  model("wan2.1-t2v-turbo", "text-to-video", videoSchema({ durations: [5], resolutions: ["480p", "720p"] }), perSecond({ "480p": 0.036, "720p": 0.036 }), { displayName: "Wan 2.1 Text to Video Turbo" }),
  model("wan2.7-i2v", "image-to-video", videoSchema({ image: true, audio: true }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.7 Image to Video" }),
  model("wan2.6-i2v", "image-to-video", videoSchema({ image: true, audio: true, durations: [5, 10] }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.6 Image to Video" }),
  model("wan2.6-i2v-flash", "image-to-video", videoSchema({ image: true, audio: true, durations: [5, 10] }), { currency: "USD", unit: "second", rules: [{ when: { resolution: "720p", audio: true }, price: 0.05 }, { when: { resolution: "1080p", audio: true }, price: 0.075 }, { when: { resolution: "720p", audio: false }, price: 0.025 }, { when: { resolution: "1080p", audio: false }, price: 0.0375 }] }, { displayName: "Wan 2.6 Image to Video Flash" }),
  model("wan2.7-r2v", "reference-to-video", videoSchema({ image: true, video: true, audio: true }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.7 Reference to Video" }),
  model("wan2.6-r2v", "reference-to-video", videoSchema({ image: true, video: true, audio: true, durations: [5, 10] }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.6 Reference to Video" }),
  model("wan2.7-videoedit", "video-to-video", videoSchema({ video: true }), perSecond({ "720p": 0.10, "1080p": 0.15 }), { displayName: "Wan 2.7 Video Edit" }),
  model("wan2.2-animate-move", "reference-to-video", { fields: { image_url: { type: "string", required: true, format: "uri" }, video_url: { type: "string", required: true, format: "uri" }, mode: { type: "string", required: true, enum: ["wan-std", "wan-pro"] }, duration: { type: "number", required: true, minimum: 2, maximum: 30 }, resolution: { type: "string", required: true, enum: ["720p"] } } }, { currency: "USD", unit: "second", rules: [{ when: { mode: "wan-std", resolution: "720p" }, price: 0.04 }, { when: { mode: "wan-pro", resolution: "720p" }, price: 0.08 }] }, { displayName: "Wan Animate Move" }),
  model("wan2.2-animate-mix", "reference-to-video", { fields: { image_url: { type: "string", required: true, format: "uri" }, video_url: { type: "string", required: true, format: "uri" }, mode: { type: "string", required: true, enum: ["wan-std", "wan-pro"] }, duration: { type: "number", required: true, minimum: 2, maximum: 30 }, resolution: { type: "string", required: true, enum: ["720p"] } } }, { currency: "USD", unit: "second", rules: [{ when: { mode: "wan-std", resolution: "720p" }, price: 0.04 }, { when: { mode: "wan-pro", resolution: "720p" }, price: 0.08 }] }, { displayName: "Wan Animate Mix" }),
];

export { CATALOG_VERSION as ALIBABA_CATALOG_VERSION };
