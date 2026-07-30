"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { IconSearch, IconSettings } from "@/components/Icons";
import "@/styles/studio-v6.css";

/* ── Enhanced page transition: blur + scale + opacity ── */
const pageTransition = {
  initial: { opacity: 0, filter: "blur(6px)", scale: 0.985 },
  animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
  exit:    { opacity: 0, filter: "blur(6px)", scale: 0.985 },
};

/* ── Animated credit counter ── */
function AnimatedCredits({ credits }) {
  const prevRef = useRef(credits);
  const motionVal = useMotionValue(credits ?? 0);
  const springVal = useSpring(motionVal, { stiffness: 120, damping: 18 });
  const rounded = useTransform(springVal, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(credits ?? 0);
  const [flash, setFlash] = useState(null); // "up" | "down" | null

  useEffect(() => {
    const prev = prevRef.current;
    const next = credits;
    prevRef.current = next;

    if (prev == null || next == null) {
      motionVal.set(next ?? 0);
      return;
    }
    if (prev === next) return;

    // Animate the number
    const controls = animate(prev, next, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => motionVal.set(v),
    });

    // Flash color
    setFlash(next > prev ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 1200);

    return () => {
      controls.stop();
      clearTimeout(timer);
    };
  }, [credits, motionVal]);

  // Keep displayValue in sync for initial render
  useEffect(() => {
    const unsub = rounded.on("change", (v) => setDisplayValue(v));
    return unsub;
  }, [rounded]);

  const flashClass = flash === "up" ? " v6-credit-up" : flash === "down" ? " v6-credit-down" : "";

  return (
    <Link
      href="/settings?tab=billing"
      className={`v6-universe-credit${flashClass}`}
    >
      <i />
      <motion.span>{displayValue}</motion.span>
    </Link>
  );
}

/* ── Connection status dot ── */
function ConnectionDot() {
  const [status, setStatus] = useState("connected"); // "connected" | "syncing" | "disconnected"

  useEffect(() => {
    // Listen for online/offline
    const goOnline  = () => setStatus("connected");
    const goOffline = () => setStatus("disconnected");

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Also poll for fetch-based status every 30s
    let timer;
    const check = async () => {
      try {
        const res = await fetch("/api/credits", { method: "HEAD", signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error("bad");
        setStatus((prev) => (prev === "disconnected" ? "connected" : prev));
      } catch {
        setStatus("disconnected");
      }
    };
    check();
    timer = setInterval(check, 30000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, []);

  return (
    <span
      className={`v6-connection-dot v6-${status}`}
      title={status === "connected" ? "Connected" : status === "syncing" ? "Syncing..." : "Offline"}
      aria-label={`Connection status: ${status}`}
    />
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function UniverseShell({
  children,
  orbit,
  recents,
  onCommand,
  credits,
  pendingCount,
}) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [orbitSpeed, setOrbitSpeed] = useState(1);

  /* Cycle orbit speed when generating / idle (visual flair) */
  const cycleOrbitSpeed = useCallback(() => {
    setOrbitSpeed((s) => (s >= 3 ? 1 : s + 1));
  }, []);

  /* Expand search on Ctrl+K detected externally */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        setSearchExpanded(true);
        setTimeout(() => setSearchExpanded(false), 2000);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="v6-app">
      <div className={`v6-universe-shell v6-orbit-speed-${orbitSpeed}`}>

        {/* ── Topbar ── */}
        <header className="v6-universe-topbar">
          <Link href="/" className="v6-universe-brand" title="Helmies Studio — Home">
            <img src="/ico.svg" alt="" />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>

          <button
            className={`v6-universe-search${searchExpanded ? " v6-expanded" : ""}`}
            onClick={() => {
              setSearchExpanded(true);
              onCommand?.();
              setTimeout(() => setSearchExpanded(false), 3000);
            }}
            aria-label="Open command palette (Ctrl+K)"
            data-tooltip="Search instruments, models & settings"
          >
            <IconSearch className="v6-icon" />
            <span>Ask Helmies or launch any creative instrument</span>
            <kbd>Ctrl K</kbd>
          </button>

          <div className="v6-universe-topbar-actions">
            {/* Connection status */}
            <ConnectionDot />

            {/* Credit counter with animation */}
            <AnimatedCredits credits={credits} />

            {pendingCount > 0 && (
              <Link
                href="/gallery"
                className="v6-universe-live"
                title={`${pendingCount} generation${pendingCount !== 1 ? "s" : ""} in progress`}
              >
                <i />
                {pendingCount} running
              </Link>
            )}

            <Link
              href="/settings"
              className="v6-btn v6-icon-only v6-sm v6-tooltip"
              aria-label="Account settings"
              data-tooltip="Settings"
            >
              <IconSettings className="v6-icon" />
            </Link>
          </div>
        </header>

        {/* ── Orbit Navigation ── */}
        {orbit && (
          <nav className="v6-universe-orbit" onClick={cycleOrbitSpeed}>
            {orbit}
          </nav>
        )}

        {/* ── Main Page Area ── */}
        <main className={`v6-universe-page${!orbit ? " v6-full" : ""}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={typeof window !== "undefined" ? window.location.pathname : "page"}
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
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
