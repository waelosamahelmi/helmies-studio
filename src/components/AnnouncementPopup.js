"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ANNOUNCEMENT POPUP  (EDITSv1 Phase E8 Task E8.2)
   ──────────────────────────────────────────────────────────────────────────
   Renders a `placement: "modal"` campaign through the existing Modal from
   studio/kit/Sheet.js — which already portals, traps focus, closes on
   Escape, and turns itself into a bottom sheet at ≤640px. No new dialog
   primitive; this is the one the rest of the app uses.

   Shown once. The dismissal is recorded the moment it closes, for any
   reason, so a user who has waved it away never meets it again — including
   on their next device, because a signed-in dismissal is a row rather than
   a localStorage entry.

   `dismissible: false` is honoured only where the owner deliberately set it
   (Modal then renders no close button and ignores Escape and the scrim).
   That is a genuinely blocking notice, not a marketing default — the field
   defaults to true.
   ══════════════════════════════════════════════════════════════════════════ */

import Link from "next/link";
import { Modal } from "@/components/studio/kit/Sheet";
import { useAnnouncement, recordClick } from "@/lib/use-announcements";

export default function AnnouncementPopup() {
  const { item, dismiss } = useAnnouncement("modal");

  if (!item) return null;

  const href = item.ctaUrl || item.link || null;
  const label = item.ctaLabel || (href ? "Take a look" : null);
  const internal = href ? href.startsWith("/") : false;

  const activate = () => {
    recordClick(item.id);
    // Following the CTA is an answer to the campaign — it must not come
    // back on the next page load.
    dismiss();
  };

  const cta = href ? (
    internal ? (
      <Link href={href} className="hs-btn hs-btn--primary" onClick={activate}>
        {label}
      </Link>
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="hs-btn hs-btn--primary"
        onClick={activate}
      >
        {label}
      </a>
    )
  ) : null;

  return (
    <Modal
      open
      onClose={dismiss}
      title={item.title || "A quick note"}
      dismissable={item.dismissible !== false}
      footer={
        <>
          {item.dismissible !== false && (
            <button type="button" className="hs-btn hs-btn--ghost" onClick={dismiss}>
              Not now
            </button>
          )}
          {cta}
        </>
      }
    >
      <div className={`hs-announce-pop hs-announce--${item.style || "info"}`}>
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hs-announce-pop__img" src={item.imageUrl} alt="" />
        )}
        <p className="hs-announce-pop__text">{item.message}</p>
      </div>
    </Modal>
  );
}
