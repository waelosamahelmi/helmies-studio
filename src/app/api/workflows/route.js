import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserWorkflows, createWorkflow, getTemplateWorkflows, getPublishedWorkflows } from "@/lib/workflows";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "templates") return NextResponse.json(await getTemplateWorkflows());
    if (type === "published") return NextResponse.json(await getPublishedWorkflows());

    return NextResponse.json(await getUserWorkflows(user.id));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, description, steps } = await req.json();
    if (!name || !steps) return NextResponse.json({ error: "Name and steps required" }, { status: 400 });

    const workflow = await createWorkflow(user.id, name, description, steps);
    return NextResponse.json({ success: true, workflow });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}