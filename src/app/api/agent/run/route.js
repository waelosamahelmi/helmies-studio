import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { startAgentRun } from "@/lib/agent-runner";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { resolveOwnedSession } from "@/lib/agent-sessions";
import prisma from "@/lib/prisma";

// Phase A — DURABLE AGENT RUNS (EDITSv1 E3.2 honored-approvals preserved):
// every mode (background, SSE stream, single JSON) now starts ONE durable
// run via src/lib/agent-runner.js — one reservation per run, steps on the
// GenerationJob queue, resume-safe across restarts. The HTTP connection is
// never load-bearing: `stream:true` merely polls the durable run's state
// and re-emits the legacy SSE frame shapes (step_start / step_complete /
// run_complete) so the client is unchanged.
//
// When body.plan is present it IS the executed plan (never re-planned; the
// server re-quotes and a higher quote rejects with quote_changed — nothing
// is reserved). body.sessionId ties the run to an owned AgentSession.

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

function errorResponse(result) {
  if (result.errorCode === "quote_changed" || result.errorCode === "invalid_plan") {
    return apiError({ code: "invalid_params", message: result.error });
  }
  if (result.errorCode === "blocked") {
    return apiError({ code: "forbidden", message: result.error });
  }
  if (result.errorCode === "model_unavailable") {
    return apiError({ code: "invalid_model", message: result.error, retryable: true });
  }
  // insufficient_credits — and the legacy untagged shape, which only ever
  // meant insufficient credits.
  return apiError({
    code: "insufficient_credits",
    message: result.error,
    extra: { creditsNeeded: result.creditsNeeded, creditsAvailable: result.creditsAvailable },
  });
}

function sseFrame(encoder, event) {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

// Poll a durable run and stream the legacy frame vocabulary. Poll cadence
// 1.5s; hard cap 30 minutes (a run stuck longer is the watchdog's job).
function streamRun(runId) {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const MAX_MS = 30 * 60 * 1000;
  const stream = new ReadableStream({
    async start(controller) {
      const announced = new Set(); // step indexes with step_start sent
      const completed = new Set(); // step indexes with step_complete sent
      try {
        for (;;) {
          const run = await prisma.agentRun.findUnique({ where: { id: runId } }).catch(() => null);
          if (!run) break;
          const stepResults = Array.isArray(run.result?.stepResults) ? run.result.stepResults : [];
          for (const sr of stepResults) {
            const n = sr?.step;
            if (typeof n !== "number") continue;
            if (!announced.has(n) && sr.status && sr.status !== "pending") {
              announced.add(n);
              controller.enqueue(sseFrame(encoder, { type: "step_start", step: n, agent: sr.agent, task: sr.task }));
            }
            if (!completed.has(n) && (sr.status === "completed" || sr.status === "failed" || sr.status === "skipped")) {
              completed.add(n);
              controller.enqueue(
                sseFrame(encoder, {
                  type: "step_complete",
                  step: n,
                  status: sr.status === "completed" ? "completed" : "failed",
                  output: sr.output ?? null,
                  error: sr.error ?? null,
                })
              );
            }
          }
          if (run.status !== "executing" && run.status !== "pending") {
            controller.enqueue(
              sseFrame(encoder, {
                type: "run_complete",
                status: run.status === "completed" ? "done" : "failed",
                summary: run.result?.summary || run.task,
                creditsUsed: run.creditsUsed,
                outputs: run.result?.outputs || [],
                assembled: run.result?.assembled || null,
                error: run.error || null,
              })
            );
            break;
          }
          if (Date.now() - startedAt > MAX_MS) {
            controller.enqueue(
              sseFrame(encoder, { type: "run_complete", status: "failed", error: "Run is taking unusually long — check back in the session history." })
            );
            break;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

async function buildPlanIfNeeded(userId, message, context, sessionId) {
  // No approved plan → plan first (planning is free; the quote guard inside
  // startAgentRun still applies to the freshly computed estimate).
  const { planTask } = await import("@/lib/agents");
  const planned = await planTask(userId, message, context);
  return {
    steps: planned.steps,
    summary: planned.summary || message,
    estimate: planned.estimate,
  };
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/agent");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const body = await req.json();

    const shouldStream = body.stream !== false;
    const message = body.message || body.plan?.summary || "";
    const context = body.context || {};

    if (!message && !body.plan) {
      return apiError({ code: "bad_request", message: "Message or plan required" });
    }

    const session = await resolveOwnedSession(user.id, body.sessionId);

    const plan = body.plan
      ? { ...body.plan, approvedTotal: body.plan?.estimate?.total }
      : await buildPlanIfNeeded(user.id, message, context, session?.id || null);

    let result;
    try {
      result = await startAgentRun({
        userId: user.id,
        plan,
        sessionId: session?.id || null,
        task: message || plan.summary || "Agent production",
        mode: body.mode || null,
        tier: body.tier || null,
        maxCredits: body.plan?.estimate?.total ?? null,
        boundOutputs: Array.isArray(body.boundOutputs) ? body.boundOutputs : [],
      });
    } catch (err) {
      return errorResponse({
        error: err.message,
        errorCode: err.code,
        creditsNeeded: err.creditsNeeded,
        creditsAvailable: err.creditsAvailable,
      });
    }

    if (result?.error) return errorResponse(result);
    if (!result?.runId) {
      return apiError({ code: "internal", message: "Run could not be started." });
    }

    // Background + default single-JSON modes: return the queued handle; the
    // client polls GET /api/agent/run/:id. (Single-JSON mode keeps its
    // legacy "returns immediately" contract — the run is durable now, so
    // blocking here would only re-implement the poll.)
    if (body.background === true || !shouldStream) {
      return NextResponse.json({ queued: true, runId: result.runId, estimate: result.estimate });
    }

    // SSE mode: stream the durable run's progress in the legacy frame shape.
    return streamRun(result.runId);
  } catch (e) {
    return authzResponse(e);
  }
}
