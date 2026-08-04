import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { listForViewer, planSlugForUser } from "@/lib/announcements";

/* ══════════════════════════════════════════════════════════════════════════
   GET /api/announcements — the campaigns THIS viewer should see
   ──────────────────────────────────────────────────────────────────────────
   Anonymous callers are welcome; the result simply differs. Three things
   changed here in Phase E8:

   1. The response is now per-viewer. It used to be "every active, in-window
      row" for everybody — `audience` was written by the admin form and read
      by nobody, so a campaign aimed at signed-out visitors was served to
      paying customers and vice versa.

   2. The catch used to return `e.message` verbatim to an UNAUTHENTICATED
      caller, handing out whatever a Prisma failure happened to say. It now
      goes through the uniform apiError envelope, which logs the real cause
      server-side against an errorId and returns nothing internal.

   3. Cache-Control is explicit. The answer depends on the session and the
      viewer's plan, so it must never be stored in a shared cache — a
      members-only campaign served from an edge cache to an anonymous
      visitor is the failure this header exists to prevent.

   The response stays a BARE ARRAY: that is the shape the existing client
   reads, and there is nothing to gain from breaking it.
   ══════════════════════════════════════════════════════════════════════════ */

// Only the fields the UI renders. Targeting internals (audience,
// planTargets) and the metrics counters stay server-side — a public reader
// has no business enumerating which plans the owner is running promotions
// at, nor how those promotions are performing.
function publicShape(a) {
  return {
    id: a.id,
    message: a.message,
    title: a.title,
    style: a.style,
    placement: a.placement,
    link: a.link,
    imageUrl: a.imageUrl,
    ctaLabel: a.ctaLabel,
    ctaUrl: a.ctaUrl,
    dismissible: a.dismissible,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const planSlug = user ? await planSlugForUser(user.id) : null;

    const rows = await listForViewer({
      userId: user?.id ?? null,
      planSlug,
      isAuthed: !!user,
    });

    return NextResponse.json(rows.map(publicShape), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "announcements" } });
  }
}
