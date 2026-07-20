export const CREDIT_COSTS = {
  image: {
    default: 2,
    "nano-banana": 2,
    "nano-banana-pro": 3,
    "flux-dev": 2,
    "flux-schnell": 1,
    "midjourney-v7-text-to-image": 5,
    "gpt4o-text-to-image": 3,
    "google-imagen4-ultra": 4,
    "bytedance-seedream-v4": 3,
    "kling-o1-text-to-image": 3,
  },
  i2i: {
    default: 3,
    "flux-kontext-dev": 3,
    "nano-banana-edit": 3,
    "nano-banana-pro-edit": 4,
    "gpt4o-edit": 4,
  },
  video: {
    default: 10,
    "kling-v3": 15,
    "sora-2": 20,
    "veo-3": 20,
    "veo-3-fast": 12,
    "wan-2.6": 8,
    "seedance-2.0": 12,
    "hailuo-02": 8,
    "runway-gen-3": 15,
  },
  i2v: {
    default: 12,
    "kling-v2.1-i2v": 15,
    "seedance-2.0-i2v": 14,
    "veo-3-i2v": 22,
  },
  v2v: {
    default: 8,
  },
  lipsync: {
    default: 8,
    "infinitetalk-image-to-video": 8,
    "wan2.2-speech-to-video": 10,
    "ltx-2.3-lipsync": 6,
    "sync-lipsync": 5,
    "latentsync-video": 6,
  },
  audio: {
    default: 5,
  },
  recast: {
    default: 12,
    "kling-v3.0-pro-recast": 18,
  },
  cinema: {
    default: 4,
  },
  motion: {
    default: 8,
  },
  clipping: {
    default: 6,
  },
  marketing: {
    default: 15,
  },
  influencer: {
    default: 3,
  },
};

export function getCreditCost(tool, model) {
  const toolCosts = CREDIT_COSTS[tool] || CREDIT_COSTS.image;
  return toolCosts[model] || toolCosts.default || 1;
}

export const SUBSCRIPTION_CREDITS = {
  free: 100,
  starter: 1000,
  studio: 3000,
  pro: 10000,
};

export const PLAN_IDS = {
  [process.env.STRIPE_PRICE_STARTER]: "starter",
  [process.env.STRIPE_PRICE_STUDIO]: "studio",
  [process.env.STRIPE_PRICE_PRO]: "pro",
};