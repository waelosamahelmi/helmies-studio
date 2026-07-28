// Pass 4 — Deterministic Validation
// Spec §31. Validate WITHOUT an LLM: prompt length, unsupported parameters,
// reference count, required reference, duration, resolution, aspect, exact
// text compatibility, mask dimensions, conflicting controls. Adds warnings
// (non-blocking) and hard errors (caller should block generation).

import { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS } from "@/lib/models";

const ALL_IMAGE = [...IMAGE_MODELS, ...I2I_MODELS];
const ALL_VIDEO = [...VIDEO_MODELS, ...I2V_MODELS];

function findModel(modelId) {
  return ALL_IMAGE.find((m) => m.id === modelId) || ALL_VIDEO.find((m) => m.id === modelId) || null;
}

const LIMITS = {
  image: { minWords: 1, maxChars: 2000 },
  video: { minWords: 1, maxChars: 1500 },
  audio: { minWords: 1, maxChars: 1000 },
  lipsync: { minWords: 0, maxChars: 500 },
  recast: { minWords: 0, maxChars: 500 },
};

export function validate(state) {
  const warnings = state.warnings || [];
  const model = findModel(state.modelId);
  const tool = state.tool;
  const prompt = state.dialectPrompt || state.expandedPrompt || state.rawPrompt || "";
  const settings = state.settings || {};

  // 1. Prompt length
  const limits = LIMITS[tool] || LIMITS.image;
  if (prompt.length > limits.maxChars) {
    warnings.push(`Prompt is ${prompt.length} chars (max ${limits.maxChars}). It may be truncated.`);
  }

  // 2. Aspect ratio supported by model
  if (model?.aspectRatios && settings.aspect_ratio && !model.aspectRatios.includes(settings.aspect_ratio)) {
    warnings.push(`Aspect ${settings.aspect_ratio} may not be supported by ${model.name}. Supported: ${model.aspectRatios.join(", ")}.`);
  }

  // 3. Resolution tier
  if (model?.resolutions && settings.resolution) {
    const tiers = model.resolutions.map((r) => String(r).toLowerCase());
    if (!tiers.includes(String(settings.resolution).toLowerCase())) {
      warnings.push(`Resolution ${settings.resolution} not in ${model.name} tiers (${model.resolutions.join(", ")}).`);
    }
  }

  // 4. Reference count vs model maxImages
  const refCount = (state.references || []).length;
  if (model?.maxImages != null && refCount > model.maxImages) {
    warnings.push(`Model ${model.name} supports ${model.maxImages} reference(s); you provided ${refCount}. Extras will be ignored.`);
  }

  // 5. Required reference for edit/i2v/lipsync/recast
  const needsRef = ["i2i", "i2v", "lipsync", "recast", "body-swap"].includes(tool);
  if (needsRef && refCount === 0 && !settings.image_url && !settings.video_url) {
    warnings.push(`${tool} requires a reference input (image or video).`);
  }

  // 6. Duration within model durations
  if (model?.durations && settings.duration != null && !model.durations.includes(Number(settings.duration))) {
    warnings.push(`Duration ${settings.duration}s not supported by ${model.name}. Supported: ${model.durations.join(", ")}s.`);
  }

  // 7. Exact text compatibility — warn if exact text requested but model can't render text
  const hasExactText = (state.normalized?.exactTexts || []).length > 0;
  const textCapable = ["gpt-image", "ideogram"].includes(state.modelId) || state.modelId?.includes("gpt-image") || state.modelId?.includes("ideogram");
  if (hasExactText && !textCapable && tool === "image") {
    warnings.push(`Exact text "${state.normalized.exactTexts[0]}" requested; choose GPT Image or Ideogram for reliable text rendering.`);
  }

  // 8. Conflicting controls
  if (settings.seed != null && Number(settings.seed) < -1) {
    warnings.push("Seed must be -1 (random) or >= 0.");
  }

  // 9. Mask dimensions (if canvas provided with masks)
  if (state.canvas?.masks) {
    for (const mask of state.canvas.masks) {
      if (mask.width && mask.height && (mask.width < 64 || mask.height < 64)) {
        warnings.push(`Mask ${mask.id || ""} is ${mask.width}x${mask.height}; minimum 64x64 recommended.`);
      }
    }
  }

  // 10. Forbidden dialect terms
  const dialect = state.dialectGuide;
  if (dialect?.forbidden?.length) {
    const lower = prompt.toLowerCase();
    for (const term of dialect.forbidden) {
      if (lower.includes(term.toLowerCase())) {
        warnings.push(`Prompt contains "${term}" which is discouraged for this model dialect.`);
      }
    }
  }

  state.warnings = warnings;
  state.validationDone = true;
  return state;
}