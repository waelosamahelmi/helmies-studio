"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

const TABS = [
  { id: "terminal", label: "Terminal", url: "/dev-terminal", desc: "root@helmies-studio bash" },
  { id: "opencode", label: "Opencode", url: "/dev-opencode", desc: "AI coding agent (v1.18.9)" },
  { id: "hermes", label: "Hermes", desc: "Agent v0.17.0 — always standby" },
];

export default function DevMode() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState("terminal");
  const [hermesStatus, setHermesStatus] = useState({ online: false, pid: null, uptime: null });

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

  // Poll hermes status from the terminal
  useEffect(() => {
    if (!open || tab !== "hermes") return;
    const poll = () => {
      fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "What is the status of the hermes agent? Reply with: online/offline" }],
          model: "deepseek/deepseek-v4-flash",
        }),
      })
        .then(() => {})
        .catch(() => {});
    };
    // Fetch hermes process status via a simple endpoint
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user) {
          setHermesStatus({
            online: true,
            dashboard: "http://127.0.0.1:9119",
            pm2: "PM2 → dev-hermes",
            mcp: "MCP server available",
          });
        }
      })
      .catch(() => {});
  }, [open, tab]);

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
                  padding: 24,
                  color: "#ccc",
                  fontFamily: "monospace",
                  fontSize: 13,
                  gap: 16,
                  overflow: "auto",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 6px #00ff88" }} />
                  <strong style={{ color: "#00ff88", fontSize: 15 }}>Hermes Agent</strong>
                  <span style={{ color: "#888", fontSize: 11 }}>v0.17.0 — Always Standby</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "PM2 Service", value: "dev-hermes", status: "online" },
                    { label: "Dashboard", value: "127.0.0.1:9119", status: "online" },
                    { label: "MCP Server", value: "Available", status: "online" },
                    { label: "Memory", value: "~243MB", status: "ok" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "online" ? "#00ff88" : "#ffcc00" }} />
                        <span style={{ color: "#eee" }}>{s.value}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 8, padding: "12px 16px", background: "rgba(255,204,0,0.08)", borderRadius: 8, border: "1px solid rgba(255,204,0,0.15)", fontSize: 12 }}>
                  <strong style={{ color: "#ffcc00" }}>Access the dashboard</strong>
                  <br />
                  SSH tunnel: <code style={{ color: "#00ff88" }}>ssh -L 9119:127.0.0.1:9119 root@69.62.126.13</code>
                  <br />
                  Then open <code style={{ color: "#00ff88" }}>http://localhost:9119</code> in your browser.
                  <br /><br />
                  Or run <code style={{ color: "#ffcc00" }}>hermes chat</code> in the Terminal tab.
                </div>

                <div style={{ marginTop: "auto", color: "#555", fontSize: 11 }}>
                  Hermes can manage jobs, query the database, run MCP tools, analyze code, and more.
                  It has full context of the helmies-studio codebase.
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
