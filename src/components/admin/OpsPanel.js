"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — OPERATOR CONTROLS  (Phase 7 Task 4)
   ──────────────────────────────────────────────────────────────────────────
   GET/POST /api/admin/ops (src/lib/ops-flags.js): maintenance mode and the
   per-provider kill switch. Turning maintenance ON and disabling a provider
   are both the DESTRUCTIVE direction — each requires typing an exact phrase
   before the confirm button enables, plus a reason that lands in the
   AuditLog row the setter writes. The reverse direction (turning
   maintenance OFF, re-enabling a provider) applies immediately — restoring
   service is never the action that needs a confirmation gate.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { Modal } from "@/components/studio/kit/Sheet";
import LoadingSkeleton from "@/components/states/LoadingSkeleton";
import ErrorState from "@/components/states/ErrorState";
import { Panel, Reload, Fault, useResource, send } from "./AdminPanel";

const PROVIDER_LABELS = { kie: "KIE", alibaba: "Alibaba" };
const providerLabel = (name) => PROVIDER_LABELS[name] || name;

/* A typed-confirmation dialog for the destructive direction of a toggle:
   the confirm button stays disabled until the operator types the exact
   match phrase AND fills in a reason — both required, mirroring how the
   Users panel's promote-to-admin Confirm (AdminPanel.js) already gates a
   privileged action, but adding the typed-match step because this action
   affects every visitor/every generation, not one account. */
function TypedConfirm({ open, onClose, onConfirm, title, body, matchPhrase, confirmLabel, busy }) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const ready = typed.trim() === matchPhrase && reason.trim().length > 0;

  const close = () => {
    if (busy) return;
    onClose();
    setTyped("");
    setReason("");
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      dismissable={!busy}
      footer={
        <>
          <button type="button" className="hs-btn hs-btn--ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="hs-btn hs-btn--danger"
            onClick={() => ready && onConfirm(reason.trim())}
            disabled={!ready || busy}
          >
            {busy && <span className="hs-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ fontSize: "var(--t-sm)", color: "var(--tx-dim)", lineHeight: 1.6 }}>{body}</p>

      <div className="hs-field">
        <label className="hs-label" htmlFor="ops-confirm-reason">Reason</label>
        <input
          id="ops-confirm-reason"
          className="hs-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoComplete="off"
          placeholder="Why — this is written to the audit log"
        />
      </div>

      <div className="hs-field">
        <label className="hs-label" htmlFor="ops-confirm-type">
          Type <span className="hs-mono">{matchPhrase}</span> to confirm
        </label>
        <input
          id="ops-confirm-type"
          className="hs-input hs-mono"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </Modal>
  );
}

export default function OpsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/ops");
  const [fault, setFault] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  const [confirmProvider, setConfirmProvider] = useState(null); // the provider row being disabled, or null

  if (loading && !data) {
    return (
      <Panel title="Maintenance mode" action={<Reload onClick={reload} />}>
        <LoadingSkeleton variant="panel" label="Loading operator controls" />
      </Panel>
    );
  }

  if (error && !data) {
    return (
      <Panel title="Maintenance mode" action={<Reload onClick={reload} />}>
        <ErrorState message={error} onRetry={reload} />
      </Panel>
    );
  }

  const maintenance = !!data?.maintenance;
  const providers = Array.isArray(data?.providers) ? data.providers : [];

  const applyMaintenance = async (enabled, reason) => {
    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/ops", "POST", { action: "maintenance", enabled, reason });
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setBusy(false);
      setConfirmMaintenance(false);
    }
  };

  const toggleMaintenance = () => {
    if (maintenance) {
      // Restoring service applies immediately — no confirmation gate on
      // the non-destructive direction.
      applyMaintenance(false, "Maintenance window ended");
    } else {
      setConfirmMaintenance(true);
    }
  };

  const applyProvider = async (name, disabled, reason) => {
    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/ops", "POST", { action: "provider", name, disabled, reason });
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setBusy(false);
      setConfirmProvider(null);
    }
  };

  const toggleProvider = (p) => {
    if (p.disabled) {
      applyProvider(p.name, false, "Provider re-enabled");
    } else {
      setConfirmProvider(p);
    }
  };

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{fault}</Fault>
      <Fault>{error}</Fault>

      <Panel title="Maintenance mode" badge={maintenance ? "ON" : "OFF"} action={<Reload onClick={reload} />}>
        <p className="hs-hint">
          When on, /studio and every state-changing API call return 503. Health checks, admin routes,
          cron, and provider/Stripe webhooks always stay reachable — a maintenance window never
          strands a callback or a payment.
        </p>
        <div className="pg-kv">
          <div>
            <div className="pg-kv__k">Maintenance mode</div>
            <div className="pg-kv__sub">{maintenance ? "Studio is down for everyone." : "Studio is live."}</div>
          </div>
          <button
            type="button"
            className="hs-switch"
            role="switch"
            aria-checked={maintenance}
            aria-label={`Maintenance mode — ${maintenance ? "on" : "off"}`}
            onClick={toggleMaintenance}
            disabled={busy}
          />
        </div>
      </Panel>

      <Panel title="Provider kill switch">
        <p className="hs-hint">
          Disabling a provider removes it from every model&apos;s fallback chain immediately. If every
          provider for a model ends up disabled, that model&apos;s generations fail fast with a clear
          message instead of hanging.
        </p>
        {providers.map((p) => (
          <div className="pg-kv" key={p.name}>
            <div>
              <div className="pg-kv__k">{providerLabel(p.name)}</div>
              <div className="pg-kv__sub">{p.disabled ? "Disabled — excluded from generation" : "Active"}</div>
            </div>
            <button
              type="button"
              className="hs-switch"
              role="switch"
              aria-checked={!p.disabled}
              aria-label={`${providerLabel(p.name)} — ${p.disabled ? "disabled" : "active"}`}
              onClick={() => toggleProvider(p)}
              disabled={busy}
            />
          </div>
        ))}
      </Panel>

      <TypedConfirm
        open={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        onConfirm={(reason) => applyMaintenance(true, reason)}
        title="Turn maintenance mode ON?"
        body="Every visitor loses /studio and every state-changing API call returns 503 until you turn this back off. Provider callbacks, Stripe events, and this screen keep working."
        matchPhrase="MAINTENANCE"
        confirmLabel="Turn maintenance ON"
        busy={busy}
      />

      <TypedConfirm
        open={!!confirmProvider}
        onClose={() => setConfirmProvider(null)}
        onConfirm={(reason) => applyProvider(confirmProvider.name, true, reason)}
        title={`Disable ${confirmProvider ? providerLabel(confirmProvider.name) : ""}?`}
        body="This provider is removed from every model's fallback chain immediately. If it was the only provider left for a model, that model's generations will fail fast until you re-enable it."
        matchPhrase={confirmProvider ? providerLabel(confirmProvider.name).toUpperCase() : ""}
        confirmLabel="Disable provider"
        busy={busy}
      />
    </div>
  );
}
