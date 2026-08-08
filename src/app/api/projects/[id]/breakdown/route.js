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
  sceneShotsPrompt,
  splitScenes,
  parseStructureReply,
  parseSceneShotsReply,
  sceneIsCovered,
} from "@/lib/script-breakdown-passes.mjs";
import { shotDurationLimits } from "@/lib/project-models.mjs";
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

/* TWO PASSES.

   One reply for the whole screenplay is unstable in exactly the way that
   matters: the SAME script came back with 37 shots on one run and 17 on
   the next, five conversation scenes collapsed to a single shot each. The
   model was running out of room and compressing, and each field added to
   the shot shape made it compress harder.

   Structure first — who, where, which objects, which scenes — then one
   pass per scene for its shots. Each reply is small, none competes with
   the others for room, and coverage is checked scene by scene instead of
   hoped for. */
async function readScreenplay(script, onProgress, { limits = null, keepIndexes = new Set() } = {}) {
  // ── Pass 1: what the production needs to exist ────────────────────────
  let structure = null;
  {
    const messages = [
      { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
      { role: "user", content: script },
    ];
    for (let attempt = 0; attempt < 2 && !structure; attempt++) {
      const reply = await llmComplete(messages, {
        maxTokens: 8000, temperature: 0.2, timeout: 300000, withMeta: true,
      });
      structure = parseStructureReply(reply?.content || "");
      if (!structure) {
        if (reply?.truncated) return { breakdown: null, truncated: true };
        messages.push({ role: "user", content: SCRIPT_BREAKDOWN_RETRY_HINT });
      }
    }
  }
  if (!structure) return { breakdown: null, truncated: false };

  // ── Pass 2: each scene's shots, on its own ────────────────────────────
  const sceneTexts = splitScenes(script);
  const context = JSON.stringify({
    characters: structure.characters,
    environments: structure.environments,
    props: structure.props,
    toneReferences: structure.toneReferences,
  });

  const scenes = [];
  for (let i = 0; i < structure.scenes.length; i++) {
    const scene = structure.scenes[i];

    /* A scene already shot is left exactly as it is. Re-reading a script
       to improve the scenes you have NOT made must not throw away the
       ones you have — those cost money and are on screen. */
    if (keepIndexes.has(i)) {
      scenes.push({ ...scene, shots: [], keep: true });
      onProgress?.(i + 1, structure.scenes.length);
      continue;
    }
    // Match by position first — the structure pass is asked for scenes in
    // order — and fall back to the whole script if the split disagrees.
    const text = sceneTexts[i]?.text || script;

    const messages = [
      { role: "system", content: sceneShotsPrompt(limits || undefined) },
      {
        role: "user",
        content: `THE PRODUCTION:
${context}

SCENE ${scene.id} — ${scene.heading}
Environment key: ${scene.environmentKey || "unknown"}

${text}`,
      },
    ];

    let shots = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await llmComplete(messages, {
        maxTokens: 8000, temperature: 0.3, timeout: 300000, withMeta: true,
      });
      const parsed = parseSceneShotsReply(reply?.content || "");
      if (parsed) {
        shots = parsed;
        // A scene that came back with a fraction of its dialogue is a
        // summary, not a breakdown. Ask once more before accepting it.
        if (sceneIsCovered(text, parsed)) break;
        messages.push({ role: "user", content: SCENE_COVERAGE_RETRY_HINT });
      } else {
        messages.push({ role: "user", content: SCRIPT_BREAKDOWN_RETRY_HINT });
      }
    }

    scenes.push({ ...scene, shots: shots || [] });
    onProgress?.(i + 1, structure.scenes.length);
  }

  /* Normalised through the SAME path the single-pass read used, so every
     rule about shot ids, durations, variants and speaker resolution
     applies identically however the breakdown was produced. */
  const breakdown = parseScriptBreakdown(JSON.stringify({ ...structure, scenes }), limits);
  // The keep flag does not survive normalisation, so it is re-applied by
  // position — the only thing that ties a structure scene to a kept one.
  if (breakdown) {
    breakdown.scenes = breakdown.scenes.map((sc, i) => (keepIndexes.has(i) ? { ...sc, keep: true } : sc));
  }
  return { breakdown, truncated: false };
}

/* The work itself. Runs detached from the request that started it, so
   every exit path has to record its own outcome — an unrecorded failure
   leaves the project reading forever. */
async function runBreakdown({ projectId, userId, script, settings, replace, keepSceneIds = [] }) {
  const started = Date.now();
  try {
    /* How long a shot may be, read off the model this project renders on.
       Ten seconds was a constant, not a fact: Seedance 2.5 holds thirty.
       Capping at the lowest common denominator chops a conversation into
       five clips where one would do — five generations, five cuts, five
       chances for the room to change. */
    let limits = null;
    if (settings.videoModel) {
      const row = await prisma.modelPricing.findUnique({ where: { modelId: settings.videoModel } }).catch(() => null);
      if (row) limits = shotDurationLimits({ schema: row.inputSchema });
    }

    /* Scenes already shot, by POSITION in the screenplay — the only thing
       that ties an existing pipeline to a scene the structure pass will
       return. */
    const existingOrdered = await prisma.directorPipeline.findMany({
      where: { projectId, userId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const keepIndexes = new Set(
      existingOrdered.map((p, i) => (keepSceneIds.includes(p.id) ? i : -1)).filter((i) => i >= 0),
    );
    const keptByIndex = new Map(
      [...keepIndexes].map((i) => [i, existingOrdered[i].id]),
    );

    const { breakdown, truncated } = await readScreenplay(script, (done, total) => {
      // Reading eleven scenes takes minutes; saying which one is being
      // read turns a blank wait into visible progress.
      setBreakdownState(projectId, {
        status: "reading",
        startedAt: new Date(started).toISOString(),
        scenesRead: done,
        scenesTotal: total,
      }).catch(() => {});
    }, { limits, keepIndexes });
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
      // renders somebody paid for. Scenes explicitly kept stay attached.
      await prisma.directorPipeline.updateMany({
        where: { projectId, userId, id: { notIn: keepSceneIds.length ? keepSceneIds : ["__none__"] } },
        data: { projectId: null },
      });
    }

    const boards = breakdownToScenes(breakdown, { aspectRatio, entityIdByKey: matched });

    const scenes = [];
    for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
      const board = boards[boardIndex];

      // A kept scene is already in the project, with its renders. Nothing
      // to create, and nothing to overwrite.
      if (keptByIndex.has(boardIndex)) {
        scenes.push({ id: keptByIndex.get(boardIndex), title: board.title, shots: 0, kept: true });
        continue;
      }
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
