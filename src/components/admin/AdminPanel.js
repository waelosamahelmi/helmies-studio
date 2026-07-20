"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { IconBolt, IconUsers, IconStar } from "@/components/Icons";

const TABS = ["Overview", "Users", "Models", "Pricing", "Providers", "Analytics", "Refunds", "Audit Logs", "Feature Flags"];

export default function AdminPanel() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState({ totals: {}, byTool: [] });
  const [users, setUsers] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [providers, setProviders] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [flags, setFlags] = useState([]);
  const [models, setModels] = useState([]);
  const [modelFilter, setModelFilter] = useState("all");
  const [auditLogs, setAuditLogs] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [newPricing, setNewPricing] = useState({ modelId: "", modelType: "image", providerName: "MuAPI", providerCost: 0, creditsCost: 1 });
  const [newProvider, setNewProvider] = useState({ name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true });
  const [newRefund, setNewRefund] = useState({ userId: "", amount: 0, reason: "" });
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadOverview = useCallback(() => {
    fetch("/api/admin/analytics").then((r) => r.json()).then(setData).catch(() => {});
  }, []);
  const loadUsers = useCallback(() => {
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers).catch(() => {});
  }, []);
  const loadPricing = useCallback(() => {
    fetch("/api/admin/pricing").then((r) => r.json()).then(setPricing).catch(() => {});
  }, []);
  const loadProviders = useCallback(() => {
    fetch("/api/admin/providers").then((r) => r.json()).then(setProviders).catch(() => {});
  }, []);
  const loadRefunds = useCallback(() => {
    fetch("/api/admin/refunds").then((r) => r.json()).then(setRefunds).catch(() => {});
  }, []);
  const loadFlags = useCallback(() => {
    fetch("/api/admin/flags").then((r) => r.json()).then(setFlags).catch(() => {});
  }, []);
  const loadModels = useCallback(() => {
    fetch("/api/admin/models").then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, []);
  const loadAudit = useCallback(() => {
    fetch("/api/admin/audit").then((r) => r.json()).then(setAuditLogs).catch(() => {});
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (tab === "Users") loadUsers();
    if (tab === "Pricing") loadPricing();
    if (tab === "Providers") loadProviders();
    if (tab === "Refunds") loadRefunds();
    if (tab === "Feature Flags") loadFlags();
    if (tab === "Models") loadModels();
    if (tab === "Audit Logs") loadAudit();
  }, [tab, loadUsers, loadPricing, loadProviders, loadRefunds, loadFlags]);

  // ── User editing ──
  const saveUser = async () => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: editingUser.id, credits: parseInt(editingUser.credits), role: editingUser.role }),
    });
    if (res.ok) { showToast("User updated"); setEditingUser(null); loadUsers(); }
  };

  // ── Pricing ──
  const savePricing = async () => {
    if (!newPricing.modelId) { showToast("Model ID required"); return; }
    const res = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newPricing,
        providerCost: parseFloat(newPricing.providerCost),
        creditsCost: parseInt(newPricing.creditsCost),
      }),
    });
    if (res.ok) { showToast("Pricing set"); setNewPricing({ modelId: "", modelType: "image", providerName: "MuAPI", providerCost: 0, creditsCost: 1 }); loadPricing(); }
  };

  // ── Providers ──
  const saveProvider = async () => {
    if (!newProvider.name) { showToast("Provider name required"); return; }
    const res = await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newProvider, markup: parseFloat(newProvider.markup) }),
    });
    if (res.ok) { showToast("Provider saved"); setNewProvider({ name: "", type: "image+video", apiKey: "", baseUrl: "", markup: 2.5, isActive: true }); loadProviders(); }
  };

  // ── Refunds ──
  const issueRefund = async () => {
    if (!newRefund.userId || !newRefund.amount) { showToast("User ID and amount required"); return; }
    const res = await fetch("/api/admin/refunds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newRefund, amount: parseInt(newRefund.amount) }),
    });
    if (res.ok) { showToast("Refund issued"); setNewRefund({ userId: "", amount: 0, reason: "" }); loadRefunds(); }
  };

  // ── Feature flags ──
  const toggleFlag = async (flag) => {
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: flag.key, name: flag.name, description: flag.description, enabled: !flag.enabled, config: flag.config }),
    });
    if (res.ok) { showToast("Flag toggled"); loadFlags(); }
  };

  const addFlag = async () => {
    const key = prompt("Flag key (e.g. enable_workflows):");
    if (!key) return;
    const name = prompt("Flag name:");
    const res = await fetch("/api/admin/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name: name || key, description: "", enabled: false }),
    });
    if (res.ok) { showToast("Flag created"); loadFlags(); }
  };

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
            <button key={t} className={`admin__tab ${tab === t ? "admin__tab--active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {toast && <div className="admin__toast">{toast}</div>}

        <div className="admin__body">
          {/* ── Overview ── */}
          {tab === "Overview" && (
            <div className="admin__overview">
              <div className="admin__stats">
                <div className="admin__stat"><span className="admin__stat-label">Users</span><span className="admin__stat-value">{data.totals?.users || 0}</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Generations</span><span className="admin__stat-value">{data.totals?.generations || 0}</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Success Rate</span><span className="admin__stat-value">{data.totals?.successRate || 0}%</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Credits Used</span><span className="admin__stat-value">{data.totals?.creditsUsed || 0}</span></div>
                <div className="admin__stat admin__stat--revenue"><span className="admin__stat-label">Revenue</span><span className="admin__stat-value">€{(data.totals?.revenue || 0).toFixed(2)}</span></div>
                <div className="admin__stat admin__stat--profit"><span className="admin__stat-label">Profit</span><span className="admin__stat-value">€{(data.totals?.profit || 0).toFixed(2)}</span></div>
              </div>
              <div className="admin__chart">
                <h3>Usage by Tool (30 days)</h3>
                <div className="admin__bars">
                  {(data.byTool || []).map((t) => (
                    <div key={t.tool} className="admin__bar">
                      <span className="admin__bar-label">{t.tool}</span>
                      <span className="admin__bar-track"><span className="admin__bar-fill" style={{ width: `${Math.min(100, (t._count / (data.totals?.generations || 1)) * 100)}%` }} /></span>
                      <span className="admin__bar-count">{t._count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Users ── */}
          {tab === "Users" && (
            <div>
              <div className="admin__table-wrap">
                <table className="admin__table">
                  <thead><tr><th>Name</th><th>Email</th><th>Credits</th><th>Role</th><th>Gen</th><th>Joined</th><th></th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name || "—"}</td>
                        <td>{u.email}</td>
                        <td><IconBolt /> {u.credits}</td>
                        <td><span className={`admin__badge ${u.role === "admin" ? "enabled" : "disabled"}`}>{u.role}</span></td>
                        <td>{u._count?.generations || 0}</td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td><button className="btn btn-sm btn-secondary" onClick={() => setEditingUser({ ...u })}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editingUser && (
                <div className="admin__edit-form">
                  <h4>Edit: {editingUser.email}</h4>
                  <div className="admin__edit-row">
                    <div className="field-group"><label className="field-label">Credits</label><input className="field-input" type="number" value={editingUser.credits} onChange={(e) => setEditingUser({ ...editingUser, credits: e.target.value })} /></div>
                    <div className="field-group"><label className="field-label">Role</label><select className="field-select" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></select></div>
                  </div>
                  <div className="admin__edit-actions">
                    <button className="btn btn-primary btn-sm" onClick={saveUser}>Save</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingUser(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Models ── */}
          {tab === "Models" && (
            <div>
              <div className="admin__add-form">
                <div className="admin__edit-row">
                  {["all", "image", "i2i", "video", "i2v", "v2v", "lipsync", "recast", "audio"].map((c) => (
                    <button key={c} className={`pill ${modelFilter === c ? "pill--active" : ""}`} onClick={() => setModelFilter(c)}>{c}</button>
                  ))}
                </div>
              </div>
              <div className="admin__models-count">
                {models.filter((m) => modelFilter === "all" || m.category === modelFilter).length} models
              </div>
              <div className="admin__table-wrap">
                <table className="admin__table">
                  <thead><tr><th>Model</th><th>Provider</th><th>Category</th><th>Credits</th><th>Cost</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {models.filter((m) => modelFilter === "all" || m.category === modelFilter).map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong><br /><span style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.3)" }}>{m.id}</span></td>
                        <td>{m.provider}</td>
                        <td><span className="admin__badge">{m.category}</span></td>
                        <td>{m.creditsCost ? <><IconBolt /> {m.creditsCost}</> : "default"}</td>
                        <td>{m.providerCost ? `€${m.providerCost.toFixed(4)}` : "—"}</td>
                        <td><span className={`admin__badge ${m.isActive ? "enabled" : "disabled"}`}>{m.isActive ? "Active" : "Off"}</span></td>
                        <td>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={async () => {
                              await fetch("/api/admin/models", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ modelId: m.id, modelType: m.category, providerName: m.provider, isActive: !m.isActive }),
                              });
                              showToast("Model toggled");
                              loadModels();
                            }}
                          >{m.isActive ? "Disable" : "Enable"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Pricing ── */}
          {tab === "Pricing" && (
            <div>
              <div className="admin__add-form">
                <h4>Set Model Pricing</h4>
                <div className="admin__edit-row">
                  <input className="field-input" placeholder="Model ID (e.g. flux-dev)" value={newPricing.modelId} onChange={(e) => setNewPricing({ ...newPricing, modelId: e.target.value })} />
                  <select className="field-select" value={newPricing.modelType} onChange={(e) => setNewPricing({ ...newPricing, modelType: e.target.value })}><option>image</option><option>video</option><option>audio</option><option>lipsync</option></select>
                  <input className="field-input" placeholder="Provider" value={newPricing.providerName} onChange={(e) => setNewPricing({ ...newPricing, providerName: e.target.value })} />
                  <input className="field-input" type="number" step="0.0001" placeholder="Cost (€)" value={newPricing.providerCost} onChange={(e) => setNewPricing({ ...newPricing, providerCost: e.target.value })} />
                  <input className="field-input" type="number" placeholder="Credits" value={newPricing.creditsCost} onChange={(e) => setNewPricing({ ...newPricing, creditsCost: e.target.value })} />
                  <button className="btn btn-primary btn-sm" onClick={savePricing}>Add/Update</button>
                </div>
              </div>
              <div className="admin__pricing-list">
                {pricing.map((p) => (
                  <div key={p.id} className="admin__pricing-row">
                    <span><strong>{p.modelId}</strong></span>
                    <span>{p.modelType}</span>
                    <span>{p.providerName}</span>
                    <span>€{p.providerCost?.toFixed(4)}</span>
                    <span><IconBolt /> {p.creditsCost}</span>
                    <span className={`admin__badge ${p.isActive ? "enabled" : "disabled"}`}>{p.isActive ? "Active" : "Off"}</span>
                  </div>
                ))}
                {pricing.length === 0 && <p className="admin__empty">No custom pricing set. Using defaults with 2.5x markup.</p>}
              </div>
            </div>
          )}

          {/* ── Providers ── */}
          {tab === "Providers" && (
            <div>
              <div className="admin__add-form">
                <h4>Configure Provider</h4>
                <div className="admin__edit-row">
                  <input className="field-input" placeholder="Name (e.g. Atlas)" value={newProvider.name} onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })} />
                  <select className="field-select" value={newProvider.type} onChange={(e) => setNewProvider({ ...newProvider, type: e.target.value })}><option>image+video</option><option>image</option><option>video</option><option>llm</option><option>image+video+llm</option></select>
                  <input className="field-input" placeholder="API Key" value={newProvider.apiKey} onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })} />
                  <input className="field-input" placeholder="Base URL" value={newProvider.baseUrl} onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })} />
                  <input className="field-input" type="number" step="0.1" placeholder="Markup" value={newProvider.markup} onChange={(e) => setNewProvider({ ...newProvider, markup: e.target.value })} />
                  <button className="btn btn-primary btn-sm" onClick={saveProvider}>Save</button>
                </div>
              </div>
              <div className="admin__providers">
                {providers.map((p) => (
                  <div key={p.id} className="admin__provider">
                    <div><strong>{p.name}</strong> <span className="admin__badge">{p.type}</span></div>
                    <div>Markup: {p.markup}x</div>
                    <span className={`admin__badge ${p.isActive ? "enabled" : "disabled"}`}>{p.isActive ? "Active" : "Inactive"}</span>
                  </div>
                ))}
                {providers.length === 0 && <p className="admin__empty">No providers configured in DB. Using MuAPI default (key from .env).</p>}
              </div>
            </div>
          )}

          {/* ── Analytics ── */}
          {tab === "Analytics" && (
            <div className="admin__overview">
              <div className="admin__stats">
                <div className="admin__stat"><span className="admin__stat-label">Total Gen</span><span className="admin__stat-value">{data.totals?.generations || 0}</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Completed</span><span className="admin__stat-value">{data.totals?.completed || 0}</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Failed</span><span className="admin__stat-value">{data.totals?.failed || 0}</span></div>
                <div className="admin__stat"><span className="admin__stat-label">Provider Cost</span><span className="admin__stat-value">€{(data.totals?.providerCost || 0).toFixed(2)}</span></div>
              </div>
            </div>
          )}

          {/* ── Refunds ── */}
          {tab === "Refunds" && (
            <div>
              <div className="admin__add-form">
                <h4>Issue Refund</h4>
                <div className="admin__edit-row">
                  <input className="field-input" placeholder="User ID" value={newRefund.userId} onChange={(e) => setNewRefund({ ...newRefund, userId: e.target.value })} />
                  <input className="field-input" type="number" placeholder="Credits" value={newRefund.amount} onChange={(e) => setNewRefund({ ...newRefund, amount: e.target.value })} />
                  <input className="field-input" placeholder="Reason" value={newRefund.reason} onChange={(e) => setNewRefund({ ...newRefund, reason: e.target.value })} />
                  <button className="btn btn-primary btn-sm" onClick={issueRefund}>Issue</button>
                </div>
              </div>
              <div className="admin__refunds">
                {refunds.map((r) => (
                  <div key={r.id} className="admin__refund">
                    <span><IconBolt /> {r.amount}</span>
                    <span>{r.reason || "No reason"}</span>
                    <span className={`admin__badge ${r.status === "completed" ? "enabled" : "pending"}`}>{r.status}</span>
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
                {refunds.length === 0 && <p className="admin__empty">No refunds yet.</p>}
              </div>
            </div>
          )}

          {/* ── Audit Logs ── */}
          {tab === "Audit Logs" && (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ fontSize: "0.7rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>{log.user?.email || "—"}</td>
                      <td><span className="admin__badge">{log.action}</span></td>
                      <td>{log.resource || "—"}</td>
                      <td style={{ fontSize: "0.7rem", color: "rgba(242,242,247,0.4)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.metadata ? JSON.stringify(log.metadata).slice(0, 100) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditLogs.length === 0 && <p className="admin__empty">No audit logs yet.</p>}
            </div>
          )}

          {/* ── Feature Flags ── */}
          {tab === "Feature Flags" && (
            <div>
              <div className="admin__add-form">
                <button className="btn btn-primary btn-sm" onClick={addFlag}>Add Flag</button>
              </div>
              <div className="admin__flags">
                {flags.map((f) => (
                  <div key={f.id} className="admin__flag">
                    <div><strong>{f.name}</strong> <span style={{ fontSize: "0.7rem", color: "rgba(242,242,247,0.4)" }}>{f.key}</span></div>
                    <div style={{ fontSize: "0.75rem", color: "rgba(242,242,247,0.5)" }}>{f.description}</div>
                    <button className={`admin__toggle ${f.enabled ? "admin__toggle--on" : ""}`} onClick={() => toggleFlag(f)}>
                      <span className="admin__toggle-knob" />
                    </button>
                  </div>
                ))}
                {flags.length === 0 && <p className="admin__empty">No feature flags set.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}