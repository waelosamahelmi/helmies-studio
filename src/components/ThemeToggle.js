"use client";

/* ══════════════════════════════════════════════════════════════════════════
   THEME TOGGLE  (plan phase S3)
   ──────────────────────────────────────────────────────────────────────────
   One icon button that cycles light/dark. The source of truth at runtime is
   `document.documentElement.dataset.theme`, which the inline head script in
   src/app/layout.js sets BEFORE first paint from localStorage
   ("helmies.theme") or, when the user has never chosen, from
   prefers-color-scheme. This component only ever mutates that attribute and
   the stored choice — all styling flips via the `[data-theme="light"]`
   token block in src/styles/system.css.

   While the user has NOT chosen (nothing stored), the app live-follows the
   OS preference: the matchMedia listener below re-stamps the attribute when
   the system theme changes mid-session. The first explicit toggle click
   writes localStorage and thereby stops the following — exactly the
   "default = system, choice = sticky" contract from the plan.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import { IcSun, IcMoon } from "@/components/studio/kit/Icons";

export const THEME_KEY = "helmies.theme";

const readTheme = () =>
  typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
    ? "light"
    : "dark";

export default function ThemeToggle({
  className = "hs-btn hs-btn--ghost hs-btn--sm hs-btn--icon hs-tip",
}) {
  /* SSR renders the dark glyph; the first effect corrects it before the
     button is meaningfully interactive. suppressHydrationWarning is not
     needed — the mismatch is attribute-free until the effect runs. */
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(readTheme());

    /* Live-follow the system while the user hasn't chosen. */
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      let stored = null;
      try { stored = localStorage.getItem(THEME_KEY); } catch { /* private mode */ }
      if (stored === "light" || stored === "dark") return; // user chose; system no longer drives
      const next = mq.matches ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = readTheme() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
    setTheme(next);
  }, []);

  const light = theme === "light";
  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      /* A toggle keeps a STABLE accessible name; state lives in aria-pressed.
         "Light theme" + pressed=true reads as "light theme, on". */
      aria-pressed={light}
      aria-label="Light theme"
      data-tip={light ? "Switch to dark theme" : "Switch to light theme"}
      data-testid="theme-toggle"
    >
      {light ? <IcMoon className="hs-icon-sm" /> : <IcSun className="hs-icon-sm" />}
    </button>
  );
}
