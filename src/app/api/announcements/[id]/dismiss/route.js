import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { dismiss } from "@/lib/announcements";

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/announcements/[id]/dismiss
   ──────────────────────────────────────────────────────────────────────────
   Closing a campaign used to be a localStorage entry and nothing else, so
   the same popup greeted the user again on their phone. A signed-in
   dismissal is now a row, and the compound unique makes a double-submit a
   no-op rather than a 500.

   Anonymous viewers keep the localStorage-only path — there is no account
   to hang a row off, and inventing a cookie-shaped identity for someone who
   has not signed in is not worth it for a dismissed banner.
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(req, { params }) {
  try {
    // Next 15+ hands this in as a Promise. Reading `.id` off the un-awaited
    // object yields undefined, and Prisma DROPS an undefined field from a
    // where clause rather than matching nothing.
    const { id } = await params;

    const user = await getCurrentUser();
    if (!user) throw new AuthzError(401, "Unauthorized");
    verifyOrigin(req);

    if (typeof id !== "string" || !id) throw new AuthzError(400, "Announcement id required");

    await dismiss(id, user.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
