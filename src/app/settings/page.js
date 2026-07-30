"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import CreditTickDown from "@/components/CreditTickDown";
import { IconBolt, IconArrowUpRight } from "@/components/Icons";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import toast from "react-hot-toast";
import { useIsMobile } from "@/lib/use-media-query";
import { MobileChipScroller } from "@/components/studio/mobile";

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
  const isMobile = useIsMobile();
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
  const [billingYearly, setBillingYearly] = useState(false);

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
    try {
      const res = await fetch("/api/stripe/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
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
        body: JSON.stringify({ plan: planId, yearly: billingYearly }),
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
    toast.success("Profile saved");
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
          {isMobile ? (
            <div style={{ marginBottom: 16 }}>
              <MobileChipScroller
                items={TABS.map((t) => ({ label: t.label, value: t.id }))}
                selectedValue={activeTab}
                onSelect={switchTab}
              />
            </div>
          ) : (
          <nav className="v6-settings-nav" style={{ position: "relative" }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={isActive ? "v6-active" : ""}
                  onClick={() => switchTab(tab.id)}
                  style={{
                    borderLeft: isActive ? "2px solid var(--v6-accent)" : "2px solid transparent",
                    borderRadius: isActive ? "0 9px 9px 0" : "9px",
                    paddingLeft: isActive ? 12 : 14,
                    transition: "all 0.2s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          )}

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
                <div style={{ display: "grid", gap: 16 }}>
                  {/* Avatar preview */}
                  <div className="v6-field">
                    <label className="v6-field-label">Avatar</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--v6-accent), #7C3AED)",
                        display: "grid", placeItems: "center",
                        fontSize: 24, fontWeight: 700, color: "#fff",
                        border: "2px solid var(--v6-line)",
                      }}>
                        {(displayName || email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <button className="v6-btn v6-sm" disabled>Upload photo</button>
                        <p className="v6-tiny v6-muted" style={{ marginTop: 4 }}>JPG, PNG, GIF up to 2MB</p>
                      </div>
                    </div>
                  </div>
                  <div className="v6-section-rule" />
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
                  <div>
                    <button className="v6-btn v6-primary v6-sm" onClick={handleSaveProfile}>
                      Save Profile
                    </button>
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
                    <label className="v6-field-label">Default model</label>
                    <div className="v6-select-wrap">
                      <select className="v6-input v6-select" defaultValue="flux-dev">
                        <option value="flux-dev">Flux Dev (Recommended)</option>
                        <option value="flux-pro">Flux Pro</option>
                        <option value="flux-schnell">Flux Schnell</option>
                        <option value="sdxl">SDXL</option>
                      </select>
                      <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                    <span className="v6-tiny v6-muted">Your default model for new generations.</span>
                  </div>
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
                      <svg className="v6-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                  </div>
                  <div className="v6-field">
                    <label className="v6-field-label">Generation approval mode</label>
                    <div className="v6-segmented">
                      <button className={approvalMode === "auto" ? "v6-active" : ""} onClick={() => setApprovalMode("auto")}>Auto-approve</button>
                      <button className={approvalMode === "review" ? "v6-active" : ""} onClick={() => setApprovalMode("review")}>Review first</button>
                    </div>
                    <span className="v6-tiny v6-muted">
                      {approvalMode === "auto" ? "Runs generations immediately after prompting." : "Lets you inspect generated output before finalizing."}
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
                    className="v6-btn v6-primary"
                    onClick={createKey}
                    disabled={!newKeyName.trim()}
                  >
                    + Create Key
                  </button>
                </div>

                {newKey && (
                  <div className="v6-quote" style={{ marginBottom: 14, borderColor: "var(--v6-good)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--v6-good)" }}>Key created</span>
                      <span className="v6-tiny v6-muted">Copy it now — it won't be shown again</span>
                    </div>
                    <code style={{ fontFamily: "var(--v6-mono)", fontSize: 10, wordBreak: "break-all", background: "rgba(0,0,0,0.3)", padding: "10px 12px", borderRadius: 8, display: "block", marginBottom: 8 }}>{newKey}</code>
                    <button className="v6-btn v6-sm" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Key copied"); }}>
                      Copy to clipboard
                    </button>
                  </div>
                )}

                {keys.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {keys.map((k) => (
                      <div key={k.id} className="v6-quote" style={{ padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <strong style={{ fontSize: 12 }}>{k.name}</strong>
                            {!isMobile && (
                              <div className="v6-mono v6-tiny v6-muted" style={{ marginTop: 2 }}>
                                {k.keyPrefix || "••••••••"}****************
                              </div>
                            )}
                          </div>
                          <span className={`v6-chip ${k.isActive ? "" : "v6-disabled"}`} style={{ fontSize: 9, padding: "2px 7px", background: k.isActive ? "var(--v6-good)" : undefined, color: k.isActive ? "var(--v6-bg)" : undefined, borderColor: k.isActive ? "var(--v6-good)" : undefined }}>
                            {k.isActive ? "Active" : "Revoked"}
                          </span>
                        </div>
                        {isMobile ? (
                          <div style={{ display: "flex", justifyContent: "flex-start", gap: 6 }}>
                            <button className="v6-btn v6-sm" onClick={() => { navigator.clipboard.writeText(k.keyPrefix || ""); toast.success("Prefix copied"); }} disabled={!k.keyPrefix}>Copy</button>
                            <button className="v6-btn v6-sm" onClick={() => deleteKey(k.id)} style={{ color: "var(--v6-bad)", borderColor: "var(--v6-bad)" }}>Revoke</button>
                          </div>
                        ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="v6-tiny v6-muted">
                            Created {new Date(k.createdAt).toLocaleDateString()}
                            {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="v6-btn v6-sm" onClick={() => { navigator.clipboard.writeText(k.keyPrefix || ""); toast.success("Prefix copied"); }} disabled={!k.keyPrefix}>Copy</button>
                            <button className="v6-btn v6-sm" onClick={() => deleteKey(k.id)} style={{ color: "var(--v6-bad)", borderColor: "var(--v6-bad)" }}>Revoke</button>
                          </div>
                        </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="v6-tiny v6-muted">No API keys yet. Create one to access the API.</p>
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
                <div style={{ display: "grid", gap: 4 }}>
                  {[
                    { label: "Generation completed", desc: "When an image or video finishes processing", key: "gen_complete" },
                    { label: "Generation failed", desc: "When a generation encounters an error", key: "gen_failed" },
                    { label: "Credits low warning", desc: "When your balance drops below 50 credits", key: "credits_low" },
                    { label: "New model available", desc: "When a new AI model is added to the platform", key: "new_model" },
                    { label: "Billing reminders", desc: "Upcoming renewal or payment notifications", key: "billing_reminder" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      className="v6-toggle"
                      style={{ border: "1px solid var(--v6-line)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                    >
                      <div className="v6-toggle-track v6-on">
                        <div className="v6-toggle-thumb" />
                      </div>
                      <div>
                        <span className="v6-toggle-label" style={{ display: "block" }}>{item.label}</span>
                        <span style={{ fontSize: 9, color: "var(--v6-muted)" }}>{item.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Security ── */}
            {activeTab === "security" && (
              <div style={{ display: "grid", gap: 16 }}>
                <div className="v6-settings-block">
                  <h3>Change password</h3>
                  <div style={{ display: "grid", gap: 10 }}>
                    <input className="v6-input" type="password" placeholder="Current password" />
                    <input className="v6-input" type="password" placeholder="New password" />
                    <input className="v6-input" type="password" placeholder="Confirm new password" />
                    <button className="v6-btn v6-primary v6-sm" style={{ justifySelf: "flex-start" }}>Update password</button>
                  </div>
                </div>
                <div className="v6-settings-block">
                  <h3>Two-factor authentication</h3>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Protect your account</p>
                      <p className="v6-tiny v6-muted" style={{ margin: "4px 0 0" }}>
                        Add an extra layer of security with authenticator app verification.
                      </p>
                    </div>
                    <button className="v6-btn v6-primary v6-sm" disabled>Enable 2FA</button>
                  </div>
                </div>
                <div className="v6-settings-block">
                  <h3>Active sessions</h3>
                  <div className="v6-quote" style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: "50%", background: "var(--v6-good)",
                          boxShadow: "0 0 8px var(--v6-good)", flexShrink: 0,
                        }} />
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700 }}>Current device</div>
                          <div className="v6-tiny v6-muted">Windows · {new Date().toLocaleDateString()}</div>
                        </div>
                      </div>
                      <span className="v6-chip v6-active" style={{ fontSize: 9, padding: "2px 6px" }}>Active</span>
                    </div>
                  </div>
                  <button className="v6-btn v6-sm" style={{ marginTop: 10, color: "var(--v6-bad)", borderColor: "var(--v6-bad)" }}>
                    Sign out all devices
                  </button>
                </div>
              </div>
            )}

            {/* ── Billing ── */}
            {activeTab === "billing" && (
              <>
                {/* Metric grid — with usage bars */}
                <div className="v6-metric-grid">
                  <div className="v6-metric">
                    <span className="v6-eyebrow" style={{ display: "block" }}>Available credits</span>
                    <strong>
                      {loading ? "…" : <CreditTickDown value={credits?.credits || 0} />}
                    </strong>
                    <div className="v6-timeline-bar" style={{ marginTop: 10 }}>
                      <div className="v6-timeline-track">
                        <div className="v6-timeline-fill" style={{
                          width: `${Math.min(100, ((credits?.credits || 0) / Math.max(1, (credits?.credits || 0) + (credits?.reserved || 0))) * 100)}%`,
                        }} />
                      </div>
                      <span className="v6-timeline-label">{credits?.reserved || 0} reserved</span>
                    </div>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow" style={{ display: "block" }}>Reserved</span>
                    <strong>{credits?.reserved || 0}</strong>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow" style={{ display: "block" }}>Used this month</span>
                    <strong>{credits?.usedThisMonth || 0}</strong>
                  </div>
                  <div className="v6-metric">
                    <span className="v6-eyebrow" style={{ display: "block" }}>Next renewal</span>
                    <strong style={{ fontSize: 14 }}>
                      {credits?.nextRenewal
                        ? new Date(credits.nextRenewal).toLocaleDateString()
                        : "—"}
                    </strong>
                  </div>
                </div>

                {/* Current plan — with checkmarks */}
                <div className="v6-settings-block">
                  <h3>Your plan</h3>
                  <div className="v6-plan-grid">
                    {PLANS.map((plan) => {
                      const isCurrent = plan.id === currentPlan;
                      return (
                        <div key={plan.id} className={`v6-plan ${isCurrent ? "v6-current" : ""}`} style={{ display: "flex", flexDirection: "column" }}>
                          <h3>{plan.name}</h3>
                          <div className="v6-price">{plan.price}<small>{plan.period}</small></div>
                          <p className="v6-mono v6-tiny" style={{ marginTop: 4 }}>{plan.credits}</p>
                          <ul style={{ margin: "10px 0", padding: 0, fontSize: 11, display: "grid", gap: 6, listStyle: "none" }}>
                            {plan.features.map((f) => (
                              <li key={f} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--v6-muted)" }}>
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--v6-good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                  <path d="M4 12l5 5L20 6" />
                                </svg>
                                {f}
                              </li>
                            ))}
                          </ul>
                          <div style={{ marginTop: "auto" }}>
                            {isCurrent ? (
                              <div style={{ padding: "8px 10px", background: "color-mix(in srgb, var(--v6-accent), transparent 88%)", borderRadius: 8, fontSize: 10, fontWeight: 700, color: "var(--v6-accent)", textAlign: "center" }}>
                                Current plan
                              </div>
                            ) : plan.id !== "free" ? (
                              <button className="v6-btn v6-primary v6-sm" style={{ width: "100%" }} onClick={() => handleUpgrade(plan.id)}>
                                Upgrade
                                <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                                  <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Top-up packs — with bonus badges */}
                <div className="v6-settings-block">
                  <h3>Top up credits</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                    {CREDIT_PACKS.map((p) => {
                      const hasBonus = p.name.toLowerCase().includes("pro") || p.name.toLowerCase().includes("studio") || p.name.toLowerCase().includes("mega");
                      return (
                        <div key={p.id} className="v6-quote" style={{ padding: 16, position: "relative" }}>
                          {hasBonus && (
                            <div style={{
                              position: "absolute", top: -1, right: 12,
                              background: "var(--v6-accent)", color: "#fff",
                              fontSize: 8, fontWeight: 800, padding: "2px 8px",
                              borderRadius: "0 0 6px 6px",
                              textTransform: "uppercase", letterSpacing: "0.06em",
                            }}>
                              Best value
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <strong style={{ fontSize: 13 }}>{p.name}</strong>
                            <span style={{ fontSize: 18, fontWeight: 700 }}>{p.price}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                            <IconBolt style={{ width: 14, height: 14, color: "var(--v6-accent)" }} />
                            <span className="v6-mono v6-tiny" style={{ color: "var(--v6-good)" }}>{p.credits} credits</span>
                            {p.bonusCredits > 0 && (
                              <span className="v6-chip v6-active" style={{ fontSize: 8, padding: "1px 5px" }}>+{p.bonusCredits} bonus</span>
                            )}
                          </div>
                          <button
                            className="v6-btn v6-sm"
                            style={{ width: "100%", justifyContent: "center" }}
                            onClick={() => handleTopup(p.id)}
                          >
                            Buy
                            <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                              <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Payment method — card display */}
                <div className="v6-settings-block">
                  <h3>Payment method</h3>
                  {subscription?.url ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div className="v6-quote" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 44, height: 30, borderRadius: 6,
                          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
                          border: "1px solid var(--v6-line)",
                          display: "grid", placeItems: "center",
                        }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: "#fff" }}>VISA</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>Visa ending in 4242</div>
                          <div className="v6-tiny v6-muted">Expires 12/28</div>
                        </div>
                      </div>
                      <a href={subscription.url} target="_blank" rel="noopener noreferrer" className="v6-btn" style={{ textDecoration: "none", justifySelf: "flex-start" }}>
                        Manage subscription
                        <svg className="v6-icon" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                          <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                        </svg>
                      </a>
                    </div>
                  ) : (
                    <p className="v6-tiny v6-muted">
                      You're on the free plan.{" "}
                      <a href="/pricing" style={{ color: "var(--v6-accent)" }}>Upgrade to get more credits.</a>
                    </p>
                  )}
                </div>

                {/* Credit activity — with type badges */}
                <div className="v6-settings-block">
                  <h3>Credit activity</h3>
                  <div style={{ overflow: "auto" }}>
                    <table className="v6-data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          {!isMobile && <th>Description</th>}
                          <th>Amount</th>
                          <th>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(credits?.ledger || []).slice(0, 20).map((entry, i) => {
                          const typeLabel = entry.type || entry.description || "transaction";
                          const typeColor =
                            typeLabel.includes("grant") || typeLabel.includes("purchase") || typeLabel.includes("topup") ? "var(--v6-good)" :
                            typeLabel.includes("refund") ? "var(--v6-accent)" :
                            typeLabel.includes("generat") || typeLabel.includes("spend") ? "var(--v6-warn)" :
                            "var(--v6-muted)";
                          return (
                            <tr key={i}>
                              <td className="v6-mono v6-tiny">
                                {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "—"}
                              </td>
                              <td>
                                <span className="v6-chip" style={{ fontSize: 8, padding: "2px 6px", borderColor: typeColor, color: typeColor }}>
                                  {(entry.type || "transaction").slice(0, 12)}
                                </span>
                              </td>
                              {!isMobile && <td>{entry.description || "—"}</td>}
                              <td style={{ color: entry.amount > 0 ? "var(--v6-good)" : "var(--v6-bad)", fontWeight: 600 }}>
                                {entry.amount > 0 ? "+" : ""}{entry.amount || 0}
                              </td>
                              <td className="v6-mono">{entry.balance ?? "—"}</td>
                            </tr>
                          );
                        })}
                        {(!credits?.ledger || credits.ledger.length === 0) && (
                          <tr>
                            <td colSpan={isMobile ? 4 : 5} style={{ textAlign: "center", color: "var(--v6-muted)", padding: 24 }}>
                              No activity yet. Generate or purchase credits to see your history.
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
