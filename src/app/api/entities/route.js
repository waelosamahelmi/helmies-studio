import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { listEntities, createEntity } from "@/lib/entities";
import { ENTITY_KINDS } from "@/lib/entity-core.mjs";

// Phase C1.2 — the caller's characters / products / environments. An entity
// is defined once and referenced everywhere by id, so no surface ever has to
// copy a description around.

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    if (kind && !ENTITY_KINDS.includes(kind)) {
      return apiError({ code: "bad_request", message: "Unknown entity kind." });
    }
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const entities = await listEntities(user.id, {
      kind: kind || null,
      projectId: searchParams.get("projectId") || null,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({ entities });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/entities");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    const kind = body.kind || "character";
    if (!ENTITY_KINDS.includes(kind)) {
      return apiError({ code: "bad_request", message: "Unknown entity kind." });
    }

    const entity = await createEntity(user.id, kind, body);
    return NextResponse.json({ entity });
  } catch (e) {
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message, extra: { errors: e.errors } });
    }
    return authzResponse(e);
  }
}
