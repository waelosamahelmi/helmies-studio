"use client";

/* ══════════════════════════════════════════════════════════════════════════
   PRICING — interactive parts
   ──────────────────────────────────────────────────────────────────────────
   Two islands live here because the rest of /pricing is static and stays on
   the server:
     · PricingPlans — billing-period switch, subscription checkout, packs.
     · PricingFaq   — the disclosure list (pages.css styles the chevron off
                      aria-expanded, so it has to be a real button).

   Every figure on this page is derived, never typed twice. Plan credits come
   from SUBSCRIPTION_CREDITS (display copy only — checkout resolves the real
   plan/price server-side from the SubscriptionPlan table). Packs are fetched
   live from GET /api/stripe/topup, which reads the admin-editable CreditPack
   table — CREDIT_PACKS is kept only as the pre-fetch/loading fallback so the
   section never renders empty. The per-credit rate is computed from
   price ÷ credits client-side so the two products stay comparable.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-fetch";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { SUBSCRIPTION_CREDITS } from "@/lib/plan-constants";
import { IcCheck, IcChevron } from "@/components/studio/kit/Icons";
import PromoField from "@/components/PromoField";

const int = (n) => n.toLocaleString("en-US");
const rate = (eur, credits) => (credits > 0 ? `€${(eur / credits).toFixed(4)}` : "—");

/* Prices are the ones the Stripe price ids are configured against. Yearly is
   billed twelve months up front; `perMonth` is what that works out to. */
const PLANS = [
  {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    credits: SUBSCRIPTION_CREDITS.free,
    line: "Run the catalog and judge the output before you pay for anything.",
    features: ["Every model in the catalog", "No card required", "Credits stay on the balance"],
  },
  {
    id: "starter",
    name: "Starter",
    monthly: 24,
    yearly: 19,
    credits: SUBSCRIPTION_CREDITS.starter,
    line: "One project a week, or a steady trickle of stills.",
    features: ["Every model in the catalog", "Templates marked as plan-included", "Credits roll over — nothing resets", "Cancel from the billing portal"],
  },
  {
    id: "studio",
    name: "Studio",
    monthly: 49,
    yearly: 39,
    credits: SUBSCRIPTION_CREDITS.studio,
    line: "Daily production. Enough video budget to iterate, not just to try.",
    features: ["Every model in the catalog", "Templates marked as plan-included", "Credits roll over — nothing resets", "Cancel from the billing portal"],
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    yearly: 79,
    credits: SUBSCRIPTION_CREDITS.pro,
    line: "Continuous output, or a small team sharing one balance.",
    features: ["Every model in the catalog", "Templates marked as plan-included", "Credits roll over — nothing resets", "Cancel from the billing portal"],
  },
];

