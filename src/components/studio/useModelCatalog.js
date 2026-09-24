"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { matchesGroup } from "@/lib/capability-groups";

/* Image-input fields across the families in the live catalog, widest first.
   Kept in step with entity-core.mjs's IMAGE_REFERENCE_FIELDS, which is what
   the SERVER writes references into — if these two disagree, a studio offers
   a model whose references the server then has nowhere to put.

   The last three were missing and each hid a whole family:
   · input_urls       — flux-2, gpt-image and seedance 1.5 (the server list
                        already had it; this one had not caught up)
   · image_references — pixverse reference-to-video
   · first_frame_url  — minimax-h3 and wan 2.7, which have NO image_url: the
                        still goes in as the first frame
   The last two are not entity-reference slots; they are filled at submit by
   provider-payload-core.mjs's adaptInputsToSchema, which knows both names. */
const IMAGE_INPUT_FIELDS = [
  ["reference_image_urls", 4],
  ["reference_images", 4],
  ["image_input", 4],
  ["images_list", 4],
  ["image_urls", 4],
  ["input_urls", 4],
  ["image_references", 4],
  ["reference_image", 1],
  ["image_url", 1],
  ["first_frame_url", 1],
];

export function maxImagesFromFields(fields) {
  for (const [name, assumed] of IMAGE_INPUT_FIELDS) {
    const def = fields[name];
    if (!def) continue;
    return Number.isInteger(def.maxItems) && def.maxItems > 0 ? def.maxItems : assumed;
  }
  return 0;
}

/* Where a pinned LAST frame can go. Four spellings across the families
   (minimax/wan, seedance v1 + hailuo, kling 2.x, pixverse transition); the
   studio always sends `last_frame_url` and the server maps it. A model with
   none of them has no such control — showing one promised an anchor that was
   dropped before the request left. */
const LAST_FRAME_FIELDS = ["last_frame_url", "end_image_url", "tail_image_url", "last_frame_image_url"];

export function lastFrameFieldFrom(fields = {}) {
  return LAST_FRAME_FIELDS.find((name) => fields[name]) || null;
}

/* pixverse spells resolution `quality` ("360p"…"1080p"). The image families
   ALSO have a `quality` field, and theirs is a tier ("basic"/"high"/"medium")
   — only an enum made entirely of NNNp values is a resolution. */
const RESOLUTION_LIKE = /^\d+p$/i;

export function resolutionsFromFields(fields = {}) {
  const direct = fields.resolution?.enum || fields.size?.enum;
  if (direct?.length) return direct;
  const quality = fields.quality?.enum;
  return quality?.length && quality.every((v) => RESOLUTION_LIKE.test(String(v))) ? quality : [];
}

/* wan 2.7 text-to-video calls its aspect ratio `ratio`. Ideogram, Seedream 3.0
   and Qwen Image call it `image_size` and spell it in orientation words
   ("landscape_16_9"). Those are offered here as the ratios they are: the
   studio sends `aspect_ratio: "16:9"` and the server's adaptInputsToSchema
   writes `image_size: "landscape_16_9"`. Reading only `aspect_ratio` left all
   twelve of those models showing FALLBACK ratios they then ignored. Qwen's
   stored image_size has lost its enum; it takes the same six words. */
const ORIENTATION_SIZE = /^(?:(landscape|portrait)_(\d+)_(\d+)|square(?:_hd)?)$/;
const QWEN_IMAGE_SIZES = ["square_hd", "landscape_4_3", "landscape_16_9", "portrait_4_3", "portrait_16_9"];

export function ratiosFromImageSizes(sizes = []) {
  const ratios = [];
  for (const size of sizes) {
    const m = ORIENTATION_SIZE.exec(String(size).toLowerCase());
    if (!m) return sizes.every((v) => /^\d+:\d+$/.test(String(v))) ? sizes : []; // already ratios (qwen3, nano-banana)
    const ratio = !m[1] ? "1:1" : m[1] === "landscape" ? `${m[2]}:${m[3]}` : `${m[3]}:${m[2]}`;
    if (!ratios.includes(ratio)) ratios.push(ratio);
  }
  return ratios;
}

