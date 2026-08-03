import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import {
  getSession, renameSession, updateSessionSettings, archiveSession,
} from "@/lib/agent-sessions";

// EDITSv1 E3.1 — one session: GET returns { session, messages } (the full
// ordered feed for resume); PATCH renames and/or updates settings; DELETE
// archives (soft delete — archived sessions drop out of the list but their
// history survives). Every path 404s identically for a missing session and
// another user's session.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const { session, messages } = await getSession(user.id, id);
    return NextResponse.json({ session, messages });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body.title === undefined && body.settings === undefined) {
      return apiError({ code: "bad_request", message: "Nothing to update — send title and/or settings." });
    }

    let session = null;
    if (body.title !== undefined) session = await renameSession(user.id, id, body.title);
    if (body.settings !== undefined) session = await updateSessionSettings(user.id, id, body.settings);
    return NextResponse.json({ session });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    await archiveSession(user.id, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
