import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { cancelGeneration } from "@/lib/generation-control";

/* Stop a run.
   Three honest outcomes, not one: stopped outright with credits released
   (it never reached a provider), stopped waiting but still billed (it
   did), or too late. Reporting "cancelled" for the middle case would be a
   lie the user only discovers on their statement. */
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    const result = await cancelGeneration(user.id, id);
    if (!result) return apiError({ code: "not_found", message: "That run could not be found." });

    return NextResponse.json({ success: true, outcome: result.outcome, message: result.message });
  } catch (e) {
    return authzResponse(e);
  }
}
