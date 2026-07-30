"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "./Sheet";
import { byGroup, DOCK_TOOLS, getTool } from "./tools";
import { IcSearch, IcSettings, IcMenu, IcBolt } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   SHELL — the constant frame around every tool
   ──────────────────────────────────────────────────────────────────────────
   A bar that says where you are and what you can spend, an instrument rail,
   and the work area. Below 900px the rail becomes a bottom dock and the full
   instrument list opens as a sheet.

   One tree at every width. The previous shell rendered two entirely separate
   component trees for mobile and desktop, so a resize remounted the studio
   and dropped in-flight generations.
   ══════════════════════════════════════════════════════════════════════════ */

function Credits({ credits }) {
  const known = credits != null;
  const low = known && credits < 50;
  return (
    <Link
      href="/settings?tab=billing"
      className={`st-credits${low ? " is-low" : ""}`}
      title={low ? "Running low — top up" : "Credit balance"}
    >
      <IcBolt style={{ width: 12, height: 12, color: low ? "var(--caution)" : "var(--filament)" }} />
      {known ? credits.toLocaleString("en-US") : "—"}
      <small>cr</small>
    </Link>
  );
}

export default function Shell({
  active,
  onSelect,
  onCommand,
  credits,
  running = 0,
  children,
}) {
  const [menu, setMenu] = useState(false);
  const tool = getTool(active);
  const groups = byGroup();

  /* Route changes should never leave the sheet open behind the new tool */
  useEffect(() => { setMenu(false); }, [active]);

  const pick = (id) => { setMenu(false); onSelect?.(id); };

  return (
    <div className="st-app">
      <a href="#studio-work" className="hs-skip">Skip to workspace</a>

      {/* ── Bar ─────────────────────────────────────────────────────────── */}
      <header className="st-bar">
        <Link href="/" className="st-brand" aria-label="Helmies Studio home">
          <img src="/ico.svg" alt="" width={22} height={22} />
          <strong>Helmies</strong>
          <span>Studio</span>
        </Link>

        <div className="st-where">
          <span className="st-where__name">{tool.title}</span>
          <span className="st-where__desc">{tool.blurb}</span>
        </div>

        <button type="button" className="st-search" onClick={onCommand} aria-label="Search models and instruments">
          <IcSearch />
          <span>Search instruments and models</span>
          <kbd className="hs-kbd">⌘K</kbd>
        </button>

        <div className="st-bar__actions">
          {running > 0 && (
            <Link href="/gallery" className="st-running" title={`${running} generation${running === 1 ? "" : "s"} running`}>
              <span className="hs-dot hs-dot--live" />
              {running}
            </Link>
          )}
          <Credits credits={credits} />
          <Link
            href="/settings"
            className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
            data-tip="Settings"
            aria-label="Settings"
          >
            <IcSettings className="hs-icon-sm" />
          </Link>
        </div>
      </header>

      {/* ── Instrument rail ─────────────────────────────────────────────── */}
      <nav className="st-rail" aria-label="Instruments">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="st-rail__group">{g.label}</div>
            {g.tools.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`st-tool${active === id ? " is-active" : ""}`}
                onClick={() => pick(id)}
                aria-current={active === id ? "page" : undefined}
                title={getTool(id).blurb}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Work ────────────────────────────────────────────────────────── */}
      <main className="st-work-area" id="studio-work">
        {children}
      </main>

      {/* ── Mobile dock ─────────────────────────────────────────────────── */}
      <nav className="st-dock" aria-label="Instruments">
        {DOCK_TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`st-dock__btn${active === id ? " is-active" : ""}`}
            onClick={() => pick(id)}
            aria-current={active === id ? "page" : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`st-dock__btn${menu ? " is-active" : ""}`}
          onClick={() => setMenu(true)}
          aria-expanded={menu}
        >
          <IcMenu />
          <span>All</span>
        </button>
      </nav>

      {/* ── Full instrument list (mobile) ───────────────────────────────── */}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Instruments">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          {groups.map((g) => (
            <section key={g.id}>
              <span className="hs-label">{g.label}</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "var(--s-2)" }}>
                {g.tools.map(({ id, label, icon: Icon, blurb }) => (
                  <button
                    key={id}
                    type="button"
                    className={`hs-card${active === id ? " hs-card--active" : ""}`}
                    onClick={() => pick(id)}
                    style={{ padding: "var(--s-3)", display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}
                  >
                    <Icon className="hs-icon" style={{ color: active === id ? "var(--filament-lit)" : "var(--tx-mute)" }} />
                    <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 10, color: "var(--tx-mute)", lineHeight: 1.4 }}>{blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
