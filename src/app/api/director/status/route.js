import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    const pipelineId = new URL(req.url).searchParams.get("pipelineId");
    if (pipelineId) {
      const pipeline = await prisma.project.findFirst({ where: { id: pipelineId, userId: user.id } });
      if (!pipeline) return apiError({ code: "not_found", message: "Pipeline not found" });
      return NextResponse.json({ pipeline });
    }
    return NextResponse.json({ pipelines: await prisma.project.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 20 }) });
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "director/status" } });
  }
}
