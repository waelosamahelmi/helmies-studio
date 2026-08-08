// Helmies Studio — what a provider charges us (worker-safe core).
//
// Extracted from kie-sync.js so it can be read outside Next: an audit
// script that cannot import the pricing table is an audit that does not
// get run, and a $1.28 model billed at EUR 0.08 sat in production
// precisely because nothing was checking.
//
// Relative imports only. No `@/` alias, no prisma, no side effects.

export const KIE_PRICING_OVERRIDES = {
  // Image — per image
  "nano-banana-2-lite": 0.04,
  "nano-banana-pro": 0.09,
  "nano-banana": 0.04,
  "imagen4": 0.038,
  "imagen4-fast": 0.018,
  "imagen4-ultra": 0.058,
  "flux-dev": 0.012,
  "flux-schnell": 0.003,
  "flux-2-dev": 0.012,
  "flux-kontext-dev": 0.02,
  "flux-kontext-pro": 0.04,
  "midjourney": 0.10,
  "gpt-image-1.5": 0.03,
  "gpt-image-2": 0.03,
  "gpt-image-2-text-to-image": 0.03,
  "gpt-image-2-image-to-image": 0.03,
  "hunyuan-image-3": 0.10,
  "qwen-text-to-image": 0.02,
  "wan-2-5-text-to-image": 0.03,
  "wan-2-7-image": 0.02,
  "wan-2-7-image-pro": 0.04,
  "kling-text-to-image": 0.028,
  "kling-image-edit": 0.028,
  "ideogram-v3-text-to-image": 0.06,
  "grok-imagine-text-to-image": 0.022,
  "seedream-v4-text-to-image": 0.027,
  "seedream-v4-edit": 0.027,
  "seedream-5-lite-text-to-image": 0.035,
  "seedream-5-pro-text-to-image": 0.045,
  "seedream-5-pro-image-to-image": 0.045,
  "z-image": 0.004,
  "topaz-image-upscale": 0.01,
  "recraft-remove-background": 0.02,
  "recraft-crisp-upscale": 0.004,
  
  // Video — per video (5s base)
  "veo3": 1.28,
  "veo3_fast": 1.20,
  "sora-2-text-to-video": 0.40,
  "kling-3-0": 0.42,
  "kling-text-to-video": 0.42,
  "kling-image-to-video": 0.42,
  "kling-v2-1-standard": 0.25,
  "kling-v2-1-pro": 0.45,
  "kling-v2-1-master-text-to-video": 1.30,
  "kling-v2-1-master-image-to-video": 1.30,
  "kling-v25-turbo-text-to-video-pro": 0.35,
  "kling-v25-turbo-image-to-video-pro": 0.35,
  "kling-v3-turbo-text-to-video": 0.42,
  "kling-v3-turbo-image-to-video": 0.42,
  "kling-motion-control": 0.42,
  "kling-motion-control-v3": 0.42,
  "kling-ai-avatar-standard": 0.42,
  "kling-ai-avatar-pro": 0.56,
  "seedance-2": 0.57,
  "seedance-2-fast": 0.50,
  "seedance-2-mini": 0.60,
  // UNCONFIRMED — carried over from 2.0 because KIE's 2.5 doc page states no
  // price. Explicit rather than left to getPricing's prefix match, which
  // would land on the same number by accident. Left at the 2.0 rate on
  // purpose: falling through to the 0.30 text-to-video default would bill
  // barely half of what a 2.x video actually costs us. Confirm against
  // kie.ai/pricing and correct this line.
  "seedance-2-5": 0.57,
  "seedance-1-5-pro": 0.26,
  "seedance-2.0-i2v": 0.57,
  "wan-2-6-text-to-video": 0.50,
  "wan-2-6-image-to-video": 0.50,
  "wan-2-6-video-to-video": 0.50,
  "wan-2-6-flash-image-to-video": 0.25,
  "wan-2-6-flash-video-to-video": 0.25,
  "wan-2-5-text-to-video": 0.25,
  "wan-2-5-image-to-video": 0.25,
  "wan-2-7-text-to-video": 0.50,
  "wan-2-7-image-to-video": 0.50,
  "wan-2-7-videoedit": 0.50,
  "wan-2-7-r2v": 0.50,
  "wan-2-2-a14b-text-to-video-turbo": 0.05,
  "wan-2-2-a14b-image-to-video-turbo": 0.05,
  "wan-2-2-animate-move": 0.10,
  "wan-2-2-animate-replace": 0.10,
  "hailuo-02-text-to-video-standard": 0.23,
  "hailuo-02-image-to-video-standard": 0.23,
  "hailuo-02-text-to-video-pro": 0.48,
  "hailuo-02-image-to-video-pro": 0.48,
  "hailuo-2-3-text-to-video-standard": 0.28,
  "hailuo-2-3-image-to-video-standard": 0.28,
  "hailuo-2-3-image-to-video-pro": 0.49,
  "grok-imagine-text-to-video": 0.05,
  "grok-imagine-image-to-video": 0.05,
  "grok-imagine-extend": 0.05,
  "grok-imagine-1-5-preview": 0.05,
  "runway-aleph": 0.05,
  "runway-generate-ai-video": 0.05,
  "runway-extend-ai-video": 0.05,
  "topaz-video-upscale": 0.025,
  "video-upscaler": 0.025,
  "watermark-remover": 0.05,
  
  // Audio/Music
  "suno-v5.5": 0.002,
  "suno-v5": 0.002,
  "suno-v4.5-plus": 0.002,
  "suno-v4.5": 0.002,
  "suno-v4.5-all": 0.002,
  "suno-v4": 0.002,
  "elevenlabs-text-to-speech-turbo-2.5": 0.07,
  "elevenlabs-text-to-speech-multilingual-v2": 0.07,
  "elevenlabs-text-to-dialogue-v3": 0.07,
  "elevenlabs-audio-isolation": 0.02,
  "gemini-3-1-flash-tts": 0.05,
  "gemini-2-5-pro-tts": 0.10,
  
  // Lipsync
  "veed-lipsync": 0.10,
  "sync-lipsync-v3": 0.10,
  "infinitetalk": 0.15,
  "wan-2-2-a14b-speech-to-video-turbo": 0.10,
  "volcengine-video-to-video-lip-sync": 0.08,
  "omnihuman-1-5": 0.20,
  "gemini-omni-character": 0.15,
  "gemini-omni-video": 0.15,
  "gemini-omni-audio": 0.10,
  
  // LLM (per call, approximate)

  // I2I sub-models
  "1-5-image-to-image": 0.03,
  "1-5-text-to-image": 0.03,
  "4-5-edit": 0.035,
  "4-5-text-to-image": 0.035,
  "5-lite-image-to-image": 0.035,
  "5-lite-text-to-image": 0.035,
  "5-pro-image-to-image": 0.045,
  "5-pro-text-to-image": 0.045,
  "character-edit": 0.06,
  "character-remix": 0.06,
  "character": 0.04,
  "v3-edit": 0.06,
  "v3-remix": 0.06,
  "crisp-upscale": 0.004,

  // Audio sub-models (Suno suite)
  "generate-music": 0.002,
  "extend-music": 0.002,
  "upload-and-cover-audio": 0.002,
  "upload-and-extend-audio": 0.002,
  "add-instrumental": 0.002,
  "add-vocals": 0.002,
  "cover-suno": 0.002,
  "replace-section": 0.002,
  "generate-persona": 0.002,
  "generate-mashup": 0.002,
  "generate-lyrics": 0.001,
  "generate-sounds": 0.002,
  "suno-voice-generate": 0.002,
  "generate-midi": 0.002,
  "create-music-video": 0.005,
  "separate-vocals": 0.002,
  "convert-to-wav": 0.001,
  "boost-music-style": 0.002,
  "audio-isolation": 0.01,
  "elevenlabs-audio-isolation": 0.01,

  // LLM (per call, approximate based on KIE pricing)
  "gemini-2.5-flash": 0.001,
  "gemini-2.5-flash-openai": 0.001,
  "gemini-3-flash": 0.002,
  "gemini-3-flash-v1beta": 0.002,
  "gemini-3-5-flash": 0.002,
  "gemini-3-5-flash-openai": 0.002,
  "gemini-3-6-flash": 0.002,
  "gemini-3-6-flash-openai": 0.002,
  "gemini-2-5-pro": 0.005,
  "gemini-3-pro": 0.01,
  "gemini-3-1-pro": 0.01,
  "claude-haiku-4-5": 0.002,
  "claude-opus-4-5": 0.005,
  "claude-opus-4-6": 0.005,
  "claude-opus-4-7": 0.005,
  "claude-opus-4-8": 0.005,
  "claude-opus-5": 0.005,
  "claude-sonnet-4-5": 0.003,
  "claude-sonnet-4-6": 0.003,
  "cluade-fable-5": 0.003,
  "cluade-sonnet-5": 0.003,
  "gpt-5-2": 0.005,
  "gpt-5-4": 0.005,
  "gpt-5-5": 0.005,
  "gpt-5-6-luna": 0.005,
  "gpt-5-6-sol": 0.005,
  "gpt-5-6-terra": 0.005,
  "grok-4-3": 0.003,
  "grok-4-5": 0.003,
  "gpt-codex": 0.005,
  "gemini-2.5-flash-llm": 0.000645,
};

