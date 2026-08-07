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
        cancelRequested: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!run) return apiError({ code: "not_found", message: "Run not found" });

    // Full-fidelity per-step rows (AgentRunStep) — result.stepResults holds
    // the legacy, truncated progress shape; review-mode clients need the
    // complete raw step output for $STEP_N_OUTPUT chaining (storyboard JSON
    // is far longer than the 500-char progress preview).
    const steps = await prisma.agentRunStep.findMany({
      where: { runId: run.id },
      orderBy: { stepIndex: "asc" },
      select: {
        stepId: true, stepIndex: true, agent: true, task: true, status: true,
        output: true, outputUrl: true, creditsQuoted: true, creditsActual: true,
        modelUsed: true, error: true,
      },
    });

    // B1.6: honest aggregate progress for polling clients (done/total).
    const stepResults = Array.isArray(run.result?.stepResults) ? run.result.stepResults : [];
    const total = stepResults.length;
    const done = stepResults.filter((s) => ["completed", "failed", "skipped"].includes(s?.status)).length;

    return NextResponse.json({ run: { ...run, steps, progress: { done, total } } });
  } catch (e) {
    return authzResponse(e);
  }
}
