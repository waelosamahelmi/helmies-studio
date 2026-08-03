import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { executeWorkflow, deleteWorkflow, updateWorkflow, publishWorkflow } from "@/lib/workflows";

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/workflow");
    if (!rl.allowed) return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });

    const { inputs } = await req.json();
    const result = await executeWorkflow(params.id, user.id, inputs || {});
    return NextResponse.json(result);
  } catch (e) {
    // Business errors (e.g. insufficient credits) thrown from executeWorkflow
    // must reach the UI as a clean 402, not be swallowed by authzResponse's
    // blanket 500 "Internal error" — mirrors the shape /api/generate/async
    // already returns for the same condition.
    if (/Insufficient credits/.test(e.message)) {
      return apiError({ code: "insufficient_credits", message: e.message });
    }
    return authzResponse(e);
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    await deleteWorkflow(params.id, user.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const body = await req.json();
    if (body.publish) {
      await publishWorkflow(params.id, user.id);
      return NextResponse.json({ success: true });
    }
    await updateWorkflow(params.id, user.id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}