"use client";

/* ══════════════════════════════════════════════════════════════════════════
   SETTINGS — /settings?tab=…
   ──────────────────────────────────────────────────────────────────────────
   The tab lives in the query string because the studio shell, the command
   palette and the phone profile all deep-link straight to a panel
   (/settings?tab=billing). Tabs are links, not buttons, so those URLs are
   real, shareable and back-button friendly.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Confirm } from "@/components/studio/kit/Sheet";
import {
  IcPersona, IcBolt, IcLock, IcSettings, IcCopy, IcTrash, IcPlus,
  IcExternal, IcCheck, IcRefresh,
} from "@/components/studio/kit/Icons";
import { apiFetch } from "@/lib/client-fetch";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { PLAN_NAMES, SUBSCRIPTION_CREDITS } from "@/lib/plan-constants";
import EmptyState from "@/components/states/EmptyState";
import LoadingSkeleton from "@/components/states/LoadingSkeleton";
import ThemeToggle from "@/components/ThemeToggle";

/* ── Formatting — every numeral is mono, so keep the strings predictable ── */
const NF = new Intl.NumberFormat("en-US");
const num = (n) => NF.format(Number(n) || 0);
const day = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const TABS = [
  { id: "account",  label: "Account",             icon: IcPersona },
  { id: "billing",  label: "Billing",             icon: IcBolt },
  { id: "api-keys", label: "API keys",            icon: IcLock },
  { id: "defaults", label: "Generation defaults", icon: IcSettings },
];

/* Older links (/settings?tab=profile, ?tab=notifications) still land somewhere sane */
const ALIASES = {
  profile: "account", security: "account", notifications: "account",
  generation: "defaults", "generation-defaults": "defaults",
  keys: "api-keys", api: "api-keys",
};

/* Prices mirror /pricing. Credit allowances come from plan-constants. */
const PLANS = [
  {
    id: "free", name: PLAN_NAMES.free, monthly: 0, yearly: 0,
    credits: SUBSCRIPTION_CREDITS.free,
    features: ["Every studio unlocked", "All 70+ models", "Standard resolution"],
  },
  {
    id: "starter", name: PLAN_NAMES.starter, monthly: 24, yearly: 19,
    credits: SUBSCRIPTION_CREDITS.starter,
    features: ["HD resolution", "Cancel anytime", "Email support"],
  },
  {
    id: "studio", name: PLAN_NAMES.studio, monthly: 49, yearly: 39,
    credits: SUBSCRIPTION_CREDITS.studio,
    features: ["4K downloads", "Generation archive", "Priority queue"],
  },
  {
    id: "pro", name: PLAN_NAMES.pro, monthly: 99, yearly: 79,
    credits: SUBSCRIPTION_CREDITS.pro,
    features: ["Priority queue", "Batch exports", "API access"],
  },
];

/* Studios that persist a basic/advanced control mode in this browser */
const MODE_KEYS = [
  "audio", "cinema", "clipping", "influencer",
  "lipsync", "marketing", "vibe-motion", "recast",
].map((t) => `helmies.studio.${t}.mode`);

const DEFAULTS_KEY = "helmies.studio.defaults";

/* ══════════════════════════════════════════════════════════════════════════ */

function Fault({ children }) {
  if (!children) return null;
  return (
    <p className="hs-notice hs-notice--fault" role="alert">{children}</p>
  );
}

function Spinner({ label }) {
  return (
    <>
      <span className="hs-spin" aria-hidden="true" />
      <span className="hs-sr">{label}</span>
    </>
  );
}

