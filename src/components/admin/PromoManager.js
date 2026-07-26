"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconClose, IconBolt } from "@/components/Icons";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const PROMO_TYPES = [
  { value: "percentage", label: "Percentage Discount" },
  { value: "fixed", label: "Fixed Credits Bonus" },
  { value: "bonus", label: "Bonus Credits (additive)" },
];

const ELIGIBILITY_OPTIONS = [
  { value: "all", label: "All Users" },
  { value: "new", label: "New Users Only" },
  { value: "existing", label: "Existing Users Only" },
];

export default function PromoManager() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    code: "",
    type: "percentage",
    value: "",
    eligibility: "all",
    maxUses: "",
    maxUsesPerUser: "1",
    startsAt: "",
    expiresAt: "",
    description: "",
  });

  // Margin guardrail calculation
  const [marginWarning, setMarginWarning] = useState(null);

  const loadPromos = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/promos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setPromos(Array.isArray(d) ? d : d.promos || []))
      .catch((err) => {
        if (!err.message.includes("404")) {
          toast.error("Failed to load promo codes");
        }
        setPromos([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPromos(); }, [loadPromos]);

  const updateForm = (key, value) => {
    const updated = { ...form, [key]: value };
    setForm(updated);

    // Calculate margin guardrail warning
    if (
      (updated.type === "percentage" && parseFloat(updated.value) > 0) ||
      (updated.type === "fixed" && parseInt(updated.value) > 0) ||
      (updated.type === "bonus" && parseInt(updated.value) > 0)
    ) {
      const val = parseFloat(updated.value) || 0;
      let estimatedImpact = 0;
      if (updated.type === "percentage") {
        estimatedImpact = val; // % discount on retail
      } else if (updated.type === "fixed" || updated.type === "bonus") {
        // Rough estimate: fixed credits ≈ value * €0.01
        estimatedImpact = (val * 0.01) * 100;
      }

      if (estimatedImpact > 30) {
        setMarginWarning({
          level: "danger",
          message: `⚠️ Estimated margin impact: ~${estimatedImpact.toFixed(1)}%. This may make some transactions unprofitable.`,
        });
      } else if (estimatedImpact > 15) {
        setMarginWarning({
          level: "warn",
          message: `⚠️ Estimated margin impact: ~${estimatedImpact.toFixed(1)}%. Proceed with caution.`,
        });
      } else {
        setMarginWarning(null);
      }
    } else {
      setMarginWarning(null);
    }
  };

  const createPromo = async (e) => {
    e.preventDefault();
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    if (!form.value || parseFloat(form.value) <= 0) { toast.error("Value is required"); return; }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/promos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          type: form.type,
          value: form.type === "percentage" ? parseFloat(form.value) : parseInt(form.value),
          eligibility: form.eligibility,
          maxUses: form.maxUses ? parseInt(form.maxUses) : null,
          maxUsesPerUser: form.maxUsesPerUser ? parseInt(form.maxUsesPerUser) : 1,
          startsAt: form.startsAt || null,
          expiresAt: form.expiresAt || null,
          description: form.description || null,
        }),
      });
      if (res.ok) {
        toast.success("Promo code created");
        setShowCreate(false);
        setForm({ code: "", type: "percentage", value: "", eligibility: "all", maxUses: "", maxUsesPerUser: "1", startsAt: "", expiresAt: "", description: "" });
        setMarginWarning(null);
        loadPromos();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to create promo code");
      }
    } catch (e) {
      toast.error(`Failed: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const togglePromo = async (promo) => {
    try {
      const res = await fetch("/api/admin/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: promo.id, isActive: !promo.isActive }),
      });
      if (res.ok) {
        toast.success(`Promo ${promo.isActive ? "disabled" : "enabled"}`);
        loadPromos();
      } else {
        toast.error("Toggle failed");
      }
    } catch (e) {
      toast.error(`Toggle failed: ${e.message}`);
    }
  };

  const deletePromo = async (promo) => {
    if (!confirm(`Delete promo "${promo.code}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/promos?id=${promo.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Promo deleted");
        loadPromos();
      } else {
        toast.error("Delete failed");
      }
    } catch (e) {
      toast.error(`Delete failed: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="admin__empty">
        <p>Loading promo codes…</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1rem" }}>Promo Codes</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          + Create Promo
        </button>
      </div>

      {/* Promo table */}
      {promos.length === 0 ? (
        <div className="admin__chart" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            No promo codes configured yet.
          </p>
          <p style={{ color: "rgba(242,242,247,0.35)", fontSize: "0.75rem" }}>
            API endpoint: <code style={{ background: "rgba(255,255,255,0.05)", padding: "0.15rem 0.4rem", borderRadius: "0.25rem" }}>/api/admin/promos</code>
          </p>
        </div>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Eligibility</th>
                <th>Uses</th>
                <th>Dates</th>
                <th>Active</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong style={{ fontFamily: "monospace", fontSize: "0.85rem", letterSpacing: "0.05em" }}>
                      {p.code}
                    </strong>
                    {p.description && (
                      <>
                        <br />
                        <span style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.4)" }}>{p.description}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="admin__badge">{p.type}</span>
                  </td>
                  <td>
                    {p.type === "percentage" ? `${p.value}%` : <><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle", marginRight: 2 }} /> {p.value}</>}
                  </td>
                  <td>{p.eligibility || "all"}</td>
                  <td>
                    {p.usedCount ?? p.currentUses ?? 0}
                    {p.maxUses ? ` / ${p.maxUses}` : ""}
                  </td>
                  <td style={{ fontSize: "0.7rem" }}>
                    {p.startsAt ? `From ${new Date(p.startsAt).toLocaleDateString()}` : "Now"}
                    {p.expiresAt ? ` → ${new Date(p.expiresAt).toLocaleDateString()}` : " · No expiry"}
                  </td>
                  <td>
                    <button
                      className={`admin__toggle ${p.isActive ? "admin__toggle--on" : ""}`}
                      onClick={() => togglePromo(p)}
                      title={p.isActive ? "Disable" : "Enable"}
                    >
                      <span className="admin__toggle-knob" />
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => deletePromo(p)}
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem", color: "#ff3d71" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowCreate(false); setMarginWarning(null); }}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgb(24, 24, 27)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "1rem",
                padding: "1.5rem",
                maxWidth: 520,
                width: "90%",
                maxHeight: "85vh",
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Create Promo Code</h3>
                <button
                  onClick={() => { setShowCreate(false); setMarginWarning(null); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(242,242,247,0.5)" }}
                >
                  <IconClose style={{ width: 20, height: 20 }} />
                </button>
              </div>

              <form onSubmit={createPromo}>
                {/* Code */}
                <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="field-label">Code *</label>
                  <input
                    className="field-input"
                    placeholder="e.g. LAUNCH50"
                    value={form.code}
                    onChange={(e) => updateForm("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                    maxLength={20}
                    required
                  />
                </div>

                {/* Type + Value */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div className="field-group">
                    <label className="field-label">Type *</label>
                    <select
                      className="field-select"
                      value={form.type}
                      onChange={(e) => updateForm("type", e.target.value)}
                    >
                      {PROMO_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Value *</label>
                    <input
                      className="field-input"
                      type="number"
                      step={form.type === "percentage" ? "1" : "1"}
                      placeholder={form.type === "percentage" ? "e.g. 50" : "e.g. 500"}
                      value={form.value}
                      onChange={(e) => updateForm("value", e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Eligibility */}
                <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                  <label className="field-label">Eligibility</label>
                  <select
                    className="field-select"
                    value={form.eligibility}
                    onChange={(e) => updateForm("eligibility", e.target.value)}
                  >
                    {ELIGIBILITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Limits */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div className="field-group">
                    <label className="field-label">Max Total Uses</label>
                    <input
                      className="field-input"
                      type="number"
                      placeholder="Unlimited"
                      value={form.maxUses}
                      onChange={(e) => updateForm("maxUses", e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Max Per User</label>
                    <input
                      className="field-input"
                      type="number"
                      placeholder="1"
                      value={form.maxUsesPerUser}
                      onChange={(e) => updateForm("maxUsesPerUser", e.target.value)}
                    />
                  </div>
                </div>

                {/* Date range */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div className="field-group">
                    <label className="field-label">Starts At</label>
                    <input
                      className="field-input"
                      type="date"
                      value={form.startsAt}
                      onChange={(e) => updateForm("startsAt", e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Expires At</label>
                    <input
                      className="field-input"
                      type="date"
                      value={form.expiresAt}
                      onChange={(e) => updateForm("expiresAt", e.target.value)}
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="field-group" style={{ marginBottom: "1rem" }}>
                  <label className="field-label">Description (optional)</label>
                  <input
                    className="field-input"
                    placeholder="e.g. Launch week 50% off"
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                  />
                </div>

                {/* Margin guardrail warning */}
                {marginWarning && (
                  <div
                    style={{
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                      marginBottom: "1rem",
                      fontSize: "0.8rem",
                      background: marginWarning.level === "danger"
                        ? "rgba(255,61,113,0.1)"
                        : "rgba(255,209,102,0.1)",
                      border: `1px solid ${
                        marginWarning.level === "danger"
                          ? "rgba(255,61,113,0.25)"
                          : "rgba(255,209,102,0.25)"
                      }`,
                      color: marginWarning.level === "danger" ? "#ff3d71" : "#FFD166",
                    }}
                  >
                    {marginWarning.message}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setShowCreate(false); setMarginWarning(null); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={creating}
                  >
                    {creating ? "Creating…" : "Create Promo"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
