import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { getOwnedEntity, updateEntity, deleteEntity, refreshFingerprint } from "@/lib/entities";

// Phase C1.2 — one owned entity. A non-owner gets the same not_found a
// non-existent id gets, so this can never be used to probe for other
// people's characters.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const entity = await getOwnedEntity(user.id, id);
    if (!entity) return apiError({ code: "not_found", message: "Entity not found" });
    return NextResponse.json({ entity });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/entities");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const updated = await updateEntity(user.id, id, body);
    if (!updated) return apiError({ code: "not_found", message: "Entity not found" });

    // Keep the digest honest after every identity change — the generation
    // paths snapshot it, and a stale one would misreport which shots were
    // rendered from which version of the character.
    const entity = await refreshFingerprint(user.id, updated.id);
    return NextResponse.json({ entity: entity || updated });
  } catch (e) {
    if (e?.code === "locked") return apiError({ code: "conflict", message: e.message });
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message, extra: { errors: e.errors } });
    }
    return authzResponse(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    const removed = await deleteEntity(user.id, id);
    if (!removed) return apiError({ code: "not_found", message: "Entity not found" });
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
