import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { addEntityReference, removeEntityReference } from "@/lib/entities";

// Phase C1.2 — append or drop ONE reference. Append is its own endpoint
// rather than a whole-array PATCH so two concurrent uploads can never lose
// each other's image.

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/entities");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const entity = await addEntityReference(user.id, id, {
      url: body.url,
      kind: body.kind,
      label: body.label,
      locked: body.locked,
      source: body.source,
    });
    if (!entity) return apiError({ code: "not_found", message: "Entity not found" });
    return NextResponse.json({ entity });
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
    const { searchParams } = new URL(req.url);
    const refId = searchParams.get("refId");
    if (!refId) return apiError({ code: "bad_request", message: "refId is required." });

    const entity = await removeEntityReference(user.id, id, refId);
    if (!entity) return apiError({ code: "not_found", message: "Entity not found" });
    return NextResponse.json({ entity });
  } catch (e) {
    if (e?.code === "locked") return apiError({ code: "conflict", message: e.message });
    return authzResponse(e);
  }
}
