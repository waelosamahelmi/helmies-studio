import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { acceptAssets } from "@/lib/agent-assets";
import { resolveOwnedSession } from "@/lib/agent-sessions";

// The filled asset request. The assistant asked for a face, a product, a
// logo, a voice (src/lib/agent-chat.js); this is where the answer becomes
// real rows the rest of the studio already knows how to use.
//
// The receipt is appended to the session as the USER's turn, so the next
// chat call sees the new ids in its own transcript — the assistant is never
// told out of band what it has, because a model that believes it has a face
// it does not have plans a production that renders a stranger.

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.items) || !body.items.length) {
      return apiError({ code: "bad_request", message: "Nothing to file." });
    }

    // Ownership is asserted even though nothing is written to the session:
    // a caller passing somebody else's sessionId must not get a 200 back.
    await resolveOwnedSession(user.id, body.sessionId);

    const { results, receipt } = await acceptAssets(user.id, {
      items: body.items,
      projectId: body.projectId || null,
    });

    /* The receipt is NOT appended here. The client sends it as the next
       user message, and /api/agent/chat persists it on the way through —
       one writer. Appending in both places put the same receipt in the
       transcript twice, and a transcript that lists the same face twice is
       a transcript the planner can double-count. */

    return NextResponse.json({
      results: results.map((r) => ({
        key: r.key,
        kind: r.kind,
        error: r.error || null,
        entityId: r.entity?.id || null,
        name: r.entity?.name || r.brandKit?.name || r.name || null,
        created: r.created ?? null,
        orphan: r.orphan ?? false,
      })),
      receipt,
    });
  } catch (e) {
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message, extra: { errors: e.errors } });
    }
    return authzResponse(e);
  }
}
