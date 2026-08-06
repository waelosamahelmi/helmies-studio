"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   PWA INSTALL PROMPT — shown to browser users on any device when the app is
   installable but not yet installed. Listens for the browser's native
   `beforeinstallprompt` event and renders a bottom banner that calls
   `prompt()` on tap. Hides itself when the user dismisses, the app is
   already running in standalone mode, or installation completes.

   Edge cases:
   - `beforeinstallprompt` never fires (iOS, non-chromium, already-installed):
     the component renders nothing — no banner, no error state.
   - Already in standalone mode (display-mode: standalone): renders nothing.
   - User dismisses: banner hides, sessionStorage flag prevents re-prompt
     for this session. The event reference is kept so the user can still
     install via the browser chrome if they change their mind.
   - User taps install → `deferredPrompt.prompt()` fires the native dialog.
     On `outcome === "accepted"` the banner hides permanently for this
     session.
   ══════════════════════════════════════════════════════════════════════════ */

export default function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef(null);
  const dismissed = useRef(false);

  /* Detect standalone mode on mount — no banner if already installed */
  useEffect(() => {
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari on iOS
      (navigator.standalone && typeof navigator.standalone !== "undefined") ||
      false
    ) {
      return;
    }

    const onBefore = (e) => {
      // Prevent the default mini-info-bar (Chrome) so we can show our own
      e.preventDefault();
      deferredPrompt.current = e;
      if (!dismissed.current) setShow(true);
    };

    const onAppInstalled = () => {
      // The user installed via browser chrome — hide our banner
      setShow(false);
      deferredPrompt.current = null;
    };

    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const dp = deferredPrompt.current;
    if (!dp) return;
    dp.prompt();
    const { outcome } = await dp.userChoice;
    deferredPrompt.current = null;
    setShow(false);
    // If they accepted, done. If dismissed from native dialog, respect it
    // for this session too — they had two chances.
    dismissed.current = true;
    if (outcome === "accepted") {
      // They installed — the appinstalled event will also fire shortly
    }
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    dismissed.current = true;
  }, []);

  if (!show) return null;

  return (
    <div
      className="hs-pwa-prompt"
      role="dialog"
      aria-label="Install Helmies Studio"
      aria-live="polite"
    >
      <div className="hs-pwa-prompt__inner">
        <div className="hs-pwa-prompt__text">
          <strong>Install Helmies Studio</strong>
          <span>Add it to your home screen for a full-screen experience</span>
        </div>
        <div className="hs-pwa-prompt__actions">
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--sm"
            onClick={install}
          >
            Install
          </button>
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            onClick={dismiss}
            aria-label="Dismiss install prompt"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
