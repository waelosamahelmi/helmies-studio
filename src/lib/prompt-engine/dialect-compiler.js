// Pass 3 — Model Dialect Compilation
// Spec §30. Translate the expanded prompt into the model's preferred dialect
// using the PromptGuide registry (admin-editable). Falls back to a built-in
// family default when no guide row exists, so generation never blocks.

import prisma from "@/lib/prisma";

// ── Model families ───────────────────────────────────────────
// Determines the default dialect when no DB guide exists.
export function MODEL_FAMILY(tool, modelId = "") {
  const id = String(modelId).toLowerCase();
  if (tool === "audio" || id.includes("elevenlabs") || id.includes("suno")) return "audio";
  if (tool === "lipsync") return "lipsync";
  if (tool === "recast" || tool === "body-swap") return "recast";
  if (tool === "video" || tool === "i2v" || tool === "v2v") {
    if (id.includes("sora")) return "sora";
    if (id.includes("veo")) return "veo";
    if (id.includes("kling")) return "kling-video";
    if (id.includes("seedance")) return "seedance";
    if (id.includes("hailuo")) return "hailuo";
    if (id.includes("wan")) return "wan-video";
    if (id.includes("runway")) return "runway";
    return "video";
  }
  if (id.includes("midjourney")) return "midjourney";
  if (id.includes("flux")) return "flux";
  if (id.includes("nano-banana") || id.includes("imagen")) return "google-image";
  if (id.includes("gpt-image")) return "gpt-image";
  if (id.includes("seedream")) return "seedream";
  if (id.includes("qwen") || id.includes("wan-2.7-image")) return "alibaba-image";
  if (id.includes("ideogram")) return "ideogram";
  return "image";
}

// ── Built-in dialect defaults (used when no PromptGuide row exists) ──
const DIALECT_DEFAULTS = {
  flux: {
    syntax: "descriptive-prose",
    order: ["subject", "environment", "lighting", "camera", "style", "quality"],
    preferredPhrasing: "photographic, natural lighting, lens specs, editorial/street/fine art",
    forbidden: [],
  },
  midjourney: {
    syntax: "comma-tags",
    order: ["subject", "style", "mood", "composition", "color", "texture"],
    preferredPhrasing: "evocative artistic language, commas, no periods, MJ-friendly syntax",
    forbidden: ["periods at end", "long prose"],
  },
  "google-image": {
    syntax: "natural-language",
    order: ["subject", "environment", "lighting", "style"],
    preferredPhrasing: "natural descriptive sentences, aspect-aware",
    forbidden: [],
  },
  "gpt-image": {
    syntax: "instructional",
    order: ["subject", "instruction", "text"],
    preferredPhrasing: "instructional, exact-text friendly, supports text rendering",
    forbidden: [],
  },
  seedream: {
    syntax: "descriptive-tags",
    order: ["subject", "style", "lighting", "quality"],
    preferredPhrasing: "descriptive with strong style tags",
    forbidden: [],
  },
  "alibaba-image": {
    syntax: "descriptive-tags",
    order: ["subject", "environment", "style", "lighting"],
    preferredPhrasing: "descriptive with style tags",
    forbidden: [],
  },
  ideogram: {
    syntax: "instructional",
    order: ["subject", "text", "style"],
    preferredPhrasing: "typography-friendly, explicit text in quotes",
    forbidden: [],
  },
  sora: {
    syntax: "scene-prose",
    order: ["scene", "subjects", "dynamics", "camera", "narrative"],
    preferredPhrasing: "multi-subject scene, environmental dynamics, narrative arc within clip",
    forbidden: ["montage language", "cut to"],
  },
  veo: {
    syntax: "realistic-prose",
    order: ["physics", "lighting progression", "subject detail", "camera"],
    preferredPhrasing: "realistic physics and motion, natural lighting progression",
    forbidden: ["montage language"],
  },
  "kling-video": {
    syntax: "cinematic-prose",
    order: ["motion", "subject action", "scene", "camera", "lighting"],
    preferredPhrasing: "cinematic, motion-first, camera movement + speed",
    forbidden: ["montage language"],
  },
  seedance: {
    syntax: "fluid-prose",
    order: ["fluid motion", "camera", "subject grace", "atmosphere"],
    preferredPhrasing: "smooth fluid continuous motion, rhythmic pacing",
    forbidden: ["montage language"],
  },
  hailuo: {
    syntax: "cinematic-prose",
    order: ["scene", "subject", "camera", "mood"],
    preferredPhrasing: "cinematic scene description with mood",
    forbidden: ["montage language"],
  },
  "wan-video": {
    syntax: "action-prose",
    order: ["dynamic motion", "vfx", "lighting", "atmosphere"],
    preferredPhrasing: "dynamic action, visual effects, dramatic lighting",
    forbidden: ["montage language"],
  },
  runway: {
    syntax: "cinematic-prose",
    order: ["subject", "camera", "style"],
    preferredPhrasing: "cinematic, concise",
    forbidden: ["montage language"],
  },
  video: {
    syntax: "cinematic-prose",
    order: ["subject", "action", "camera", "lighting", "mood"],
    preferredPhrasing: "cinematic description with camera movement",
    forbidden: ["montage language"],
  },
  image: {
    syntax: "descriptive-prose",
    order: ["subject", "environment", "lighting", "camera", "style"],
    preferredPhrasing: "descriptive, photographic",
    forbidden: [],
  },
  audio: {
    syntax: "tag-prose",
    order: ["genre", "instruments", "tempo", "mood", "production"],
    preferredPhrasing: "genre + instrumentation + tempo + mood + production style",
    forbidden: ["specific song names"],
  },
  lipsync: {
    syntax: "minimal",
    order: ["identity"],
    preferredPhrasing: "minimal action, identity preservation",
    forbidden: ["action verbs", "camera moves"],
  },
  recast: {
    syntax: "minimal",
    order: ["identity", "target scene"],
    preferredPhrasing: "identity preservation, target wardrobe/scene only",
    forbidden: ["changing the face identity"],
  },
};

