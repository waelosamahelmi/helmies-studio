import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProductionPlan, updateProductionPlan } from "@/lib/director-planner";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";

// E4.1: the shot editor's read/write endpoint. PATCH goes through
// updateProductionPlan, which recomputes the cost estimate server-side from
// the edited shots (a client can never set its own price) and refuses edits
// while the pipeline is executing or completed.

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    const { id } = await params;

    const pipeline = await getProductionPlan(id, user.id);
    if (!pipeline) return apiError({ code: "not_found", message: "Pipeline not found" });

    return NextResponse.json({
      pipeline: {
        id: pipeline.id,
        title: pipeline.title,
        type: pipeline.type,
        status: pipeline.status,
        plan: pipeline.plan,
        brief: pipeline.brief,
        costEstimate: pipeline.costEstimate,
        validationResults: pipeline.validationResults,
      },
    });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);
    const { id } = await params;

    const body = await req.json();
    if (!body?.plan || typeof body.plan !== "object" || Array.isArray(body.plan)) {
      return apiError({
        code: "invalid_params",
        message: "A plan object is required.",
        details: ["plan: must be an object of plan fields to update"],
      });
    }

    const result = await updateProductionPlan(id, user.id, body.plan);

    return NextResponse.json({
      plan: result.plan,
      costEstimate: result.costEstimate,
      validation: result.validation,
      status: result.status,
    });
  } catch (e) {
    if (/Pipeline not found/.test(e.message)) {
      return apiError({ code: "not_found", message: "Pipeline not found" });
    }
    if (/Cannot edit plan/.test(e.message)) {
      return apiError({
        status: 409,
        code: "bad_request",
        title: "Plan locked",
        message: "This production is running or finished, so its plan can't be edited right now.",
      });
    }
    return authzResponse(e);
  }
}
