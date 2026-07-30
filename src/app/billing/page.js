import { redirect } from "next/navigation";

/* ══════════════════════════════════════════════════════════════════════════
   /billing → /settings?tab=billing
   ──────────────────────────────────────────────────────────────────────────
   This route used to be a second, divergent plans page: hardcoded tiers
   (Pro €29 / Business €99 / Enterprise) that matched neither /pricing nor
   the plan ids the Stripe checkout route accepts, so its upgrade buttons
   could only fail. Public plan comparison lives at /pricing; the signed-in
   balance, plan and top-ups live in Settings. This path just forwards.
   ══════════════════════════════════════════════════════════════════════════ */

export const metadata = {
  title: "Billing",
  robots: { index: false, follow: false },
};

export default function BillingRedirect() {
  redirect("/settings?tab=billing");
}
