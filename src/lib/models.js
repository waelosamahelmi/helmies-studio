// Helmies Studio — Model Registry
// All models are served via KIE.ai unified API
// Pricing is stored in the DB (ModelPricing table) and synced manually
// 
// Each model has:
//   id         — our internal ID (used by frontend + DB lookup)
//   name       — display name
//   endpoint   — KIE model ID (sent as "model" in KIE API request)
//   provider   — brand name for UI
//   aspectRatios — supported ratios (null = model doesn't use AR)
//   durations  — supported durations in seconds (video models only)
//   resolutions — supported resolution tiers (null = not applicable)
//   hasDimensions — model accepts custom width/height
//   maxImages  — max reference images for edit models
//   hasMode    — model has std/pro/4K mode selector
//   hasMultiShot — Kling 3.0 multi-shot support
//   hasStartEndFrame — supports start + end frame images
//   hasSound   — supports sound effects toggle
//   hasLora   — supports LoRA
//   isExtend  — video extension model
//   speedTier  — "fast" / "premium" / undefined
//   hasCustomMode — Suno custom mode
//   hasVoice  — TTS voice selector
//   hasStability — TTS stability slider
//   hasSimilarity — TTS similarity slider
//   hasSpeed   — TTS speed slider
//   hasInstrumental — Suno instrumental toggle
//   hasVocalGender — Suno vocal gender
//   hasNegativeTags — Suno negative tags
//   hasStyle   — Suno style field
//   hasTitle   — Suno title field

