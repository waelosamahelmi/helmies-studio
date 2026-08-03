import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { generateShotAsset, VALID_SHOT_ASSET_KINDS } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

// E4.2: generate ONE asset (image or video) for ONE planned shot before any
// full execution. The executor debits exactly that shot's server-quoted cost
// for that kind and refunds on failure — see generateShotAsset.
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId || !body.shotId) {
      return apiError({ code: "bad_request", message: "planId and shotId required" });
    }
    if (!VALID_SHOT_ASSET_KINDS.includes(body.kind)) {
      return apiError({ code: "bad_request", message: "kind must be image or video" });
    }

    const result = await generateShotAsset(body.planId, user.id, body.shotId, body.kind);

    return NextResponse.json({ success: true, result });
  } catch (e) {
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    if (/Pipeline not found|Shot not found/.test(e.message)) {
      return apiError({ code: "not_found", message: e.message });
    }
    if (/Pipeline is executing/.test(e.message)) {
      return apiError({
        status: 409,
        code: "bad_request",
        title: "Production running",
        message: "This production is rendering right now — wait for it to finish before generating single shots.",
      });
    }
    return authzResponse(e);
  }
}
