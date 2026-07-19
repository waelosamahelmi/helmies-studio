"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { IconCheck, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const SUBSCRIPTIONS = [
  { id: "free", name: "Free", price: "$0", period: "forever", credits: "10 credits/mo", desc: "Try every studio. No card required.", features: ["10 credits monthly", "All 200+ models", "Standard resolution", "Community support"], cta: "Start free", popular: false },
  { id: "starter", name: "Starter", price: "$9", period: "/mo", credits: "200 credits/mo", desc: "For testing the waters.", features: ["200 credits monthly", "All studios unlocked", "HD resolution", "Cancel anytime", "Email support"], cta: "Subscribe", popular: false },
  { id: "studio", name: "Studio", price: "$29", period: "/mo", credits: "800 credits/mo", desc: "For regular creators who ship.", features: ["800 credits monthly", "All studios unlocked", "4K downloads", "Generation archive", "Priority queue", "Email support"], cta: "Subscribe", popular: true },
  { id: "pro", name: "Pro", price: "$99", period: "/mo", credits: "3000 credits/mo", desc: "Power users and small teams.", features: ["3000 credits monthly", "Priority queue", "Batch exports", "API access", "Dedicated support"], cta: "Subscribe", popular: false },
];

const PACKS = [
  { id: "starter", name: "Starter Pack", price: "$5", credits: 100, desc: "Test the waters." },
  { id: "studio", name: "Studio Pack", price: "$10", credits: 250, desc: "For a steady current." },
  { id: "pro", name: "Pro Pack", price: "$20", credits: 600, desc: "Power users.", popular: true },
  { id: "agency", name: "Agency Pack", price: "$50", credits: 2000, desc: "Maximum value." },
];

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <div className="grain" aria-hidden="true" />

      <div className="page">
        <div className="page__head">
          <div className="eyebrow mb-5">Pricing</div>
          <h1 className="page__title">Pricing that <em>scales</em> with you.</h1>
          <p className="page__sub">Monthly subscriptions or one-off packs. API costs covered, you just create.</p>
        </div>

        {/* SUBSCRIPTIONS */}
        <div className="mb-24">
          <h2 className="text-3xl font-bold tracking-tight text-center mb-10">Monthly <em className="italic" style={{ color: "#FF1B6B" }}>subscriptions</em></h2>
          <div className="pricing-grid">
            {SUBSCRIPTIONS.map((s, i) => (
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
                  <div className="price__credits">{s.credits}</div>
                  <p className="text-[13px] text-white/50 mb-4 leading-relaxed">{s.desc}</p>
                  <ul className="price__features">
                    {s.features.map((f) => (
                      <li key={f}><IconCheck />{f}</li>
                    ))}
                  </ul>
                  <Link href="/login" className={`btn ${s.popular ? "btn-primary" : "btn-secondary"}`}>
                    {s.cta}
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </Link>
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
                  <div className="pack__credits">{p.credits} credits</div>
                  <p className="pack__desc">{p.desc}</p>
                  <Link href="/login" className="btn btn-secondary">
                    Buy
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}