// ══════════════════════════════════════════════════════════════
//  TEXT-TO-IMAGE
// ══════════════════════════════════════════════════════════════
export const IMAGE_MODELS = [
  // Google
  { id: "nano-banana", name: "Nano Banana", endpoint: "nano-banana", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"] },
  { id: "nano-banana-2-lite", name: "Nano Banana 2 Lite", endpoint: "nano-banana-2-lite", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9", "auto"] },
  { id: "nano-banana-pro", name: "Nano Banana Pro", endpoint: "nano-banana-pro", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], resolutions: ["1k", "2k", "4k"] },
  { id: "imagen4", name: "Imagen 4", endpoint: "imagen4", provider: "Google", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"] },
  { id: "imagen4-fast", name: "Imagen 4 Fast", endpoint: "imagen4-fast", provider: "Google", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], speedTier: "fast" },
  { id: "imagen4-ultra", name: "Imagen 4 Ultra", endpoint: "imagen4-ultra", provider: "Google", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"], speedTier: "premium" },
  // Black Forest Labs
  { id: "flux-dev", name: "Flux Dev", endpoint: "flux-dev", provider: "Black Forest Labs", hasDimensions: true },
  { id: "flux-schnell", name: "Flux Schnell", endpoint: "flux-schnell", provider: "Black Forest Labs", hasDimensions: true, speedTier: "fast" },
  { id: "flux-2-dev", name: "Flux 2 Dev", endpoint: "flux-2-dev", provider: "Black Forest Labs", hasDimensions: true },
  { id: "flux-2-pro", name: "Flux 2 Pro", endpoint: "flux-2-pro", provider: "Black Forest Labs", aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], speedTier: "premium" },
  { id: "flux-2-flex", name: "Flux 2 Flex", endpoint: "flux-2-flex", provider: "Black Forest Labs", aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
  { id: "flux-kontext-dev", name: "Flux Kontext Dev", endpoint: "flux-kontext-dev", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"] },
  { id: "flux-kontext-pro", name: "Flux Kontext Pro", endpoint: "flux-kontext-pro", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "16:21"], speedTier: "premium" },
  // Midjourney
  { id: "midjourney", name: "Midjourney v7", endpoint: "midjourney", provider: "Midjourney", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "1:2", "2:1", "2:3", "3:2", "5:6", "6:5"] },
  // OpenAI
  { id: "gpt-image-1.5", name: "GPT Image 1.5", endpoint: "gpt-image-1.5", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2"] },
  { id: "gpt-image-2", name: "GPT Image 2", endpoint: "gpt-image-2", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2", "16:9", "9:16"] },
  // ByteDance
  { id: "seedream-v4", name: "Seedream v4", endpoint: "seedream-v4-text-to-image", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "2:3", "3:2", "21:9"], resolutions: ["1K", "2K", "4K"] },
  { id: "seedream-5-lite", name: "Seedream 5 Lite", endpoint: "seedream-5-lite-text-to-image", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "2:3", "3:2", "21:9"], speedTier: "fast" },
  { id: "seedream-5-pro", name: "Seedream 5 Pro", endpoint: "seedream-5-pro-text-to-image", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "2:3", "3:2", "21:9"], resolutions: ["1K", "2K", "4K"], speedTier: "premium" },
  // Alibaba / Qwen
  { id: "qwen-image", name: "Qwen Image", endpoint: "qwen-text-to-image", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21", "3:2", "2:3"] },
  { id: "wan-2.7-image", name: "Wan 2.7", endpoint: "wan-2.7-image", provider: "Alibaba", aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
  { id: "wan-2.7-image-pro", name: "Wan 2.7 Pro", endpoint: "wan-2.7-image-pro", provider: "Alibaba", aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], speedTier: "premium" },
  // xAI
  { id: "grok-imagine-text-to-image", name: "Grok Imagine", endpoint: "grok-imagine-text-to-image", provider: "xAI", aspectRatios: ["9:16", "16:9", "2:3", "3:2", "1:1"] },
  // Ideogram
  { id: "ideogram-v3", name: "Ideogram v3", endpoint: "ideogram-v3-text-to-image", provider: "Ideogram", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
  // Hunyuan
  { id: "hunyuan-image-3", name: "Hunyuan 3.0", endpoint: "hunyuan-image-3", provider: "Hunyuan", hasDimensions: true },
  // Kling
  { id: "kling-text-to-image", name: "Kling O1", endpoint: "kling-text-to-image", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "2:3", "3:2", "21:9"], resolutions: ["1k", "2k"] },
  // Z-AI
  { id: "z-image", name: "Z-Image", endpoint: "z-image", provider: "Z-AI", aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"], speedTier: "fast" },
];

// ══════════════════════════════════════════════════════════════
//  IMAGE-TO-IMAGE / EDIT
// ══════════════════════════════════════════════════════════════
export const I2I_MODELS = [
  { id: "flux-kontext-dev-edit", name: "Flux Kontext Dev", endpoint: "flux-kontext-dev", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"], maxImages: 1 },
  { id: "flux-kontext-pro-edit", name: "Flux Kontext Pro", endpoint: "flux-kontext-pro", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "16:21"], maxImages: 2, speedTier: "premium" },
  { id: "nano-banana-edit", name: "Nano Banana Edit", endpoint: "nano-banana-2-lite", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], maxImages: 10 },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro Edit", endpoint: "nano-banana-pro", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], resolutions: ["1k", "2k", "4k"], maxImages: 14 },
  { id: "gpt-image-1.5-edit", name: "GPT Image 1.5 Edit", endpoint: "gpt-image-1.5", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2"], maxImages: 10 },
  { id: "gpt-image-2-edit", name: "GPT Image 2 Edit", endpoint: "gpt-image-2-image-to-image", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2", "16:9", "9:16"], maxImages: 10 },
  { id: "seedream-v4-edit", name: "Seedream v4 Edit", endpoint: "seedream-v4-edit", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3"], maxImages: 10 },
  { id: "seedream-5-pro-edit", name: "Seedream 5 Pro Edit", endpoint: "seedream-5-pro-image-to-image", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3"], maxImages: 10, speedTier: "premium" },
  { id: "kling-image-edit", name: "Kling O1 Edit", endpoint: "kling-image-edit", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "2:3", "3:2", "21:9"], maxImages: 10 },
  { id: "ideogram-v3-edit", name: "Ideogram v3 Edit", endpoint: "ideogram-v3-edit", provider: "Ideogram", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"], maxImages: 3 },
  { id: "ideogram-v3-remix", name: "Ideogram v3 Remix", endpoint: "ideogram-v3-remix", provider: "Ideogram", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"], maxImages: 3 },
  { id: "image-upscale", name: "Image Upscaler", endpoint: "topaz-image-upscale", provider: "Topaz" },
  { id: "remove-background", name: "Background Remover", endpoint: "remove-background", provider: "Recraft" },
  { id: "crisp-upscale", name: "Crisp Upscale", endpoint: "crisp-upscale", provider: "Recraft", speedTier: "fast" },
];

// ══════════════════════════════════════════════════════════════
//  TEXT-TO-VIDEO
// ══════════════════════════════════════════════════════════════
export const VIDEO_MODELS = [
  // Google
  { id: "veo3", name: "Veo 3", endpoint: "veo3", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8], speedTier: "premium" },
  { id: "veo3-fast", name: "Veo 3 Fast", endpoint: "veo3_fast", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8], speedTier: "fast" },
  // OpenAI
  { id: "sora-2", name: "Sora 2", endpoint: "sora-2-text-to-video", provider: "OpenAI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10, 15] },
  // Kling
  { id: "kling-3-0", name: "Kling 3.0", endpoint: "kling-3.0/video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hasMode: true, hasMultiShot: true, hasSound: true },
  { id: "kling-v2.1-master", name: "Kling v2.1 Master", endpoint: "v2-1-master-text-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "premium" },
  { id: "kling-v2.5-turbo-pro", name: "Kling v2.5 Turbo Pro", endpoint: "v25-turbo-text-to-video-pro", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "kling-v3-turbo", name: "Kling v3 Turbo", endpoint: "v3-turbo-text-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "fast" },
  { id: "kling-text-to-video", name: "Kling Standard", endpoint: "kling-text-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  // ByteDance
  { id: "seedance-2", name: "Seedance 2.0", endpoint: "seedance-2", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10, 15] },
  { id: "seedance-2-fast", name: "Seedance 2 Fast", endpoint: "seedance-2-fast", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10], speedTier: "fast" },
  { id: "seedance-2-mini", name: "Seedance 2 Mini", endpoint: "seedance-2-mini", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10] },
  { id: "seedance-1.5-pro", name: "Seedance 1.5 Pro", endpoint: "seedance-1-5-pro", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10] },
  // MiniMax
  { id: "hailuo-02-standard", name: "Hailuo 02 Standard", endpoint: "02-text-to-video-standard", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  { id: "hailuo-02-pro", name: "Hailuo 02 Pro", endpoint: "02-text-to-video-pro", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10], speedTier: "premium" },
  { id: "hailuo-2.3", name: "Hailuo 2.3", endpoint: "2-3-image-to-video-standard", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  // Alibaba
  { id: "wan-2.5-t2v", name: "Wan 2.5", endpoint: "2-5-text-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "wan-2.6-t2v", name: "Wan 2.6", endpoint: "2-6-text-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "wan-2.7-t2v", name: "Wan 2.7", endpoint: "2-7-text-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  // xAI
  { id: "grok-imagine-text-to-video", name: "Grok Imagine", endpoint: "grok-imagine-text-to-video", provider: "xAI", aspectRatios: ["9:16", "16:9", "2:3", "3:2", "1:1"], durations: [6, 10, 15] },
  // Runway
  { id: "runway-aleph", name: "Runway Aleph", endpoint: "generate-aleph-video", provider: "Runway", aspectRatios: ["16:9", "9:16"], durations: [5, 10] },
  // Video extension models
  { id: "veo3-extend", name: "Veo 3 Extend", endpoint: "extend-video", provider: "Google", aspectRatios: ["16:9", "9:16"], isExtend: true },
  { id: "grok-imagine-extend", name: "Grok Imagine Extend", endpoint: "grok-imagine-extend", provider: "xAI", aspectRatios: ["9:16", "16:9", "2:3", "3:2", "1:1"], isExtend: true },
  { id: "runway-extend", name: "Runway Extend", endpoint: "extend-ai-video", provider: "Runway", aspectRatios: ["16:9", "9:16"], isExtend: true },
];

// ══════════════════════════════════════════════════════════════
//  IMAGE-TO-VIDEO
// ══════════════════════════════════════════════════════════════
export const I2V_MODELS = [
  // Google
  { id: "veo3-i2v", name: "Veo 3 I2V", endpoint: "veo3", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8], speedTier: "premium" },
  // Kling
  { id: "kling-v2.1-standard-i2v", name: "Kling v2.1 Standard", endpoint: "v2-1-standard", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "kling-v2.1-pro-i2v", name: "Kling v2.1 Pro", endpoint: "v2-1-pro", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "premium" },
  { id: "kling-v2.1-master-i2v", name: "Kling v2.1 Master", endpoint: "v2-1-master-image-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "premium" },
  { id: "kling-v2.5-turbo-pro-i2v", name: "Kling v2.5 Turbo Pro", endpoint: "v25-turbo-image-to-video-pro", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "kling-v3-turbo-i2v", name: "Kling v3 Turbo", endpoint: "v3-turbo-image-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "fast" },
  { id: "kling-image-to-video", name: "Kling Standard I2V", endpoint: "kling-image-to-video", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  // ByteDance
  { id: "seedance-2-i2v", name: "Seedance 2.0 I2V", endpoint: "seedance-2", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10, 15] },
  { id: "seedance-1.5-pro-i2v", name: "Seedance 1.5 Pro I2V", endpoint: "seedance-1-5-pro", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10] },
  // MiniMax
  { id: "hailuo-02-i2v-standard", name: "Hailuo 02 Standard I2V", endpoint: "02-image-to-video-standard", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  { id: "hailuo-02-i2v-pro", name: "Hailuo 02 Pro I2V", endpoint: "02-image-to-video-pro", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10], speedTier: "premium" },
  { id: "hailuo-2.3-i2v", name: "Hailuo 2.3 I2V", endpoint: "2-3-image-to-video-standard", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  { id: "hailuo-2.3-pro-i2v", name: "Hailuo 2.3 Pro I2V", endpoint: "2-3-image-to-video-pro", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10], speedTier: "premium" },
  // Alibaba
  { id: "wan-2.5-i2v", name: "Wan 2.5 I2V", endpoint: "2-5-image-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "wan-2.6-i2v", name: "Wan 2.6 I2V", endpoint: "2-6-image-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "wan-2.6-flash-i2v", name: "Wan 2.6 Flash I2V", endpoint: "2-6-flash-image-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "fast" },
  { id: "wan-2.7-i2v", name: "Wan 2.7 I2V", endpoint: "2-7-image-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "wan-2.2-turbo-i2v", name: "Wan 2.2 Turbo I2V", endpoint: "2-2-a14b-image-to-video-turbo", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "fast" },
];

// ══════════════════════════════════════════════════════════════
//  VIDEO-TO-VIDEO / EDIT
// ══════════════════════════════════════════════════════════════
export const V2V_MODELS = [
  { id: "wan-2.6-v2v", name: "Wan 2.6 V2V", endpoint: "2-6-video-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"] },
  { id: "wan-2.6-flash-v2v", name: "Wan 2.6 Flash V2V", endpoint: "2-6-flash-video-to-video", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], speedTier: "fast" },
  { id: "wan-2.7-video-edit", name: "Wan 2.7 Video Edit", endpoint: "2-7-videoedit", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"] },
  { id: "video-upscale", name: "Video Upscaler", endpoint: "video-upscale", provider: "Topaz" },
  { id: "kling-ai-avatar-standard", name: "Kling AI Avatar", endpoint: "ai-avatar-standard", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "kling-ai-avatar-pro", name: "Kling AI Avatar Pro", endpoint: "ai-avatar-pro", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], speedTier: "premium" },
  { id: "wan-animate-move", name: "Wan Animate Move", endpoint: "2-2-animate-move", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"] },
  { id: "wan-animate-replace", name: "Wan Animate Replace", endpoint: "2-2-animate-replace", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"] },
];

// ══════════════════════════════════════════════════════════════
//  LIP SYNC / SPEECH-TO-VIDEO
// ══════════════════════════════════════════════════════════════
export const LIPSYNC_MODELS = [
  { id: "wan-speech-to-video", name: "Wan 2.2 Speech-to-Video", endpoint: "2-2-a14b-speech-to-video-turbo", provider: "Alibaba", mode: "image" },
  { id: "omnihuman-1-5", name: "OmniHuman 1.5", endpoint: "omnihuman-1-5", provider: "ByteDance", mode: "image" },
  { id: "infinitetalk", name: "InfiniteTalk", endpoint: "infinitetalk", provider: "KIE", mode: "image" },
  { id: "gemini-omni-character", name: "Gemini Omni Character", endpoint: "gemini-omni-character", provider: "Google", mode: "image" },
  { id: "volcengine-lipsync", name: "Volcengine Lip Sync", endpoint: "video-to-video-lip-sync", provider: "Volcengine", mode: "video" },
];

// ══════════════════════════════════════════════════════════════
//  AUDIO / MUSIC / TTS
// ══════════════════════════════════════════════════════════════
export const AUDIO_MODELS = [
  // Suno music generation
  { id: "suno-v5.5", name: "Suno v5.5", endpoint: "V5_5", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  { id: "suno-v5", name: "Suno v5", endpoint: "V5", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  { id: "suno-v4.5-plus", name: "Suno v4.5+", endpoint: "V4_5PLUS", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  { id: "suno-v4.5", name: "Suno v4.5", endpoint: "V4_5", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  { id: "suno-v4.5-all", name: "Suno v4.5 All", endpoint: "V4_5ALL", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  { id: "suno-v4", name: "Suno v4", endpoint: "V4", provider: "Suno", hasCustomMode: true, hasInstrumental: true, hasVocalGender: true, hasNegativeTags: true, hasStyle: true, hasTitle: true },
  // ElevenLabs TTS
  { id: "elevenlabs-tts-turbo", name: "ElevenLabs Turbo v2.5", endpoint: "elevenlabs/text-to-speech-turbo-2-5", provider: "ElevenLabs", hasVoice: true, hasStability: true, hasSimilarity: true, hasSpeed: true },
  { id: "elevenlabs-tts-multilingual", name: "ElevenLabs Multilingual v2", endpoint: "elevenlabs/text-to-speech-multilingual-v2", provider: "ElevenLabs", hasVoice: true, hasStability: true, hasSimilarity: true, hasSpeed: true },
  { id: "elevenlabs-tts-v3", name: "ElevenLabs v3 Dialogue", endpoint: "elevenlabs/text-to-dialogue-v3", provider: "ElevenLabs", hasVoice: true },
  // Google TTS
  { id: "gemini-flash-tts", name: "Gemini 3.1 Flash TTS", endpoint: "gemini-3-1-flash-tts", provider: "Google", speedTier: "fast" },
  { id: "gemini-pro-tts", name: "Gemini 2.5 Pro TTS", endpoint: "gemini-2-5-pro-tts", provider: "Google", speedTier: "premium" },
  // Audio tools
  { id: "audio-isolation", name: "Audio Isolation", endpoint: "audio-isolation", provider: "ElevenLabs" },
];

// ══════════════════════════════════════════════════════════════
//  LLM / CHAT (for agent, prompt expansion, analysis)
// ══════════════════════════════════════════════════════════════
export const LLM_MODELS = [
  { id: "google/gemini-2.5-flash-openai", name: "Gemini 2.5 Flash", provider: "Google", contextLength: 1048576 },
];

// ══════════════════════════════════════════════════════════════
//  RECAST
// ══════════════════════════════════════════════════════════════
export const RECAST_MODELS = [
  { id: "kling-v3-pro-recast", name: "Kling v3.0 Pro Recast", endpoint: "kling-v3.0-pro-recast", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], hasOrientation: true },
  { id: "kling-v2.1-pro-recast", name: "Kling v2.1 Pro Recast", endpoint: "kling-v2.1-pro-recast", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"] },
];

// ══════════════════════════════════════════════════════════════
//  CINEMA CONSTANTS (prompt fragment libraries)
// ══════════════════════════════════════════════════════════════
export const CINEMA_CAMERAS = [
  { id: "modular-8k", name: "Modular 8K Digital", prompt: "shot on Modular 8K Digital cinema camera" },
  { id: "full-frame-cine", name: "Full-Frame Cine Digital", prompt: "shot on Full-Frame Cine Digital camera" },
  { id: "grand-format-70mm", name: "Grand Format 70mm Film", prompt: "shot on Grand Format 70mm film" },
  { id: "studio-digital-s35", name: "Studio Digital S35", prompt: "shot on Studio Digital S35 camera" },
  { id: "classic-16mm", name: "Classic 16mm Film", prompt: "shot on Classic 16mm film" },
  { id: "premium-large-format", name: "Premium Large Format Digital", prompt: "shot on Premium Large Format Digital camera" },
];

export const CINEMA_LENS = [
  { id: "creative-tilt", name: "Creative Tilt", prompt: "Creative Tilt lens" },
  { id: "compact-anamorphic", name: "Compact Anamorphic", prompt: "Compact Anamorphic lens" },
  { id: "extreme-macro", name: "Extreme Macro", prompt: "Extreme Macro lens" },
  { id: "70s-cinema-prime", name: "70s Cinema Prime", prompt: "70s Cinema Prime lens" },
  { id: "classic-anamorphic", name: "Classic Anamorphic", prompt: "Classic Anamorphic lens" },
  { id: "premium-modern-prime", name: "Premium Modern Prime", prompt: "Premium Modern Prime lens" },
  { id: "warm-cinema-prime", name: "Warm Cinema Prime", prompt: "Warm Cinema Prime lens" },
  { id: "swirl-bokeh-portrait", name: "Swirl Bokeh Portrait", prompt: "Swirl Bokeh Portrait lens" },
  { id: "vintage-prime", name: "Vintage Prime", prompt: "Vintage Prime lens" },
  { id: "halation-diffusion", name: "Halation Diffusion", prompt: "Halation Diffusion lens" },
  { id: "clinical-sharp-prime", name: "Clinical Sharp Prime", prompt: "Clinical Sharp Prime lens" },
];

export const CINEMA_FOCAL = [
  { id: "8mm", name: "8mm (Ultra-Wide)", prompt: "8mm ultra-wide focal length" },
  { id: "14mm", name: "14mm", prompt: "14mm wide focal length" },
  { id: "24mm", name: "24mm", prompt: "24mm focal length" },
  { id: "35mm", name: "35mm (Human Eye)", prompt: "35mm human eye focal length" },
  { id: "50mm", name: "50mm (Portrait)", prompt: "50mm portrait focal length" },
  { id: "85mm", name: "85mm (Tight Portrait)", prompt: "85mm tight portrait focal length" },
];

export const CINEMA_APERTURE = [
  { id: "f1.4", name: "f/1.4 (Shallow DoF)", prompt: "f/1.4 shallow depth of field" },
  { id: "f4", name: "f/4 (Balanced)", prompt: "f/4 balanced depth of field" },
  { id: "f11", name: "f/11 (Deep Focus)", prompt: "f/11 deep focus" },
];

export const MARKETING_AVATARS = [
  { id: "priya", name: "Priya", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/priya.png" },
  { id: "elena", name: "Elena", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/elena.png" },
  { id: "kai", name: "Kai", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/kai.png" },
  { id: "sora", name: "Sora", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/sora.png" },
  { id: "minji", name: "Minji", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/minji.png" },
  { id: "margot", name: "Margot", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/margot.png" },
  { id: "niko", name: "Niko", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/niko.png" },
  { id: "jin", name: "Jin", url: "https://d3adwkbyhxyrtq.cloudfront.net/webassets/marketing/jin.png" },
];

export const INFLUENCER_TABS = [
  { id: "face", label: "Face", categories: [
    { id: "character_type", label: "Character Type", options: [{ id: "human", label: "Human", promptVal: "human character" }, { id: "anime", label: "Anime", promptVal: "anime character" }, { id: "robot", label: "Robot", promptVal: "robot character" }] },
    { id: "gender", label: "Gender", options: [{ id: "male", label: "Male", promptVal: "male" }, { id: "female", label: "Female", promptVal: "female" }] },
    { id: "ethnicity", label: "Ethnicity", options: [{ id: "scandinavian", label: "Scandinavian", promptVal: "Scandinavian ethnicity" }, { id: "mediterranean", label: "Mediterranean", promptVal: "Mediterranean ethnicity" }, { id: "east-asian", label: "East Asian", promptVal: "East Asian ethnicity" }, { id: "south-asian", label: "South Asian", promptVal: "South Asian ethnicity" }, { id: "african", label: "African", promptVal: "African ethnicity" }, { id: "latina", label: "Latina", promptVal: "Latina ethnicity" }] },
    { id: "eye_color", label: "Eye Color", options: [{ id: "blue", label: "Blue", promptVal: "blue eyes" }, { id: "green", label: "Green", promptVal: "green eyes" }, { id: "brown", label: "Brown", promptVal: "brown eyes" }, { id: "hazel", label: "Hazel", promptVal: "hazel eyes" }, { id: "amber", label: "Amber", promptVal: "amber eyes" }] },
    { id: "hair", label: "Hair", options: [{ id: "short-black", label: "Short Black", promptVal: "short black hair" }, { id: "long-blonde", label: "Long Blonde", promptVal: "long blonde hair" }, { id: "curly-brown", label: "Curly Brown", promptVal: "curly brown hair" }, { id: "red-wavy", label: "Red Wavy", promptVal: "red wavy hair" }, { id: "silver-straight", label: "Silver Straight", promptVal: "silver straight hair" }, { id: "bald", label: "Bald", promptVal: "bald" }] },
  ]},
  { id: "body", label: "Body", categories: [
    { id: "body_type", label: "Body Type", options: [{ id: "slim", label: "Slim", promptVal: "slim body" }, { id: "athletic", label: "Athletic", promptVal: "athletic body" }, { id: "muscular", label: "Muscular", promptVal: "muscular body" }, { id: "curvy", label: "Curvy", promptVal: "curvy body" }] },
    { id: "accessories", label: "Accessories", options: [{ id: "none", label: "None", promptVal: "" }, { id: "glasses", label: "Glasses", promptVal: "wearing glasses" }, { id: "earrings", label: "Earrings", promptVal: "wearing earrings" }, { id: "necklace", label: "Necklace", promptVal: "wearing a necklace" }] },
  ]},
  { id: "style", label: "Style", categories: [
    { id: "rendering_style", label: "Rendering Style", options: [{ id: "photorealistic", label: "Photorealistic", promptVal: "photorealistic rendering" }, { id: "cinematic", label: "Cinematic", promptVal: "cinematic rendering" }, { id: "film-grain", label: "Film Grain", promptVal: "film grain rendering" }, { id: "studio-lighting", label: "Studio Lighting", promptVal: "studio lighting" }] },
  ]},
];