"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { IcClose } from "./Icons";

const EASE = [0.32, 0.72, 0, 1];

/* Lock the page behind an overlay without losing scroll position */
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const y = window.scrollY;
    const { overflow, position, top, width } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo(0, y);
    };
  }, [active]);
}

/* Escape to dismiss, and keep focus inside while open */
function useDismiss(active, onClose, ref) {
  useEffect(() => {
    if (!active) return;

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose?.(); return; }
      if (e.key !== "Tab" || !ref.current) return;

      const focusable = ref.current.querySelectorAll(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active, onClose, ref]);
}

function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

/* ══════════════════════════════════════════════════════════════════════════
   SHEET — bottom sheet. Drag down or tap the scrim to dismiss.
   ══════════════════════════════════════════════════════════════════════════ */
export function Sheet({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useScrollLock(open);
  useDismiss(open, onClose, ref);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="hs-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
            />
            <motion.div
              ref={ref}
              className="hs-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.32, ease: EASE }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 520) onClose?.();
              }}
            >
              <div className="hs-sheet__grip" aria-hidden="true" />
              {title && (
                <div className="hs-sheet__head">
                  <h2 className="hs-sheet__title">{title}</h2>
                  <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon" onClick={onClose} aria-label="Close">
                    <IcClose className="hs-icon-sm" />
                  </button>
                </div>
              )}
              <div className="hs-sheet__body">{children}</div>
              {footer && <div className="hs-modal__foot">{footer}</div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MODAL — centred on desktop, becomes a sheet on phones (see system.css)
   ══════════════════════════════════════════════════════════════════════════ */
export function Modal({ open, onClose, title, children, footer, dismissable = true }) {
  const ref = useRef(null);
  useScrollLock(open);
  useDismiss(open, dismissable ? onClose : undefined, ref);

  useEffect(() => { if (open) ref.current?.focus(); }, [open]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="hs-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={dismissable ? onClose : undefined}
            />
            <motion.div
              ref={ref}
              className="hs-modal"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {title && (
                <div className="hs-modal__head">
                  <h2 style={{ fontSize: "var(--t-md)", fontWeight: 600 }}>{title}</h2>
                  {dismissable && (
                    <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon" onClick={onClose} aria-label="Close">
                      <IcClose className="hs-icon-sm" />
                    </button>
                  )}
                </div>
              )}
              <div className="hs-modal__body">{children}</div>
              {footer && <div className="hs-modal__foot">{footer}</div>}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/* ── Confirm — for destructive actions ─────────────────────────────────── */
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = "Delete", danger = true }) {
  const run = useCallback(() => { onConfirm?.(); onClose?.(); }, [onConfirm, onClose]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="hs-btn hs-btn--ghost" onClick={onClose}>Cancel</button>
          <button type="button" className={`hs-btn ${danger ? "hs-btn--danger" : "hs-btn--primary"}`} onClick={run}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", lineHeight: 1.6 }}>{body}</p>
    </Modal>
  );
}

export default Sheet;
