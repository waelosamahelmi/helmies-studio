// Helmies Studio — Canvas Compiler
// Spec §6.4. Converts a Canvas document (from CanvasEditor.compile()) into
// model-ready instructions:
//   1. flattened composition guide image
//   2. clean source render
//   3. inpaint mask / preservation mask
//   4. reference assets with semantic roles
//   5. region instructions with bounding boxes
//   6. text requirements
//   7. compiled prompt + negative prompt
//   8. model-specific request
//   9. warnings for incompatible model/canvas combos
//
// This is a pure module — it does NOT call providers. The CanvasWorkspace
// calls compileCanvas() then submits the result through useAsyncGeneration.

import { IMAGE_MODELS, I2I_MODELS } from "./models";

const ALL_IMAGE_MODELS = [...IMAGE_MODELS, ...I2I_MODELS];

/**
 * Compile a canvas document into model-ready instructions.
 * @param {object} canvasDoc - output of CanvasEditor.compile()
 * @param {object} opts - { modelId, prompt, negativePrompt, aspectRatio }
 * @returns {object} compiled instructions + warnings
 */
export function compileCanvas(canvasDoc, opts = {}) {
  const { modelId, prompt = "", negativePrompt = "", aspectRatio } = opts;
  const warnings = [];

  const model = ALL_IMAGE_MODELS.find((m) => m.id === modelId);
  if (!model) warnings.push(`Unknown model "${modelId}". Canvas compilation may be incomplete.`);

  const objects = canvasDoc?.objects || [];
  const masks = canvasDoc?.masks || {};
  const canvasW = canvasDoc?.canvas?.width || 1024;
  const canvasH = canvasDoc?.canvas?.height || 1024;

  // 1. Classify objects by semantic role
  const references = [];
  const textRegions = [];
  const regions = [];
  const preserveTargets = [];
  const removeTargets = [];
  const inpaintRegions = [];
  const colorRefs = [];

  for (const obj of objects) {
    const role = obj.role || "layout_reference";
    const bounds = obj.bounds || {};
    const normalized = normalizeBounds(bounds, canvasW, canvasH);

    if (obj.type === "image" && obj.src) {
      references.push({ url: obj.src, role, bounds: normalized, id: obj.id });
    }
    if (obj.type === "text") {
      textRegions.push({ text: obj.text, fontSize: obj.fontSize, fontFamily: obj.fontFamily, bounds: normalized, id: obj.id });
    }
    if (role === "preserve_exactly") preserveTargets.push({ id: obj.id, bounds: normalized });
    if (role === "remove_target") removeTargets.push({ id: obj.id, bounds: normalized });
    if (role === "inpaint_region") inpaintRegions.push({ id: obj.id, bounds: normalized });
    if (role === "color_reference" && obj.src) colorRefs.push({ url: obj.src, id: obj.id });
    if (role === "composition_anchor" || role === "layout_reference") {
      regions.push({ id: obj.id, role, bounds: normalized, note: obj.note || null });
    }
  }

  // 2. Mask handling
  const includeMask = (masks.include || []).map((m) => ({ id: m.id, bounds: normalizeBounds(m.bounds, canvasW, canvasH) }));
  const excludeMask = (masks.exclude || []).map((m) => ({ id: m.id, bounds: normalizeBounds(m.bounds, canvasW, canvasH) }));
  const hasMasks = includeMask.length > 0 || excludeMask.length > 0;

  // 3. Model capability checks → warnings
  if (model) {
    if (hasMasks && (model.maxImages == null || model.id.includes("flux-dev") && !model.id.includes("kontext"))) {
      // Most T2I models can't accept masks directly; only edit models can
      if (!I2I_MODELS.find((m) => m.id === modelId)) {
        warnings.push(`${model.name} may not accept masks directly. Use an edit model (Flux Kontext, Nano Banana Edit) for inpainting.`);
      }
    }
    if (references.length > (model.maxImages || 1)) {
      warnings.push(`${model.name} supports ${model.maxImages || 1} reference(s); canvas has ${references.length}. Composition will be flattened.`);
    }
    if (textRegions.length > 0 && !isTextCapable(modelId)) {
      warnings.push(`${model.name} may not render exact text reliably. Use GPT Image or Ideogram for text. Text: "${textRegions[0].text}".`);
    }
  }

  // 4. Determine routing strategy (spec §6.5)
  let strategy = "t2i";
  if (references.length > 0 && model?.maxImages && references.length <= model.maxImages) {
    strategy = "multi_ref";
  } else if (references.length === 1 && I2I_MODELS.find((m) => m.id === modelId)) {
    strategy = "i2i";
  } else if (hasMasks && I2I_MODELS.find((m) => m.id === modelId)) {
    strategy = "inpaint";
  } else if (references.length > 0) {
    strategy = "flatten_guide";
  }

  // 5. Build compiled prompt from canvas instructions
  const instructionBits = canvasDoc?.instructions || [];
  const textBits = textRegions.map((t) => `exact text "${t.text}"`);
  const regionBits = regions.map((r) => `${r.role} at ${describeBounds(r.bounds)}`);
  const preserveBits = preserveTargets.map((p) => `preserve region at ${describeBounds(p.bounds)}`);
  const removeBits = removeTargets.map((r) => `remove region at ${describeBounds(r.bounds)}`);

  const compiledPrompt = [
    prompt,
    textBits.length ? `with ${textBits.join(", ")}` : null,
    regionBits.length ? regionBits.join("; ") : null,
    preserveBits.length ? preserveBits.join("; ") : null,
    removeBits.length ? removeBits.join("; ") : null,
    instructionBits.length ? instructionBits.join("; ") : null,
  ].filter(Boolean).join(". ");

  // 6. Negative prompt
  const compiledNegative = negativePrompt || "low quality, blurry, distorted, watermark, text overlay, jpeg artifacts";

  // 7. Model-specific request payload
  const request = buildModelRequest(strategy, modelId, {
    prompt: compiledPrompt,
    negativePrompt: compiledNegative,
    references,
    textRegions,
    includeMask: includeMask,
    excludeMask: excludeMask,
    aspectRatio: aspectRatio || canvasDoc?.aspectRatio || "1:1",
    canvasW, canvasH,
  });

  return {
    strategy,
    references,
    textRegions,
    regions,
    preserveTargets,
    removeTargets,
    inpaintRegions,
    colorRefs,
    masks: { include: includeMask, exclude: excludeMask, hasMasks },
    compiledPrompt,
    compiledNegative,
    request,
    warnings,
    canvasSnapshot: { width: canvasW, height: canvasH, objectCount: objects.length },
  };
}

