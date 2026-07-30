"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ANNOUNCEMENT BAR
   ──────────────────────────────────────────────────────────────────────────
   Reads /api/announcements (public; already filtered to active + in-window
   rows, newest first). Dismissal is stored per announcement id in
   localStorage, so closing it closes it for good instead of once per
   navigation. Nothing renders until we know there is something to say —
   a bar that pops in after paint shoves the whole page down.
   ══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IcClose, IcChevronRight } from "@/components/studio/kit/Icons";

const STORE = "helmies.announce.dismissed";

function readDismissed() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function remember(id) {
  try {
    const next = Array.from(new Set([...readDismissed(), id])).slice(-50);
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    /* Private mode or a full quota: the bar simply returns next visit. */
  }
}

export default function AnnouncementBar() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/announcements");
        if (!res.ok) return;
        const list = await res.json();
        if (!alive || !Array.isArray(list) || list.length === 0) return;

        const dismissed = readDismissed();
        const next = list.find((a) => a?.id && !dismissed.includes(a.id));
        if (next) setItem(next);
      } catch {
        // An announcement that cannot load is not worth a message of its own.
      }
    })();

    return () => { alive = false; };
  }, []);

  const dismiss = useCallback(() => {
    if (item?.id) remember(item.id);
    setItem(null);
  }, [item]);

  if (!item) return null;

  const internal = item.link && item.link.startsWith("/");

  return (
    <div className="pg-announce" role="region" aria-label="Site announcement">
      <span className="hs-badge hs-badge--accent">{item.style || "info"}</span>

      <span>{item.message}</span>

      {item.link && (
        internal ? (
          <Link href={item.link} className="hs-row" style={{ gap: "var(--s-1)", fontWeight: 500 }}>
            Read more
            <IcChevronRight className="hs-icon-sm" />
          </Link>
        ) : (
          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
            Read more
          </a>
        )
      )}

      <button type="button" onClick={dismiss} aria-label="Dismiss announcement">
        <IcClose className="hs-icon-sm" />
      </button>
    </div>
  );
}
