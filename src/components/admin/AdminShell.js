"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "@/components/Navbar";
import { IconBolt, IconSparkle } from "@/components/Icons";
import OverviewDashboard from "./OverviewDashboard";
import ModelManager from "./ModelManager";
import PlanEditor from "./PlanEditor";
import PromoManager from "./PromoManager";
import CmsEditor from "./CmsEditor";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const TOP_LEVEL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "business", label: "Business", subs: ["Revenue", "Plans", "Credit Packs", "Promo Codes", "Pricing", "Margin Advisor"] },
  { id: "ai-platform", label: "AI Platform", subs: ["Models", "Routes", "Providers", "Prompt Guides", "Quality", "Generations", "Director"] },
  { id: "users", label: "Users" },
  { id: "content", label: "Content", subs: ["Website Content", "Announcements"] },
  { id: "operations", label: "Operations", subs: ["Jobs", "Provider Health", "Feature Flags", "Audit Logs"] },
];

export default function AdminShell() {
  const [topTab, setTopTab] = useState("overview");
  const [subTab, setSubTab] = useState(null);

  const selectTopTab = (tabId) => {
    setTopTab(tabId);
    setSubTab(null);
  };

  const selectSubTab = (sub) => setSubTab(sub);
  const currentTopTab = TOP_LEVEL_TABS.find((t) => t.id === topTab);

  return (
    <>
      <Navbar />
      <div className="v6-page-content">
        {/* Page Head */}
        <div className="v6-page-head">
          <div>
            <p className="v6-eyebrow">Helmies Studio</p>
            <h1>Admin</h1>
          </div>
          <button className="v6-btn v6-sm" onClick={() => selectTopTab("operations")}>
            Audit log
          </button>
        </div>

        {/* Top-level tab bar */}
        <div className="v6-segmented" style={{ marginBottom: 8, maxWidth: 700 }}>
          {TOP_LEVEL_TABS.map((t) => {
            const isActive = topTab === t.id;
            return (
              <button
                key={t.id}
                className={isActive ? "v6-active" : ""}
                onClick={() => selectTopTab(t.id)}
                style={{ position: "relative" }}
              >
                {t.label}
                {t.subs?.length > 0 && (
                  <span style={{
                    fontSize: 8, color: isActive ? "var(--v6-accent)" : "var(--v6-muted)",
                    fontWeight: 700, marginLeft: 3,
                  }}>
                    ({t.subs.length})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-tab bar */}
        <AnimatePresence mode="wait">
          {currentTopTab?.subs?.length > 0 && (
            <motion.div
              key={`subs-${topTab}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="v6-chip-row"
              style={{ marginBottom: 16, marginTop: 8 }}
            >
              {currentTopTab.subs.map((sub) => {
                const isActive = subTab === sub;
                return (
                  <button
                    key={sub}
                    className={`v6-chip ${isActive ? "v6-active" : ""}`}
                    style={{
                      fontSize: 10,
                      ...(isActive ? {} : { borderColor: "transparent" }),
                    }}
                    onClick={() => selectSubTab(sub)}
                  >
                    {sub}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content body */}
        <motion.div
          key={`${topTab}-${subTab || "none"}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <AdminContent topTab={topTab} subTab={subTab} />
        </motion.div>
      </div>
    </>
  );
}

// ── Content router ──
function AdminContent({ topTab, subTab }) {
  if (topTab === "overview") return <OverviewTab />;
  if (topTab === "business") return <BusinessContent subTab={subTab} />;
  if (topTab === "ai-platform") return <AIPlatformContent subTab={subTab} />;
  if (topTab === "users") return <UsersTab />;
  if (topTab === "content") return <ContentContent subTab={subTab} />;
  if (topTab === "operations") return <OperationsContent subTab={subTab} />;
  return <PlaceholderTab title="Admin" message="Select a tab to begin." />;
}

function BusinessContent({ subTab }) {
  if (subTab === "Pricing") return <LegacyPricingTab />;
  if (subTab === "Plans") return <PlanEditor type="plans" />;
  if (subTab === "Credit Packs") return <PlanEditor type="credit-packs" />;
  if (subTab === "Promo Codes") return <PromoManager />;
  if (subTab === "Revenue") return <RevenueTab />;
  if (subTab === "Margin Advisor") return <MarginAdvisorTab />;
  return <PlaceholderTab title="Business" message="Select a sub-tab: Revenue, Plans, Credit Packs, Promo Codes, Pricing, or Margin Advisor." />;
}

function AIPlatformContent({ subTab }) {
  if (subTab === "Models") return <ModelManager />;
  if (subTab === "Providers") return <LegacyProvidersTab />;
  if (subTab === "Generations") return <GenerationsTab />;
  if (subTab === "Prompt Guides") return <PlaceholderTab title="Prompt Guides" subtitle="Model-specific prompt guide registry — coming soon." />;
  if (subTab === "Quality") return <PlaceholderTab title="Quality" subtitle="Quality gate configuration — coming soon." />;
  if (subTab === "Director") return <PlaceholderTab title="Director" subtitle="Director pipeline management — coming soon." />;
  if (subTab === "Routes") return <PlaceholderTab title="Routes" subtitle="Model routing configuration — coming soon." />;
  return <PlaceholderTab title="AI Platform" message="Select a sub-tab: Models, Routes, Providers, Prompt Guides, Quality, Generations, or Director." />;
}

function ContentContent({ subTab }) {
  if (subTab === "Website Content") return <CmsEditor />;
  if (subTab === "Announcements") return <AnnouncementsTab />;
  return <PlaceholderTab title="Content" message="Select a sub-tab: Website Content or Announcements." />;
}

function OperationsContent({ subTab }) {
  if (subTab === "Feature Flags") return <LegacyFlagsTab />;
  if (subTab === "Audit Logs") return <AuditLogsTab />;
  if (subTab === "Jobs") return <JobsTab />;
  if (subTab === "Provider Health") return <ProviderHealthTab />;
  return <PlaceholderTab title="Operations" message="Select a sub-tab: Jobs, Provider Health, Feature Flags, or Audit Logs." />;
}

// ── Overview Tab ──
function OverviewTab() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <OverviewDashboard />
      <div className="v6-builder-grid" style={{ minHeight: "auto" }}>
        <div className="v6-builder-panel" style={{ gridColumn: "1 / 3" }}>
          <ProviderHealthTab />
        </div>
        <div className="v6-builder-panel">
          <div className="v6-panel-title"><h3>Quick Actions</h3></div>
          <div style={{ display: "grid", gap: 6 }}>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>Model catalog</button>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>Pricing rules</button>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>Users and credits</button>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>Refund queue</button>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>Feature flags</button>
            <button className="v6-btn v6-sm" onClick={() => window.location.hash = "#"}>CMS content</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Placeholder ──
function PlaceholderTab({ title, subtitle, message }) {
  return (
    <div className="v6-settings-block" style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <h3>{title}</h3>
      <p className="v6-muted" style={{ fontSize: 12, marginTop: 8 }}>
        {subtitle || message || "This section is coming soon."}
      </p>
    </div>
  );
}

// ── Users Tab ──
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const saveUser = async () => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: editingUser.id, credits: parseInt(editingUser.credits), role: editingUser.role }),
    });
    if (res.ok) { toast.success("User updated"); setEditingUser(null); loadUsers(); }
    else toast.error("Failed to update user");
  };

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading users…</p>;

  return (
    <div>
      <div style={{ overflow: "auto" }}>
        <table className="v6-data-table">
          <thead>
            <tr><th>User</th><th>Email</th><th>Credits</th><th>Role</th><th>Generations</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ transition: "background 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--v6-surface2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
              >
                <td><strong>{u.name || "—"}</strong></td>
                <td>{u.email}</td>
                <td><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle", marginRight: 2 }} /> {u.credits}</td>
                <td><span className="v6-chip" style={{ fontSize: 9, padding: "2px 7px", background: u.role === "admin" ? "var(--v6-accent)" : "var(--v6-surface2)", color: u.role === "admin" ? "#fff" : "var(--v6-muted)", borderColor: u.role === "admin" ? "var(--v6-accent)" : "var(--v6-line)" }}>{u.role}</span></td>
                <td>{u._count?.generations || 0}</td>
                <td className="v6-mono v6-tiny">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td><button className="v6-btn v6-sm" onClick={() => setEditingUser({ ...u })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="v6-settings-block" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Edit: {editingUser.email}</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <div className="v6-field" style={{ flex: "1 1 140px" }}>
              <label className="v6-field-label">Credits</label>
              <input className="v6-input" type="number" value={editingUser.credits} onChange={(e) => setEditingUser({ ...editingUser, credits: e.target.value })} />
            </div>
            <div className="v6-field" style={{ flex: "0 1 120px" }}>
              <label className="v6-field-label">Role</label>
              <div className="v6-select-wrap">
                <select className="v6-input v6-select" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="v6-btn v6-primary v6-sm" onClick={saveUser}>Save</button>
            <button className="v6-btn v6-sm" onClick={() => setEditingUser(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pricing Tab ──
function LegacyPricingTab() {
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPricing, setNewPricing] = useState({ modelId: "", modelType: "image", providerName: "KIE", providerCost: 0, creditsCost: 1 });

  const loadPricing = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/pricing").then((r) => r.json()).then(setPricing).catch(() => toast.error("Failed to load pricing")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadPricing(); }, [loadPricing]);

  const savePricing = async () => {
    if (!newPricing.modelId) { toast.error("Model ID required"); return; }
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newPricing, providerCost: parseFloat(newPricing.providerCost), creditsCost: parseInt(newPricing.creditsCost) }),
    });
    if (res.ok) { toast.success("Pricing set"); setNewPricing({ modelId: "", modelType: "image", providerName: "KIE", providerCost: 0, creditsCost: 1 }); loadPricing(); }
    else toast.error("Failed to set pricing");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Set Model Pricing</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="v6-input" style={{ flex: "1 1 140px" }} placeholder="Model ID (e.g. flux-dev)" value={newPricing.modelId} onChange={(e) => setNewPricing({ ...newPricing, modelId: e.target.value })} />
          <div className="v6-select-wrap" style={{ flex: "0 1 100px" }}>
            <select className="v6-input v6-select" value={newPricing.modelType} onChange={(e) => setNewPricing({ ...newPricing, modelType: e.target.value })}>
              <option>image</option><option>video</option><option>audio</option><option>lipsync</option>
            </select>
            <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <input className="v6-input" style={{ flex: "1 1 120px" }} placeholder="Provider" value={newPricing.providerName} onChange={(e) => setNewPricing({ ...newPricing, providerName: e.target.value })} />
          <input className="v6-input" style={{ flex: "1 1 80px" }} type="number" step="0.0001" placeholder="Cost (€)" value={newPricing.providerCost} onChange={(e) => setNewPricing({ ...newPricing, providerCost: e.target.value })} />
          <input className="v6-input" style={{ flex: "1 1 80px" }} type="number" placeholder="Credits" value={newPricing.creditsCost} onChange={(e) => setNewPricing({ ...newPricing, creditsCost: e.target.value })} />
          <button className="v6-btn v6-primary v6-sm" onClick={savePricing}>Add/Update</button>
        </div>
      </div>

      {loading ? <p className="v6-muted">Loading pricing…</p> : (
        <div className="v6-settings-block">
          <div style={{ overflow: "auto" }}>
            <table className="v6-data-table">
              <thead><tr><th>Model</th><th>Type</th><th>Provider</th><th>Cost</th><th>Credits</th><th>Status</th></tr></thead>
              <tbody>
                {pricing.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--v6-muted)" }}>No custom pricing set. Using defaults.</td></tr>}
                {pricing.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.modelId}</strong></td>
                    <td>{p.modelType}</td>
                    <td>{p.providerName}</td>
                    <td className="v6-mono">€{p.providerCost?.toFixed(4)}</td>
                    <td><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle" }} /> {p.creditsCost}</td>
                    <td><span className="v6-chip" style={{ fontSize: 9, padding: "2px 6px", background: p.isActive ? "var(--v6-good)" : undefined, color: p.isActive ? "var(--v6-bg)" : undefined }}>{p.isActive ? "Active" : "Off"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Providers Tab ──
function LegacyProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProvider, setNewProvider] = useState({ name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true });

  const loadProviders = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/providers").then((r) => r.json()).then(setProviders).catch(() => toast.error("Failed to load providers")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadProviders(); }, [loadProviders]);

  const saveProvider = async () => {
    if (!newProvider.name) { toast.error("Provider name required"); return; }
    const res = await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProvider, markup: parseFloat(newProvider.markup) }),
    });
    if (res.ok) { toast.success("Provider saved"); setNewProvider({ name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true }); loadProviders(); }
    else toast.error("Failed to save provider");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Configure Provider</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input className="v6-input" style={{ flex: "1 1 130px" }} placeholder="Name (e.g. Alibaba)" value={newProvider.name} onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })} />
          <div className="v6-select-wrap" style={{ flex: "0 1 130px" }}>
            <select className="v6-input v6-select" value={newProvider.type} onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value })}>
              <option>image+video</option><option>image</option><option>video</option><option>llm</option><option>image+video+llm</option>
            </select>
            <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <input className="v6-input" style={{ flex: "1 1 120px" }} placeholder="API Key" type="password" value={newProvider.apiKey} onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })} />
          <input className="v6-input" style={{ flex: "1 1 180px" }} placeholder="Base URL" value={newProvider.baseUrl} onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })} />
          <input className="v6-input" style={{ flex: "1 1 70px" }} type="number" step="0.1" placeholder="Markup" value={newProvider.markup} onChange={(e) => setNewProvider({ ...newProvider, markup: e.target.value })} />
          <button className="v6-btn v6-primary v6-sm" onClick={saveProvider}>Save</button>
        </div>
      </div>

      {loading ? <p className="v6-muted">Loading providers…</p> : (
        <div style={{ display: "grid", gap: 8 }}>
          {providers.length === 0 && <p className="v6-muted" style={{ fontSize: 11 }}>No providers configured in DB.</p>}
          {providers.map((p) => (
            <div key={p.id} className="v6-quote">
              <div className="v6-quote-row">
                <strong>{p.name}</strong>
                <span className="v6-chip" style={{ fontSize: 9, padding: "2px 6px" }}>{p.type}</span>
              </div>
              <div className="v6-quote-row">
                <span className="v6-tiny v6-muted">Markup: {p.markup}x</span>
                <span className="v6-chip" style={{ fontSize: 9, padding: "2px 6px", background: p.isActive ? "var(--v6-good)" : undefined, color: p.isActive ? "var(--v6-bg)" : undefined }}>{p.isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feature Flags Tab ──
function LegacyFlagsTab() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFlags = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/flags").then((r) => r.json()).then(setFlags).catch(() => toast.error("Failed to load feature flags")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadFlags(); }, [loadFlags]);

  const toggleFlag = async (flag) => {
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: flag.key, name: flag.name, description: flag.description, enabled: !flag.enabled, config: flag.config }),
    });
    if (res.ok) { toast.success("Flag toggled"); loadFlags(); }
    else toast.error("Failed to toggle flag");
  };

  const addFlag = () => {
    const key = prompt("Flag key (e.g. enable_workflows):");
    if (!key) return;
    const name = prompt("Flag name:") || key;
    fetch("/api/admin/flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, name, description: "", enabled: false }) })
      .then((res) => { if (res.ok) { toast.success("Flag created"); loadFlags(); } else toast.error("Failed to create flag"); })
      .catch(() => toast.error("Failed to create flag"));
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button className="v6-btn v6-primary v6-sm" onClick={addFlag} style={{ justifySelf: "flex-start" }}>Add Flag</button>
      {loading ? <p className="v6-muted">Loading feature flags…</p> : (
        <div style={{ display: "grid", gap: 8 }}>
          {flags.length === 0 && <p className="v6-muted" style={{ fontSize: 11 }}>No feature flags set.</p>}
          {flags.map((f) => (
            <div key={f.id} className="v6-quote" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 12 }}>{f.name}</strong>
                <span className="v6-mono v6-tiny v6-muted" style={{ marginLeft: 8 }}>{f.key}</span>
                {f.description && <p className="v6-tiny v6-muted" style={{ margin: "4px 0 0" }}>{f.description}</p>}
              </div>
              <button
                onClick={() => toggleFlag(f)}
                className="v6-toggle"
                style={{ border: 0, background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer", width: "auto", flexShrink: 0 }}
              >
                <div className={`v6-toggle-track ${f.enabled ? "v6-on" : ""}`}>
                  <div className="v6-toggle-thumb" />
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audit Logs Tab ──
function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/audit").then((r) => r.json()).then(setLogs).catch(() => toast.error("Failed to load audit logs")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading audit logs…</p>;

  return (
    <div style={{ overflow: "auto" }}>
      <table className="v6-data-table">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="v6-mono v6-tiny">{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.user?.email || "—"}</td>
              <td><span className="v6-chip" style={{ fontSize: 9, padding: "2px 6px" }}>{log.action}</span></td>
              <td>{log.resource || "—"}</td>
              <td className="v6-mono v6-tiny v6-muted" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p className="v6-muted" style={{ padding: 16, fontSize: 11 }}>No audit logs yet.</p>}
    </div>
  );
}

// ── Revenue Tab ──
function RevenueTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics").then((r) => r.json()).then(setData).catch(() => toast.error("Failed to load revenue data")).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading revenue data…</p>;

  const totals = data?.totals || {};
  const marginByTool = data?.marginByTool || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-metric-grid v6-stagger">
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Total Revenue</span><strong style={{ color: "var(--v6-good)" }}>€{(totals.retailValue || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Provider Cost</span><strong>€{(totals.providerCost || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Gross Profit</span><strong style={{ color: "var(--v6-good)" }}>€{(totals.profit || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Margin %</span><strong>{totals.marginPct || 0}%</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Credits Granted</span><strong>{(totals.creditsGranted || 0).toLocaleString()}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Credits Consumed</span><strong>{(totals.creditsUsed || 0).toLocaleString()}</strong></div>
      </div>

      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Revenue vs Cost by Tool (30 days)</h3>
        <div style={{ overflow: "auto" }}>
          <table className="v6-data-table">
            <thead><tr><th>Tool</th><th>Gens</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Margin %</th></tr></thead>
            <tbody>
              {marginByTool.map((t) => (
                <tr key={t.tool}>
                  <td>{t.tool}</td>
                  <td>{t.generations}</td>
                  <td className="v6-mono">€{t.revenue.toFixed(2)}</td>
                  <td className="v6-mono">€{t.cost.toFixed(2)}</td>
                  <td className="v6-mono" style={{ color: t.margin >= 0 ? "var(--v6-good)" : "var(--v6-bad)" }}>€{t.margin.toFixed(2)}</td>
                  <td>{t.marginPct}%</td>
                </tr>
              ))}
              {marginByTool.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--v6-muted)" }}>No data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Margin Advisor Tab ──
function MarginAdvisorTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics").then((r) => r.json()).then(setData).catch(() => toast.error("Failed to load margin data")).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading margin advisor…</p>;

  const totals = data?.totals || {};
  const modelMargins = data?.modelMargins || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-metric-grid v6-stagger">
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Retail Value</span><strong style={{ color: "var(--v6-good)" }}>€{(totals.retailValue || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Provider Cost</span><strong>€{(totals.providerCost || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Gross Margin</span><strong style={{ color: "var(--v6-good)" }}>€{(totals.profit || 0).toFixed(2)}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Margin %</span><strong>{totals.marginPct || 0}%</strong></div>
      </div>

      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Top Models by Margin (30 days)</h3>
        <div style={{ overflow: "auto" }}>
          <table className="v6-data-table">
            <thead><tr><th>Model</th><th>Gens</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Margin %</th></tr></thead>
            <tbody>
              {modelMargins.map((m) => (
                <tr key={m.model}>
                  <td>{m.model}</td>
                  <td>{m.generations}</td>
                  <td className="v6-mono">€{m.revenue.toFixed(2)}</td>
                  <td className="v6-mono">€{m.cost.toFixed(2)}</td>
                  <td className="v6-mono" style={{ color: m.margin >= 0 ? "var(--v6-good)" : "var(--v6-bad)" }}>€{m.margin.toFixed(2)}</td>
                  <td>{m.marginPct}%</td>
                </tr>
              ))}
              {modelMargins.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--v6-muted)" }}>No generation data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Generations Tab ──
function GenerationsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics").then((r) => r.json()).then(setData).catch(() => toast.error("Failed to load generation data")).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading generation data…</p>;

  const totals = data?.totals || {};
  const byTool = data?.byTool || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-metric-grid v6-stagger">
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Total Generations</span><strong>{totals.generations || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Completed</span><strong style={{ color: "var(--v6-good)" }}>{totals.completed || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Failed</span><strong style={{ color: "var(--v6-bad)" }}>{totals.failed || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Success Rate</span><strong>{totals.successRate || 0}%</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Total Credits</span><strong>{totals.creditsUsed || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow" style={{ display: "block" }}>Provider Cost</span><strong className="v6-mono">€{(totals.providerCost || 0).toFixed(2)}</strong></div>
      </div>

      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 12px" }}>Usage by Tool (30 days)</h3>
        {byTool.length === 0 ? <p className="v6-muted" style={{ fontSize: 11 }}>No generation data yet.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {byTool.map((t) => (
              <div key={t.tool} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, minWidth: 110 }}>{t.tool}</span>
                <div style={{ flex: 1, height: 6, background: "var(--v6-surface2)", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--v6-accent)", borderRadius: 99, width: `${Math.min(100, (t._count / (totals.generations || 1)) * 100)}%`, transition: "width 0.3s" }} />
                </div>
                <span className="v6-mono v6-tiny" style={{ minWidth: 40, textAlign: "right" }}>{t._count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Jobs Tab ──
function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/jobs").then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); }).then(setJobs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading jobs…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-metric-grid">
        <div className="v6-metric"><span className="v6-eyebrow">Active Jobs</span><strong>{jobs.active || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow">Queued</span><strong>{jobs.queued || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow">Failed Today</span><strong style={{ color: "var(--v6-bad)" }}>{jobs.failedToday || 0}</strong></div>
        <div className="v6-metric"><span className="v6-eyebrow">Avg Wait</span><strong>{jobs.avgWaitMs ? `${(jobs.avgWaitMs / 1000).toFixed(1)}s` : "—"}</strong></div>
      </div>
      {(!jobs.recent || jobs.recent.length === 0) ? (
        <p className="v6-muted" style={{ fontSize: 11 }}>Job tracking API not yet available. Active jobs will appear here.</p>
      ) : (
        <div style={{ overflow: "auto" }}>
          <table className="v6-data-table">
            <thead><tr><th>Job ID</th><th>Tool</th><th>Status</th><th>User</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.recent.map((j) => (
                <tr key={j.id || j.jobId}>
                  <td className="v6-mono v6-tiny">{(j.id || j.jobId || "").slice(0, 12)}…</td>
                  <td>{j.tool || "—"}</td>
                  <td><span className="v6-chip" style={{ fontSize: 9, padding: "2px 6px", background: j.status === "completed" ? "var(--v6-good)" : j.status === "failed" ? "var(--v6-bad)" : "var(--v6-warn)", color: j.status === "failed" ? "#fff" : "var(--v6-bg)" }}>{j.status}</span></td>
                  <td>{j.user?.email || "—"}</td>
                  <td className="v6-mono v6-tiny">{j.createdAt ? new Date(j.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Provider Health Tab ──
function ProviderHealthTab() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/provider-health").then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); }).then(setHealth).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading provider health…</p>;

  return (
    <div>
      <div className="v6-panel-title"><h3>Provider Health</h3></div>
      <div style={{ overflow: "auto" }}>
        <table className="v6-data-table">
          <thead><tr><th>Provider</th><th>Models</th><th>Latency</th><th>Success Rate</th><th>Status</th></tr></thead>
          <tbody>
            {(health?.providers || []).map((p) => (
              <tr key={p.name}>
                <td><strong>{p.name}</strong></td>
                <td className="v6-mono v6-tiny">{p.modelCount || "—"}</td>
                <td className="v6-mono">{p.latencyMs ? `${p.latencyMs}ms` : "—"}</td>
                <td>{p.successRate != null ? `${(p.successRate * 100).toFixed(1)}%` : "—"}</td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: p.healthy ? "var(--v6-good)" : "var(--v6-bad)",
                      boxShadow: p.healthy ? "0 0 6px var(--v6-good)" : "0 0 6px var(--v6-bad)",
                      flexShrink: 0,
                    }} />
                    {p.healthy ? "Healthy" : "Down"}
                  </span>
                </td>
              </tr>
            ))}
            {(!health?.providers || health.providers.length === 0) && (
              <tr><td colSpan="5" style={{ textAlign: "center", color: "var(--v6-muted)", padding: 16 }}>Provider health monitoring not yet configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Announcements Tab ──
function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/announcements").then((r) => { if (!r.ok) throw new Error("Not found"); return r.json(); }).then(setAnnouncements).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="v6-muted" style={{ padding: 20 }}>Loading announcements…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="v6-settings-block">
        <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Create Announcement</h3>
        <p className="v6-tiny v6-muted" style={{ marginBottom: 10 }}>Announcements API coming soon.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input className="v6-input" style={{ flex: "1 1 200px" }} placeholder="Message" disabled />
          <div className="v6-select-wrap" style={{ flex: "0 1 100px" }}>
            <select className="v6-input v6-select" disabled><option>Info</option></select>
            <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
          <button className="v6-btn v6-primary v6-sm" disabled>Create</button>
        </div>
      </div>
      {announcements.length === 0 && <p className="v6-muted" style={{ fontSize: 11 }}>No announcements yet.</p>}
      {announcements.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {announcements.map((a) => (
            <div key={a.id} className="v6-quote">
              <div className="v6-quote-row"><strong>{a.message}</strong></div>
              <div className="v6-quote-row"><span className="v6-tiny v6-muted">{a.style} · {a.dates}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
