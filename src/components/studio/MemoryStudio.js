"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/client-fetch";
import {
  Confirm, Modal, Field, Segmented,
  IcBrain, IcPersona, IcPalette, IcImage, IcSearch, IcPlus, IcTrash,
  IcCopy, IcCheck, IcRefresh, IcAlert, IcClose, IcSettings,
} from "@/components/studio/kit";

/* ══════════════════════════════════════════════════════════════════════════
   MEMORY — .st-lib collection browser
   ──────────────────────────────────────────────────────────────────────────
   The records the prompt pipeline reuses: characters it keeps consistent,
   styles it re-applies, references it points at, and brand notes it carries.
   ══════════════════════════════════════════════════════════════════════════ */

const KINDS = [
  {
    value: "character",
    label: "Characters",
    one: "character",
    icon: IcPersona,
    blurb: "A person the models should render the same way every time.",
    example: '{"age":"early 30s","hair":"dark, cropped","build":"tall, lean","wardrobe":"grey wool"}',
  },
  {
    value: "style",
    label: "Styles",
    one: "style",
    icon: IcPalette,
    blurb: "A look you re-apply — lens, light, grade, texture.",
    example: '{"lens":"35mm","light":"overcast","grade":"cool, matte","texture":"fine grain"}',
  },
  {
    value: "asset",
    label: "References",
    one: "reference",
    icon: IcImage,
    blurb: "A file or link the models should treat as the reference.",
    example: '{"url":"https://…/hero.jpg","use":"framing reference only"}',
  },
  {
    value: "brand",
    label: "Brand notes",
    one: "brand note",
    icon: IcSettings,
    blurb: "Standing instructions that travel with every generation.",
    example: '{"never":"logos on skin","always":"product left of centre"}',
  },
];

const kindOf = (v) => KINDS.find((k) => k.value === v) || KINDS[0];

const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

/* ── Formatting ───────────────────────────────────────────────────────── */
function dateLabel(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function asText(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try { return JSON.stringify(data, null, 2); } catch { return String(data); }
}

function summarise(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map((v) => String(v)).join(", ");
  if (typeof data === "object") {
    return Object.entries(data).map(([k, v]) => `${k}: ${typeof v === "object" ? "…" : v}`).join(" · ");
  }
  return String(data);
}

function fieldCount(data) {
  if (data && typeof data === "object" && !Array.isArray(data)) return Object.keys(data).length;
  if (Array.isArray(data)) return data.length;
  return null;
}

/* Text in the editor is JSON when it parses as JSON, and plain prose otherwise. */
function parseData(text) {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.startsWith("{") || t.startsWith("[")) {
    try { return JSON.parse(t); } catch { return t; }
  }
  return t;
}

const isJsonish = (t) => {
  const s = String(t ?? "").trim();
  return s.startsWith("{") || s.startsWith("[");
};

const jsonBroken = (t) => {
  if (!isJsonish(t)) return false;
  try { JSON.parse(String(t).trim()); return false; } catch { return true; }
};

