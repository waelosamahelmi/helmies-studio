"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — ANNOUNCEMENT CAMPAIGNS  (EDITSv1 Phase E8 Task E8.3)
   ──────────────────────────────────────────────────────────────────────────
   Extracted out of AdminPanel.js, where it had grown past the "small
   panels" this module is for, and given the things a campaign screen
   actually needs:

     · EDIT — the conspicuous hole. Before this there was create, toggle and
       delete only, so correcting a typo meant deleting the campaign (and
       its metrics with it) and typing it again.
     · DUPLICATE — a variant of last month's promotion should not be retyped
       field by field. The copy is created switched OFF, because a button
       that silently pushes something live is a dangerous button.
     · The full field set: placement, audience, plan targets, image, CTA,
       priority, schedule.
     · IMPRESSIONS / CLICKS / DISMISSALS, so "did that promotion work?" has
       an answer. Dismissals matter as much as clicks — a campaign people
       actively closed is a different result from one they ignored.
     · A live PREVIEW, so the owner sees the banner or popup before a
       customer does.
   ══════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { Confirm, Modal } from "@/components/studio/kit/Sheet";
import { IcMegaphone, IcPlus, IcTrash } from "@/components/studio/kit/Icons";
import {
  Empty, Fault, Panel, Reload, Rows, Table, asArray, day, num, send, useResource,
} from "./AdminPanel";

const STYLES = ["info", "success", "warning", "critical"];
const PLACEMENTS = ["banner", "modal", "toast"];
const AUDIENCES = ["all", "anon", "authed"];

const BLANK = {
  message: "", title: "", style: "info", placement: "banner", audience: "all",
  planTargets: "", ctaLabel: "", ctaUrl: "", imageUrl: "", link: "",
  priority: "0", startDate: "", endDate: "", dismissible: true,
};

const PLACEMENT_LABEL = {
  banner: "Bar along the bottom of every page",
  modal: "Popup over the page, once per person",
  toast: "Small notice, same styling as the bar",
};

const AUDIENCE_LABEL = {
  all: "Everyone",
  anon: "Signed-out visitors only",
  authed: "Signed-in users only",
};

// A row from the API back into form state. `null` columns must become ""
// or React switches the input from controlled to uncontrolled mid-edit.
function toForm(a) {
  return {
    message: a.message || "",
    title: a.title || "",
    style: a.style || "info",
    placement: a.placement || "banner",
    audience: a.audience || "all",
    planTargets: (a.planTargets || []).join(", "),
    ctaLabel: a.ctaLabel || "",
    ctaUrl: a.ctaUrl || "",
    imageUrl: a.imageUrl || "",
    link: a.link || "",
    priority: String(a.priority ?? 0),
    startDate: a.startDate ? String(a.startDate).slice(0, 10) : "",
    endDate: a.endDate ? String(a.endDate).slice(0, 10) : "",
    dismissible: a.dismissible !== false,
  };
}

function toPayload(form) {
  return {
    message: form.message.trim(),
    title: form.title.trim() || null,
    style: form.style,
    placement: form.placement,
    audience: form.audience,
    planTargets: form.planTargets,
    ctaLabel: form.ctaLabel.trim() || null,
    ctaUrl: form.ctaUrl.trim() || null,
    imageUrl: form.imageUrl.trim() || null,
    link: form.link.trim() || null,
    priority: form.priority,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    dismissible: form.dismissible,
  };
}

function validate(form) {
  const errs = {};
  if (!form.message.trim()) errs.message = "Write the line people will read.";
  else if (form.message.trim().length > 200) errs.message = "Keep it under 200 characters.";
  if (form.ctaLabel.trim() && !form.ctaUrl.trim()) errs.ctaUrl = "A button needs somewhere to go.";
  return errs;
}

