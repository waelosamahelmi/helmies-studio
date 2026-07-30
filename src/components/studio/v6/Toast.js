"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* ── Inline icons ── */
const IconCheck = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconX = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconWarn = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconInfo = () => (
  <svg className="v6-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const ICONS = {
  success: IconCheck,
  error:   IconX,
  warning: IconWarn,
  info:    IconInfo,
};

const DOT_COLORS = {
  success: "var(--v6-good)",
  error:   "var(--v6-bad)",
  warning: "var(--v6-warn)",
  info:    "var(--v6-accent)",
};

let toastId = 0;

/* ── Context ── */
const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ── Provider ── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type = "info", title, message, action, duration = 5000 }) => {
    const id = ++toastId;
    setToasts((prev) => {
      const next = [...prev, { id, type, title, message, action, duration }];
      return next.length > 5 ? next.slice(next.length - 5) : next;
    });
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Convenience methods
  const toast = useCallback((opts) => {
    if (typeof opts === "string") return addToast({ type: "info", message: opts });
    return addToast(opts);
  }, [addToast]);
  toast.success = (msg) => addToast({ type: "success", message: typeof msg === "string" ? msg : msg.message, title: msg.title });
  toast.error   = (msg) => addToast({ type: "error",   message: typeof msg === "string" ? msg : msg.message, title: msg.title });
  toast.warning = (msg) => addToast({ type: "warning", message: typeof msg === "string" ? msg : msg.message, title: msg.title });
  toast.info    = (msg) => addToast({ type: "info",    message: typeof msg === "string" ? msg : msg.message, title: msg.title });

  return (
    <ToastContext.Provider value={{ toast, dismissToast }}>
      {children}
      <div className="v6-toast-stack">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.type] || IconInfo;
            return (
              <motion.div
                key={t.id}
                className={`v6-toast v6-toast-${t.type}`}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                onClick={() => dismissToast(t.id)}
                style={{ cursor: "pointer", pointerEvents: "auto" }}
                role="alert"
              >
                <span className="v6-toast-dot" style={{ background: DOT_COLORS[t.type] }} />
                <Icon />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {t.title && <strong style={{ display: "block", fontSize: 12, marginBottom: 1 }}>{t.title}</strong>}
                  <span style={{ fontSize: 11, color: "var(--v6-muted)" }}>{t.message}</span>
                </div>
                {t.action && (
                  <button
                    className="v6-btn v6-sm"
                    onClick={(e) => { e.stopPropagation(); t.action(); dismissToast(t.id); }}
                  >
                    {typeof t.action === "string" ? t.action : "Action"}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
