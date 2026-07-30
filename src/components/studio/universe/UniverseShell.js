"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { IconSearch, IconSettings } from "@/components/Icons";
import "@/styles/studio-v6.css";

const pageTransition = {
  initial: { opacity: 0, filter: "blur(4px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(4px)" },
};

export default function UniverseShell({
  children,
  orbit,
  recents,
  onCommand,
  credits,
  pendingCount,
}) {
  return (
    <div className="v6-app">
      <div className="v6-universe-shell">

        {/* ── Topbar ── */}
        <header className="v6-universe-topbar">
          <Link href="/" className="v6-universe-brand">
            <img src="/ico.svg" alt="" />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>

          <button
            className="v6-universe-search"
            onClick={onCommand}
            aria-label="Open command palette"
          >
            <IconSearch className="v6-icon" />
            <span>Ask Helmies or launch any creative instrument</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="v6-universe-topbar-actions">
            <Link href="/settings?tab=billing" className="v6-universe-credit">
              <i />
              {credits ?? "\u2026"}
            </Link>

            {pendingCount > 0 && (
              <Link href="/gallery" className="v6-universe-live">
                <i />
                {pendingCount} running
              </Link>
            )}

            <Link
              href="/settings"
              className="v6-btn v6-icon-only v6-sm"
              aria-label="Account settings"
            >
              <IconSettings className="v6-icon" />
            </Link>
          </div>
        </header>

        {/* ── Orbit Navigation ── */}
        {orbit && <nav className="v6-universe-orbit">{orbit}</nav>}

        {/* ── Main Page Area ── */}
        <main className={`v6-universe-page${!orbit ? " v6-full" : ""}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={typeof window !== "undefined" ? window.location.pathname : "page"}
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ height: "100%" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Recent Constellation ── */}
        {recents && <div className="v6-universe-recents">{recents}</div>}
      </div>
    </div>
  );
}
