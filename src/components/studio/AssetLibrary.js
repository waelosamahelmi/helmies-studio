"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconImage, IconVideo, IconMusic, IconStar, IconClose, IconBolt, IconDownload } from "@/components/Icons";
import { apiFetch } from "@/lib/client-fetch";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const TYPE_FILTERS = [
  { id: "all", label: "All", icon: IconStar },
  { id: "image", label: "Images", icon: IconImage },
  { id: "video", label: "Videos", icon: IconVideo },
  { id: "audio", label: "Audio", icon: IconMusic },
];

export default function AssetLibrary() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);

  const loadAssets = useCallback(async (cursor = null) => {
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
  }, [typeFilter]);

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
        setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, isFavorite: !a.isFavorite } : a));
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

  const getTypeIcon = (type) => {
    if (type === "image") return IconImage;
    if (type === "video") return IconVideo;
    if (type === "audio") return IconMusic;
    return IconStar;
  };

  return (
    <div className="studio__workspace">
      <div className="studio__workspace-body" style={{ flexDirection: "column" }}>
        <div className="studio__asset-header">
          <h2>Asset Library</h2>
          <div className="studio__chip-group">
            {TYPE_FILTERS.map((f) => {
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  onClick={() => setTypeFilter(f.id)}
                  className={`studio__chip ${typeFilter === f.id ? "studio__chip--active" : ""}`}
                >
                  <Icon style={{ width: 14, height: 14 }} /> {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="studio__idle">
            <IconStar style={{ width: 48, height: 48, opacity: 0.3 }} />
            <p>Loading assets...</p>
          </div>
        ) : assets.length === 0 ? (
          <div className="studio__idle">
            <IconImage style={{ width: 64, height: 64, opacity: 0.3 }} />
            <h2>Asset Library</h2>
            <p>Your generated images, videos, and audio will appear here.</p>
            <p className="studio__idle-modes">Upload · Generate · Organize · Reuse</p>
          </div>
        ) : (
          <div className="studio__asset-grid-full">
            {assets.map((asset) => {
              const TypeIcon = getTypeIcon(asset.type);
              return (
                <motion.div
                  key={asset.id}
                  className={`studio__asset-card ${selected?.id === asset.id ? "studio__asset-card--selected" : ""}`}
                  onClick={() => setSelected(asset)}
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.2, ease: EASE }}
                >
                  {asset.url && asset.type === "image" && (
                    <img src={asset.thumbnailUrl || asset.url} alt={asset.name || ""} className="studio__asset-card-img" />
                  )}
                  {asset.url && asset.type === "video" && (
                    <video src={asset.url} className="studio__asset-card-img" muted />
                  )}
                  {(!asset.url || asset.type === "audio") && (
                    <div className="studio__asset-card-placeholder">
                      <TypeIcon style={{ width: 32, height: 32, opacity: 0.4 }} />
                    </div>
                  )}
                  <div className="studio__asset-card-info">
                    <span className="studio__asset-card-name">{asset.name || asset.type}</span>
                    <span className="studio__asset-card-meta">
                      {asset.model && <span>{asset.model}</span>}
                      {asset.width && asset.height && <span>{asset.width}×{asset.height}</span>}
                      <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                  <button
                    className={`studio__asset-card-fav ${asset.isFavorite ? "studio__asset-card-fav--active" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(asset); }}
                  >
                    <IconStar />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <button onClick={() => loadAssets(nextCursor)} className="studio__btn studio__btn--ghost" style={{ margin: "1rem auto" }}>
            Load more
          </button>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <motion.aside
            className="studio__pane studio__pane--right"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <div className="studio__section">
              <div className="studio__inspector-header">
                <h3 className="studio__section-title">Asset Details</h3>
                <button onClick={() => setSelected(null)} className="studio__link"><IconClose /></button>
              </div>

              {selected.url && selected.type === "image" && (
                <img src={selected.url} alt="" className="studio__result-img" style={{ borderRadius: 8, marginBottom: 12 }} />
              )}

              <div className="studio__inspector-rows">
                <div className="studio__inspector-row"><span>Type</span><span>{selected.type}</span></div>
                <div className="studio__inspector-row"><span>Source</span><span>{selected.source}</span></div>
                {selected.model && <div className="studio__inspector-row"><span>Model</span><span>{selected.model}</span></div>}
                {selected.width && selected.height && <div className="studio__inspector-row"><span>Size</span><span>{selected.width}×{selected.height}</span></div>}
                {selected.duration && <div className="studio__inspector-row"><span>Duration</span><span>{selected.duration}s</span></div>}
                {selected.bytes > 0 && <div className="studio__inspector-row"><span>File size</span><span>{(selected.bytes / 1024).toFixed(1)} KB</span></div>}
                <div className="studio__inspector-row"><span>Created</span><span>{new Date(selected.createdAt).toLocaleString()}</span></div>
              </div>

              <div className="studio__result-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
                {selected.url && (
                  <a href={selected.url} download className="studio__chip">
                    <IconDownload style={{ width: 12, height: 12 }} /> Download
                  </a>
                )}
                <button onClick={() => toggleFavorite(selected)} className="studio__chip">
                  <IconStar style={{ width: 12, height: 12 }} /> {selected.isFavorite ? "Unfavorite" : "Favorite"}
                </button>
                {selected.type === "image" && (
                  <>
                    <button onClick={() => window.open(`/studio/canvas`, "_blank")} className="studio__chip">Add to Canvas</button>
                    <button onClick={() => window.open(`/studio/image`, "_blank")} className="studio__chip">↻ Use as reference</button>
                    <button onClick={() => window.open(`/studio/lipsync`, "_blank")} className="studio__chip">Lip Sync</button>
                    <button onClick={() => window.open(`/studio/body-swap`, "_blank")} className="studio__chip">Recast</button>
                  </>
                )}
                {selected.type === "video" && (
                  <>
                    <button onClick={() => window.open(`/studio/body-swap`, "_blank")} className="studio__chip">Recast</button>
                    <button onClick={() => window.open(`/studio/clipping`, "_blank")} className="studio__chip">✂ Clip</button>
                  </>
                )}
                <button onClick={async () => {
                  try {
                    await apiFetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: selected.url }) });
                    toast.success("Analysis queued");
                  } catch { toast.error("Analysis failed"); }
                }} className="studio__chip">Analyze</button>
                <button onClick={() => window.open(`/studio/brands`, "_blank")} className="studio__chip">Add to Brand Kit</button>
                <button onClick={() => deleteAsset(selected.id)} className="studio__chip studio__chip--avoid">Delete</button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
