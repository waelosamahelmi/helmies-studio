"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { IconCheck, IconBolt } from "@/components/Icons";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

export default function PlanEditor({ type = "plans" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // id of row being saved
  const [editingRow, setEditingRow] = useState(null); // id of inline editing row
  const [editValues, setEditValues] = useState({});

  const isPlans = type === "plans";
  const apiPath = isPlans ? "/api/admin/plans" : "/api/admin/credit-packs";
  const title = isPlans ? "Subscription Plans" : "Credit Packs";

  const load = useCallback(() => {
    setLoading(true);
    fetch(apiPath)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setItems(Array.isArray(d) ? d : d.plans || d.packs || []))
      .catch((err) => {
        // API may not exist yet — show empty state gracefully
        if (err.message.includes("404") || err.message.includes("500")) {
          setItems([]);
        } else {
          toast.error(`Failed to load ${isPlans ? "plans" : "credit packs"}`);
        }
      })
      .finally(() => setLoading(false));
  }, [apiPath, isPlans]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (item) => {
    setEditingRow(item.id || item._key);
    setEditValues({ ...item });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValues({});
  };

  const saveRow = async (item) => {
    const id = item.id || item._key;
    setSaving(id);
    try {
      const res = await fetch(apiPath, {
        method: item.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editValues),
      });
      if (res.ok) {
        toast.success(`${isPlans ? "Plan" : "Pack"} saved`);
        setEditingRow(null);
        setEditValues({});
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Save failed");
      }
    } catch (e) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(null);
    }
  };

  const toggleActive = async (item) => {
    try {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id || item._key, isActive: !item.isActive }),
      });
      if (res.ok) {
        toast.success(`${isPlans ? "Plan" : "Pack"} ${item.isActive ? "deactivated" : "activated"}`);
        load();
      } else {
        toast.error("Toggle failed");
      }
    } catch (e) {
      toast.error(`Toggle failed: ${e.message}`);
    }
  };

  // ── Plan columns ──
  const planColumns = [
    { key: "name", label: "Name", type: "text" },
    { key: "price", label: "Price (€)", type: "number" },
    { key: "interval", label: "Interval", type: "select", options: ["monthly", "yearly"] },
    { key: "creditsMonthly", label: "Credits/mo", type: "number" },
    { key: "features", label: "Features", type: "text" },
    { key: "stripePriceId", label: "Stripe Price ID", type: "text" },
  ];

  // ── Credit pack columns ──
  const packColumns = [
    { key: "name", label: "Name", type: "text" },
    { key: "credits", label: "Credits", type: "number" },
    { key: "price", label: "Price (€)", type: "number" },
    { key: "bonusCredits", label: "Bonus", type: "number" },
    { key: "stripePriceId", label: "Stripe Price ID", type: "text" },
  ];

  const columns = isPlans ? planColumns : packColumns;

  if (loading) {
    return (
      <div className="admin__empty">
        <p>Loading {isPlans ? "plans" : "credit packs"}…</p>
      </div>
    );
  }

  // Show empty state with helpful message if API not available
  if (items.length === 0 && !loading) {
    return (
      <div>
        <div className="admin__chart" style={{ textAlign: "center", padding: "2rem" }}>
          <h3>{title}</h3>
          <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            No {isPlans ? "subscription plans" : "credit packs"} configured yet.
            {isPlans
              ? " Plans define recurring subscriptions with monthly credits."
              : " Credit packs are one-time credit purchases."
            }
          </p>
          <p style={{ color: "rgba(242,242,247,0.35)", fontSize: "0.75rem" }}>
            API endpoint: <code style={{ background: "rgba(255,255,255,0.05)", padding: "0.15rem 0.4rem", borderRadius: "0.25rem" }}>{apiPath}</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "1rem" }}>{title}</h3>
        <span style={{ fontSize: "0.75rem", color: "rgba(242,242,247,0.5)" }}>{items.length} total</span>
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
              <th>Active</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const id = item.id || item._key;
              const isEditing = editingRow === id;
              const isSaving = saving === id;

              return (
                <tr key={id}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {isEditing ? (
                        col.type === "select" ? (
                          <select
                            className="field-select"
                            value={editValues[col.key] ?? item[col.key] ?? ""}
                            onChange={(e) => setEditValues({ ...editValues, [col.key]: e.target.value })}
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                          >
                            {(col.options || []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="field-input"
                            type={col.type === "number" ? "number" : "text"}
                            step={col.type === "number" ? (col.key === "price" ? "0.01" : "1") : undefined}
                            value={editValues[col.key] ?? item[col.key] ?? ""}
                            onChange={(e) =>
                              setEditValues({
                                ...editValues,
                                [col.key]: col.type === "number" ? e.target.value : e.target.value,
                              })
                            }
                            style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", width: "100%", minWidth: 80 }}
                          />
                        )
                      ) : (
                        <span>
                          {col.key === "price"
                            ? `€${Number(item[col.key] || 0).toFixed(2)}`
                            : col.key === "credits" || col.key === "creditsMonthly" || col.key === "bonusCredits"
                            ? (
                              <><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle", marginRight: 2 }} /> {item[col.key] || 0}</>
                            )
                            : item[col.key] || "—"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td>
                    <button
                      className={`admin__toggle ${item.isActive ? "admin__toggle--on" : ""}`}
                      onClick={() => toggleActive(item)}
                      title={item.isActive ? "Deactivate" : "Activate"}
                    >
                      <span className="admin__toggle-knob" />
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      {isEditing ? (
                        <>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => saveRow(item)}
                            disabled={isSaving}
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                          >
                            {isSaving ? "…" : "Save"}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={cancelEdit}
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => startEdit(item)}
                          style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
