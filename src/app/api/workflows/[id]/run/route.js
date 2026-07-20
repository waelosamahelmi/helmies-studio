import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { executeWorkflow, deleteWorkflow, updateWorkflow, publishWorkflow } from "@/lib/workflows";

export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { inputs } = await req.json();
    const result = await executeWorkflow(params.id, user.id, inputs || {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await deleteWorkflow(params.id, user.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    if (body.publish) {
      await publishWorkflow(params.id, user.id);
      return NextResponse.json({ success: true });
    }
    await updateWorkflow(params.id, user.id, body);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}