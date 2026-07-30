"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconPalette, IconClose, IconPlus, IconShield, IconLock, IconEye } from "@/components/Icons";
import { apiFetch } from "@/lib/client-fetch";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

const ENFORCEMENT_MODES = [
  { id: "off", label: "Off", icon: IconEye, desc: "Brand info available but not enforced" },
  { id: "suggest", label: "Suggest", icon: IconPalette, desc: "UI suggests brand constraints" },
  { id: "strong", label: "Strong", icon: IconShield, desc: "Auto-inject constraints, warn on violations" },
  { id: "locked", label: "Locked", icon: IconLock, desc: "Enforce immutable brand rules" },
];

const modeColors = { off: "#555", suggest: "#ffb400", strong: "#ff6b35", locked: "#ff4444" };

export default function BrandKitsView() {
  const [brands, setBrands] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

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

  const updateEnforcement = async (mode) => {
    if (!selected) return;
    try {
      const res = await apiFetch("/api/brand-kits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, enforcement: mode }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setSelected(updated);
      setBrands((prev) => prev.map((b) => b.id === updated.id ? updated : b));
      toast.success(`Enforcement set to ${mode}`);
    } catch {
      toast.error("Failed to update enforcement");
    }
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

  if (loading) {
    return (
      <div className="brand-universe studio__brands">
        <div className="studio__idle"><IconPalette style={{ width: 48, height: 48, opacity: 0.3 }} /><p>Loading brand kits...</p></div>
      </div>
    );
  }

  return (
    <div className="brand-universe studio__brands">
      <div className="studio__brands-sidebar">
        <div className="studio__brands-sidebar-header">
          <h2><IconPalette /> Brand Kits</h2>
        </div>
        <div className="studio__brands-list">
          {brands.map((b) => (
            <button key={b.id} onClick={() => setSelected(b)}
              className={`studio__brands-item ${selected?.id === b.id ? "studio__brands-item--active" : ""}`}>
              <div className="studio__brands-item-colors">
                {(b.primaryColors || []).map((c) => <span key={c} style={{ background: c }} />)}
              </div>
              <div>
                <div className="studio__brands-item-name">{b.name}</div>
                <div className="studio__brands-item-desc">{b.description || "No description"}</div>
              </div>
            </button>
          ))}
          {brands.length === 0 && (
            <div className="studio__brands-empty">
              <p>No brand kits yet.</p>
              <p>Create one to enforce brand consistency across generations.</p>
            </div>
          )}
        </div>
        <button onClick={() => setShowNew(true)} className="studio__brands-add">
          <IconPlus /> New Brand Kit
        </button>
      </div>

      <div className="studio__brands-detail">
        {selected ? (
          <motion.div key={selected.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="studio__brands-content">
            <div className="studio__brands-header">
              <div>
                <h1>{selected.name}</h1>
                <p>{selected.description || "No description"}</p>
              </div>
              <div className="studio__brands-enforcement" style={{ color: modeColors[selected.enforcement || "off"] }}>
                <span className="studio__brands-enforcement-dot" style={{ background: modeColors[selected.enforcement || "off"] }} />
                {selected.enforcement || "off"}
              </div>
            </div>

            {(selected.primaryColors?.length > 0 || selected.secondaryColors?.length > 0) && (
              <section>
                <h3>Colors</h3>
                <div className="studio__brands-colors">
                  {(selected.primaryColors || []).map((c) => (
                    <div key={c} className="studio__brands-color">
                      <div className="studio__brands-swatch" style={{ background: c }} />
                      <span>{c}</span>
                    </div>
                  ))}
                  {(selected.secondaryColors || []).map((c) => (
                    <div key={c} className="studio__brands-color studio__brands-color--sec">
                      <div className="studio__brands-swatch" style={{ background: c }} />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selected.fonts?.length > 0 && (
              <section>
                <h3>Typography</h3>
                {selected.fonts.map((f, i) => (
                  <div key={i} className="studio__brands-font">
                    <span>{f.name || f}</span>
                    {f.role && <span className="studio__brands-font-role">{f.role}</span>}
                  </div>
                ))}
              </section>
            )}

            {selected.slogans?.length > 0 && (
              <section>
                <h3>Slogans</h3>
                <div className="studio__chip-group">
                  {selected.slogans.map((s, i) => <span key={i} className="studio__chip">{s}</span>)}
                </div>
              </section>
            )}

            {selected.photographyStyle && (
              <section>
                <h3>Photography Style</h3>
                <p className="studio__brands-text">{selected.photographyStyle}</p>
              </section>
            )}

            {selected.toneOfVoice && (
              <section>
                <h3>Tone of Voice</h3>
                <p className="studio__brands-text">{selected.toneOfVoice}</p>
              </section>
            )}

            {selected.avoid?.length > 0 && (
              <section>
                <h3>Avoid</h3>
                <div className="studio__chip-group">
                  {selected.avoid.map((s, i) => (
                    <span key={i} className="studio__chip studio__chip--avoid">{s}</span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3>Enforcement Mode</h3>
              <div className="studio__brands-modes">
                {ENFORCEMENT_MODES.map((m) => {
                  const Icon = m.icon;
                  const isActive = (selected.enforcement || "off") === m.id;
                  return (
                    <button key={m.id}
                      onClick={() => updateEnforcement(m.id)}
                      className={`studio__brands-mode ${isActive ? "studio__brands-mode--active" : ""}`}
                      style={isActive ? { borderColor: modeColors[m.id], color: modeColors[m.id] } : {}}
                      title={m.desc}>
                      <Icon /> {m.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <button onClick={() => deleteBrand(selected.id)} className="studio__chip studio__chip--avoid" style={{ cursor: "pointer" }}>
                Delete Brand Kit
              </button>
            </section>
          </motion.div>
        ) : (
          <div className="studio__idle">
            <IconPalette style={{ width: 48, height: 48, opacity: 0.3 }} />
            <p>{brands.length === 0 ? "Create your first brand kit" : "Select a Brand Kit"}</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div
            className="studio__modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowNew(false)}
          >
            <motion.div
              className="studio__modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>New Brand Kit</h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Brand name"
                className="studio__input"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createBrand()}
              />
              <div className="studio__modal-actions">
                <button onClick={() => setShowNew(false)} className="studio__btn studio__btn--ghost">Cancel</button>
                <button onClick={createBrand} disabled={!newName.trim()} className="studio__btn studio__btn--primary">Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
