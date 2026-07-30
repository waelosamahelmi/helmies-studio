"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/studio/kit/Sheet";
import { byGroup } from "@/components/studio/kit/tools";
import { IcMenu, IcBolt, IcChevronRight } from "@/components/studio/kit/Icons";

const LINKS = [
  { href: "/studio",    label: "Studio" },
  { href: "/models",    label: "Models" },
  { href: "/templates", label: "Templates" },
  { href: "/gallery",   label: "Gallery" },
  { href: "/pricing",   label: "Pricing" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let dead = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => { if (!dead) setSession(d); })
      .catch(() => {});
    return () => { dead = true; };
  }, [pathname]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const authed = !!session?.user;
  const admin = session?.user?.role === "admin";
  const groups = byGroup();

  return (
    <>
      <header className={`pg-nav${stuck ? " is-stuck" : ""}`}>
        <nav className="pg-nav__in" aria-label="Main">
          <Link href="/" className="pg-logo" aria-label="Helmies Studio home">
            <img src="/ico.svg" alt="" width={24} height={24} />
            <strong>Helmies</strong>
            <span>Studio</span>
          </Link>

          <div className="pg-nav__links">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="pg-nav__link"
                aria-current={pathname === l.href || pathname?.startsWith(`${l.href}/`) ? "page" : undefined}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="pg-nav__actions">
            {admin && (
              <Link href="/admin" className="pg-nav__link pg-nav__desk" style={{ color: "var(--filament-lit)" }}>
                Admin
              </Link>
            )}

            {authed ? (
              <>
                <Link href="/settings" className="pg-nav__link pg-nav__desk">Account</Link>
                <Link href="/studio" className="hs-btn hs-btn--primary hs-btn--sm">
                  Open studio
                  <IcBolt className="hs-icon-sm" />
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="pg-nav__link pg-nav__desk">Sign in</Link>
                <Link href="/login?new=1" className="hs-btn hs-btn--primary hs-btn--sm">
                  Start free
                </Link>
              </>
            )}

            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon pg-nav__burger"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
            >
              <IcMenu className="hs-icon" />
            </button>
          </div>
        </nav>
      </header>

      <Sheet open={open} onClose={() => setOpen(false)} title="Menu">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  minHeight: 48, padding: "0 var(--s-1)",
                  borderBottom: "1px solid var(--line)",
                  fontSize: "var(--t-md)", fontWeight: 500,
                }}
              >
                {l.label}
                <IcChevronRight className="hs-icon-sm" style={{ color: "var(--tx-mute)" }} />
              </Link>
            ))}
          </div>

          {groups.map((g) => (
            <section key={g.id}>
              <span className="hs-label">{g.label}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "var(--s-2)" }}>
                {g.tools.map(({ id, label, icon: Icon }) => (
                  <Link
                    key={id}
                    href={`/studio/${id}`}
                    onClick={() => setOpen(false)}
                    className="hs-card"
                    style={{ padding: "var(--s-3)", display: "flex", alignItems: "center", gap: "var(--s-2)" }}
                  >
                    <Icon className="hs-icon-sm" style={{ color: "var(--tx-mute)" }} />
                    <span style={{ fontSize: "var(--t-tiny)", fontWeight: 500 }}>{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <Link
            href={authed ? "/studio" : "/login?new=1"}
            className="hs-btn hs-btn--primary hs-btn--lg hs-btn--block"
            onClick={() => setOpen(false)}
          >
            {authed ? "Open studio" : "Start free"}
            <IcBolt className="hs-icon-sm" />
          </Link>
        </div>
      </Sheet>
    </>
  );
}
