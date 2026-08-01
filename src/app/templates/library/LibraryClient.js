"use client";

/* ══════════════════════════════════════════════════════════════════════════
   TEMPLATE LIBRARY — what this account already owns
   ──────────────────────────────────────────────────────────────────────────
   GET /api/templates/library → { templates, total } where each row is the
   template flattened with its purchase record:
     purchase.purchaseType    "subscription_included" | "onetime" | "free"
     purchase.usageRemaining  null = unlimited, 0 = exhausted
     purchase.totalUses, purchasedAt, lastUsedAt

   usageRemaining is the thing that actually gates /apply, so it is the number
   the card leads with. A row at 0 is dead weight and says so.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/client-fetch";
import { getTool } from "@/components/studio/kit/tools";
import { IcArchive, IcLock, IcAlert, IcRefresh, IcBolt } from "@/components/studio/kit/Icons";

const PURCHASE_LABEL = {
  subscription_included: "Plan-included",
  onetime: "Bought outright",
  free: "Free",
};

const day = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "—";
};

export default function LibraryClient() {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fault, setFault] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setFault(null);
    apiFetch("/api/templates/library")
      .then((r) => r.json())
      .then((d) => setItems(d.templates || []))
      .catch((err) => setFault(err?.message || "Your library could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authed) { setLoading(false); return; }
    load();
  }, [authed, load]);

  if (authStatus === "loading" || (authed && loading)) {
    return (
      <div className="pg-tpl" aria-busy="true">
        <p className="hs-sr" role="status">Loading your library</p>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="pg-tpl__card" aria-hidden="true">
            <div className="pg-tpl__frame"><div className="hs-skel" style={{ width: "100%", height: "100%", borderRadius: 0 }} /></div>
            <div className="pg-tpl__body">
              <div className="hs-skel" style={{ height: 13, width: "70%" }} />
              <div className="hs-skel" style={{ height: 9, width: "90%" }} />
            </div>
            <div className="pg-tpl__foot"><div className="hs-skel" style={{ height: 12, width: 80 }} /></div>
          </div>
        ))}
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="hs-empty">
        <span className="hs-empty__mark"><IcLock /></span>
        <h2>Sign in to see your library</h2>
        <p>
          This page lists the templates attached to your account — the ones your plan
          includes and the ones you bought outright — with how many uses each has left.
        </p>
        <div className="pg-head__row">
          <Link href="/login?callbackUrl=%2Ftemplates%2Flibrary" className="hs-btn hs-btn--primary">Sign in</Link>
          <Link href="/templates" className="hs-btn hs-btn--outline">Browse templates</Link>
        </div>
      </div>
    );
  }

  if (fault) {
    return (
      <div className="hs-stack">
        <div className="hs-notice hs-notice--fault" role="alert">
          <IcAlert className="hs-icon" />
          <span>{fault}</span>
        </div>
        <div>
          <button type="button" className="hs-btn hs-btn--outline" onClick={load}>
            <IcRefresh className="hs-icon-sm" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="hs-empty">
        <span className="hs-empty__mark"><IcArchive /></span>
        <h2>Nothing in your library yet</h2>
        <p>
          A template lands here the moment you unlock it — either because your plan
          includes it or because you bought it. Then it is one click from the studio.
        </p>
        <Link href="/templates" className="hs-btn hs-btn--primary">Browse the marketplace</Link>
      </div>
    );
  }

  return (
    <>
      <p className="pg-count" style={{ marginLeft: 0, marginBottom: "var(--s-5)" }}>
        {items.length} template{items.length === 1 ? "" : "s"} on this account
      </p>

      <div className="pg-tpl">
        {items.map((t) => {
          const p = t.purchase || {};
          const tool = getTool(t.toolType);
          const ToolIcon = tool.icon;
          const unlimited = p.usageRemaining === null || p.usageRemaining === undefined;
          const spent = !unlimited && p.usageRemaining <= 0;

          return (
            <article key={t.id} className="pg-tpl__card">
              <div className="pg-tpl__frame">
                {t.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01)
                  <img src={t.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--tx-ghost)" }}>
                    <ToolIcon style={{ width: 28, height: 28 }} />
                  </div>
                )}
              </div>

              <div className="pg-tpl__body">
                <h3 style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>
                  <Link href={`/templates/${t.slug}`}>{t.name}</Link>
                </h3>

                <div className="hs-chips">
                  <span className="hs-badge">{tool.label}</span>
                  <span className="hs-badge">{PURCHASE_LABEL[p.purchaseType] || p.purchaseType}</span>
                  {spent && <span className="hs-badge hs-badge--fault">Used up</span>}
                </div>

                <dl className="hs-stack" style={{ gap: "var(--s-1)", marginTop: "auto", paddingTop: "var(--s-3)" }}>
                  <div className="hs-row hs-row--between">
                    <dt className="hs-hint">Uses left</dt>
                    <dd className="hs-mono" style={{ fontSize: "var(--t-tiny)", color: spent ? "var(--fault)" : "var(--tx)" }}>
                      {unlimited ? "unlimited" : p.usageRemaining}
                    </dd>
                  </div>
                  <div className="hs-row hs-row--between">
                    <dt className="hs-hint">Times run</dt>
                    <dd className="hs-mono hs-dim" style={{ fontSize: "var(--t-tiny)" }}>{p.totalUses ?? 0}</dd>
                  </div>
                  <div className="hs-row hs-row--between">
                    <dt className="hs-hint">Unlocked</dt>
                    <dd className="hs-mono hs-dim" style={{ fontSize: "var(--t-tiny)" }}>{day(p.purchasedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="pg-tpl__foot">
                {spent ? (
                  <Link href={`/templates/${t.slug}`} className="hs-btn hs-btn--sm hs-btn--outline">
                    Buy another use
                  </Link>
                ) : (
                  <Link
                    href={`/studio/${t.toolType}?template=${encodeURIComponent(t.slug)}`}
                    className="hs-btn hs-btn--sm hs-btn--primary"
                  >
                    Open in {tool.label}
                    <IcBolt className="hs-icon-sm" />
                  </Link>
                )}
                <span className="hs-mono hs-mute" style={{ fontSize: 10 }}>
                  {p.lastUsedAt ? `last run ${day(p.lastUsedAt)}` : "never run"}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
