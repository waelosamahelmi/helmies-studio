import { redirect } from "next/navigation";

/* ══════════════════════════════════════════════════════════════════════════
   /settings/billing → /settings?tab=billing
   ──────────────────────────────────────────────────────────────────────────
   Billing has exactly one surface: the Billing panel in Settings. Every
   internal link already points at ?tab=billing (studio shell, command
   palette, spend meter, phone profile), so this path is kept only so old
   bookmarks and emails still land somewhere real. Server-side redirect —
   no flash, no second copy of the UI to keep in sync.
   ══════════════════════════════════════════════════════════════════════════ */

export const metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

export default function SettingsBillingRedirect() {
  redirect("/settings?tab=billing");
}
