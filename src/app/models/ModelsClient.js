"use client";

/* ══════════════════════════════════════════════════════════════════════════
   MODEL CATALOG — client
   ──────────────────────────────────────────────────────────────────────────
   Source of truth: GET /api/models/catalog → { models, total }.
   Every card is built from the row the API actually returns. Capability
   badges are read out of the model's input schema (the same normalisation
   useModelCatalog performs for the studio), never from a hand-written table,
   so a catalog sync changes this page without anyone editing it.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";
import { CAPABILITY_GROUPS } from "@/lib/capability-groups";
import { IcSearch, IcAlert, IcRefresh } from "@/components/studio/kit/Icons";

/* Modality → the studio that runs it. `caps` mirrors the shared capability
   groups; `types` catches rows whose capability string is missing but whose
   modelType is set. Order matters: the first match wins for the tool link. */
const MODALITIES = [
  { id: "tti", label: "Text → image", caps: CAPABILITY_GROUPS.tti, types: ["image"], tool: "image" },
  { id: "iti", label: "Image → image", caps: CAPABILITY_GROUPS.iti, types: ["i2i"], tool: "image" },
  { id: "ttv", label: "Text → video", caps: CAPABILITY_GROUPS.ttv, types: ["video"], tool: "video" },
  { id: "i2v", label: "Image → video", caps: [...CAPABILITY_GROUPS.i2v, "reference-to-video"], types: ["i2v"], tool: "video" },
  { id: "v2v", label: "Video → video", caps: CAPABILITY_GROUPS.v2v, types: ["v2v"], tool: "video?mode=edit" },
  { id: "lipsync", label: "Lip sync", caps: CAPABILITY_GROUPS.lipsync, types: ["lipsync"], tool: "perform?mode=lipsync" },
  { id: "audio", label: "Audio", caps: CAPABILITY_GROUPS.audio, types: ["audio", "tts"], tool: "audio" },
];

function matches(model, modality) {
  return modality.caps.includes(model.capability) || modality.types.includes(model.modelType);
}

/* The API returns the raw ModelPricing row. Pull the option sets out of the
   input schema the same way the studio does. */
function shape(row) {
  const f = row.schema?.fields || {};
  const ui = row.schema?.ui || {};
  const c = row.constraints || {};
  const id = row.id || row.modelId;

  const model = {
    id,
    name: row.displayName || id,
    // The public catalog no longer exposes which upstream provider serves a
    // model (URGENT fix — model-catalog.js's serializeCatalogModel strips
    // providerName/provider for non-admin callers), so row.provider is
    // always absent here now; nothing in this component should render it.
    description: row.description || "",
    capability: row.capability || row.modelType || "",
    modelType: row.modelType || "",
    credits: Number.isFinite(row.credits) ? row.credits : null,
    aspectRatios: c.aspectRatios || f.aspect_ratio?.enum || [],
    resolutions: c.resolutions || f.resolution?.enum || f.size?.enum || [],
    durations: c.durations || f.duration?.enum || [],
    maxImages:
      c.maxImages ||
      f.images_list?.maxItems ||
      f.reference_images?.maxItems ||
      ui.maxReferenceImages ||
      0,
    maxOutputs: ui.maxOutputs || f.n?.maximum || 0,
  };

  const modality = MODALITIES.find((m) => matches(model, m));
  model.modality = modality || null;
  model.tool = modality?.tool || "image";
  return model;
}

function CardSkeleton() {
  return (
    <div className="pg-cat__card" aria-hidden="true">
      <div className="pg-cat__top">
        <div style={{ flex: 1 }}>
          <div className="hs-skel" style={{ height: 13, width: "62%" }} />
          <div className="hs-skel" style={{ height: 9, width: "40%", marginTop: 8 }} />
        </div>
        <div className="hs-skel" style={{ height: 13, width: 44 }} />
      </div>
      <div className="hs-skel" style={{ height: 9, width: "88%" }} />
      <div className="pg-cat__specs">
        <div className="hs-skel" style={{ height: 18, width: 62 }} />
        <div className="hs-skel" style={{ height: 18, width: 44 }} />
        <div className="hs-skel" style={{ height: 18, width: 52 }} />
      </div>
    </div>
  );
}

