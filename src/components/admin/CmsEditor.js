"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — CMS CONTENT
   ──────────────────────────────────────────────────────────────────────────
   /api/admin/cms-content: GET, POST { key, section, content }, PATCH { id, content }.
   /api/admin/cms-content/publish: POST { id } — flips the entry to
   published and writes a revision snapshot, both in one transaction.

   EDITSv1 E8.5: that route used to also send `key` so it could "drop any
   sibling with the same key back to draft". CmsEntry.key is @unique, so no
   sibling can exist — the statement was written against a versioned-rows
   model that was never built. The model is one row per key carrying a
   status, with CmsRevision as its append-only history. Publishing also
   used to write no revision at all (see the route's header).

   `content` is a Json column, so an entry may hold a plain string or a
   structure. The editor shows whichever it is and stores JSON back as JSON.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Confirm, Modal } from "@/components/studio/kit/Sheet";
import {
  Empty, Fault, Note, Panel, Reload, Rows, Table,
  asArray, num, send, stamp, useResource,
} from "./AdminPanel";
import { IcPlus, IcText } from "@/components/studio/kit/Icons";

/* Json column in, textarea out. */
function toText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

/* Textarea in, Json column out — structured only when it really is JSON. */
function toContent(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch (e) {
      return { ok: false, error: `That looks like JSON but will not parse: ${e.message}` };
    }
  }
  return { ok: true, value: text };
}

