import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { analyzeImage } from "@/lib/visual-intelligence";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// POST /api/analyze — run Visual Intelligence on an image (spec §11).
// Stores a VisualAnalysis row (assetUrl, caption, palette, regions, etc.)
// and returns the structured analysis.
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/analyze");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const body = await req.json();
    if (!body.imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

    const analysis = await analyzeImage(body.imageUrl, { force: body.force, userId: user.id });
    return NextResponse.json(analysis, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}

// GET /api/analyze — list recent visual analyses (by assetUrl if provided).
export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const assetUrl = searchParams.get("assetUrl");
    // Always scoped to the caller — an unscoped `where` listed every user's
    // analyses (and the image URLs they were run against).
    const where = { userId: user.id, ...(assetUrl ? { assetUrl } : {}) };
    return NextResponse.json(
      await prisma.visualAnalysis.findMany({ where, orderBy: { createdAt: "desc" }, take: 20 })
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
