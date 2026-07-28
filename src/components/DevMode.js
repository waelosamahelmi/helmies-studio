"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DevToolsPanel from "@/components/studio/DevToolsPanel";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];
const DEFAULT_TABS = [
  { id: "terminal", label: "Terminal", url: "/dev-terminal" },
  { id: "opencode", label: "Opencode", url: "/dev-opencode" },
  { id: "hermes", label: "Hermes" },
  { id: "devtools", label: "DevTools" },
];
const BTN_SIZE = 40, SNAP_THRESHOLD = 80;

function getSnapPos(x, y, ww, wh) {
  const d = [x, ww - x - BTN_SIZE, y, wh - y - BTN_SIZE];
  const min = Math.min(...d);
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (min === d[0] && d[0] < SNAP_THRESHOLD) return { side: "left", x: 0, y: c(y, 8, wh - BTN_SIZE - 8) };
  if (min === d[1] && d[1] < SNAP_THRESHOLD) return { side: "right", x: ww - BTN_SIZE, y: c(y, 8, wh - BTN_SIZE - 8) };
  if (min === d[2] && d[2] < SNAP_THRESHOLD) return { side: "top", x: c(x, 8, ww - BTN_SIZE - 8), y: 0 };
  if (min === d[3] && d[3] < SNAP_THRESHOLD) return { side: "bottom", x: c(x, 8, ww - BTN_SIZE - 8), y: wh - BTN_SIZE };
  return { side: "free", x: c(x, 8, ww - BTN_SIZE - 8), y: c(y, 8, wh - BTN_SIZE - 8) };
}

const ARROWS = { left: "\u25B6", right: "\u25C0", top: "\u25BC", bottom: "\u25B2", free: "\u25BC" };

