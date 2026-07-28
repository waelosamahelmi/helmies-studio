"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DEV_EMAILS = ["waelosamahelmi@gmail.com", "wael@helmies.fi"];

const TABS = [
  { id: "terminal", label: "Terminal", url: "/dev-terminal", desc: "root@helmies-studio bash" },
  { id: "opencode", label: "Opencode", url: "/dev-opencode", desc: "AI coding agent (v1.18.9)" },
  { id: "hermes", label: "Hermes", desc: "Agent v0.17.0 — always standby" },
];

const BTN_SIZE = 40;
const SNAP_THRESHOLD = 80;

function getSnapPos(x, y, ww, wh) {
  const distLeft = x;
  const distRight = ww - x - BTN_SIZE;
  const distTop = y;
  const distBottom = wh - y - BTN_SIZE;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist === distLeft && distLeft < SNAP_THRESHOLD) return { side: "left", x: 0, y: clamp(y, 8, wh - BTN_SIZE - 8) };
  if (minDist === distRight && distRight < SNAP_THRESHOLD) return { side: "right", x: ww - BTN_SIZE, y: clamp(y, 8, wh - BTN_SIZE - 8) };
  if (minDist === distTop && distTop < SNAP_THRESHOLD) return { side: "top", x: clamp(x, 8, ww - BTN_SIZE - 8), y: 0 };
  if (minDist === distBottom && distBottom < SNAP_THRESHOLD) return { side: "bottom", x: clamp(x, 8, ww - BTN_SIZE - 8), y: wh - BTN_SIZE };
  return { side: "free", x: clamp(x, 8, ww - BTN_SIZE - 8), y: clamp(y, 8, wh - BTN_SIZE - 8) };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const ARROWS = { left: "▶", right: "◀", top: "▼", bottom: "▲", free: "▼" };

