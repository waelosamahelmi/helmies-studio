"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconImage, IconVideo, IconMusic, IconCamera, IconFilm, IconCut,
  IconMegaphone, IconMic, IconUsers, IconCrown, IconArrowUpRight, IconMenu, IconClose, IconBolt,
} from "@/components/Icons";

const TOOLS = [
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", Icon: IconImage, color: "#FF1B6B" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", Icon: IconVideo, color: "#7C3AED" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", Icon: IconMusic, color: "#00E5FF" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls", Icon: IconCamera, color: "#FF6B35" },
  { id: "vibe-motion", label: "Motion", desc: "Motion graphics & remix", Icon: IconFilm, color: "#FFD166" },
  { id: "clipping", label: "Clipping", desc: "AI highlight extraction", Icon: IconCut, color: "#00E68A" },
  { id: "marketing", label: "Marketing", desc: "UGC video ads & product shots", Icon: IconMegaphone, color: "#FF1B6B" },
  { id: "lipsync", label: "Lip Sync", desc: "Sync audio to portrait or video", Icon: IconMic, color: "#7C3AED" },
  { id: "body-swap", label: "Body Swap", desc: "Recast faces into any scene", Icon: IconUsers, color: "#00E5FF" },
  { id: "influencer", label: "Influencer", desc: "Build AI personas", Icon: IconCrown, color: "#FF6B35" },
];

const NAV_LINKS = [
  { name: "Studio", href: "/studio" },
  { name: "Models", href: "/models" },
  { name: "Gallery", href: "/gallery" },
  { name: "Pricing", href: "/pricing" },
];

const EASE = [0.32, 0.72, 0, 1];

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [session, setSession] = useState(null);
  const megaRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    fetch("/api/auth/session").then((r) => r.json()).then(setSession).catch(() => {});
  }, [pathname]);

  const isAdmin = session?.user?.role === "admin";
  const isAuthed = !!session?.user;

  useEffect(() => {
    const handler = (e) => { if (megaRef.current && !megaRef.current.contains(e.target)) setMegaOpen(false); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    setMegaOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <nav className={`nav ${scrolled ? "nav--scrolled" : ""}`} ref={megaRef}>
        <div className="nav__inner">
          {!pathname?.startsWith("/studio") ? (
            <Link href="/" className="nav__logo" aria-label="Helmies Studio home">
              <img src="/ico.svg" alt="" className="nav__logo-mark" />
              <span className="nav__logo-text">Studio</span>
            </Link>
          ) : (
            <span className="nav__logo-spacer" aria-hidden="true" />
          )}

          <div className="nav__links">
            <div className="relative" onMouseEnter={() => setMegaOpen(true)}>
              <button
                className={`nav__link ${pathname?.startsWith("/studio") ? "nav__link--active" : ""}`}
                onClick={() => setMegaOpen((v) => !v)}
              >
                Studio
              </button>
              <AnimatePresence>
                {megaOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="nav__mega"
                    onMouseLeave={() => setMegaOpen(false)}
                  >
                    <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/10 px-3">
                      <div>
                        <h3 className="text-base font-bold tracking-tight">10 Helmies Studios</h3>
                        <p className="text-[11px] text-white/40 mt-1">One subscription. Every studio. Zero filters.</p>
                      </div>
                      <Link href="/studio" className="btn btn-sm btn-primary">
                        Open Studio
                        <span className="btn__icon"><IconArrowUpRight /></span>
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-1 px-1">
                      {TOOLS.map(({ id, label, desc, Icon, color }) => (
                        <Link
                          key={id}
                          href={`/studio/${id}`}
                          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors duration-500"
                          style={{ transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)" }}
                        >
                          <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${color}12`, color, border: `1px solid ${color}28` }}
                          >
                            <Icon />
                          </span>
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-white truncate">{label}</div>
                            <div className="text-[11px] text-white/40 truncate">{desc}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {NAV_LINKS.slice(1).map((l) => (
              <Link
                key={l.name}
                href={l.href}
                className={`nav__link ${pathname === l.href ? "nav__link--active" : ""}`}
              >
                {l.name}
              </Link>
            ))}
          </div>

          <div className="nav__actions">
            {isAdmin && (
              <Link href="/admin" className="nav__link hidden md:inline-flex" style={{ color: "#FF1B6B" }}>
                Admin
              </Link>
            )}
            {isAuthed ? (
              <Link href="/studio" className="btn btn-sm btn-primary hidden md:inline-flex">
                Studio
                <span className="btn__icon"><IconBolt /></span>
              </Link>
            ) : (
              <>
                <Link href="/login" className="nav__link hidden md:inline-flex">Sign In</Link>
                <Link href="/login" className="btn btn-sm btn-primary hidden md:inline-flex">
                  Start free
                  <span className="btn__icon"><IconBolt /></span>
                </Link>
              </>
            )}
            <button
              className="nav__burger md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile slide-up sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="nav__backdrop md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="nav__sheet md:hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.45, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="nav__sheet-handle" />
              <div className="nav__sheet-close" onClick={() => setMobileOpen(false)}>
                <IconClose />
              </div>
              <div className="nav__sheet-content">
                {NAV_LINKS.map((l, i) => (
                  <motion.div
                    key={l.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, ease: EASE, delay: 0.05 * i + 0.15 }}
                  >
                    <Link href={l.href} className="nav__sheet-link" onClick={() => setMobileOpen(false)}>
                      {l.name}
                      <IconArrowUpRight />
                    </Link>
                  </motion.div>
                ))}
                <div className="nav__sheet-divider" />
                <div className="nav__sheet-studios">
                  <p className="nav__sheet-label">Studios</p>
                  <div className="nav__sheet-grid">
                    {TOOLS.map(({ id, label, Icon, color }) => (
                      <Link
                        key={id}
                        href={`/studio/${id}`}
                        className="nav__studio-chip"
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className="nav__studio-icon" style={{ background: `${color}18`, color }}>
                          <Icon />
                        </span>
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
                <Link href="/login" className="btn btn-primary btn-lg w-full justify-center mt-6" onClick={() => setMobileOpen(false)}>
                  Start free
                  <span className="btn__icon"><IconBolt /></span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}