export default function ModelsClient() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fault, setFault] = useState(null);
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState("all");

  const load = useCallback(async (signal) => {
    setLoading(true);
    setFault(null);
    try {
      const res = await apiFetch("/api/models/catalog");
      const data = await res.json();
      if (signal?.aborted) return;
      setModels((data.models || []).map(shape));
    } catch (err) {
      if (signal?.aborted) return;
      setModels([]);
      setFault(err?.message || "The catalog could not be reached.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = { aborted: false };
    load(ctrl);
    return () => { ctrl.aborted = true; };
  }, [load]);

  const counts = useMemo(() => {
    const out = { all: models.length };
    for (const m of MODALITIES) out[m.id] = models.filter((x) => matches(x, m)).length;
    return out;
  }, [models]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (modality !== "all" && m.modality?.id !== modality) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.capability.toLowerCase().includes(q)
      );
    });
  }, [models, query, modality]);

  const filtered = modality !== "all" || query.trim().length > 0;

  /* ── Error ─────────────────────────────────────────────────────────── */
  if (fault) {
    return (
      <div className="hs-stack">
        <div className="hs-notice hs-notice--fault" role="alert">
          <IcAlert className="hs-icon" />
          <span>
            The catalog did not load. <strong>{fault}</strong>
          </span>
        </div>
        <div>
          <button type="button" className="hs-btn hs-btn--outline" onClick={() => load()}>
            <IcRefresh className="hs-icon-sm" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="pg-filters">
        <div className="pg-search">
          <IcSearch />
          <label className="hs-sr" htmlFor="cat-q">Search the catalog by model or capability</label>
          <input
            id="cat-q"
            className="hs-input"
            type="search"
            value={query}
            placeholder="Search model or capability"
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
        </div>
        <p className="pg-count" aria-live="polite">
          {loading ? "loading…" : `${shown.length} of ${models.length} models`}
        </p>
      </div>

      <div className="hs-chips" role="group" aria-label="Filter by modality" style={{ marginBottom: "var(--s-6)" }}>
        <button
          type="button"
          className="hs-chip"
          aria-pressed={modality === "all"}
          onClick={() => setModality("all")}
        >
          All<span className="hs-mute">{loading ? "—" : counts.all}</span>
        </button>
        {MODALITIES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="hs-chip"
            aria-pressed={modality === m.id}
            disabled={!loading && counts[m.id] === 0}
            onClick={() => setModality(m.id)}
          >
            {m.label}
            <span className="hs-mute">{loading ? "—" : counts[m.id]}</span>
          </button>
        ))}
      </div>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {loading && (
        <>
          <p className="hs-sr" role="status">Loading the model catalog</p>
          <div className="pg-cat" aria-busy="true">
            {Array.from({ length: 9 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        </>
      )}

      {/* ── Empty ─────────────────────────────────────────────────────── */}
      {!loading && shown.length === 0 && (
        <div className="hs-empty">
          <span className="hs-empty__mark"><IcSearch /></span>
          <h3>{filtered ? "Nothing matches that" : "The catalog is empty"}</h3>
          <p>
            {filtered
              ? "No model in the catalog matches this search and modality. Clear the filters to see everything."
              : "No models are published right now. This is a sync problem, not something you did — try again in a few minutes."}
          </p>
          {filtered ? (
            <button
              type="button"
              className="hs-btn hs-btn--outline"
              onClick={() => { setQuery(""); setModality("all"); }}
            >
              Clear filters
            </button>
          ) : (
            <button type="button" className="hs-btn hs-btn--outline" onClick={() => load()}>
              <IcRefresh className="hs-icon-sm" />
              Reload the catalog
            </button>
          )}
        </div>
      )}

      {/* ── Catalog ───────────────────────────────────────────────────── */}
      {!loading && shown.length > 0 && (
        <div className="pg-cat">
          {shown.map((m) => (
            <Link
              key={m.id}
              href={`/studio/${m.tool}${m.tool.includes("?") ? "&" : "?"}model=${encodeURIComponent(m.id)}`}
              className="pg-cat__card"
            >
              <div className="pg-cat__top">
                <div>
                  <h3 className="pg-cat__name">{m.name}</h3>
                </div>
                <span className="pg-cat__cr">
                  {m.credits === null ? "—" : `${m.credits} cr`}
                </span>
              </div>

              {m.description && <p className="hs-hint">{m.description}</p>}

              <div className="pg-cat__specs">
                {m.modality && <span className="hs-badge hs-badge--accent">{m.modality.label}</span>}

                {m.aspectRatios.slice(0, 4).map((a) => (
                  <span key={`a-${a}`} className="hs-badge">{a}</span>
                ))}
                {m.aspectRatios.length > 4 && (
                  <span className="hs-badge">+{m.aspectRatios.length - 4} ratios</span>
                )}

                {m.resolutions.slice(0, 3).map((r) => (
                  <span key={`r-${r}`} className="hs-badge">{String(r).replace("*", "×")}</span>
                ))}
                {m.resolutions.length > 3 && (
                  <span className="hs-badge">+{m.resolutions.length - 3} sizes</span>
                )}

                {m.durations.slice(0, 4).map((d) => (
                  <span key={`d-${d}`} className="hs-badge">{d}s</span>
                ))}

                {m.maxImages > 0 && <span className="hs-badge">{m.maxImages} refs</span>}
                {m.maxOutputs > 1 && <span className="hs-badge">{m.maxOutputs}/run</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
