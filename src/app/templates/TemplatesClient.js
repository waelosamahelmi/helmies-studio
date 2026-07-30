"use client";

/* ══════════════════════════════════════════════════════════════════════════
   TEMPLATES — the public marketplace list
   ──────────────────────────────────────────────────────────────────────────
   GET /api/templates?limit&offset → { templates, total }. The endpoint only
   ever returns published rows, so nothing here has to guess at visibility.

   Two pricing models exist in the schema and both are stated plainly on the
   card, because getting this wrong costs the user money:
     · subscription — included with an ACTIVE PAID plan (the purchase route
       rejects "free" and "payg", so "free plan" is not enough).
     · onetime      — a separate Stripe payment, price in oneTimePrice cents.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";
import { getTool } from "@/components/studio/kit/tools";
import { IcSearch, IcAlert, IcRefresh, IcLayers } from "@/components/studio/kit/Icons";

const PAGE = 48;

const CATEGORY_LABEL = {
  creative: "Creative",
  social: "Social",
  cinematic: "Cinematic",
  audio: "Audio",
  marketing: "Marketing",
};

export function priceLabel(t) {
  if (t.pricingModel === "onetime") {
    return Number.isFinite(t.oneTimePrice) ? `€${(t.oneTimePrice / 100).toFixed(2)}` : "Price pending";
  }
  return "Plan-included";
}

export function TemplateCard({ t }) {
  const tool = getTool(t.toolType);
  const ToolIcon = tool.icon;
  const oneTime = t.pricingModel === "onetime";

  return (
    <Link href={`/templates/${t.slug}`} className="pg-tpl__card">
      <div className="pg-tpl__frame">
        {t.thumbnailUrl ? (
          <img src={t.thumbnailUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--tx-ghost)" }}>
            <ToolIcon style={{ width: 28, height: 28 }} />
          </div>
        )}
      </div>

      <div className="pg-tpl__body">
        <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{t.name}</h3>
        {t.description && <p className="hs-hint">{t.description}</p>}
        <div className="hs-chips" style={{ marginTop: "auto", paddingTop: "var(--s-2)" }}>
          <span className="hs-badge">{CATEGORY_LABEL[t.category] || t.category}</span>
          <span className="hs-badge">{tool.label}</span>
          {t.usageLimit === "once" && <span className="hs-badge hs-badge--caution">Single use</span>}
          {t.isFeatured && <span className="hs-badge hs-badge--accent">Featured</span>}
        </div>
      </div>

      <div className="pg-tpl__foot">
        <span className="hs-mono" style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: oneTime ? "var(--tx)" : "var(--signal)" }}>
          {priceLabel(t)}
        </span>
        <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
          {oneTime ? "one payment" : "paid plan"}
        </span>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="pg-tpl__card" aria-hidden="true">
      <div className="pg-tpl__frame"><div className="hs-skel" style={{ width: "100%", height: "100%", borderRadius: 0 }} /></div>
      <div className="pg-tpl__body">
        <div className="hs-skel" style={{ height: 13, width: "70%" }} />
        <div className="hs-skel" style={{ height: 9, width: "100%" }} />
        <div className="hs-skel" style={{ height: 9, width: "80%" }} />
      </div>
      <div className="pg-tpl__foot"><div className="hs-skel" style={{ height: 12, width: 72 }} /></div>
    </div>
  );
}

export default function TemplatesClient() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [fault, setFault] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [toolType, setToolType] = useState("all");

  const load = useCallback(async (offset) => {
    const res = await apiFetch(`/api/templates?limit=${PAGE}&offset=${offset}`);
    const data = await res.json();
    setTotal(data.total || 0);
    setItems((prev) => (offset === 0 ? data.templates || [] : [...prev, ...(data.templates || [])]));
  }, []);

  const first = useCallback(() => {
    setLoading(true);
    setFault(null);
    load(0)
      .catch((err) => setFault(err?.message || "The template list could not be loaded."))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => { first(); }, [first]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((t) => t.category).filter(Boolean))).sort(),
    [items],
  );
  const toolTypes = useMemo(
    () => Array.from(new Set(items.map((t) => t.toolType).filter(Boolean))).sort(),
    [items],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (toolType !== "all" && t.toolType !== toolType) return false;
      if (!q) return true;
      return (
        t.name?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q)
      );
    });
  }, [items, query, category, toolType]);

  const filtered = category !== "all" || toolType !== "all" || query.trim().length > 0;
  const hasMore = items.length < total;

  if (fault) {
    return (
      <div className="hs-stack">
        <div className="hs-notice hs-notice--fault" role="alert">
          <IcAlert className="hs-icon" />
          <span>{fault}</span>
        </div>
        <div>
          <button type="button" className="hs-btn hs-btn--outline" onClick={first}>
            <IcRefresh className="hs-icon-sm" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="pg-filters">
        <div className="pg-search">
          <IcSearch />
          <label className="hs-sr" htmlFor="tpl-q">Search templates by name or description</label>
          <input
            id="tpl-q"
            className="hs-input"
            type="search"
            value={query}
            placeholder="Search templates"
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
        </div>
        <p className="pg-count" aria-live="polite">
          {loading ? "loading…" : `${shown.length} of ${total} templates`}
        </p>
      </div>

      {!loading && categories.length > 1 && (
        <div className="hs-chips" role="group" aria-label="Filter by category" style={{ marginBottom: "var(--s-3)" }}>
          <button type="button" className="hs-chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
            All categories
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className="hs-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c] || c}
            </button>
          ))}
        </div>
      )}

      {!loading && toolTypes.length > 1 && (
        <div className="hs-chips" role="group" aria-label="Filter by studio" style={{ marginBottom: "var(--s-6)" }}>
          <button type="button" className="hs-chip" aria-pressed={toolType === "all"} onClick={() => setToolType("all")}>
            All studios
          </button>
          {toolTypes.map((t) => (
            <button key={t} type="button" className="hs-chip" aria-pressed={toolType === t} onClick={() => setToolType(t)}>
              {getTool(t).label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="pg-tpl" aria-busy="true">
          <p className="hs-sr" role="status">Loading templates</p>
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}

      {!loading && shown.length === 0 && (
        <div className="hs-empty">
          <span className="hs-empty__mark"><IcLayers /></span>
          <h3>{filtered ? "Nothing matches that" : "No templates published yet"}</h3>
          <p>
            {filtered
              ? "No published template matches this search. Clear the filters to see the whole list."
              : "The marketplace is empty right now. Start from a blank brief in the studio instead — a template is only a pre-filled one."}
          </p>
          {filtered ? (
            <button
              type="button"
              className="hs-btn hs-btn--outline"
              onClick={() => { setQuery(""); setCategory("all"); setToolType("all"); }}
            >
              Clear filters
            </button>
          ) : (
            <Link href="/studio" className="hs-btn hs-btn--primary">Open the studio</Link>
          )}
        </div>
      )}

      {!loading && shown.length > 0 && (
        <>
          <div className="pg-tpl">
            {shown.map((t) => <TemplateCard key={t.id || t.slug} t={t} />)}
          </div>

          {hasMore && (
            <div className="pg-more">
              <button
                type="button"
                className="hs-btn hs-btn--outline"
                disabled={more}
                onClick={() => {
                  setMore(true);
                  load(items.length)
                    .catch((err) => setFault(err?.message || "Could not load the next page."))
                    .finally(() => setMore(false));
                }}
              >
                {more ? <span className="hs-spin" /> : null}
                {more ? "Loading" : `Load ${Math.min(PAGE, total - items.length)} more`}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
