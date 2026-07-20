"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { IconCheck, IconArrowUpRight, IconBolt } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const SUBSCRIPTIONS_MONTHLY = [
  { id: "free", name: "Free", price: "€0", period: "forever", credits: "10 credits/mo", desc: "Try every studio. No card required.", features: ["10 credits monthly", "All 70+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { id: "starter", name: "Starter", price: "€24", period: "/mo", credits: "500 credits/mo", desc: "For testing the waters.", features: ["500 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime", "Email support"], cta: "Subscribe", popular: false },
  { id: "studio", name: "Studio", price: "€49", period: "/mo", credits: "1500 credits/mo", desc: "For regular creators who ship.", features: ["1500 credits monthly", "All studios unlocked", "4K downloads", "Generation archive", "Priority queue", "Email support"], cta: "Subscribe", popular: true },
  { id: "pro", name: "Pro", price: "€99", period: "/mo", credits: "5000 credits/mo", desc: "Power users and small teams.", features: ["5000 credits monthly", "Priority queue", "Batch exports", "API access", "Dedicated support"], cta: "Subscribe", popular: false },
];

const SUBSCRIPTIONS_YEARLY = [
  { id: "free", name: "Free", price: "€0", period: "forever", credits: "10 credits/mo", desc: "Try every studio. No card required.", features: ["10 credits monthly", "All 70+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { id: "starter", name: "Starter", price: "€19", period: "/mo", billed: "Billed €228/yr", credits: "500 credits/mo", desc: "For testing the waters.", features: ["500 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime", "Email support"], cta: "Subscribe", popular: false },
  { id: "studio", name: "Studio", price: "€39", period: "/mo", billed: "Billed €468/yr", credits: "1500 credits/mo", desc: "For regular creators who ship.", features: ["1500 credits monthly", "All studios unlocked", "4K downloads", "Generation archive", "Priority queue", "Email support"], cta: "Subscribe", popular: true },
  { id: "pro", name: "Pro", price: "€79", period: "/mo", billed: "Billed €948/yr", credits: "5000 credits/mo", desc: "Power users and small teams.", features: ["5000 credits monthly", "Priority queue", "Batch exports", "API access", "Dedicated support"], cta: "Subscribe", popular: false },
];

const PACKS = [
  { id: "500", name: "500 Credits", price: "€9", credits: 500, pricePerCredit: "€0.018/credit" },
  { id: "1000", name: "1000 Credits", price: "€16", credits: 1000, pricePerCredit: "€0.016/credit", popular: true },
  { id: "2500", name: "2500 Credits", price: "€35", credits: 2500, pricePerCredit: "€0.014/credit" },
  { id: "5000", name: "5000 Credits", price: "€60", credits: 5000, pricePerCredit: "€0.012/credit" },
];

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);
  const subscriptions = yearly ? SUBSCRIPTIONS_YEARLY : SUBSCRIPTIONS_MONTHLY;

  const handleCheckout = async (priceId, mode) => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, mode }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error("Checkout failed:", e);
    }
  };

  const handleTopup = async (packId) => {
    const priceMap = {
      "500": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_500,
      "1000": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_1000,
      "2500": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_2500,
      "5000": process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_5000,
    };
    const priceId = priceMap[packId];
    if (!priceId) { alert("Credit pack not configured yet."); return; }
    try {
      const res = await fetch("/api/stripe/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      console.error("Top-up failed:", e);
    }
  };

  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__head">
          <div className="eyebrow mb-5">Pricing</div>
          <h1 className="page__title">Pricing that <em>scales</em> with you.</h1>
          <p className="page__sub">Monthly subscriptions or one-off credits. Start free, scale when you're ready.</p>
        </div>

        {/* SUBSCRIPTIONS */}
        <div className="mb-24">
          <div className="pricing-toggle" style={{ justifyContent: "center", marginBottom: "2rem" }}>
            <span className={`pricing-toggle__label ${!yearly ? "pricing-toggle__label--active" : ""}`}>Monthly</span>
            <button className={`pricing-toggle__switch ${yearly ? "pricing-toggle__switch--on" : ""}`} onClick={() => setYearly(!yearly)}>
              <span className="pricing-toggle__knob" />
            </button>
            <span className={`pricing-toggle__label ${yearly ? "pricing-toggle__label--active" : ""}`}>Yearly <span className="pricing-toggle__badge">-20%</span></span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-center mb-10">Monthly <em className="italic" style={{ color: "#FF1B6B" }}>subscriptions</em></h2>
          <div className="pricing-grid">
            {subscriptions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
                className={`bezel price ${s.popular ? "price--popular" : ""}`}
              >
                {s.popular && <div className="price__badge">Most Popular</div>}
                <div className="price__core bezel__core">
                  <div className="price__name">{s.name}</div>
                  <div className="price__amount">
                    <span className="price__num">{s.price}</span>
                    <span className="price__period">{s.period}</span>
                  </div>
                  {s.billed && <div className="price__billed" style={{ fontSize: "0.7rem", color: "rgba(242,242,247,0.4)", marginBottom: 8 }}>{s.billed}</div>}
                  <div className="price__credits"><IconBolt /> {s.credits}</div>
                  <p className="text-[13px] text-white/50 mb-4 leading-relaxed">{s.desc}</p>
                  <ul className="price__features">
                    {s.features.map((f) => (
                      <li key={f}><IconCheck />{f}</li>
                    ))}
                  </ul>
                  {s.id === "free" ? (
                    <Link href="/login" className={`btn ${s.popular ? "btn-primary" : "btn-secondary"}`}>
                      {s.cta}
                      <span className="btn__icon"><IconArrowUpRight /></span>
                    </Link>
                  ) : (
                    <button className={`btn ${s.popular ? "btn-primary" : "btn-secondary"}`} onClick={() => handleCheckout(s.id === "starter" ? "price_starter_monthly" : s.id === "studio" ? "price_studio_monthly" : "price_pro_monthly", "subscription")}>
                      {s.cta}
                      <span className="btn__icon"><IconArrowUpRight /></span>
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* TOP-UP PACKS */}
        <div>
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight">Or grab a <em className="italic" style={{ color: "#FF1B6B" }}>quick pack</em></h2>
            <p className="text-sm text-white/40 mt-3">One-off purchases · no subscription · credits never expire</p>
          </div>
          <div className="packs">
            {PACKS.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.7, ease: EASE, delay: i * 0.07 }}
                className={`bezel pack ${p.popular ? "price--popular" : ""}`}
              >
                <div className="pack__core bezel__core">
                  <div className="pack__row">
                    <span className="pack__name">{p.name}</span>
                    <span className="pack__price">{p.price}</span>
                  </div>
                  <div className="pack__credits"><IconBolt /> {p.credits} credits</div>
                  <p className="pack__desc">{p.pricePerCredit}</p>
                  <button className="btn btn-secondary" onClick={() => handleTopup(p.id)}>
                    Buy
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
