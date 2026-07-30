"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import {
  IconChevron, IconBolt, IconSparkle, IconSearch
} from "@/components/Icons";
import OverviewDashboard from "./OverviewDashboard";
import ModelManager from "./ModelManager";
import PlanEditor from "./PlanEditor";
import PromoManager from "./PromoManager";
import CmsEditor from "./CmsEditor";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const TOP_LEVEL_TABS = [
  { id: "overview", label: "Overview", icon: "OV" },
  {
    id: "business",
    label: "Business",
    icon: "BU",
    subs: ["Revenue", "Plans", "Credit Packs", "Promo Codes", "Pricing", "Margin Advisor"],
  },
  {
    id: "ai-platform",
    label: "AI Platform",
    icon: "AI",
    subs: ["Models", "Routes", "Providers", "Prompt Guides", "Quality", "Generations", "Director"],
  },
  { id: "users", label: "Users", icon: "US" },
  {
    id: "content",
    label: "Content",
    icon: "CO",
    subs: ["Website Content", "Announcements"],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "OP",
    subs: ["Jobs", "Provider Health", "Feature Flags", "Audit Logs"],
  },
];

export default function AdminShell() {
  const [topTab, setTopTab] = useState("overview");
  const [subTab, setSubTab] = useState(null);
  const [expandedTab, setExpandedTab] = useState(null);

  // Change top tab — also open subs if available
  const selectTopTab = (tabId) => {
    setTopTab(tabId);
    const tab = TOP_LEVEL_TABS.find((t) => t.id === tabId);
    if (tab?.subs?.length > 0) {
      setExpandedTab(tabId);
      setSubTab(null); // let user pick a sub
    } else {
      setExpandedTab(null);
      setSubTab(null);
    }
  };

  const selectSubTab = (sub) => {
    setSubTab(sub);
  };

  const currentTopTab = TOP_LEVEL_TABS.find((t) => t.id === topTab);

  return (
    <div className="universe-page-shell">
      <UniverseNav />
      <div className="universe-page-shell__content">
      <div className="admin-universe admin">
        <div className="admin__header">
          <h1>Admin Panel</h1>
          <p>Manage users, credits, models, pricing, content, and operations.</p>
        </div>

        {/* Top-level tab bar */}
        <div className="admin__tabs" style={{ marginBottom: "0.5rem" }}>
          {TOP_LEVEL_TABS.map((t) => (
            <button
              key={t.id}
              className={`admin__tab ${topTab === t.id ? "admin__tab--active" : ""}`}
              style={topTab === t.id ? {} : {}}
              onClick={() => selectTopTab(t.id)}
            >
              <span style={{ marginRight: "0.35rem" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Sub-tab bar (if expanded) */}
        <AnimatePresence mode="wait">
          {currentTopTab?.subs?.length > 0 && (
            <motion.div
              key={`subs-${topTab}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="admin__tabs"
              style={{ marginBottom: "1rem", marginTop: "0.25rem" }}
            >
              {currentTopTab.subs.map((sub) => (
                <button
                  key={sub}
                  className={`admin__tab ${subTab === sub ? "admin__tab--active" : ""}`}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.4rem 0.75rem",
                    borderColor: subTab === sub ? "rgba(124, 58, 237, 0.3)" : undefined,
                    ...(subTab === sub
                      ? { background: "rgba(124, 58, 237, 0.08)", color: "#7C3AED" }
                      : {}),
                  }}
                  onClick={() => selectSubTab(sub)}
                >
                  {sub}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content body */}
        <motion.div
          key={`${topTab}-${subTab || "none"}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="admin__body"
        >
          <AdminContent topTab={topTab} subTab={subTab} />
        </motion.div>
      </div>
      </div>
    </div>
  );
}

// ── Content router ──
function AdminContent({ topTab, subTab }) {
  // Overview
  if (topTab === "overview") return <OverviewDashboard />;

  // Business
  if (topTab === "business") {
    if (subTab === "Pricing") return <LegacyPricingTab />;
    if (subTab === "Plans") return <PlanEditor type="plans" />;
    if (subTab === "Credit Packs") return <PlanEditor type="credit-packs" />;
    if (subTab === "Promo Codes") return <PromoManager />;
    if (subTab === "Revenue") return <RevenueTab />;
    if (subTab === "Margin Advisor") return <MarginAdvisorTab />;
    return <PlaceholderTab title="Business" message="Select a sub-tab above: Revenue, Plans, Credit Packs, Promo Codes, Pricing, or Margin Advisor." />;
  }

  // AI Platform
  if (topTab === "ai-platform") {
    if (subTab === "Models") return <ModelManager />;
    if (subTab === "Providers") return <LegacyProvidersTab />;
    if (subTab === "Prompts Guide") return <PlaceholderTab title="Prompt Guides" subtitle="Model-specific prompt guide registry — coming soon." />;
    if (subTab === "Quality") return <PlaceholderTab title="Quality" subtitle="Quality gate configuration and benchmarks — coming soon." />;
    if (subTab === "Generations") return <GenerationsTab />;
    if (subTab === "Director") return <PlaceholderTab title="Director" subtitle="Director pipeline management — coming soon." />;
    if (subTab === "Routes") return <PlaceholderTab title="Routes" subtitle="Model routing configuration — coming soon." />;
    return <PlaceholderTab title="AI Platform" message="Select a sub-tab above: Models, Routes, Providers, Prompt Guides, Quality, Generations, or Director." />;
  }

  // Users
  if (topTab === "users") return <UsersTab />;

  // Content
  if (topTab === "content") {
    if (subTab === "Website Content") return <CmsEditor />;
    if (subTab === "Announcements") return <AnnouncementsTab />;
    return <PlaceholderTab title="Content" message="Select a sub-tab: Website Content or Announcements." />;
  }

  // Operations
  if (topTab === "operations") {
    if (subTab === "Feature Flags") return <LegacyFlagsTab />;
    if (subTab === "Audit Logs") return <AuditLogsTab />;
    if (subTab === "Jobs") return <JobsTab />;
    if (subTab === "Provider Health") return <ProviderHealthTab />;
    return <PlaceholderTab title="Operations" message="Select a sub-tab: Jobs, Provider Health, Feature Flags, or Audit Logs." />;
  }

  return <PlaceholderTab title="Admin" message="Select a tab to begin." />;
}

// ── Reusable Placeholder ──
function PlaceholderTab({ title, subtitle, message }) {
  return (
    <div className="admin__chart" style={{ textAlign: "center", padding: "3rem" }}>
      <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{title}</h3>
      <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.85rem" }}>
        {subtitle || message || "This section is coming soon."}
      </p>
    </div>
  );
}

// ── Legacy sub-tab wrappers (reuse existing API routes) ──

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
      body: JSON.stringify({
        userId: editingUser.id,
        credits: parseInt(editingUser.credits),
        role: editingUser.role,
      }),
    });
    if (res.ok) {
      toast.success("User updated");
      setEditingUser(null);
      loadUsers();
    } else {
      toast.error("Failed to update user");
    }
  };

  if (loading) return <div className="admin__empty"><IconSparkle className="admin__spinner" /> Loading users…</div>;

  return (
    <div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Credits</th><th>Role</th><th>Gen</th><th>Joined</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name || "—"}</td>
                <td>{u.email}</td>
                <td><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle", marginRight: 2 }} /> {u.credits}</td>
                <td><span className={`admin__badge ${u.role === "admin" ? "enabled" : "disabled"}`}>{u.role}</span></td>
                <td>{u._count?.generations || 0}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setEditingUser({ ...u })}
                    style={{ fontSize: "0.75rem" }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="admin__edit-form">
          <h4>Edit: {editingUser.email}</h4>
          <div className="admin__edit-row">
            <div className="field-group">
              <label className="field-label">Credits</label>
              <input
                className="field-input"
                type="number"
                value={editingUser.credits}
                onChange={(e) => setEditingUser({ ...editingUser, credits: e.target.value })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Role</label>
              <select
                className="field-select"
                value={editingUser.role}
                onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <div className="admin__edit-actions">
            <button className="btn btn-primary btn-sm" onClick={saveUser}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingUser(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LegacyPricingTab() {
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPricing, setNewPricing] = useState({
    modelId: "", modelType: "image", providerName: "KIE", providerCost: 0, creditsCost: 1,
  });

  const loadPricing = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then(setPricing)
      .catch(() => toast.error("Failed to load pricing"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPricing(); }, [loadPricing]);

  const savePricing = async () => {
    if (!newPricing.modelId) { toast.error("Model ID required"); return; }
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newPricing,
        providerCost: parseFloat(newPricing.providerCost),
        creditsCost: parseInt(newPricing.creditsCost),
      }),
    });
    if (res.ok) {
      toast.success("Pricing set");
      setNewPricing({ modelId: "", modelType: "image", providerName: "KIE", providerCost: 0, creditsCost: 1 });
      loadPricing();
    } else {
      toast.error("Failed to set pricing");
    }
  };

  return (
    <div>
      <div className="admin__add-form">
        <h4>Set Model Pricing</h4>
        <div className="admin__edit-row">
          <input className="field-input" placeholder="Model ID (e.g. flux-dev)" value={newPricing.modelId} onChange={(e) => setNewPricing({ ...newPricing, modelId: e.target.value })} />
          <select className="field-select" value={newPricing.modelType} onChange={(e) => setNewPricing({ ...newPricing, modelType: e.target.value })}>
            <option>image</option><option>video</option><option>audio</option><option>lipsync</option>
          </select>
          <input className="field-input" placeholder="Provider" value={newPricing.providerName} onChange={(e) => setNewPricing({ ...newPricing, providerName: e.target.value })} />
          <input className="field-input" type="number" step="0.0001" placeholder="Cost (€)" value={newPricing.providerCost} onChange={(e) => setNewPricing({ ...newPricing, providerCost: e.target.value })} />
          <input className="field-input" type="number" placeholder="Credits" value={newPricing.creditsCost} onChange={(e) => setNewPricing({ ...newPricing, creditsCost: e.target.value })} />
          <button className="btn btn-primary btn-sm" onClick={savePricing}>Add/Update</button>
        </div>
      </div>
      {loading ? (
        <div className="admin__empty">Loading pricing…</div>
      ) : (
        <div className="admin__pricing-list">
          {pricing.length === 0 && <p className="admin__empty">No custom pricing set. Using defaults with 2.5x markup.</p>}
          {pricing.map((p) => (
            <div key={p.id} className="admin__pricing-row">
              <span><strong>{p.modelId}</strong></span>
              <span>{p.modelType}</span>
              <span>{p.providerName}</span>
              <span>€{p.providerCost?.toFixed(4)}</span>
              <span><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle" }} /> {p.creditsCost}</span>
              <span className={`admin__badge ${p.isActive ? "enabled" : "disabled"}`}>{p.isActive ? "Active" : "Off"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyProvidersTab() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProvider, setNewProvider] = useState({
    name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true,
  });

  const loadProviders = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => toast.error("Failed to load providers"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProviders(); }, [loadProviders]);

  const saveProvider = async () => {
    if (!newProvider.name) { toast.error("Provider name required"); return; }
    const res = await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProvider, markup: parseFloat(newProvider.markup) }),
    });
    if (res.ok) {
      toast.success("Provider saved");
      setNewProvider({ name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true });
      loadProviders();
    } else {
      toast.error("Failed to save provider");
    }
  };

  return (
    <div>
      <div className="admin__add-form">
        <h4>Configure Provider</h4>
        <div className="admin__edit-row">
          <input className="field-input" placeholder="Name (e.g. Alibaba)" value={newProvider.name} onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })} />
          <select className="field-select" value={newProvider.type} onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value })}>
            <option>image+video</option><option>image</option><option>video</option><option>llm</option><option>image+video+llm</option>
          </select>
          <input className="field-input" placeholder="API Key" type="password" value={newProvider.apiKey} onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })} />
          <input className="field-input" placeholder="Base URL" value={newProvider.baseUrl} onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })} />
          <input className="field-input" type="number" step="0.1" placeholder="Markup" value={newProvider.markup} onChange={(e) => setNewProvider({ ...newProvider, markup: e.target.value })} />
          <button className="btn btn-primary btn-sm" onClick={saveProvider}>Save</button>
        </div>
      </div>
      {loading ? (
        <div className="admin__empty">Loading providers…</div>
      ) : (
        <div className="admin__providers">
          {providers.length === 0 && <p className="admin__empty">No providers configured in DB.</p>}
          {providers.map((p) => (
            <div key={p.id} className="admin__provider">
              <div><strong>{p.name}</strong> <span className="admin__badge">{p.type}</span></div>
              <div>Markup: {p.markup}x</div>
              <span className={`admin__badge ${p.isActive ? "enabled" : "disabled"}`}>{p.isActive ? "Active" : "Inactive"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyFlagsTab() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFlags = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/flags")
      .then((r) => r.json())
      .then(setFlags)
      .catch(() => toast.error("Failed to load feature flags"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  const toggleFlag = async (flag) => {
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: flag.key, name: flag.name, description: flag.description, enabled: !flag.enabled, config: flag.config }),
    });
    if (res.ok) {
      toast.success("Flag toggled");
      loadFlags();
    } else {
      toast.error("Failed to toggle flag");
    }
  };

  const addFlag = () => {
    const key = prompt("Flag key (e.g. enable_workflows):");
    if (!key) return;
    const name = prompt("Flag name:") || key;
    fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, description: "", enabled: false }),
    })
      .then((res) => {
        if (res.ok) { toast.success("Flag created"); loadFlags(); }
        else toast.error("Failed to create flag");
      })
      .catch(() => toast.error("Failed to create flag"));
  };

  return (
    <div>
      <div className="admin__add-form">
        <button className="btn btn-primary btn-sm" onClick={addFlag}>Add Flag</button>
      </div>
      {loading ? (
        <div className="admin__empty">Loading feature flags…</div>
      ) : (
        <div className="admin__flags">
          {flags.length === 0 && <p className="admin__empty">No feature flags set.</p>}
          {flags.map((f) => (
            <div key={f.id} className="admin__flag">
              <div><strong>{f.name}</strong> <span style={{ fontSize: "0.7rem", color: "rgba(242,242,247,0.4)" }}>{f.key}</span></div>
              <div style={{ fontSize: "0.75rem", color: "rgba(242,242,247,0.5)" }}>{f.description}</div>
              <button className={`admin__toggle ${f.enabled ? "admin__toggle--on" : ""}`} onClick={() => toggleFlag(f)}>
                <span className="admin__toggle-knob" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then(setLogs)
      .catch(() => toast.error("Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  if (loading) return <div className="admin__empty">Loading audit logs…</div>;

  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td style={{ fontSize: "0.7rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.user?.email || "—"}</td>
              <td><span className="admin__badge">{log.action}</span></td>
              <td>{log.resource || "—"}</td>
              <td style={{ fontSize: "0.7rem", color: "rgba(242,242,247,0.4)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.metadata ? JSON.stringify(log.metadata).slice(0, 100) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p className="admin__empty">No audit logs yet.</p>}
    </div>
  );
}

function RevenueTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load revenue data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading revenue data…</div>;

  const totals = data?.totals || {};
  const marginByTool = data?.marginByTool || [];

  return (
    <div className="admin__overview">
      <div className="admin__stats">
        <div className="admin__stat admin__stat--revenue">
          <span className="admin__stat-label">Total Revenue</span>
          <span className="admin__stat-value">€{(totals.retailValue || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Provider Cost</span>
          <span className="admin__stat-value">€{(totals.providerCost || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat admin__stat--profit">
          <span className="admin__stat-label">Gross Profit</span>
          <span className="admin__stat-value">€{(totals.profit || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Margin %</span>
          <span className="admin__stat-value">{totals.marginPct || 0}%</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Credits Granted</span>
          <span className="admin__stat-value">{(totals.creditsGranted || 0).toLocaleString()}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Credits Consumed</span>
          <span className="admin__stat-value">{(totals.creditsUsed || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="admin__chart">
        <h3>Revenue vs Cost by Tool (30 days)</h3>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Tool</th><th>Gens</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Margin %</th></tr></thead>
            <tbody>
              {marginByTool.map((t) => (
                <tr key={t.tool}>
                  <td>{t.tool}</td>
                  <td>{t.generations}</td>
                  <td>€{t.revenue.toFixed(2)}</td>
                  <td>€{t.cost.toFixed(2)}</td>
                  <td style={{ color: t.margin >= 0 ? "#00d68f" : "#ff3d71" }}>€{t.margin.toFixed(2)}</td>
                  <td>{t.marginPct}%</td>
                </tr>
              ))}
              {marginByTool.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: "center", color: "rgba(242,242,247,0.4)" }}>No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MarginAdvisorTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load margin data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading margin advisor…</div>;

  const totals = data?.totals || {};
  const modelMargins = data?.modelMargins || [];

  return (
    <div className="admin__overview">
      <div className="admin__stats">
        <div className="admin__stat admin__stat--revenue">
          <span className="admin__stat-label">Retail Value</span>
          <span className="admin__stat-value">€{(totals.retailValue || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Provider Cost</span>
          <span className="admin__stat-value">€{(totals.providerCost || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat admin__stat--profit">
          <span className="admin__stat-label">Gross Margin</span>
          <span className="admin__stat-value">€{(totals.profit || 0).toFixed(2)}</span>
        </div>
        <div className="admin__stat">
          <span className="admin__stat-label">Margin %</span>
          <span className="admin__stat-value">{totals.marginPct || 0}%</span>
        </div>
      </div>

      <div className="admin__chart">
        <h3>Top Models by Margin (30 days)</h3>
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Model</th><th>Gens</th><th>Revenue</th><th>Cost</th><th>Margin</th><th>Margin %</th></tr></thead>
            <tbody>
              {modelMargins.map((m) => (
                <tr key={m.model}>
                  <td>{m.model}</td>
                  <td>{m.generations}</td>
                  <td>€{m.revenue.toFixed(2)}</td>
                  <td>€{m.cost.toFixed(2)}</td>
                  <td style={{ color: m.margin >= 0 ? "#00d68f" : "#ff3d71" }}>€{m.margin.toFixed(2)}</td>
                  <td>{m.marginPct}%</td>
                </tr>
              ))}
              {modelMargins.length === 0 && (
                <tr><td colSpan="6" style={{ textAlign: "center", color: "rgba(242,242,247,0.4)" }}>No generation data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GenerationsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load generation data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading generation data…</div>;

  const totals = data?.totals || {};
  const byTool = data?.byTool || [];

  return (
    <div className="admin__overview">
      <div className="admin__stats">
        <div className="admin__stat"><span className="admin__stat-label">Total Generations</span><span className="admin__stat-value">{totals.generations || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Completed</span><span className="admin__stat-value">{totals.completed || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Failed</span><span className="admin__stat-value">{totals.failed || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Success Rate</span><span className="admin__stat-value">{totals.successRate || 0}%</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Total Credits</span><span className="admin__stat-value">{totals.creditsUsed || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Provider Cost</span><span className="admin__stat-value">€{(totals.providerCost || 0).toFixed(2)}</span></div>
      </div>

      <div className="admin__chart">
        <h3>Usage by Tool (30 days)</h3>
        <div className="admin__bars">
          {byTool.map((t) => (
            <div key={t.tool} className="admin__bar">
              <span className="admin__bar-label">{t.tool}</span>
              <span className="admin__bar-track">
                <span
                  className="admin__bar-fill"
                  style={{ width: `${Math.min(100, (t._count / (totals.generations || 1)) * 100)}%` }}
                />
              </span>
              <span className="admin__bar-count">{t._count}</span>
            </div>
          ))}
          {byTool.length === 0 && <p className="admin__empty" style={{ padding: "1rem" }}>No generation data yet.</p>}
        </div>
      </div>
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/jobs")
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setJobs)
      .catch(() => { /* API may not exist yet */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading jobs…</div>;

  return (
    <div>
      <div className="admin__stats" style={{ marginBottom: "1.5rem" }}>
        <div className="admin__stat"><span className="admin__stat-label">Active Jobs</span><span className="admin__stat-value">{jobs.active || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Queued</span><span className="admin__stat-value">{jobs.queued || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Failed Today</span><span className="admin__stat-value">{jobs.failedToday || 0}</span></div>
        <div className="admin__stat"><span className="admin__stat-label">Avg Wait</span><span className="admin__stat-value">{jobs.avgWaitMs ? `${(jobs.avgWaitMs / 1000).toFixed(1)}s` : "—"}</span></div>
      </div>
      {(!jobs.recent || jobs.recent.length === 0) && (
        <p className="admin__empty">Job tracking API not yet available. Active jobs will appear here.</p>
      )}
      {(jobs.recent || []).length > 0 && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead><tr><th>Job ID</th><th>Tool</th><th>Status</th><th>User</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.recent.map((j) => (
                <tr key={j.id || j.jobId}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>{(j.id || j.jobId || "").slice(0, 12)}…</td>
                  <td>{j.tool || "—"}</td>
                  <td><span className={`admin__badge ${j.status === "completed" ? "enabled" : j.status === "failed" ? "disabled" : "pending"}`}>{j.status}</span></td>
                  <td>{j.user?.email || "—"}</td>
                  <td style={{ fontSize: "0.7rem" }}>{j.createdAt ? new Date(j.createdAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProviderHealthTab() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/provider-health")
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setHealth)
      .catch(() => { /* API may not exist yet */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading provider health…</div>;

  return (
    <div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead><tr><th>Provider</th><th>Status</th><th>Latency</th><th>Success Rate</th><th>Error Rate</th><th>429 Rate</th><th>Last Check</th></tr></thead>
          <tbody>
            {(health?.providers || []).map((p) => (
              <tr key={p.name}>
                <td><strong>{p.name}</strong></td>
                <td><span className={`admin__badge ${p.healthy ? "enabled" : "disabled"}`}>{p.healthy ? "Healthy" : "Down"}</span></td>
                <td>{p.latencyMs ? `${p.latencyMs}ms` : "—"}</td>
                <td>{p.successRate != null ? `${(p.successRate * 100).toFixed(1)}%` : "—"}</td>
                <td>{p.errorRate != null ? `${(p.errorRate * 100).toFixed(1)}%` : "—"}</td>
                <td>{p.rateLimitRate != null ? `${(p.rateLimitRate * 100).toFixed(1)}%` : "—"}</td>
                <td style={{ fontSize: "0.7rem" }}>{p.lastCheck ? new Date(p.lastCheck).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(!health?.providers || health.providers.length === 0) && (
        <p className="admin__empty">Provider health monitoring not yet configured. Data will appear when providers report health checks.</p>
      )}
    </div>
  );
}

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/announcements")
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setAnnouncements)
      .catch(() => { /* API may not exist yet */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="admin__empty">Loading announcements…</div>;

  return (
    <div>
      <div className="admin__add-form">
        <h4>Create Announcement</h4>
        <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          Announcements API coming soon. Use this space to manage in-app banners and notifications.
        </p>
        <div className="admin__edit-row">
          <input className="field-input" placeholder="Message" disabled />
          <select className="field-select" disabled><option>Info</option></select>
          <button className="btn btn-primary btn-sm" disabled>Create</button>
        </div>
      </div>
      {announcements.length === 0 && (
        <p className="admin__empty">No announcements yet.</p>
      )}
      {announcements.length > 0 && (
        <div className="admin__flags">
          {announcements.map((a) => (
            <div key={a.id} className="admin__flag">
              <div><strong>{a.message}</strong></div>
              <div style={{ fontSize: "0.75rem", color: "rgba(242,242,247,0.5)" }}>{a.style} · {a.dates}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
