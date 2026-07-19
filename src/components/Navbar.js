"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FaImage, FaVideo, FaMusic, FaCameraRetro, FaFilm, FaCut, FaBullhorn, FaMicrophone, FaUserFriends, FaCrown, FaBolt, FaArrowRight } from "react-icons/fa";

const TOOLS = [
  { id: "image", label: "Image", desc: "Text-to-image & image-to-image", icon: FaImage, color: "#FF1B6B" },
  { id: "video", label: "Video", desc: "Text, image & video-to-video", icon: FaVideo, color: "#7C3AED" },
  { id: "audio", label: "Audio", desc: "Music, voice & sound effects", icon: FaMusic, color: "#00E5FF" },
  { id: "cinema", label: "Cinema", desc: "Cinematic camera controls", icon: FaCameraRetro, color: "#FF6B35" },
  { id: "vibe-motion", label: "Motion", desc: "Motion graphics & remix", icon: FaFilm, color: "#FFD166" },
  { id: "clipping", label: "Clipping", desc: "AI highlight extraction", icon: FaCut, color: "#00E68A" },
  { id: "marketing", label: "Marketing", desc: "UGC video ads & product shots", icon: FaBullhorn, color: "#FF1B6B" },
  { id: "lipsync", label: "Lip Sync", desc: "Sync audio to portrait or video", icon: FaMicrophone, color: "#7C3AED" },
  { id: "body-swap", label: "Body Swap", desc: "Recast faces into any scene", icon: FaUserFriends, color: "#00E5FF" },
  { id: "influencer", label: "Influencer", desc: "Build AI personas", icon: FaCrown, color: "#FF6B35" },
];

const NAV_LINKS = [
  { name: "Studio", href: "/studio" },
  { name: "Models", href: "/models" },
  { name: "Gallery", href: "/gallery" },
  { name: "Pricing", href: "/pricing" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (megaRef.current && !megaRef.current.contains(e.target)) setMegaOpen(false); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  useEffect(() => { setMegaOpen(false); setMobileOpen(false); }, [pathname]);

  return (
    <nav className={`nav ${scrolled ? "nav--scrolled" : ""}`} ref={megaRef}>
      <div className="nav__inner">
        <Link href="/" className="nav__logo">
          <img src="/helmies-mark.svg" alt="Helmies" className="h-7" />
          <span className="text-lg font-extrabold tracking-tight text-white">Helmies</span>
        </Link>

        <div className="nav__links">
          <div className="relative" onMouseEnter={() => setMegaOpen(true)}>
            <Link href="/studio" className={`nav__link ${pathname?.startsWith("/studio") ? "nav__link--active" : ""}`}>
              Studio
            </Link>
            <AnimatePresence>
              {megaOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute top-full left-0 mt-2 w-[720px] p-6 rounded-2xl glass-heavy shadow-2xl"
                  onMouseLeave={() => setMegaOpen(false)}
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
                    <div>
                      <h3 className="text-sm font-bold text-white">10 Helmies Studios</h3>
                      <p className="text-[11px] text-white/40 mt-0.5">One subscription. Every studio. Zero filters.</p>
                    </div>
                    <Link href="/studio" className="btn btn-sm btn-primary">Open Studio →</Link>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {TOOLS.map((t) => {
                      const Icon = t.icon;
                      return (
                        <Link key={t.id} href={`/studio/${t.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.04] transition-colors">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}30` }}>
                            <Icon />
                          </span>
                          <div>
                            <div className="text-[13px] font-semibold text-white">{t.label}</div>
                            <div className="text-[11px] text-white/40">{t.desc}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {NAV_LINKS.slice(1).map((l) => (
            <Link key={l.name} href={l.href} className={`nav__link ${pathname === l.href ? "nav__link--active" : ""}`}>
              {l.name}
            </Link>
          ))}
        </div>

        <div className="nav__actions">
          <Link href="/login" className="btn btn-sm btn-secondary">Sign In</Link>
          <Link href="/login" className="btn btn-sm btn-primary">Start free</Link>
          <button className="md:hidden p-2 text-white/70 hover:text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="md:hidden glass-heavy border-t border-white/[0.06]">
            <div className="p-4 flex flex-col gap-2">
              {NAV_LINKS.map((l) => (
                <Link key={l.name} href={l.href} className="p-3 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/[0.04]">{l.name}</Link>
              ))}
              <Link href="/login" className="btn btn-primary w-full mt-2">Start free</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}