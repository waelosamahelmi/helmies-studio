import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import prisma from "@/lib/prisma";

/* Stop a scene that is rendering.
   ────────────────────────────────────────────────────────────────────────
   Cooperative, and honest about what that means: the shot already at a
   provider finishes and is billed, because abandoning it would pay for
   something and then throw it away. Every shot that has not started is
   refunded when the run settles.

   A scene not currently running is simply marked cancelled — no refund,
   because nothing was reserved. */

const RUNNING = ["queued", "generating_images", "generating_videos", "generating_audio", "quality_check", "assembling"];

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json().catch(() => ({}));
    const planId = typeof body.planId === "string" ? body.planId : "";
    if (!planId) return apiError({ code: "bad_request", message: "planId required" });

    const pipeline = await prisma.directorPipeline.findFirst({
      where: { id: planId, userId: user.id },
      select: { id: true, status: true },
    });
    if (!pipeline) return apiError({ code: "not_found", message: "Scene not found" });

    if (!RUNNING.includes(pipeline.status)) {
      return NextResponse.json({
        success: true,
        stopped: false,
        message: "That scene is not rendering.",
      });
    }

    await prisma.directorPipeline.update({
      where: { id: pipeline.id },
      data: { cancelRequested: true },
    });

    return NextResponse.json({
      success: true,
      stopped: true,
      message: "Stopping after the shot already in progress — that one is billed either way. The rest are refunded.",
    });
  } catch (e) {
    return authzResponse(e);
  }
}
