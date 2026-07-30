"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — PROMO CODES
   ──────────────────────────────────────────────────────────────────────────
   /api/admin/promos: GET, POST, PATCH { id, isActive }, DELETE ?id=.
   A percentage code costs margin directly, so the form says what a given
   value does to the take before it is saved.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Confirm, Modal } from "@/components/studio/kit/Sheet";
import {
  Empty, Fault, Panel, Reload, Rows, Table,
  asArray, day, num, send, useResource,
} from "./AdminPanel";
import { IcPlus, IcTrash, IcArchive } from "@/components/studio/kit/Icons";

const TYPES = [
  { id: "percentage", label: "Percentage off", unit: "%" },
  { id: "fixed",      label: "Fixed credits",  unit: "credits" },
  { id: "bonus",      label: "Bonus credits",  unit: "credits" },
];

const ELIGIBILITY = [
  { id: "all",      label: "Everyone" },
  { id: "new",      label: "New accounts only" },
  { id: "existing", label: "Existing accounts only" },
];

const BLANK = {
  code: "", type: "percentage", value: "", eligibility: "all",
  maxUses: "", maxUsesPerUser: "1", startsAt: "", expiresAt: "", description: "",
};

export default function PromoManager() {
  const { data, loading, error, reload } = useResource("/api/admin/promos");
  const promos = asArray(data);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrs((p) => ({ ...p, [key]: "" }));
  };

  const unit = TYPES.find((t) => t.id === form.type)?.unit || "";
  const value = Number(form.value);
  const heavy = form.type === "percentage" && Number.isFinite(value) && value >= 40;

  const create = async (e) => {
    e.preventDefault();
    const next = {};
    if (!/^[A-Z0-9_-]{3,20}$/.test(form.code)) next.code = "3 to 20 characters: A–Z, 0–9, dash or underscore.";
    if (form.value === "" || !Number.isFinite(value) || value <= 0) next.value = "Must be greater than zero.";
    else if (form.type === "percentage" && value > 100) next.value = "A discount cannot exceed 100%.";
    if (form.startsAt && form.expiresAt && form.expiresAt < form.startsAt) {
      next.expiresAt = "The end date falls before the start date.";
    }
    setErrs(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/promos", "POST", {
        code: form.code,
        type: form.type,
        value: form.type === "percentage" ? value : Math.round(value),
        eligibility: form.eligibility,
        maxUses: form.maxUses ? Math.round(Number(form.maxUses)) : null,
        maxUsesPerUser: form.maxUsesPerUser ? Math.round(Number(form.maxUsesPerUser)) : 1,
        startsAt: form.startsAt || null,
        expiresAt: form.expiresAt || null,
        description: form.description.trim() || null,
      });
      setForm(BLANK);
      setCreating(false);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p) => {
    setFault("");
    try {
      await send("/api/admin/promos", "PATCH", { id: p.id, isActive: !p.isActive });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const remove = async (id) => {
    setFault("");
    try {
      await send(`/api/admin/promos?id=${encodeURIComponent(id)}`, "DELETE");
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  return (
    <>
      <Panel
        title="Promo codes"
        badge={`${num(promos.filter((p) => p.isActive).length)} live`}
        action={
          <>
            <button type="button" className="hs-btn hs-btn--sm" onClick={() => setCreating(true)}>
              <IcPlus className="hs-icon-sm" />
              New code
            </button>
            <Reload onClick={reload} />
          </>
        }
      >
        <Fault>{fault}</Fault>
        <Fault>{error}</Fault>

        {loading ? <Rows /> : promos.length === 0 ? (
          <Empty
            icon={IcArchive}
            title="No codes yet"
            action={
              <button type="button" className="hs-btn hs-btn--primary" onClick={() => setCreating(true)}>
                Create the first code
              </button>
            }
          >
            A code is the cheapest way to test whether a price is the thing holding people back.
          </Empty>
        ) : (
          <Table
            caption="Promo codes"
            head={["Code", "Type", { key: "Value", num: true }, "Who", { key: "Used", num: true }, "Window", "Live", {}]}
          >
            {promos.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="hs-mono" style={{ color: "var(--tx)", fontWeight: 600, letterSpacing: "0.04em" }}>
                    {p.code}
                  </div>
                  {p.description && <div className="hs-mute" style={{ fontSize: "var(--t-micro)" }}>{p.description}</div>}
                </td>
                <td><span className="hs-badge">{p.type}</span></td>
                <td className="hs-num">{p.type === "percentage" ? `${num(p.value)}%` : num(p.value)}</td>
                <td>{p.eligibility}</td>
                <td className="hs-num">{num(p.currentUses)}{p.maxUses ? ` / ${num(p.maxUses)}` : ""}</td>
                <td className="hs-mono">
                  {p.startsAt ? day(p.startsAt) : "now"} → {p.expiresAt ? day(p.expiresAt) : "open"}
                </td>
                <td>
                  <button
                    type="button"
                    className="hs-switch"
                    role="switch"
                    aria-checked={p.isActive}
                    aria-label={`${p.code} — ${p.isActive ? "live" : "paused"}`}
                    onClick={() => toggle(p)}
                  />
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="hs-btn hs-btn--danger hs-btn--sm"
                    onClick={() => setPendingDelete(p)}
                    aria-label={`Delete ${p.code}`}
                  >
                    <IcTrash className="hs-icon-sm" />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New promo code"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" form="promo-form" className="hs-btn hs-btn--primary" disabled={busy}>
              {busy && <span className="hs-spin" aria-hidden="true" />}
              Create code
            </button>
          </>
        }
      >
        <form id="promo-form" onSubmit={create} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="p-code">Code</label>
            <input
              id="p-code"
              className="hs-input hs-mono"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
              maxLength={20}
              autoComplete="off"
              placeholder="LAUNCH50"
              aria-invalid={errs.code ? "true" : undefined}
              aria-describedby={errs.code ? "p-code-error" : undefined}
            />
            {errs.code && <p className="hs-error" id="p-code-error">{errs.code}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-type">Type</label>
            <select id="p-type" className="hs-select" value={form.type} onChange={(e) => set("type", e.target.value)}>
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-value">Value in {unit}</label>
            <input
              id="p-value"
              className="hs-input"
              type="number"
              min="1"
              step={form.type === "percentage" ? "1" : "1"}
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              aria-invalid={errs.value ? "true" : undefined}
              aria-describedby={errs.value ? "p-value-error" : "p-value-hint"}
            />
            {errs.value
              ? <p className="hs-error" id="p-value-error">{errs.value}</p>
              : <p className="hs-hint" id="p-value-hint">
                  {form.type === "percentage"
                    ? "Comes straight off the take on every redemption."
                    : "Credits handed out on redemption. 100 credits is about €1 of retail value."}
                </p>}
          </div>

          {heavy && (
            <p className="hs-notice hs-notice--caution">
              At <span className="hs-mono">{num(value)}%</span> off, most generations run at or below
              provider cost. Cap the total uses if this is not deliberate.
            </p>
          )}

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-elig">Eligibility</label>
            <select id="p-elig" className="hs-select" value={form.eligibility} onChange={(e) => set("eligibility", e.target.value)}>
              {ELIGIBILITY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-max">Total redemptions</label>
            <input
              id="p-max"
              className="hs-input"
              type="number"
              min="1"
              step="1"
              value={form.maxUses}
              onChange={(e) => set("maxUses", e.target.value)}
              placeholder="Unlimited"
            />
            <p className="hs-hint">Leave empty for no cap.</p>
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-per">Redemptions per account</label>
            <input
              id="p-per"
              className="hs-input"
              type="number"
              min="1"
              step="1"
              value={form.maxUsesPerUser}
              onChange={(e) => set("maxUsesPerUser", e.target.value)}
            />
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-start">Starts</label>
            <input id="p-start" className="hs-input" type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-end">Expires</label>
            <input
              id="p-end"
              className="hs-input"
              type="date"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              aria-invalid={errs.expiresAt ? "true" : undefined}
              aria-describedby={errs.expiresAt ? "p-end-error" : undefined}
            />
            {errs.expiresAt && <p className="hs-error" id="p-end-error">{errs.expiresAt}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="p-desc">Internal note</label>
            <input
              id="p-desc"
              className="hs-input"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              autoComplete="off"
              placeholder="Launch week, newsletter"
            />
          </div>
        </form>
      </Modal>

      <Confirm
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => remove(pendingDelete.id)}
        title="Delete this code?"
        body={
          pendingDelete
            ? `${pendingDelete.code} is gone for good and anyone typing it gets an error. To stop new redemptions but keep the record, switch it off instead.`
            : ""
        }
        confirmLabel="Delete code"
      />
    </>
  );
}
