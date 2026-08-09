import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import prisma from "@/lib/prisma";
import { llmComplete } from "@/lib/providers";
import {
  SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
  SCRIPT_BREAKDOWN_RETRY_HINT,
  parseScriptBreakdown,
  breakdownSummary,
  coverageWarnings,
} from "@/lib/script-breakdown.mjs";
import {
  STRUCTURE_SYSTEM_PROMPT,
  SCENE_COVERAGE_RETRY_HINT,
  SCENE_BUDGET_RETRY_HINT,
  shotBudget,
  sceneIsWithinBudget,
  sceneShotsPrompt,
  splitScenes,
  parseStructureReply,
  parseSceneShotsReply,
  variantProblems,
  VARIANT_RETRY_HINT,
  sceneIsCovered,
  keepOffscreenOffscreen,
  tightenDurations,
  attributeSpeakers,
} from "@/lib/script-breakdown-passes.mjs";
import { shotDurationLimits } from "@/lib/project-models.mjs";
import {
  breakdownToScenes,
  castFromBreakdown,
  matchExistingEntities,
} from "@/lib/project-breakdown.mjs";
import {
  getOwnedProject, normalizeSettings, listScenes,
  breakdownState, setBreakdownState, orderByScreenplay,
} from "@/lib/projects";
import { estimateDirectorCost } from "@/lib/director-planner";
import { log } from "@/lib/log";
import { runBreakdown } from "@/lib/screenplay-breakdown";

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/projects");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { id } = await params;
    const project = await getOwnedProject(user.id, id);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });

    const script = (project.brief || "").trim();
    if (script.length < 200) {
      return apiError({
        code: "invalid_params",
        message: "Add the scenario under “Scenario & format” first — there is nothing here to break down.",
      });
    }
    if (!process.env.OPENROUTER_KEY) {
      return apiError({ code: "internal", message: "The script reader is unavailable right now.", retryable: true });
    }

    // One read at a time. Two concurrent reads would each create a full set
    // of scenes and leave the project with two.
    const state = breakdownState(project);
    if (state.status === "reading") {
      return NextResponse.json({ breakdown: state }, { status: 202 });
    }

    const body = await req.json().catch(() => ({}));
    const existingScenes = await listScenes(user.id, id);
    if (existingScenes.length && !body.replace) {
      return apiError({
        code: "invalid_params",
        message: `This project already has ${existingScenes.length} scene${existingScenes.length === 1 ? "" : "s"}. Breaking the scenario down again would sit a second set beside them.`,
      });
    }

    const startedAt = new Date().toISOString();
    await setBreakdownState(id, { status: "reading", startedAt });

    // Detached on purpose: the read outlives any reasonable request. The
    // app runs as a long-lived Node process, so this keeps going after the
    // response is sent; a restart mid-read is caught by the staleness check
    // in breakdownState rather than leaving the UI spinning forever.
    void runBreakdown({
      projectId: id,
      userId: user.id,
      script,
      settings: normalizeSettings(project.data || {}),
      replace: !!body.replace,
      // Scenes already shot, left exactly as they are.
      keepSceneIds: Array.isArray(body.keepSceneIds)
        ? body.keepSceneIds.filter((v) => typeof v === "string" && v)
        : [],
    });

    return NextResponse.json({ breakdown: { status: "reading", startedAt } }, { status: 202 });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    const { id } = await params;
    const project = await getOwnedProject(user.id, id);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });
    return NextResponse.json({ breakdown: breakdownState(project) });
  } catch (e) {
    return authzResponse(e);
  }
}