/* ── The shared field set, used by both the create form and the editor ─── */
function Fields({ form, set, errs, idPrefix }) {
  const id = (name) => `${idPrefix}-${name}`;
  const change = (name) => (e) => set({ ...form, [name]: e.target.value });

  return (
    <>
      <div className="hs-field">
        <label className="hs-label" htmlFor={id("message")}>Message</label>
        <input
          id={id("message")}
          className="hs-input"
          value={form.message}
          onChange={change("message")}
          maxLength={200}
          autoComplete="off"
          placeholder="Veo 3 is live in the video studio."
          aria-invalid={errs.message ? "true" : undefined}
          aria-describedby={errs.message ? `${id("message")}-error` : `${id("message")}-hint`}
        />
        {errs.message
          ? <p className="hs-error" id={`${id("message")}-error`}>{errs.message}</p>
          : <p className="hs-hint" id={`${id("message")}-hint`}><span className="hs-mono">{form.message.length}</span> / 200 characters</p>}
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("title")}>Title <span className="hs-mute">(popups only)</span></label>
        <input id={id("title")} className="hs-input" value={form.title} onChange={change("title")} maxLength={140} autoComplete="off" />
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("placement")}>Placement</label>
        <select id={id("placement")} className="hs-select" value={form.placement} onChange={change("placement")}>
          {PLACEMENTS.map((p) => <option key={p} value={p}>{PLACEMENT_LABEL[p]}</option>)}
        </select>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("style")}>Style</label>
        <select id={id("style")} className="hs-select" value={form.style} onChange={change("style")}>
          {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("audience")}>Audience</label>
        <select id={id("audience")} className="hs-select" value={form.audience} onChange={change("audience")}>
          {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
        </select>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("plans")}>Plan targets</label>
        <input
          id={id("plans")}
          className="hs-input"
          value={form.planTargets}
          onChange={change("planTargets")}
          autoComplete="off"
          placeholder="pro, studio"
          aria-describedby={`${id("plans")}-hint`}
        />
        <p className="hs-hint" id={`${id("plans")}-hint`}>
          Comma-separated plan slugs. Leave empty to reach every plan — a targeted
          campaign is only shown to signed-in users on one of these plans.
        </p>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("ctaLabel")}>Button label <span className="hs-mute">(optional)</span></label>
        <input id={id("ctaLabel")} className="hs-input" value={form.ctaLabel} onChange={change("ctaLabel")} maxLength={60} autoComplete="off" placeholder="See the plans" />
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("ctaUrl")}>Button link</label>
        <input
          id={id("ctaUrl")}
          className="hs-input"
          value={form.ctaUrl}
          onChange={change("ctaUrl")}
          autoComplete="off"
          placeholder="/pricing"
          aria-invalid={errs.ctaUrl ? "true" : undefined}
          aria-describedby={errs.ctaUrl ? `${id("ctaUrl")}-error` : undefined}
        />
        {errs.ctaUrl && <p className="hs-error" id={`${id("ctaUrl")}-error`}>{errs.ctaUrl}</p>}
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("imageUrl")}>Image link <span className="hs-mute">(popups only)</span></label>
        <input id={id("imageUrl")} className="hs-input" value={form.imageUrl} onChange={change("imageUrl")} autoComplete="off" placeholder="/uploads/promo.png" />
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("priority")}>Priority</label>
        <input id={id("priority")} className="hs-input" type="number" value={form.priority} onChange={change("priority")} min={-100} max={100} aria-describedby={`${id("priority")}-hint`} />
        <p className="hs-hint" id={`${id("priority")}-hint`}>Higher wins when more than one campaign matches the same person.</p>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("start")}>Starts</label>
        <input id={id("start")} className="hs-input" type="date" value={form.startDate} onChange={change("startDate")} />
        <p className="hs-hint">Leave empty to start immediately.</p>
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor={id("end")}>Ends</label>
        <input id={id("end")} className="hs-input" type="date" value={form.endDate} onChange={change("endDate")} />
        <p className="hs-hint">Leave empty to run until you switch it off.</p>
      </div>

      <div className="hs-field">
        <label className="hs-row" htmlFor={id("dismissible")} style={{ gap: "var(--s-3)" }}>
          <input
            id={id("dismissible")}
            type="checkbox"
            checked={form.dismissible}
            onChange={(e) => set({ ...form, dismissible: e.target.checked })}
          />
          <span>People can close this</span>
        </label>
        <p className="hs-hint">
          Only switch this off for something nobody should be able to wave away —
          a scheduled outage, not a promotion.
        </p>
      </div>
    </>
  );
}

/* ── Preview — what the campaign will actually look like ────────────────── */
function Preview({ form }) {
  const isModal = form.placement === "modal";
  return (
    <section className="pg-panel" aria-label="Campaign preview">
      <div className="pg-panel__head">
        <h2>Preview</h2>
        <span className="hs-badge">{isModal ? "popup" : form.placement}</span>
      </div>
      <div className="pg-panel__body">
        {isModal ? (
          <div className={`hs-announce-pop hs-announce--${form.style}`} style={{ border: "1px solid var(--line-strong)", borderRadius: "var(--r-lg)", padding: "var(--s-4)" }}>
            {form.title && <strong style={{ fontSize: "var(--t-md)" }}>{form.title}</strong>}
            <p className="hs-announce-pop__text">{form.message || "Your message appears here."}</p>
            {form.ctaLabel && <span className="hs-btn hs-btn--primary" style={{ alignSelf: "flex-start" }}>{form.ctaLabel}</span>}
          </div>
        ) : (
          // Same classes the real bar uses, minus the fixed positioning —
          // this has to sit inside the admin page rather than float over it.
          <div className={`hs-announce hs-announce--${form.style}`} style={{ position: "static", transform: "none", width: "100%" }}>
            <span className="hs-announce__body">
              {form.title && <strong className="hs-announce__title">{form.title}</strong>}
              <span>{form.message || "Your message appears here."}</span>
            </span>
            {form.ctaLabel && <span className="hs-announce__cta">{form.ctaLabel}</span>}
          </div>
        )}
        <p className="hs-hint" style={{ marginTop: "var(--s-3)" }}>
          Shown to {AUDIENCE_LABEL[form.audience].toLowerCase()}
          {form.planTargets.trim() ? ` on ${form.planTargets.trim()}` : ""}.
        </p>
      </div>
    </section>
  );
}

