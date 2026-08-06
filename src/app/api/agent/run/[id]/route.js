import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";

// ── Agent run status (2026-08-06) ──────────────────────────────────────────
// Background runs execute detached from the browser, so the client polls
// this to render live progress (steps, credits, final outputs) and to pick a
// run back up after a tab switch or browser close. Owned-scope only: a run
// row is only readable by the user who owns it.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { id } = await params;
    const run = await prisma.agentRun.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        status: true,
        task: true,
        creditsEstimated: true,
        creditsUsed: true,
        error: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!run) return apiError({ code: "not_found", message: "Run not found" });
    return NextResponse.json({ run });
  } catch (e) {
    return authzResponse(e);
  }
}
