import { NextResponse } from "next/server";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkAnonLimit, clientIp } from "@/lib/rate-limit";
import { recordClick } from "@/lib/announcements";

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/announcements/[id]/click — CTA activations
   ──────────────────────────────────────────────────────────────────────────
   Deliberately open to anonymous callers. A promotion on a public page is
   seen mostly by signed-out visitors, and impressions are counted for them
   too — restricting clicks to signed-in users would leave the owner reading
   a click-through rate with the numerator systematically missing, which is
   worse than not measuring at all.

   What keeps that safe: this handler can only add 1 to a counter on one
   campaign row. It reads nothing, returns nothing about the campaign, and
   cannot touch any user's data. It is origin-checked (so another site
   cannot drive it from a visitor's browser) and IP rate-limited (so a
   script cannot inflate the owner's numbers at any speed worth having).
   ══════════════════════════════════════════════════════════════════════════ */

// Generous for a human — a real viewer clicks a banner once or twice — and
// far too slow to manufacture a convincing campaign result.
const LIMIT = { windowMs: 5 * 60 * 1000, max: 30 };

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    verifyOrigin(req);
    if (typeof id !== "string" || !id) throw new AuthzError(400, "Announcement id required");

    const { allowed } = await checkAnonLimit(clientIp(req), "/api/announcements/click", LIMIT);
    if (!allowed) throw new AuthzError(429, "Too many requests");

    await recordClick(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