export function aspectRatiosFromFields(fields = {}) {
  if (fields.aspect_ratio?.enum?.length) return fields.aspect_ratio.enum;
  if (fields.ratio?.enum?.length) return fields.ratio.enum;
  if (fields.image_size) return ratiosFromImageSizes(fields.image_size.enum?.length ? fields.image_size.enum : QWEN_IMAGE_SIZES);
  return [];
}

/* Can ONE uploaded image satisfy everything this model requires? The Edit and
   Upscale modes collect exactly one. A model that also REQUIRES a mask
   (ideogram inpaint / character-edit), a second image field, or the task id of
   an earlier run on the same family (grok-imagine/upscale and /extend take a
   Grok task, never a file) was offered, quoted, charged — and refused. */
const REQUIRED_MEDIA = /^(image|image_url|image_urls|input_urls|image_input|reference_image_urls|reference_images|first_frame_url|first_frame_image_url|last_frame_image_url)$/;

export function runsFromOneImage(model) {
  const fields = model?.schema?.fields || {};
  const required = Object.keys(fields).filter((name) => fields[name]?.required === true);
  if (required.includes("mask_url") || required.includes("task_id")) return false;
  return required.filter((name) => REQUIRED_MEDIA.test(name)).length <= 1;
}

/* Fifteen video models publish duration as a RANGE (number, minimum/maximum,
   no enum). Only the enum was read, so they rendered no length control at all
   and ran at whatever the provider chose. The minimum is clamped to one
   second: seedance-2.5 declares -1 ("auto") and wan videoedit 0 ("keep the
   source length"), neither of which is a length a slider can offer. */
export function durationRangeFromFields(fields = {}) {
  const field = fields.duration;
  if (!field || field.type !== "number" || field.enum?.length) return null;
  const min = Math.max(1, Math.ceil(Number(field.minimum)));
  const max = Math.floor(Number(field.maximum));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const declared = Number(field.default);
  const preferred = Number.isFinite(declared) && declared >= min && declared <= max ? declared : 5;
  return { min, max, default: Math.min(max, Math.max(min, preferred)) };
}

/* Coarse "video" is the text-to-video group, and that is right for a prompt
   alone. But the models filed there — seedance 2.x and 1.5, veo 3, kling 3.0,
   runway — also TAKE a still, and seedance 2.x takes identity references. The
   Image-to-Video and Cast pickers filter by their own groups, so none of them
   was ever offered there. This adds them by what the schema accepts; it never
   removes a model from a picker it is already in. `model` is a catalog row as
   this hook returns it (capability, maxImages, fieldNames). */
export function alsoOfferedInVideoMode(model, mode) {
  if (model?.capability !== "video") return false;
  if (mode === "i2v") return (model.maxImages || 0) > 0;
  if (mode === "cast") return (model.fieldNames || []).includes("reference_image_urls");
  return false;
}

/* Does the model's schema REQUIRE this field? */
export function requiresField(model, name) {
  return model?.schema?.fields?.[name]?.required === true;
}

/* Which models can do which editing job.
   ────────────────────────────────────────────────────────────────────────
   Restyle, Extend and Retime used to share one unfiltered v2v pool, so
   Restyle offered extenders, an upscaler and the clipping utility, and Extend
   offered restylers — each a run the provider refuses after credits are held.
   · extend  — a v2v model that names itself an extender
   · upscale — the video-upscale capability (it takes no prompt at all)
   · restyle — every other v2v model, minus `ai-clipping`, which is the Clips
               mode's own engine and has no prompt either
   · recast  — its own capability group (identity transfer)
   A model that REQUIRES `task_id` continues a job made on the provider's own
   side (grok-imagine/extend); an uploaded clip can never satisfy it, so it is
   offered nowhere. */
