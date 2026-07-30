"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/client-fetch";
import toast from "react-hot-toast";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

const EASE = [0.32, 0.72, 0, 1];

const ENFORCEMENT_MODES = [
  { id: "off", label: "Off", desc: "Brand info available but not enforced" },
  { id: "suggest", label: "Suggest", desc: "UI suggests brand constraints" },
  { id: "strong", label: "Strong", desc: "Auto-inject constraints, warn on violations" },
  { id: "locked", label: "Locked", desc: "Enforce immutable brand rules" },
];

const modeColors = { off: "#555", suggest: "#ffb400", strong: "#ff6b35", locked: "#ff4444" };

const TONE_CHIPS = ["Professional", "Playful", "Minimal", "Luxury", "Warm", "Bold", "Technical", "Whimsical", "Authoritative"];

const SAMPLE_IDEAS = [
  { name: "Tech Startup", desc: "Modern, clean, blue-toned" },
  { name: "Luxury Fashion", desc: "Elegant, minimal, gold accents" },
  { name: "Gaming Channel", desc: "Bold, neon, energetic" },
  { name: "Wellness Brand", desc: "Soft, natural, earthy" },
];

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
  type: "M4 7V4h16v3M9 20h6M12 4v16",
};

export default function BrandKitStudio() {
  const isMobile = useIsMobile();
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
        <div className="v6-builder-panel" style={{ display: "grid", gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="v6-skeleton v6-skeleton-card" />
          ))}
        </div>
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
      {!isMobile && (
      <div className="v6-builder-panel">
        <div className="v6-panel-title">
          <h3>Brands</h3>
          <button className="v6-btn v6-primary v6-sm" onClick={() => setShowNew(true)}>
            <SvgIcon d={icons.plus} size={14} /> New
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {brands.map((b) => {
            const brandColors = (b.primaryColors || b.colors || []).slice(0, 5);
            const isActive = selected?.id === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setSelected(b)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: `1px solid ${isActive ? modeColors[b.enforcement || "off"] : "var(--v6-line)"}`,
                  borderRadius: "var(--v6-r)",
                  background: isActive ? "rgba(255,65,111,0.08)" : "var(--v6-surface2)",
                  overflow: "hidden",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  padding: 0,
                  transition: "all 0.2s ease",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = "color-mix(in srgb, var(--v6-accent), var(--v6-line) 45%)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = "var(--v6-line)"; }}
              >
                {/* Color bar strip */}
                <div style={{ display: "flex", height: 4 }}>
                  {brandColors.length > 0
                    ? brandColors.map((c, i) => (
                        <div key={i} style={{ flex: 1, background: c }} />
                      ))
                    : <div style={{ flex: 1, background: "#333" }} />
                  }
                  {brandColors.length === 0 && Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ flex: 1, background: i === 0 ? "#333" : "#1a1a1a" }} />
                  ))}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{b.name}</div>
                  <div className="v6-tiny v6-muted" style={{ marginTop: 2 }}>
                    {(b.primaryColors || b.colors || []).length || 0} colors · {b.enforcement || "off"}
                  </div>
                </div>
              </button>
            );
          })}
          {brands.length === 0 && (
            <div className="v6-empty-state" style={{ padding: "24px 12px" }}>
              <div className="v6-empty-orbit"><SvgIcon d={icons.palette} size={26} /></div>
              <h2 style={{ fontSize: 16 }}>Create your first brand kit</h2>
              <p>Define brand identity, generate rules via visual fingerprinting, and enforce consistency.</p>
              <div className="v6-brief-ideas" style={{ marginTop: 10 }}>
                {SAMPLE_IDEAS.map((idea) => (
                  <button
                    key={idea.name}
                    className="v6-brief-idea"
                    onClick={() => { setNewName(idea.name); setShowNew(true); }}
                  >
                    <strong style={{ display: "block", fontSize: 11 }}>{idea.name}</strong>
                    {idea.desc}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── CENTER: Brand Detail ── */}
      <div className="v6-builder-panel">
        {/* Mobile brand selector chips */}
        {isMobile && brands.length > 0 && (
          <MobileChipScroller
            items={brands.map((b) => ({ label: b.name, value: b.id }))}
            selectedValue={selected?.id}
            onSelect={(id) => { const found = brands.find((b) => b.id === id); if (found) setSelected(found); }}
          />
        )}
        {isMobile && !selected && brands.length > 0 && (
          <p className="v6-muted v6-tiny" style={{ marginTop: 8, textAlign: "center" }}>Select a brand above</p>
        )}
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

            {/* Color Palette — swatches with copy-on-click */}
            <div className="v6-field">
              <label className="v6-field-label">Color Palette</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {colors.length > 0 ? (
                  colors.map((c, i) => (
                    <button
                      key={i}
                      className="v6-tooltip"
                      data-tooltip={`Click to copy ${c}`}
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(c); toast.success(`Copied ${c}`); } catch { toast.error("Failed to copy"); }
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        border: 0,
                        background: "transparent",
                        cursor: "pointer",
                        padding: 0,
                        fontFamily: "inherit",
                        transition: "transform 0.2s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: c,
                          border: "2px solid rgba(255,255,255,0.12)",
                          boxShadow: `0 4px 16px ${c}33`,
                          transition: "box-shadow 0.2s",
                        }}
                      />
                      <span className="v6-tiny v6-mono" style={{ color: "var(--v6-muted)", fontSize: 9 }}>{c}</span>
                    </button>
                  ))
                ) : (
                  <p className="v6-muted v6-tiny" style={{ padding: "12px 0" }}>
                    No colors defined. Run fingerprint to extract colors from assets.
                  </p>
                )}
              </div>
            </div>

            {/* Typography — with sample text */}
            <div className="v6-field">
              <label className="v6-field-label">Typography</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div
                  className="v6-quote"
                  style={{ cursor: "pointer", gap: 6 }}
                  onClick={() => setEditField({ key: "displayFont", value: displayFont })}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="v6-tiny v6-muted">Display</span>
                    <SvgIcon d={icons.type} size={12} />
                  </div>
                  <span style={{ fontSize: 24, fontWeight: 700, fontFamily: `${displayFont}, serif`, lineHeight: 1.1 }}>Headline</span>
                  <span className="v6-tiny v6-mono v6-muted">{displayFont}</span>
                </div>
                <div
                  className="v6-quote"
                  style={{ cursor: "pointer", gap: 6 }}
                  onClick={() => setEditField({ key: "interfaceFont", value: interfaceFont })}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="v6-tiny v6-muted">Interface</span>
                    <SvgIcon d={icons.type} size={12} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 400, fontFamily: `${interfaceFont}, sans-serif`, lineHeight: 1.4 }}>
                    Body text sample — The quick brown fox
                  </span>
                  <span className="v6-tiny v6-mono v6-muted">{interfaceFont}</span>
                </div>
              </div>
              {(editField?.key === "displayFont" || editField?.key === "interfaceFont") && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input
                    className="v6-input"
                    value={editField.value}
                    onChange={(e) => setEditField({ ...editField, value: e.target.value })}
                    placeholder="Font family name"
                    autoFocus
                    style={{ fontSize: 12 }}
                  />
                  <button
                    className="v6-btn v6-primary v6-sm"
                    onClick={() => { updateBrand(selected.id, { [editField.key]: editField.value }); }}
                  >
                    <SvgIcon d={icons.check} size={14} />
                  </button>
                  <button className="v6-btn v6-sm" onClick={() => setEditField(null)}>
                    <SvgIcon d={icons.delete} size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="v6-section-rule" />

            {/* Generation Rules */}
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 10px" }}>Generation Rules</h3>

              {/* Tone of Voice — with example chips */}
              <div className="v6-field" style={{ marginBottom: 14 }}>
                <label className="v6-field-label">Tone of Voice</label>
                {isMobile ? (
                  <MobileChipScroller
                    items={TONE_CHIPS.map((tone) => ({ label: tone, value: tone.toLowerCase() }))}
                    selectedValue={TONE_CHIPS.find((t) => toneOfVoice.toLowerCase().includes(t.toLowerCase()))?.toLowerCase() || null}
                    onSelect={(val) => {
                      const current = toneOfVoice;
                      const newTone = current ? `${current}, ${val}` : val;
                      setSelected({ ...selected, toneOfVoice: newTone });
                      updateBrand(selected.id, { toneOfVoice: newTone });
                    }}
                  />
                ) : (
                <div className="v6-chip-row" style={{ marginBottom: 8 }}>
                  {TONE_CHIPS.map((tone) => {
                    const isSelected = toneOfVoice.toLowerCase().includes(tone.toLowerCase());
                    return (
                      <button
                        key={tone}
                        className={`v6-chip ${isSelected ? "v6-active" : ""}`}
                        style={{ fontSize: 9 }}
                        onClick={() => {
                          const current = toneOfVoice;
                          const newTone = current ? `${current}, ${tone.toLowerCase()}` : tone.toLowerCase();
                          setSelected({ ...selected, toneOfVoice: newTone });
                          updateBrand(selected.id, { toneOfVoice: newTone });
                        }}
                      >
                        {tone}
                      </button>
                    );
                  })}
                </div>
                )}
                <textarea
                  className="v6-textarea"
                  value={toneOfVoice}
                  onChange={(e) => { setSelected({ ...selected, toneOfVoice: e.target.value }); }}
                  onBlur={() => updateBrand(selected.id, { toneOfVoice: selected.toneOfVoice })}
                  placeholder="e.g. Warm, authoritative, playful — avoid corporate jargon..."
                  style={{ minHeight: 72, fontSize: 12 }}
                />
              </div>

              {/* Visual Avoid List — tag chips with X */}
              <div className="v6-field" style={{ marginBottom: 14 }}>
                <label className="v6-field-label">Visual Avoid-List</label>
                <div className="v6-chip-row">
                  {avoidList.map((item, i) => (
                    <span
                      key={i}
                      className="v6-chip"
                      style={{
                        borderColor: "var(--v6-bad)",
                        color: "var(--v6-bad)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        cursor: "default",
                      }}
                    >
                      {item}
                      <button
                        onClick={() => {
                          const next = avoidList.filter((_, j) => j !== i);
                          updateBrand(selected.id, { avoid: next });
                        }}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          color: "inherit",
                          display: "flex",
                          alignItems: "center",
                          lineHeight: 1,
                        }}
                        title="Remove"
                      >
                        <SvgIcon d={icons.delete} size={11} />
                      </button>
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
                  onChange={(e) => { setSelected({ ...selected, compositionRules: e.target.value }); }}
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
                style={{
                  borderColor: "var(--v6-bad)",
                  color: "var(--v6-bad)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <SvgIcon d={icons.delete} size={12} />
                Delete Brand Kit
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="v6-empty-state">
            <div className="v6-empty-orbit"><SvgIcon d={icons.palette} size={26} /></div>
            <h2>{brands.length === 0 ? "Create your first brand kit" : "Select a Brand Kit"}</h2>
            <p>Define brand identity, generate rules via visual fingerprinting, and enforce consistency.</p>
            {brands.length === 0 && (
              <div className="v6-brief-ideas">
                {SAMPLE_IDEAS.map((idea) => (
                  <button
                    key={idea.name}
                    className="v6-brief-idea"
                    onClick={() => { setNewName(idea.name); setShowNew(true); }}
                  >
                    <strong style={{ display: "block", fontSize: 11 }}>{idea.name}</strong>
                    {idea.desc}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT: Brand Actions ── */}
      <div className="v6-builder-panel">
        {selected ? (
          <div style={{ display: "grid", gap: 16 }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>Actions</h3>

            {/* Fingerprint — better loading state */}
            <div className="v6-field">
              <label className="v6-field-label">Visual Intelligence</label>
              <button
                className="v6-btn v6-primary"
                style={{ width: "100%", position: "relative" }}
                onClick={runFingerprint}
                disabled={fingerprinting}
              >
                {fingerprinting ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "#fff",
                      animation: "v6-gen-orbit-spin 0.8s linear infinite",
                      display: "inline-block",
                    }} />
                    Analyzing...
                  </span>
                ) : (
                  <>
                    <SvgIcon d={icons.fingerprint} size={16} />
                    Run Fingerprint
                  </>
                )}
              </button>
              <p className="v6-tiny v6-muted" style={{ marginTop: 6 }}>
                Analyzes brand assets to extract colors, typography, and style patterns automatically.
              </p>
            </div>

            <div className="v6-section-rule" />

            {/* Compliance Mode — segmented control with descriptions */}
            <div className="v6-field">
              <label className="v6-field-label">Compliance Mode</label>
              {isMobile ? (
                <MobileChipScroller items={ENFORCEMENT_MODES.map((m) => ({ label: m.label, value: m.id }))} selectedValue={selected.enforcement || "off"} onSelect={updateEnforcement} />
              ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {ENFORCEMENT_MODES.map((m) => {
                  const isActive = (selected.enforcement || "off") === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => updateEnforcement(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "10px 12px",
                        width: "100%",
                        border: `1px solid ${isActive ? modeColors[m.id] : "var(--v6-line)"}`,
                        borderRadius: 10,
                        background: isActive ? `${modeColors[m.id]}14` : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        color: isActive ? modeColors[m.id] : "var(--v6-muted)",
                        transition: "all 0.2s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--v6-accent), var(--v6-line) 45%)"; e.currentTarget.style.color = "var(--v6-text)"; }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) { e.currentTarget.style.borderColor = "var(--v6-line)"; e.currentTarget.style.color = "var(--v6-muted)"; }
                      }}
                    >
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
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
                        <div style={{ fontSize: 9, color: isActive ? modeColors[m.id] : "var(--v6-muted)", opacity: 0.8, marginTop: 1, lineHeight: 1.3 }}>{m.desc}</div>
                      </div>
                      {isActive && (
                        <SvgIcon d={icons.check} size={14} />
                      )}
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            <div className="v6-section-rule" />

            {/* Active Toggle — visual toggle switch */}
            <div className="v6-field">
              <label className="v6-field-label">Active Brand</label>
              <button
                className="v6-toggle"
                style={{ border: 0, background: "transparent", fontFamily: "inherit", textAlign: "left" }}
                onClick={toggleActive}
              >
                <div className={`v6-toggle-track ${selected.isActive !== false ? "v6-on" : ""}`}>
                  <div className="v6-toggle-thumb" />
                </div>
                <span className="v6-toggle-label">
                  {selected.isActive !== false ? "Active" : "Inactive"}
                </span>
              </button>
              <p className="v6-tiny v6-muted" style={{ marginTop: 8 }}>
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
              className="v6-modal v6-entrance-scale"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>New Brand Kit</h2>
                  <p className="v6-muted v6-tiny" style={{ margin: "4px 0 0" }}>
                    Create a brand identity system to maintain visual consistency.
                  </p>
                </div>
                <button
                  className="v6-btn v6-icon-only v6-sm"
                  onClick={() => setShowNew(false)}
                >
                  <SvgIcon d={icons.delete} size={14} />
                </button>
              </div>

              <div className="v6-section-rule" style={{ marginBottom: 14 }} />

              {/* Name section */}
              <div className="v6-field" style={{ marginBottom: 14 }}>
                <label className="v6-field-label">Brand Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Acme Corp, Luxury Fashion Co."
                  className="v6-input"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && createBrand()}
                />
              </div>

              {/* Quick start ideas */}
              <div className="v6-field">
                <label className="v6-field-label">Quick Start</label>
                <div className="v6-brief-ideas" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  {SAMPLE_IDEAS.map((idea) => (
                    <button
                      key={idea.name}
                      className="v6-brief-idea"
                      onClick={() => setNewName(idea.name)}
                    >
                      <strong style={{ display: "block", fontSize: 11 }}>{idea.name}</strong>
                      {idea.desc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="v6-section-rule" style={{ margin: "14px 0" }} />

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} className="v6-btn">Cancel</button>
                <button
                  onClick={createBrand}
                  disabled={!newName.trim()}
                  className="v6-btn v6-primary"
                >
                  <SvgIcon d={icons.plus} size={14} /> Create Brand
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
