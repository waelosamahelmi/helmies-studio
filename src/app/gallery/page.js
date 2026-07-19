"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { FaSearch, FaDownload, FaExternalLinkAlt } from "react-icons/fa";

const MOCK_CREATIONS = [
  { id: "1", imageUrl: "/warrior_girl_e29532086b-40.webp", modelId: "flux-dev", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 3600000).toISOString(), creditsCost: 2 },
  { id: "2", imageUrl: "/ai_cinematic_video_generator_hero_image_0f96f59168-41.png", modelId: "sora-2", modelType: "video", status: "completed", createdAt: new Date(Date.now() - 7200000).toISOString(), creditsCost: 5 },
  { id: "3", imageUrl: "/photo-1506905925346-21bda4d32df4-6.jpg", modelId: "midjourney-v7", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 86400000).toISOString(), creditsCost: 3 },
  { id: "4", imageUrl: "/photo-1547036967-23d11aacaee0-7.jpg", modelId: "gpt-4o-image", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 172800000).toISOString(), creditsCost: 2 },
  { id: "5", imageUrl: "/260118_RecursiveIdentities_bright_1024px-768x768-15.jpg", modelId: "seedream-5", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 259200000).toISOString(), creditsCost: 2 },
  { id: "6", imageUrl: "/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.jpg", modelId: "ideogram-v3", modelType: "image", status: "completed", createdAt: new Date(Date.now() - 345600000).toISOString(), creditsCost: 2 },
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
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="section pt-24">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <div className="section__kicker">Your Work</div>
            <h2 className="text-3xl font-extrabold">Gallery</h2>
            <p className="text-sm text-white/50 mt-1">{MOCK_CREATIONS.length} creations across 4 studios.</p>
          </div>
          <Link href="/studio" className="btn btn-primary">New Generation</Link>
        </div>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {Object.entries({ all: "All", completed: "Completed", processing: "Processing", failed: "Failed" }).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`badge cursor-pointer transition-all ${filter === id ? "badge-brand" : "badge-outline hover:border-white/20"}`}>
                {label} <span className="ml-1 opacity-60">{counts[id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <FaSearch className="text-white/30 text-xs" />
            <input type="text" placeholder="Search creations..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-transparent border-none text-sm text-white outline-none placeholder:text-white/30 w-40" />
          </div>
        </div>

        <div className="gallery-grid">
          {filtered.map((c) => {
            const meta = TYPE_META[c.modelType] || TYPE_META.image;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3 }} className="gallery-card group">
                <img src={c.imageUrl} alt={c.modelId} loading="lazy" />
                <div className="gallery-card__overlay">
                  <button className="btn btn-sm btn-primary" onClick={() => window.open(c.imageUrl, "_blank")}><FaExternalLinkAlt className="text-[10px]" /> Open</button>
                  <button className="btn btn-sm btn-secondary"><FaDownload className="text-[10px]" /> Download</button>
                </div>
                <div className="absolute top-3 left-3">
                  <span className="badge" style={{ background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>{meta.label}</span>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/80 truncate">{c.modelId}</span>
                  <span className="text-[10px] text-white/40">{getTimeAgo(c.createdAt)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}