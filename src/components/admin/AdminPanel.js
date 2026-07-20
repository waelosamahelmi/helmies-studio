"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconBolt, IconUsers, IconArrowUpRight, IconStar } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const TABS = ["Overview", "Users", "Pricing", "Providers", "Analytics", "Refunds", "Feature Flags"];

export default function AdminPanel() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState({ totals: {}, byTool: [] });
  const [users, setUsers] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [providers, setProviders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [flags, setFlags] = useState([]);

  useEffect(() => {
    fetch("/api/admin/analytics").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "Users") fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {});
    if (tab === "Pricing") fetch("/api/admin/pricing").then((r) => r.json()).then(setPricing).catch(() => {});
    if (tab === "Providers") fetch("/api/admin/providers").then((r) => r.json()).then(setProviders).catch(() => {});
    if (tab === "Refunds") fetch("/api/admin/refunds").then((r) => r.json()).then(setRefunds).catch(() => {});
    if (tab === "Feature Flags") fetch("/api/admin/flags").then((r) => r.json()).then(setFlags).catch(() => {});
  }, [tab]);

  return (
    <>
      <Navbar />
      <div className="admin">
        <div className="admin__header">
          <h1>Admin Panel</h1>
          <p>Manage users, credits, pricing, providers, and more.</p>
        </div>

        <div className="admin__tabs">
          {TABS.map((t) => (
            <button key={t} className={`admin__tab ${tab === t ? "admin__tab--active" : ""}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="admin__body">
          {tab === "Overview" && (
            <div className="admin__overview">
              <div className="admin__stats">
                <div className="admin__stat">
                  <span className="admin__stat-label">Total Users</span>
                  <span className="admin__stat-value">{data.totals?.users || 0}</span>
                </div>
                <div className="admin__stat">
                  <span className="admin__stat-label">Generations</span>
                  <span className="admin__stat-value">{data.totals?.generations || 0}</span>
                </div>
                <div className="admin__stat">
                  <span className="admin__stat-label">Success Rate</span>
                  <span className="admin__stat-value">{data.totals?.successRate || 0}%</span>
                </div>
                <div className="admin__stat">
                  <span className="admin__stat-label">Credits Used</span>
                  <span className="admin__stat-value">{data.totals?.creditsUsed || 0}</span>
                </div>
                <div className="admin__stat admin__stat--revenue">
                  <span className="admin__stat-label">Revenue</span>
                  <span className="admin__stat-value">€{(data.totals?.revenue || 0).toFixed(2)}</span>
                </div>
                <div className="admin__stat admin__stat--profit">
                  <span className="admin__stat-label">Profit</span>
                  <span className="admin__stat-value">€{(data.totals?.profit || 0).toFixed(2)}</span>
                </div>
              </div>
              <div className="admin__chart">
                <h3>Usage by Tool (30 days)</h3>
                <div className="admin__bars">
                  {(data.byTool || []).map((t) => (
                    <div key={t.tool} className="admin__bar">
                      <span className="admin__bar-label">{t.tool}</span>
                      <span className="admin__bar-track">
                        <span className="admin__bar-fill" style={{ width: `${Math.min(100, (t._count / (data.totals?.generations || 1)) * 100)}%` }} />
                      </span>
                      <span className="admin__bar-count">{t._count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "Users" && (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Credits</th><th>Role</th><th>Generations</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name || "—"}</td>
                      <td>{u.email}</td>
                      <td><IconBolt /> {u.credits}</td>
                      <td>{u.role}</td>
                      <td>{u._count?.generations || 0}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "Pricing" && (
            <div className="admin__pricing">
              <div className="admin__pricing-list">
                {pricing.map((p) => (
                  <div key={p.id} className="admin__pricing-row">
                    <span>{p.modelId}</span>
                    <span>{p.modelType}</span>
                    <span>{p.providerName}</span>
                    <span>€{p.providerCost?.toFixed(4)}</span>
                    <span><IconBolt /> {p.creditsCost}</span>
                    <span>{p.isActive ? "Active" : "Inactive"}</span>
                  </div>
                ))}
                {pricing.length === 0 && <p className="admin__empty">No custom pricing set. Using defaults.</p>}
              </div>
            </div>
          )}

          {tab === "Providers" && (
            <div className="admin__providers">
              {providers.map((p) => (
                <div key={p.id} className="admin__provider">
                  <div><strong>{p.name}</strong> <span className="admin__badge">{p.type}</span></div>
                  <div>Markup: {p.markup}x</div>
                  <div>{p.isActive ? "Active" : "Inactive"}</div>
                </div>
              ))}
              {providers.length === 0 && <p className="admin__empty">No providers configured. Using MuAPI default.</p>}
            </div>
          )}

          {tab === "Refunds" && (
            <div className="admin__refunds">
              {refunds.map((r) => (
                <div key={r.id} className="admin__refund">
                  <span><IconBolt /> {r.amount}</span>
                  <span>{r.reason || "No reason"}</span>
                  <span className={`admin__badge ${r.status}`}>{r.status}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
              {refunds.length === 0 && <p className="admin__empty">No refunds yet.</p>}
            </div>
          )}

          {tab === "Feature Flags" && (
            <div className="admin__flags">
              {flags.map((f) => (
                <div key={f.id} className="admin__flag">
                  <div><strong>{f.name}</strong></div>
                  <div>{f.description}</div>
                  <span className={`admin__badge ${f.enabled ? "enabled" : "disabled"}`}>{f.enabled ? "Enabled" : "Disabled"}</span>
                </div>
              ))}
              {flags.length === 0 && <p className="admin__empty">No feature flags set.</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}