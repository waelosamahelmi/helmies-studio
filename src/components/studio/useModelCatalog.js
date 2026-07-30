"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";

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
    maxImages: fields.images_list?.maxItems || fields.reference_images?.maxItems || 0,
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