export default function AnnouncementsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/announcements");
  const items = asArray(data);

  const [form, setForm] = useState(BLANK);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [editErrs, setEditErrs] = useState({});
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState(null);

  const live = useMemo(() => items.filter((a) => a.isActive).length, [items]);

  const create = async (e) => {
    e.preventDefault();
    const next = validate(form);
    setErrs(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/announcements", "POST", toPayload(form));
      setForm(BLANK);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (a) => {
    setEditing(a);
    setEditForm(toForm(a));
    setEditErrs({});
    setFault("");
  };

  const saveEdit = async () => {
    const next = validate(editForm);
    setEditErrs(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setFault("");
    try {
      await send("/api/admin/announcements", "PUT", { id: editing.id, ...toPayload(editForm) });
      setEditing(null);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Copies every setting, marks the message so the two are distinguishable
  // in the list, and leaves it switched OFF.
  const duplicate = async (a) => {
    setFault("");
    try {
      await send("/api/admin/announcements", "POST", {
        ...toPayload(toForm(a)),
        message: `${a.message} (copy)`,
        isActive: false,
      });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const toggle = async (a) => {
    setFault("");
    try {
      await send("/api/admin/announcements", "PATCH", { id: a.id, isActive: !a.isActive });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const remove = async (id) => {
    setFault("");
    try {
      await send(`/api/admin/announcements?id=${encodeURIComponent(id)}`, "DELETE");
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  return (
    <>
      <Panel title="New announcement">
        <Fault>{fault}</Fault>
        <form onSubmit={create} noValidate>
          <Fields form={form} set={setForm} errs={errs} idPrefix="a-new" />
          <button type="submit" className="hs-btn hs-btn--primary" style={{ marginTop: "var(--s-5)" }} disabled={busy}>
            {busy && <span className="hs-spin" aria-hidden="true" />}
            <IcPlus className="hs-icon-sm" />
            Publish announcement
          </button>
        </form>
      </Panel>

      <Preview form={form} />

      <Panel
        title="Announcements"
        badge={`${num(live)} live of ${num(items.length)}`}
        action={<Reload onClick={reload} />}
      >
        <Fault>{error}</Fault>
        {loading ? <Rows /> : items.length === 0 ? (
          <Empty icon={IcMegaphone} title="Nothing announced">
            Campaigns you publish here appear on every page — and, since this phase,
            inside the studio too.
          </Empty>
        ) : (
          <Table
            caption="Site announcements"
            head={[
              "Message", "Placement", "Who", "Window",
              { key: "Seen", num: true }, { key: "Clicks", num: true }, { key: "Closed", num: true },
              "Live", {},
            ]}
          >
            {items.map((a) => (
              <tr key={a.id}>
                <td style={{ color: "var(--tx)" }}>
                  {a.message}
                  <div className="hs-mono hs-mute" style={{ fontSize: "var(--t-micro)" }}>
                    {a.style}
                    {a.priority ? ` · priority ${a.priority}` : ""}
                    {a.ctaUrl ? ` · ${a.ctaUrl}` : a.link ? ` · ${a.link}` : ""}
                  </div>
                </td>
                <td><span className="hs-badge">{a.placement || "banner"}</span></td>
                <td className="hs-mono" style={{ fontSize: "var(--t-micro)" }}>
                  {a.audience || "all"}
                  {a.planTargets?.length ? ` · ${a.planTargets.join(", ")}` : ""}
                </td>
                <td className="hs-mono">{day(a.startDate)} → {a.endDate ? day(a.endDate) : "open"}</td>
                <td className="hs-num">{num(a.impressions)}</td>
                <td className="hs-num">{num(a.clicks)}</td>
                <td className="hs-num">{num(a.dismissals)}</td>
                <td>
                  <button
                    type="button"
                    className="hs-switch"
                    role="switch"
                    aria-checked={a.isActive}
                    aria-label={`${a.message} — ${a.isActive ? "live" : "hidden"}`}
                    onClick={() => toggle(a)}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  <div className="hs-row" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" aria-label={`Edit ${a.message}`} onClick={() => openEditor(a)}>
                      Edit
                    </button>
                    <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" aria-label={`Duplicate ${a.message}`} onClick={() => duplicate(a)}>
                      Duplicate
                    </button>
                    <button type="button" className="hs-btn hs-btn--danger hs-btn--sm" aria-label={`Delete ${a.message}`} onClick={() => setPendingDelete(a)}>
                      <IcTrash className="hs-icon-sm" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit announcement"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={saveEdit} disabled={saving}>
              {saving && <span className="hs-spin" aria-hidden="true" />}
              Save changes
            </button>
          </>
        }
      >
        <Fault>{fault}</Fault>
        <Fields form={editForm} set={setEditForm} errs={editErrs} idPrefix="a-edit" />
      </Modal>

      <Confirm
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => remove(pendingDelete.id)}
        title="Delete this announcement?"
        body={
          pendingDelete
            ? `"${pendingDelete.message}" is removed for good, along with everything recorded about how it performed. To take it off the site without losing any of that, switch it off instead.`
            : ""
        }
        confirmLabel="Delete"
      />
    </>
  );
}