// ── Helpers ─────────────────────────────────────────────────
function normalizeBounds(bounds, canvasW, canvasH) {
  if (!bounds) return { x: 0, y: 0, w: 0, h: 0 };
  return {
    x: bounds.left / canvasW,
    y: bounds.top / canvasH,
    w: bounds.width / canvasW,
    h: bounds.height / canvasH,
  };
}

function describeBounds(b) {
  if (!b) return "center";
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const hPos = cx < 0.33 ? "left" : cx > 0.66 ? "right" : "center";
  const vPos = cy < 0.33 ? "top" : cy > 0.66 ? "bottom" : "middle";
  const size = b.w * b.h > 0.4 ? "large" : b.w * b.h > 0.15 ? "medium" : "small";
  return `${size} ${vPos} ${hPos}`;
}

function isTextCapable(modelId) {
  return ["gpt-image-1.5", "gpt-image-2", "ideogram-v3", "ideogram-v3-edit", "ideogram-v3-remix"].includes(modelId) ||
    modelId?.includes("gpt-image") || modelId?.includes("ideogram");
}

function buildModelRequest(strategy, modelId, ctx) {
  const base = {
    endpoint: modelId,
    prompt: ctx.prompt,
    negative_prompt: ctx.negativePrompt,
    aspect_ratio: ctx.aspectRatio,
  };

  switch (strategy) {
    case "multi_ref":
      // Model supports multiple references — send directly
      return { ...base, images_list: ctx.references.map((r) => r.url) };

    case "i2i":
      // Single reference edit
      return { ...base, image_url: ctx.references[0]?.url };

    case "inpaint":
      // Edit model with masks — send reference + mask metadata
      return {
        ...base,
        image_url: ctx.references[0]?.url,
        mask_include: ctx.includeMask,
        mask_exclude: ctx.excludeMask,
      };

    case "flatten_guide":
      // Model can't take multi-ref — caller should flatten to a composition guide image.
      // We pass the first reference as the guide and describe the rest in the prompt.
      return {
        ...base,
        image_url: ctx.references[0]?.url,
        composition_note: ctx.references.slice(1).map((r) => `${r.role} at ${describeBounds(r.bounds)}`).join("; "),
      };

    case "t2i":
    default:
      // Text-only — spatial prompt describes positions
      return { ...base };
  }
}

// ── Flatten composition to a guide image (client-side, used by CanvasWorkspace) ──
// Returns a data URL of the canvas rendered at the target resolution.
// The CanvasWorkspace calls this when strategy === "flatten_guide".
export async function flattenToGuideImage(fabricCanvas, targetW = 1024, targetH = 1024) {
  if (!fabricCanvas) return null;
  try {
    const dataUrl = fabricCanvas.toDataURL({
      format: "png",
      quality: 1,
      multiplier: Math.max(targetW / fabricCanvas.width, targetH / fabricCanvas.height),
    });
    return dataUrl;
  } catch {
    return null;
  }
}