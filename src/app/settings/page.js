"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import CreditTickDown from "@/components/CreditTickDown";
import { IconBolt, IconArrowUpRight } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

const CREDIT_PACKS = [
  { id: "500", name: "500 Credits", price: "€9", credits: 500 },
  { id: "1000", name: "1000 Credits", price: "€16", credits: 1000 },
  { id: "2500", name: "2500 Credits", price: "€35", credits: 2500 },
  { id: "5000", name: "5000 Credits", price: "€60", credits: 5000 },
];

export default function SettingsPage() {
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [credits, setCredits] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadKeys = () => {
    fetch("/api/user/keys").then((r) => r.json()).then(setKeys).catch(() => {});
  };
  const loadCredits = () => {
    fetch("/api/credits").then((r) => r.json()).then((d) => { setCredits(d); setLoading(false); }).catch(() => setLoading(false));
  };
  const loadSubscription = () => {
    fetch("/api/stripe/portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ return_url: "/settings" }) })
      .then((r) => r.json()).then(setSubscription).catch(() => {});
  };

  useEffect(() => { loadKeys(); loadCredits(); loadSubscription(); }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/user/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    const data = await res.json();
    if (data.key) {
      setNewKey(data.key);
      setNewKeyName("");
      loadKeys();
    }
  };

  const deleteKey = async (id) => {
    await fetch("/api/user/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadKeys();
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
      <div className="page settings">
        <div className="settings__header">
          <h1>Settings</h1>
          <p>Manage your account, credits, and API keys.</p>
        </div>

        {/* Credits */}
        <div className="settings__section">
          <h3>Credits</h3>
          <div className="settings__credits">
            <div className="settings__credits-card" style={{ minWidth: 200 }}>
              <span className="settings__credits-value" style={{ fontSize: "2rem", display: "flex", alignItems: "center", gap: 8 }}>
                <IconBolt />
                {loading ? "..." : <CreditTickDown value={credits?.credits || 0} />}
              </span>
              <span className="settings__credits-label">Available credits</span>
            </div>
            <div className="settings__credits-card">
              <span className="settings__credits-value">{credits?.plan || "free"}</span>
              <span className="settings__credits-label">Current plan</span>
            </div>
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <h4 style={{ fontSize: "0.9rem", marginBottom: "0.75rem", color: "rgba(242,242,247,0.7)" }}>Top up credits</h4>
            <div className="packs" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
              {CREDIT_PACKS.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="bezel pack"
                  style={{ padding: "1rem" }}
                >
                  <div className="pack__row" style={{ justifyContent: "space-between" }}>
                    <span className="pack__name">{p.name}</span>
                    <span className="pack__price">{p.price}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: "0.5rem", width: "100%" }} onClick={() => handleTopup(p.id)}>
                    Buy
                    <span className="btn__icon"><IconArrowUpRight /></span>
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="settings__section">
          <h3>Subscription</h3>
          {subscription?.url ? (
            <a href={subscription.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
              Manage subscription
              <span className="btn__icon"><IconArrowUpRight /></span>
            </a>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "rgba(242,242,247,0.4)" }}>
              You're on the free plan. <a href="/pricing" style={{ color: "#FF1B6B" }}>Upgrade to get more credits.</a>
            </p>
          )}
        </div>

        {/* API Keys */}
        <div className="settings__section">
          <h3>API Keys</h3>
          <p className="settings__hint">Use these keys to access Helmies Studio programmatically via the REST API.</p>

          <div className="settings__add-key">
            <input className="field-input" placeholder="Key name (e.g. My App)" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={createKey} disabled={!newKeyName.trim()}>Create Key</button>
          </div>

          {newKey && (
            <div className="settings__key-reveal">
              <p>Your API key (shown only once):</p>
              <code>{newKey}</code>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(newKey)}>Copy</button>
            </div>
          )}

          <div className="settings__keys-list">
            {keys.map((k) => (
              <div key={k.id} className="settings__key">
                <div>
                  <strong>{k.name}</strong>
                  <span className="settings__key-prefix">{k.keyPrefix}</span>
                </div>
                <div className="settings__key-meta">
                  <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                  {k.lastUsedAt && <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  <span className={`admin__badge ${k.isActive ? "enabled" : "disabled"}`}>{k.isActive ? "Active" : "Revoked"}</span>
                </div>
                <button className="btn-ghost" onClick={() => deleteKey(k.id)}>Revoke</button>
              </div>
            ))}
            {keys.length === 0 && <p className="admin__empty">No API keys yet.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
