import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

// GET /api/templates/runs/[runId] — poll a TemplateRun's status/per-step
// state. Read-only, scoped to the caller: a run belonging to someone else
// (or that doesn't exist) reports 404 either way, never leaking which case
// it was. Mirrors /api/generations/status's shape (auth: user, no origin
// check needed — this has no side effect).
export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { runId } = await params;
    const run = await prisma.templateRun.findUnique({ where: { id: runId } });
    if (!run || run.userId !== user.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: run.id,
      templateId: run.templateId,
      versionId: run.versionId,
      status: run.status,
      stepState: run.stepState,
      totalCredits: run.totalCredits,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
