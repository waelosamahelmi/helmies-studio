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
  breakdownToScenes,
  castFromBreakdown,
  matchExistingEntities,
} from "@/lib/project-breakdown.mjs";
import {
  getOwnedProject, normalizeSettings, listScenes,
  breakdownState, setBreakdownState,
} from "@/lib/projects";
import { estimateDirectorCost } from "@/lib/director-planner";
import { log } from "@/lib/log";

/* P1.5 — cut the scenario into scenes and shots.
   ────────────────────────────────────────────────────────────────────────
   One read of the screenplay produces the whole film's structure: who is in
   it, where it happens, and every shot of every scene. Each scene becomes a
   board you can approve, re-plan or shoot on its own.

   This is a single LLM read, not one per scene. Reading scene by scene lets
   the same character come back described differently, which is the drift
   that makes a face change between scenes.

   IT DOES NOT HOLD THE REQUEST OPEN. The first version did, and on a real
   screenplay it ran past nginx's 300-second ceiling: the client got an HTML
   error page and the work was lost. POST now starts the read and returns;
   the state lives on the project and GET reports it.

   Spends no credits. The shots cost money when they are rendered. */

// Anyone appearing in the film gets an identity, because that is what holds
// a face still. A person seen once still has to look like themselves.
const MIN_APPEARANCES = 1;

async function readScreenplay(script) {
  const messages = [
    { role: "system", content: SCRIPT_BREAKDOWN_SYSTEM_PROMPT },
    { role: "user", content: script },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await llmComplete(messages, {
      maxTokens: 32000,
      temperature: 0.3,
      timeout: 900000,
      withMeta: true,
    });
    const text = reply?.content || "";
    const breakdown = parseScriptBreakdown(text);
    if (breakdown) return { breakdown, truncated: false };
    // A truncated reply fails again at the same place — retrying spends
    // time and money to reproduce the same ceiling.
    if (reply?.truncated) return { breakdown: null, truncated: true };
    messages.push({ role: "user", content: SCRIPT_BREAKDOWN_RETRY_HINT });
  }
  return { breakdown: null, truncated: false };
}

/* The work itself. Runs detached from the request that started it, so
   every exit path has to record its own outcome — an unrecorded failure
   leaves the project reading forever. */
async function runBreakdown({ projectId, userId, script, settings, replace }) {
  const started = Date.now();
  try {
    const { breakdown, truncated } = await readScreenplay(script);
    if (!breakdown) {
      await setBreakdownState(projectId, {
        status: "failed",
        at: new Date().toISOString(),
        error: truncated
          ? "That screenplay is longer than one read can hold. Split it and break down each part as its own project for now."
          : "The reader did not return a usable breakdown. Try again in a moment.",
      });
      log.error("project_breakdown_failed", { projectId, truncated, chars: script.length });
      return;
    }

    const aspectRatio = settings.aspectRatio;

    /* Cast and places, matched against what the user already built BEFORE
       anything is created — so a character with real reference photographs
       is reused rather than shadowed by an empty duplicate. */
    const wanted = castFromBreakdown(breakdown, { minAppearances: MIN_APPEARANCES });
    const existing = await prisma.studioEntity.findMany({
      where: { userId, kind: { in: ["character", "environment"] } },
      select: { id: true, kind: true, name: true, projectId: true },
      take: 200,
    });
    const { matched, missing } = matchExistingEntities(wanted, existing);

    const created = [];
    for (const want of missing) {
      const entity = await prisma.studioEntity.create({
        data: {
          userId,
          projectId,
          kind: want.kind,
          name: want.name,
          description: want.description || null,
          attributes: {},
          references: [],
          // Draft, deliberately: it has a description and no photographs
          // yet. Marking it ready would claim a face exists that does not.
          status: "draft",
        },
      });
      matched.set(want.key, entity.id);
      created.push({ id: entity.id, kind: entity.kind, name: entity.name });
    }

    const reusedIds = new Set(matched.values());
    const strays = existing.filter((e) => reusedIds.has(e.id) && e.projectId !== projectId);
    if (strays.length) {
      await prisma.studioEntity.updateMany({
        where: { id: { in: strays.map((e) => e.id) }, userId },
        data: { projectId },
      });
    }

    if (replace) {
      // Detach rather than delete: a scene that was already shot holds
      // renders somebody paid for.
      await prisma.directorPipeline.updateMany({
        where: { projectId, userId },
        data: { projectId: null },
      });
    }

    const boards = breakdownToScenes(breakdown, {
      aspectRatio,
      videoModel: settings.videoModel,
      entityIdByKey: matched,
    });

    const scenes = [];
    for (const board of boards) {
      const characters = [...new Set((board.scene.shots || []).flatMap((s) => s.characters || []))]
        .map((key) => (breakdown.characters || []).find((c) => c.key === key))
        .filter(Boolean)
        .map((c) => ({ name: c.name, description: c.description || "" }));

      /* Price it now, not at render time. A scene with no cost estimate
         debits zero and runs the whole thing for free, and the number is
         also what the project header adds up to say what finishing
         costs — an unpriced scene makes that total a lie. */
      const briefForScene = {
        title: board.title,
        concept: board.scene.summary || "",
        type: "short_film",
        aspectRatio,
        // The project's chosen models travel with the scene. Without them
        // the executor fell back to a hardcoded default and rendered every
        // shot on a model nobody picked.
        modelImage: settings.imageModel || undefined,
        modelVideo: settings.videoModel || undefined,
        videoMode: settings.videoMode || "auto",
        characters,
      };
      const costEstimate = await estimateDirectorCost(board.plan, briefForScene).catch(() => null);

      const pipeline = await prisma.directorPipeline.create({
        data: {
          userId,
          projectId,
          title: board.title,
          type: "short_film",
          status: "planning",
          plan: board.plan,
          costEstimate,
          brief: briefForScene,
        },
      });
      scenes.push({ id: pipeline.id, title: pipeline.title, shots: board.plan.shots.length });
    }

    const summary = breakdownSummary(breakdown);
    await setBreakdownState(projectId, {
      status: "done",
      at: new Date().toISOString(),
      scenes: scenes.length,
      shots: summary?.shotCount ?? 0,
      seconds: summary?.totalSeconds ?? 0,
      created: created.length,
      reused: wanted.length - created.length,
      warnings: coverageWarnings(breakdown, script),
    });
    log.info("project_breakdown_done", {
      projectId, scenes: scenes.length, shots: summary?.shotCount ?? null,
      created: created.length, ms: Date.now() - started,
    });
  } catch (e) {
    await setBreakdownState(projectId, {
      status: "failed",
      at: new Date().toISOString(),
      error: "The scenario could not be read. Try again in a moment.",
    }).catch(() => {});
    log.error("project_breakdown_threw", { projectId, error: e?.message });
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
    });

    return NextResponse.json({ breakdown: { status: "reading", startedAt } }, { status: 202 });
  } catch (e) {
    return authzResponse(e);
  }
}
