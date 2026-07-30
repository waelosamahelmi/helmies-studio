"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import CreditTickDown from "@/components/CreditTickDown";
import { IconBolt, IconArrowUpRight } from "@/components/Icons";
import { CREDIT_PACKS, getCreditPackPriceId } from "@/lib/credit-packs";

const EASE = [0.32, 0.72, 0, 1];

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    period: "/month",
    credits: "50 credits/mo",
    features: ["Community models", "Standard resolution", "Single generation"],
  },
  {
    id: "starter",
    name: "Starter",
    price: "€12",
    period: "/month",
    credits: "300 credits/mo",
    features: ["All image models", "4K resolution", "Priority queue", "API access"],
  },
  {
    id: "studio",
    name: "Studio",
    price: "€29",
    period: "/month",
    credits: "900 credits/mo",
    features: ["All models + video", "8K resolution", "Fast queue", "Full API", "Brand kits"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "€79",
    period: "/month",
    credits: "3,000 credits/mo",
    features: ["Everything unlimited", "Custom models", "Dedicated GPU", "White-label API", "Priority support"],
  },
];

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "generation", label: "Generation defaults" },
  { id: "api-keys", label: "API keys" },
  { id: "notifications", label: "Notifications" },
  { id: "security", label: "Security" },
  { id: "billing", label: "Billing" },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "profile");

  // Sync tab from URL
  useEffect(() => {
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  // ── Data ──
  const [keys, setKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState(null);
  const [credits, setCredits] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [imageQuality, setImageQuality] = useState("high");
  const [approvalMode, setApprovalMode] = useState("auto");

  const loadKeys = useCallback(() => {
    fetch("/api/user/keys").then((r) => r.json()).then(setKeys).catch(() => {});
  }, []);

  const loadCredits = useCallback(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => {
        setCredits(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadSubscription = useCallback(() => {
    fetch("/api/stripe/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ return_url: "/settings" }),
    })
      .then((r) => r.json())
      .then(setSubscription)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadKeys();
    loadCredits();
    loadSubscription();
    // Load profile
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => {
        setDisplayName(d.name || "");
        setEmail(d.email || "");
      })
      .catch(() => {});
  }, [loadKeys, loadCredits, loadSubscription]);

  // ── API Keys ──
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

  // ── Top-up ──
  const handleTopup = async (packId) => {
    const priceId = getCreditPackPriceId(packId);
    if (!priceId) {
      alert("Credit pack not configured yet.");
      return;
    }
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

  const handleUpgrade = async (planId) => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      // silently fail
    }
  };

  // ── Save profile ──
  const handleSaveProfile = async () => {
    await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    });
  };

  const currentPlan = credits?.plan || "free";

  return (
    <>
      <Navbar />
      <div className="v6-page-content">
        {/* Page Head */}
        <div className="v6-page-head">
          <div>
            <p className="v6-eyebrow">Account</p>
            <h1>Settings</h1>
          </div>
          <button className="v6-btn v6-primary" onClick={handleSaveProfile}>
            Save changes
          </button>
        </div>

        {/* Settings Grid */}
        <div className="v6-settings-grid">
          {/* Nav */}
          <nav className="v6-settings-nav">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "v6-active" : ""}
                onClick={() => switchTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Form Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="v6-settings-form"
          >
            {/* ── Profile ── */}
            {activeTab === "profile" && (
              <div className="v6-settings-block">
                <h3>Profile</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="v6-field">
                    <label className="v6-field-label">Display name</label>
                    <input
                      className="v6-input"
                      placeholder="Your name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <div className="v6-field">
                    <label className="v6-field-label">Email</label>
                    <input className="v6-input" value={email} disabled />
                    <span className="v6-tiny v6-muted">Email changes are handled via account security.</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Generation defaults ── */}
            {activeTab === "generation" && (
              <div className="v6-settings-block">
                <h3>Generation defaults</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  <div className="v6-field">
                    <label className="v6-field-label">Default image quality</label>
                    <div className="v6-select-wrap">
                      <select
                        className="v6-input v6-select"
                        value={imageQuality}
                        onChange={(e) => setImageQuality(e.target.value)}
                      >
                        <option value="standard">Standard</option>
                        <option value="high">High</option>
                        <option value="ultra">Ultra (4K)</option>
                      </select>
                      <svg className="v6-icon" viewBox="0 0 24 24">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                  <div className="v6-field">
                    <label className="v6-field-label">Generation approval mode</label>
                    <div className="v6-segmented">
                      <button
                        className={approvalMode === "auto" ? "v6-active" : ""}
                        onClick={() => setApprovalMode("auto")}
                      >
                        Auto-approve
                      </button>
                      <button
                        className={approvalMode === "review" ? "v6-active" : ""}
                        onClick={() => setApprovalMode("review")}
                      >
                        Review first
                      </button>
                    </div>
                    <span className="v6-tiny v6-muted">
                      Auto-approve runs generations immediately. Review lets you inspect before finalizing.
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── API Keys ── */}
            {activeTab === "api-keys" && (
              <div className="v6-settings-block">
                <h3>API Keys</h3>
                <p className="v6-tiny v6-muted" style={{ marginBottom: 12 }}>
                  Use these keys to access Helmies Studio programmatically via the REST API.
                </p>

                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <input
                    className="v6-input"
                    placeholder="Key name (e.g. My App)"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createKey()}
                  />
                  <button
                    className="v6-btn v6-primary v6-sm"
                    onClick={createKey}
                    disabled={!newKeyName.trim()}
                  >
                    Create Key
                  </button>
                </div>

                {newKey && (
                  <div className="v6-quote" style={{ marginBottom: 14 }}>
                    <div className="v6-quote-row">
                      <span>Your API key (shown only once):</span>
                    </div>
                    <code
                      style={{
                        fontFamily: "var(--v6-mono)",
                        fontSize: 10,
                        wordBreak: "break-all",
                        background: "rgba(0,0,0,0.3)",
                        padding: "8px 10px",
                        borderRadius: 8,
                        display: "block",
                      }}
                    >
                      {newKey}
                    </code>
                    <button
                      className="v6-btn v6-sm"
                      onClick={() => navigator.clipboard.writeText(newKey)}
                    >
                      Copy
                    </button>
                  </div>
                )}

                {keys.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {keys.map((k) => (
                      <div key={k.id} className="v6-quote">
                        <div className="v6-quote-row">
                          <strong>{k.name}</strong>
                          <span className="v6-mono v6-tiny v6-muted">{k.keyPrefix}</span>
                        </div>
                        <div className="v6-quote-row">
                          <span className="v6-tiny v6-muted">
                            Created {new Date(k.createdAt).toLocaleDateString()}
                            {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                          </span>
                          <span
                            className="v6-status"
                            style={k.isActive ? {} : { color: "var(--v6-bad)" }}
                          >
                            {k.isActive ? "Active" : "Revoked"}
                          </span>
                        </div>
                        <button
                          className="v6-btn v6-ghost v6-sm"
                          onClick={() => deleteKey(k.id)}
                          style={{ alignSelf: "flex-start", marginTop: 4 }}
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="v6-tiny v6-muted">No API keys yet.</p>
                )}
              </div>
            )}

            {/* ── Notifications ── */}
            {activeTab === "notifications" && (
              <div className="v6-settings-block">
                <h3>Notifications</h3>
                <p className="v6-tiny v6-muted" style={{ marginBottom: 14 }}>
                  Configure how you receive updates about your generations and account.
                </p>
                <div style={{ display: "grid", gap: 12 }}>
                  {[
                    { label: "Generation completed", key: "gen_complete" },
                    { label: "Generation failed", key: "gen_failed" },
                    { label: "Credits low warning", key: "credits_low" },
                    { label: "New model available", key: "new_model" },
                    { label: "Billing reminders", key: "billing_reminder" },
                  ].map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                      }}
                    >
                      <span style={{ fontSize: 12 }}>{item.label}</span>
                      <label
                        style={{
                          position: "relative",
                          display: "inline-block",
                          width: 36,
                          height: 20,
                        }}
                      >
                        <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                        <span
                          style={{
                            position: "absolute",
                            cursor: "pointer",
                            inset: 0,
                            background: "var(--v6-accent)",
                            borderRadius: 99,
                            transition: "0.2s",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              height: 14,
                              width: 14,
                              left: 3,
                              bottom: 3,
                              background: "#fff",
                              borderRadius: "50%",
                              transition: "0.2s",
                            }}
                          />
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Security ── */}
            {activeTab === "security" && (
              <div className="v6-settings-block">
                <h3>Security</h3>
                <div style={{ display: "grid", gap: 16 }}>
                  <div className="v6-field">
                    <label className="v6-field-label">Change password</label>
                    <input className="v6-input" type="password" placeholder="Current password" />
                    <input className="v6-input" type="password" placeholder="New password" style={{ marginTop: 8 }} />
                    <button className="v6-btn v6-sm" style={{ marginTop: 8 }}>
                      Update password
                    </button>
                  </div>
                  <div className="v6-section-rule" />
                  <div className="v6-field">
                    <label className="v6-field-label">Two-factor authentication</label>
                    <p className="v6-tiny v6-muted" style={{ marginBottom: 8 }}>
                      Add an extra layer of security to your account.
                    </p>
                    <button className="v6-btn v6-sm">Enable 2FA</button>
                  </div>
                  <div className="v6-section-rule" />
                  <div className="v6-field">
                    <label className="v6-field-label">Active sessions</label>
                    <p className="v6-tiny v6-muted" style={{ marginBottom: 8 }}>
                      You are currently signed in on this device.
                    </p>
                    <button className="v6-btn v6-ghost v6-sm" style={{ color: "var(--v6-bad)" }}>
                      Sign out all devices
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Billing ── */}
            {activeTab === "billing" && (
              <>
                {/* Metric grid */}
                <div className="v6-metric-grid">
                  <div className="v6-metric">
                    <span className="v6-eyebrow">Available credits</span>
                    <strong>
                      {loading ? "…" : <CreditTickDown value={credits?.credits || 0} />}
                    </strong>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow">Reserved</span>
                    <strong>{credits?.reserved || 0}</strong>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow">Used this month</span>
                    <strong>{credits?.usedThisMonth || 0}</strong>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow">Next renewal</span>
                    <strong style={{ fontSize: 14 }}>
                      {credits?.nextRenewal
                        ? new Date(credits.nextRenewal).toLocaleDateString()
                        : "—"}
                    </strong>
                  </div>
                </div>

                {/* Current plan */}
                <div className="v6-settings-block">
                  <h3>Your plan</h3>
                  <div className="v6-plan-grid">
                    {PLANS.map((plan) => {
                      const isCurrent = plan.id === currentPlan;
                      return (
                        <div key={plan.id} className={`v6-plan ${isCurrent ? "v6-current" : ""}`}>
                          <h3>{plan.name}</h3>
                          <div className="v6-price">
                            {plan.price}
                            <small>{plan.period}</small>
                          </div>
                          <p className="v6-mono v6-tiny" style={{ marginTop: 4 }}>
                            {plan.credits}
                          </p>
                          <ul style={{ margin: "10px 0 0", padding: "0 0 0 16px", fontSize: 11, color: "var(--v6-muted)", display: "grid", gap: 4 }}>
                            {plan.features.map((f) => (
                              <li key={f}>{f}</li>
                            ))}
                          </ul>
                          {isCurrent ? (
                            <div
                              style={{
                                marginTop: 12,
                                padding: "6px 10px",
                                background: "color-mix(in srgb, var(--v6-accent), transparent 88%)",
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 700,
                                color: "var(--v6-accent)",
                                textAlign: "center",
                              }}
                            >
                              Current plan
                            </div>
                          ) : plan.id !== "free" ? (
                            <button
                              className="v6-btn v6-primary v6-sm"
                              style={{ marginTop: 12, width: "100%" }}
                              onClick={() => handleUpgrade(plan.id)}
                            >
                              Upgrade
                              <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                <line x1="7" y1="17" x2="17" y2="7" />
                                <polyline points="7 7 17 7 17 17" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top-up packs */}
                <div className="v6-settings-block">
                  <h3>Top up credits</h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {CREDIT_PACKS.map((p) => (
                      <div
                        key={p.id}
                        className="v6-quote"
                        style={{ padding: 14 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <strong style={{ fontSize: 13 }}>{p.name}</strong>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--v6-text)" }}>
                            {p.price}
                          </span>
                        </div>
                        <p className="v6-tiny v6-muted" style={{ marginBottom: 10 }}>
                          {p.pricePerCredit}
                        </p>
                        <button
                          className="v6-btn v6-sm"
                          style={{ width: "100%", justifyContent: "center" }}
                          onClick={() => handleTopup(p.id)}
                        >
                          Buy
                          <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                            <line x1="7" y1="17" x2="17" y2="7" />
                            <polyline points="7 7 17 7 17 17" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment method */}
                <div className="v6-settings-block">
                  <h3>Payment method</h3>
                  {subscription?.url ? (
                    <a
                      href={subscription.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="v6-btn"
                      style={{ textDecoration: "none" }}
                    >
                      Manage subscription
                      <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                      </svg>
                    </a>
                  ) : (
                    <p className="v6-tiny v6-muted">
                      You&apos;re on the free plan.{" "}
                      <a href="/pricing" style={{ color: "var(--v6-accent)" }}>
                        Upgrade to get more credits.
                      </a>
                    </p>
                  )}
                </div>

                {/* Credit activity */}
                <div className="v6-settings-block">
                  <h3>Credit activity</h3>
                  <div style={{ overflow: "auto" }}>
                    <table className="v6-data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(credits?.ledger || []).slice(0, 20).map((entry, i) => (
                          <tr key={i}>
                            <td className="v6-mono v6-tiny">
                              {entry.createdAt
                                ? new Date(entry.createdAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td>{entry.description || entry.type || "—"}</td>
                            <td
                              style={{
                                color:
                                  entry.amount > 0
                                    ? "var(--v6-good)"
                                    : "var(--v6-bad)",
                              }}
                            >
                              {entry.amount > 0 ? "+" : ""}
                              {entry.amount || 0}
                            </td>
                            <td>{entry.balance ?? "—"}</td>
                          </tr>
                        ))}
                        {(!credits?.ledger || credits.ledger.length === 0) && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: "center", color: "var(--v6-muted)" }}>
                              No activity yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}
