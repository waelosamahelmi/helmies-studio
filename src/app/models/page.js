"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconSearch, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const MODELS = [
  { id: "flux-dev", name: "Flux Dev", type: "image", provider: "Black Forest Labs", category: "Text → Image" },
  { id: "flux-pro", name: "Flux Pro 1.1", type: "image", provider: "Black Forest Labs", category: "Text → Image" },
  { id: "midjourney-v7", name: "Midjourney v7", type: "image", provider: "Midjourney", category: "Text → Image" },
  { id: "gpt-4o-image", name: "GPT-4o Image", type: "image", provider: "OpenAI", category: "Text → Image" },
  { id: "seedream-5", name: "Seedream 5.0", type: "image", provider: "ByteDance", category: "Text → Image" },
  { id: "ideogram-v3", name: "Ideogram v3", type: "image", provider: "Ideogram", category: "Text → Image" },
  { id: "recraft-v3", name: "Recraft v3", type: "image", provider: "Recraft", category: "Text → Image" },
  { id: "imagen-3", name: "Imagen 3", type: "image", provider: "Google", category: "Text → Image" },
  { id: "sora-2", name: "Sora 2", type: "video", provider: "OpenAI", category: "Text → Video" },
  { id: "kling-v3", name: "Kling v3 Pro", type: "video", provider: "Kuaishou", category: "Text → Video" },
  { id: "veo-3", name: "Veo 3", type: "video", provider: "Google", category: "Text → Video" },
  { id: "runway-gen3", name: "Runway Gen-3", type: "video", provider: "Runway", category: "Text → Video" },
  { id: "minimax-video", name: "MiniMax Video-01", type: "video", provider: "MiniMax", category: "Text → Video" },
  { id: "luma-dream", name: "Luma Dream Machine", type: "video", provider: "Luma AI", category: "Text → Video" },
  { id: "infinite-talk", name: "Infinite Talk", type: "lipsync", provider: "Helmies", category: "Lip Sync" },
  { id: "wan-2-2", name: "Wan 2.2 Lip Sync", type: "lipsync", provider: "Alibaba", category: "Lip Sync" },
  { id: "ltx-2-3", name: "LTX 2.3", type: "lipsync", provider: "Lightricks", category: "Lip Sync" },
  { id: "latentsync", name: "LatentSync", type: "lipsync", provider: "Helmies", category: "Lip Sync" },
  { id: "mmaudio-v2", name: "mmAudio v2", type: "audio", provider: "Helmies", category: "Audio" },
  { id: "bark-voice", name: "Bark Voice Cloning", type: "audio", provider: "Suno", category: "Audio" },
  { id: "musicgen", name: "MusicGen", type: "audio", provider: "Meta", category: "Audio" },
  { id: "nano-banana-pro", name: "Nano Banana Pro", type: "image", provider: "Helmies", category: "Image → Image" },
  { id: "seedream-edit", name: "Seedream 5.0 Edit", type: "image", provider: "ByteDance", category: "Image → Image" },
  { id: "kling-motion", name: "Kling v3 Motion Control", type: "video", provider: "Kuaishou", category: "Video → Video" },
  { id: "runway-act-two", name: "Runway Act-Two Recast", type: "recast", provider: "Runway", category: "Body Swap" },
];

const CATEGORIES = [
  { id: "all", label: "All", types: null },
  { id: "image", label: "Image", types: ["image"] },
  { id: "video", label: "Video", types: ["video"] },
  { id: "lipsync", label: "Lip Sync", types: ["lipsync"] },
  { id: "audio", label: "Audio", types: ["audio"] },
  { id: "recast", label: "Body Swap", types: ["recast"] },
];

const TYPE_BADGE = {
  image: { label: "IMG", color: "#FF1B6B" },
  video: { label: "VID", color: "#7C3AED" },
  lipsync: { label: "LIP", color: "#00E5FF" },
  audio: { label: "AUD", color: "#00E68A" },
  recast: { label: "RCS", color: "#FFB800" },
};

const STUDIO_MAP = { image: "image", video: "video", lipsync: "lipsync", audio: "audio", recast: "body-swap" };

export default function ModelsPage() {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c = { all: MODELS.length };
    CATEGORIES.forEach((cat) => {
      if (cat.id === "all") return;
      c[cat.id] = MODELS.filter((m) => cat.types.includes(m.type)).length;
    });
    return c;
  }, []);

  const filtered = useMemo(() => {
    let models = MODELS;
    if (category !== "all") {
      const cat = CATEGORIES.find((c) => c.id === category);
      if (cat?.types) models = models.filter((m) => cat.types.includes(m.type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      models = models.filter((m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
    }
    return models;
  }, [category, search]);

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__head">
          <div className="eyebrow mb-5">Model Catalog</div>
          <h1 className="page__title"><em>{MODELS.length}</em> models. Always current.</h1>
          <p className="page__sub">Every model powered by Helmies. One subscription, no rate limits, no watermarks.</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`pill ${category === c.id ? "pill--active" : ""}`}
            >
              {c.label}
              <span className="pill__count">{counts[c.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="field max-w-md mx-auto mb-8">
          <IconSearch className="field__icon" />
          <input
            type="text"
            placeholder="Search models or providers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="text-center mb-8 text-sm text-white/40">
          <strong className="text-white font-semibold">{filtered.length}</strong> models
          {search && <span> matching &quot;{search}&quot;</span>}
        </div>

        <div className="models-grid">
          {filtered.map((m, i) => {
            const badge = TYPE_BADGE[m.type] || TYPE_BADGE.image;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.6, ease: EASE, delay: (i % 4) * 0.05 }}
              >
                <Link href={`/studio/${STUDIO_MAP[m.type]}`} className="model-card bezel" style={{ color: badge.color }}>
                  <div className="model-card__core bezel__core">
                    <span className="model-card__type">{badge.label}</span>
                    <h3 style={{ color: "#fff" }}>{m.name}</h3>
                    <div className="model-card__meta">
                      <span>{m.provider}</span>
                      <span className="opacity-40">·</span>
                      <span>{m.category}</span>
                    </div>
                    <div className="model-card__arrow">
                      <span className="model-card__arrow-icon"><IconArrowUpRight style={{ color: "#fff" }} /></span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </>
  );
}