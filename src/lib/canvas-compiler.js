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

  /* The LIVE catalog is the authority on what a model is, not the static list
     in models.js — nearly every id there is retired, so looking a real model up
     in it found nothing: every canvas compiled under an "Unknown model" warning,
     none of the capability warnings below could fire, and the routing never
     left "t2i"/"flatten_guide". A caller that has the catalog row passes it as
     `opts.model` ({ id, name, maxImages, capability } — what useModelCatalog
     returns); the static list is only a fallback for the ids it still knows. */
  const model = opts.model || ALL_IMAGE_MODELS.find((m) => m.id === modelId) || null;
  if (!modelId) warnings.push("No model selected. Canvas compilation may be incomplete.");
  const label = model?.name || model?.displayName || "This model";
  const editModel = isEditModel(model, modelId);

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
  if (modelId) {
    // Decided from the id, because that is what says whether a mask field
    // exists: only the inpainting routes declare one (mask_url / maskUrl).
    if (hasMasks && !acceptsMask(modelId)) {
      warnings.push(`${label} does not take a mask. Use Ideogram 3.0 Inpaint or GPT-4o Image for inpainting.`);
    }
    if (model && references.length > (model.maxImages || 1)) {
      warnings.push(`${label} supports ${model.maxImages || 1} reference(s); canvas has ${references.length}. Composition will be flattened.`);
    }
    if (textRegions.length > 0 && !isTextCapable(modelId)) {
      warnings.push(`${label} may not render exact text reliably. Use GPT Image or Ideogram for text. Text: "${textRegions[0].text}".`);
    }
  }

  // 4. Determine routing strategy (spec §6.5)
  let strategy = "t2i";
  if (references.length > 0 && model?.maxImages && references.length <= model.maxImages) {
    strategy = "multi_ref";
  } else if (references.length === 1 && editModel) {
    strategy = "i2i";
  } else if (hasMasks && editModel) {
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

// Families that set type reliably. The exact ids that stood here
// ("gpt-image-1.5", "ideogram-v3"…) are not ids the catalog holds — the live
// ones are gpt-image/1.5-text-to-image, generate-4-o-image, ideogram/v3-… — so
// only the family test below ever matched. It is now the whole test.
function isTextCapable(modelId) {
  return /gpt-image|generate-4-o-image|ideogram/.test(String(modelId || ""));
}

// The routes whose schema declares a mask field.
function acceptsMask(modelId) {
  return /^ideogram\/(v3-edit|character-edit)$|^generate-4-o-image$/.test(String(modelId || ""));
}

// Takes a picture in and gives a changed picture back. The catalog row says so
// when the caller passed it; otherwise the id does (same markers as
// model-catalog-core.mjs's inferCapability).
function isEditModel(model, modelId) {
  if (model?.capability) return ["image-to-image", "i2i", "image-edit"].includes(model.capability);
  if (I2I_MODELS.find((m) => m.id === modelId)) return true;
  return /image-to-image|image-edit|edit-image|remix|(?<!video)-edit$|^ideogram\/character$/.test(String(modelId || ""));
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