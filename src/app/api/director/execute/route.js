import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeProductionPipeline } from "@/lib/director-executor";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { log } from "@/lib/log";

/* Rendering a scene does NOT hold the request open.
   ────────────────────────────────────────────────────────────────────────
   A scene is several shots, each a still and then a clip, and a clip alone
   takes minutes. Held on an HTTP request that ran into Cloudflare's 524 at
   100 seconds — the client got an HTML error page while the server kept
   rendering, so the run looked dead and every retry hit "already
   rendering". Exactly the failure the screenplay breakdown had.

   So: the guards that must answer immediately (ownership, credits,
   already-running, pricing) still run inline, because the caller has to be
   told NOW that it cannot afford this or that it is already going. Only
   the rendering itself is detached, and the pipeline's own status is what
   reports progress — /api/director/status already serves it, and the
   Projects scene list already polls it. */

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    if (!body.planId) return apiError({ code: "bad_request", message: "planId required" });

    const options = {
      autoAssemble: body.autoAssemble !== false,
      rerunAll: !!body.rerunAll,
      shotIds: Array.isArray(body.shotIds) ? body.shotIds : undefined,
    };

    /* The first moment of the run — the quote, the credit check, the
       state transition — is awaited so its errors reach the caller as
       errors. `started` resolves as soon as the pipeline is QUEUED; the
       shots carry on after the response is sent. */
    const started = executeProductionPipeline(body.planId, user.id, options);

    // Give the guards a moment to reject. Anything slower than this is the
    // render itself, which nobody should wait on.
    const outcome = await Promise.race([
      started.then((results) => ({ kind: "done", results })).catch((error) => ({ kind: "error", error })),
      new Promise((resolve) => setTimeout(() => resolve({ kind: "running" }), 4000)),
    ]);

    if (outcome.kind === "error") throw outcome.error;
    if (outcome.kind === "done") {
      return NextResponse.json({ success: true, started: false, results: outcome.results });
    }

    // Still going. Make sure a later failure is not an unhandled rejection.
    started.catch((err) => {
      log.error("director_execute_detached_failed", { planId: body.planId, err: err?.message });
    });
    return NextResponse.json(
      {
        success: true,
        started: true,
        message: "Rendering. This runs on the server — you can leave the page.",
      },
      { status: 202 },
    );
  } catch (e) {
    // Business errors (e.g. insufficient credits) thrown from
    // executeProductionPipeline must reach the UI as a clean 402, not be
    // swallowed by authzResponse's blanket 500 "Internal error" — mirrors
    // the shape /api/generate/async already returns for the same condition.
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    // Already rendering is a state, not a fault — say so plainly rather
    // than returning the generic "something went wrong".
    if (e?.code === "already_running") {
      return apiError({ code: "invalid_params", message: e.message });
    }
    return authzResponse(e);
  }
}
