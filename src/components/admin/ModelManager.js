"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconBolt, IconClose, IconCheck } from "@/components/Icons";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

export default function ModelManager() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingModel, setEditingModel] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const loadModels = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/models")
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => toast.error("Failed to load models"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const toggleModel = async (model) => {
    const res = await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: model.id,
        modelType: model.category,
        providerName: model.provider,
        isActive: !model.isActive,
      }),
    });
    if (res.ok) {
      toast.success(`Model ${model.isActive ? "disabled" : "enabled"}`);
      loadModels();
    } else {
      toast.error("Failed to toggle model");
    }
  };

  const testModel = async (model) => {
    toast.loading(`Testing ${model.name}…`, { id: "model-test" });
    try {
      const res = await fetch("/api/admin/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      });
      const result = await res.json();
      setTestResult({ model: model.name, ...result });
      if (res.ok) {
        toast.success(`${model.name} test passed`, { id: "model-test" });
      } else {
        toast.error(`${model.name} test failed: ${result.error || "Unknown error"}`, { id: "model-test" });
      }
    } catch (e) {
      toast.error(`Test failed: ${e.message}`, { id: "model-test" });
    }
  };

  const saveModelEdit = async () => {
    const res = await fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modelId: editingModel.id,
        modelType: editingModel.category,
        providerName: editingModel.provider,
        providerCost: editingModel.providerCost ?? null,
        creditsCost: editingModel.creditsCost ?? null,
        isActive: editingModel.isActive,
        background: editingModel.background || null,
        backgroundOverlay: editingModel.backgroundOverlay ?? null,
        textColor: editingModel.textColor || null,
        inputSchema: editingModel._inputSchemaRaw,
        uiSchema: editingModel._uiSchemaRaw,
      }),
    });
    if (res.ok) {
      toast.success("Model updated");
      setEditingModel(null);
      loadModels();
    } else {
      toast.error("Failed to update model");
    }
  };

  const categories = ["all", "image", "i2i", "video", "i2v", "v2v", "lipsync", "recast", "audio"];

  const filtered = models.filter((m) => {
    if (filter !== "all" && m.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return m.name?.toLowerCase().includes(q) || m.id?.toLowerCase().includes(q) || m.provider?.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="admin__empty">
        <p>Loading models…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filter & search */}
      <div className="admin__add-form">
        <div className="admin__edit-row" style={{ marginBottom: "0.5rem" }}>
          {categories.map((c) => (
            <button
              key={c}
              className={`pill ${filter === c ? "pill--active" : ""}`}
              onClick={() => setFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="admin__edit-row">
          <input
            className="field-input"
            placeholder="Search models by name, ID, or provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div className="admin__models-count">
        {filtered.length} model{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </div>

      {/* Model table */}
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Capability</th>
              <th>Credits</th>
              <th>Cost</th>
              <th>Status</th>
              <th style={{ width: 180 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                  <br />
                  <span style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.3)" }}>{m.id}</span>
                </td>
                <td>{m.provider}</td>
                <td>
                  <span className="admin__badge">{m.category}</span>
                </td>
                <td>
                  {m.creditsCost ? (
                    <><IconBolt style={{ display: "inline", width: 12, height: 12, verticalAlign: "middle" }} /> {m.creditsCost}</>
                  ) : (
                    <span style={{ color: "rgba(242,242,247,0.3)" }}>default</span>
                  )}
                </td>
                <td>{m.providerCost ? `€${Number(m.providerCost).toFixed(4)}` : "—"}</td>
                <td>
                  <button
                    className={`admin__toggle ${m.isActive ? "admin__toggle--on" : ""}`}
                    onClick={() => toggleModel(m)}
                    title={m.isActive ? "Disable" : "Enable"}
                  >
                    <span className="admin__toggle-knob" />
                  </button>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setEditingModel({
                        ...m,
                        background: m.background || null,
                        backgroundOverlay: m.backgroundOverlay ?? 0.05,
                        textColor: m.textColor || "light",
                        _inputSchemaRaw: m.inputSchema ? JSON.stringify(m.inputSchema, null, 2) : "",
                        _uiSchemaRaw: m.uiSchema ? JSON.stringify(m.uiSchema, null, 2) : "",
                      })}
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => testModel(m)}
                      style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                    >
                      Test
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="admin__empty">No models found{search ? ` matching "${search}"` : ""}.</p>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editingModel && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingModel(null)}
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
                maxWidth: 640,
                width: "90%",
                maxHeight: "85vh",
                overflow: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Edit: {editingModel.name}</h3>
                <button onClick={() => setEditingModel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(242,242,247,0.5)" }}>
                  <IconClose style={{ width: 20, height: 20 }} />
                </button>
              </div>

              {/* Basic fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div className="field-group">
                  <label className="field-label">Provider Cost (€)</label>
                  <input
                    className="field-input"
                    type="number"
                    step="0.0001"
                    value={editingModel.providerCost ?? ""}
                    onChange={(e) => setEditingModel({ ...editingModel, providerCost: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Credits Cost</label>
                  <input
                    className="field-input"
                    type="number"
                    value={editingModel.creditsCost ?? ""}
                    onChange={(e) => setEditingModel({ ...editingModel, creditsCost: e.target.value ? parseInt(e.target.value) : null })}
                  />
                </div>
              </div>

              {/* inputSchema editor */}
              <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                <label className="field-label">inputSchema (JSON)</label>
                <textarea
                  className="field-input"
                  rows={5}
                  value={editingModel._inputSchemaRaw || ""}
                  onChange={(e) => setEditingModel({ ...editingModel, _inputSchemaRaw: e.target.value })}
                  style={{
                    fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical",
                    background: "rgba(0,0,0,0.3)", color: "#e4e4e7",
                    width: "100%", padding: "0.5rem", borderRadius: "0.5rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  placeholder='{"type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"]}'
                />
              </div>

              {/* uiSchema editor */}
              <div className="field-group" style={{ marginBottom: "1rem" }}>
                <label className="field-label">uiSchema (JSON)</label>
                <textarea
                  className="field-input"
                  rows={4}
                  value={editingModel._uiSchemaRaw || ""}
                  onChange={(e) => setEditingModel({ ...editingModel, _uiSchemaRaw: e.target.value })}
                  style={{
                    fontFamily: "monospace", fontSize: "0.75rem", resize: "vertical",
                    background: "rgba(0,0,0,0.3)", color: "#e4e4e7",
                    width: "100%", padding: "0.5rem", borderRadius: "0.5rem",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  placeholder='{"prompt":{"ui:widget":"textarea"}}'
                />
              </div>

              {/* Background image upload */}
              <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                <label className="field-label">Card Background Image</label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    className="field-input"
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const formData = new FormData();
                      formData.append("file", file);
                      try {
                        const res = await fetch("/api/upload", { method: "POST", body: formData });
                        const data = await res.json();
                        if (data.url) setEditingModel({ ...editingModel, background: data.url });
                      } catch {}
                    }}
                    style={{ padding: "0.35rem", fontSize: "0.75rem" }}
                  />
                  {editingModel.background && (
                    <button
                      onClick={() => setEditingModel({ ...editingModel, background: null, backgroundOverlay: null, textColor: null })}
                      style={{ background: "none", border: "none", color: "rgba(255,61,113,0.7)", cursor: "pointer", fontSize: "0.7rem" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {editingModel.background && (
                  <div style={{ marginTop: "0.5rem", borderRadius: "0.5rem", overflow: "hidden", maxHeight: 120, position: "relative" }}>
                    <img src={editingModel.background} alt="Preview" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: "0.5rem" }} />
                  </div>
                )}
                <p style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.4)", marginTop: "0.25rem" }}>Shown as background on the model card in catalog and studio.</p>
              </div>

              {editingModel.background && (
              <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                <label className="field-label">Background Opacity</label>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round((editingModel.backgroundOverlay ?? 0.05) * 100)}
                    onChange={(e) => setEditingModel({ ...editingModel, backgroundOverlay: parseInt(e.target.value) / 100 })}
                    style={{ flex: 1, accentColor: "#6366f1" }}
                  />
                  <span style={{ fontSize: "0.8rem", fontFamily: "monospace", minWidth: "3ch", textAlign: "right" }}>
                    {Math.round((editingModel.backgroundOverlay ?? 0.05) * 100)}%
                  </span>
                </div>
                <p style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.4)", marginTop: "0.25rem" }}>0% = image fully visible, 100% = fully opaque overlay.</p>
              </div>
              )}

              <div className="field-group" style={{ marginBottom: "0.75rem" }}>
                <label className="field-label">Text Color</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", padding: "0.35rem 0.75rem", borderRadius: "0.5rem", background: (editingModel.textColor || "light") === "light" ? "rgba(255,255,255,0.1)" : "transparent", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.8rem" }}>
                    <input
                      type="radio"
                      name="textColor"
                      value="light"
                      checked={(editingModel.textColor || "light") === "light"}
                      onChange={() => setEditingModel({ ...editingModel, textColor: "light" })}
                      style={{ accentColor: "#6366f1" }}
                    />
                    Light Text
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", padding: "0.35rem 0.75rem", borderRadius: "0.5rem", background: (editingModel.textColor || "light") === "dark" ? "rgba(0,0,0,0.3)" : "transparent", border: "1px solid rgba(255,255,255,0.08)", fontSize: "0.8rem" }}>
                    <input
                      type="radio"
                      name="textColor"
                      value="dark"
                      checked={(editingModel.textColor || "light") === "dark"}
                      onChange={() => setEditingModel({ ...editingModel, textColor: "dark" })}
                      style={{ accentColor: "#6366f1" }}
                    />
                    Dark Text
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingModel(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={saveModelEdit}>
                  <IconCheck style={{ display: "inline", width: 14, height: 14, marginRight: 4 }} />
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test result toast-like display */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              position: "fixed", bottom: "2rem", right: "2rem", zIndex: 150,
              background: testResult.success ? "rgba(0,230,138,0.15)" : "rgba(255,61,113,0.15)",
              border: `1px solid ${testResult.success ? "rgba(0,230,138,0.3)" : "rgba(255,61,113,0.3)"}`,
              borderRadius: "0.75rem", padding: "1rem 1.25rem", maxWidth: 360,
              color: testResult.success ? "#00E68A" : "#ff3d71", fontSize: "0.85rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{testResult.model}</strong>
              <button onClick={() => setTestResult(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
                <IconClose style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <p style={{ marginTop: "0.25rem", fontSize: "0.75rem", opacity: 0.8 }}>
              {testResult.success ? "Test passed" : `Error: ${testResult.error || "Unknown"}`}
            </p>
            {testResult.latencyMs && (
              <p style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: "0.15rem" }}>
                Latency: {testResult.latencyMs}ms
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
