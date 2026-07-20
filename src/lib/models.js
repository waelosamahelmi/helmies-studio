export const IMAGE_MODELS = [
  { id: "nano-banana", name: "Nano Banana", endpoint: "nano-banana", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"] },
  { id: "nano-banana-pro", name: "Nano Banana Pro", endpoint: "nano-banana-pro", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], resolutions: ["1k", "2k", "4k"] },
  { id: "flux-dev", name: "Flux Dev", endpoint: "flux-dev-image", provider: "Black Forest Labs", hasDimensions: true },
  { id: "flux-schnell", name: "Flux Schnell", endpoint: "flux-schnell-image", provider: "Black Forest Labs", hasDimensions: true },
  { id: "flux-2-dev", name: "Flux 2 Dev", provider: "Black Forest Labs", hasDimensions: true },
  { id: "flux-kontext-dev-t2i", name: "Flux Kontext Dev", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"] },
  { id: "flux-kontext-pro-t2i", name: "Flux Kontext Pro", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "16:21"] },
  { id: "midjourney-v7-text-to-image", name: "Midjourney v7", provider: "Midjourney", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "1:2", "2:1", "2:3", "3:2", "5:6", "6:5"], hasSpeed: true },
  { id: "gpt4o-text-to-image", name: "GPT-4o", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2"] },
  { id: "google-imagen4", name: "Imagen 4", provider: "Google", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"] },
  { id: "google-imagen4-ultra", name: "Imagen 4 Ultra", provider: "Google", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"] },
  { id: "bytedance-seedream-v4", name: "Seedream v4", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "2:3", "3:2", "21:9"], resolutions: ["1K", "2K", "4K"] },
  { id: "bytedance-seedream-v3", name: "Seedream v3", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3"] },
  { id: "qwen-image", name: "Qwen Image", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21", "3:2", "2:3"] },
  { id: "sdxl-image", name: "SDXL", provider: "Stability AI", hasDimensions: true },
  { id: "ideogram-v3-t2i", name: "Ideogram v3", provider: "Ideogram", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"] },
  { id: "grok-imagine-text-to-image", name: "Grok Imagine", provider: "xAI", aspectRatios: ["9:16", "16:9", "2:3", "3:2", "1:1"] },
  { id: "hunyuan-image-3.0", name: "Hunyuan 3.0", provider: "Hunyuan", hasDimensions: true },
  { id: "wan2.5-text-to-image", name: "Wan 2.5", provider: "Alibaba", hasDimensions: true },
  { id: "kling-o1-text-to-image", name: "Kling O1", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "2:3", "3:2", "21:9"], resolutions: ["1k", "2k"] },
  { id: "leonardoai-phoenix-1.0", name: "Phoenix 1.0", provider: "Leonardo AI", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "4:5", "5:4", "2:3", "3:2"] },
];

export const I2I_MODELS = [
  { id: "flux-kontext-dev-i2i", name: "Flux Kontext Dev", endpoint: "flux-kontext-dev-i2i", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"], maxImages: 1 },
  { id: "flux-kontext-pro-i2i", name: "Flux Kontext Pro", endpoint: "flux-kontext-pro-i2i", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "16:21"], maxImages: 2 },
  { id: "nano-banana-edit", name: "Nano Banana Edit", endpoint: "nano-banana-edit", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], maxImages: 10 },
  { id: "nano-banana-pro-edit", name: "Nano Banana Pro Edit", endpoint: "nano-banana-pro-edit", provider: "Google", aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9", "3:2", "2:3", "5:4", "4:5", "21:9"], resolutions: ["1k", "2k", "4k"], maxImages: 14 },
  { id: "gpt4o-edit", name: "GPT-4o Edit", endpoint: "gpt4o-image-to-image", provider: "OpenAI", aspectRatios: ["1:1", "2:3", "3:2"], maxImages: 10 },
  { id: "bytedance-seedream-edit", name: "Seedream Edit", endpoint: "bytedance-seedream-edit-v4", provider: "ByteDance", aspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3", "2:3", "3:2", "21:9"], maxImages: 10 },
  { id: "kling-o1-edit-image", name: "Kling O1 Edit", endpoint: "kling-o1-edit-image", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "2:3", "3:2", "21:9"], maxImages: 10 },
  { id: "flux-redux", name: "Flux Redux", endpoint: "flux-redux", provider: "Black Forest Labs", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"] },
  { id: "seededit-v3", name: "SeedEdit v3", endpoint: "seededit-v3", provider: "ByteDance" },
  { id: "image-upscaler", name: "Upscaler", endpoint: "image-upscaler", provider: "MuAPI" },
  { id: "background-remover", name: "Background Remover", endpoint: "background-remover", provider: "MuAPI" },
];

export const VIDEO_MODELS = [
  { id: "kling-v3", name: "Kling v3", endpoint: "kling-v3", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "sora-2", name: "Sora 2", endpoint: "sora-2", provider: "OpenAI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10, 15] },
  { id: "veo-3", name: "Veo 3", endpoint: "veo-3", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8] },
  { id: "veo-3-fast", name: "Veo 3 Fast", endpoint: "veo-3-fast", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8] },
  { id: "wan-2.6", name: "Wan 2.6", endpoint: "wan-2.6-t2v", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "seedance-2.0", name: "Seedance 2.0", endpoint: "seedance-2.0", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10, 15] },
  { id: "hailuo-02", name: "Hailuo 02", endpoint: "hailuo-02-standard", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  { id: "runway-gen-3", name: "Runway Gen-3", endpoint: "runway-gen-3-t2v", provider: "Runway", aspectRatios: ["16:9", "9:16"], durations: [5, 10] },
  { id: "grok-imagine-t2v", name: "Grok Imagine", endpoint: "grok-imagine-t2v", provider: "xAI", aspectRatios: ["9:16", "16:9", "2:3", "3:2", "1:1"], durations: [6, 10, 15] },
  { id: "seedance-2.0-extend", name: "Seedance Extend", endpoint: "seedance-2.0-extend", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10, 15], isExtend: true },
];

export const I2V_MODELS = [
  { id: "kling-v2.1-i2v", name: "Kling v2.1 I2V", endpoint: "kling-v2.1-i2v", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "seedance-2.0-i2v", name: "Seedance 2.0 I2V", endpoint: "seedance-2.0-i2v", provider: "ByteDance", aspectRatios: ["16:9", "9:16", "4:3", "3:4"], durations: [5, 10, 15] },
  { id: "veo-3-i2v", name: "Veo 3 I2V", endpoint: "veo-3-i2v", provider: "Google", aspectRatios: ["16:9", "9:16"], durations: [5, 8] },
  { id: "wan-2.2-i2v", name: "Wan 2.2 I2V", endpoint: "wan-2.2-i2v", provider: "Alibaba", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
  { id: "hailuo-02-i2v", name: "Hailuo 02 I2V", endpoint: "hailuo-02-i2v", provider: "MiniMax", aspectRatios: ["16:9", "9:16", "1:1"], durations: [6, 10] },
  { id: "runway-gen-3-i2v", name: "Runway Gen-3 I2V", endpoint: "runway-gen-3-i2v", provider: "Runway", aspectRatios: ["16:9", "9:16"], durations: [5, 10] },
  { id: "kling-v3-i2v", name: "Kling v3 I2V", endpoint: "kling-v3-i2v", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10] },
];

export const V2V_MODELS = [
  { id: "kling-v3-motion-control", name: "Kling Motion Control", endpoint: "kling-v3.0-pro-motion-control", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"] },
  { id: "kling-v2.1-motion-control", name: "Kling v2.1 Motion Control", endpoint: "kling-v2.1-pro-motion-control", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"] },
  { id: "watermark-remover", name: "Watermark Remover", endpoint: "watermark-remover", provider: "MuAPI" },
  { id: "video-upscaler", name: "Video Upscaler", endpoint: "video-upscaler", provider: "MuAPI" },
];

export const LIPSYNC_MODELS = [
  { id: "infinitetalk-image-to-video", name: "Infinite Talk", endpoint: "infinitetalk-image-to-video", provider: "MuAPI", resolutions: ["480p", "720p"], mode: "image" },
  { id: "wan2.2-speech-to-video", name: "Wan 2.2 Speech", endpoint: "wan2.2-speech-to-video", provider: "Alibaba", resolutions: ["480p", "720p"], mode: "image" },
  { id: "ltx-2.3-lipsync", name: "LTX 2.3 Lipsync", endpoint: "ltx-2.3-lipsync", provider: "LTX", resolutions: ["480p", "720p", "1080p"], mode: "image" },
  { id: "ltx-2-19b-lipsync", name: "LTX 2 19B", endpoint: "ltx-2-19b-lipsync", provider: "LTX", resolutions: ["480p", "720p", "1080p"], mode: "image" },
  { id: "sync-lipsync", name: "Sync Lipsync", endpoint: "sync-lipsync", provider: "Sync", mode: "video" },
  { id: "latentsync-video", name: "LatentSync", endpoint: "latentsync-video", provider: "LatentSync", mode: "video" },
  { id: "creatify-lipsync", name: "Creatify", endpoint: "creatify-lipsync", provider: "Creatify", mode: "video" },
  { id: "veed-lipsync", name: "Veed Lipsync", endpoint: "veed-lipsync", provider: "Veed", mode: "video" },
];

export const RECAST_MODELS = [
  { id: "kling-v3.0-pro-recast", name: "Kling v3.0 Pro Recast", endpoint: "kling-v3.0-pro-recast", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"], hasOrientation: true },
  { id: "kling-v2.1-pro-recast", name: "Kling v2.1 Pro Recast", endpoint: "kling-v2.1-pro-recast", provider: "Kling AI", aspectRatios: ["16:9", "9:16", "1:1"] },
];

export const AUDIO_MODELS = [
  { id: "suno-v4.5", name: "Suno v4.5", endpoint: "suno-v4.5", provider: "Suno", inputs: { prompt: { type: "string", title: "Prompt" }, duration: { type: "int", title: "Duration (sec)", default: 30, minValue: 10, maxValue: 300 } } },
  { id: "suno-v4", name: "Suno v4", endpoint: "suno-v4", provider: "Suno", inputs: { prompt: { type: "string", title: "Prompt" }, duration: { type: "int", title: "Duration (sec)", default: 30, minValue: 10, maxValue: 300 } } },
  { id: "suno-v3.5", name: "Suno v3.5", endpoint: "suno-v3.5", provider: "Suno", inputs: { prompt: { type: "string", title: "Prompt" }, duration: { type: "int", title: "Duration (sec)", default: 30, minValue: 10, maxValue: 300 } } },
  { id: "music-gen", name: "Music Gen", endpoint: "music-gen", provider: "Meta", inputs: { prompt: { type: "string", title: "Prompt" }, duration: { type: "int", title: "Duration (sec)", default: 30, minValue: 5, maxValue: 120 } } },
  { id: "audio-ldm2", name: "Audio LDM 2", endpoint: "audio-ldm2", provider: "Meta", inputs: { prompt: { type: "string", title: "Prompt" }, duration: { type: "int", title: "Duration (sec)", default: 10, minValue: 1, maxValue: 60 } } },
  { id: "bark-tts", name: "Bark TTS", endpoint: "bark-tts", provider: "Suno", inputs: { prompt: { type: "string", title: "Text" }, voice: { type: "enum", title: "Voice", enum: ["v2/en_speaker_0", "v2/en_speaker_1", "v2/en_speaker_2", "v2/en_speaker_3"], default: "v2/en_speaker_0" } } },
  { id: "voice-clone", name: "Voice Clone", endpoint: "voice-clone", provider: "MuAPI", inputs: { audio_url: { type: "file", title: "Reference Audio", accept: "audio/*" }, text: { type: "string", title: "Text to Speak" } } },
];

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
  {
    id: "face",
    label: "Face",
    categories: [
      { id: "character_type", label: "Character Type", options: [{ id: "human", label: "Human", promptVal: "human character" }, { id: "anime", label: "Anime", promptVal: "anime character" }, { id: "robot", label: "Robot", promptVal: "robot character" }] },
      { id: "gender", label: "Gender", options: [{ id: "male", label: "Male", promptVal: "male" }, { id: "female", label: "Female", promptVal: "female" }] },
      { id: "ethnicity", label: "Ethnicity", options: [{ id: "scandinavian", label: "Scandinavian", promptVal: "Scandinavian ethnicity" }, { id: "mediterranean", label: "Mediterranean", promptVal: "Mediterranean ethnicity" }, { id: "east-asian", label: "East Asian", promptVal: "East Asian ethnicity" }, { id: "south-asian", label: "South Asian", promptVal: "South Asian ethnicity" }, { id: "african", label: "African", promptVal: "African ethnicity" }, { id: "latina", label: "Latina", promptVal: "Latina ethnicity" }] },
      { id: "eye_color", label: "Eye Color", options: [{ id: "blue", label: "Blue", promptVal: "blue eyes" }, { id: "green", label: "Green", promptVal: "green eyes" }, { id: "brown", label: "Brown", promptVal: "brown eyes" }, { id: "hazel", label: "Hazel", promptVal: "hazel eyes" }, { id: "amber", label: "Amber", promptVal: "amber eyes" }] },
      { id: "hair", label: "Hair", options: [{ id: "short-black", label: "Short Black", promptVal: "short black hair" }, { id: "long-blonde", label: "Long Blonde", promptVal: "long blonde hair" }, { id: "curly-brown", label: "Curly Brown", promptVal: "curly brown hair" }, { id: "red-wavy", label: "Red Wavy", promptVal: "red wavy hair" }, { id: "silver-straight", label: "Silver Straight", promptVal: "silver straight hair" }, { id: "bald", label: "Bald", promptVal: "bald" }] },
    ],
  },
  {
    id: "body",
    label: "Body",
    categories: [
      { id: "body_type", label: "Body Type", options: [{ id: "slim", label: "Slim", promptVal: "slim body" }, { id: "athletic", label: "Athletic", promptVal: "athletic body" }, { id: "muscular", label: "Muscular", promptVal: "muscular body" }, { id: "curvy", label: "Curvy", promptVal: "curvy body" }] },
      { id: "accessories", label: "Accessories", options: [{ id: "none", label: "None", promptVal: "" }, { id: "glasses", label: "Glasses", promptVal: "wearing glasses" }, { id: "earrings", label: "Earrings", promptVal: "wearing earrings" }, { id: "necklace", label: "Necklace", promptVal: "wearing a necklace" }] },
    ],
  },
  {
    id: "style",
    label: "Style",
    categories: [
      { id: "rendering_style", label: "Rendering Style", options: [{ id: "photorealistic", label: "Photorealistic", promptVal: "photorealistic rendering" }, { id: "cinematic", label: "Cinematic", promptVal: "cinematic rendering" }, { id: "film-grain", label: "Film Grain", promptVal: "film grain rendering" }, { id: "studio-lighting", label: "Studio Lighting", promptVal: "studio lighting" }] },
    ],
  },
];