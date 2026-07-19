"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import Navbar from "@/components/Navbar";
import { FaImage, FaVideo, FaMusic, FaCameraRetro, FaFilm, FaCut, FaBullhorn, FaMicrophone, FaUserFriends, FaCrown, FaCheck, FaArrowRight, FaPlay, FaPause } from "react-icons/fa";

const TOOLS = [
  { id: "image", label: "Image", desc: "Flux, Midjourney, GPT-4o, Seedream — 55+ photoreal & artistic models.", icon: FaImage, color: "#FF1B6B", badge: "55+" },
  { id: "video", label: "Video", desc: "Sora 2, Kling v3, Veo 3, Runway — 40+ text/image/video-to-video models.", icon: FaVideo, color: "#7C3AED", badge: "40+" },
  { id: "audio", label: "Audio", desc: "Music, voice synthesis, sound effects — 12 audio models.", icon: FaMusic, color: "#00E5FF", badge: "12" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls — lens, focal length, aperture, film format.", icon: FaCameraRetro, color: "#FF6B35", badge: "4K" },
  { id: "lipsync", label: "Lip Sync", desc: "Infinite Talk, Wan 2.2, LTX 2.3 — 9 lip-sync models.", icon: FaMicrophone, color: "#FFD166", badge: "9" },
  { id: "influencer", label: "Influencer", desc: "Build AI personas and influencer avatars from traits.", icon: FaCrown, color: "#FF6B35", badge: "New" },
];

const STATS = [
  { n: "200+", l: "AI models" },
  { n: "10", l: "studios" },
  { n: "1", l: "subscription" },
  { n: "0", l: "content filters" },
];

const PRICING = [
  { name: "Free", price: "$0", period: "forever", credits: "10 credits/mo", features: ["10 credits monthly", "All 200+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { name: "Starter", price: "$9", period: "/mo", credits: "200 credits/mo", features: ["200 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime", "Email support"], cta: "Subscribe", popular: false },
  { name: "Studio", price: "$29", period: "/mo", credits: "800 credits/mo", features: ["800 credits monthly", "All studios unlocked", "4K downloads", "Generation archive", "Priority queue", "Email support"], cta: "Subscribe", popular: true },
  { name: "Pro", price: "$99", period: "/mo", credits: "3000 credits/mo", features: ["3000 credits monthly", "Priority queue", "Batch exports", "API access", "Dedicated support"], cta: "Subscribe", popular: false },
];

const SHOWCASE = [
  "/warrior_girl_e29532086b-40.webp",
  "/ai_cinematic_video_generator_hero_image_0f96f59168-41.png",
  "/photo-1506905925346-21bda4d32df4-6.jpg",
  "/photo-1547036967-23d11aacaee0-7.jpg",
  "/260118_RecursiveIdentities_bright_1024px-768x768-15.jpg",
  "/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.jpg",
  "/d7f593c3-3bff-421a-88e7-8ff612fa314b-B4E9QSSceGpBz3t8BFFNDQ-output_ff-16.jpg",
  "/photo-1551434678-e076c223a692-10.jpg",
];

const REELS = [
  { src: "/12709382_1920_1080_30fps-39.mp4", poster: "/photo-1506905925346-21bda4d32df4-6.jpg", badge: "Introducing", title: "One studio.\n200+ AI models.", desc: "Generate images, videos, audio, and lip sync. Flux, Midjourney, Sora 2, Kling — one subscription, zero filters." },
  { src: "/2948-1080-28.mp4", poster: "/photo-1547036967-23d11aacaee0-7.jpg", badge: "Video Studio", title: "Cinema-grade\nmotion.", desc: "Sora 2, Kling v3, Veo 3, Runway Gen-3 — 40+ video models. Text-to-video and image-to-video, up to 10s clips, 4K." },
  { src: "/2962-1080-36.mp4", poster: "/260118_RecursiveIdentities_bright_1024px-768x768-15.jpg", badge: "Lip Sync", title: "Perfect\nlip sync.", desc: "Infinite Talk, Wan 2.2, LTX 2.3, LatentSync — 9 lip-sync models. Sync any audio to any face." },
];

function CustomCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const move = (e) => { setPos({ x: e.clientX, y: e.clientY }); };
    const over = (e) => { if (e.target.closest("a, button, [data-cursor]")) setHover(true); };
    const out = (e) => { if (e.target.closest("a, button, [data-cursor]")) setHover(false); };
    window.addEventListener("mousemove", move);
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    return () => { window.removeEventListener("mousemove", move); document.removeEventListener("mouseover", over); document.removeEventListener("mouseout", out); };
  }, []);
  return (
    <div className="cursor" style={{ display: typeof window !== "undefined" && "ontouchstart" in window ? "none" : "block" }}>
      <div className="cursor__dot" style={{ left: pos.x, top: pos.y }} />
      <div className={`cursor__ring ${hover ? "cursor__ring--hover" : ""}`} style={{ left: pos.x, top: pos.y }} />
    </div>
  );
}

