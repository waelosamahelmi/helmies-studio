"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { FaCheck, FaBolt } from "react-icons/fa";

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
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="section pt-24">
        <div className="section__head">
          <div className="section__kicker">Pricing</div>
          <h2>Pricing that <em>scales</em> with you.</h2>
          <p className="section__sub">Monthly subscriptions or one-off packs. API costs covered — you just create.</p>
        </div>

        <div className="mb-16">
          <div className="text-center mb-8">
            <div className="section__kicker justify-center"><FaCheck className="mr-1" /> Subscriptions</div>
            <h3 className="text-2xl font-bold">Pick your <span className="text-brand">tier</span></h3>
          </div>
          <div className="pricing-grid">
            {SUBSCRIPTIONS.map((s) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className={`pricing-card ${s.popular ? "pricing-card--popular" : ""}`}>
                {s.popular && <div className="pricing-card__badge">Most Popular</div>}
                <div className="pricing-card__name">{s.name}</div>
                <div className="pricing-card__price">{s.price}<span>{s.period}</span></div>
                <div className="pricing-card__credits">{s.credits}</div>
                <p className="text-sm text-white/50 mb-4">{s.desc}</p>
                <ul className="pricing-card__features">
                  {s.features.map((f) => <li key={f}><FaCheck />{f}</li>)}
                </ul>
                <Link href="/login" className={`btn w-full justify-center ${s.popular ? "btn-primary" : "btn-secondary"}`}>{s.cta}</Link>
              </motion.div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-center mb-8">
            <div className="section__kicker justify-center"><FaBolt className="mr-1" /> Top-up packs</div>
            <h3 className="text-2xl font-bold">Or grab a <em className="font-normal italic">quick pack</em></h3>
            <p className="text-sm text-white/40 mt-2">One-off purchases · no subscription · credits never expire</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKS.map((p) => (
              <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className={`pricing-card ${p.popular ? "pricing-card--popular" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-white">{p.name}</span>
                  <span className="text-2xl font-extrabold text-brand">{p.price}</span>
                </div>
                <div className="text-sm text-white/60 mb-1">{p.credits} credits</div>
                <p className="text-xs text-white/40 mb-4">{p.desc}</p>
                <Link href="/login" className="btn btn-secondary w-full justify-center text-sm">Buy</Link>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}