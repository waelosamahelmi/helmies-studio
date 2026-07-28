"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export default function DevToolsPanel() {
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("backend"); // "backend" | "frontend"
  const [copied, setCopied] = useState(false);
  const frontendBuffer = useRef([]);

  // Intercept frontend errors
  useEffect(() => {
    const origError = window.onerror;
    const origUnhandled = window.onunhandledrejection;

    window.onerror = (msg, url, line, col, err) => {
      frontendBuffer.current.push(`[ERROR] ${msg} (${url}:${line})`);
      if (frontendBuffer.current.length > 200) frontendBuffer.current.shift();
      if (origError) origError(msg, url, line, col, err);
    };
    window.onunhandledrejection = (e) => {
      frontendBuffer.current.push(`[UNHANDLED] ${e.reason?.message || e.reason}`);
      if (frontendBuffer.current.length > 200) frontendBuffer.current.shift();
      if (origUnhandled) origUnhandled(e);
    };

    // Also capture console.warn/error
    const origWarn = console.warn;
    const origError2 = console.error;
    console.warn = (...args) => {
      frontendBuffer.current.push(`[WARN] ${args.join(" ")}`);
      if (frontendBuffer.current.length > 200) frontendBuffer.current.shift();
      origWarn.apply(console, args);
    };
    console.error = (...args) => {
      frontendBuffer.current.push(`[ERROR] ${args.join(" ")}`);
      if (frontendBuffer.current.length > 200) frontendBuffer.current.shift();
      origError2.apply(console, args);
    };

    return () => {
      window.onerror = origError;
      window.onunhandledrejection = origUnhandled;
      console.warn = origWarn;
      console.error = origError2;
    };
  }, []);

  const fetchBackendLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dev/logs?lines=150");
      const data = await res.json();
      setLogs(data.logs || "No logs returned.");
    } catch (e) {
      setLogs(`Failed to fetch logs: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (source === "backend") {
      fetchBackendLogs();
      const interval = setInterval(fetchBackendLogs, 8000);
      return () => clearInterval(interval);
    }
  }, [source, fetchBackendLogs]);

  const copyLogs = useCallback(() => {
    const text = source === "backend" ? logs : frontendBuffer.current.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [logs, source]);

  const displayLogs = source === "backend" ? logs : frontendBuffer.current.join("\n") || "No frontend logs captured yet.";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "rgba(5,8,15,0.6)", fontFamily: "monospace", fontSize: 11, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(15,15,30,0.3)", borderBottom: "1px solid rgba(255,255,255,0.04)", flexShrink: 0 }}>
        <button onClick={() => setSource("backend")} style={{
          background: source === "backend" ? "rgba(0,255,136,0.08)" : "transparent",
          color: source === "backend" ? "#00ff88" : "#666", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3, padding: "3px 8px", fontSize: 10, cursor: "pointer",
        }}>Backend (PM2)</button>
        <button onClick={() => setSource("frontend")} style={{
          background: source === "frontend" ? "rgba(0,255,136,0.08)" : "transparent",
          color: source === "frontend" ? "#00ff88" : "#666", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3, padding: "3px 8px", fontSize: 10, cursor: "pointer",
        }}>Frontend</button>
        <div style={{ flex: 1 }} />
        <button onClick={source === "backend" ? fetchBackendLogs : undefined} title={source === "backend" ? "Refresh" : "Auto-captured"} style={{
          background: "transparent", color: "#666", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3, padding: "3px 8px", fontSize: 10, cursor: "pointer",
        }} disabled={loading}>{loading ? "..." : "↻"}</button>
        <button onClick={copyLogs} style={{
          background: copied ? "rgba(0,255,136,0.1)" : "transparent",
          color: copied ? "#00ff88" : "#666", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 3, padding: "3px 8px", fontSize: 10, cursor: "pointer",
        }}>{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre style={{
        flex: 1, margin: 0, padding: "8px 10px", overflow: "auto",
        color: "#aaa", whiteSpace: "pre-wrap", wordBreak: "break-all",
        lineHeight: 1.5,
      }}>
        {displayLogs}
      </pre>
    </div>
  );
}
