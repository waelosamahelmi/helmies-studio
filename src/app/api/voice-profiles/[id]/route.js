import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { getProfile, updateProfile, deleteProfile } from "@/lib/voice-profiles";

// S2 — one voice profile: GET reads it, PATCH advances the wizard's state
// (status / voiceId / name), DELETE removes it. Every path 404s identically
// for a missing profile and another user's profile.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const profile = await getProfile(user.id, id);
    return NextResponse.json({ profile });
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
    const profile = await updateProfile(user.id, id, {
      status: body.status,
      voiceId: body.voiceId,
      name: body.name,
    });
    return NextResponse.json({ profile });
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
    await deleteProfile(user.id, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}
