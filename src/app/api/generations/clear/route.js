import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { clearGenerations, restoreGenerations } from "@/lib/generation-control";

/* Clear away the failures.
   Hidden, never deleted: a failed run records what went wrong and what it
   cost, and that is what a refund argument gets settled with. DELETE puts
   them all back, because nothing was destroyed. */
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter((v) => typeof v === "string") : null;
    const cleared = await clearGenerations(user.id, { ids });
    return NextResponse.json({ success: true, cleared });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function DELETE(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);
    const restored = await restoreGenerations(user.id);
    return NextResponse.json({ success: true, restored });
  } catch (e) {
    return authzResponse(e);
  }
}
