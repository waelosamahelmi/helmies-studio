import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createProductionPlan, DirectorPlanError } from "@/lib/director-planner";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const body = await req.json();
    const brief = {
      concept: body.concept || "",
      style: body.style || "",
      mood: body.mood || "",
      title: body.title || "Untitled Production",
      duration: body.duration || 30,
      platform: body.platform || "youtube",
      type: body.type || "short_form",
      shots: body.shots || [],
      model: body.model,
    };

    // createProductionPlan already runs the shot validators and computes the
    // cost estimate internally — its return value is { plan, costEstimate,
    // validation, pipelineId, ... }, not the raw plan. Re-deriving either
    // from a second, differently-shaped call was the source of the
    // production "e.shots is not iterable" crash (estimateDirectorCost was
    // being handed this wrapper object instead of `result.plan`).
    const result = await createProductionPlan(brief, user.id);

    return NextResponse.json({
      plan: result.plan,
      pipelineId: result.pipelineId,
      costEstimate: result.costEstimate,
      validation: result.validation,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof DirectorPlanError) {
      return NextResponse.json({ error: e.message, errorId: e.errorId }, { status: e.status });
    }
    return authzResponse(e);
  }
}
