"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ERROR BOUNDARY — app/error.js
   ──────────────────────────────────────────────────────────────────────────
   Must be a client component and must accept `reset`. We show the real
   message when there is one; in production Next redacts server errors to a
   generic string and hands over a digest instead, so we surface that
   digest — it is the one thing support can actually trace.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect } from "react";
import Link from "next/link";
import { IcAlert, IcRefresh } from "@/components/studio/kit/Icons";

const REDACTED = "An error occurred in the Server Components render";

export default function Error({ error, reset }) {
  useEffect(() => {
    // Console is the only sink we have client-side; keep it greppable.
    console.error("[helmies] route error", error);
  }, [error]);

  const message = error?.message || "";
  const redacted = !message || message.startsWith(REDACTED);

  return (
    <main className="pg-status">
      <div className="pg-status__in">
        <span className="hs-empty__mark" style={{ color: "var(--fault)" }}>
          <IcAlert />
        </span>

        <span className="hs-eyebrow">Error</span>
        <h1>This page did not load</h1>

        <p>
          {redacted
            ? "The server failed while rendering this page. Retrying often clears it — the fault is on our side, not in what you did."
            : message}
        </p>

        {error?.digest && (
          <p className="hs-hint">
            Reference <code>{error.digest}</code> — quote it if you email us.
          </p>
        )}

        <div className="hs-row" style={{ justifyContent: "center", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
          <button type="button" className="hs-btn hs-btn--primary" onClick={() => reset()}>
            <IcRefresh className="hs-icon-sm" />
            Try again
          </button>
          <Link href="/studio" className="hs-btn">Back to the studio</Link>
          <a href="mailto:hello@helmies.fi?subject=Studio%20error" className="hs-btn hs-btn--ghost">
            Report it
          </a>
        </div>
      </div>
    </main>
  );
}
