"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

const TABS = [
  { id: "terminal", label: "Terminal", url: "/dev-terminal", desc: "root@helmies-studio bash" },
  { id: "opencode", label: "Opencode", url: "/dev-opencode", desc: "AI coding agent (v1.18.9)" },
  { id: "hermes", label: "Hermes", desc: "Job manager & MCP (v0.17.0)" },
];

export default function DevMode() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState("terminal");

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

  const currentTab = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={toggleOpen}
        title={open ? "Close dev tools" : "Open dev tools"}
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

      {/* Dev panel */}
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
            {/* Header with tabs */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px",
                background: "rgba(20,20,40,0.95)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                userSelect: "none",
                flexShrink: 0,
                minHeight: 36,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#00ff88",
                    boxShadow: "0 0 6px #00ff88",
                    marginRight: 8,
                    flexShrink: 0,
                  }}
                />
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    title={t.desc}
                    style={{
                      background: tab === t.id ? "rgba(0,255,136,0.1)" : "transparent",
                      color: tab === t.id ? "#00ff88" : "#888",
                      border: "none",
                      borderBottom: tab === t.id ? "2px solid #00ff88" : "2px solid transparent",
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setMinimized((m) => !m)}
                  title="Minimize"
                  style={{ ...devBtnStyle, color: "#ffcc00" }}
                >
                  {minimized ? "□" : "—"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  style={{ ...devBtnStyle, color: "#ff4444" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            {tab === "hermes" ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                  color: "#aaa",
                  fontFamily: "monospace",
                  fontSize: 13,
                  textAlign: "center",
                  gap: 12,
                }}
              >
                <p>
                  <strong style={{ color: "#00ff88" }}>Hermes Agent v0.17.0</strong>
                  <br />
                  AI assistant with tool-calling, MCP, browser automation, and more.
                </p>
                <p style={{ opacity: 0.7 }}>
                  Run <code style={{ color: "#ffcc00" }}>hermes chat</code> in the Terminal tab
                  <br />
                  or <code style={{ color: "#ffcc00" }}>hermes gui</code> for the desktop interface.
                </p>
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  Available: chat | model | lsp | mcp | memory | sessions | curator | dashboard | logs | ...
                </div>
              </div>
            ) : (
              <iframe
                src={currentTab.url}
                style={{
                  flex: 1,
                  width: "100%",
                  border: "none",
                  background: "#0a0a1e",
                }}
                title={`Dev ${currentTab.label}`}
              />
            )}
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
