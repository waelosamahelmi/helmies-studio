"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconArrowUpRight } from "@/components/Icons";
import { IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS, LIPSYNC_MODELS, RECAST_MODELS, AUDIO_MODELS } from "@/lib/models";

const EASE = [0.32, 0.72, 0, 1];

const ALL_MODELS = [IMAGE_MODELS.map((m) => ({ ...m, type: "image", category: "Text → Image" })),
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
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__row">
          <div>
            <div className="eyebrow mb-4">Catalog</div>
            <h1 className="page__title">{ALL_MODELS.length} AI Models</h1>
            <p className="page__sub">Every model in the Helmies Studio catalog, across all studios.</p>
          </div>
          <Link href="/studio" className="btn btn-primary">
            Start Creating
            <span className="btn__icon"><IconArrowUpRight /></span>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`pill ${category === c ? "pill--active" : ""}`}
              >
                {c}
                {c !== "All" && <span className="pill__count">{counts[c]}</span>}
              </button>
            ))}
          </div>
          <div className="field w-full sm:w-64">
            <IconSearch className="field__icon" />
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="models-grid">
          {filtered.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.5, ease: EASE, delay: (i % 6) * 0.04 }}
              className="model-card bezel"
            >
              <div className="bezel__core" style={{ padding: "1.25rem" }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">{m.category}</span>
                  <span className="pill pill--active" style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem" }}>{m.type}</span>
                </div>
                <h3 className="text-base font-bold mb-1">{m.name}</h3>
                <p className="text-xs text-white/40 mb-3">{m.id}</p>
                {m.aspectRatios && (
                  <div className="flex flex-wrap gap-1">
                    {m.aspectRatios.slice(0, 4).map((ar) => (
                      <span key={ar} className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{ar}</span>
                    ))}
                    {m.aspectRatios.length > 4 && <span className="text-[10px] text-white/30">+{m.aspectRatios.length - 4}</span>}
                  </div>
                )}
                {m.durations && (
                  <div className="flex flex-wrap gap-1">
                    {m.durations.map((d) => (
                      <span key={d} className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{d}s</span>
                    ))}
                  </div>
                )}
                {m.resolutions && (
                  <div className="flex flex-wrap gap-1">
                    {m.resolutions.map((r) => (
                      <span key={r} className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">{r}</span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <h3 className="text-xl font-bold mb-2">No models found</h3>
              <p className="text-sm text-white/50">Try a different search or category.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}