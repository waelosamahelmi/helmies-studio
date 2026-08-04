"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — SHARED PARTS + THE SMALL PANELS
   ──────────────────────────────────────────────────────────────────────────
   Everything in here talks to a route that exists under /api/admin. Where a
   route only supports part of a CRUD cycle, the UI says so rather than
   offering a button that returns 405.

   This module imports nothing from its siblings, so AdminShell and the
   larger editors can import from it without a cycle.
   ══════════════════════════════════════════════════════════════════════════ */

import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useState } from "react";
import { Confirm, Modal } from "@/components/studio/kit/Sheet";
import {
  IcBolt, IcClock, IcHistory, IcInfo, IcPersona,
  IcPlus, IcRefresh, IcSearch, IcShield,
} from "@/components/studio/kit/Icons";
import { apiFetch } from "@/lib/client-fetch";

/* ── Readouts ──────────────────────────────────────────────────────────── */
const NF = new Intl.NumberFormat("en-US");
export const num = (v) => NF.format(Number(v) || 0);
export const eur = (v) => `€${(Number(v) || 0).toFixed(2)}`;
export const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const stamp = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

export const asArray = (d) => (Array.isArray(d) ? d : []);

/* ── Transport ─────────────────────────────────────────────────────────── */
export function useResource(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(path);
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

/* retries: 0 — an admin write must never be replayed behind the operator's back. */
export async function send(path, method, body) {
  const res = await apiFetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    retries: 0,
  });
  return res.json().catch(() => ({}));
}

/* ── Chrome ────────────────────────────────────────────────────────────── */
export function Panel({ id, title, badge, action, children }) {
  const key = id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section className="pg-panel" aria-labelledby={`p-${key}`}>
      <div className="pg-panel__head">
        <h2 id={`p-${key}`}>{title}</h2>
        <div className="hs-row">
          {badge && <span className="hs-badge">{badge}</span>}
          {action}
        </div>
      </div>
      <div className="pg-panel__body">{children}</div>
    </section>
  );
}

export function Fault({ children }) {
  if (!children) return null;
  return <p className="hs-notice hs-notice--fault" role="alert">{children}</p>;
}

export function Note({ children }) {
  return <p className="hs-notice">{children}</p>;
}

export function Rows({ n = 4, h = 34 }) {
  return (
    <div className="hs-stack" aria-busy="true" style={{ gap: "var(--s-2)" }}>
      <span className="hs-sr">Loading</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="hs-skel" style={{ height: h }} />
      ))}
    </div>
  );
}

