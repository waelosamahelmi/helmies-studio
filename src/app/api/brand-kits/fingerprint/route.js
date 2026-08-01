import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { extractBrandFingerprint } from "@/lib/brand-engine";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

// POST /api/brand-kits/fingerprint?id=<brandKitId>
// Triggers Visual Intelligence analysis on all brand assets to derive the
// brand fingerprint (palette, visual style, typography hints, avoid-list).
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Verify ownership. This previously did `const { prisma } = await
    // import("@/lib/prisma")`, but that module only has a default export, so
    // `prisma` was undefined and the route threw on every call.
    const brand = await prisma.brandKit.findFirst({ where: { id, userId: user.id } });
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const fingerprint = await extractBrandFingerprint(id);
    return NextResponse.json({ success: true, fingerprint });
  } catch (e) {
    return authzResponse(e);
  }
}