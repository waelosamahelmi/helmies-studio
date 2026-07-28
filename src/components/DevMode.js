"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];
const TTYD_URL = "/dev-terminal";

export default function DevMode() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user?.email && DEV_EMAILS.includes(s.user.email)) {
          setIsDev(true);
        }
      })
      .catch(() => {});
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((o) => !o);
    setMinimized(false);
  }, []);

  if (!isDev) return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={toggleOpen}
        className="devmode__toggle"
        title={open ? "Close dev terminal" : "Open dev terminal"}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(10,10,30,0.9)",
          backdropFilter: "blur(12px)",
          color: "#00ff88",
          fontSize: 20,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }}
      >
        ▼
      </button>

      {/* Terminal panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={minimized ? { y: "calc(100% - 36px)" } : { y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 9998,
              height: "60vh",
              minHeight: 300,
              borderTop: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px 12px 0 0",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "#0a0a1e",
            }}
          >
            {/* Header bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 12px",
                background: "rgba(20,20,40,0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                cursor: "row-resize",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#00ff88",
                    boxShadow: "0 0 6px #00ff88",
                  }}
                />
                <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>
                  Dev Terminal — root@helmies-studio
                </span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setMinimized((m) => !m)}
                  title="Minimize"
                  style={{
                    ...devBtnStyle,
                    color: "#ffcc00",
                  }}
                >
                  {minimized ? "□" : "—"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  style={{
                    ...devBtnStyle,
                    color: "#ff4444",
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Terminal iframe */}
            <iframe
              src={TTYD_URL}
              style={{
                flex: 1,
                width: "100%",
                border: "none",
                background: "#0a0a1e",
              }}
              title="Dev Terminal"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const devBtnStyle = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
