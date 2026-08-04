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

    // `await` works whether params is a promise (Next 15+) or a plain object.
    // Reading `params.id` off the promise gave undefined, which Prisma treats
    // as "no filter" — so this route ran whichever workflow the user had
    // touched most recently and then died creating the run row. Same fix as
    // the sibling publish route already carries.
    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    const { inputs } = await req.json();
    const result = await executeWorkflow(id, user.id, inputs || {});
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

    // Without the await this was `deleteMany({ id: undefined, userId })` —
    // Prisma drops an undefined filter, so deleting one workflow deleted
    // every workflow the user owned.
    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    await deleteWorkflow(id, user.id);
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

    // Same undefined-id hazard as DELETE above: saving one workflow was
    // writing this payload over every workflow the user owned.
    const { id } = await params;
    if (!id) return apiError({ code: "bad_request", message: "id required" });

    const body = await req.json();
    if (body.publish) {
      await publishWorkflow(id, user.id);
      return NextResponse.json({ success: true });
    }
    await updateWorkflow(id, user.id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    return authzResponse(e);
  }
}