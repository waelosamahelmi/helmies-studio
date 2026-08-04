import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { llmComplete } from "@/lib/providers";
import { extractJsonObject } from "@/lib/director-planner";
import { validateTimelineOps, TIMELINE_OPS } from "@/lib/timeline-ops";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

// E4.4: natural-language timeline edits. The LLM sees the pipeline's real
// clip list and must answer with a constrained {ops:[...]} object; every op
// is validated server-side (indexes against the real clip count, trim/split
// math) before it reaches the client. This route NEVER assembles anything —
// the user applies the ops to their timeline and still clicks Re-assemble.

function buildMessages(clips, instruction) {
  const clipLines = clips
    .map((c) => `  ${c.index}: "${c.title}"${c.seconds != null ? ` (${c.seconds}s)` : ""}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a video timeline editor. You translate an editing instruction into a strict JSON operation list.

The ONLY valid operations (op values: ${TIMELINE_OPS.join(", ")}):
  {"op":"trim","index":<clip index>,"inSec":<number, optional>,"outSec":<number, optional>}
  {"op":"reorder","from":<clip index>,"to":<clip index>}
  {"op":"remove","index":<clip index>}
  {"op":"split","index":<clip index>,"atSec":<seconds from the clip's start>}

Rules:
- Indexes are zero-based positions in the CURRENT clip list and must account for how your earlier ops change it (a remove shifts later clips down, a split adds one).
- Emit the FEWEST ops that satisfy the instruction.
- If the instruction cannot be expressed with these ops, reply {"ops":[]}.
- Reply with ONLY the JSON object — no markdown, no commentary.`,
    },
    {
      role: "user",
      content: `CURRENT TIMELINE (index: title):\n${clipLines}\n\nINSTRUCTION: ${instruction}`,
    },
  ];
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    const pipelineId = body.pipelineId;
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 500) : "";
    if (!pipelineId || !instruction) {
      return apiError({ code: "bad_request", message: "pipelineId and instruction required" });
    }

    const pipeline = await prisma.directorPipeline.findFirst({
      where: { id: pipelineId, userId: user.id },
    });
    if (!pipeline) return apiError({ code: "not_found", message: "Pipeline not found" });

    const shots = await prisma.directorShot.findMany({
      where: { pipelineId },
      orderBy: { index: "asc" },
    });
    const clips = shots
      .filter((s) => s.videoResult?.url)
      .map((s, i) => ({ index: i, title: s.title || `Shot ${i + 1}`, seconds: s.plan?.durationSec ?? null }));
    if (clips.length === 0) {
      return apiError({ code: "invalid_params", message: "This production has no rendered clips to edit yet." });
    }

    let response;
    try {
      response = await llmComplete(buildMessages(clips, instruction), {
        temperature: 0,
        maxTokens: 800,
      });
    } catch (e) {
      if (/not configured|api.?key|unauthorized/i.test(e.message)) {
        return apiError({ code: "missing_provider_key", cause: e, context: { route: "director/timeline-chat" } });
      }
      throw e;
    }

    const jsonText = extractJsonObject(response);
    let parsed = null;
    if (jsonText) {
      try { parsed = JSON.parse(jsonText); } catch { parsed = null; }
    }
    if (!parsed || !Array.isArray(parsed.ops)) {
      return apiError({
        code: "invalid_params",
        message: "That instruction couldn't be turned into timeline edits. Try rephrasing it.",
      });
    }

    const result = validateTimelineOps(parsed.ops, clips.length);
    if (!result.ok) {
      return apiError({
        code: "invalid_params",
        message: "That instruction produced edits that don't fit this timeline. Try rephrasing it.",
        details: result.errors,
      });
    }

    return NextResponse.json({ ops: parsed.ops });
  } catch (e) {
    return authzResponse(e);
  }
}
