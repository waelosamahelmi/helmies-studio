import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import prisma from "@/lib/prisma";
import { refundCredits } from "@/lib/wallet";
import { log } from "@/lib/log";

/* Stop a scene that is rendering.
   ────────────────────────────────────────────────────────────────────────
   Cooperative, and honest about what that means: the shot already at a
   provider finishes and is billed, because abandoning it would pay for
   something and then throw it away. Every shot that has not started is
   refunded when the run settles.

   A scene not currently running is simply marked cancelled — no refund,
   because nothing was reserved. */

const RUNNING = ["queued", "generating_images", "generating_videos", "generating_audio", "quality_check", "assembling"];

/* How long a run may go without touching anything before we conclude no
   process is watching for the cancel flag. A live run writes a shot row
   as it starts each shot, so silence longer than the slowest single shot
   means the process is gone — a deploy, a restart, a crash. */
const ABANDONED_MS = 6 * 60 * 1000;

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

    /* Is anything actually there to see the flag?

       A cancel that only sets a flag is a cancel that never happens when
       the process running the scene has gone — and that is exactly when
       somebody presses stop, because the scene looks stuck. So: if
       nothing has been written for the scene in ABANDONED_MS, stop it
       here and now, and give back everything that was reserved for shots
       that never ran. */
    const [latestShot, full] = await Promise.all([
      prisma.directorShot.findFirst({
        where: { pipelineId: pipeline.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.directorPipeline.findUnique({
        where: { id: pipeline.id },
        select: { updatedAt: true, costEstimate: true, stateMetadata: true },
      }),
    ]);
    const lastTouch = Math.max(
      new Date(latestShot?.updatedAt || 0).getTime(),
      new Date(full?.updatedAt || 0).getTime(),
    );
    const abandoned = Date.now() - lastTouch > ABANDONED_MS;

    if (abandoned) {
      await prisma.directorPipeline.update({
        where: { id: pipeline.id },
        data: { status: "cancelled", cancelRequested: false },
      });
      await prisma.directorShot.updateMany({
        where: { pipelineId: pipeline.id, status: { in: ["generating_image", "generating_video", "generating_audio"] } },
        data: { status: "failed", error: "Stopped — nothing was rendering this." },
      });
      // Everything reserved for shots that never ran comes back. The
      // executor is not there to settle it, so this is the last chance.
      const reserved = full?.costEstimate?.totalCredits || 0;
      const spent = full?.stateMetadata?.creditsUsed || 0;
      const owed = Math.max(0, reserved - spent);
      if (owed > 0) {
        await refundCredits(user.id, owed, `director:${pipeline.id}`, "Stopped an abandoned run")
          .catch((err) => log.error("director_cancel_refund_failed", { pipelineId: pipeline.id, owed, err: err?.message }));
      }
      return NextResponse.json({
        success: true,
        stopped: true,
        message: owed > 0
          ? `Stopped. Nothing was rendering this any more, and ${owed} credits were returned.`
          : "Stopped. Nothing was rendering this any more.",
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
