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

export function useModelCatalog({ modelType, fallback = [] }) {
  const [remote, setRemote] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/api/models/catalog?type=${encodeURIComponent(modelType)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return response.json();
      })
      .then((data) => { if (active) setRemote((data.models || []).map(optionsFromSchema)); })
      .catch((catalogError) => { if (active) setError(catalogError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [modelType]);

  const models = useMemo(() => remote.length ? remote : fallback, [remote, fallback]);
  return { models, loading, error, source: remote.length ? "catalog" : "fallback" };
}