export function videoEditPool(models = [], job) {
  const usable = (models || []).filter((m) => !requiresField(m, "task_id"));
  if (job === "recast") return usable.filter((m) => matchesGroup(m, "recast"));
  if (job === "upscale") return usable.filter((m) => m.capability === "video-upscale");
  const edits = usable.filter(
    (m) => (matchesGroup(m, "v2v") || m.capability === "video-edit") && m.capability !== "video-upscale",
  );
  const extends_ = (m) => /extend/i.test(m.id || "");
  if (job === "extend") return edits.filter(extends_);
  return edits.filter((m) => !extends_(m) && m.id !== "ai-clipping");
}

function optionsFromSchema(model) {
  const fields = model.schema?.fields || {};
  return {
    ...model,
    id: model.modelId || model.id,
    name: model.displayName || model.modelId || model.id,
    displayName: model.displayName || model.modelId || model.id,
    provider: model.provider,
    endpoint: model.endpoint || model.providerModelId || model.modelId,
    credits: model.credits || 0,
    aspectRatios: aspectRatiosFromFields(fields),
    resolutions: resolutionsFromFields(fields),
    durations: fields.duration?.enum || [],
    durationRange: durationRangeFromFields(fields),
    // What the schema declares, so a studio can gate a control on the model
    // actually having the setting instead of showing one it then ignores.
    fieldNames: Object.keys(fields),
    lastFrameField: lastFrameFieldFrom(fields),
    hasDimensions: !!(fields.width || fields.height || fields.size),
    // How many input images this model accepts. Measured against the live
    // catalog: reading only images_list/reference_images returned 0 for all
    // 31 image models, because the families that actually take references
    // name the field image_input (nano-banana), reference_image_urls
    // (seedance), image_urls (kling) or reference_image (wan-r2v). Every
    // piece of UI gated on `maxImages > 0` was therefore dead. maxItems is
    // frequently absent even when the field exists, so a present array field
    // means "at least one" rather than "none".
    maxImages: maxImagesFromFields(fields),
    speedTier: model.displayName?.toLowerCase().includes("fast") || model.displayName?.toLowerCase().includes("turbo") ? "fast" : model.displayName?.toLowerCase().includes("pro") || model.displayName?.toLowerCase().includes("ultra") ? "premium" : "standard",
  };
}

/* The catalog is identical for every consumer, so fetch it once per page and
   share it. Without this, ten mounted tools each issued their own request. */
const EMPTY = [];
const cache = new Map();

export function useModelCatalog({ modelType, capability, fallback = EMPTY } = {}) {
  const [remote, setRemote] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    // No modelType → fetch the FULL catalog (no query param). Studios then
    // filter client-side via capability groups (see lib/capability-groups.js),
    // because DB modelType values are fragmented across the catalog.
    const qs = new URLSearchParams();
    if (modelType) qs.set("type", modelType);
    if (capability) qs.set("capability", capability);
    const query = qs.toString();
    const url = query ? `/api/models/catalog?${query}` : "/api/models/catalog";

    const cached = cache.get(url);
    if (cached?.data) {
      setRemote(cached.data);
      setError(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);

    // apiFetch throws on any non-2xx, so there is no `res.ok` branch to write.
    const request =
      cached?.promise ||
      apiFetch(url)
        .then((r) => r.json())
        .then((d) => {
          const models = (d.models || []).map(optionsFromSchema);
          cache.set(url, { data: models });
          return models;
        })
        .catch((e) => {
          cache.delete(url);
          throw e;
        });

    if (!cached) cache.set(url, { promise: request });

    request
      .then((models) => { if (active) { setRemote(models); setError(null); } })
      .catch((e) => { if (active) setError(e.message || "Catalog unavailable"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [modelType, capability]);

  const models = useMemo(() => (remote.length ? remote : fallback), [remote, fallback]);
  return { models, loading, error, source: remote.length ? "catalog" : "fallback" };
}
