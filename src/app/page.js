"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import HeroTitle from "@/components/landing/HeroTitle";
import StrokeTitle from "@/components/landing/StrokeTitle";
import ReelSlider from "@/components/landing/ReelSlider";
import YouTubeEmbed from "@/components/landing/YouTubeEmbed";
import LogoTicker from "@/components/landing/LogoTicker";
import {
  IconArrowUpRight, IconArrowRight, IconPlay, IconPause, IconCheck, IconMail,
} from "@/components/Icons";

const HEADSHOTS = [
  "/assets/warrior_girl_e29532086b-40.webp",
  "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.webp",
  "/assets/photo-1506905925346-21bda4d32df4-6.webp",
  "/assets/photo-1547036967-23d11aacaee0-7.webp",
  "/assets/260118_RecursiveIdentities_bright_1024px-768x768-15.webp",
  "/assets/J6-BrUzggQUXdbktr9GcH_ZYLM1F22-13.webp",
  "/assets/d7f593c3-3bff-421a-88e7-8ff612fa314b-B4E9QSSceGpBz3t8BFFNDQ-output_ff-16.webp",
  "/assets/photo-1551434678-e076c223a692-10.webp",
];

const PRICING_MONTHLY = [
  { name: "Free", price: "€0", period: "/forever", credits: "10 credits/mo", desc: "Try every studio. No card required.", features: ["10 credits monthly", "All 200+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { name: "Starter", price: "€24", period: "/mo", credits: "500 credits/mo", desc: "For testing the waters.", features: ["500 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime"], cta: "Subscribe", popular: false },
  { name: "Studio", price: "€49", period: "/mo", credits: "1500 credits/mo", desc: "For regular creators who ship.", features: ["1500 credits monthly", "All studios unlocked", "4K downloads", "Priority queue"], cta: "Subscribe", popular: true },
  { name: "Pro", price: "€99", period: "/mo", credits: "5000 credits/mo", desc: "Power users and small teams.", features: ["5000 credits monthly", "Priority queue", "Batch exports", "API access"], cta: "Subscribe", popular: false },
];

const PRICING_YEARLY = [
  { name: "Free", price: "€0", period: "/forever", credits: "10 credits/mo", desc: "Try every studio. No card required.", features: ["10 credits monthly", "All 200+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { name: "Starter", price: "€19", period: "/mo", billed: "Billed €228/yr", credits: "500 credits/mo", desc: "For testing the waters.", features: ["500 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime"], cta: "Subscribe", popular: false },
  { name: "Studio", price: "€39", period: "/mo", billed: "Billed €468/yr", credits: "1500 credits/mo", desc: "For regular creators who ship.", features: ["1500 credits monthly", "All studios unlocked", "4K downloads", "Priority queue"], cta: "Subscribe", popular: true },
  { name: "Pro", price: "€79", period: "/mo", billed: "Billed €948/yr", credits: "5000 credits/mo", desc: "Power users and small teams.", features: ["5000 credits monthly", "Priority queue", "Batch exports", "API access"], cta: "Subscribe", popular: false },
];

const VIDEOS = [
  "/assets/2962-1080-36.webm",
  "/assets/2948-1080-28.webm",
  "/assets/12709382_1920_1080_30fps-39.webm",
  "/assets/2963-1080-37.webm",
  "/assets/44047-1080-38.webm",
];

function makeColumns(urls) {
  const cols = [[], [], []];
  urls.forEach((url, i) => { cols[i % 3].push(url); });
  return cols;
}

const SECTIONS = [
  {
    id: "image",
    kicker: "Image Studio",
    title: (
      <>
        32 models.
        <br />
        <em>One prompt.</em>
      </>
    ),
    desc: "Flux, Midjourney, GPT-4o, Seedream. From a single line of text, a portrait emerges. Photorealistic, artistic, editorial.",
    pills: ["Flux", "Midjourney", "GPT-4o", "Seedream", "SDXL"],
    accent: "#FF1B6B",
    bg: "/assets/ai_cinematic_video_generator_hero_image_0f96f59168-41.webp",
    bgClass: "svc-section__bg--flip",
    hasReels: true,
  },
  {
    id: "video",
    kicker: "Video Studio",
    title: (
      <>
        Cinema-grade
        <br />
        <em>motion.</em>
      </>
    ),
    desc: "Sora 2, Kling v3, Veo 3, Runway. 17 video models. Text-to-video, image-to-video. 4K cinematic footage.",
    pills: ["Sora 2", "Kling v3", "Veo 3", "Runway", "Wan 2.6"],
    accent: "#FF1B6B",
    bg: "/assets/warrior_girl_e29532086b-40.webp",
    bgClass: "svc-section__bg--zoom-left",
    reverse: false,
    hasReels: false,
  },
  {
    id: "lipsync",
    kicker: "Lip Sync Studio",
    title: (
      <>
        Any face.
        <br />
        <em>Any voice.</em>
      </>
    ),
    desc: "9 lip-sync models. Upload a portrait, add audio. Talking videos in seconds.",
    pills: ["Infinite Talk", "Wan 2.2", "LTX 2.3", "LatentSync"],
    accent: "#FF1B6B",
    bg: "/assets/photo-1620121692029-d088224ddc74-11.webp",
    bgClass: "svc-section__bg--dark",
    hasYouTube: true,
    youtubeId: "_PJ78LYq-FA",
  },
  {
    id: "pricing",
    kicker: "Pricing",
    title: (
      <>
        Create more.
        <br />
        <em>Pay less.</em>
      </>
    ),
    desc: "Monthly subscriptions or one-off credits. Start free, scale when you're ready.",
    accent: "#FF1B6B",
    bgVideo: "/assets/o1j748qoxsqdhvrksh5qw2twaoyr-25.webm",
    reverse: false,
    isPricing: true,
  },
];

/* ── Intersection observer hook ── */
function useInView(ref, margin = "-100px") {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { rootMargin: margin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, margin]);
  return visible;
}

/* ── HERO ── */
function HeroSection() {
  return (
    <section className="hero">
      <div className="hero__bg">
        <video
          src="/assets/12709382_1920_1080_30fps-39.webm"
          poster="/assets/photo-1506905925346-21bda4d32df4-6.webp"
          muted loop playsInline autoPlay
        />
      </div>

      <div className="hero__content">
        <HeroTitle
          image="/assets/warrior_girl_e29532086b-40.webp"
          line1=" models."
          line2="studio."
          line1AccentImg="/assets/200.webp"
          accent="One "
        />

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
      </div>
    </section>
  );
}

/* ── FULL-SCREEN SERVICE SECTION ── */
function ServiceSection({ section, index }) {
  const ref = useRef(null);
  const cardsRef = useRef(null);
  const visible = useInView(ref, "-80px");
  const layoutReverse = section.reverse ?? (index % 2 !== 0);
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: false });
  const [yearly, setYearly] = useState(false);
  const pricing = yearly ? PRICING_YEARLY : PRICING_MONTHLY;

  const checkScroll = () => {
    const el = cardsRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 10;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
    setScrollState({ atStart, atEnd });
  };

  const dragRef = useRef({ isDragging: false, startX: 0, scrollLeft: 0 });
  const handlersRef = useRef({});

  handlersRef.current.onDragStart = (e) => {
    const el = cardsRef.current;
    if (!el) return;
    dragRef.current.isDragging = true;
    dragRef.current.startX = (e.touches ? e.touches[0].clientX : e.clientX) - el.offsetLeft;
    dragRef.current.scrollLeft = el.scrollLeft;
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  };

  handlersRef.current.onDragMove = (e) => {
    if (!dragRef.current.isDragging) return;
    e.preventDefault();
    const el = cardsRef.current;
    if (!el) return;
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - el.offsetLeft;
    const walk = (x - dragRef.current.startX) * 1.5;
    el.scrollLeft = dragRef.current.scrollLeft - walk;
  };

  handlersRef.current.onDragEnd = () => {
    dragRef.current.isDragging = false;
    const el = cardsRef.current;
    if (el) {
      el.style.cursor = "";
      el.style.userSelect = "";
    }
  };

  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;
    checkScroll();
    const timer = setTimeout(checkScroll, 100);

    const dragStart = (e) => handlersRef.current.onDragStart(e);
    const dragMove = (e) => handlersRef.current.onDragMove(e);
    const dragEnd = () => handlersRef.current.onDragEnd();

    el.addEventListener("scroll", checkScroll, { passive: true });
    el.addEventListener("mousedown", dragStart);
    el.addEventListener("touchstart", dragStart, { passive: true });
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("touchmove", dragMove, { passive: false });
    window.addEventListener("mouseup", dragEnd);
    window.addEventListener("touchend", dragEnd);
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", checkScroll);
      el.removeEventListener("mousedown", dragStart);
      el.removeEventListener("touchstart", dragStart);
      window.removeEventListener("mousemove", dragMove);
      window.removeEventListener("touchmove", dragMove);
      window.removeEventListener("mouseup", dragEnd);
      window.removeEventListener("touchend", dragEnd);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scrollCards = (dir) => {
    cardsRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <section ref={ref} className="svc-section">
      {/* Background */}
      <div className={`svc-section__bg ${section.bgClass || ""}`}>
        {section.bgVideo ? (
          <video src={section.bgVideo} muted loop playsInline autoPlay />
        ) : (
          <img src={section.bg} alt="" />
        )}
        <div className="svc-section__scrim" />
      </div>

      {/* Content */}
      <div className={`svc-section__inner ${visible ? "svc-section__inner--visible" : ""}`}>
          <div className={`svc-layout ${layoutReverse ? "svc-layout--reverse" : ""}`}>
          {/* Text */}
          <div className="svc-text">
            <div className="svc-kicker" style={{ color: section.accent }}>
              {section.kicker}
            </div>
            <StrokeTitle className="svc-title-wrap" bgImage={section.bg}>
              <h2 className="svc-title">{section.title}</h2>
            </StrokeTitle>
            <p className="svc-desc">{section.desc}</p>
            {section.pills && (
              <div className="svc-pills">
                {section.pills.map((p) => (
                  <span key={p} className="svc-pill">{p}</span>
                ))}
              </div>
            )}
            {!section.isPricing && (
              <Link href={`/studio/${section.id}`} className="btn btn-primary mt-8 inline-flex">
                Open {section.id} studio
                <span className="btn__icon"><IconArrowUpRight /></span>
              </Link>
            )}
          </div>

          {/* Media */}
          <div className="svc-media">
            {section.isPricing ? (
              <div className={`pricing-wrap ${!scrollState.atEnd ? "pricing-wrap--has-more" : ""} ${!scrollState.atStart ? "pricing-wrap--scrolled" : ""} ${scrollState.atEnd ? "pricing-wrap--at-end" : ""}`}>
                <div className="pricing-toggle">
                  <span className={`pricing-toggle__label ${!yearly ? "pricing-toggle__label--active" : ""}`}>Monthly</span>
                  <button className={`pricing-toggle__switch ${yearly ? "pricing-toggle__switch--on" : ""}`} onClick={() => setYearly(!yearly)}>
                    <span className="pricing-toggle__knob" />
                  </button>
                  <span className={`pricing-toggle__label ${yearly ? "pricing-toggle__label--active" : ""}`}>Yearly <span className="pricing-toggle__badge">-20%</span></span>
                </div>
                <div className="pricing-scroll-track">
                  {!scrollState.atStart && (
                    <button className="pricing-scroll-btn pricing-scroll-btn--left" onClick={() => scrollCards(-1)}>
                      <IconArrowRight style={{ transform: "scaleX(-1)" }} />
                    </button>
                  )}
                  <div className="pricing-cards" ref={cardsRef}>
                    {pricing.map((plan) => (
                    <div key={plan.name} className={`pricing-card ${plan.popular ? "pricing-card--popular" : ""}`}>
                      {plan.popular && <div className="pricing-card__badge">Most popular</div>}
                      <div className="pricing-card__name">{plan.name}</div>
                      <div className="pricing-card__price">{plan.price}<span className="pricing-card__period">{plan.period}</span></div>
                      {plan.billed && <div className="pricing-card__billed">{plan.billed}</div>}
                      <div className="pricing-card__credits">{plan.credits}</div>
                      <div className="pricing-card__desc">{plan.desc}</div>
                      <ul className="pricing-card__features">
                        {plan.features.map((f) => (
                          <li key={f}><IconCheck />{f}</li>
                        ))}
                      </ul>
                      <Link href="/pricing" className={`btn ${plan.popular ? "btn-primary" : "btn-secondary"} btn-lg pricing-card__cta`}>
                        {plan.cta}
                        <span className="btn__icon"><IconArrowUpRight /></span>
                      </Link>
                    </div>
                  ))}
                </div>
                {!scrollState.atEnd && (
                  <button className="pricing-scroll-btn pricing-scroll-btn--right" onClick={() => scrollCards(1)}>
                    <IconArrowRight />
                  </button>
                )}
                </div>
              </div>
            ) : (
              <>
                {section.hasYouTube && (
                  <div className="svc-youtube">
                    <YouTubeEmbed videoId={section.youtubeId} />
                  </div>
                )}
                {section.hasReels && (
                  <div className="svc-reels">
                    <ReelSlider
                      columns={makeColumns(section.useVideos ? VIDEOS : HEADSHOTS)}
                      speed={0.3}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── STATS ── */
const STATS = [
  { n: "200+", l: "AI models" },
  { n: "10", l: "studios" },
  { n: "1", l: "subscription" },
  { n: "0", l: "content filters" },
];

function StatsSection() {
  const ref = useRef(null);
  const visible = useInView(ref);
  return (
    <section ref={ref} className={`stats ${visible ? "stats--visible" : ""}`}>
      {STATS.map((s, i) => (
        <div key={s.l} className="stat" style={{ transitionDelay: `${i * 0.08}s` }}>
          <div className="stat__num">{s.n}</div>
          <div className="stat__label">{s.l}</div>
        </div>
      ))}
    </section>
  );
}

/* ── FOOTER ── */
function FooterSection() {
  return (
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
  );
}

/* ── ANNOUNCEMENT BAR ── */
function AnnouncementBar() {
  return (
    <div className="announcement-bar">
      <div className="announcement-bar__inner">
        <span>New: 200+ models now live. Sora 2, Kling v3, and more.</span>
      </div>
    </div>
  );
}

/* ── MAIN ── */
export default function LandingPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <div className="grain" aria-hidden="true" />
      <div className="snap-container">
        <HeroSection />
        {SECTIONS.map((s, i) => (
          <ServiceSection key={s.id} section={s} index={i} />
        ))}
        <StatsSection />
      </div>
      <FooterSection />
      <LogoTicker />
    </>
  );
}
