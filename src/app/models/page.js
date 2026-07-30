"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import { IconSearch, IconArrowUpRight } from "@/components/Icons";
import { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS } from "@/lib/models";

const TYPE_TO_TOOL = {
  image: "image", i2i: "image", video: "video", i2v: "video",
  v2v: "video", lipsync: "lipsync", recast: "body-swap", audio: "audio",
};

const ALL_MODELS = [
  ...IMAGE_MODELS.map((m) => ({ ...m, type: "image", category: "Text → Image" })),
  ...I2I_MODELS.map((m) => ({ ...m, type: "i2i", category: "Image → Image" })),
  ...VIDEO_MODELS.map((m) => ({ ...m, type: "video", category: "Text → Video" })),
  ...I2V_MODELS.map((m) => ({ ...m, type: "i2v", category: "Image → Video" })),
  ...V2V_MODELS.map((m) => ({ ...m, type: "v2v", category: "Video → Video" })),
  ...LIPSYNC_MODELS.map((m) => ({ ...m, type: "lipsync", category: "Lip Sync" })),
  ...RECAST_MODELS.map((m) => ({ ...m, type: "recast", category: "Body Swap" })),
  ...AUDIO_MODELS.map((m) => ({ ...m, type: "audio", category: "Audio" })),
];

const CATEGORIES = ["All", ...Array.from(new Set(ALL_MODELS.map((m) => m.category)))];

export default function ModelsPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [backgrounds, setBackgrounds] = useState({});

  useEffect(() => {
    fetch("/api/admin/models")
      .then((r) => r.json())
      .then((d) => {
        const map = {};
        (d.models || []).forEach((m) => {
          if (m.background) {
            map[m.id] = { url: m.background, overlay: m.backgroundOverlay ?? 0.05, textColor: m.textColor || "light" };
          }
        });
        setBackgrounds(map);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    return ALL_MODELS.filter((m) => {
      if (category !== "All" && m.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [search, category]);

  const counts = ALL_MODELS.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="universe-page-shell">
      <UniverseNav />
      <div className="universe-page-shell__content">
        <div className="universe-section__header">
          <div>
            <div className="universe-section__label">Catalog</div>
            <h1>{ALL_MODELS.length} AI Models</h1>
            <p>Every model in the Helmies Studio catalog, across all studios.</p>
          </div>
          <Link href="/studio" className="universe-plan__cta" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            Start Creating
            <IconArrowUpRight />
          </Link>
        </div>

        {/* Category pills */}
        <div className="universe-pills">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`universe-pill ${category === c ? "is-active" : ""}`}>
              {c}
              {c !== "All" && <span className="universe-pill__count">{counts[c]}</span>}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="universe-key__add" style={{ marginBottom: 20 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <IconSearch style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 14, color: "#aa91a0" }} />
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }}
            />
          </div>
        </div>

        {/* Model grid */}
        <div className="models-grid">
          {filtered.map((m, i) => {
            const tool = TYPE_TO_TOOL[m.type] || "image";
            const bg = backgrounds[m.id];
            const bgUrl = bg ? bg.url : null;
            const bgOverlay = bg ? bg.overlay : 0.05;
            const isDark = bg ? bg.textColor === "dark" : false;
            const textBase = isDark ? "#111" : "#fff8fc";
            const textMuted = isDark ? "rgba(0,0,0,0.5)" : "#aa91a0";
            const textFaint = isDark ? "rgba(0,0,0,0.35)" : "rgba(255,248,252,0.45)";
            const badgeBg = isDark ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";
            return (
              <Link key={m.id} href={`/studio/${tool}?model=${m.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.5, delay: (i % 6) * 0.04 }}
                  className="model-card bezel"
                  style={{ position: "relative", overflow: "hidden", cursor: "pointer", borderColor: "rgba(255,190,214,.16)" }}
                >
                  {bgUrl && (
                    <div
                      style={{
                        position: "absolute", inset: 0,
                        backgroundImage: `url(${bgUrl})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        opacity: bgOverlay === 0 ? 1 : bgOverlay,
                        transition: "opacity 0.3s", pointerEvents: "none", zIndex: 0,
                      }}
                      className="model-card__bg"
                    />
                  )}
                  <div className="bezel__core" style={{ padding: "1.25rem", position: "relative", zIndex: 1, color: textBase }}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: textMuted }}>{m.category}</span>
                      <span className="universe-pill is-active" style={{ fontSize: ".65rem", padding: "2px 7px", border: "1px solid rgba(255,65,111,.3)" }}>{m.type}</span>
                    </div>
                    <h3 className="text-base font-bold mb-1">{m.name}</h3>
                    <p className="text-xs mb-3" style={{ color: textMuted }}>{m.id}</p>
                    {m.aspectRatios && (
                      <div className="flex flex-wrap gap-1">
                        {m.aspectRatios.slice(0, 4).map((ar) => (
                          <span key={ar} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: textFaint, background: badgeBg }}>{ar}</span>
                        ))}
                        {m.aspectRatios.length > 4 && <span className="text-[10px]" style={{ color: textFaint }}>+{m.aspectRatios.length - 4}</span>}
                      </div>
                    )}
                    {m.durations && (
                      <div className="flex flex-wrap gap-1">
                        {m.durations.map((d) => (
                          <span key={d} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: textFaint, background: badgeBg }}>{d}s</span>
                        ))}
                      </div>
                    )}
                    {m.resolutions && (
                      <div className="flex flex-wrap gap-1">
                        {m.resolutions.map((r) => (
                          <span key={r} className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: textFaint, background: badgeBg }}>{r}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="universe-section" style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>No models found</h3>
            <p style={{ color: "#aa91a0", fontSize: ".82rem" }}>Try a different search or category.</p>
          </div>
        )}
      </div>
    </div>
  );
}
