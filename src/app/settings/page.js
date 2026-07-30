"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import UniverseNav from "@/components/studio/universe/UniverseNav";
import CreditTickDown from "@/components/CreditTickDown";
import { IconBolt, IconArrowUpRight } from "@/components/Icons";
import { CREDIT_PACKS, getCreditPackPriceId } from "@/lib/credit-packs";

export default function SettingsPage() {
  const { data: session } = useSession();
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
    const priceId = getCreditPackPriceId(packId);
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
      // silently fail
    }
  };

  return (
    <div className="universe-page-shell">
      <UniverseNav />
      <div className="universe-page-shell__content">
        {/* Header */}
        <div className="universe-section__header">
          <div>
            <div className="universe-section__label">Account</div>
            <h1>Settings</h1>
            <p>{session?.user?.email || "Manage your account, credits, and API keys."}</p>
          </div>
        </div>

        {/* Credits */}
        <div className="universe-section">
          <h3>Credits & Plan</h3>
          <div className="universe-stats">
            <div className="universe-stat">
              <span className="universe-stat__value">
                <IconBolt />
                {loading ? "..." : <CreditTickDown value={credits?.credits || 0} />}
              </span>
              <span className="universe-stat__label">Available credits</span>
            </div>
            <div className="universe-stat">
              <span className="universe-stat__value">{credits?.plan || "free"}</span>
              <span className="universe-stat__label">Current plan</span>
            </div>
          </div>

          <h4>Top up</h4>
          <div className="universe-stats" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
            {CREDIT_PACKS.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="universe-stat"
              >
                <span className="universe-stat__value" style={{ fontSize: "1.05rem" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-display)", display: "block", margin: "4px 0" }}>
                  {p.price}
                </span>
                <button
                  className="universe-plan__cta"
                  style={{ marginTop: 8 }}
                  onClick={() => handleTopup(p.id)}
                >
                  Buy credits
                  <IconArrowUpRight style={{ width: 10, marginLeft: 4, display: "inline" }} />
                </button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Subscription */}
        <div className="universe-section">
          <h3>Subscription</h3>
          <p>Manage your subscription plan.</p>
          {subscription?.url ? (
            <a href={subscription.url} target="_blank" rel="noopener noreferrer" className="universe-plan__cta" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Manage subscription
              <IconArrowUpRight />
            </a>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "#aa91a0" }}>
              You&apos;re on the free plan.{" "}
              <a href="/pricing" style={{ color: "#ff416f" }}>Upgrade to get more credits.</a>
            </p>
          )}
        </div>

        {/* API Keys */}
        <div className="universe-section">
          <h3>API Keys</h3>
          <p>Use these keys to access Helmies Studio programmatically via the REST API.</p>

          <div className="universe-key__add">
            <input
              placeholder="Key name (e.g. My App)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createKey()}
            />
            <button className="universe-plan__cta" style={{ width: "auto" }} onClick={createKey} disabled={!newKeyName.trim()}>
              Create key
            </button>
          </div>

          {newKey && (
            <div className="universe-key__reveal">
              <p>Your API key (shown only once):</p>
              <code>{newKey}</code>
              <button className="universe-plan__cta" style={{ width: "auto", padding: "6px 14px", fontSize: ".75rem" }} onClick={() => navigator.clipboard.writeText(newKey)}>
                Copy
              </button>
            </div>
          )}

          {keys.length === 0 ? (
            <div className="universe-empty">No API keys created yet.</div>
          ) : (
            keys.map((k) => (
              <div key={k.id} className="universe-key__item">
                <div>
                  <strong>{k.name}</strong>
                  <span>{k.keyPrefix}</span>
                </div>
                <div className="universe-key__meta">
                  <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                  {k.lastUsedAt && <span>· Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                  <span style={{ color: k.isActive ? "#65dca6" : "#ff6b6b" }}>{k.isActive ? "Active" : "Revoked"}</span>
                </div>
                <button className="universe-pill" style={{ color: "#ff6b6b", borderColor: "rgba(255,107,107,.22)" }} onClick={() => deleteKey(k.id)}>
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
