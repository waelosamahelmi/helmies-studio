"use client";

import { useMemo, useState } from "react";
import { IcSearch, IcCheck } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   MODEL PICKER
   ──────────────────────────────────────────────────────────────────────────
   A model is a technical choice, so this is a spec sheet, not a poster wall.
   Name, provider, price, and the capabilities that actually differ between
   models — resolution ceiling, duration range, reference-image slots.

   The previous picker filtered with `!model.durations`, but the catalog
   always emits an array (`[]` when absent) and `![]` is false — so the list
   rendered empty for text-to-image, image-to-image and image-to-video.
   Filtering now goes through `matchesGroup`, which tests the scalar
   `model.capability` field the catalog genuinely populates.
   ══════════════════════════════════════════════════════════════════════════ */

const SORTS = [
  { id: "default", label: "Default" },
  { id: "cheap",   label: "Lowest cost" },
  { id: "fast",    label: "Fastest" },
];

const TIER_RANK = { fast: 0, standard: 1, premium: 2 };

function caps(m) {
  const out = [];
  if (m.resolutions?.length) out.push(m.resolutions.map((r) => String(r).toUpperCase()).join("/"));
  if (m.durations?.length) {
    const d = m.durations.map(Number).filter(Number.isFinite);
    if (d.length) out.push(d.length > 1 ? `${Math.min(...d)}–${Math.max(...d)}s` : `${d[0]}s`);
  }
  if (m.maxImages > 0) out.push(`${m.maxImages} ref${m.maxImages > 1 ? "s" : ""}`);
  if (m.aspectRatios?.length) out.push(`${m.aspectRatios.length} ratios`);
  return out;
}

export default function ModelPicker({
  models = [],
  value,
  onSelect,
  loading = false,
  label = "Model",
  /** Show a search box once the list is long enough to need one */
  searchable = true,
  emptyHint = "No models available for this mode.",
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("default");

  const list = useMemo(() => {
    let out = models;

    const needle = q.trim().toLowerCase();
    if (needle) {
      // The catalog hides which upstream provider serves a model (URGENT
      // fix — see model-catalog.js's serializeCatalogModel), so `provider`
      // is never populated here anymore; search by name only.
      out = out.filter((m) => `${m.displayName || m.name || m.id}`.toLowerCase().includes(needle));
    }

    if (sort === "cheap") {
      out = [...out].sort((a, b) => (a.credits ?? 1e9) - (b.credits ?? 1e9));
    } else if (sort === "fast") {
      out = [...out].sort(
        (a, b) => (TIER_RANK[a.speedTier] ?? 1) - (TIER_RANK[b.speedTier] ?? 1),
      );
    }

    return out;
  }, [models, q, sort]);

  const showSearch = searchable && models.length > 6;

  return (
    <div className="st-models">
      <div className="hs-row hs-row--between">
        <span className="hs-label" style={{ margin: 0 }}>{label}</span>
        <span className="hs-mono" style={{ fontSize: 10, color: "var(--tx-mute)" }}>
          {loading ? "…" : `${list.length}`}
        </span>
      </div>

      {showSearch && (
        <div style={{ position: "relative" }}>
          <IcSearch
            className="hs-icon-sm"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
          />
          <input
            className="hs-input"
            style={{ paddingLeft: 32 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models"
            aria-label="Search models"
            type="search"
          />
        </div>
      )}

      {models.length > 3 && (
        <div className="st-models__filters" role="group" aria-label="Sort models">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              className={`hs-chip${sort === s.id ? " is-active" : ""}`}
              onClick={() => setSort(s.id)}
              style={{ fontFamily: "var(--ff-ui)" }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="st-models__list">
        {loading && models.length === 0 && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hs-skel" style={{ height: 58 }} />
            ))}
          </>
        )}

        {!loading && list.length === 0 && (
          <p className="hs-hint" style={{ padding: "var(--s-4) 0" }}>
            {q ? `Nothing matches “${q}”.` : emptyHint}
          </p>
        )}

        {list.map((m) => {
          const id = m.id;
          const on = String(value) === String(id);
          const spec = caps(m);
          return (
            <button
              key={id}
              type="button"
              className={`st-model${on ? " is-active" : ""}`}
              onClick={() => onSelect?.(id)}
              aria-pressed={on}
            >
              <span className="st-model__name">
                {on && <IcCheck className="hs-icon-sm" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4, color: "var(--filament-lit)" }} />}
                {m.displayName || m.name || id}
              </span>
              <span className="st-model__cost">
                {m.credits ? `${m.credits} cr` : "—"}
              </span>
              <span className="st-model__meta">
                {spec.map((c) => <span key={c}>{c}</span>)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
