"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { useRouter } from "next/navigation";

const IconBolt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/>
  </svg>
);

const IconCredit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);

const IconKey = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const IconLogout = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export default function PhoneProfile() {
  const router = useRouter();
  const [credits, setCredits] = useState(null);
  const [plan, setPlan] = useState("Free");

  useEffect(() => {
    apiFetch("/api/credits").then(r => r.json()).then(d => setCredits(d.credits)).catch(() => {});
    apiFetch("/api/auth/session").then(r => r.json()).then(d => {
      if (d?.user?.plan) setPlan(d.user.plan);
    }).catch(() => {});
  }, []);

  return (
    <div className="ph-profile">
      {/* Credit balance */}
      <div className="ph-profile-credits">
        <IconBolt />
        <div>
          <div style={{ fontSize: 12, color: "var(--ph-muted)", marginBottom: 2 }}>Credits</div>
          <div className="ph-profile-credit-count">{credits ?? "—"}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span style={{ padding: "4px 10px", borderRadius: 99, background: "var(--ph-surface2)", fontSize: 11, color: "var(--ph-muted)" }}>
            {plan}
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="ph-profile-section">
        <div className="ph-profile-section-title">Quick Actions</div>
        <button className="ph-profile-item" onClick={() => router.push("/pricing")}>
          <IconBolt />
          <span className="ph-profile-item-label">Top up credits</span>
        </button>
        <button className="ph-profile-item" onClick={() => router.push("/settings?tab=billing")}>
          <IconCredit />
          <span className="ph-profile-item-label">Billing</span>
        </button>
        <button className="ph-profile-item" onClick={() => router.push("/settings?tab=api-keys")}>
          <IconKey />
          <span className="ph-profile-item-label">API keys</span>
        </button>
      </div>

      {/* Account */}
      <div className="ph-profile-section">
        <div className="ph-profile-section-title">Account</div>
        <button className="ph-profile-item" onClick={() => router.push("/settings")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span className="ph-profile-item-label">Settings</span>
        </button>
        <button className="ph-profile-item" onClick={() => router.push("/settings?tab=notifications")}>
          <IconBell />
          <span className="ph-profile-item-label">Notifications</span>
        </button>
        <button className="ph-profile-item ph-destructive" onClick={() => router.push("/api/auth/signout")}>
          <IconLogout />
          <span className="ph-profile-item-label">Sign out</span>
        </button>
      </div>
    </div>
  );
}
