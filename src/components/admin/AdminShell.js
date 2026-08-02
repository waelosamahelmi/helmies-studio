"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN SHELL
   ──────────────────────────────────────────────────────────────────────────
   A section rail and one panel at a time. The section lives in ?section=…
   so a link to a specific screen can be pasted into a message.

   The rail is only rendered for an actual admin. Firing admin fetches as a
   signed-out visitor would trip the 401 handler in client-fetch and throw
   the sign-in modal over the page thirteen times.
   ══════════════════════════════════════════════════════════════════════════ */

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Navbar from "@/components/Navbar";
import {
  IcAlert, IcArchive, IcBolt, IcClock, IcGrid, IcHistory, IcInfo, IcLayers,
  IcLock, IcMegaphone, IcPersona, IcSettings, IcShield, IcSpark, IcSwap, IcText,
} from "@/components/studio/kit/Icons";

import OverviewDashboard from "./OverviewDashboard";
import ModelManager from "./ModelManager";
import PlanEditor from "./PlanEditor";
import PromoManager from "./PromoManager";
import CmsEditor from "./CmsEditor";
import MetricsPanel from "./MetricsPanel";
import OpsPanel from "./OpsPanel";
import {
  AnnouncementsPanel, AuditPanel, FlagsPanel, JobsPanel,
  ProviderHealthPanel, RefundsPanel, UsersPanel,
} from "./AdminPanel";

const SECTIONS = [
  { id: "overview",      label: "Overview",        icon: IcGrid },
  { id: "metrics",       label: "Metrics",         icon: IcInfo },
  { id: "ops",           label: "Operator controls", icon: IcAlert },
  { id: "users",         label: "Users",           icon: IcPersona },
  { id: "models",        label: "Models",          icon: IcLayers },
  { id: "pricing",       label: "Plans",           icon: IcBolt },
  { id: "packs",         label: "Credit packs",    icon: IcArchive },
  { id: "promos",        label: "Promo codes",     icon: IcSpark },
  { id: "jobs",          label: "Jobs",            icon: IcClock },
  { id: "refunds",       label: "Refunds",         icon: IcSwap },
  { id: "health",        label: "Provider health", icon: IcShield },
  { id: "audit",         label: "Audit log",       icon: IcHistory },
  { id: "cms",           label: "CMS content",     icon: IcText },
  { id: "flags",         label: "Feature flags",   icon: IcSettings },
  { id: "announcements", label: "Announcements",   icon: IcMegaphone },
];

function View({ section }) {
  switch (section) {
    case "metrics":       return <MetricsPanel />;
    case "ops":           return <OpsPanel />;
    case "users":         return <UsersPanel />;
    case "models":        return <ModelManager />;
    case "pricing":       return <PlanEditor type="plans" />;
    case "packs":         return <PlanEditor type="credit-packs" />;
    case "promos":        return <PromoManager />;
    case "jobs":          return <JobsPanel />;
    case "refunds":       return <RefundsPanel />;
    case "health":        return <ProviderHealthPanel />;
    case "audit":         return <AuditPanel />;
    case "cms":           return <CmsEditor />;
    case "flags":         return <FlagsPanel />;
    case "announcements": return <AnnouncementsPanel />;
    default:              return <OverviewDashboard />;
  }
}

function Gate({ children }) {
  return (
    <main className="pg-status">
      <div className="pg-status__in">{children}</div>
    </main>
  );
}

function Admin() {
  const params = useSearchParams();
  const raw = params.get("section") || "overview";
  const section = SECTIONS.some((s) => s.id === raw) ? raw : "overview";
  const current = SECTIONS.find((s) => s.id === section);

  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <>
        <Navbar />
        <div className="pg-admin">
          <div className="pg-admin__side" aria-hidden="true">
            <div className="hs-skel" style={{ height: 180, width: "100%" }} />
          </div>
          <div className="pg-admin__main" aria-busy="true">
            <span className="hs-sr">Checking your access</span>
            <div className="hs-skel" style={{ height: 40, width: 220, marginBottom: "var(--s-6)" }} />
            <div className="hs-skel" style={{ height: 220 }} />
          </div>
        </div>
      </>
    );
  }

  if (!session?.user) {
    return (
      <>
        <Navbar />
        <Gate>
          <span className="hs-empty__mark"><IcLock /></span>
          <h1>Sign in first</h1>
          <p>The admin console is behind an account. Sign in and come back to this address.</p>
          <Link href="/login?callbackUrl=%2Fadmin" className="hs-btn hs-btn--primary">Sign in</Link>
        </Gate>
      </>
    );
  }

  if (session.user.role !== "admin") {
    return (
      <>
        <Navbar />
        <Gate>
          <span className="hs-empty__mark"><IcShield /></span>
          <h1>Not your console</h1>
          <p>
            This account does not carry the admin role, so none of these screens would load.
            If that is wrong, ask an existing admin to change it under Users.
          </p>
          <Link href="/studio" className="hs-btn hs-btn--primary">Back to the studio</Link>
        </Gate>
      </>
    );
  }

  return (
    <>
      <a className="hs-skip" href="#admin-main">Skip to content</a>
      <Navbar />

      <div className="pg-admin">
        <nav className="pg-admin__side" aria-label="Admin sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={`/admin?section=${id}`}
              scroll={false}
              className="pg-tab"
              aria-current={section === id ? "page" : undefined}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>

        <main className="pg-admin__main" id="admin-main">
          <header style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
            <span className="hs-eyebrow">Admin · {current.label}</span>
            <h1 style={{ fontSize: "var(--t-2xl)" }}>{current.label}</h1>
          </header>

          <View section={section} />
        </main>
      </div>
    </>
  );
}

export default function AdminShell() {
  return (
    <Suspense
      fallback={
        <div className="pg-admin" aria-busy="true">
          <div className="pg-admin__side" />
          <div className="pg-admin__main">
            <div className="hs-skel" style={{ height: 40, width: 220, marginBottom: "var(--s-6)" }} />
            <div className="hs-skel" style={{ height: 220 }} />
          </div>
        </div>
      }
    >
      <Admin />
    </Suspense>
  );
}
