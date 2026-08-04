import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse, AuthzError } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { getCurrentUser } from "@/lib/session";
import { publishEntry } from "@/lib/cms";

/* ══════════════════════════════════════════════════════════════════════════
   POST /api/admin/cms-content/publish  (repaired in EDITSv1 E8.5)
   ──────────────────────────────────────────────────────────────────────────
   What this route used to do, and why none of it worked:

   · It called cmsRevision.create({ data: { entryId, content, status } }).
     CmsRevision has no `status` field, so Prisma rejected every single
     call — and the call was wrapped in `.catch(() => {})`, so the route
     answered `{ success: true }` regardless. No revision was ever written,
     for the entire life of the feature, and nothing anywhere said so.
     `createdBy` was never populated either.

   · It ran updateMany({ where: { key, status: "published" } }) to demote a
     "sibling" row sharing the key. `CmsEntry.key` is @unique — there can be
     no sibling. That statement was written against a versioned-rows model
     that does not exist in this schema, and is gone.

   The work now lives in src/lib/cms.js, where the status flip and the
   revision write share one transaction and errors are surfaced rather than
   swallowed. `key` is no longer read from the body: the entry is addressed
   by id, and trusting a client-supplied key to decide which OTHER rows to
   demote was the second half of bug two.
   ══════════════════════════════════════════════════════════════════════════ */
export async function POST(req) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) throw new AuthzError(400, "Content id required");

    const admin = await getCurrentUser();
    const updated = await publishEntry(id, admin?.id ?? null);

    return NextResponse.json({
      success: true,
      id: updated.id,
      status: updated.status,
      publishedAt: updated.updatedAt,
    });
  } catch (e) {
    // P2025 — the entry was deleted between the admin loading the list and
    // pressing Publish. A 404 is the honest answer; it used to be a
    // cheerful `{ success: true }`.
    if (e?.code === "P2025") return authzResponse(new AuthzError(404, "That entry no longer exists"));
    return authzResponse(e);
  }
}