/* ── Account ───────────────────────────────────────────────────────────── */
function AccountPanel({ session, status, plan }) {
  const user = session?.user;

  return (
    <section className="pg-panel" aria-labelledby="h-account">
      <div className="pg-panel__head">
        <h2 id="h-account">Account</h2>
        <button type="button" className="hs-btn hs-btn--sm" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </button>
      </div>

      <div className="pg-panel__body">
        {status === "loading" ? (
          <LoadingSkeleton variant="list" count={3} label="Loading account" />
        ) : !user ? (
          <EmptyState
            icon={<IcPersona />}
            title="You are signed out"
            description="Sign in to see your account, balance and keys."
            action={{ label: "Sign in", href: "/login" }}
          />
        ) : (
          <>
            <div>
              <div className="pg-kv">
                <div>
                  <div className="pg-kv__k">Name</div>
                  <div className="pg-kv__sub">Comes from the account you signed in with.</div>
                </div>
                <div className="pg-kv__v">{user.name || "Not set"}</div>
              </div>

              <div className="pg-kv">
                <div>
                  <div className="pg-kv__k">Email</div>
                  <div className="pg-kv__sub">Used for receipts and account notices.</div>
                </div>
                <div className="pg-kv__v">{user.email}</div>
              </div>

              <div className="pg-kv">
                <div className="pg-kv__k">Plan</div>
                <div className="pg-kv__v">
                  <span className="hs-badge hs-badge--accent">{PLAN_NAMES[plan] || plan}</span>
                </div>
              </div>

              <div className="pg-kv">
                <div className="pg-kv__k">Role</div>
                <div className="pg-kv__v">{user.role || "user"}</div>
              </div>

              <div className="pg-kv">
                <div>
                  <div className="pg-kv__k">Account ID</div>
                  <div className="pg-kv__sub">Quote this if you contact support.</div>
                </div>
                <div className="pg-kv__v">{user.id}</div>
              </div>

              {/* S3: same toggle as the studio bar — stored in this browser,
                  defaults to the system preference until first use. */}
              <div className="pg-kv">
                <div>
                  <div className="pg-kv__k">Appearance</div>
                  <div className="pg-kv__sub">Light or dark. Follows your system until you choose.</div>
                </div>
                <div className="pg-kv__v"><ThemeToggle /></div>
              </div>
            </div>

            <p className="hs-notice">
              Changing your name or email is not self-service yet. Email{" "}
              <a href="mailto:hello@helmies.fi" style={{ textDecoration: "underline" }}>hello@helmies.fi</a>{" "}
              and we will do it for you.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Billing ───────────────────────────────────────────────────────────── */
function BillingPanel({ data, loading, error, reload }) {
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState(null);
  const [fault, setFault] = useState("");
  // Pre-fetch/loading fallback only — replaced by the live GET below as soon
  // as it resolves, so the packs section never renders empty.
  const [packs, setPacks] = useState(() =>
    CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, price: p.price, pricePerCredit: p.pricePerCredit }))
  );

  const plan = data?.plan || "free";
  const credits = data?.credits ?? 0;
  const ledger = data?.recentTransactions || [];
  const period = data?.subscription?.stripeCurrentPeriodEnd;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/stripe/topup");
        const json = await res.json();
        if (!cancelled && Array.isArray(json?.packs) && json.packs.length > 0) {
          setPacks(json.packs.map((p) => ({
            id: p.id,
            credits: p.credits,
            price: `€${p.priceEur}`,
            pricePerCredit: `€${p.perCredit}/credit`,
          })));
        }
      } catch {
        // Fetch failed — keep the static fallback rather than an empty section.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const post = useCallback(async (key, path, body) => {
    setBusy(key);
    setFault("");
    try {
      // retries: 0 — a retried POST would open a second Stripe session.
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        retries: 0,
      });
      const json = await res.json();
      if (!json?.url) throw new Error("Stripe did not return a link. Try again in a moment.");
      window.location.href = json.url;
    } catch (e) {
      setFault(e.message);
      setBusy(null);
    }
  }, []);

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{fault}</Fault>
      <Fault>{error}</Fault>

      {/* Balance */}
      <section className="pg-balance" aria-labelledby="h-balance">
        <h2 id="h-balance" className="hs-label" style={{ marginBottom: 0 }}>Credit balance</h2>
        {loading ? (
          <div className="hs-skel" style={{ height: 44, width: 180 }} />
        ) : (
          <span className="pg-balance__n">{num(credits)}</span>
        )}
        <p className="hs-hint">
          {PLAN_NAMES[plan] || plan} plan
          {period ? ` · renews ${day(period)}` : " · no renewal scheduled"}
        </p>
        <div className="hs-row" style={{ flexWrap: "wrap", marginTop: "var(--s-2)" }}>
          <a href="#packs" className="hs-btn hs-btn--primary">
            Top up credits
            <IcBolt className="hs-icon-sm" />
          </a>
          <button
            type="button"
            className="hs-btn"
            onClick={() => post("portal", "/api/stripe/portal")}
            disabled={busy === "portal"}
          >
            {busy === "portal" ? <Spinner label="Opening billing portal" /> : <IcExternal className="hs-icon-sm" />}
            Invoices and payment method
          </button>
          <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={reload}>
            <IcRefresh className="hs-icon-sm" />
            Refresh
          </button>
        </div>
      </section>

      {/* Plans */}
      <section className="pg-panel" aria-labelledby="h-plans">
        <div className="pg-panel__head">
          <h2 id="h-plans">Plan</h2>
          <div className="hs-segmented" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly −20%</button>
          </div>
        </div>
        <div className="pg-panel__body">
          <div className="pg-plans">
            {PLANS.map((p) => {
              const current = p.id === plan;
              const price = yearly ? p.yearly : p.monthly;
              return (
                <article key={p.id} className={`pg-plan${current ? " is-featured" : ""}`}>
                  <h3 className="pg-plan__name">{p.name}</h3>
                  <div className="pg-plan__price">
                    <span className="pg-plan__amount">€{price}</span>
                    <span className="pg-plan__per">{p.id === "free" ? "forever" : "/mo"}</span>
                  </div>
                  <span className="pg-plan__credits">{num(p.credits)} credits / month</span>
                  <ul className="pg-plan__list">
                    {p.features.map((f) => (
                      <li key={f}><IcCheck /> {f}</li>
                    ))}
                  </ul>
                  {current ? (
                    <span className="hs-badge hs-badge--accent" style={{ alignSelf: "flex-start", marginTop: "auto" }}>
                      Current plan
                    </span>
                  ) : p.id === "free" ? (
                    <span className="hs-hint" style={{ marginTop: "auto" }}>Included with every account.</span>
                  ) : (
                    <button
                      type="button"
                      className="hs-btn hs-btn--primary hs-btn--block"
                      onClick={() => post(`plan-${p.id}`, "/api/stripe/checkout", { plan: p.id, yearly })}
                      disabled={busy === `plan-${p.id}`}
                    >
                      {busy === `plan-${p.id}` ? <Spinner label="Opening checkout" /> : null}
                      Switch to {p.name}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit packs */}
      <section className="pg-panel" id="packs" aria-labelledby="h-packs">
        <div className="pg-panel__head">
          <h2 id="h-packs">Credit packs</h2>
          <span className="hs-badge">One-off · never expire</span>
        </div>
        <div className="pg-panel__body">
          <div className="pg-packs">
            {packs.map((p) => (
              <div key={p.id} className="pg-pack">
                <span className="pg-pack__cr">{num(p.credits)}</span>
                <span className="pg-pack__eur">{p.price}</span>
                <span className="pg-pack__rate">{p.pricePerCredit}</span>
                <button
                  type="button"
                  className="hs-btn hs-btn--primary hs-btn--sm hs-btn--block"
                  style={{ marginTop: "var(--s-2)" }}
                  onClick={() => post(`pack-${p.id}`, "/api/stripe/topup", { packId: p.id })}
                  disabled={busy === `pack-${p.id}`}
                >
                  {busy === `pack-${p.id}` ? <Spinner label="Opening checkout" /> : null}
                  Buy {num(p.credits)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ledger */}
      <section className="pg-panel" aria-labelledby="h-ledger">
        <div className="pg-panel__head">
          <h2 id="h-ledger">Credit activity</h2>
          <span className="hs-badge">Last {num(ledger.length)}</span>
        </div>
        <div className="pg-panel__body">
          {loading ? (
            <LoadingSkeleton variant="list" count={4} itemHeight={34} label="Loading credit activity" />
          ) : ledger.length === 0 ? (
            <EmptyState
              icon={<IcBolt />}
              title="Nothing spent yet"
              description="Your first generation will show up here with what it cost."
              action={{ label: "Open the studio", href: "/studio" }}
            />
          ) : (
            <div className="hs-table-wrap">
              <table className="hs-table">
                <caption className="hs-sr">Recent credit transactions</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Type</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="hs-num">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((t) => (
                    <tr key={t.id}>
                      <td className="hs-mono" data-label="Date">{day(t.createdAt)}</td>
                      <td data-label="Type"><span className="hs-badge">{t.type}</span></td>
                      <td data-label="Description">{t.description || "—"}</td>
                      <td
                        data-label="Credits"
                        className="hs-num"
                        style={{ color: t.amount > 0 ? "var(--signal)" : "var(--tx)" }}
                      >
                        {t.amount > 0 ? "+" : ""}{num(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── API keys ──────────────────────────────────────────────────────────── */
function KeysPanel() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fault, setFault] = useState("");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState(null);   // { key, name } — shown once
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(null); // key row awaiting confirmation

  const load = useCallback(async () => {
    setLoading(true);
    setFault("");
    try {
      const res = await apiFetch("/api/user/keys");
      const json = await res.json();
      setKeys(Array.isArray(json) ? json : []);
    } catch (e) {
      setFault(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give the key a name so you can tell it apart later.");
      return;
    }
    setNameError("");
    setCreating(true);
    setFault("");
    try {
      const res = await apiFetch("/api/user/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
        retries: 0,
      });
      const json = await res.json();
      if (!json?.key) throw new Error("The key was created but not returned. Reload and try again.");
      setFresh({ key: json.key, name: trimmed });
      setCopied(false);
      setName("");
      load();
    } catch (e) {
      setFault(e.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id) => {
    setFault("");
    try {
      await apiFetch("/api/user/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        retries: 0,
      });
      load();
    } catch (e) {
      setFault(e.message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fresh.key);
      setCopied(true);
    } catch {
      setFault("The browser blocked the clipboard. Select the key and copy it by hand.");
    }
  };

  return (
    <section className="pg-panel" aria-labelledby="h-keys">
      <div className="pg-panel__head">
        <h2 id="h-keys">API keys</h2>
        <span className="hs-badge">{num(keys.length)} active</span>
      </div>

      <div className="pg-panel__body">
        <Fault>{fault}</Fault>

        <form onSubmit={create} noValidate>
          <div className="hs-field">
            <label className="hs-label" htmlFor="key-name">New key name</label>
            <div className="hs-row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <input
                  id="key-name"
                  className="hs-input"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameError(""); }}
                  placeholder="Render farm, CI, my laptop…"
                  autoComplete="off"
                  maxLength={60}
                  aria-invalid={nameError ? "true" : undefined}
                  aria-describedby={nameError ? "key-name-error" : "key-name-hint"}
                />
              </div>
              <button type="submit" className="hs-btn hs-btn--primary" disabled={creating}>
                {creating ? <Spinner label="Creating key" /> : <IcPlus className="hs-icon-sm" />}
                Create key
              </button>
            </div>
            {nameError
              ? <p className="hs-error" id="key-name-error" role="alert">{nameError}</p>
              : <p className="hs-hint" id="key-name-hint">Keys carry your full account permissions. Make one per machine.</p>}
          </div>
        </form>

        {/* The one and only time the raw key exists in the browser */}
        {fresh && (
          <div className="hs-notice hs-notice--signal" role="status">
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
              <strong>Copy {fresh.name} now — this key is never shown again.</strong>
              <code
                style={{
                  display: "block", padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                  background: "rgba(0,0,0,0.4)", fontSize: "var(--t-tiny)", wordBreak: "break-all",
                  color: "var(--tx)",
                }}
              >
                {fresh.key}
              </code>
              <div className="hs-row">
                <button type="button" className="hs-btn hs-btn--sm" onClick={copy}>
                  {copied ? <IcCheck className="hs-icon-sm" /> : <IcCopy className="hs-icon-sm" />}
                  {copied ? "Copied" : "Copy key"}
                </button>
                <button type="button" className="hs-btn hs-btn--ghost hs-btn--sm" onClick={() => setFresh(null)}>
                  I have stored it
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <LoadingSkeleton variant="list" count={2} itemHeight={44} label="Loading API keys" />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<IcLock />}
            title="No keys yet"
            description="Create a key to drive the studio from your own code."
          />
        ) : (
          <div className="hs-table-wrap">
            <table className="hs-table">
              <caption className="hs-sr">Your API keys</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Key</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col">State</th>
                  <th scope="col"><span className="hs-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td data-label="Name" style={{ color: "var(--tx)", fontWeight: 500 }}>{k.name}</td>
                    <td data-label="Key" className="hs-mono">{k.keyPrefix}</td>
                    <td data-label="Created" className="hs-mono">{day(k.createdAt)}</td>
                    <td data-label="Last used" className="hs-mono">{k.lastUsedAt ? day(k.lastUsedAt) : "Never"}</td>
                    <td data-label="State">
                      <span className={`hs-badge ${k.isActive ? "hs-badge--signal" : ""}`}>
                        {k.isActive ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="hs-btn hs-btn--danger hs-btn--sm"
                        onClick={() => setPending(k)}
                      >
                        <IcTrash className="hs-icon-sm" />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="hs-hint">
          Only the first characters of a key are stored, so we cannot show or resend one. Lose a key and you make a new one.
        </p>
      </div>

      <Confirm
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => revoke(pending.id)}
        title="Revoke this key?"
        body={
          pending
            ? `${pending.name} (${pending.keyPrefix}) stops working immediately. Anything using it will start failing with 401.`
            : ""
        }
        confirmLabel="Revoke key"
      />
    </section>
  );
}

/* ── Generation defaults ───────────────────────────────────────────────── */
const QUALITY = [
  { id: "standard", label: "Standard" },
  { id: "high",     label: "High" },
  { id: "ultra",    label: "Ultra" },
];
const RATIOS = ["1:1", "3:2", "16:9", "9:16", "4:5"];

function DefaultsPanel() {
  const [mode, setMode] = useState("basic");
  const [quality, setQuality] = useState("high");
  const [ratio, setRatio] = useState("16:9");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || "{}");
      if (stored.quality) setQuality(stored.quality);
      if (stored.ratio) setRatio(stored.ratio);
      const firstMode = localStorage.getItem(MODE_KEYS[0]);
      if (firstMode) setMode(firstMode);
    } catch {
      /* A corrupt or blocked localStorage just means we keep the defaults. */
    }
  }, []);

  const save = () => {
    try {
      localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ quality, ratio }));
      MODE_KEYS.forEach((k) => localStorage.setItem(k, mode));
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch {
      setSaved(false);
    }
  };

  return (
    <section className="pg-panel" aria-labelledby="h-defaults">
      <div className="pg-panel__head">
        <h2 id="h-defaults">Generation defaults</h2>
        {saved && <span className="hs-badge hs-badge--signal" role="status">Saved</span>}
      </div>

      <div className="pg-panel__body">
        <div className="hs-field">
          <span className="hs-label" id="lbl-mode">Control mode</span>
          <div className="hs-segmented" role="group" aria-labelledby="lbl-mode">
            <button type="button" aria-pressed={mode === "basic"} onClick={() => setMode("basic")}>Basic</button>
            <button type="button" aria-pressed={mode === "advanced"} onClick={() => setMode("advanced")}>Advanced</button>
          </div>
          <p className="hs-hint">
            Applies to every studio with a basic / advanced switch. Advanced opens the full parameter set on load.
          </p>
        </div>

        <div className="hs-field">
          <label className="hs-label" htmlFor="def-quality">Preferred quality</label>
          <select
            id="def-quality"
            className="hs-select"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
          >
            {QUALITY.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
          <p className="hs-hint">Higher quality costs more credits per generation.</p>
        </div>

        <div className="hs-field">
          <span className="hs-label" id="lbl-ratio">Preferred aspect ratio</span>
          <div className="hs-chips" role="group" aria-labelledby="lbl-ratio">
            {RATIOS.map((r) => (
              <button
                key={r}
                type="button"
                className="hs-chip"
                aria-pressed={ratio === r}
                onClick={() => setRatio(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="hs-row">
          <button type="button" className="hs-btn hs-btn--primary" onClick={save}>Save defaults</button>
        </div>

        <p className="hs-hint">
          These live in this browser, not on your account. Sign in elsewhere and you will set them again.
        </p>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function Settings() {
  const params = useSearchParams();
  const raw = params.get("tab") || "account";
  const tab = TABS.some((t) => t.id === raw) ? raw : (ALIASES[raw] || "account");

  const { data: session, status } = useSession();

  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/credits");
      setCredits(await res.json());
    } catch (e) {
      setError(e.status === 401 ? "Sign in to see your balance." : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <a className="hs-skip" href="#main">Skip to content</a>
      <Navbar />

      <main id="main" className="pg-account">
        <header style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
          <span className="hs-eyebrow">Account</span>
          <h1 style={{ fontSize: "var(--t-2xl)" }}>Settings</h1>
        </header>

        <nav className="pg-tabs" aria-label="Settings sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/settings?tab=${id}`}
              scroll={false}
              className="pg-tab"
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          {tab === "account" && (
            <AccountPanel session={session} status={status} plan={credits?.plan || "free"} />
          )}
          {tab === "billing" && (
            <BillingPanel data={credits} loading={loading} error={error} reload={load} />
          )}
          {tab === "api-keys" && <KeysPanel />}
          {tab === "defaults" && <DefaultsPanel />}
        </div>
      </main>

      <Footer />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="pg-account" aria-busy="true">
          <div className="hs-skel" style={{ height: 220, gridColumn: "1 / -1" }} />
        </main>
      }
    >
      <Settings />
    </Suspense>
  );
}
