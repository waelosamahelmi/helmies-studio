"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { IconBolt, IconSparkle } from "@/components/Icons";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

export default function OverviewDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        setError(e.message);
        toast.error("Failed to load dashboard data");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, flexDirection: "column", gap: "0.5rem" }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          style={{ width: 24, height: 24, color: "#FF1B6B" }}
        >
          <IconSparkle />
        </motion.div>
        <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.85rem" }}>Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin__chart" style={{ textAlign: "center", padding: "2rem" }}>
        <p style={{ color: "#ff3d71", marginBottom: "0.75rem" }}>Failed to load: {error}</p>
        <button className="btn btn-primary btn-sm" onClick={loadData}>Retry</button>
      </div>
    );
  }

  const totals = data?.totals || {};
  const byTool = data?.byTool || [];
  const modelMargins = data?.modelMargins || [];

  // Compute derived fields
  const totalUsers = totals.users || 0;
  const totalGenerations = totals.generations || 0;
  const completedGen = totals.completed || 0;
  const failedGen = totals.failed || 0;
  const creditsUsed = totals.creditsUsed || 0;
  const creditsGranted = totals.creditsGranted || 0;
  const providerCost = totals.providerCost || 0;
  const retailValue = totals.retailValue || 0;
  const profit = totals.profit || 0;
  const marginPct = totals.marginPct || 0;
  const successRate = totals.successRate || 0;

  // Find max for bar chart normalisation
  const maxToolCount = Math.max(1, ...byTool.map((t) => t._count || 0));

  return (
    <div className="admin__overview">
      {/* Stat cards — top row */}
      <div className="admin__stats">
        <StatCard label="Total Users" value={totalUsers.toLocaleString()} />
        <StatCard label="Generations" value={totalGenerations.toLocaleString()} sub={`${completedGen} completed · ${failedGen} failed`} />
        <StatCard label="Success Rate" value={`${successRate}%`} accent color={parseFloat(successRate) > 90 ? "#00E68A" : parseFloat(successRate) > 70 ? "#FFD166" : "#ff3d71"} />
        <StatCard label="Revenue (30d)" value={`€${retailValue.toFixed(2)}`} accent color="#00E68A" />
        <StatCard label="Provider Cost (30d)" value={`€${providerCost.toFixed(2)}`} />
        <StatCard label="Gross Margin" value={`€${profit.toFixed(2)}`} accent color={profit >= 0 ? "#00E68A" : "#ff3d71"} sub={`${marginPct}%`} />
        <StatCard label="Credits Sold" value={creditsGranted.toLocaleString()} icon={<IconBolt style={{ width: 18, height: 18, verticalAlign: "middle", marginRight: 4 }} />} />
        <StatCard label="Credits Consumed" value={creditsUsed.toLocaleString()} icon={<IconBolt style={{ width: 18, height: 18, verticalAlign: "middle", marginRight: 4 }} />} />
      </div>

      {/* Revenue vs AI COGS bar chart */}
      <div className="admin__chart" style={{ marginBottom: "1rem" }}>
        <h3>Revenue vs AI COGS (30 days)</h3>
        <div style={{ display: "flex", gap: "2rem", alignItems: "flex-end", minHeight: 140, padding: "1rem 0" }}>
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.7rem", marginBottom: "0.5rem", textAlign: "center", textTransform: "uppercase" }}>Revenue</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: retailValue > 0 ? Math.max(20, (retailValue / Math.max(retailValue, providerCost)) * 100) : 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{
                background: "linear-gradient(180deg, #00E68A, rgba(0,230,138,0.4))",
                borderRadius: "8px 8px 0 0",
                minHeight: 4,
              }}
            />
            <div style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: 700, marginTop: "0.25rem", fontFamily: "var(--font-display)" }}>
              €{retailValue.toFixed(0)}
            </div>
          </div>
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.7rem", marginBottom: "0.5rem", textAlign: "center", textTransform: "uppercase" }}>AI COGS</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: providerCost > 0 ? Math.max(20, (providerCost / Math.max(retailValue, providerCost)) * 100) : 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{
                background: "linear-gradient(180deg, #7C3AED, rgba(124,58,237,0.4))",
                borderRadius: "8px 8px 0 0",
                minHeight: 4,
              }}
            />
            <div style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: 700, marginTop: "0.25rem", fontFamily: "var(--font-display)" }}>
              €{providerCost.toFixed(0)}
            </div>
          </div>
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.7rem", marginBottom: "0.5rem", textAlign: "center", textTransform: "uppercase" }}>Margin</div>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: profit > 0 ? Math.max(20, (profit / Math.max(retailValue, providerCost)) * 100) : 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              style={{
                background: profit >= 0
                  ? "linear-gradient(180deg, #FF1B6B, rgba(255,27,107,0.4))"
                  : "linear-gradient(180deg, #ff3d71, rgba(255,61,113,0.4))",
                borderRadius: "8px 8px 0 0",
                minHeight: 4,
              }}
            />
            <div style={{
              textAlign: "center",
              fontSize: "1.1rem",
              fontWeight: 700,
              marginTop: "0.25rem",
              fontFamily: "var(--font-display)",
              color: profit >= 0 ? "#00E68A" : "#ff3d71",
            }}>
              €{profit.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Model spend breakdown */}
      <div className="admin__chart" style={{ marginBottom: "1rem" }}>
        <h3>Model Spend Breakdown</h3>
        {modelMargins.length === 0 ? (
          <p style={{ color: "rgba(242,242,247,0.4)", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>No generation data yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {modelMargins.slice(0, 10).map((m) => {
              const maxRev = Math.max(...modelMargins.map((x) => x.revenue), 1);
              const pct = (m.revenue / maxRev) * 100;
              return (
                <div key={m.model} className="admin__bar">
                  <span className="admin__bar-label" style={{ fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.model}
                  </span>
                  <span className="admin__bar-track">
                    <motion.span
                      className="admin__bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: EASE }}
                      style={{ background: m.margin >= 0 ? "#FF1B6B" : "#ff3d71" }}
                    />
                  </span>
                  <span className="admin__bar-count" style={{ fontSize: "0.7rem" }}>
                    €{m.revenue.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Usage by Tool */}
      <div className="admin__chart">
        <h3>Usage by Tool (30 days)</h3>
        {byTool.length === 0 ? (
          <p style={{ color: "rgba(242,242,247,0.4)", fontSize: "0.85rem", textAlign: "center", padding: "1rem" }}>No generation data yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {byTool.map((t) => (
              <div key={t.tool} className="admin__bar">
                <span className="admin__bar-label">{t.tool}</span>
                <span className="admin__bar-track">
                  <motion.span
                    className="admin__bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${(t._count / maxToolCount) * 100}%` }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </span>
                <span className="admin__bar-count">{t._count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ──
function StatCard({ label, value, icon, accent, color, sub }) {
  return (
    <motion.div
      className="admin__stat"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <span className="admin__stat-label">{label}</span>
      <span className="admin__stat-value" style={accent && color ? { color } : {}}>
        {icon}
        {value}
      </span>
      {sub && (
        <span style={{ display: "block", fontSize: "0.7rem", color: "rgba(242,242,247,0.4)", marginTop: "0.25rem" }}>
          {sub}
        </span>
      )}
    </motion.div>
  );
}
