import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { createProfile, listProfiles } from "@/lib/voice-profiles";

// S2 — GET lists the caller's voice profiles (optionally ?status=ready for
// the pickers); POST creates one at the start of the voice-clone wizard.
// Thin wrappers over src/lib/voice-profiles.js.

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const profiles = await listProfiles(user.id, { status });
    return NextResponse.json({ profiles });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json().catch(() => ({}));
    const profile = await createProfile(user.id, { name: body.name, provider: body.provider });
    return NextResponse.json({ profile });
  } catch (e) {
    return authzResponse(e);
  }
}