export default function DevMode() {
  const [isDev, setIsDev] = useState(false);
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState("terminal");
  const [pos, setPos] = useState({ side: "bottom", x: 0, y: 0 });

  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const btnRef = useRef(null);
  const hasInit = useRef(false);

  // Init position (bottom-right after mount)
  useEffect(() => {
    if (hasInit.current) return;
    hasInit.current = true;
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    setPos({ side: "bottom", x: ww - BTN_SIZE - 16, y: wh - BTN_SIZE - 16 });
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user?.email && DEV_EMAILS.includes(s.user.email)) setIsDev(true);
      })
      .catch(() => {});
  }, []);

  const toggleOpen = useCallback(() => {
    setOpen((o) => !o);
    setMinimized(false);
  }, []);

  const onPointerDown = useCallback((e) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    if (!isDev) return;
    const onMove = (e) => {
      if (!dragging.current) return;
      const nx = dragStart.current.px + (e.clientX - dragStart.current.x);
      const ny = dragStart.current.py + (e.clientY - dragStart.current.y);
      setPos({ side: "free", x: clamp(nx, 0, window.innerWidth - BTN_SIZE), y: clamp(ny, 0, window.innerHeight - BTN_SIZE) });
    };
    const onUp = (e) => {
      if (!dragging.current) return;
      dragging.current = false;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) { toggleOpen(); return; }
      const fx = dragStart.current.px + dx;
      const fy = dragStart.current.py + dy;
      setPos(getSnapPos(fx, fy, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [isDev, toggleOpen]);

  if (!isDev) return null;

  const currentTab = TABS.find((t) => t.id === tab) || TABS[0];
  const isVertical = pos.side === "left" || pos.side === "right";
  const isHorizontal = pos.side === "bottom" || pos.side === "top";
  const isSnapped = pos.side !== "free";
  const panelFrom = pos.side === "right" ? "right" : pos.side === "left" ? "left" : "bottom";

  const panelAnim = panelFrom === "right"
    ? { initial: { x: "100%" }, animate: minimized ? { x: "calc(100% - 28px)" } : { x: 0 }, exit: { x: "100%" } }
    : panelFrom === "left"
    ? { initial: { x: "-100%" }, animate: minimized ? { x: "-100%" } : { x: 0 }, exit: { x: "-100%" } }
    : { initial: { y: "100%" }, animate: minimized ? { y: "calc(100% - 36px)" } : { y: 0 }, exit: { y: "100%" } };

  const panelStyle = panelFrom === "right" || panelFrom === "left"
    ? { top: 0, [panelFrom]: 0, width: "45vw", maxWidth: 600, height: "100vh" }
    : { bottom: 0, left: 0, right: 0, height: "60vh", minHeight: 300 };

  const btnArrow = ARROWS[pos.side] || "▼";
  const btnRotation = panelFrom === "left" ? 0 : panelFrom === "right" ? 0 : open ? 180 : 0;
  const btnRadius = isSnapped
    ? (pos.side === "right" ? "8px 0 0 8px" : pos.side === "left" ? "0 8px 8px 0" : pos.side === "bottom" ? "8px 8px 0 0" : "0 0 8px 8px")
    : "50%";

  return (
    <>
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        title={open ? "Close dev tools" : "Open dev tools"}
        style={{
          position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
          width: BTN_SIZE, height: BTN_SIZE, borderRadius: btnRadius,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(10,10,30,0.4)", backdropFilter: "blur(4px)",
          color: "#00ff88", fontSize: 14, cursor: "grab",
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: open ? `rotate(${panelFrom === "bottom" ? 180 : panelFrom === "top" ? 0 : 0}deg)` : "rotate(0deg)",
          touchAction: "none", boxShadow: isSnapped ? "none" : "0 2px 12px rgba(0,0,0,0.4)",
          transition: "border-radius 0.2s, box-shadow 0.2s",
        }}
      >
        {btnArrow}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={panelAnim.initial}
            animate={panelAnim.animate}
            exit={panelAnim.exit}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
              position: "fixed", zIndex: 9998,
              overflow: "hidden", display: "flex", flexDirection: "column",
              background: "rgba(5,5,18,0.35)", backdropFilter: "blur(3px)",
              borderTop: isHorizontal ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderLeft: pos.side === "right" ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderRight: pos.side === "left" ? "1px solid rgba(255,255,255,0.08)" : "none",
              borderRadius: pos.side === "right" ? "12px 0 0 12px"
                : pos.side === "left" ? "0 12px 12px 0"
                : "12px 12px 0 0",
              ...panelStyle,
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: isVertical ? "10px 6px" : "0 12px",
              flexDirection: isVertical ? "column" : "row",
              background: "rgba(15,15,30,0.35)",
              borderBottom: isHorizontal ? "1px solid rgba(255,255,255,0.05)" : "none",
              borderRight: isVertical ? "1px solid rgba(255,255,255,0.05)" : "none",
              userSelect: "none", flexShrink: 0, gap: isVertical ? 6 : 0,
            }}>
              <div style={{ display: "flex", flexDirection: isVertical ? "column" : "row", alignItems: "center", gap: isVertical ? 4 : 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 4px #00ff88", flexShrink: 0, marginRight: isVertical ? 0 : 6, marginBottom: isVertical ? 4 : 0 }} />
                {TABS.map((t) => (
                  <button key={t.id} onClick={() => setTab(t.id)} title={t.desc} style={{
                    background: tab === t.id ? "rgba(0,255,136,0.06)" : "transparent",
                    color: tab === t.id ? "#00ff88" : "#666",
                    border: "none",
                    borderBottom: isHorizontal && tab === t.id ? "2px solid #00ff88" : "none",
                    borderRight: isVertical && tab === t.id ? "2px solid #00ff88" : "none",
                    padding: isVertical ? "5px 6px" : "6px 12px",
                    fontSize: 10, fontWeight: 600, cursor: "pointer",
                    writingMode: isVertical ? "vertical-rl" : "horizontal-tb",
                  }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 3, flexDirection: isVertical ? "column" : "row" }}>
                <button onClick={() => setMinimized((m) => !m)} title="Minimize" style={{ ...devBtnStyle, color: "#ffcc00" }}>—</button>
                <button onClick={() => setOpen(false)} title="Close" style={{ ...devBtnStyle, color: "#ff4444" }}>✕</button>
              </div>
            </div>

            {tab === "hermes" ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, color: "#999", fontFamily: "monospace", fontSize: 11, gap: 10, overflow: "auto", background: "rgba(5,5,18,0.4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 3px #00ff88" }} />
                  <strong style={{ color: "#00ff88", fontSize: 12 }}>Hermes</strong>
                  <span style={{ color: "#555", fontSize: 9 }}>v0.17.0</span>
                </div>
                {[
                  { label: "Agent", value: "Standby" },
                  { label: "Browser MCP", value: "Playwright" },
                  { label: "Opencode AI", value: "v1.18.9" },
                  { label: "SSH Dashboard", value: "L9119" },
                ].map((s) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 5 }}>
                    <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#00ff88" }} />
                    <span style={{ color: "#666" }}>{s.label}</span>
                    <span style={{ color: "#888", marginLeft: "auto" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <iframe
                ref={useCallback((el) => {
                  if (!el) return;
                  const inject = () => {
                    try {
                      const doc = el.contentDocument || el.contentWindow?.document;
                      if (!doc) return;
                      const style = doc.createElement("style");
                      style.textContent = ".xterm-viewport,.xterm-screen,.xterm{background:transparent!important}body{background:transparent!important}body>div{background:rgba(5,5,18,0.1)!important}";
                      doc.head.appendChild(style);
                      const fix = () => {
                        doc.querySelectorAll(".xterm-viewport,.xterm-screen,.xterm").forEach(e => { e.style.setProperty("background-color","transparent","important"); e.style.setProperty("background","transparent","important"); });
                      };
                      fix();
                      new MutationObserver(fix).observe(doc.body || doc.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:["style"]});
                    } catch {}
                  };
                  el.addEventListener("load", inject);
                  inject();
                }, [])}
                src={currentTab.url}
                style={{ flex: 1, width: "100%", border: "none", background: "transparent" }}
                title={`Dev ${currentTab.label}`}
              />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const devBtnStyle = { width: 22, height: 22, borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