export default function PricingPlans() {
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState(null);
  const [fault, setFault] = useState(null);
  // EDITSv1 E8.4: a validated DISCOUNT code, held so it can ride along with
  // the checkout request. A credit-grant code is applied server-side the
  // moment it validates and never reaches checkout, so it is not held here.
  const [promo, setPromo] = useState(null);

  // Pre-fetch/loading fallback only — replaced by the live GET below as soon
  // as it resolves, so the packs section never renders empty.
  const [rawPacks, setRawPacks] = useState(() =>
    CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, eur: parseFloat(String(p.price).replace("€", "")) }))
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/stripe/topup");
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.packs) && data.packs.length > 0) {
          setRawPacks(data.packs.map((p) => ({ id: p.id, credits: p.credits, eur: p.priceEur })));
        }
      } catch {
        // Fetch failed — keep the static fallback rather than an empty section.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const packs = useMemo(() => {
    const rows = rawPacks.map((p) => ({ ...p, perCredit: p.eur / p.credits }));
    const best = Math.min(...rows.map((r) => r.perCredit));
    return rows.map((r) => ({ ...r, best: r.perCredit === best }));
  }, [rawPacks]);

  async function post(url, body, key) {
    setFault(null);
    setBusy(key);
    try {
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The code is a hint, not an instruction: the route re-validates it
        // and recomputes the price from the database before Stripe is told
        // anything.
        body: JSON.stringify(promo?.code ? { ...body, promoCode: promo.code } : body),
        retries: 0,
      });
      const data = await res.json();
      if (!data.url) throw new Error("Stripe did not return a checkout link. Try again in a moment.");
      // eslint-disable-next-line react-hooks/immutability -- navigating via window.location.href is the standard redirect pattern, not accidental external-state mutation (2026-08-01)
      window.location.href = data.url;
    } catch (err) {
      setFault(
        err?.status === 401
          ? "Sign in first — checkout needs an account to attach the credits to."
          : err?.message || "Checkout could not be started.",
      );
      setBusy(null);
    }
  }

  return (
    <>
      {fault && (
        <div className="hs-notice hs-notice--fault" role="alert" style={{ marginBottom: "var(--s-6)" }}>
          <span>{fault}</span>
        </div>
      )}

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      <section aria-labelledby="plans-h">
        <div className="hs-head">
          <h2 id="plans-h">Subscriptions</h2>
          <p>
            A plan adds its credits to your balance on every billing cycle. Nothing is
            zeroed at the end of the month — the balance is cumulative.
          </p>
        </div>

        <div className="hs-row" style={{ marginBottom: "var(--s-6)" }}>
          <div className="hs-segmented" role="group" aria-label="Billing period" style={{ maxWidth: 280 }}>
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
              Monthly
            </button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
              Yearly — save 20%
            </button>
          </div>
        </div>

        <div className="pg-plans">
          {PLANS.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const isFree = plan.id === "free";
            const key = `plan:${plan.id}`;
            return (
              <div key={plan.id} className={`pg-plan${plan.featured ? " is-featured" : ""}`}>
                <h3 className="pg-plan__name">{plan.name}</h3>

                <div>
                  <p className="pg-plan__price">
                    <span className="pg-plan__amount">€{price}</span>
                    <span className="pg-plan__per">{isFree ? "forever" : "/ month"}</span>
                  </p>
                  <p className="hs-mono hs-hint">
                    {isFree
                      ? "no card required"
                      : yearly
                        ? `billed €${price * 12} once a year`
                        : "billed monthly"}
                  </p>
                </div>

                <div>
                  <p className="pg-plan__credits">{int(plan.credits)} credits / cycle</p>
                  <p className="hs-mono hs-hint">
                    {isFree ? "€0.0000 / credit" : `${rate(price, plan.credits)} / credit`}
                  </p>
                </div>

                <p className="hs-hint">{plan.line}</p>

                <ul className="pg-plan__list">
                  <li>
                    <IcCheck />
                    <span>
                      <span className="hs-mono">{int(plan.credits)}</span> credits added every{" "}
                      {yearly && !isFree ? "month of the term" : "cycle"}
                    </span>
                  </li>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <IcCheck />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isFree ? (
                  <Link href="/login?new=1" className="hs-btn hs-btn--outline hs-btn--block">
                    Create an account
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`hs-btn hs-btn--block${plan.featured ? " hs-btn--primary" : " hs-btn--outline"}`}
                    disabled={busy === key}
                    onClick={() => post("/api/stripe/checkout", { plan: plan.id, yearly }, key)}
                  >
                    {busy === key ? <span className="hs-spin" /> : null}
                    {busy === key ? "Opening Stripe" : `Subscribe to ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="hs-hint" style={{ marginTop: "var(--s-5)" }}>
          Already subscribed?{" "}
          <button
            type="button"
            className="hs-btn hs-btn--ghost hs-btn--sm"
            disabled={busy === "portal"}
            onClick={() => post("/api/stripe/portal", {}, "portal")}
          >
            Open the billing portal
          </button>
        </p>
      </section>

      {/* ── One-off credit packs ─────────────────────────────────────────── */}
      <section aria-labelledby="packs-h" style={{ marginTop: "var(--s-16)" }}>
        <div className="hs-head">
          <h2 id="packs-h">Credit top-ups</h2>
          <p>
            A single payment for a fixed number of credits. No renewal, no plan.
            Buying a pack does not unlock plan-included templates.
          </p>
        </div>

        {/* EDITSv1 E8.4: the field a promo code had nowhere to go into. A
            credit-grant code lands in the balance immediately; a discount
            code is previewed here and applied at checkout. */}
        <div style={{ marginBottom: "var(--s-6)" }}>
          <PromoField
            onApplied={(data) => setPromo(data.granted ? null : data)}
          />
        </div>

        <div className="pg-packs">
          {packs.map((p) => {
            const key = `pack:${p.id}`;
            return (
              <div key={p.id} className="pg-pack">
                <span className="hs-label">Top-up</span>
                <span className="pg-pack__cr">{int(p.credits)}</span>
                <span className="pg-pack__eur">€{p.eur.toFixed(2)} once</span>
                <span className="pg-pack__rate">{rate(p.eur, p.credits)} / credit</span>
                {p.best && <span className="hs-badge hs-badge--accent">Best rate</span>}
                <button
                  type="button"
                  className="hs-btn hs-btn--outline hs-btn--block"
                  disabled={busy === key}
                  onClick={() => post("/api/stripe/topup", { packId: p.id }, key)}
                >
                  {busy === key ? <span className="hs-spin" /> : null}
                  {busy === key ? "Opening Stripe" : `Buy ${int(p.credits)} credits`}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────────── */
export function PricingFaq({ items }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="pg-faq">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.q} className="pg-faq__item">
            <h3>
              <button
                type="button"
                className="pg-faq__q"
                aria-expanded={expanded}
                aria-controls={`faq-a-${i}`}
                id={`faq-q-${i}`}
                onClick={() => setOpen(expanded ? -1 : i)}
              >
                {item.q}
                <IcChevron />
              </button>
            </h3>
            {expanded && (
              <div className="pg-faq__a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