export default function DevMode() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState("terminal");
  const [tabs, setTabs] = useState(DEFAULT_TABS);
  const [pos, setPos] = useState({ side: "bottom", x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const hasInit = useRef(false);

  useEffect(() => {
    if (hasInit.current) return;
    hasInit.current = true;
    setPos({ side: "bottom", x: window.innerWidth - BTN_SIZE - 16, y: window.innerHeight - BTN_SIZE - 16 });
  }, []);

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => {
      if (s?.user?.email && DEV_EMAILS.includes(s.user.email)) setIsDev(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isDev) return;
    const onMove = (e) => {
      if (!dragging.current) return;
      const nx = dragStart.current.px + (e.clientX - dragStart.current.x);
      const ny = dragStart.current.py + (e.clientY - dragStart.current.y);
      setPos({ side: "free", x: Math.max(0, Math.min(window.innerWidth - BTN_SIZE, nx)), y: Math.max(0, Math.min(window.innerHeight - BTN_SIZE, ny)) });
    };
    const onUp = (e) => {
      if (!dragging.current) return;
      dragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (Math.abs(e.clientX - dragStart.current.x) < 4 && Math.abs(e.clientY - dragStart.current.y) < 4) {
        setOpen(o => !o);
        setMinimized(false);
        return;
      }
      setPos(getSnapPos(dragStart.current.px + (e.clientX - dragStart.current.x), dragStart.current.py + (e.clientY - dragStart.current.y), window.innerWidth, window.innerHeight));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [isDev]);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  const addTab = useCallback(() => {
    const url = prompt("Enter URL for new tab (relative like /dev-terminal or absolute):");
    if (!url) return;
    const label = prompt("Tab label:", url.replace(/^.*\//, "").replace(/-/g, " "));
    if (!label) return;
    const id = "tab-" + Date.now();
    setTabs(t => [...t, { id, label, url }]);
    setTab(id);
  }, []);

  const closeTab = useCallback((tabId) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === tabId);
    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    if (tab === tabId) {
      setTab(remaining[Math.min(idx, remaining.length - 1)].id);
    }
  }, [tabs, tab]);

  if (!isDev) return null;

  const currentTab = tabs.find(t => t.id === tab) || tabs[0];
  const isSnapped = pos.side !== "free";
  const panelFrom = pos.side === "right" ? "right" : pos.side === "left" ? "left" : "bottom";
  const pAnim = panelFrom === "right"
    ? { i: { x: "100%" }, a: minimized ? { x: "calc(100% - 28px)" } : { x: 0 }, e: { x: "100%" } }
    : panelFrom === "left"
    ? { i: { x: "-100%" }, a: minimized ? { x: "-100%" } : { x: 0 }, e: { x: "-100%" } }
    : { i: { y: "100%" }, a: minimized ? { y: "calc(100% - 36px)" } : { y: 0 }, e: { y: "100%" } };
  const pStyle = panelFrom === "right" || panelFrom === "left"
    ? { top: 0, [panelFrom]: 0, width: "45vw", maxWidth: 600, height: "100vh" }
    : { bottom: 0, left: 0, right: 0, height: "60vh", minHeight: 300 };
  const btnRadius = isSnapped
    ? (pos.side === "right" ? "8px 0 0 8px" : pos.side === "left" ? "0 8px 8px 0" : pos.side === "bottom" ? "8px 8px 0 0" : "0 0 8px 8px")
    : "50%";

  return (
    <>
      <button
        onPointerDown={onPointerDown}
        title={open ? "Close dev tools" : "Open dev tools"}
        style={{
          position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
          width: BTN_SIZE, height: BTN_SIZE, borderRadius: btnRadius,
          border: "1px solid rgba(255,255,255,0.1)", background: "rgba(10,10,30,0.4)", backdropFilter: "blur(4px)",
          color: "#00ff88", fontSize: 14, cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center",
          touchAction: "none", boxShadow: isSnapped ? "none" : "0 2px 12px rgba(0,0,0,0.4)", transition: "border-radius 0.2s",
        }}
      >
        {ARROWS[pos.side]}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={pAnim.i} animate={pAnim.a} exit={pAnim.e}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
              position: "fixed", zIndex: 9998, overflow: "hidden", display: "flex", flexDirection: "column",
              background: "rgba(5,5,18,0.35)", backdropFilter: "blur(3px)",
              borderTop: (pos.side === "bottom" || pos.side === "top") ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderLeft: pos.side === "right" ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderRight: pos.side === "left" ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderRadius: pos.side === "right" ? "12px 0 0 12px" : pos.side === "left" ? "0 12px 12px 0" : "12px 12px 0 0",
              ...pStyle,
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 12px", flexDirection: "row",
              background: "rgba(15,15,30,0.35)", borderBottom: "1px solid rgba(255,255,255,0.05)",
              userSelect: "none", flexShrink: 0,
            }}>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 4px #00ff88", flexShrink: 0, marginRight: 6 }} />
                {tabs.map(t => (
                  <span key={t.id} style={{ display: "inline-flex", alignItems: "center" }}>
                    <button onClick={() => setTab(t.id)} style={{
                      background: tab === t.id ? "rgba(0,255,136,0.06)" : "transparent",
                      color: tab === t.id ? "#00ff88" : "#666", border: "none",
                      borderBottom: tab === t.id ? "2px solid #00ff88" : "none",
                      padding: "6px 6px 6px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                    }}>{t.label}</button>
                    {tabs.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} title="Close tab" style={{
                        background: "transparent", color: "#555", border: "none",
                        padding: "6px 8px 6px 0", fontSize: 11, cursor: "pointer",
                      }}>×</button>
                    )}
                  </span>
                ))}
                <button onClick={addTab} title="New tab" style={{
                  background: "transparent", color: "#555", border: "1px dashed rgba(255,255,255,0.1)",
                  borderRadius: 3, padding: "3px 8px", fontSize: 12, cursor: "pointer", marginLeft: 2,
                }}>+</button>
              </div>
              <div style={{ display: "flex", gap: 3, flexDirection: "row" }}>
                <button onClick={() => setMinimized(m => !m)} title="Minimize" style={btnS}>—</button>
                <button onClick={() => setOpen(false)} title="Close" style={{ ...btnS, color: "#ff4444" }}>✕</button>
              </div>
            </div>

            {tab === "devtools" ? (
              <DevToolsPanel />
            ) : currentTab.url ? (
              <iframe src={currentTab.url} style={{ flex: 1, width: "100%", border: "none", background: "#0a0a1e", touchAction: "manipulation" }} title={`Dev ${currentTab.label}`} />
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, color: "#999", fontFamily: "monospace", fontSize: 11, gap: 10, overflow: "auto", background: "rgba(5,5,18,0.3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ff88" }} /><strong style={{ color: "#00ff88", fontSize: 12 }}>{currentTab.label}</strong><span style={{ color: "#555", fontSize: 9 }}>no URL</span>
                </div>
                <div style={{ color: "#555" }}>No embedded content — configure in terminal or SSH.</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const btnS = { width: 22, height: 22, borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
