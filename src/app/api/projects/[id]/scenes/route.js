import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import { createProductionPlan, DirectorPlanError } from "@/lib/director-planner";
import { getProjectContents, listScenes, attachScene, kindOf } from "@/lib/projects";

/* P1.2 — the scenes of a project.
   ────────────────────────────────────────────────────────────────────────
   Adding a scene is the one place the project's spine pays off: the format,
   the production type and the cast are already known, so the only thing
   asked for is what happens in this scene. Everything else is read off the
   project rather than re-typed, which is exactly what stopped happening
   when each shot had to be told the aspect ratio by hand.

   Planning spends no credits — it is an LLM call that produces a shot list.
   The shots cost money when they are rendered, in Director, behind its own
   quote. */

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    const { id } = await params;
    const scenes = await listScenes(user.id, id);
    return NextResponse.json({ scenes });
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
    const contents = await getProjectContents(user.id, id);
    if (!contents) return apiError({ code: "not_found", message: "Project not found" });

    const body = await req.json().catch(() => ({}));
    const concept = String(body.concept || "").trim();
    if (!concept) {
      return apiError({ code: "invalid_params", message: "Describe what happens in this scene." });
    }

    const { project, settings, cast, products, environments } = contents;
    const kind = kindOf(settings.kind);

    // Who is in it. The cast filed under this project travels into the
    // brief with its reference photograph, so the planner writes shots for
    // people who already have a face rather than inventing strangers.
    const wanted = Array.isArray(body.entityIds) && body.entityIds.length
      ? new Set(body.entityIds)
      : null;
    const members = [...cast, ...products, ...environments]
      .filter((e) => (wanted ? wanted.has(e.id) : e.kind === "character"))
      .slice(0, 12);

    const characters = members.map((e) => {
      const refs = Array.isArray(e.references) ? e.references : [];
      const primary = refs.find((r) => r.kind === "face_front") || refs.find((r) => r.locked) || refs[0];
      return {
        name: e.name,
        description: e.description || "",
        ...(primary?.url ? { referenceUrl: primary.url } : {}),
      };
    });

    const sceneNo = (contents.scenes?.length || 0) + 1;
    const result = await createProductionPlan(
      {
        title: String(body.title || `${kind.unit} ${sceneNo}`).slice(0, 120),
        // The whole scenario as context, this scene as the instruction —
        // so a scene knows where it sits in the story it belongs to.
        concept: project.brief
          ? `${concept}\n\n--- The production this belongs to ---\n${project.brief.slice(0, 12000)}`
          : concept,
        style: String(body.style || "").slice(0, 500),
        mood: String(body.mood || "").slice(0, 500),
        duration: Number.isFinite(body.duration) ? body.duration : 30,
        type: kind.directorType,
        aspectRatio: settings.aspectRatio,
        characters,
        references: characters.map((c) => c.referenceUrl).filter(Boolean),
      },
      user.id,
    );

    await attachScene(user.id, id, result.pipelineId);

    return NextResponse.json(
      { sceneId: result.pipelineId, plan: result.plan, costEstimate: result.costEstimate },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DirectorPlanError) {
      return apiError({
        status: e.status, code: "internal", title: "Planning failed",
        message: e.message, errorId: e.errorId, retryable: true,
      });
    }
    if (e?.code === "invalid_params") {
      return apiError({ code: "invalid_params", message: e.message });
    }
    return authzResponse(e);
  }
}
