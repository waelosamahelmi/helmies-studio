"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconExternal, IconDownload, IconArrowUpRight, IconImage } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const TYPE_META = {
  image: { label: "Image", color: "#FF1B6B" },
  video: { label: "Video", color: "#7C3AED" },
  audio: { label: "Audio", color: "#00E68A" },
  lipsync: { label: "Lip Sync", color: "#00E5FF" },
  i2i: { label: "Edit", color: "#FF1B6B" },
  i2v: { label: "Video", color: "#7C3AED" },
  recast: { label: "Recast", color: "#00E5FF" },
  cinema: { label: "Cinema", color: "#FF6B35" },
  marketing: { label: "Marketing", color: "#FF1B6B" },
  influencer: { label: "Persona", color: "#FF6B35" },
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

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/generations?tool=${filter}&limit=100`)
      .then((r) => r.json())
      .then((data) => { setCreations(data.generations || []); setLoading(false); })
      .catch(() => { setCreations([]); setLoading(false); });
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filtered = creations.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.model?.toLowerCase().includes(q) && !c.tool?.toLowerCase().includes(q) && !c.prompt?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__row">
          <div>
            <div className="eyebrow mb-4">Your Work</div>
            <h1 className="page__title">Gallery</h1>
            <p className="page__sub">{creations.length} creations.</p>
          </div>
          <Link href="/studio" className="btn btn-primary">
            New Generation
            <span className="btn__icon"><IconArrowUpRight /></span>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`pill ${filter === f.id ? "pill--active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="field w-full sm:w-64">
            <IconSearch className="field__icon" />
            <input
              type="text"
              placeholder="Search creations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <div className="studio-loading__spinner mx-auto mb-4" />
              <p className="text-sm text-white/50">Loading your creations...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <div className="studio__empty-icon mx-auto mb-6" style={{ color: "#FF1B6B" }}>
                <IconImage />
              </div>
              <h3 className="text-xl font-bold mb-2">No creations found</h3>
              <p className="text-sm text-white/50">Generate something in the studio to see it here.</p>
              <Link href="/studio" className="btn btn-primary mt-4">
                Go to Studio
                <span className="btn__icon"><IconArrowUpRight /></span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="gallery-grid">
            {filtered.map((c, i) => {
              const meta = TYPE_META[c.tool] || TYPE_META.image;
              const isVideo = c.outputUrl?.match(/\.(mp4|webm|mov)$/i);
              const isAudio = c.outputUrl?.match(/\.(mp3|wav|ogg|flac)$/i);
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.7, ease: EASE, delay: (i % 4) * 0.06 }}
                  className="gallery-card group"
                >
                  <div className="gallery-card__media">
                    {isVideo ? (
                      <video src={c.outputUrl} muted loop playsInline loading="lazy" />
                    ) : isAudio ? (
                      <div className="gallery-card__audio"><audio src={c.outputUrl} controls /></div>
                    ) : (
                      <img src={c.outputUrl} alt={c.model} loading="lazy" />
                    )}
                  </div>
                  <div className="gallery-card__scrim" />
                  <span className="gallery-card__type" style={{ color: meta.color }}>{meta.label}</span>
                  <div className="gallery-card__meta">
                    <span className="gallery-card__model">{c.model}</span>
                    <span className="gallery-card__time">{getTimeAgo(c.createdAt)}</span>
                  </div>
                  <div className="gallery-card__overlay">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => window.open(c.outputUrl, "_blank")}
                    >
                      <IconExternal style={{ width: "0.85rem", height: "0.85rem" }} />
                      Open
                    </button>
                    <a className="btn btn-sm btn-secondary" href={c.outputUrl} download>
                      <IconDownload style={{ width: "0.85rem", height: "0.85rem" }} />
                      Save
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}