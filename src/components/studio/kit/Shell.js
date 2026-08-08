"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sheet } from "./Sheet";
import ThemeToggle from "@/components/ThemeToggle";
import { byGroup, DOCK_TOOLS, getTool } from "./tools";
import { IcSearch, IcSettings, IcMenu, IcBolt, IcLayers } from "./Icons";

/* ══════════════════════════════════════════════════════════════════════════
   SHELL — the constant frame around every tool
   ──────────────────────────────────────────────────────────────────────────
   A bar that says where you are and what you can spend, an instrument rail,
   and the work area. Below 900px the rail becomes a bottom dock and the full
   instrument list opens as a sheet.

   One tree at every width. The previous shell rendered two entirely separate
   component trees for mobile and desktop, so a resize remounted the studio
   and dropped in-flight generations.

   U1 adds the Filament made literal: a single 2px thread — under the top
   bar on desktop, along the top edge of the dock on a phone — that draws
   itself while work is running and settles with a brief pulse when the last
   job completes. It is the one element allowed to move continuously; see
   .st-filament in studio.css.
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

/* The thread's three states, derived from the running-jobs count the Shell
   already receives. "settling" is the completion pulse: entered only on a
   true generating → idle transition, and released after the pulse has had
   time to play (the CSS animation is 900ms). */
function useFilamentState(running) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);

  useEffect(() => {
    if (running > 0) {
      clearTimeout(timer.current);
      setState("generating");
      return undefined;
    }
    setState((prev) => {
      if (prev !== "generating") return prev;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1000);
      return "settling";
    });
    return undefined;
  }, [running]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return state;
}

function Filament({ state, edge }) {
  return (
    <div
      className={`st-filament st-filament--${edge}`}
      data-state={state}
      aria-hidden="true"
    />
  );
}

/* ── Adaptive dock ordering (U1) ──────────────────────────────────────────
   The active tool sits in the centre slot with a legible label; its
   neighbours flank it as icons, and "All" keeps the last slot. When the
   active tool has no dock slot (Director, Music, …) the natural order is
   kept and "All" carries the active state instead. */
function dockOrder(active) {
  const i = DOCK_TOOLS.findIndex((t) => t.id === active);
  if (i === -1) return DOCK_TOOLS;
  const n = DOCK_TOOLS.length;
  // Rotate so the active tool lands in the centre of the tool slots
  // (slot index 2 of the 5 rendered, counting "All").
  const start = (i - 2 + 2 * n) % n;
  return Array.from({ length: n }, (_, k) => DOCK_TOOLS[(start + k) % n]);
}

export default function Shell({
  active,
  onSelect,
  onCommand,
  onKeys,
  credits,
  running = 0,
  children,
}) {
  const [menu, setMenu] = useState(false);
  const tool = getTool(active);
  const groups = byGroup();
  const filament = useFilamentState(running);
  const activeInDock = DOCK_TOOLS.some((t) => t.id === active);

  /* Route changes should never leave the sheet open behind the new tool */
  useEffect(() => { setMenu(false); }, [active]);

  const pick = (id) => { setMenu(false); onSelect?.(id); };

  /* Swipe on the dock switches tools — pointer events, tap untouched. */
  const swipe = useRef(null);
  const onDockPointerDown = (e) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onDockPointerUp = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = DOCK_TOOLS.findIndex((t) => t.id === active);
    const from = i === -1 ? 0 : i;
    const n = DOCK_TOOLS.length;
    const next = i === -1
      ? DOCK_TOOLS[0]
      : DOCK_TOOLS[(from + (dx < 0 ? 1 : n - 1)) % n];
    pick(next.id);
  };

  return (
    <div className="st-app">
      <a href="#studio-work" className="hs-skip">Skip to workspace</a>

      {/* ── Bar ─────────────────────────────────────────────────────────── */}
      <header className="st-bar">
        <Link href="/" className="st-brand" aria-label="Helmies Studio home">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image would change loading/layout behavior; deferred, out of scope for lint-only stabilization (2026-08-01) */}
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
            <Link href="/studio/assets" className="st-running" title={`${running} generation${running === 1 ? "" : "s"} running`}>
              <span className="hs-dot hs-dot--live" />
              {running}
            </Link>
          )}
          <Credits credits={credits} />
          {onKeys && (
            <button
              type="button"
              className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip st-keys-btn"
              data-tip="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              onClick={onKeys}
            >
              <kbd className="hs-kbd" style={{ pointerEvents: "none" }}>?</kbd>
            </button>
          )}
          <ThemeToggle />
          <Link
            href="/settings"
            className="hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip"
            data-tip="Settings"
            aria-label="Settings"
          >
            <IcSettings className="hs-icon-sm" />
          </Link>
        </div>

        <Filament state={filament} edge="bar" />
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

        {/* Templates is a route, not an instrument, but it is the fastest
            path to a good first result — so it sits in the rail rather than
            being reachable only from the marketing nav. */}
        <div>
          <div className="st-rail__group">Start from</div>
          <Link href="/templates" className="st-tool" title="Pre-built briefs and multi-step workflows">
            <IcLayers />
            <span>Templates</span>
          </Link>
        </div>
      </nav>

      {/* ── Work ────────────────────────────────────────────────────────── */}
      <main className="st-work-area" id="studio-work">
        {children}
      </main>

      {/* ── Mobile dock — adaptive: active tool centred and labelled ────── */}
      <nav
        className="st-dock"
        aria-label="Instruments"
        onPointerDown={onDockPointerDown}
        onPointerUp={onDockPointerUp}
      >
        <Filament state={filament} edge="dock" />
        {dockOrder(active).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`st-dock__btn${active === id ? " is-active" : ""}`}
            onClick={() => pick(id)}
            aria-current={active === id ? "page" : undefined}
            aria-label={label}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`st-dock__btn${menu || !activeInDock ? " is-active" : ""}`}
          onClick={() => setMenu(true)}
          aria-expanded={menu}
          aria-label="All instruments"
        >
          <IcMenu />
          <span>{activeInDock ? "All" : tool.label}</span>
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

          <section>
            <span className="hs-label">Start from</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "var(--s-2)" }}>
              <Link
                href="/templates"
                className="hs-card"
                onClick={() => setMenu(false)}
                style={{ padding: "var(--s-3)", display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}
              >
                <IcLayers className="hs-icon" style={{ color: "var(--tx-mute)" }} />
                <span style={{ fontSize: "var(--t-sm)", fontWeight: 600 }}>Templates</span>
                <span style={{ fontSize: 10, color: "var(--tx-mute)", lineHeight: 1.4 }}>Pre-built briefs and multi-step workflows.</span>
              </Link>
            </div>
          </section>
        </div>
      </Sheet>
    </div>
  );
}
