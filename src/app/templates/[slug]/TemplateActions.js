"use client";

/* ══════════════════════════════════════════════════════════════════════════
   TEMPLATE DETAIL — the action column
   ──────────────────────────────────────────────────────────────────────────
   Access is decided by the server, not guessed here:
     GET  /api/templates/[slug]        → { ...template, hasAccess }
     POST /api/templates/purchase      → { success } | { url } | { alreadyPurchased }

   With access, the primary action is a plain link to
   /studio/<tool>?template=<slug>. StudioClient reads that query param, calls
   /apply, and preloads the config — which is also what records the use. So
   this page must NOT call /apply itself, or it would burn a use of a
   single-use template just for opening the studio.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/client-fetch";
import { getTool } from "@/components/studio/kit/tools";
import { IcBolt, IcLock, IcAlert, IcCheck } from "@/components/studio/kit/Icons";

export default function TemplateActions({ slug, toolType, pricingModel, oneTimePrice, purchase }) {
  const { status: authStatus } = useSession();
  const authed = authStatus === "authenticated";

  const [access, setAccess] = useState(null); // null = not known yet
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState(null);
  const [needsPlan, setNeedsPlan] = useState(false);

  const tool = getTool(toolType);
  const oneTime = pricingModel === "onetime";
  const price = Number.isFinite(oneTimePrice) ? `€${(oneTimePrice / 100).toFixed(2)}` : null;

  const check = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/templates/${encodeURIComponent(slug)}`);
      const data = await res.json();
      setAccess(!!data.hasAccess);
    } catch {
      setAccess(false);
    }
  }, [slug]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!authed) { setAccess(false); return; }
    check();
  }, [authStatus, authed, check]);

  async function unlock() {
    setFault(null);
    setNeedsPlan(false);
    setBusy(true);
    try {
      const res = await apiFetch("/api/templates/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlug: slug }),
        retries: 0,
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      if (data.hasAccess) { setAccess(true); setBusy(false); return; }
      throw new Error("The purchase did not complete. Nothing was charged.");
    } catch (err) {
      if (err?.status === 402) setNeedsPlan(true);
      else if (err?.status === 401) setFault("Sign in first — a template attaches to an account.");
      else setFault(err?.message || "The purchase could not be started.");
      setBusy(false);
    }
  }

  return (
    <div className="hs-stack">
      {purchase === "success" && (
        <div className="hs-notice hs-notice--signal" role="status">
          <IcCheck className="hs-icon" />
          <span>
            Payment went through. Access is granted by Stripe’s webhook, which can take a
            few seconds — if the button below still asks for payment, give it a moment and
            check again.
          </span>
        </div>
      )}
      {purchase === "cancelled" && (
        <div className="hs-notice hs-notice--caution" role="status">
          <span>Checkout was cancelled. Nothing was charged.</span>
        </div>
      )}

      {fault && (
        <div className="hs-notice hs-notice--fault" role="alert">
          <IcAlert className="hs-icon" />
          <span>{fault}</span>
        </div>
      )}

      {needsPlan && (
        <div className="hs-notice hs-notice--caution" role="alert">
          <span>
            This template comes with a paid plan, and this account is on the free tier.
            Subscribe to any paid plan and it unlocks immediately —{" "}
            <Link href="/pricing" style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
              see the plans
            </Link>
            .
          </span>
        </div>
      )}

      {/* ── Not signed in ──────────────────────────────────────────────── */}
      {!authed && authStatus !== "loading" && (
        <>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/templates/${slug}`)}`}
            className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
          >
            <IcLock className="hs-icon-sm" />
            Sign in to use this template
          </Link>
          <p className="hs-hint">
            {oneTime
              ? `A one-off purchase of ${price || "this template"}, attached to your account for good.`
              : "Included with any paid plan. A free account can browse it but not run it."}
          </p>
        </>
      )}

      {/* ── Signed in, checking ────────────────────────────────────────── */}
      {authed && access === null && (
        <button type="button" className="hs-btn hs-btn--lg hs-btn--block" disabled>
          <span className="hs-spin" />
          Checking your access
        </button>
      )}

      {/* ── Signed in, has access ──────────────────────────────────────── */}
      {authed && access === true && (
        <>
          <Link
            href={`/studio/${toolType}?template=${encodeURIComponent(slug)}`}
            className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
          >
            Open in {tool.label}
            <IcBolt className="hs-icon-sm" />
          </Link>
          <p className="hs-hint">
            The studio opens with these settings loaded. The generation itself still costs
            its normal credits.
          </p>
        </>
      )}

      {/* ── Signed in, no access ───────────────────────────────────────── */}
      {authed && access === false && (
        <>
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
            disabled={busy}
            onClick={unlock}
          >
            {busy ? <span className="hs-spin" /> : null}
            {busy ? "Working" : oneTime ? `Buy for ${price || "one payment"}` : "Unlock with my plan"}
          </button>
          <p className="hs-hint">
            {oneTime
              ? "One payment through Stripe. The template stays on your account afterwards."
              : "No extra charge — this template is part of any paid plan."}
          </p>
          {purchase === "success" && (
            <button type="button" className="hs-btn hs-btn--outline hs-btn--block" onClick={check}>
              Check access again
            </button>
          )}
        </>
      )}
    </div>
  );
}