export default function CmsEditor() {
  const { data, loading, error, reload } = useResource("/api/admin/cms-content");
  const entries = asArray(data);

  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: "", section: "general", content: "" });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");
  const [publishing, setPublishing] = useState(null);

  const drafts = useMemo(() => entries.filter((e) => e.status !== "published").length, [entries]);

  const openEdit = (entry) => {
    setEditing(entry);
    setDraft(toText(entry.content));
    setErrs({});
    setFault("");
  };

  const save = async () => {
    const parsed = toContent(draft);
    if (!parsed.ok) {
      setErrs({ content: parsed.error });
      return;
    }
    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/cms-content", "PATCH", { id: editing.id, content: parsed.value });
      setEditing(null);
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const next = {};
    if (!/^[a-z0-9.\-_]+$/.test(form.key)) next.key = "Lowercase letters, numbers, dots, dashes and underscores.";
    if (!form.section.trim()) next.section = "Group it under a section.";
    const parsed = toContent(form.content);
    if (!parsed.ok) next.content = parsed.error;
    setErrs(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/cms-content", "POST", {
        key: form.key,
        section: form.section.trim(),
        content: parsed.value,
      });
      setForm({ key: "", section: "general", content: "" });
      setCreating(false);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (entry) => {
    setFault("");
    try {
      // `key` is no longer sent — the entry is addressed by id, and letting
      // the client name a key that decided which OTHER rows got demoted was
      // half of the bug repaired in E8.5.
      await send("/api/admin/cms-content/publish", "POST", { id: entry.id });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  return (
    <>
      <Panel
        title="Website content"
        badge={`${num(entries.length)} entries · ${num(drafts)} draft`}
        action={
          <>
            <button type="button" className="hs-btn hs-btn--sm" onClick={() => setCreating(true)}>
              <IcPlus className="hs-icon-sm" />
              New entry
            </button>
            <Reload onClick={reload} />
          </>
        }
      >
        <Fault>{fault}</Fault>
        <Fault>{error}</Fault>

        {loading ? <Rows /> : entries.length === 0 ? (
          <Empty
            icon={IcText}
            title="No content entries"
            action={
              <button type="button" className="hs-btn hs-btn--primary" onClick={() => setCreating(true)}>
                Create the first entry
              </button>
            }
          >
            Entries are keyed strings the site can read instead of hardcoding copy.
          </Empty>
        ) : (
          <Table caption="CMS entries" head={["Key", "Section", "Content", "Status", "Updated", {}]}>
            {entries.map((e) => {
              const preview = toText(e.content).replace(/\s+/g, " ").slice(0, 60);
              return (
                <tr key={e.id}>
                  <td className="hs-mono" style={{ color: "var(--tx)" }}>{e.key}</td>
                  <td><span className="hs-badge">{e.section}</span></td>
                  <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {preview || <span className="hs-mute">empty</span>}
                  </td>
                  <td>
                    <span className={`hs-badge ${e.status === "published" ? "hs-badge--signal" : "hs-badge--caution"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="hs-mono">{stamp(e.updatedAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="hs-btn hs-btn--sm" onClick={() => openEdit(e)}>Edit</button>
                    {e.status !== "published" && (
                      <button
                        type="button"
                        className="hs-btn hs-btn--primary hs-btn--sm"
                        style={{ marginLeft: "var(--s-2)" }}
                        onClick={() => setPublishing(e)}
                      >
                        Publish
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}

        {/* EDITSv1 E8.5: this used to say only the first sentence, while no
            page in the app read a CmsEntry at all — so "reaches the public
            site" was not true of anything. One key is wired now; the rest
            are stored but not yet rendered anywhere, and saying so is
            better than letting the owner write copy into a void. */}
        <Note>
          Editing saves a draft. Nothing reaches the public site until you publish it.
          Wired keys render live: <span className="hs-mono">pricing.faq</span> replaces the
          questions on the pricing page (an array of <span className="hs-mono">{'{ q, a }'}</span>{" "}
          objects). Any other key is stored and versioned here, but no page reads it yet.
        </Note>
      </Panel>

      {/* Edit */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.key}` : ""}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={save} disabled={busy}>
              {busy && <span className="hs-spin" aria-hidden="true" />}
              Save draft
            </button>
          </>
        }
      >
        <Fault>{fault}</Fault>
        <div className="hs-field">
          <label className="hs-label" htmlFor="cms-content">Content</label>
          <textarea
            id="cms-content"
            className="hs-textarea"
            rows={12}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setErrs({}); }}
            spellCheck
            aria-invalid={errs.content ? "true" : undefined}
            aria-describedby={errs.content ? "cms-content-error" : "cms-content-hint"}
          />
          {errs.content
            ? <p className="hs-error" id="cms-content-error">{errs.content}</p>
            : <p className="hs-hint" id="cms-content-hint">
                Starts with <code>{"{"}</code> or <code>[</code> and it is stored as JSON. Anything else is stored as plain text.
              </p>}
        </div>
      </Modal>

      {/* Create */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New content entry"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" form="cms-form" className="hs-btn hs-btn--primary" disabled={busy}>
              {busy && <span className="hs-spin" aria-hidden="true" />}
              Create entry
            </button>
          </>
        }
      >
        <form id="cms-form" onSubmit={create} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="cms-key">Key</label>
            <input
              id="cms-key"
              className="hs-input hs-mono"
              value={form.key}
              onChange={(e) => { setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9.\-_]/g, "") }); setErrs((p) => ({ ...p, key: "" })); }}
              autoComplete="off"
              placeholder="hero.title"
              aria-invalid={errs.key ? "true" : undefined}
              aria-describedby={errs.key ? "cms-key-error" : "cms-key-hint"}
            />
            {errs.key
              ? <p className="hs-error" id="cms-key-error">{errs.key}</p>
              : <p className="hs-hint" id="cms-key-hint">Must be unique across the whole site.</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="cms-section">Section</label>
            <input
              id="cms-section"
              className="hs-input"
              value={form.section}
              onChange={(e) => { setForm({ ...form, section: e.target.value }); setErrs((p) => ({ ...p, section: "" })); }}
              autoComplete="off"
              placeholder="hero"
              aria-invalid={errs.section ? "true" : undefined}
              aria-describedby={errs.section ? "cms-section-error" : undefined}
            />
            {errs.section && <p className="hs-error" id="cms-section-error">{errs.section}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="cms-new-content">Content</label>
            <textarea
              id="cms-new-content"
              className="hs-textarea"
              rows={8}
              value={form.content}
              onChange={(e) => { setForm({ ...form, content: e.target.value }); setErrs((p) => ({ ...p, content: "" })); }}
              aria-invalid={errs.content ? "true" : undefined}
              aria-describedby={errs.content ? "cms-new-content-error" : undefined}
            />
            {errs.content && <p className="hs-error" id="cms-new-content-error">{errs.content}</p>}
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!publishing}
        onClose={() => setPublishing(null)}
        onConfirm={() => publish(publishing)}
        title="Publish this entry?"
        body={
          publishing
            ? `${publishing.key} goes live immediately and any other entry with the same key drops back to draft. A revision snapshot is kept.`
            : ""
        }
        confirmLabel="Publish"
        danger={false}
      />
    </>
  );
}
