import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createProductionPlan, estimateDirectorCost, validateShotPlan } from "@/lib/director-planner";
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

    const plan = await createProductionPlan(brief, user.id);
    const costEstimate = await estimateDirectorCost(plan, brief);

    const validation = {
      allValid: true,
      results: (plan.shots || []).map((shot, i) => {
        const v = validateShotPlan(shot);
        return { shotIndex: i, valid: v.valid, errors: v.errors || [] };
      }),
    };
    validation.allValid = validation.results.every((r) => r.valid);

    return NextResponse.json({
      plan,
      pipelineId: plan.id,
      costEstimate,
      validation,
    }, { status: 201 });
  } catch (e) {
    return authzResponse(e);
  }
}
