"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import { IconBolt, IconArrowUpRight, IconSparkle } from "@/components/Icons";
import { CREDIT_PACKS, getCreditPackPriceId } from "@/lib/credit-packs";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "/month",
    credits: 50,
    features: [
      "50 credits/month",
      "Image generation (SD, Flux)",
      "Basic video generation",
      "Community access",
    ],
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    period: "/month",
    credits: 2000,
    features: [
      "2,000 credits/month",
      "All image & video models",
      "Audio & music generation",
      "Lip sync & cinema",
      "Priority generation queue",
      "API access (10 req/min)",
    ],
    featured: true,
  },
  {
    id: "business",
    name: "Business",
    price: 99,
    period: "/month",
    credits: 8000,
    features: [
      "8,000 credits/month",
      "Everything in Pro",
      "Unlimited API access",
      "Team workspace (5 seats)",
      "Brand kit storage",
      "Workflow automation",
      "Priority support",
    ],
    featured: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    period: "custom",
    label: "Custom",
    features: [
      "Custom credit pool",
      "Unlimited team seats",
      "Dedicated infrastructure",
      "SLA guarantee",
      "Custom model fine-tuning",
      "On-premise deployment",
      "24/7 white-glove support",
    ],
    featured: false,
  },
];

const CREDIT_PACK_TIERS = [
  { id: "small", name: "Starter Pack", credits: 200, price: "€9", priceId: "small" },
  { id: "medium", name: "Creator Pack", credits: 600, price: "€24", priceId: "medium" },
  { id: "large", name: "Studio Pack", credits: 1500, price: "€49", priceId: "large" },
];

export default function BillingPage() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState("monthly");

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => { setCredits(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSubscribe = async (planId) => {
    if (planId === "free") return;
    if (planId === "enterprise") {
      window.location.href = "mailto:hello@helmies.fi?subject=Enterprise Plan Inquiry";
      return;
    }
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, period: billingPeriod }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      // silently fail
    }
  };

  const handleTopup = async (packId) => {
    const priceId = getCreditPackPriceId(packId);
    if (!priceId) return;
    try {
      const res = await fetch("/api/stripe/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {}
  };

  return (
    <div className="universe-page-shell">
      <UniverseNav />
      <div className="universe-page-shell__content">
        <div className="universe-section__header">
          <div>
            <div className="universe-section__label">Billing</div>
            <h1>Plans & Credits</h1>
            <p>Choose a plan that fits your creative workflow.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!loading && (
              <span className="universe-nav__credits" style={{ fontSize: "0.82rem", padding: "8px 14px" }}>
                <IconBolt style={{ width: 14 }} />
                {credits?.credits ?? 0} credits available
              </span>
            )}
          </div>
        </div>

        {/* Plan selector */}
        <div className="universe-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Subscription Plans</h3>
            <div style={{ display: "flex", gap: 3, padding: 3, border: "1px solid rgba(255,190,214,.16)", borderRadius: 10, background: "rgba(255,255,255,.02)" }}>
              {["monthly", "yearly"].map((p) => (
                <button
                  key={p}
                  className="universe-pill"
                  style={{ padding: "6px 14px", borderRadius: 8, border: billingPeriod === p ? "1px solid #ff416f" : "1px solid transparent", background: billingPeriod === p ? "rgba(255,65,111,.1)" : "transparent", color: billingPeriod === p ? "#fff" : "#aa91a0", fontWeight: 600 }}
                  onClick={() => setBillingPeriod(p)}
                >
                  {p === "monthly" ? "Monthly" : "Yearly"}
                  {p === "yearly" && <span style={{ marginLeft: 5, color: "#ff416f", fontSize: ".62rem" }}>-20%</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="universe-plan-grid">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className={`universe-plan ${plan.featured ? "universe-plan--featured" : ""}`}
              >
                {plan.featured && (
                  <div className="universe-section__label" style={{ marginBottom: 8 }}>Most popular</div>
                )}
                <div className="universe-plan__name">{plan.name}</div>
                <div className="universe-plan__price">
                  {plan.price != null ? (
                    <>
                      €{billingPeriod === "yearly" ? Math.round(plan.price * 0.8) : plan.price}
                      <small>{plan.period}</small>
                    </>
                  ) : (
                    <>
                      {plan.label}
                      <small> pricing</small>
                    </>
                  )}
                </div>
                <p className="universe-plan__desc">
                  <IconBolt style={{ width: 12, display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                  {plan.credits ? `${plan.credits.toLocaleString()} credits/month` : "Custom credit pool"}
                </p>
                <ul className="universe-plan__features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button
                  className="universe-plan__cta"
                  onClick={() => handleSubscribe(plan.id)}
                >
                  {plan.id === "free" ? "Current plan" : plan.id === "enterprise" ? "Contact us" : `Upgrade to ${plan.name}`}
                  {plan.id !== "free" && plan.id !== "enterprise" && <IconArrowUpRight style={{ width: 11, marginLeft: 5, display: "inline" }} />}
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Credit packs */}
        <div className="universe-section">
          <h3>Credit Top-ups</h3>
          <p>One-time credit packs — no subscription required. Use anytime.</p>
          <div className="universe-plan-grid">
            {CREDIT_PACKS.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="universe-plan"
              >
                <div className="universe-plan__name">{p.name}</div>
                <div className="universe-plan__price">{p.price}</div>
                <p className="universe-plan__desc">{p.credits ? `${p.credits} credits one-time` : ""}</p>
                <button className="universe-plan__cta" onClick={() => handleTopup(p.id)}>
                  Buy pack
                  <IconArrowUpRight style={{ width: 11, marginLeft: 5, display: "inline" }} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Current usage */}
        {session?.user && (
          <div className="universe-section">
            <h3>Current Usage</h3>
            <div className="universe-stats">
              <div className="universe-stat">
                <span className="universe-stat__label">Plan</span>
                <span className="universe-stat__value" style={{ fontSize: "1.1rem" }}>
                  {credits?.plan || "free"}
                </span>
              </div>
              <div className="universe-stat">
                <span className="universe-stat__label">Credits remaining</span>
                <span className="universe-stat__value">
                  <IconBolt />
                  {loading ? "..." : (credits?.credits ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
