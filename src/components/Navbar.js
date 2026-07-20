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
          {!pathname?.startsWith("/studio") && (
            <Link href="/" className="nav__logo" aria-label="Helmies Studio home">
              <img src="/ico.svg" alt="" className="nav__logo-mark" />
              <span className="nav__logo-text">Studio</span>
            </Link>
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

      {/* Full-screen overlay with staggered mask reveal (§5A) */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="nav__overlay md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <button
              className="absolute top-6 right-6 w-11 h-11 rounded-full flex items-center justify-center bg-white/5 border border-white/10"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <IconClose />
            </button>
            <div className="flex flex-col gap-2 max-w-md w-full mx-auto">
              {NAV_LINKS.map((l, i) => (
                <motion.div
                  key={l.name}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 40 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.08 * i + 0.1 }}
                >
                  <Link href={l.href} className="nav__overlay-link">{l.name}</Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.6, ease: EASE, delay: 0.08 * NAV_LINKS.length + 0.1 }}
                className="mt-8"
              >
                <Link href="/login" className="btn btn-primary btn-lg w-full justify-center">
                  Start free
                  <span className="btn__icon"><IconBolt /></span>
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}