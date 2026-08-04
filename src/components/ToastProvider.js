"use client";

/* ══════════════════════════════════════════════════════════════════════════
   TOASTS
   ──────────────────────────────────────────────────────────────────────────
   EDITSv1 E7.5. This provider is mounted globally (Providers.js) and is the
   only thing that reports a finished generation while you are somewhere
   else in the studio — but it rendered `.toast-container` / `.toast` /
   `.toast__close`, classes that exist ONLY in src/styles/globals.css, which
   src/app/page.js imports and no other page does. Every toast in the app
   therefore rendered completely unstyled and in normal document flow,
   shoving the page down instead of floating over it. Meanwhile system.css
   carried a fully tokenised `.hs-toasts` / `.hs-toast` stack — with a
   mobile rule lifting it clear of the bottom dock — that nothing used.

   One system now: this renders the `.hs-*` classes, so the toasts are
   styled on every page and land above the dock on a phone. The landing-only
   `.toast*` rules in globals.css are left alone; that file is off-limits
   and nothing renders those class names any more.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconClose } from "@/components/Icons";

const ToastContext = createContext(null);
const EASE = [0.32, 0.72, 0, 1];

let toastId = 0;

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 5000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notifyGeneration = useCallback((tool, url) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message: `Your ${tool} is ready!`, type: "success", url, isGeneration: true }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 15000);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, notifyGeneration }}>
      {children}
      <div className="hs-toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`hs-toast hs-toast--${t.type}`}
              initial={{ opacity: 0, y: 50, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {t.isGeneration && t.url && (
                // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                <img src={t.url} alt="" className="hs-toast__thumb" />
              )}
              <span className="hs-toast__msg">{t.message}</span>
              <button
                type="button"
                className="hs-toast__x"
                onClick={() => removeToast(t.id)}
                aria-label="Dismiss this notification"
              >
                <IconClose />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