/* ══════════════════════════════════════════════════════════════════════ */
export default function MemoryStudio() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloads, setReloads] = useState(0);

  const [kind, setKind] = useState("character");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");

  const [editor, setEditor] = useState(null); // { mode:"new"|"edit", id, type, name, text }
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const [copied, setCopied] = useState("");

  const gridRef = useRef(null);
  const copyTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const meta = kindOf(kind);

  /* ── Load ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch(`/api/memory?type=${encodeURIComponent(kind)}`);
        const data = await res.json();
        if (dead) return;
        setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!dead) setError(err?.message || "The memory records could not be loaded.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, [kind, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  /* ── Mutations ──────────────────────────────────────────────────────── */
  const save = useCallback(async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name || jsonBroken(editor.text)) return;

    setSaving(true);
    setError("");
    setNotice("");
    const data = parseData(editor.text);

    try {
      if (editor.mode === "new") {
        const res = await apiFetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: editor.type, name, data }),
        });
        const body = await res.json();
        const record = body?.memory;
        if (record && record.type === kind) setItems((prev) => [record, ...prev]);
        else reload();
        setNotice(`Saved “${name}”.`);
      } else {
        const res = await apiFetch("/api/memory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editor.id, name, data }),
        });
        const body = await res.json().catch(() => null);
        const record = body?.memory;
        setItems((prev) =>
          prev.map((it) =>
            it.id === editor.id
              ? record || { ...it, name, data, updatedAt: new Date().toISOString() }
              : it,
          ),
        );
        setNotice(`Updated “${name}”.`);
      }
      setEditor(null);
    } catch (err) {
      setError(err?.message || "The record could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [editor, kind, reload]);

  const remove = useCallback(async (item) => {
    setError("");
    try {
      await apiFetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (err) {
      setError(err?.message || "The record could not be deleted.");
    }
  }, []);

  const copyRecord = useCallback(async (item) => {
    try {
      await navigator.clipboard.writeText(asText(item.data));
      setCopied(item.id);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("The browser blocked the clipboard. Open the record and copy the text by hand.");
    }
  }, []);

  /* ── Search and sort ────────────────────────────────────────────────── */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((it) => {
      if (!q) return true;
      return String(it.name || "").toLowerCase().includes(q)
        || summarise(it.data).toLowerCase().includes(q);
    });
    list = [...list];
    if (sort === "recent") list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    else if (sort === "oldest") list.sort((a, b) => new Date(a.updatedAt || a.createdAt) - new Date(b.updatedAt || b.createdAt));
    else list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return list;
  }, [items, query, sort]);

  const onGridKey = (e) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    const nodes = Array.from(gridRef.current?.querySelectorAll("[data-card]") || []);
    const i = nodes.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = Math.max(1, String(window.getComputedStyle(gridRef.current).gridTemplateColumns).split(" ").filter(Boolean).length);
    let next = i;
    if (e.key === "ArrowRight") next = i + 1;
    else if (e.key === "ArrowLeft") next = i - 1;
    else if (e.key === "ArrowDown") next = i + cols;
    else if (e.key === "ArrowUp") next = i - cols;
    else if (e.key === "Home") next = 0;
    else next = nodes.length - 1;
    if (next < 0 || next >= nodes.length) return;
    e.preventDefault();
    nodes[next].focus();
  };

  const openNew = () => setEditor({ mode: "new", id: null, type: kind, name: "", text: "" });
  const openEdit = (item) =>
    setEditor({ mode: "edit", id: item.id, type: item.type || kind, name: item.name || "", text: asText(item.data) });

  /* Keep the last values on screen while an overlay plays its exit */
  const lastEditor = useRef(null);
  const lastPending = useRef(null);
  if (editor) lastEditor.current = editor;
  if (pending) lastPending.current = pending;
  const editorView = editor || lastEditor.current;
  const doomed = pending || lastPending.current;

  const editorKind = editorView ? kindOf(editorView.type) : meta;
  const brokenJson = editorView ? jsonBroken(editorView.text) : false;

  return (
    <div className="st-lib">
      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="st-lib__bar">
        <Segmented
          label="Memory type"
          value={kind}
          onChange={(v) => { setKind(v); setNotice(""); }}
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
        />

        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160, maxWidth: 320 }}>
          <IcSearch
            className="hs-icon-sm"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
          />
          <input
            type="search"
            className="hs-input"
            style={{ paddingLeft: 32 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search names and contents"
            aria-label="Search memory records"
          />
        </div>

        <select
          className="hs-select"
          style={{ width: "auto", minWidth: 160 }}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort order"
        >
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <span className="hs-mono hs-mute" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
          {loading ? "—" : `${shown.length} saved`}
        </span>

        <button type="button" className="hs-btn hs-btn--primary hs-btn--sm" style={{ marginLeft: "auto" }} onClick={openNew}>
          <IcPlus className="hs-icon-sm" /> New {meta.one}
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="st-lib__body">
        {error && (
          <div className="hs-notice hs-notice--fault" style={{ marginBottom: "var(--s-4)" }} role="alert">
            <IcAlert className="hs-icon-sm" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reload}>
              <IcRefresh className="hs-icon-sm" /> Retry
            </button>
          </div>
        )}
        {notice && !error && (
          <div className="hs-notice hs-notice--signal" style={{ marginBottom: "var(--s-4)" }} role="status">
            <IcCheck className="hs-icon-sm" style={{ marginTop: 2 }} />
            <span style={{ flex: 1 }}>{notice}</span>
          </div>
        )}

        {loading ? (
          <div className="st-lib__grid" aria-busy="true" aria-label="Loading memory records">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="st-item">
                <div className="hs-skel" style={{ aspectRatio: "1", borderRadius: 0 }} />
                <div className="st-item__body">
                  <div className="hs-skel" style={{ height: 10, width: "68%" }} />
                  <div className="hs-skel" style={{ height: 8, width: "44%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="hs-empty">
            <span className="hs-empty__mark"><IcBrain /></span>
            {query.trim() ? (
              <>
                <h3>No {meta.label.toLowerCase()} match that search</h3>
                <p>Search covers the name and the saved contents of every record in this list.</p>
                <button type="button" className="hs-btn hs-btn--outline" onClick={() => setQuery("")}>
                  <IcClose className="hs-icon-sm" /> Clear search
                </button>
              </>
            ) : (
              <>
                <h3>No {meta.label.toLowerCase()} saved yet</h3>
                <p>{meta.blurb} Saved records are pulled into prompts so the same subject or look comes back the next time.</p>
                <button type="button" className="hs-btn hs-btn--primary" onClick={openNew}>
                  <IcPlus className="hs-icon-sm" /> Save the first {meta.one}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="st-lib__grid" ref={gridRef} role="list" aria-label={meta.label} onKeyDown={onGridKey}>
            {shown.map((item) => {
              const k = kindOf(item.type || kind);
              const Icon = k.icon;
              const fields = fieldCount(item.data);
              return (
                <div key={item.id} className="st-item" role="listitem">
                  <button
                    type="button"
                    data-card
                    onClick={() => openEdit(item)}
                    aria-label={`${item.name} — ${k.one}, updated ${dateLabel(item.updatedAt) || "recently"}. Open the editor.`}
                    style={{
                      display: "block", width: "100%", padding: 0, border: 0,
                      background: "transparent", color: "inherit", font: "inherit",
                      textAlign: "left", cursor: "pointer",
                    }}
                  >
                    <div className="st-item__frame">
                      <span style={{ display: "grid", placeItems: "center", height: "100%", padding: "var(--s-4)", gap: "var(--s-2)" }}>
                        <Icon style={{ width: 28, height: 28, color: "var(--tx-ghost)" }} />
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute", inset: "auto var(--s-3) var(--s-3)",
                          fontSize: 9.5, lineHeight: 1.4, color: "var(--tx-mute)",
                          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {summarise(item.data)}
                      </span>
                      <span className="st-item__kind">{k.one}</span>
                    </div>
                    <div className="st-item__body">
                      <span className="st-item__name">{item.name}</span>
                      <span className="st-item__meta">
                        {[dateLabel(item.updatedAt), fields != null ? `${fields} field${fields === 1 ? "" : "s"}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </button>

                  <div className="st-item__acts">
                    <button
                      type="button"
                      className="hs-btn hs-btn--sm hs-btn--icon"
                      onClick={() => copyRecord(item)}
                      aria-label={`Copy the contents of ${item.name}`}
                      title={copied === item.id ? "Copied" : "Copy contents"}
                    >
                      {copied === item.id ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                    </button>
                    <button
                      type="button"
                      className="hs-btn hs-btn--sm hs-btn--icon hs-btn--danger"
                      onClick={() => setPending(item)}
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                    >
                      <IcTrash className="hs-icon-sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Record editor ────────────────────────────────────────────── */}
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editorView?.mode === "new" ? `New ${editorKind.one}` : `Edit ${editorKind.one}`}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setEditor(null)}>Cancel</button>
            <button
              type="button"
              className="hs-btn hs-btn--primary"
              onClick={save}
              disabled={saving || !editor?.name.trim() || brokenJson}
            >
              {saving
                ? <><span className="hs-spin" /> Saving</>
                : <><IcCheck className="hs-icon-sm" /> {editorView?.mode === "new" ? "Save record" : "Save changes"}</>}
            </button>
          </>
        }
      >
        {editorView && (
          <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
            <p className="hs-hint">{editorKind.blurb}</p>

            {editorView.mode === "new" && (
              <Field label="Type">
                <Segmented
                  label="Record type"
                  value={editorView.type}
                  onChange={(v) => setEditor((e) => ({ ...e, type: v }))}
                  options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
                />
              </Field>
            )}

            <Field label="Name" hint="How you will pick this record out of a list later.">
              {(id) => (
                <input
                  id={id}
                  className="hs-input"
                  value={editorView.name}
                  onChange={(e) => setEditor((s) => ({ ...s, name: e.target.value }))}
                  placeholder={editorKind.value === "character" ? "Mara, lead" : "Cold winter grade"}
                  autoFocus
                />
              )}
            </Field>

            <Field
              label="Contents"
              hint="Write prose, or a JSON object for named traits. Both are stored as-is and read back into prompts."
              error={brokenJson ? "This starts like JSON but does not parse. Close the braces, or remove them to store it as prose." : undefined}
            >
              {(id) => (
                <textarea
                  id={id}
                  className="hs-input hs-textarea hs-mono"
                  style={{ minHeight: 160, fontSize: 11, lineHeight: 1.6 }}
                  value={editorView.text}
                  onChange={(e) => setEditor((s) => ({ ...s, text: e.target.value }))}
                  placeholder={editorKind.example}
                  spellCheck="false"
                />
              )}
            </Field>

            {editorView.mode === "edit" && (
              <p className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                id {editorView.id}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* ── Confirm ──────────────────────────────────────────────────── */}
      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && remove(pending)}
        title="Delete this record?"
        body={
          doomed
            ? `“${doomed.name}” stops being available to prompts. Anything already generated with it keeps what it made.`
            : ""
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
