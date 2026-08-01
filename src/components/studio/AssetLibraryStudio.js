"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";
import {
  Confirm, Modal, Specs, Segmented,
  IcImage, IcVideo, IcMusic, IcSearch, IcDownload, IcCopy, IcCheck,
  IcTrash, IcExternal, IcRefresh, IcLayers, IcAlert, IcClose,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   ASSET LIBRARY — .st-lib collection browser
   ──────────────────────────────────────────────────────────────────────────
   Everything the account has made. The type filter is served by the API
   (`?type=`); search and sort work on what has been loaded, which is stated
   in the interface rather than implied.
   ══════════════════════════════════════════════════════════════════════════ */

const PAGE = 48;

const TYPES = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
];

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "largest", label: "Largest file" },
];

/* ── Formatting ───────────────────────────────────────────────────────── */
const kindOf = (a) => {
  const t = String(a?.type || "").toLowerCase();
  return t === "video" || t === "audio" ? t : "image";
};

function KindIcon({ kind, ...rest }) {
  if (kind === "video") return <IcVideo {...rest} />;
  if (kind === "audio") return <IcMusic {...rest} />;
  return <IcImage {...rest} />;
}

function bytesLabel(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return null;
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function dateLabel(v, long = false) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return long
    ? d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const creditsOf = (a) => {
  const raw = a?.metadata?.creditsUsed ?? a?.metadata?.credits;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const dimsLabel = (a) => (a?.width && a?.height ? `${a.width}×${a.height}` : null);
const secondsLabel = (a) => (a?.duration ? `${Number(a.duration).toFixed(1)}s` : null);

function metaLine(a) {
  const credits = creditsOf(a);
  return [
    dateLabel(a.createdAt),
    bytesLabel(a.bytes) || dimsLabel(a) || secondsLabel(a),
    credits != null ? `${credits}cr` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const nameOf = (a) => a?.name || `Untitled ${kindOf(a)}`;

/* ── Roving arrow-key movement across the card grid ───────────────────── */
function columnsOf(el) {
  if (!el || typeof window === "undefined") return 1;
  const cols = window.getComputedStyle(el).gridTemplateColumns;
  return Math.max(1, String(cols).split(" ").filter(Boolean).length);
}

export default function AssetLibraryStudio() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloads, setReloads] = useState(0);

  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const [open, setOpen] = useState(null);      // asset shown in the detail modal
  const [pending, setPending] = useState(null); // asset awaiting delete confirmation
  const [copied, setCopied] = useState("");

  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  /* ── First page, and every time the served filter changes ───────────── */
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const q = new URLSearchParams({ limit: String(PAGE) });
        if (type !== "all") q.set("type", type);
        const res = await apiFetch(`/api/assets?${q}`);
        const data = await res.json();
        if (dead) return;
        setAssets(Array.isArray(data.assets) ? data.assets : []);
        setHasMore(!!data.hasMore);
        setCursor(data.nextCursor || null);
      } catch (err) {
        if (!dead) setError(err?.message || "The library could not be loaded.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [type, reloads]);

  /* ── Next page ──────────────────────────────────────────────────────── */
  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const q = new URLSearchParams({ limit: String(PAGE), cursor });
      if (type !== "all") q.set("type", type);
      const res = await apiFetch(`/api/assets?${q}`);
      const data = await res.json();
      const page = Array.isArray(data.assets) ? data.assets : [];
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.filter((a) => !seen.has(a.id))];
      });
      setHasMore(!!data.hasMore);
      setCursor(data.nextCursor || null);
    } catch (err) {
      setError(err?.message || "The next page could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, cursor, loadingMore, type]);

  /* Pull the next page in as the end of the list comes into view */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
      { rootMargin: "280px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, loadMore]);

  /* ── Mutations ──────────────────────────────────────────────────────── */
  const toggleFavourite = useCallback(async (asset) => {
    const next = !asset.isFavorite;
    setError("");
    try {
      await apiFetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, isFavorite: next }),
      });
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, isFavorite: next } : a)));
      setOpen((o) => (o && o.id === asset.id ? { ...o, isFavorite: next } : o));
    } catch (err) {
      setError(err?.message || "The favourite could not be saved.");
    }
  }, []);

  const remove = useCallback(async (asset) => {
    setError("");
    try {
      await apiFetch(`/api/assets?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setOpen((o) => (o && o.id === asset.id ? null : o));
    } catch (err) {
      setError(err?.message || "The asset could not be deleted.");
    }
  }, []);

  const copyLink = useCallback(async (asset) => {
    if (!asset?.url) return;
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(asset.id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("The browser blocked the clipboard. Open the asset and copy the address from the address bar.");
    }
  }, []);

  /* ── Search and sort over what is loaded ────────────────────────────── */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = assets.filter((a) => {
      if (favouritesOnly && !a.isFavorite) return false;
      if (!q) return true;
      return [a.name, a.model, a.source, a.type].some((v) => String(v || "").toLowerCase().includes(q));
    });
    list = [...list];
    if (sort === "newest") list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sort === "oldest") list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sort === "name") list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    else if (sort === "largest") list.sort((a, b) => (Number(b.bytes) || 0) - (Number(a.bytes) || 0));
    return list;
  }, [assets, query, sort, favouritesOnly]);

  /* ── Lineage, straight from the records ─────────────────────────────── */
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const childrenOf = useCallback(
    (id) => assets.filter((a) => a.parentAssetId === id),
    [assets],
  );

  const onGridKey = (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const nodes = Array.from(gridRef.current?.querySelectorAll("[data-card]") || []);
    const i = nodes.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = columnsOf(gridRef.current);
    let next = i;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown") next = i + cols;
    else if (e.key === "ArrowUp") next = i - cols;
    else if (e.key === "Home") next = 0;
    else next = nodes.length - 1;
    if (next < 0 || next >= nodes.length) return;
    e.preventDefault();
    nodes[next].focus();
  };

  const filtering = query.trim() !== "" || favouritesOnly || type !== "all";

  /* Keep the last values on screen while an overlay plays its exit */
  const lastOpen = useRef(null);
  const lastPending = useRef(null);
  if (open) lastOpen.current = open;
  if (pending) lastPending.current = pending;
  const detail = open || lastOpen.current;
  const doomed = pending || lastPending.current;

  return (
    <div className="st-lib">
      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="st-lib__bar">
        <Segmented
          label="Asset type"
          value={type}
          onChange={setType}
          options={TYPES}
        />

        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160, maxWidth: 320 }}>
          <IcSearch
            className="hs-icon-sm"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
          />
          <input
            type="search"
            className="hs-input"
            style={{ paddingLeft: 32 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, model or source"
            aria-label="Search loaded assets"
          />
        </div>

        <select
          className="hs-select"
          style={{ width: "auto", minWidth: 150 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort order"
        >
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <button
          type="button"
          className={`hs-chip${favouritesOnly ? " is-active" : ""}`}
          aria-pressed={favouritesOnly}
          onClick={() => setFavouritesOnly((v) => !v)}
        >
          Favourites
        </button>

        <span className="hs-mono hs-mute" style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "0.06em" }}>
          {loading ? "—" : `${shown.length}${hasMore ? "+" : ""} shown`}
        </span>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="st-lib__body">
        {error && (
          <div className="hs-notice hs-notice--fault" style={{ marginBottom: "var(--s-4)" }} role="alert">
            <IcAlert className="hs-icon-sm" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setReloads((n) => n + 1)}>
              <IcRefresh className="hs-icon-sm" /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="st-lib__grid" aria-busy="true" aria-label="Loading assets">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="st-item">
                <div className="hs-skel" style={{ aspectRatio: "1", borderRadius: 0 }} />
                <div className="st-item__body">
                  <div className="hs-skel" style={{ height: 10, width: "72%" }} />
                  <div className="hs-skel" style={{ height: 8, width: "48%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcLayers /></span>
            {filtering ? (
              <>
                <h3>Nothing matches these filters</h3>
                <p>
                  {hasMore
                    ? "Search runs over the assets loaded so far. Clear the filters, or load more pages and search again."
                    : "Clear the search, the type filter, or the favourites filter to see the rest of the library."}
                </p>
                <div className="hs-row" style={{ marginTop: "var(--s-2)" }}>
                  <button
                    type="button"
                    className="hs-btn hs-btn--outline"
                    onClick={() => { setQuery(""); setFavouritesOnly(false); setType("all"); }}
                  >
                    <IcClose className="hs-icon-sm" /> Clear filters
                  </button>
                  {hasMore && (
                    <button type="button" className="hs-btn hs-btn--outline" onClick={loadMore} disabled={loadingMore}>
                      Load more
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3>The library is empty</h3>
                <p>
                  Every image, video and audio file you generate lands here automatically, with its model and
                  settings attached. Make something first.
                </p>
                <div className="hs-row" style={{ marginTop: "var(--s-2)", flexWrap: "wrap", justifyContent: "center" }}>
                  <Link href="/studio/image" className="hs-btn hs-btn--primary"><IcImage className="hs-icon-sm" /> Compose an image</Link>
                  <Link href="/studio/video" className="hs-btn hs-btn--outline"><IcVideo className="hs-icon-sm" /> Shoot a video</Link>
                  <Link href="/studio/audio" className="hs-btn hs-btn--outline"><IcMusic className="hs-icon-sm" /> Record audio</Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div
              className="st-lib__grid"
              ref={gridRef}
              role="list"
              aria-label="Assets"
              onKeyDown={onGridKey}
            >
              {shown.map((a) => {
                const kind = kindOf(a);
                const label = nameOf(a);
                return (
                  <div key={a.id} className="st-item" role="listitem">
                    <button
                      type="button"
                      data-card
                      onClick={() => setOpen(a)}
                      aria-label={`${label} — ${kind}${a.createdAt ? `, made ${dateLabel(a.createdAt)}` : ""}. Open details.`}
                      style={{
                        display: "block", width: "100%", padding: 0, border: 0,
                        background: "transparent", color: "inherit", font: "inherit",
                        textAlign: "left", cursor: "pointer",
                      }}
                    >
                      <div className="st-item__frame">
                        {a.url && kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                          <img src={a.thumbnailUrl || a.url} alt="" loading="lazy" />
                        ) : a.url && kind === "video" ? (
                          <video src={a.url} muted playsInline preload="metadata" />
                        ) : (
                          <span style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--tx-ghost)" }}>
                            <KindIcon kind={kind} style={{ width: 30, height: 30 }} />
                          </span>
                        )}
                        <span className="st-item__kind">{kind}</span>
                        {a.isFavorite && (
                          <span
                            className="hs-badge hs-badge--accent"
                            style={{ position: "absolute", top: "var(--s-2)", right: "var(--s-2)" }}
                          >
                            Kept
                          </span>
                        )}
                      </div>
                      <div className="st-item__body">
                        <span className="st-item__name">{label}</span>
                        <span className="st-item__meta">{metaLine(a) || "—"}</span>
                      </div>
                    </button>

                    <div className="st-item__acts">
                      {a.url && (
                        <a
                          className="hs-btn hs-btn--sm hs-btn--icon"
                          href={a.url}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Download ${label}`}
                          title="Download"
                        >
                          <IcDownload className="hs-icon-sm" />
                        </a>
                      )}
                      {a.url && (
                        <button
                          type="button"
                          className="hs-btn hs-btn--sm hs-btn--icon"
                          onClick={() => copyLink(a)}
                          aria-label={`Copy link to ${label}`}
                          title={copied === a.id ? "Copied" : "Copy link"}
                        >
                          {copied === a.id ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                        onClick={() => setPending(a)}
                        aria-label={`Delete ${label}`}
                        title="Delete"
                      >
                        <IcTrash className="hs-icon-sm" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div ref={sentinelRef} style={{ display: "grid", placeItems: "center", padding: "var(--s-6) 0 var(--s-3)" }}>
                <button type="button" className="hs-btn hs-btn--outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <><span className="hs-spin" /> Loading</> : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail ───────────────────────────────────────────────────── */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={detail ? nameOf(detail) : ""}>
        {detail && (
          <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
            {detail.url && (
              <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--ink-000)", border: "1px solid var(--line)" }}>
                {kindOf(detail) === "video" ? (
                  <video src={detail.url} controls playsInline style={{ width: "100%", maxHeight: 380, display: "block" }} />
                ) : kindOf(detail) === "audio" ? (
                  <audio src={detail.url} controls style={{ width: "100%", padding: "var(--s-4)" }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                  <img src={detail.url} alt={nameOf(detail)} style={{ width: "100%", maxHeight: 380, objectFit: "contain", display: "block" }} />
                )}
              </div>
            )}

            <Specs
              rows={[
                { k: "Kind", v: kindOf(detail) },
                { k: "Source", v: detail.source },
                { k: "Model", v: detail.model },
                { k: "Size", v: bytesLabel(detail.bytes) },
                { k: "Pixels", v: dimsLabel(detail) },
                { k: "Length", v: secondsLabel(detail) },
                { k: "Credits", v: creditsOf(detail) != null ? `${creditsOf(detail)}cr` : null },
                { k: "Made", v: dateLabel(detail.createdAt, true) },
              ]}
            />

            {(detail.parentAssetId || detail.generationId || childrenOf(detail.id).length > 0) && (
              <section className="hs-stack" style={{ gap: "var(--s-2)" }}>
                <span className="hs-label" style={{ margin: 0 }}>Lineage</span>
                {detail.parentAssetId && (
                  <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)" }}>
                    Derived from{" "}
                    {byId.has(detail.parentAssetId) ? (
                      <button
                        type="button"
                        className="hs-btn hs-btn--ghost hs-btn--sm"
                        onClick={() => setOpen(byId.get(detail.parentAssetId))}
                      >
                        {nameOf(byId.get(detail.parentAssetId))}
                      </button>
                    ) : (
                      <>
                        <span className="hs-mono">{detail.parentAssetId}</span>
                        {" — that asset is not on the pages loaded so far."}
                      </>
                    )}
                  </p>
                )}
                {detail.generationId && (
                  <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)" }}>
                    Generation <span className="hs-mono">{detail.generationId}</span>
                  </p>
                )}
                {childrenOf(detail.id).length > 0 && (
                  <div className="hs-chips">
                    <span className="hs-hint" style={{ alignSelf: "center" }}>Made from this:</span>
                    {childrenOf(detail.id).map((c) => (
                      <button key={c.id} type="button" className="hs-chip" onClick={() => setOpen(c)}>
                        {nameOf(c)}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="hs-row" style={{ flexWrap: "wrap", gap: "var(--s-2)" }}>
              {detail.url && (
                <a className="hs-btn hs-btn--sm" href={detail.url} download target="_blank" rel="noopener noreferrer">
                  <IcDownload className="hs-icon-sm" /> Download
                </a>
              )}
              {detail.url && (
                <button type="button" className="hs-btn hs-btn--sm" onClick={() => copyLink(detail)}>
                  {copied === detail.id ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                  {copied === detail.id ? "Copied" : "Copy link"}
                </button>
              )}
              {detail.url && (
                <a className="hs-btn hs-btn--sm" href={detail.url} target="_blank" rel="noopener noreferrer">
                  <IcExternal className="hs-icon-sm" /> Open
                </a>
              )}
              <button type="button" className="hs-btn hs-btn--sm" onClick={() => toggleFavourite(detail)}>
                {detail.isFavorite ? "Remove from favourites" : "Add to favourites"}
              </button>
              <button
                type="button"
                className="hs-btn hs-btn--sm hs-btn--danger"
                onClick={() => { setOpen(null); setPending(detail); }}
                style={{ marginLeft: "auto" }}
              >
                <IcTrash className="hs-icon-sm" /> Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm ──────────────────────────────────────────────────── */}
      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && remove(pending)}
        title="Delete this asset?"
        body={
          doomed
            ? `“${nameOf(doomed)}” leaves the library and stops appearing in pickers. Anything already generated from it keeps its own copy.`
            : ""
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
