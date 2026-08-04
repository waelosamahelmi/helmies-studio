import { NextResponse } from "next/server";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkAnonLimit, clientIp } from "@/lib/rate-limit";
import { recordImpression } from "@/lib/announcements";

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/announcements/[id]/impression — first display of a campaign
   ──────────────────────────────────────────────────────────────────────────
   The counterpart to /click, and open to anonymous callers for the same
   reason: a click count without a matching impression count is not a
   measurement of anything.

   Why this is not folded into GET /api/announcements, which already knows
   exactly what it served: a GET that mutates would be incremented by every
   prefetch, every link hover, and every framework-level speculative fetch —
   inflating the number with views no human ever had. The client tells us
   when it actually painted the thing, once per campaign per document.

   Same protections as /click: origin-checked, IP rate-limited, and capable
   of nothing but adding 1 to one counter on one row.
   ══════════════════════════════════════════════════════════════════════════ */
const LIMIT = { windowMs: 5 * 60 * 1000, max: 60 };

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    verifyOrigin(req);
    if (typeof id !== "string" || !id) throw new AuthzError(400, "Announcement id required");

    const { allowed } = await checkAnonLimit(clientIp(req), "/api/announcements/impression", LIMIT);
    if (!allowed) throw new AuthzError(429, "Too many requests");

    await recordImpression(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
