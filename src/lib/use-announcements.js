"use client";

import { useCallback, useEffect, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   ANNOUNCEMENT CLIENT  (EDITSv1 Phase E8 Task E8.2)
   ──────────────────────────────────────────────────────────────────────────
   Shared by AnnouncementBar (placement: "banner") and AnnouncementPopup
   (placement: "modal"), which are mounted side by side in Providers.js.

   One request per document, not two: the fetch promise is memoised at
   module scope, so mounting both components costs a single call to
   /api/announcements. The cache is per page load — a full navigation gets
   fresh campaigns, which is the right granularity for something the owner
   toggles by hand.

   Dismissal is deliberately BOTH local and remote. localStorage answers
   instantly and is the only option an anonymous viewer has; the POST makes
   it stick across devices for someone signed in. The POST is fire-and-
   forget: if it fails (offline, signed out, rate limited) the local record
   still hides the campaign, and the worst case is that it returns on
   another device — never a visible error for something the user just closed.
   ══════════════════════════════════════════════════════════════════════════ */

const STORE = "helmies.announce.dismissed";

let inflight = null;

// Campaigns already counted in THIS document. React can mount a component
// twice (Strict Mode) and a client-side navigation can remount it — neither
// is a second time a human saw the thing.
const counted = new Set();

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
    /* Private mode or a full quota: the server-side record still covers a
       signed-in user, and an anonymous one sees it again next visit. */
  }
}

function loadAll() {
  if (!inflight) {
    inflight = fetch("/api/announcements", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => (Array.isArray(list) ? list : []))
      .catch(() => []);
  }
  return inflight;
}

// Plain fetch rather than src/lib/client-fetch.js on purpose: that helper
// throws the sign-in modal over the page on a 401, which would be an absurd
// response to a metrics beacon or to an anonymous viewer closing a banner.
function beacon(path) {
  return fetch(path, { method: "POST", credentials: "same-origin" }).catch(() => {});
}

export function recordImpression(id) {
  if (!id || counted.has(id)) return;
  counted.add(id);
  beacon(`/api/announcements/${encodeURIComponent(id)}/impression`);
}

export function recordClick(id) {
  if (!id) return;
  beacon(`/api/announcements/${encodeURIComponent(id)}/click`);
}

/**
 * The highest-priority campaign for `placement` that this viewer has not
 * dismissed, or null. The server has already applied audience, plan
 * targeting, the schedule window and any server-side dismissals — this only
 * adds the local (anonymous, or not-yet-synced) dismissals on top.
 */
export function useAnnouncement(placement) {
  const [item, setItem] = useState(null);

  useEffect(() => {
    let alive = true;
    loadAll().then((list) => {
      if (!alive) return;
      const dismissed = readDismissed();
      const next = list.find(
        (a) => a?.id && (a.placement || "banner") === placement && !dismissed.includes(a.id),
      );
      if (next) setItem(next);
    });
    return () => {
      alive = false;
    };
  }, [placement]);

  // Count the view only once the campaign is genuinely on screen.
  useEffect(() => {
    if (item?.id) recordImpression(item.id);
  }, [item]);

  const dismiss = useCallback(() => {
    if (!item?.id) return;
    remember(item.id);
    beacon(`/api/announcements/${encodeURIComponent(item.id)}/dismiss`);
    setItem(null);
  }, [item]);

  return { item, dismiss };
}

// Test seam only — lets a unit test start from a clean document.
export function __resetAnnouncementCache() {
  inflight = null;
  counted.clear();
}
