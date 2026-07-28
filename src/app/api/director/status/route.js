import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pipelineId = new URL(req.url).searchParams.get("pipelineId");
    if (pipelineId) {
      const pipeline = await prisma.project.findFirst({ where: { id: pipelineId, userId: user.id } });
      if (!pipeline) return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
      return NextResponse.json({ pipeline });
    }
    return NextResponse.json({ pipelines: await prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 20 }) });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
