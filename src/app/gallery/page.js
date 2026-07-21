"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconArrowUpRight, IconImage, IconBolt } from "@/components/Icons";

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

function GalleryCard({ item, index }) {
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef(null);
  const meta = TYPE_META[item.tool] || TYPE_META.image;
  const isVideo = item.outputUrl?.match(/\.(mp4|webm|mov)$/i);
  const isAudio = item.outputUrl?.match(/\.(mp3|wav|ogg|flac)$/i);

  return (
    <motion.div
      className="masonry__item"
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.05, duration: 0.5, ease: EASE }}
      onMouseEnter={() => {
        setHovered(true);
        if (videoRef.current) videoRef.current.play().catch(() => {});
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
      }}
    >
      {isVideo ? (
        <video
          ref={videoRef}
          src={item.outputUrl}
          className="masonry__media"
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : isAudio ? (
        <div className="masonry__audio-wrap">
          <audio src={item.outputUrl} controls className="masonry__audio" />
        </div>
      ) : (
        <img src={item.outputUrl} alt={item.model || ""} className="masonry__media" loading="lazy" />
      )}

      <div className={`masonry__overlay ${hovered ? "masonry__overlay--visible" : ""}`}>
        <div className="masonry__overlay-top">
          <span className="masonry__badge" style={{ color: meta.color }}>{meta.label}</span>
          {item.creditsUsed > 0 && (
            <span className="masonry__cost"><IconBolt /> {item.creditsUsed}</span>
          )}
        </div>
        <div className="masonry__overlay-bottom">
          {item.prompt && <p className="masonry__prompt">{item.prompt.slice(0, 80)}{item.prompt.length > 80 ? "..." : ""}</p>}
          <div className="masonry__actions">
            <a href={item.outputUrl} target="_blank" rel="noopener noreferrer" className="masonry__action-btn">
              <IconArrowUpRight />
            </a>
          </div>
        </div>
      </div>

      <div className="masonry__info">
        <span className="masonry__model">{item.model}</span>
        <span className="masonry__time">{getTimeAgo(item.createdAt)}</span>
      </div>
    </motion.div>
  );
}

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
            New Generation<span className="btn__icon"><IconArrowUpRight /></span>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)} className={`pill ${filter === f.id ? "pill--active" : ""}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="field w-full sm:w-64">
            <IconSearch className="field__icon" />
            <input type="text" placeholder="Search creations..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <div className="studio-loading__spinner mx-auto mb-4" />
              <p className="text-sm" style={{ color: "rgba(242,242,247,0.5)" }}>Loading your creations...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bezel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <div className="bezel__core" style={{ padding: "3rem 2rem" }}>
              <div className="studio__empty-icon mx-auto mb-6" style={{ color: "#FF1B6B" }}>
                <IconImage />
              </div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>No creations found</h3>
              <p style={{ fontSize: "0.85rem", color: "rgba(242,242,247,0.5)" }}>Generate something in the studio to see it here.</p>
              <Link href="/studio" className="btn btn-primary" style={{ marginTop: "1rem", display: "inline-flex" }}>
                Go to Studio<span className="btn__icon"><IconArrowUpRight /></span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="masonry">
            {filtered.map((c, i) => (
              <GalleryCard key={c.id} item={c} index={i} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
