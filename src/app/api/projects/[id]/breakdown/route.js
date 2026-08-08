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
import { getOwnedProject, normalizeSettings, listScenes } from "@/lib/projects";
import { log } from "@/lib/log";

/* P1.5 — cut the scenario into scenes and shots.
   ────────────────────────────────────────────────────────────────────────
   One read of the screenplay produces the whole film's structure: who is in
   it, where it happens, and every shot of every scene. Each scene becomes a
   board you can approve, re-plan or shoot on its own.

   This is a single LLM read, not eleven. Planning scene by scene re-reads
   the script each time and lets the same character come back described
   differently — which is the drift that makes a face change between scenes.

   Spends no credits. The shots cost money when they are rendered. */

export const maxDuration = 800;

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
      timeout: 600000,
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

    const body = await req.json().catch(() => ({}));
    const existingScenes = await listScenes(user.id, id);
    if (existingScenes.length && !body.replace) {
      return apiError({
        code: "invalid_params",
        message: `This project already has ${existingScenes.length} scene${existingScenes.length === 1 ? "" : "s"}. Breaking the scenario down again would sit a second set beside them.`,
      });
    }

    if (!process.env.OPENROUTER_KEY) {
      return apiError({ code: "internal", message: "The script reader is unavailable right now.", retryable: true });
    }

    const started = Date.now();
    const { breakdown, truncated } = await readScreenplay(script);
    if (!breakdown) {
      log.error("project_breakdown_failed", { projectId: id, truncated, chars: script.length });
      return apiError({
        code: "internal",
        title: "The script could not be read",
        message: truncated
          ? "That screenplay is longer than one read can hold. Split it and break down each part as its own project for now."
          : "The reader did not return a usable breakdown. Try again in a moment.",
        retryable: true,
      });
    }

    const settings = normalizeSettings(project.data || {});
    // The breakdown proposes an aspect ratio; the PROJECT decides it. That
    // is the entire point of the setting living up there.
    const aspectRatio = settings.aspectRatio;

    /* ── Cast and places ──────────────────────────────────────────────────
       Matched against what the user already built before anything is
       created, so a character with real reference photographs is reused
       rather than shadowed by an empty duplicate. */
    const wanted = castFromBreakdown(breakdown, { minAppearances: MIN_APPEARANCES });
    const existing = await prisma.studioEntity.findMany({
      where: { userId: user.id, kind: { in: ["character", "environment"] } },
      select: { id: true, kind: true, name: true, projectId: true },
      take: 200,
    });
    const { matched, missing } = matchExistingEntities(wanted, existing);

    const created = [];
    for (const want of missing) {
      const entity = await prisma.studioEntity.create({
        data: {
          userId: user.id,
          projectId: id,
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

    // File anything that matched but lived outside the project.
    const strays = existing.filter((e) => [...matched.values()].includes(e.id) && e.projectId !== id);
    if (strays.length) {
      await prisma.studioEntity.updateMany({
        where: { id: { in: strays.map((e) => e.id) }, userId: user.id },
        data: { projectId: id },
      });
    }

    /* ── Scenes ─────────────────────────────────────────────────────────── */
    if (body.replace && existingScenes.length) {
      // Detach rather than delete: a scene that was already shot holds
      // renders somebody paid for.
      await prisma.directorPipeline.updateMany({
        where: { projectId: id, userId: user.id },
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
      const pipeline = await prisma.directorPipeline.create({
        data: {
          userId: user.id,
          projectId: id,
          title: board.title,
          type: "short_film",
          status: "planning",
          plan: board.plan,
          brief: {
            title: board.title,
            concept: board.scene.summary || "",
            type: "short_film",
            aspectRatio,
            characters: (board.scene.shots || [])
              .flatMap((s) => s.characters || [])
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((key) => {
                const c = (breakdown.characters || []).find((x) => x.key === key);
                return c ? { name: c.name, description: c.description || "" } : null;
              })
              .filter(Boolean),
          },
        },
      });
      scenes.push({ id: pipeline.id, title: pipeline.title, shots: board.plan.shots.length });
    }

    const summary = breakdownSummary(breakdown);
    const warnings = coverageWarnings(breakdown, script);
    log.info("project_breakdown_done", {
      projectId: id,
      scenes: scenes.length,
      shots: summary?.shotCount ?? null,
      created: created.length,
      ms: Date.now() - started,
    });

    return NextResponse.json({
      success: true,
      scenes,
      cast: { created, reused: wanted.length - created.length },
      summary,
      warnings,
    }, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}
