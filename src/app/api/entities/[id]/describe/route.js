import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { getOwnedEntity } from "@/lib/entities";
import { describeCharacterFromPhotos } from "@/lib/entity-vision";
import { VOICE_REFERENCE_KIND } from "@/lib/entity-core.mjs";

// Read a character's observable traits off their own reference photographs.
// Returns SUGGESTIONS only — nothing is written. The caller shows them, the
// user accepts or edits, and the ordinary PATCH saves whatever they kept.
// Costs no credits: this is an LLM read, not a generation.

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/analyze");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const entity = await getOwnedEntity(user.id, id);
    if (!entity) return apiError({ code: "not_found", message: "Entity not found" });
    if (entity.kind !== "character") {
      return apiError({ code: "bad_request", message: "Only characters can be read from a photograph." });
    }

    // Prefer what the user gave us over what we generated: the point is to
    // describe the real person, not to describe our own last guess at them.
    const refs = Array.isArray(entity.references) ? entity.references : [];
    const usable = refs.filter((r) => r.kind !== VOICE_REFERENCE_KIND);
    const ordered = [
      ...usable.filter((r) => r.source === "user"),
      ...usable.filter((r) => r.source !== "user"),
    ];

    const result = await describeCharacterFromPhotos(ordered.map((r) => r.url), { name: entity.name });
    return NextResponse.json(result);
  } catch (e) {
    if (e?.code === "no_source") return apiError({ code: "bad_request", message: e.message });
    if (e?.code === "unavailable" || e?.code === "vision_failed") {
      return apiError({ code: "internal", message: e.message, retryable: true });
    }
    return authzResponse(e);
  }
}
