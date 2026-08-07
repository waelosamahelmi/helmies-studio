import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import prisma from "@/lib/prisma";
import { advanceAgentRun } from "@/lib/agent-runner";

// Phase A (A1.6.4) — cancel a durable agent run. Owner-scoped. Sets
// cancelRequested; advanceAgentRun skips all pending steps, lets in-flight
// provider work finish (never charged — money rule 3), releases the
// reservation's remainder, and lands the run in `cancelled`.
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const run = await prisma.agentRun.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true } });
    if (!run) return apiError({ code: "not_found", message: "Run not found" });
    if (run.status !== "executing" && run.status !== "pending") {
      return NextResponse.json({ run: { id: run.id, status: run.status }, cancelRequested: false });
    }

    await prisma.agentRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
    // Kick the state machine now rather than waiting for the next job tick.
    await advanceAgentRun(run.id).catch(() => {});

    return NextResponse.json({ run: { id: run.id, status: "cancelling" }, cancelRequested: true });
  } catch (e) {
    return authzResponse(e);
  }
}