export function Empty({ icon: Icon = IcInfo, title, children, action }) {
  return (
    <div className="hs-empty">
      <span className="hs-empty__mark"><Icon /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Stats({ items }) {
  return (
    <dl className="pg-stats">
      {items.map((s) => (
        <div className="pg-stat" key={s.label}>
          <dt>{s.label}</dt>
          <dd style={s.tone ? { color: s.tone } : undefined}>{s.value}</dd>
          {s.sub && <div className="pg-stat__delta">{s.sub}</div>}
        </div>
      ))}
    </dl>
  );
}

/* head: array of strings, or { key, num } for right-aligned mono columns */
export function Table({ caption, head, children }) {
  /* EDITSv1 E7.5: below 640px system.css turns every row into a card and
     hides the header row, because `.hs-table { min-width: 560px }` otherwise
     traps each admin table behind its own sideways scroller at 393px. A
     stacked cell has to carry its own label, so each <td> is stamped with
     `data-label` from the SAME `head` array the header row above is built
     from — one source of truth, and no panel has to remember to repeat its
     column names. A cell with no heading (the actions column, whose head
     entry is `{}`) is left unlabelled and renders full width. */
  const labels = head.map((h) => (typeof h === "string" ? h : h?.key) || "");

  const rows = Children.map(children, (row) => {
    if (!isValidElement(row) || row.type !== "tr") return row;
    const cells = Children.map(row.props.children, (cell, i) => {
      if (!isValidElement(cell) || cell.type !== "td") return cell;
      if (!labels[i] || cell.props.colSpan) return cell;
      return cloneElement(cell, { "data-label": labels[i] });
    });
    return cloneElement(row, undefined, cells);
  });

  return (
    <div className="hs-table-wrap">
      <table className="hs-table">
        <caption className="hs-sr">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => {
              const label = typeof h === "string" ? h : h.key;
              return (
                <th key={label || `c${i}`} scope="col" className={h.num ? "hs-num" : undefined}>
                  {label || <span className="hs-sr">Actions</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function Reload({ onClick }) {
  return (
    <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={onClick}>
      <IcRefresh className="hs-icon-sm" />
      Refresh
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   USERS — /api/admin/users  (GET, PATCH { userId, credits, role })
   ══════════════════════════════════════════════════════════════════════════ */
export function UsersPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/users");
  const users = asArray(data);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [credits, setCredits] = useState("");
  const [originalCredits, setOriginalCredits] = useState(0);
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [fault, setFault] = useState("");
  const [confirmPromote, setConfirmPromote] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => (u.email || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q),
    );
  }, [users, query]);

  const open = (u) => {
    const current = Math.round(Number(u.credits) || 0);
    setEditing(u);
    setCredits(String(current));
    setOriginalCredits(current);
    setRole(u.role || "user");
    setFault("");
  };

  const save = async () => {
    const value = Number(credits);
    if (!Number.isFinite(value) || value < 0) {
      setFault("Credits must be zero or a positive whole number.");
      setConfirmPromote(false);
      return;
    }
    const rounded = Math.round(value);
    setSaving(true);
    setFault("");
    try {
      const body = { userId: editing.id, role };
      // Only send `credits` when the admin actually edited the field — the
      // server books any included value as an absolute wallet target
      // (adjustWalletTo), so a role-only edit must never smuggle in a
      // dialog-population value it never touched.
      if (rounded !== originalCredits) body.credits = rounded;
      await send("/api/admin/users", "PATCH", body);
      setEditing(null);
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setSaving(false);
      setConfirmPromote(false);
    }
  };

  const attemptSave = () => {
    if (role === "admin" && editing?.role !== "admin") setConfirmPromote(true);
    else save();
  };

  return (
    <>
      <Panel title="Users" badge={`${num(users.length)} total`} action={<Reload onClick={reload} />}>
        <Fault>{error}</Fault>

        <div className="hs-field">
          <label className="hs-label" htmlFor="u-search">Find a user</label>
          <div style={{ position: "relative" }}>
            <IcSearch
              className="hs-icon-sm"
              style={{ position: "absolute", left: "var(--s-3)", top: "50%", transform: "translateY(-50%)", color: "var(--tx-mute)", pointerEvents: "none" }}
            />
            <input
              id="u-search"
              className="hs-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Email or name"
              autoComplete="off"
              style={{ paddingLeft: "var(--s-8)" }}
            />
          </div>
        </div>

        {loading ? <Rows /> : shown.length === 0 ? (
          <Empty icon={IcPersona} title={query ? "No user matches that" : "No users yet"}>
            {query ? "Try part of the email address." : "The first person to sign up becomes the admin."}
          </Empty>
        ) : (
          <Table
            caption="Registered users"
            head={["User", "Email", { key: "Credits", num: true }, "Role", { key: "Gens", num: true }, "Joined", {}]}
          >
            {shown.map((u) => (
              <tr key={u.id}>
                <td style={{ color: "var(--tx)", fontWeight: 500 }}>{u.name || "—"}</td>
                <td className="hs-mono">{u.email}</td>
                <td className="hs-num">{num(u.credits)}</td>
                <td>
                  <span className={`hs-badge ${u.role === "admin" ? "hs-badge--accent" : ""}`}>{u.role}</span>
                </td>
                <td className="hs-num">{num(u._count?.generations)}</td>
                <td className="hs-mono">{day(u.createdAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="hs-btn hs-btn--sm" onClick={() => open(u)}>Edit</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.email}` : ""}
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="hs-btn hs-btn--primary" onClick={attemptSave} disabled={saving}>
              {saving && <span className="hs-spin" aria-hidden="true" />}
              Save changes
            </button>
          </>
        }
      >
        <Fault>{fault}</Fault>

        <div className="hs-field">
          <label className="hs-label" htmlFor="u-credits">Credit balance</label>
          <input
            id="u-credits"
            className="hs-input"
            type="number"
            min="0"
            step="1"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            autoComplete="off"
          />
          <p className="hs-hint">
            Sets the balance outright. To add credits and leave a paper trail, issue a refund instead.
          </p>
        </div>

        <div className="hs-field">
          <label className="hs-label" htmlFor="u-role">Role</label>
          <select id="u-role" className="hs-select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </Modal>

      <Confirm
        open={confirmPromote}
        onClose={() => setConfirmPromote(false)}
        onConfirm={save}
        title="Grant admin access?"
        body={`${editing?.email || "This user"} will be able to edit pricing, read the audit log, change any balance and issue refunds.`}
        confirmLabel="Make admin"
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   JOBS — /api/admin/jobs  (GET → { jobs, stats })
   ══════════════════════════════════════════════════════════════════════════ */
const JOB_TONE = { completed: "hs-badge--signal", failed: "hs-badge--fault", processing: "hs-badge--accent" };

export function JobsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/jobs");
  const jobs = asArray(data?.jobs);
  const s = data?.stats || {};

  return (
    <Panel title="Jobs" badge={`${num(jobs.length)} in flight`} action={<Reload onClick={reload} />}>
      <Fault>{error}</Fault>

      {loading ? <Rows n={3} h={72} /> : (
        <>
          <Stats
            items={[
              { label: "In queue",  value: num(s.pending) },
              { label: "Running",   value: num(s.processing) },
              { label: "Completed", value: num(s.completed), tone: "var(--signal)" },
              { label: "Failed",    value: num(s.failed), tone: s.failed ? "var(--fault)" : undefined },
              { label: "All time",  value: num(s.total) },
            ]}
          />

          {jobs.length === 0 ? (
            <Empty icon={IcClock} title="Nothing running">
              Pending and processing generations appear here the moment they are queued.
            </Empty>
          ) : (
            <Table
              caption="Pending and processing generations"
              head={["Job", "Tool", "Model", "User", "Status", { key: "Credits", num: true }, "Started"]}
            >
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="hs-mono">{String(j.id).slice(0, 10)}</td>
                  <td style={{ color: "var(--tx)" }}>{j.tool}</td>
                  <td className="hs-mono">{j.model}</td>
                  <td className="hs-mono">{j.user?.email || "—"}</td>
                  <td><span className={`hs-badge ${JOB_TONE[j.status] || ""}`}>{j.status}</span></td>
                  <td className="hs-num">{num(j.creditsUsed)}</td>
                  <td className="hs-mono">{stamp(j.createdAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   REFUNDS — /api/admin/refunds  (GET, POST { userId, amount, reason })
   Issuing one grants real credits, so it goes through Confirm.
   ══════════════════════════════════════════════════════════════════════════ */
export function RefundsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/refunds");
  const refunds = asArray(data);

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [reason, setReason] = useState("");
  const [errs, setErrs] = useState({});
  const [fault, setFault] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const ask = (e) => {
    e.preventDefault();
    const next = {};
    if (!userId.trim()) next.userId = "Paste the user id from the Users section.";
    const value = Number(amount);
    if (!amount.trim()) next.amount = "How many credits?";
    else if (!Number.isFinite(value) || value <= 0) next.amount = "Must be a positive number of credits.";
    setErrs(next);
    setFault("");
    if (Object.keys(next).length === 0) setConfirming(true);
  };

  const issue = async () => {
    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/refunds", "POST", {
        userId: userId.trim(),
        amount: Math.round(Number(amount)),
        generationId: generationId.trim() || null,
        reason: reason.trim() || null,
      });
      setUserId(""); setAmount(""); setGenerationId(""); setReason("");
      reload();
    } catch (e) {
      setFault(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel title="Issue a refund">
        <Fault>{fault}</Fault>

        <form onSubmit={ask} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="r-user">User id</label>
            <input
              id="r-user"
              className="hs-input hs-mono"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setErrs((p) => ({ ...p, userId: "" })); }}
              autoComplete="off"
              placeholder="cl…"
              aria-invalid={errs.userId ? "true" : undefined}
              aria-describedby={errs.userId ? "r-user-error" : undefined}
            />
            {errs.userId && <p className="hs-error" id="r-user-error">{errs.userId}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="r-amount">Credits to return</label>
            <input
              id="r-amount"
              className="hs-input"
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setErrs((p) => ({ ...p, amount: "" })); }}
              aria-invalid={errs.amount ? "true" : undefined}
              aria-describedby={errs.amount ? "r-amount-error" : undefined}
            />
            {errs.amount && <p className="hs-error" id="r-amount-error">{errs.amount}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="r-gen">Generation id <span className="hs-mute">(optional)</span></label>
            <input
              id="r-gen"
              className="hs-input hs-mono"
              value={generationId}
              onChange={(e) => setGenerationId(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="r-reason">Reason</label>
            <input
              id="r-reason"
              className="hs-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoComplete="off"
              placeholder="Provider returned a broken file"
            />
            <p className="hs-hint">Written to the wallet ledger and the audit log.</p>
          </div>

          <button type="submit" className="hs-btn hs-btn--primary" style={{ marginTop: "var(--s-5)" }} disabled={busy}>
            {busy && <span className="hs-spin" aria-hidden="true" />}
            Review refund
          </button>
        </form>
      </Panel>

      <Panel title="Refund history" badge={`${num(refunds.length)} records`} action={<Reload onClick={reload} />}>
        <Fault>{error}</Fault>
        {loading ? <Rows /> : refunds.length === 0 ? (
          <Empty icon={IcHistory} title="No refunds issued">
            Every refund you grant is recorded here with who, how much and why.
          </Empty>
        ) : (
          <Table caption="Refunds" head={["Issued", "User", { key: "Credits", num: true }, "Reason", "Status"]}>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td className="hs-mono">{stamp(r.createdAt)}</td>
                <td className="hs-mono">{r.userId}</td>
                <td className="hs-num" style={{ color: "var(--signal)" }}>+{num(r.amount)}</td>
                <td>{r.reason || "—"}</td>
                <td>
                  <span className={`hs-badge ${r.status === "completed" ? "hs-badge--signal" : "hs-badge--caution"}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Confirm
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={issue}
        title="Issue this refund?"
        body={`${num(amount)} credits land in ${userId.trim()} immediately and cannot be taken back from this screen.`}
        confirmLabel="Issue refund"
        danger={false}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PROVIDER HEALTH — /api/admin/provider-health
   Returns { healthy, activeIncidents, providerCount } — not a per-provider
   list, which is what the previous screen tried to render.
   ══════════════════════════════════════════════════════════════════════════ */
export function ProviderHealthPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/provider-health");
  const incidents = asArray(data?.activeIncidents);
  const healthy = data?.healthy;

  return (
    <Panel title="Provider health" action={<Reload onClick={reload} />}>
      <Fault>{error}</Fault>

      {loading ? <Rows n={2} h={72} /> : (
        <>
          <div className="hs-row" style={{ gap: "var(--s-3)" }}>
            <span className={`hs-dot ${healthy ? "hs-dot--signal" : "hs-dot--fault"}`} />
            <strong style={{ fontSize: "var(--t-md)" }}>
              {healthy
                ? "All providers nominal"
                : `${num(incidents.length)} open incident${incidents.length === 1 ? "" : "s"}`}
            </strong>
          </div>

          <Stats
            items={[
              { label: "Providers priced", value: num(data?.providerCount) },
              {
                label: "Open incidents",
                value: num(incidents.length),
                tone: incidents.length ? "var(--fault)" : "var(--signal)",
              },
            ]}
          />

          {incidents.length === 0 ? (
            <Empty icon={IcShield} title="Nothing is on fire">
              Incidents opened by the generation pipeline show up here with the provider and the reason.
            </Empty>
          ) : (
            <Table caption="Open provider incidents" head={["Provider", "Type", "Message", "Started"]}>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td style={{ color: "var(--tx)", fontWeight: 500 }}>{i.provider}</td>
                  <td><span className="hs-badge hs-badge--fault">{i.type}</span></td>
                  <td>{i.message || "—"}</td>
                  <td className="hs-mono">{stamp(i.startedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   AUDIT LOG — /api/admin/audit  (GET, newest 200)
   ══════════════════════════════════════════════════════════════════════════ */
export function AuditPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/audit");
  const logs = asArray(data);
  const [action, setAction] = useState("all");

  const actions = useMemo(
    () => ["all", ...Array.from(new Set(logs.map((l) => l.action))).sort()],
    [logs],
  );
  const shown = action === "all" ? logs : logs.filter((l) => l.action === action);

  return (
    <Panel title="Audit log" badge={`${num(logs.length)} newest`} action={<Reload onClick={reload} />}>
      <Fault>{error}</Fault>

      {loading ? <Rows /> : logs.length === 0 ? (
        <Empty icon={IcHistory} title="Nothing logged yet">
          Pricing changes, flag toggles, refunds and user edits are written here as they happen.
        </Empty>
      ) : (
        <>
          <div className="hs-chips" role="group" aria-label="Filter by action">
            {actions.map((a) => (
              <button key={a} type="button" className="hs-chip" aria-pressed={action === a} onClick={() => setAction(a)}>
                {a}
              </button>
            ))}
          </div>

          <Table caption="Admin audit log" head={["Time", "Who", "Action", "Resource", "Detail"]}>
            {shown.map((l) => (
              <tr key={l.id}>
                <td className="hs-mono">{stamp(l.createdAt)}</td>
                <td className="hs-mono">{l.user?.email || "system"}</td>
                <td><span className="hs-badge">{l.action}</span></td>
                <td className="hs-mono">{l.resource ? `${l.resource}${l.resourceId ? `/${l.resourceId}` : ""}` : "—"}</td>
                <td
                  className="hs-mono"
                  style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {l.metadata ? JSON.stringify(l.metadata) : "—"}
                </td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FEATURE FLAGS — /api/admin/flags  (GET, POST upsert)
   ══════════════════════════════════════════════════════════════════════════ */
export function FlagsPanel() {
  const { data, loading, error, reload } = useResource("/api/admin/flags");
  const flags = asArray(data);

  const [fault, setFault] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "" });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  const toggle = async (f) => {
    setFault("");
    try {
      await send("/api/admin/flags", "POST", {
        key: f.key, name: f.name, description: f.description,
        enabled: !f.enabled, config: f.config,
      });
      reload();
    } catch (e) {
      setFault(e.message);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const next = {};
    if (!/^[a-z0-9_]+$/.test(form.key)) next.key = "Lowercase letters, numbers and underscores only.";
    if (!form.name.trim()) next.name = "Give it a name people will recognise.";
    setErrs(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    setFault("");
    try {
      await send("/api/admin/flags", "POST", { ...form, enabled: false });
      setForm({ key: "", name: "", description: "" });
      setCreating(false);
      reload();
    } catch (err) {
      setFault(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel
        title="Feature flags"
        badge={`${num(flags.filter((f) => f.enabled).length)} on`}
        action={
          <>
            <button type="button" className="hs-btn hs-btn--sm" onClick={() => setCreating(true)}>
              <IcPlus className="hs-icon-sm" />
              New flag
            </button>
            <Reload onClick={reload} />
          </>
        }
      >
        <Fault>{fault}</Fault>
        <Fault>{error}</Fault>

        {loading ? <Rows /> : flags.length === 0 ? (
          <Empty
            icon={IcBolt}
            title="No flags yet"
            action={
              <button type="button" className="hs-btn hs-btn--primary" onClick={() => setCreating(true)}>
                Create the first flag
              </button>
            }
          >
            Flags let you ship a feature dark and switch it on without a deploy.
          </Empty>
        ) : (
          <div>
            {flags.map((f) => (
              <div className="pg-kv" key={f.id}>
                <div>
                  <div className="pg-kv__k">
                    {f.name} <span className="hs-mono hs-mute">{f.key}</span>
                  </div>
                  {f.description && <div className="pg-kv__sub">{f.description}</div>}
                </div>
                <button
                  type="button"
                  className="hs-switch"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`${f.name} — ${f.enabled ? "on" : "off"}`}
                  onClick={() => toggle(f)}
                />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New feature flag"
        footer={
          <>
            <button type="button" className="hs-btn hs-btn--ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" form="flag-form" className="hs-btn hs-btn--primary" disabled={busy}>
              {busy && <span className="hs-spin" aria-hidden="true" />}
              Create flag
            </button>
          </>
        }
      >
        <form id="flag-form" onSubmit={create} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="f-key">Key</label>
            <input
              id="f-key"
              className="hs-input hs-mono"
              value={form.key}
              onChange={(e) => {
                setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") });
                setErrs((p) => ({ ...p, key: "" }));
              }}
              placeholder="enable_workflows"
              autoComplete="off"
              aria-invalid={errs.key ? "true" : undefined}
              aria-describedby={errs.key ? "f-key-error" : undefined}
            />
            {errs.key && <p className="hs-error" id="f-key-error">{errs.key}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="f-name">Name</label>
            <input
              id="f-name"
              className="hs-input"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrs((p) => ({ ...p, name: "" })); }}
              autoComplete="off"
              aria-invalid={errs.name ? "true" : undefined}
              aria-describedby={errs.name ? "f-name-error" : undefined}
            />
            {errs.name && <p className="hs-error" id="f-name-error">{errs.name}</p>}
          </div>

          <div className="hs-field">
            <label className="hs-label" htmlFor="f-desc">Description</label>
            <input
              id="f-desc"
              className="hs-input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              autoComplete="off"
            />
            <p className="hs-hint">New flags start switched off.</p>
          </div>
        </form>
      </Modal>
    </>
  );
}

/* EDITSv1 E8.3: AnnouncementsPanel moved to its own file — it had outgrown
   the "small panels" this module is for once it gained edit, duplicate,
   targeting, metrics and a preview.

   The `PANELS` map that used to sit here went with it. Nothing imported it
   (AdminShell has always used its own SECTIONS list and a switch), and
   keeping it would have meant importing a sibling into this module, which
   is precisely what the header above promises not to do. */