function ReelCard({ reel }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().catch(() => {}); setPlaying(true); }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className="relative rounded-2xl overflow-hidden aspect-[4/5] bg-white/[0.02] border border-white/[0.06] group cursor-pointer"
      onClick={toggle}
    >
      <video ref={videoRef} src={reel.src} poster={reel.poster} muted loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-6">
        <span className="badge badge-brand mb-3">{reel.badge}</span>
        <h3 className="text-2xl font-extrabold text-white mb-2 whitespace-pre-line leading-tight">{reel.title}</h3>
        <p className="text-sm text-white/60 mb-4 leading-relaxed">{reel.desc}</p>
        <button className="btn btn-sm btn-primary self-start">
          {playing ? <><FaPause className="text-[10px]" /> Pause</> : <><FaPlay className="text-[10px]" /> Play reel</>}
        </button>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <>
      <CustomCursor />
      <Navbar />

      {/* HERO */}
      <section className="hero">
        <div className="hero__bg">
          <video src="/12709382_1920_1080_30fps-39.mp4" poster="/photo-1506905925346-21bda4d32df4-6.jpg" muted loop playsInline autoPlay />
        </div>
        <div className="hero__vignette" />
        <motion.div className="hero__content" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}>
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            Now shipping — 200+ models
          </div>
          <h1>One studio.<br /><em>Every</em> AI model.</h1>
          <p className="hero__sub">
            Generate images, videos, audio, and lip sync with 200+ state-of-the-art models.
            Flux, Midjourney, Sora 2, Kling, Veo 3 — one subscription, zero filters.
          </p>
          <div className="hero__cta">
            <Link href="/login" className="btn btn-primary btn-lg">Start free →</Link>
            <Link href="/pricing" className="btn btn-secondary btn-lg">View pricing</Link>
          </div>
        </motion.div>
        <div className="hero__scroll">
          <span>Scroll to explore</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
        </div>
      </section>

      {/* SHOWCASE MARQUEE */}
      <section className="showcase">
        <div className="showcase__track">
          {[...SHOWCASE, ...SHOWCASE].map((src, i) => (
            <div key={i} className="showcase__item">
              <img src={src} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* STUDIOS */}
      <section className="section" id="studios">
        <div className="section__head">
          <div className="section__kicker">The Studios</div>
          <h2>Ten studios. <em>One wave.</em></h2>
          <p className="section__sub">Each studio is purpose-built — image, video, audio, cinema, motion, clipping, marketing, lip-sync, body swap, and AI influencer.</p>
        </div>
        <div className="bento">
          {TOOLS.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="bento__item bento__item--span-4"
              >
                <Link href={`/studio/${t.id}`} className="block h-full">
                  <div className="flex items-center justify-between mb-4">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}30` }}>
                      <Icon />
                    </span>
                    <span className="badge" style={{ background: `${t.color}10`, color: t.color, border: `1px solid ${t.color}30` }}>{t.badge}</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: t.color }}>{t.label}</h3>
                  <p className="text-sm text-white/50 leading-relaxed mb-4">{t.desc}</p>
                  <span className="text-xs font-semibold text-white/40 group-hover:text-white transition-colors">Open studio →</span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* REELS */}
      <section className="section" id="reels">
        <div className="section__head">
          <div className="section__kicker">Live Samples</div>
          <h2>Cinema, <em>shipped daily.</em></h2>
          <p className="section__sub">Real outputs from real studios. Click to play.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {REELS.map((r, i) => <ReelCard key={i} reel={r} />)}
        </div>
      </section>

      {/* STATS */}
      <section className="stats">
        {STATS.map((s) => (
          <div key={s.l} className="text-center">
            <div className="stat__num">{s.n}</div>
            <div className="stat__label">{s.l}</div>
          </div>
        ))}
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="section__head">
          <div className="section__kicker">Pricing</div>
          <h2>Drop by drop, an <em>ocean.</em></h2>
          <p className="section__sub">Start free with 10 credits. Subscribe for monthly credits, or top up with one-off packs. Cancel anytime.</p>
        </div>
        <div className="pricing-grid">
          {PRICING.map((p) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5 }}
              className={`pricing-card ${p.popular ? "pricing-card--popular" : ""}`}
            >
              {p.popular && <div className="pricing-card__badge">Most Popular</div>}
              <div className="pricing-card__name">{p.name}</div>
              <div className="pricing-card__price">{p.price}<span>{p.period}</span></div>
              <div className="pricing-card__credits">{p.credits}</div>
              <ul className="pricing-card__features">
                {p.features.map((f) => (
                  <li key={f}><FaCheck />{f}</li>
                ))}
              </ul>
              <Link href="/login" className={`btn w-full justify-center ${p.popular ? "btn-primary" : "btn-secondary"}`}>{p.cta}</Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer__giant">HELMIES</div>
        <h2>Ready to <em>dive in?</em></h2>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/login" className="btn btn-primary btn-lg">Start free →</Link>
          <a href="mailto:info@helmies.fi" className="btn btn-secondary btn-lg">✉ info@helmies.fi</a>
        </div>
        <div className="footer__links">
          <Link href="/studio">Studio</Link>
          <Link href="/models">Models</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </div>
        <div className="footer__bottom">© 2026 Helmies Oy. All rights reserved. Made with ❤ · Lahti, Finland</div>
      </footer>
    </>
  );
}