// ── PromptGuide cache (in-process, short TTL) ────────────────
let guideCache = new Map(); // key: `${modelId}:${category}` → { content, version, expires }
const GUIDE_TTL_MS = 60_000;

async function loadGuide(modelId, category) {
  const key = `${modelId}:${category}`;
  const cached = guideCache.get(key);
  if (cached && cached.expires > Date.now()) return cached;

  try {
    const guide = await prisma.promptGuide.findUnique({ where: { modelId_category: { modelId, category } } });
    if (guide) {
      const latest = await prisma.promptGuideVersion.findFirst({
        where: { guideId: guide.id },
        orderBy: { version: "desc" },
      });
      if (latest) {
        const entry = { content: latest.content, version: latest.version, expires: Date.now() + GUIDE_TTL_MS };
        guideCache.set(key, entry);
        return entry;
      }
    }
  } catch {}
  return null;
}

// ── Dialect compilation ──────────────────────────────────────
function applyOrder(prompt, order) {
  // For comma-tag syntax this is a no-op re-order; for prose we keep as-is.
  // The order is a hint for validators/polish, not a hard rewrite here.
  return prompt;
}

export async function compileDialect(state) {
  const family = MODEL_FAMILY(state.tool, state.modelId);
  const category = state.tool === "audio" ? "audio/base" : family.includes("video") ? "video/base" : "image/base";

  const guide = await loadGuide(state.modelId, category);
  const dialect = guide?.content || DIALECT_DEFAULTS[family] || DIALECT_DEFAULTS.image;

  state.guideVersion = guide?.version ?? null;
  state.dialectGuide = dialect;

  const basePrompt = state.expandedPrompt || state.rawPrompt;

  // For most dialects we keep the expanded prompt; the guide's preferred
  // phrasing/order is enforced by the validator + polish passes to avoid
  // double LLM calls. Minimal dialects (lipsync/recast) are trimmed.
  if (dialect.syntax === "minimal") {
    state.dialectPrompt = basePrompt.split(/[.,;]/).slice(0, 2).join(", ").trim();
  } else {
    state.dialectPrompt = applyOrder(basePrompt, dialect.order);
  }

  // Negative prompt from guide or family default
  state.negativePrompt = dialect.negativePrompt || DEFAULT_NEGATIVES[family] || DEFAULT_NEGATIVES.image;

  return state;
}

const DEFAULT_NEGATIVES = {
  image: "low quality, blurry, distorted, deformed, watermark, text overlay, jpeg artifacts, oversaturated, cropped, out of frame",
  midjourney: "low quality, blurry, distorted, watermark, text, jpeg artifacts, cropped",
  video: "low quality, blurry, distorted, watermark, text overlay, flickering, artifacts, stuttering motion",
  audio: "distortion, clipping, noise, artifacts, low quality",
  lipsync: "unnatural mouth movement, distortion, low quality",
  recast: "identity change, distortion, low quality, artifacts",
};