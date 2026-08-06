import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// ── Agent runs for a session (2026-08-06) ──────────────────────────────────
// Lets the client re-attach a run that is still executing after a tab
// switch or browser close: resumed sessions call this, and any run that is
// still live becomes a progress card in the feed. Owned-scope only.

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

    const where = { userId: user.id, ...(sessionId ? { sessionId } : {}) };
    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        task: true,
        creditsEstimated: true,
        creditsUsed: true,
        error: true,
        result: true,
        sessionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ runs });
  } catch (e) {
    return authzResponse(e);
  }
}
