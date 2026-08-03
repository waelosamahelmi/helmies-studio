import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { apiError } from "@/lib/api-error";
import { getUserWorkflows, createWorkflow, getTemplateWorkflows, getPublishedWorkflows } from "@/lib/workflows";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "templates") return NextResponse.json(await getTemplateWorkflows());
    if (type === "published") return NextResponse.json(await getPublishedWorkflows());

    return NextResponse.json(await getUserWorkflows(user.id));
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "workflows:list" } });
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    verifyOrigin(req);

    const { name, description, steps } = await req.json();
    if (!name || !steps) return apiError({ code: "bad_request", message: "Name and steps required" });

    const workflow = await createWorkflow(user.id, name, description, steps);
    return NextResponse.json({ success: true, workflow });
  } catch (e) {
    return authzResponse(e);
  }
}