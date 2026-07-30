"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";

const EASE = [0.32, 0.72, 0, 1];

const TYPE_META = {
  image: { label: "Image", color: "#FF1B6B", d: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  video: { label: "Video", color: "#7C3AED", d: "M2 5h14v14H2z M16 10l5-3v10l-5-3" },
  audio: { label: "Audio", color: "#00E68A", d: "M9 18V5l11-2v13 M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
  lipsync: { label: "Lip Sync", color: "#00E5FF", d: "M8 3h8l5 9-5 9H8l-5-9z" },
  i2i: { label: "Edit", color: "#FF1B6B", d: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  i2v: { label: "Video", color: "#7C3AED", d: "M2 5h14v14H2z M16 10l5-3v10l-5-3" },
  recast: { label: "Recast", color: "#00E5FF", d: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 14c-4 0-7 2-7 5h14c0-3-3-5-7-5z" },
  cinema: { label: "Cinema", color: "#FF6B35", d: "M3 3h18v18H3z M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" },
  marketing: { label: "Marketing", color: "#FF1B6B", d: "M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z M18 8a4 4 0 0 1 0 8" },
  influencer: { label: "Persona", color: "#FF6B35", d: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 14c-4 0-7 2-7 5h14c0-3-3-5-7-5z" },
  text: { label: "Text", color: "#C084FC", d: "M4 7V5h16v2M12 5v14M9 19h6" },
};

/* ── Inline SVG Icon ── */
function SvgIcon({ d, size = 18, color }) {
  return (
    <svg className="v6-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const iconPaths = {
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  close: "M6 6l12 12M18 6L6 18",
  arrowUpRight: "M7 17L17 7M9 7h8v8",
  image: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
  clock: "M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z M12 6v6l4 2",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  list: "M3 12h18M3 6h18M3 18h18",
  play: "M7 4l13 8-13 8z",
};

function getTimeAgo(dateStr) {
  if (!dateStr) return "";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
];

/* ── Gallery Card (media grid mode) ── */
function GalleryCard({ item, index }) {
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const meta = TYPE_META[item.tool] || TYPE_META.image;
  const isVideo = item.outputUrl?.match(/\.(mp4|webm|mov)$/i);
  const isAudio = item.outputUrl?.match(/\.(mp3|wav|ogg|flac)$/i);

  const handleMouseMove = (e) => {
    if (!isVideo || !videoRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const duration = videoRef.current.duration;
    if (duration && isFinite(duration)) {
      videoRef.current.currentTime = x * duration;
    }
  };

  return (
    <motion.div
      ref={containerRef}
      className="v6-media-card"
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.04, duration: 0.45, ease: EASE }}
      onMouseEnter={() => {
        setHovered(true);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setHovered(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={item.outputUrl}
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : isAudio ? (
        <div
          style={{
            width: "100%",
            aspectRatio: "4/3",
            background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}08)`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <audio src={item.outputUrl} controls style={{ width: "90%" }} />
        </div>
      ) : (
        <img src={item.outputUrl} alt={item.model || ""} loading="lazy" />
      )}
      <div className="v6-media-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 11 }}>{item.model || "Untitled"}</h3>
          <span className="v6-status" style={{ color: meta.color }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
            {meta.label}
          </span>
        </div>
        {item.prompt && (
          <p style={{ fontSize: 9, color: "var(--v6-muted)", lineHeight: 1.4, margin: "4px 0" }}>
            {item.prompt.slice(0, 70)}{item.prompt.length > 70 ? "..." : ""}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span className="v6-tiny v6-muted">{getTimeAgo(item.createdAt)}</span>
          {item.creditsUsed > 0 && (
            <span className="v6-tiny" style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--v6-good)" }}>
              <SvgIcon d={iconPaths.bolt} size={10} /> {item.creditsUsed}
            </span>
          )}
        </div>
      </div>
      <div className="v6-card-actions">
        <a
          href={item.outputUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="v6-btn v6-icon-only v6-sm"
          title="Open"
          onClick={(e) => e.stopPropagation()}
        >
          <SvgIcon d={iconPaths.arrowUpRight} size={13} />
        </a>
      </div>
    </motion.div>
  );
}

/* ── Gallery Row (table mode) ── */
function GalleryRow({ item }) {
  const meta = TYPE_META[item.tool] || TYPE_META.image;
  const isVideo = item.outputUrl?.match(/\.(mp4|webm|mov)$/i);
  const isAudio = item.outputUrl?.match(/\.(mp3|wav|ogg|flac)$/i);

  const statusColor =
    item.status === "completed"
      ? "var(--v6-good)"
      : item.status === "failed"
      ? "var(--v6-bad)"
      : item.status === "processing"
      ? "var(--v6-warn)"
      : "var(--v6-muted)";

  return (
    <tr>
      <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isVideo ? (
          <SvgIcon d={TYPE_META.video.d} size={16} color={meta.color} />
        ) : isAudio ? (
          <SvgIcon d={TYPE_META.audio.d} size={16} color={meta.color} />
        ) : (
          <SvgIcon d={TYPE_META.image.d} size={16} color={meta.color} />
        )}
        <span style={{ fontWeight: 600 }}>{item.model || "Untitled"}</span>
      </td>
      <td>
        <span className="v6-chip" style={{ fontSize: 8, padding: "3px 6px", borderColor: meta.color, color: meta.color }}>
          {meta.label}
        </span>
      </td>
      <td>
        <span className="v6-status" style={{ color: statusColor }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          {item.status || "completed"}
        </span>
      </td>
      <td>
        {item.creditsUsed > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <SvgIcon d={iconPaths.bolt} size={10} /> {item.creditsUsed}
          </span>
        )}
      </td>
      <td className="v6-tiny v6-muted">{getTimeAgo(item.createdAt)}</td>
      <td>
        {item.outputUrl && (
          <a
            href={item.outputUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="v6-btn v6-icon-only v6-sm"
          >
            <SvgIcon d={iconPaths.arrowUpRight} size={13} />
          </a>
        )}
      </td>
    </tr>
  );
}

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table"
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/generations?tool=${filter}&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        setCreations(data.generations || []);
        setLoading(false);
      })
      .catch(() => {
        setCreations([]);
        setLoading(false);
      });
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((c) => Math.min(c + 20, creations.length));
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [creations.length]);

  const filtered = creations.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !c.model?.toLowerCase().includes(q) &&
        !c.tool?.toLowerCase().includes(q) &&
        !c.prompt?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="v6-page-content" style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Page Head */}
        <div className="v6-page-head">
          <div>
            <div className="v6-eyebrow">Your Work</div>
            <h1>Gallery</h1>
            <p>{creations.length} generations.</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* View toggle */}
            <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--v6-line)", overflow: "hidden" }}>
              <button
                onClick={() => setViewMode("grid")}
                className="v6-btn v6-icon-only v6-sm"
                style={{
                  borderRadius: 0,
                  border: 0,
                  ...(viewMode === "grid" ? { background: "var(--v6-accent)", color: "#fff" } : {}),
                }}
              >
                <SvgIcon d={iconPaths.grid} size={14} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className="v6-btn v6-icon-only v6-sm"
                style={{
                  borderRadius: 0,
                  border: 0,
                  borderLeft: "1px solid var(--v6-line)",
                  ...(viewMode === "table" ? { background: "var(--v6-accent)", color: "#fff" } : {}),
                }}
              >
                <SvgIcon d={iconPaths.list} size={14} />
              </button>
            </div>
            <Link href="/studio" className="v6-btn v6-primary">
              New Generation
              <SvgIcon d={iconPaths.arrowUpRight} size={14} />
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 22,
            flexWrap: "wrap",
          }}
        >
          <div className="v6-chip-row">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`v6-chip ${filter === f.id ? "v6-active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--v6-line)",
              borderRadius: 99,
              padding: "7px 12px",
              background: "var(--v6-surface2)",
              maxWidth: 260,
              flex: 1,
            }}
          >
            <SvgIcon d={iconPaths.search} size={14} />
            <input
              type="text"
              placeholder="Search creations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                border: 0,
                background: "transparent",
                color: "var(--v6-text)",
                fontSize: 11,
                width: "100%",
                outline: "none",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  color: "var(--v6-muted)",
                }}
              >
                <SvgIcon d={iconPaths.close} size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="v6-media-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="v6-media-card"
                style={{ minHeight: 200, animation: `pulse 1.5s ${i * 0.08}s infinite` }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    background: "var(--v6-surface2)",
                  }}
                />
                <div className="v6-media-card-body">
                  <div style={{ height: 11, width: "60%", background: "var(--v6-surface2)", borderRadius: 4, marginBottom: 6 }} />
                  <div style={{ height: 8, width: "40%", background: "var(--v6-surface2)", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="v6-empty-state" style={{ padding: "60px 0" }}>
            <div className="v6-empty-orbit">
              <SvgIcon d={iconPaths.image} size={26} color="var(--v6-accent)" />
            </div>
            <h2>No creations found</h2>
            <p>Generate something in the studio to see it here.</p>
            <Link href="/studio" className="v6-btn v6-primary">
              Go to Studio
              <SvgIcon d={iconPaths.arrowUpRight} size={14} />
            </Link>
          </div>
        ) : viewMode === "table" ? (
          /* ── Table View ── */
          <div style={{ border: "1px solid var(--v6-line)", borderRadius: "var(--v6-r)", overflow: "hidden", background: "var(--v6-surface)" }}>
            <table className="v6-data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>Time</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.3 }}
                    style={{ display: "contents" }}
                  >
                    <GalleryRow item={c} />
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Grid View ── */
          <div className="v6-media-grid">
            {visible.map((c, i) => (
              <GalleryCard key={c.id} item={c} index={i} />
            ))}
            {visibleCount < filtered.length && (
              <div ref={sentinelRef} style={{ height: 1, width: "100%" }} />
            )}
          </div>
        )}
      </div>
    </>
  );
}
