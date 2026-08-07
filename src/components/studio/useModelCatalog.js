"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

/* Image-input fields across the families in the live catalog, widest first.
   Kept in step with entity-core.mjs's IMAGE_REFERENCE_FIELDS, which is what
   the SERVER writes references into — if these two disagree, a studio offers
   a model whose references the server then has nowhere to put. */
const IMAGE_INPUT_FIELDS = [
  ["reference_image_urls", 4],
  ["reference_images", 4],
  ["image_input", 4],
  ["images_list", 4],
  ["image_urls", 4],
  ["reference_image", 1],
  ["image_url", 1],
];

export function maxImagesFromFields(fields) {
  for (const [name, assumed] of IMAGE_INPUT_FIELDS) {
    const def = fields[name];
    if (!def) continue;
    return Number.isInteger(def.maxItems) && def.maxItems > 0 ? def.maxItems : assumed;
  }
  return 0;
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
    aspectRatios: fields.aspect_ratio?.enum || [],
    resolutions: fields.resolution?.enum || fields.size?.enum || [],
    durations: fields.duration?.enum || [],
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
