"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import {
  IconBolt, IconSparkle, IconArrowUpRight, IconClose, IconMenu, IconSettings,
} from "@/components/Icons";

const NAV = [
  { href: "/studio", label: "Studio", desc: "Create" },
  { href: "/gallery", label: "Gallery", desc: "History" },
  { href: "/models", label: "Models", desc: "Catalog" },
  { href: "/pricing", label: "Pricing", desc: "Plans" },
];

export default function UniverseNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [credits, setCredits] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (session?.user) {
      fetch("/api/credits")
        .then((r) => r.json())
        .then((d) => setCredits(d.credits))
        .catch(() => {});
    }
  }, [session]);

  return (
    <>
      <nav className="universe-nav">
        <div className="universe-nav__brand">
          <Link href="/">
            <img src="/helmies-icon.svg" alt="" />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>
        </div>

        <div className="universe-nav__links">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : ""}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="universe-nav__actions">
          {session?.user ? (
            <>
              <Link href="/settings" className="universe-nav__credits" title={`${credits ?? "..."} credits`}>
                <IconBolt />
                {credits != null ? credits : "..."}
              </Link>
              <Link href="/settings" className={`universe-nav__icon-btn ${pathname === "/settings" ? "is-active" : ""}`} title="Settings">
                <IconSettings />
              </Link>
              {session.user.role === "admin" && (
                <Link href="/admin" className={`universe-nav__icon-btn ${pathname === "/admin" ? "is-active" : ""}`} title="Admin">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </Link>
              )}
              <Link href="/studio" className="universe-nav__cta">
                Studio <IconArrowUpRight />
              </Link>
            </>
          ) : (
            <Link href="/login" className="universe-nav__cta">
              Sign In <IconArrowUpRight />
            </Link>
          )}

          <button className="universe-nav__burger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <IconMenu />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="universe-nav__mobile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="universe-nav__mobile-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
            >
              <div className="universe-nav__mobile-head">
                <span>Navigation</span>
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
                  <IconClose />
                </button>
              </div>
              <div className="universe-nav__mobile-links">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                  >
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </Link>
                ))}
              </div>
              <div className="universe-nav__mobile-extra">
                {session?.user ? (
                  <>
                    <Link href="/settings" onClick={() => setMenuOpen(false)}>
                      <strong>Settings</strong>
                      <small>Account & keys</small>
                    </Link>
                    {session.user.role === "admin" && (
                      <Link href="/admin" onClick={() => setMenuOpen(false)}>
                        <strong>Admin</strong>
                        <small>Management</small>
                      </Link>
                    )}
                    <Link href="/api/auth/signout" onClick={() => setMenuOpen(false)}>
                      <strong>Sign Out</strong>
                      <small>{session.user.email}</small>
                    </Link>
                  </>
                ) : (
                  <Link href="/login" onClick={() => setMenuOpen(false)}>
                    <strong>Sign In</strong>
                    <small>Access your account</small>
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
