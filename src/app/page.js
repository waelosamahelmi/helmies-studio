"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconMic, IconCrown,
  IconArrowUpRight, IconArrowRight, IconPlay, IconPause, IconCheck, IconBolt, IconMail, IconSparkle,
} from "@/components/Icons";

const TOOLS = [
  { id: "image", label: "Image", desc: "Flux, Midjourney, GPT-4o, Seedream. 55+ photoreal & artistic models.", Icon: IconImage, color: "#FF1B6B", badge: "55+", span: "bento__item--4" },
  { id: "video", label: "Video", desc: "Sora 2, Kling v3, Veo 3, Runway. 40+ text/image/video-to-video models.", Icon: IconVideo, color: "#7C3AED", badge: "40+", span: "bento__item--5" },
  { id: "audio", label: "Audio", desc: "Music, voice synthesis, sound effects. 12 audio models.", Icon: IconMusic, color: "#00E5FF", badge: "12", span: "bento__item--3 hidden lg:block" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls. Lens, focal length, aperture, film format.", Icon: IconCamera, color: "#FF6B35", badge: "4K", span: "bento__item--5" },
  { id: "lipsync", label: "Lip Sync", desc: "Infinite Talk, Wan 2.2, LTX 2.3. 9 lip-sync models.", Icon: IconMic, color: "#FFD166", badge: "9", span: "bento__item--4" },
  { id: "influencer", label: "Influencer", desc: "Build AI personas and influencer avatars from traits.", Icon: IconCrown, color: "#FF6B35", badge: "New", span: "bento__item--3" },
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
  "/assets/warrior_girl_e29532086b-40.webp",
  "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.png",
  "/assets/photo-1506905925346-21bda4d32df4-6.jpg",
  "/assets/photo-1547036967-23d11aacaee0-7.jpg",
  "/assets/260118_RecursiveIdentities_bright_1024px-768x768-15.jpg",
  "/assets/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.jpg",
  "/assets/d7f593c3-3bff-421a-88e7-8ff612fa314b-B4E9QSSceGpBz3t8BFFNDQ-output_ff-16.jpg",
  "/assets/photo-1551434678-e076c223a692-10.jpg",
];

const REELS = [
  { src: "/assets/12709382_1920_1080_30fps-39.mp4", poster: "/assets/photo-1506905925346-21bda4d32df4-6.jpg", badge: "Introducing", title: "One studio.\n200+ AI models.", desc: "Generate images, videos, audio, and lip sync. Flux, Midjourney, Sora 2, Kling. One subscription, zero filters." },
  { src: "/assets/2948-1080-28.mp4", poster: "/assets/photo-1547036967-23d11aacaee0-7.jpg", badge: "Video Studio", title: "Cinema-grade\nmotion.", desc: "Sora 2, Kling v3, Veo 3, Runway Gen-3. 40+ video models. Text-to-video and image-to-video, up to 10s clips, 4K." },
  { src: "/assets/2962-1080-36.mp4", poster: "/assets/260118_RecursiveIdentities_bright_1024px-768x768-15.jpg", badge: "Lip Sync", title: "Perfect\nlip sync.", desc: "Infinite Talk, Wan 2.2, LTX 2.3, LatentSync. 9 lip-sync models. Sync any audio to any face." },
];

const EASE = [0.32, 0.72, 0, 1];

function ReelCard({ reel, index }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const toggle = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().catch(() => {}); setPlaying(true); }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: EASE, delay: index * 0.12 }}
      className="bezel reel"
    >
      <div className="reel__core bezel__core" onClick={toggle}>
        <video ref={videoRef} src={reel.src} poster={reel.poster} muted loop playsInline preload="metadata" />
        <div className="reel__scrim" />
        <div className="reel__play">
          {playing ? <IconPause /> : <IconPlay />}
        </div>
        <div className="reel__body">
          <span className="eyebrow eyebrow--brand mb-4">{reel.badge}</span>
          <h3 className="reel__title">{reel.title}</h3>
          <p className="reel__desc">{reel.desc}</p>
          <button className="btn btn-sm btn-secondary self-start">
            {playing ? "Pause" : "Play reel"}
            <span className="btn__icon">{playing ? <IconPause /> : <IconPlay />}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Navbar />

      {/* FILM GRAIN */}
      <div className="grain" aria-hidden="true" />

      {/* HERO */}
      <section className="hero">
        <div className="hero__bg">
          <video src="/assets/12709382_1920_1080_30fps-39.mp4" poster="/assets/photo-1506905925346-21bda4d32df4-6.jpg" muted loop playsInline autoPlay />
        </div>
        <div className="hero__vignette" />
        <motion.div
          className="hero__content"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
        >
          <div className="eyebrow eyebrow--brand mb-6">
            <span className="eyebrow__dot" />
            Now shipping 200+ models
          </div>
          <h1>One studio.<br /><em>Every</em> AI model.</h1>
          <p className="hero__sub">
            Generate images, videos, audio, and lip sync with 200+ state-of-the-art models.
            Flux, Midjourney, Sora 2, Kling, Veo 3. One subscription, zero filters.
          </p>
          <div className="hero__cta">
            <Link href="/login" className="btn btn-primary btn-lg">
              Start free
              <span className="btn__icon"><IconArrowUpRight /></span>
            </Link>
            <Link href="/pricing" className="btn btn-secondary btn-lg">
              View pricing
              <span className="btn__icon"><IconArrowRight /></span>
            </Link>
          </div>
        </motion.div>
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

      {/* STUDIOS — ASYMMETRICAL BENTO */}
      <section className="section" id="studios">
        <div className="section__head">
          <div className="eyebrow mb-5">The Studios</div>
          <h2>Ten studios. <em>One wave.</em></h2>
          <p className="section__sub">Each studio is purpose-built. Image, video, audio, cinema, motion, clipping, marketing, lip-sync, body swap, and AI influencer.</p>
        </div>
        <div className="bento">
          {TOOLS.map((t, i) => {
            const { Icon, color } = t;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.8, ease: EASE, delay: (i % 3) * 0.08 }}
                className={`bento__item ${t.span}`}
              >
                <Link href={`/studio/${t.id}`} className="tool bezel" style={{ color }}>
                  <div className="tool__core bezel__core">
                    <div className="tool__icon" style={{ background: `${color}10` }}>
                      <Icon />
                    </div>
                    <h3 className="tool__title" style={{ color: "#fff" }}>{t.label}</h3>
                    <p className="tool__desc">{t.desc}</p>
                    <div className="tool__footer">
                      <span className="tool__badge">{t.badge}</span>
                      <span className="tool__arrow"><IconArrowUpRight style={{ color: "#fff" }} /></span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* REELS */}
      <section className="section" id="reels">
        <div className="section__head">
          <h2>Cinema, <em>shipped daily.</em></h2>
          <p className="section__sub">Real outputs from real studios. Click to play.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {REELS.map((r, i) => <ReelCard key={i} reel={r} index={i} />)}
        </div>
      </section>

      {/* STATS */}
      <section className="stats">
        {STATS.map((s, i) => (
          <motion.div
            key={s.l}
            className="stat"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
          >
            <div className="stat__num">{s.n}</div>
            <div className="stat__label">{s.l}</div>
          </motion.div>
        ))}
      </section>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div className="section__head">
          <div className="eyebrow mb-5">Pricing</div>
          <h2>Drop by drop, an <em>ocean.</em></h2>
          <p className="section__sub">Start free with 10 credits. Subscribe for monthly credits, or top up with one-off packs. Cancel anytime.</p>
        </div>
        <div className="pricing-grid">
          {PRICING.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
              className={`bezel price ${p.popular ? "price--popular" : ""}`}
            >
              {p.popular && <div className="price__badge">Most Popular</div>}
              <div className="price__core bezel__core">
                <div className="price__name">{p.name}</div>
                <div className="price__amount">
                  <span className="price__num">{p.price}</span>
                  <span className="price__period">{p.period}</span>
                </div>
                <div className="price__credits">{p.credits}</div>
                <ul className="price__features">
                  {p.features.map((f) => (
                    <li key={f}><IconCheck />{f}</li>
                  ))}
                </ul>
                <Link href="/login" className={`btn ${p.popular ? "btn-primary" : "btn-secondary"}`}>
                  {p.cta}
                  <span className="btn__icon"><IconArrowUpRight /></span>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer__giant">HELMIES</div>
        <h2>Ready to <em>dive in?</em></h2>
        <div className="footer__cta">
          <Link href="/login" className="btn btn-primary btn-lg">
            Start free
            <span className="btn__icon"><IconArrowUpRight /></span>
          </Link>
          <a href="mailto:info@helmies.fi" className="btn btn-secondary btn-lg">
            <IconMail />
            info@helmies.fi
          </a>
        </div>
        <div className="footer__links">
          <Link href="/studio">Studio</Link>
          <Link href="/models">Models</Link>
          <Link href="/gallery">Gallery</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </div>
        <div className="footer__bottom">© 2026 Helmies Oy · Lahti, Finland</div>
      </footer>
    </>
  );
}