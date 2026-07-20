"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconStar, IconBolt, IconImage, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];
const TYPES = [
  { id: "character", label: "Characters", desc: "Saved personas with consistent traits" },
  { id: "style", label: "Styles", desc: "Visual styles and aesthetics" },
  { id: "asset", label: "Assets", desc: "Reusable images and references" },
  { id: "brand", label: "Brand", desc: "Brand guidelines and assets" },
];

export default function ProjectMemoryPanel() {
  const [activeType, setActiveType] = useState("character");
  const [items, setItems] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", data: "" });
  const [loading, setLoading] = useState(true);

  const load = (type) => {
    setLoading(true);
    fetch(`/api/memory?type=${type}`)
      .then((r) => r.json())
      .then((data) => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  };

  useEffect(() => { load(activeType); }, [activeType]);

  const addItem = async () => {
    if (!newItem.name || !newItem.data) return;
    let data = newItem.data;
    try { data = JSON.parse(newItem.data); } catch { /* keep as string */ }
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, name: newItem.name, data }),
    });
    setNewItem({ name: "", data: "" });
    setShowAdd(false);
    load(activeType);
  };

  const deleteItem = async (id) => {
    await fetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load(activeType);
  };

  const formatData = (data) => {
    if (typeof data === "string") return data.slice(0, 120);
    return Object.entries(data).map(([k, v]) => `${k}: ${v}`).join(", ").slice(0, 120);
  };

  return (
    <div className="memory-panel">
      <div className="memory-panel__header">
        <h3>Project Memory</h3>
        <p>Save and reuse characters, styles, assets, and brand context.</p>
      </div>

      <div className="memory-panel__types">
        {TYPES.map((t) => (
          <button key={t.id} className={`memory-type ${activeType === t.id ? "memory-type--active" : ""}`} onClick={() => setActiveType(t.id)}>
            <span className="memory-type__label">{t.label}</span>
            <span className="memory-type__desc">{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="memory-panel__body">
        <div className="memory-panel__actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Cancel" : `+ Add ${TYPES.find((t) => t.id === activeType)?.label.slice(0, -1)}`}
          </button>
        </div>

        <AnimatePresence>
          {showAdd && (
            <motion.div
              className="memory-add"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <input className="field-input" placeholder="Name (e.g. Princess Aria)" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
              <textarea className="field-textarea" placeholder='Description or JSON (e.g. {"gender":"female","hair":"long blonde","style":"cinematic"})' value={newItem.data} onChange={(e) => setNewItem({ ...newItem, data: e.target.value })} rows={3} />
              <button className="btn btn-primary btn-sm" onClick={addItem}>Save</button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="studio-loading"><div className="studio-loading__spinner" /></div>
        ) : items.length === 0 ? (
          <div className="memory-empty">
            <IconStar />
            <p>No saved {activeType}s yet.</p>
          </div>
        ) : (
          <div className="memory-grid">
            {items.map((item) => (
              <div key={item.id} className="memory-card">
                <div className="memory-card__header">
                  <strong>{item.name}</strong>
                  <button className="btn-ghost" onClick={() => deleteItem(item.id)}>Delete</button>
                </div>
                <p className="memory-card__data">{formatData(item.data)}</p>
                <span className="memory-card__date">{new Date(item.updatedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}