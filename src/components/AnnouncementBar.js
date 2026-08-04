"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ANNOUNCEMENT BAR  (EDITSv1 Phase E8 Task E8.2)
   ──────────────────────────────────────────────────────────────────────────
   THE BUG THIS FIXES: this used to be rendered by src/app/layout.js inside
   the ordinary page flow, styled by `.pg-announce` — which is statically
   positioned. `.st-app` (the studio shell) is `position: fixed; inset: 0`.
   So on every `/studio/*` route the announcement was in the DOM, painted,
   and completely covered by the shell. Every announcement the owner has
   ever posted was invisible to the users who were actually inside the
   product.

   The fix follows the pattern src/components/states/OfflineBanner.js already
   proved: mounted once in Providers.js OUTSIDE the page tree, positioned
   `fixed` with a z-index above the shell, and styled from system.css tokens
   (`.hs-announce*`) rather than from pages.css, which the studio never
   loads. Read OfflineBanner's header — it documents the same reasoning for
   the same reason.

   It sits at the BOTTOM: the top edge is already spoken for on every
   surface (the marketing Navbar, the studio's `.st-bar`), whereas the
   bottom is free everywhere except the studio's mobile dock, which
   system.css lifts the bar clear of.
   ══════════════════════════════════════════════════════════════════════════ */

import Link from "next/link";
import { IcClose, IcChevronRight } from "@/components/studio/kit/Icons";
import { useAnnouncement, recordClick } from "@/lib/use-announcements";

const STYLE_CLASS = {
  info: "hs-announce--info",
  success: "hs-announce--success",
  warning: "hs-announce--warning",
  critical: "hs-announce--critical",
};

export default function AnnouncementBar() {
  const { item, dismiss } = useAnnouncement("banner");

  if (!item) return null;

  // ctaUrl/ctaLabel are the campaign fields; `link` is what the pre-E8 rows
  // carry, so both keep working and an old announcement is not orphaned.
  const href = item.ctaUrl || item.link || null;
  const label = item.ctaLabel || (href ? "Read more" : null);
  const internal = href ? href.startsWith("/") : false;
  const tone = STYLE_CLASS[item.style] || STYLE_CLASS.info;

  const onActivate = () => recordClick(item.id);

  return (
    <div className={`hs-announce ${tone}`} role="region" aria-label="Site announcement">
      <span className="hs-announce__body">
        {item.title && <strong className="hs-announce__title">{item.title}</strong>}
        <span>{item.message}</span>
      </span>

      {href &&
        (internal ? (
          <Link href={href} className="hs-announce__cta" onClick={onActivate}>
            {label}
            <IcChevronRight className="hs-icon-sm" />
          </Link>
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hs-announce__cta"
            onClick={onActivate}
          >
            {label}
          </a>
        ))}

      {/* dismissible:false is for the rare notice a user genuinely must not
          be able to wave away (a scheduled outage). Everything else closes. */}
      {item.dismissible !== false && (
        <button
          type="button"
          className="hs-announce__x"
          onClick={dismiss}
          aria-label="Dismiss announcement"
        >
          <IcClose className="hs-icon-sm" />
        </button>
      )}
    </div>
  );
}
