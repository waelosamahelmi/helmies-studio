"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

const EASE = [0.32, 0.72, 0, 1];

const TABS = [
  { id: "character", label: "Characters", desc: "Saved personas with consistent traits" },
  { id: "style", label: "Styles", desc: "Visual styles and aesthetics" },
  { id: "asset", label: "Assets", desc: "Reusable images and references" },
  { id: "brand", label: "Brands", desc: "Brand guidelines and assets" },
];

const TAB_META = {
  character: { color: "#7C3AED", icon: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 14c-4 0-7 2-7 5h14c0-3-3-5-7-5z" },
  style: { color: "#FF1B6B", icon: "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z" },
  asset: { color: "#00E68A", icon: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01" },
  brand: { color: "#FF6B35", icon: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.6 1.5-1.5 0-.4-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.8.7-1.5 1.5-1.5H17c2.8 0 5-2.2 5-5C22 6.5 17.5 2 12 2z" },
};

const STATS_ICONS = {
  projects: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  characters: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M12 14c-4 0-7 2-7 5h14c0-3-3-5-7-5z",
  styles: "M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z",
  assets: "M3 3h18v18H3z M9 9h.01M15 9h.01M9 15h.01M15 15h.01",
};

/* ── Inline SVG Icon ── */
function SvgIcon({ d, size = 18, color }) {
  return (
    <svg className="v6-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

export default function MemoryStudio() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("character");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", data: "" });
  const [editingItem, setEditingItem] = useState(null);
  const [stats, setStats] = useState({ projects: 0, characters: 0, styles: 0, assets: 0 });

  const loadItems = useCallback(async (type) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?type=${type}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const results = await Promise.all(
        TABS.map((t) =>
          fetch(`/api/memory?type=${t.id}`)
            .then((r) => r.json())
            .then((data) => ({ id: t.id, count: Array.isArray(data) ? data.length : 0 }))
            .catch(() => ({ id: t.id, count: 0 }))
        )
      );
      const counts = {};
      results.forEach((r) => { counts[r.id] = r.count; });
      setStats({
        projects: Math.max(1, items.length > 0 ? 3 : 1),
        characters: counts.character || 0,
        styles: counts.style || 0,
        assets: counts.asset || 0,
      });
    } catch {
      // keep defaults
    }
  }, [items.length]);

  useEffect(() => {
    loadItems(activeTab);
  }, [activeTab, loadItems]);

  useEffect(() => {
    if (!loading) loadStats();
  }, [loading]);

  const addItem = async () => {
    if (!newItem.name || !newItem.data) return;
    let data = newItem.data;
    try { data = JSON.parse(newItem.data); } catch { /* keep as string */ }
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activeTab, name: newItem.name, data }),
      });
      if (!res.ok) throw new Error("Failed");
      setNewItem({ name: "", data: "" });
      setShowAdd(false);
      loadItems(activeTab);
      toast.success("Memory saved");
    } catch {
      toast.error("Failed to save memory");
    }
  };

  const deleteItem = async (id) => {
    try {
      await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      loadItems(activeTab);
      toast.success("Memory deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const updateItem = async (id, updates) => {
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditingItem(null);
      loadItems(activeTab);
      toast.success("Memory updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  const formatData = (data) => {
    if (!data) return "";
    if (typeof data === "string") return data.slice(0, 100);
    return Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")
      .slice(0, 100);
  };

  const tabMeta = TAB_META[activeTab];
  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label || "";

  return (
    <div className="v6-page-content">
      {/* Page Head */}
      <div className="v6-page-head">
        <div>
          <div className="v6-eyebrow">Project Context</div>
          <h1>Memory Studio</h1>
          <p>Saved characters, styles, assets, and brand context for consistent generations.</p>
        </div>
        <button className="v6-btn v6-primary" onClick={() => setShowAdd(!showAdd)}>
          <SvgIcon d="M12 5v14M5 12h14" size={14} />
          {showAdd ? "Cancel" : `Add ${activeTabLabel.slice(0, -1)}`}
        </button>
      </div>

      {/* Metric Grid — with icons */}
      <div className="v6-metric-grid v6-stagger" style={{ marginBottom: 22 }}>
        <div className="v6-metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className="v6-eyebrow" style={{ display: "block" }}>Active Projects</span>
            <SvgIcon d={STATS_ICONS.projects} size={14} color="var(--v6-muted)" />
          </div>
          <strong>{stats.projects}</strong>
        </div>
        <div className="v6-metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className="v6-eyebrow" style={{ display: "block" }}>Saved Characters</span>
            <SvgIcon d={STATS_ICONS.characters} size={14} color={TAB_META.character.color} />
          </div>
          <strong>{stats.characters}</strong>
        </div>
        <div className="v6-metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className="v6-eyebrow" style={{ display: "block" }}>Style Memories</span>
            <SvgIcon d={STATS_ICONS.styles} size={14} color={TAB_META.style.color} />
          </div>
          <strong>{stats.styles}</strong>
        </div>
        <div className="v6-metric">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className="v6-eyebrow" style={{ display: "block" }}>Reusable Assets</span>
            <SvgIcon d={STATS_ICONS.assets} size={14} color={TAB_META.asset.color} />
          </div>
          <strong>{stats.assets}</strong>
        </div>
      </div>

      {/* Tabs — segmented control with icons */}
      {isMobile ? (
        <MobileChipScroller items={TABS.map((t) => ({ label: t.label, value: t.id }))} selectedValue={activeTab} onSelect={setActiveTab} />
      ) : (
      <div className="v6-segmented" style={{ marginBottom: 18, maxWidth: 560 }}>
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          const meta = TAB_META[t.id];
          return (
            <button
              key={t.id}
              className={`${isActive ? "v6-active" : ""}`}
              onClick={() => setActiveTab(t.id)}
              title={t.desc}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <span
                style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: meta.color, flexShrink: 0,
                  boxShadow: isActive ? `0 0 8px ${meta.color}` : "none",
                  transition: "box-shadow 0.2s",
                }}
              />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      )}

      {/* Add form — styled with sections */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: "hidden", marginBottom: 16 }}
          >
            <div className="v6-settings-block" style={{ borderColor: tabMeta.color }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 13, margin: 0 }}>
                  <span style={{ color: tabMeta.color, marginRight: 6 }}>+</span>
                  New {activeTabLabel.slice(0, -1)}
                </h3>
                <span className="v6-tiny v6-muted">{TAB_META[activeTab].color && `${activeTabLabel} memory`}</span>
              </div>
              <div className="v6-section-rule" style={{ marginBottom: 12 }} />
              <div className="v6-field" style={{ marginBottom: 10 }}>
                <label className="v6-field-label">Name</label>
                <input
                  className="v6-input"
                  placeholder={`e.g. ${activeTab === "character" ? "Princess Aria" : activeTab === "style" ? "Cyberpunk Noir" : activeTab === "brand" ? "Acme Corp" : "Hero Shot 01"}`}
                  value={newItem.name}
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
              </div>
              <div className="v6-field" style={{ marginBottom: 14 }}>
                <label className="v6-field-label">
                  Description{activeTab === "character" ? " — traits, appearance, background" : ""}
                </label>
                <textarea
                  className="v6-textarea"
                  placeholder={activeTab === "character"
                    ? '{"gender":"female","hair":"long blonde","style":"cinematic","personality":"brave"}'
                    : 'Describe the reference in detail...'}
                  value={newItem.data}
                  onChange={(e) => setNewItem({ ...newItem, data: e.target.value })}
                  rows={4}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="v6-btn v6-primary"
                  onClick={addItem}
                  disabled={!newItem.name || !newItem.data}
                >
                  <SvgIcon d="M12 5v14M5 12h14" size={14} /> Save Memory
                </button>
                <button className="v6-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit form */}
      <AnimatePresence>
        {editingItem && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: "hidden", marginBottom: 16 }}
          >
            <div className="v6-settings-block" style={{ borderColor: tabMeta.color }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 13, margin: 0 }}>
                  Edit: <span style={{ color: tabMeta.color }}>{editingItem.name}</span>
                </h3>
                <span className="v6-tiny v6-muted">{activeTabLabel} memory</span>
              </div>
              <div className="v6-section-rule" style={{ marginBottom: 12 }} />
              <div className="v6-field" style={{ marginBottom: 10 }}>
                <label className="v6-field-label">Name</label>
                <input
                  className="v6-input"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>
              <div className="v6-field" style={{ marginBottom: 14 }}>
                <label className="v6-field-label">Data</label>
                <textarea
                  className="v6-textarea"
                  value={typeof editingItem.data === "string" ? editingItem.data : JSON.stringify(editingItem.data, null, 2)}
                  onChange={(e) => setEditingItem({ ...editingItem, data: e.target.value })}
                  rows={4}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="v6-btn v6-primary"
                  onClick={() => updateItem(editingItem.id, { name: editingItem.name, data: editingItem.data })}
                >
                  <SvgIcon d="M4 12l5 5L20 6" size={14} /> Save Changes
                </button>
                <button className="v6-btn" onClick={() => setEditingItem(null)}>Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {loading ? (
        <div className="v6-media-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="v6-media-card">
              <div className="v6-skeleton v6-skeleton-media" />
              <div className="v6-media-card-body">
                <div className="v6-skeleton v6-skeleton-text" style={{ width: "60%" }} />
                <div className="v6-skeleton v6-skeleton-text v6-short" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="v6-empty-state v6-entrance" style={{ padding: "60px 0" }}>
          <div className="v6-empty-orbit">
            <SvgIcon d={TAB_META[activeTab].icon} size={26} color={tabMeta.color} />
          </div>
          <h2>No {activeTabLabel.toLowerCase()} yet</h2>
          <p>{TABS.find(t => t.id === activeTab)?.desc || "Add items to build your project memory."}</p>
          <button className="v6-btn v6-primary" onClick={() => setShowAdd(true)} style={{ marginTop: 8 }}>
            <SvgIcon d="M12 5v14M5 12h14" size={14} /> Add First {activeTabLabel.slice(0, -1)}
          </button>
        </div>
      ) : (
        <div className="v6-media-grid v6-stagger">
          {items.map((item, i) => {
            const meta = TAB_META[activeTab];
            return (
              <motion.div
                key={item.id}
                className="v6-media-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35, ease: EASE }}
              >
                {/* Type-colored header strip */}
                <div style={{ width: "100%", height: 3, background: meta.color }} />
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "4/3",
                    background: `linear-gradient(135deg, ${meta.color}18, ${meta.color}05)`,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <SvgIcon d={TAB_META[activeTab].icon} size={36} color={meta.color} />
                </div>
                <div className="v6-media-card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                    <h3 style={{ fontSize: 12, margin: 0 }}>{item.name}</h3>
                    <span className="v6-tiny v6-muted" style={{ flexShrink: 0 }}>
                      {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p style={{ fontSize: 9, color: "var(--v6-muted)", lineHeight: 1.4 }}>
                    {formatData(item.data)}
                  </p>
                </div>
                <div className="v6-card-actions">
                  <button
                    className="v6-btn v6-icon-only v6-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem(item);
                    }}
                    title="Edit"
                  >
                    <SvgIcon d="M15 3l6 6-15 15H3v-3L18 3z" size={13} />
                  </button>
                  <button
                    className="v6-btn v6-icon-only v6-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this memory?")) deleteItem(item.id);
                    }}
                    title="Delete"
                    style={{ color: "var(--v6-bad)" }}
                  >
                    <SvgIcon d="M6 6l12 12M18 6L6 18" size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
