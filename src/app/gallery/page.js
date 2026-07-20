"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconExternal, IconDownload, IconArrowUpRight, IconImage } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const MOCK_CREATIONS = [
  { id: "1", imageUrl: "/assets/warrior_girl_e29532086b-40.webp", modelId: "flux-dev", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 3600000).toISOString(), creditsCost: 2 },
  { id: "2", imageUrl: "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.webp", modelId: "sora-2", modelType: "video", status: "completed", createdAt: new Date(Date.now() - 7200000).toISOString(), creditsCost: 5 },
  { id: "3", imageUrl: "/assets/photo-1506905925346-21bda4d32df4-6.webp", modelId: "midjourney-v7", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 86400000).toISOString(), creditsCost: 3 },
  { id: "4", imageUrl: "/assets/photo-1547036967-23d11aacaee0-7.webp", modelId: "gpt-4o-image", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 172800000).toISOString(), creditsCost: 2 },
  { id: "5", imageUrl: "/assets/260118_RecursiveIdentities_bright_1024px-768x768-15.webp", modelId: "seedream-5", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 259200000).toISOString(), creditsCost: 2 },
  { id: "6", imageUrl: "/assets/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.webp", modelId: "ideogram-v3", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 345600000).toISOString(), creditsCost: 2 },
];

const TYPE_META = {
  image: { label: "Image", color: "#FF1B6B" },
  video: { label: "Video", color: "#7C3AED" },
  audio: { label: "Audio", color: "#00E68A" },
  lipsync: { label: "Lip Sync", color: "#00E5FF" },
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
  { id: "completed", label: "Completed" },
  { id: "processing", label: "Processing" },
  { id: "failed", label: "Failed" },
];

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = MOCK_CREATIONS.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!c.modelId.toLowerCase().includes(q) && !c.modelType.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: MOCK_CREATIONS.length,
    completed: MOCK_CREATIONS.filter((c) => c.status === "completed").length,
    processing: MOCK_CREATIONS.filter((c) => c.status === "processing").length,
    failed: MOCK_CREATIONS.filter((c) => c.status === "failed").length,
  };

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__row">
          <div>
            <div className="eyebrow mb-4">Your Work</div>
            <h1 className="page__title">Gallery</h1>
            <p className="page__sub">{MOCK_CREATIONS.length} creations across 4 studios.</p>
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
                <span className="pill__count">{counts[f.id] ?? 0}</span>
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

        {filtered.length === 0 ? (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <div className="studio__empty-icon mx-auto mb-6" style={{ color: "#FF1B6B" }}>
                <IconImage />
              </div>
              <h3 className="text-xl font-bold mb-2">No creations found</h3>
              <p className="text-sm text-white/50">Try adjusting your filters or search query.</p>
            </div>
          </div>
        ) : (
          <div className="gallery-grid">
            {filtered.map((c, i) => {
              const meta = TYPE_META[c.modelType] || TYPE_META.image;
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
                    <img src={c.imageUrl} alt={c.modelId} loading="lazy" />
                  </div>
                  <div className="gallery-card__scrim" />
                  <span className="gallery-card__type" style={{ color: meta.color }}>{meta.label}</span>
                  <div className="gallery-card__meta">
                    <span className="gallery-card__model">{c.modelId}</span>
                    <span className="gallery-card__time">{getTimeAgo(c.createdAt)}</span>
                  </div>
                  <div className="gallery-card__overlay">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => window.open(c.imageUrl, "_blank")}
                    >
                      <IconExternal style={{ width: "0.85rem", height: "0.85rem" }} />
                      Open
                    </button>
                    <button className="btn btn-sm btn-secondary">
                      <IconDownload style={{ width: "0.85rem", height: "0.85rem" }} />
                      Save
                    </button>
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