"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const ENFORCEMENT_MODES = [
  { id: "off", label: "Off", desc: "Brand info available but not enforced" },
  { id: "suggest", label: "Suggest", desc: "UI suggests brand constraints" },
  { id: "strong", label: "Strong", desc: "Auto-inject constraints, warn on violations" },
  { id: "locked", label: "Locked", desc: "Enforce immutable brand rules" },
];

const modeColors = { off: "#555", suggest: "#ffb400", strong: "#ff6b35", locked: "#ff4444" };

/* ── Inline SVG Icons ── */
function SvgIcon({ d, size = 18 }) {
  return (
    <svg className="v6-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

const icons = {
  palette: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.5 1.5-1.5H17c2.8 0 5-2.2 5-5C22 6.5 17.5 2 12 2z",
  plus: "M12 5v14M5 12h14",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  lock: "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4",
  fingerprint: "M6 18v-3a6 6 0 0 1 6-6 6 6 0 0 1 5.5 3.5 M8 20v-5a4 4 0 0 1 4-4 4 4 0 0 1 3.8 2.5 M10 22v-7a2 2 0 0 1 2-2 2 2 0 0 1 2 2v7 M3 12c0-5 4-9 9-9s9 4 9 9",
  check: "M4 12l5 5L20 6",
  delete: "M6 6l12 12M18 6L6 18",
  sparkle: "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z",
  arrowDown: "M12 5v14M5 12l7 7 7-7",
};

export default function BrandKitStudio() {
  const [brands, setBrands] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [fingerprinting, setFingerprinting] = useState(false);
  const [editField, setEditField] = useState(null); // { key, value }

  const loadBrands = useCallback(async () => {
    try {
      const res = await apiFetch("/api/brand-kits");
      const data = await res.json();
      setBrands(data);
      if (data.length > 0 && !selected) setSelected(data[0]);
    } catch {
      toast.error("Failed to load brand kits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBrands(); }, [loadBrands]);

  const createBrand = async () => {
    if (!newName.trim()) return;
    try {
      const res = await apiFetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const brand = await res.json();
      setBrands((prev) => [brand, ...prev]);
      setSelected(brand);
      setShowNew(false);
      setNewName("");
      toast.success("Brand kit created");
    } catch {
      toast.error("Failed to create brand kit");
    }
  };

  const updateBrand = async (id, updates) => {
    try {
      const res = await apiFetch("/api/brand-kits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setSelected(updated);
      setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      setEditField(null);
      toast.success("Brand updated");
    } catch {
      toast.error("Failed to update brand");
    }
  };

  const updateEnforcement = async (mode) => {
    if (!selected) return;
    await updateBrand(selected.id, { enforcement: mode });
  };

  const deleteBrand = async (id) => {
    if (!confirm("Delete this brand kit?")) return;
    try {
      await apiFetch(`/api/brand-kits?id=${id}`, { method: "DELETE" });
      setBrands((prev) => prev.filter((b) => b.id !== id));
      if (selected?.id === id) setSelected(brands.find((b) => b.id !== id) || null);
      toast.success("Brand kit deleted");
    } catch {
      toast.error("Failed to delete brand kit");
    }
  };

  const runFingerprint = async () => {
    if (!selected) return;
    setFingerprinting(true);
    try {
      const res = await apiFetch("/api/brand-kits/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      });
      if (!res.ok) throw new Error("Fingerprint failed");
      const updated = await res.json();
      setSelected(updated);
      setBrands((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      toast.success("Visual fingerprint complete");
    } catch {
      toast.error("Fingerprint analysis failed");
    } finally {
      setFingerprinting(false);
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    await updateBrand(selected.id, { isActive: !selected.isActive });
  };

  const colors = (selected?.primaryColors || selected?.colors || []).slice(0, 5);
  const displayFont = selected?.displayFont || selected?.fonts?.[0]?.name || "Inter";
  const interfaceFont = selected?.interfaceFont || selected?.fonts?.[1]?.name || "Inter";
  const toneOfVoice = selected?.toneOfVoice || "";
  const avoidList = selected?.avoid || [];
  const compositionRules = selected?.compositionRules || "";

  if (loading) {
    return (
      <div className="v6-builder-grid" style={{ minHeight: "100%" }}>
        <div className="v6-builder-panel" style={{ display: "grid", placeItems: "center" }}>
          <div className="v6-empty-state">
            <div className="v6-empty-orbit"><SvgIcon d={icons.sparkle} size={26} /></div>
            <p className="v6-muted">Loading brand kits...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="v6-builder-grid" style={{ minHeight: "100%" }}>
      {/* ── LEFT: Brand List ── */}
      <div className="v6-builder-panel">
        <div className="v6-panel-title">
          <h3>Brands</h3>
          <button className="v6-btn v6-primary v6-sm" onClick={() => setShowNew(true)}>
            <SvgIcon d={icons.plus} size={14} /> New
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b)}
              className={`v6-btn v6-ghost ${selected?.id === b.id ? "v6-active" : ""}`}
              style={{
                justifyContent: "flex-start",
                gap: 10,
                padding: "10px 12px",
                width: "100%",
                textAlign: "left",
                ...(selected?.id === b.id
                  ? { borderColor: modeColors[b.enforcement || "off"], background: "rgba(255,65,111,0.08)" }
                  : {}),
              }}
            >
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {(b.primaryColors || b.colors || []).slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: c,
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  />
                ))}
                {(b.primaryColors || b.colors || []).length === 0 && (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: "#333",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                  />
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{b.name}</div>
                <div className="v6-tiny v6-muted" style={{ marginTop: 1 }}>
                  {b.description || "No description"}
                </div>
              </div>
            </button>
          ))}
          {brands.length === 0 && (
            <div className="v6-empty-state" style={{ padding: "24px 12px" }}>
              <SvgIcon d={icons.palette} size={32} />
              <p className="v6-muted" style={{ fontSize: 11, marginTop: 8 }}>No brand kits yet.</p>
              <p className="v6-muted v6-tiny">Create one to enforce brand consistency.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER: Brand Detail ── */}
      <div className="v6-builder-panel">
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ display: "grid", gap: 20 }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                {editField?.key === "name" ? (
                  <input
                    className="v6-input"
                    value={editField.value}
                    onChange={(e) => setEditField({ ...editField, value: e.target.value })}
                    onBlur={() => updateBrand(selected.id, { [editField.key]: editField.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateBrand(selected.id, { [editField.key]: editField.value });
                      if (e.key === "Escape") setEditField(null);
                    }}
                    autoFocus
                    style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em" }}
                  />
                ) : (
                  <h2
                    style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.04em", margin: 0, cursor: "pointer" }}
                    onClick={() => setEditField({ key: "name", value: selected.name })}
                  >
                    {selected.name}
                  </h2>
                )}
                {editField?.key === "description" ? (
                  <textarea
                    className="v6-textarea"
                    value={editField.value}
                    onChange={(e) => setEditField({ ...editField, value: e.target.value })}
                    onBlur={() => updateBrand(selected.id, { [editField.key]: editField.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditField(null);
                    }}
                    autoFocus
                    style={{ marginTop: 6, minHeight: 60 }}
                  />
                ) : (
                  <p
                    className="v6-muted"
                    style={{ fontSize: 12, margin: "6px 0 0", cursor: "pointer" }}
                    onClick={() => setEditField({ key: "description", value: selected.description || "" })}
                  >
                    {selected.description || "Click to add a description"}
                  </p>
                )}
              </div>
              <div
                className="v6-status"
                style={{ color: modeColors[selected.enforcement || "off"], whiteSpace: "nowrap", flexShrink: 0 }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: modeColors[selected.enforcement || "off"],
                    display: "inline-block",
                  }}
                />
                {selected.enforcement || "off"}
              </div>
            </div>

            <div className="v6-section-rule" />

            {/* Color Palette */}
            <div className="v6-field">
              <label className="v6-field-label">Color Palette</label>
              <div style={{ display: "flex", gap: 8 }}>
                {colors.length > 0 ? (
                  colors.map((c, i) => (
                    <div key={i} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: c,
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      />
                      <span className="v6-tiny v6-mono v6-muted">{c}</span>
                    </div>
                  ))
                ) : (
                  <p className="v6-muted v6-tiny" style={{ padding: "12px 0" }}>
                    No colors defined. Run fingerprint to extract colors from assets.
                  </p>
                )}
              </div>
            </div>

            {/* Typography */}
            <div className="v6-field">
              <label className="v6-field-label">Typography</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div
                  className="v6-quote"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setEditField({ key: "displayFont", value: displayFont })
                  }
                >
                  <span className="v6-tiny v6-muted">Display</span>
                  <span style={{ fontSize: 18, fontWeight: 700, fontFamily: displayFont }}>{displayFont}</span>
                </div>
                <div
                  className="v6-quote"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setEditField({ key: "interfaceFont", value: interfaceFont })
                  }
                >
                  <span className="v6-tiny v6-muted">Interface</span>
                  <span style={{ fontSize: 13, fontWeight: 400, fontFamily: interfaceFont }}>{interfaceFont}</span>
                </div>
              </div>
              {(editField?.key === "displayFont" || editField?.key === "interfaceFont") && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input
                    className="v6-input"
                    value={editField.value}
                    onChange={(e) => setEditField({ ...editField, value: e.target.value })}
                    placeholder="Font name"
                    autoFocus
                    style={{ fontSize: 12 }}
                  />
                  <button
                    className="v6-btn v6-primary v6-sm"
                    onClick={() => {
                      updateBrand(selected.id, { [editField.key]: editField.value });
                    }}
                  >
                    <SvgIcon d={icons.check} size={14} />
                  </button>
                  <button
                    className="v6-btn v6-sm"
                    onClick={() => setEditField(null)}
                  >
                    <SvgIcon d={icons.delete} size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="v6-section-rule" />

            {/* Generation Rules */}
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 10px" }}>Generation Rules</h3>

              {/* Tone of Voice */}
              <div className="v6-field" style={{ marginBottom: 12 }}>
                <label className="v6-field-label">Tone of Voice</label>
                <textarea
                  className="v6-textarea"
                  value={toneOfVoice}
                  onChange={(e) => {
                    setSelected({ ...selected, toneOfVoice: e.target.value });
                  }}
                  onBlur={() => updateBrand(selected.id, { toneOfVoice: selected.toneOfVoice })}
                  placeholder="e.g. Warm, authoritative, playful — avoid corporate jargon..."
                  style={{ minHeight: 72, fontSize: 12 }}
                />
              </div>

              {/* Visual Avoid List */}
              <div className="v6-field" style={{ marginBottom: 12 }}>
                <label className="v6-field-label">Visual Avoid-List</label>
                <div className="v6-chip-row">
                  {avoidList.map((item, i) => (
                    <span key={i} className="v6-chip v6-active" style={{ borderColor: "var(--v6-bad)", color: "var(--v6-bad)" }}>
                      {item}
                    </span>
                  ))}
                  <button
                    className="v6-chip"
                    onClick={() => {
                      const item = prompt("Add visual element to avoid:");
                      if (item) updateBrand(selected.id, { avoid: [...avoidList, item] });
                    }}
                  >
                    <SvgIcon d={icons.plus} size={12} />
                  </button>
                </div>
              </div>

              {/* Composition Rules */}
              <div className="v6-field">
                <label className="v6-field-label">Composition Rules</label>
                <textarea
                  className="v6-textarea"
                  value={compositionRules}
                  onChange={(e) => {
                    setSelected({ ...selected, compositionRules: e.target.value });
                  }}
                  onBlur={() => updateBrand(selected.id, { compositionRules: selected.compositionRules })}
                  placeholder="e.g. Subject centered, negative space on left, golden ratio layout..."
                  style={{ minHeight: 72, fontSize: 12 }}
                />
              </div>
            </div>

            {/* Delete */}
            <div style={{ paddingTop: 8 }}>
              <button
                onClick={() => deleteBrand(selected.id)}
                className="v6-chip"
                style={{ borderColor: "var(--v6-bad)", color: "var(--v6-bad)", cursor: "pointer" }}
              >
                Delete Brand Kit
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="v6-empty-state">
            <div className="v6-empty-orbit"><SvgIcon d={icons.palette} size={26} /></div>
            <h2>{brands.length === 0 ? "Create your first brand kit" : "Select a Brand Kit"}</h2>
            <p>Define brand identity, generate rules via visual fingerprinting, and enforce consistency.</p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Brand Actions ── */}
      <div className="v6-builder-panel">
        {selected ? (
          <div style={{ display: "grid", gap: 16 }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>Actions</h3>

            {/* Fingerprint */}
            <div className="v6-field">
              <label className="v6-field-label">Visual Intelligence</label>
              <button
                className="v6-btn"
                style={{ width: "100%" }}
                onClick={runFingerprint}
                disabled={fingerprinting}
              >
                <SvgIcon d={icons.fingerprint} size={16} />
                {fingerprinting ? "Analyzing..." : "Run Fingerprint"}
              </button>
              <p className="v6-tiny v6-muted" style={{ marginTop: 6 }}>
                Analyzes brand assets to extract colors, typography, and style patterns automatically.
              </p>
            </div>

            <div className="v6-section-rule" />

            {/* Compliance Mode */}
            <div className="v6-field">
              <label className="v6-field-label">Compliance Mode</label>
              <div style={{ display: "grid", gap: 6 }}>
                {ENFORCEMENT_MODES.map((m) => {
                  const isActive = (selected.enforcement || "off") === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => updateEnforcement(m.id)}
                      className={`v6-btn v6-ghost`}
                      style={{
                        width: "100%",
                        justifyContent: "flex-start",
                        gap: 10,
                        padding: "10px 12px",
                        ...(isActive
                          ? { borderColor: modeColors[m.id], color: modeColors[m.id], background: `${modeColors[m.id]}11` }
                          : {}),
                      }}
                    >
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        {(m.id === "off" && (<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />)) ||
                          (m.id === "suggest" && (<>
                            <circle cx="13.5" cy="6.5" r="2.5"/>
                            <circle cx="6.5" cy="11.5" r="2.5"/>
                            <circle cx="17.5" cy="14.5" r="2.5"/>
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.5 1.5-1.5H17c2.8 0 5-2.2 5-5C22 6.5 17.5 2 12 2z"/>
                          </>)) ||
                          (m.id === "strong" && (<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />)) ||
                          (m.id === "locked" && (<>
                            <rect x="3" y="11" width="18" height="11" rx="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </>))}
                      </svg>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{m.label}</div>
                        <div className="v6-tiny v6-muted">{m.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="v6-section-rule" />

            {/* Active Toggle */}
            <div className="v6-field">
              <label className="v6-field-label">Active Brand</label>
              <button
                className="v6-btn"
                style={{ width: "100%" }}
                onClick={toggleActive}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: selected.isActive !== false ? "var(--v6-good)" : "var(--v6-bad)",
                    boxShadow: selected.isActive !== false ? "0 0 8px var(--v6-good)" : "none",
                  }}
                />
                {selected.isActive !== false ? "Active" : "Inactive"} — Click to toggle
              </button>
              <p className="v6-tiny v6-muted" style={{ marginTop: 6 }}>
                Inactive brands won't influence generation but remain saved.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
            <p className="v6-muted v6-tiny">Select a brand to see actions</p>
          </div>
        )}
      </div>

      {/* ── New Brand Modal ── */}
      <AnimatePresence>
        {showNew && (
          <motion.div
            className="v6-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowNew(false)}
          >
            <motion.div
              className="v6-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>New Brand Kit</h2>
              <p className="v6-muted v6-tiny" style={{ margin: "0 0 14px" }}>
                Create a brand identity system to maintain visual consistency.
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Brand name (e.g. Acme Corp)"
                className="v6-input"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createBrand()}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} className="v6-btn">Cancel</button>
                <button onClick={createBrand} disabled={!newName.trim()} className="v6-btn v6-primary">
                  <SvgIcon d={icons.plus} size={14} /> Create
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
