"use client";

import { useEffect, useState } from "react";
import { IcAlert } from "@/components/studio/kit/Icons";

/* ══════════════════════════════════════════════════════════════════════════
   OFFLINE BANNER
   ──────────────────────────────────────────────────────────────────────────
   Mounted once, globally (src/components/Providers.js), so it reflects real
   connectivity on every page rather than being wired per-surface. Reuses
   the existing `.hs-notice--caution` visual language (system.css) — same
   color/border/padding as every other caution notice in the app — fixed to
   the bottom of the viewport so it never collides with a page's own header
   (Navbar on marketing pages, the studio Shell's sticky `.st-bar`).

   `navigator.onLine` seeds the initial state so a page loaded while already
   offline shows the banner immediately, not only after the next transition.
   ══════════════════════════════════════════════════════════════════════════ */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(typeof navigator !== "undefined" && "onLine" in navigator ? !navigator.onLine : false);

    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="hs-notice hs-notice--caution"
      role="status"
      aria-label="You are offline"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "var(--s-5)",
        transform: "translateX(-50%)",
        zIndex: 500,
        boxShadow: "var(--lift-2)",
      }}
    >
      <IcAlert className="hs-icon-sm" />
      <span>You&rsquo;re offline. Changes may not save until your connection returns.</span>
    </div>
  );
}