export const DEFAULT_PRICING = {
  "text-to-image": 0.03,
  "image-to-image": 0.04,
  "text-to-video": 0.30,
  "image-to-video": 0.30,
  "video-to-video": 0.30,
  "text-to-speech": 0.05,
  "text-to-music": 0.002,
  "audio": 0.005,
  "tts": 0.05,
  "lip-sync": 0.10,
  "speech-to-video": 0.10,
  "video-upscale": 0.025,
  "image-upscale": 0.01,
  "chat": 0.001,
  "llm": 0.001,
};

/* Model ids arrive punctuated every way a provider felt like: "veo3",
   "veo-3", "generate-veo-3-video", "bytedance/seedance-1.5-pro". Comparing
   them literally is why a $1.28 model was matched by nothing and fell
   through to the $0.03 video default — the old rule also refused to match
   any key under five characters, which excluded "veo3" itself. */
const priceKey = (id) => String(id || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Longest key first, so "wan27imagepro" wins over "wan27image" and a
// specific variant is never priced as its cheaper base.
const OVERRIDE_KEYS_BY_LENGTH = Object.keys(KIE_PRICING_OVERRIDES)
  .map((k) => ({ key: k, norm: priceKey(k), price: KIE_PRICING_OVERRIDES[k] }))
  .sort((a, b) => b.norm.length - a.norm.length);

export function getPricing(modelId, type) {
  // Check overrides first
  if (KIE_PRICING_OVERRIDES[modelId]) {
    return KIE_PRICING_OVERRIDES[modelId];
  }

  const norm = priceKey(modelId);

  /* Two passes, and the order matters.

     FORWARD — the id contains a known key ("generateveo3video" contains
     "veo3"). Longest key first, so a specific variant is never priced as
     its cheaper base.

     REVERSE — a known key contains the id, for catalog ids shorter than
     the key we listed. SHORTEST key first here: the closest key is the
     right one. Run together with the forward pass, this direction is what
     made "veo-3" match "veo3_fast" and bill EUR 0.08 short of cost. */
  for (const entry of OVERRIDE_KEYS_BY_LENGTH) {
    if (entry.norm.length >= 3 && norm.includes(entry.norm)) return entry.price;
  }
  for (let i = OVERRIDE_KEYS_BY_LENGTH.length - 1; i >= 0; i--) {
    const entry = OVERRIDE_KEYS_BY_LENGTH[i];
    if (norm.length >= 3 && entry.norm.includes(norm)) return entry.price;
  }

  /* Nothing matched. For a still or an audio clip the default is close
     enough to be harmless, but guessing a VIDEO price is how we ended up
     charging 8 credits (EUR 0.08) for a model that costs USD 1.28 every
     time it runs. Say so loudly rather than booking a quiet loss. */
  if (["video", "i2v", "v2v"].includes(type)) {
    console.warn(`[pricing] no price known for video model "${modelId}" — falling back to the default, which is almost certainly too low. Add it to KIE_PRICING_OVERRIDES.`);
  }

  // Fall back to default pricing by type
  const typeKey = type === "image" ? "text-to-image" :
                  type === "i2i" ? "image-to-image" :
                  type === "video" ? "text-to-video" :
                  type === "i2v" ? "image-to-video" :
                  type === "v2v" ? "video-to-video" :
                  type === "lipsync" ? "lip-sync" :
                  type === "audio" ? "text-to-music" :
                  type === "llm" ? "chat" : "text-to-image";
  
  return DEFAULT_PRICING[typeKey] || 0.03;
}
