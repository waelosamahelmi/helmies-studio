"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const TYPE_FILTERS = [
  { id: "all", label: "All", d: "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" },
  { id: "image", label: "Images", d: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  { id: "video", label: "Videos", d: "M2 5h14v14H2z M16 10l5-3v10l-5-3" },
  { id: "audio", label: "Audio", d: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
];

/* ── Inline SVG Icon ── */
function SvgIcon({ d, size = 18 }) {
  return (
    <svg className="v6-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const iconPaths = {
  image: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  video: "M2 5h14v14H2z M16 10l5-3v10l-5-3",
  audio: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  close: "M6 6l12 12M18 6L6 18",
  star: "M12 3l2.7 6.3 6.8.7-5 4.8 1.4 6.7L12 18l-6 3.5 1.4-6.7-5-4.8 6.8-.7z",
  more: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  upload: "M12 3v12M7 10l5-5 5 5M5 21h14",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
};

export default function AssetLibraryStudio() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const loadAssets = useCallback(
    async (cursor = null) => {
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (typeFilter !== "all") params.set("type", typeFilter);
        if (cursor) params.set("cursor", cursor);

        const res = await apiFetch(`/api/assets?${params}`);
        const data = await res.json();

        if (cursor) {
          setAssets((prev) => [...prev, ...data.assets]);
        } else {
          setAssets(data.assets);
        }
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      } catch {
        toast.error("Failed to load assets");
      } finally {
        setLoading(false);
      }
    },
    [typeFilter]
  );

  useEffect(() => {
    setLoading(true);
    loadAssets();
  }, [loadAssets]);

  const toggleFavorite = async (asset) => {
    try {
      const res = await apiFetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id, isFavorite: !asset.isFavorite }),
      });
      if (res.ok) {
        setAssets((prev) =>
          prev.map((a) => (a.id === asset.id ? { ...a, isFavorite: !a.isFavorite } : a))
        );
        if (selected?.id === asset.id) setSelected({ ...selected, isFavorite: !asset.isFavorite });
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  const deleteAsset = async (id) => {
    if (!confirm("Delete this asset?")) return;
    try {
      await apiFetch(`/api/assets?id=${id}`, { method: "DELETE" });
      setAssets((prev) => prev.filter((a) => a.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success("Asset deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const getTypeIcon = (type) => iconPaths[type] || iconPaths.image;

  // Apply client-side filters
  const filtered = assets.filter((a) => {
    if (favoriteFilter && !a.isFavorite) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (a.name || "").toLowerCase();
      const model = (a.model || "").toLowerCase();
      if (!name.includes(q) && !model.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="v6-page-content">
      {/* Page Head */}
      <div className="v6-page-head">
        <div>
          <div className="v6-eyebrow">Media Library</div>
          <h1>Asset Studio</h1>
          <p>Browse, organize, and reuse your generated media assets.</p>
        </div>
        <button
          className="v6-btn v6-primary"
          onClick={() => toast.success("Import dialog coming soon")}
        >
          <SvgIcon d={iconPaths.upload} size={14} />
          Import Assets
        </button>
      </div>

      {/* Filter Chips + Search */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="v6-chip-row">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`v6-chip ${typeFilter === f.id ? "v6-active" : ""}`}
            >
              <SvgIcon d={f.d} size={12} /> {f.label}
            </button>
          ))}
          <div className="v6-section-rule" style={{ width: 1, height: 20, alignSelf: "center", margin: "0 4px" }} />
          <button
            onClick={() => setFavoriteFilter(!favoriteFilter)}
            className={`v6-chip ${favoriteFilter ? "v6-active" : ""}`}
          >
            <SvgIcon d={iconPaths.star} size={12} /> Favorites
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--v6-line)", borderRadius: 99, padding: "7px 12px", background: "var(--v6-surface2)", maxWidth: 260, flex: 1 }}>
          <SvgIcon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3" size={14} />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 0, background: "transparent", color: "var(--v6-text)", fontSize: 11, width: "100%", outline: "none" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", color: "var(--v6-muted)" }}>
              <SvgIcon d={iconPaths.close} size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="v6-empty-state" style={{ padding: "40px 0" }}>
          <div className="v6-empty-orbit"><SvgIcon d={iconPaths.image} size={26} /></div>
          <p className="v6-muted">Loading assets...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="v6-empty-state" style={{ padding: "40px 0" }}>
          <div className="v6-empty-orbit"><SvgIcon d={iconPaths.image} size={26} /></div>
          <h2>No assets found</h2>
          <p>Generated images, videos, and audio will appear here. Start creating in the Studio.</p>
          {search && <p className="v6-muted v6-tiny">Try adjusting your search or filters.</p>}
        </div>
      ) : (
        <div className="v6-media-grid">
          {filtered.map((asset, i) => (
            <motion.div
              key={asset.id}
              className={`v6-media-card ${selected?.id === asset.id ? "v6-active" : ""}`}
              onClick={() => setSelected(asset)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.35, ease: EASE }}
              style={selected?.id === asset.id ? { borderColor: "var(--v6-accent)" } : {}}
            >
              {asset.url && (asset.type === "image" || !asset.type) ? (
                <img src={asset.thumbnailUrl || asset.url} alt={asset.name || ""} loading="lazy" />
              ) : asset.url && asset.type === "video" ? (
                <video src={asset.url} muted preload="metadata" />
              ) : asset.url && asset.type === "audio" ? (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    background: "linear-gradient(135deg, #00E68A22, #00E68A08)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <SvgIcon d={iconPaths.audio} size={32} />
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    background: "linear-gradient(135deg, var(--v6-surface2), transparent)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <SvgIcon d={getTypeIcon(asset.type)} size={32} />
                </div>
              )}
              <div className="v6-media-card-body">
                <h3>{asset.name || `Untitled ${asset.type || "asset"}`}</h3>
                <p>
                  {asset.type && <span style={{ textTransform: "capitalize" }}>{asset.type}</span>}
                  {asset.model && <span> · {asset.model}</span>}
                  {asset.width && asset.height && <span> · {asset.width}×{asset.height}</span>}
                </p>
              </div>
              <div className="v6-card-actions">
                {asset.url && (
                  <a
                    href={asset.url}
                    download
                    className="v6-btn v6-icon-only v6-sm"
                    title="Download"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SvgIcon d={iconPaths.download} size={13} />
                  </a>
                )}
                <button
                  className="v6-btn v6-icon-only v6-sm"
                  title="More actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(asset);
                  }}
                >
                  <SvgIcon d={iconPaths.more} size={13} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={() => loadAssets(nextCursor)} className="v6-btn">
            Load More
          </button>
        </div>
      )}

      {/* Detail Slide-over */}
      <AnimatePresence>
        {selected && (
          <motion.div
            className="v6-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="v6-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 560 }}
            >
              <div className="v6-panel-title">
                <h3>Asset Details</h3>
                <button onClick={() => setSelected(null)} className="v6-btn v6-icon-only v6-sm">
                  <SvgIcon d={iconPaths.close} size={14} />
                </button>
              </div>

              {/* Preview */}
              {selected.url && (selected.type === "image" || !selected.type) && (
                <img
                  src={selected.url}
                  alt=""
                  style={{ width: "100%", borderRadius: 10, marginBottom: 14, maxHeight: 300, objectFit: "contain", background: "#111" }}
                />
              )}
              {selected.url && selected.type === "video" && (
                <video
                  src={selected.url}
                  controls
                  style={{ width: "100%", borderRadius: 10, marginBottom: 14, maxHeight: 300, background: "#111" }}
                />
              )}
              {selected.url && selected.type === "audio" && (
                <div style={{ padding: 16, borderRadius: 10, marginBottom: 14, background: "var(--v6-surface2)" }}>
                  <audio src={selected.url} controls style={{ width: "100%" }} />
                </div>
              )}

              {/* Metadata */}
              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                {[
                  ["Name", selected.name || `Untitled ${selected.type || "asset"}`],
                  ["Type", selected.type],
                  ["Source", selected.source],
                  ["Model", selected.model],
                  ["Dimensions", selected.width && selected.height ? `${selected.width}×${selected.height}` : null],
                  ["Duration", selected.duration ? `${selected.duration}s` : null],
                  ["File Size", selected.bytes > 0 ? `${(selected.bytes / 1024).toFixed(1)} KB` : null],
                  ["Created", new Date(selected.createdAt).toLocaleString()],
                ]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span className="v6-muted">{label}</span>
                      <span style={{ fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selected.url && (
                  <a href={selected.url} download className="v6-chip v6-active">
                    <SvgIcon d={iconPaths.download} size={12} /> Download
                  </a>
                )}
                <button onClick={() => toggleFavorite(selected)} className="v6-chip">
                  <SvgIcon d={iconPaths.star} size={12} /> {selected.isFavorite ? "Unfavorite" : "Favorite"}
                </button>
                {selected.type === "image" && (
                  <>
                    <button
                      onClick={() => window.open("/studio/canvas", "_blank")}
                      className="v6-chip"
                    >
                      Add to Canvas
                    </button>
                    <button
                      onClick={() => window.open("/studio/image", "_blank")}
                      className="v6-chip"
                    >
                      Use as Reference
                    </button>
                    <button
                      onClick={() => window.open("/studio/lipsync", "_blank")}
                      className="v6-chip"
                    >
                      Lip Sync
                    </button>
                    <button
                      onClick={() => window.open("/studio/body-swap", "_blank")}
                      className="v6-chip"
                    >
                      Recast
                    </button>
                  </>
                )}
                {selected.type === "video" && (
                  <>
                    <button
                      onClick={() => window.open("/studio/body-swap", "_blank")}
                      className="v6-chip"
                    >
                      Recast
                    </button>
                    <button
                      onClick={() => window.open("/studio/clipping", "_blank")}
                      className="v6-chip"
                    >
                      Create Clips
                    </button>
                  </>
                )}
                <button
                  onClick={() => window.open("/studio/brands", "_blank")}
                  className="v6-chip"
                >
                  Add to Brand Kit
                </button>
                <button
                  onClick={() => deleteAsset(selected.id)}
                  className="v6-chip"
                  style={{ borderColor: "var(--v6-bad)", color: "var(--v6-bad)" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
