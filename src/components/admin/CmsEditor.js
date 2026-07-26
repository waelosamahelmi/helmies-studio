"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconClose, IconCheck, IconEye } from "@/components/Icons";
import toast from "react-hot-toast";

const EASE = [0.32, 0.72, 0, 1];

// Default content keys that should exist on the landing page
const DEFAULT_CONTENT_KEYS = [
  { key: "hero.title", label: "Hero Title", section: "Hero", type: "text" },
  { key: "hero.subtitle", label: "Hero Subtitle", section: "Hero", type: "textarea" },
  { key: "hero.cta.primary", label: "Primary CTA Text", section: "Hero", type: "text" },
  { key: "hero.cta.secondary", label: "Secondary CTA Text", section: "Hero", type: "text" },
  { key: "features.headline", label: "Features Headline", section: "Features", type: "text" },
  { key: "features.description", label: "Features Description", section: "Features", type: "textarea" },
  { key: "pricing.headline", label: "Pricing Headline", section: "Pricing", type: "text" },
  { key: "pricing.description", label: "Pricing Description", section: "Pricing", type: "textarea" },
  { key: "faq.headline", label: "FAQ Headline", section: "FAQ", type: "text" },
  { key: "footer.tagline", label: "Footer Tagline", section: "Footer", type: "text" },
  { key: "social.title", label: "Social Share Title", section: "SEO", type: "text" },
  { key: "social.description", label: "Social Share Description", section: "SEO", type: "textarea" },
];

export default function CmsEditor() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const loadContent = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/cms-content")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const items = Array.isArray(data) ? data : data.entries || data.content || [];
        setEntries(items);
        setHasDraft(items.some((e) => e.status === "draft"));
      })
      .catch(() => {
        // API may not exist yet — initialize with empty defaults
        setEntries(
          DEFAULT_CONTENT_KEYS.map((k) => ({
            key: k.key,
            label: k.label,
            section: k.section,
            type: k.type,
            value: "",
            status: "draft",
          }))
        );
        setHasDraft(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadContent(); }, [loadContent]);

  const startEdit = (entry) => {
    setEditingKey(entry.key);
    setEditValue(entry.value || "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const saveEntry = async (entry) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cms-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: entry.key, value: editValue, label: entry.label, section: entry.section, type: entry.type }),
      });
      if (res.ok) {
        toast.success(`"${entry.label}" saved as draft`);
        setEditingKey(null);
        setEditValue("");
        loadContent();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Save failed");
      }
    } catch (e) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const publishAll = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/cms-content/publish", { method: "POST" });
      if (res.ok) {
        toast.success("All drafts published!");
        setHasDraft(false);
        loadContent();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Publish failed");
      }
    } catch (e) {
      toast.error(`Publish failed: ${e.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // Group entries by section
  const sections = {};
  for (const entry of entries) {
    const sec = entry.section || "General";
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(entry);
  }

  if (loading) {
    return (
      <div className="admin__empty">
        <p>Loading content…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <h3 style={{ fontSize: "1rem" }}>Website Content Editor</h3>
          <span className={`admin__badge ${hasDraft ? "pending" : "enabled"}`}>
            {hasDraft ? "Drafts pending" : "Published"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`btn btn-sm ${previewMode ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setPreviewMode(!previewMode)}
            title="Toggle preview mode"
          >
            <IconEye style={{ display: "inline", width: 14, height: 14, marginRight: 4 }} />
            {previewMode ? "Editing" : "Preview"}
          </button>
          {hasDraft && (
            <button
              className="btn btn-primary btn-sm"
              onClick={publishAll}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "Publish All"}
            </button>
          )}
        </div>
      </div>

      {/* Content sections */}
      {Object.entries(sections).length === 0 ? (
        <div className="admin__chart" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "rgba(242,242,247,0.5)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            No content entries configured.
          </p>
          <p style={{ color: "rgba(242,242,247,0.35)", fontSize: "0.75rem" }}>
            API endpoint: <code style={{ background: "rgba(255,255,255,0.05)", padding: "0.15rem 0.4rem", borderRadius: "0.25rem" }}>/api/admin/cms-content</code>
          </p>
        </div>
      ) : (
        Object.entries(sections).map(([sectionName, sectionEntries]) => (
          <div key={sectionName} style={{ marginBottom: "1.5rem" }}>
            <h4
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(242,242,247,0.4)",
                marginBottom: "0.75rem",
                paddingBottom: "0.4rem",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {sectionName}
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {sectionEntries.map((entry) => {
                const isEditing = editingKey === entry.key;
                const status = entry.status || (entry.value ? "published" : "draft");

                return (
                  <div
                    key={entry.key}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      padding: "0.75rem 1rem",
                      background: isEditing ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isEditing ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: "0.5rem",
                      gap: "0.75rem",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* Label */}
                    <div style={{ minWidth: 140, flexShrink: 0 }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>{entry.label}</div>
                      <div style={{ fontSize: "0.65rem", color: "rgba(242,242,247,0.35)", fontFamily: "monospace" }}>
                        {entry.key}
                      </div>
                    </div>

                    {/* Value / Editor */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isEditing ? (
                        entry.type === "textarea" ? (
                          <textarea
                            className="field-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={3}
                            style={{
                              fontSize: "0.8rem",
                              padding: "0.4rem 0.6rem",
                              width: "100%",
                              resize: "vertical",
                              fontFamily: "inherit",
                            }}
                            placeholder={`Enter ${entry.label.toLowerCase()}…`}
                          />
                        ) : (
                          <input
                            className="field-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            style={{ fontSize: "0.8rem", padding: "0.4rem 0.6rem", width: "100%" }}
                            placeholder={`Enter ${entry.label.toLowerCase()}…`}
                          />
                        )
                      ) : previewMode ? (
                        <div
                          style={{
                            padding: "0.5rem 0.75rem",
                            background: "rgba(0,0,0,0.2)",
                            borderRadius: "0.35rem",
                            fontSize: "0.85rem",
                            color: "rgba(242,242,247,0.85)",
                            minHeight: entry.type === "textarea" ? "3rem" : "auto",
                            whiteSpace: entry.type === "textarea" ? "pre-wrap" : "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.value || (
                            <span style={{ color: "rgba(242,242,247,0.2)", fontStyle: "italic" }}>
                              Empty — click Edit to add content
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: "0.8rem",
                            color: entry.value ? "rgba(242,242,247,0.8)" : "rgba(242,242,247,0.2)",
                            padding: "0.25rem 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                          }}
                        >
                          {entry.value || "—"}
                        </div>
                      )}
                    </div>

                    {/* Status badge + Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                      <span
                        className={`admin__badge ${status === "published" ? "enabled" : status === "draft" ? "pending" : "disabled"}`}
                        style={{ fontSize: "0.6rem" }}
                      >
                        {status}
                      </span>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => saveEntry(entry)}
                            disabled={saving}
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                          >
                            {saving ? "…" : "Save"}
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={cancelEdit}
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => startEdit(entry)}
                          style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
