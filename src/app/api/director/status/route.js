import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

// E4.1: director plans live in `directorPipeline` (created by
// director-planner.js's createProductionPlan) with per-shot execution state
// in `directorShot` — this route used to query `prisma.project`, a table no
// director code ever writes, so status polls 404'd and the recents list was
// always wrong. The response shape is exactly what DirectorStudio already
// parses: pipeline.{id,status,plan,brief,costEstimate,assembledUrl,shots[]}.
export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });
    const pipelineId = new URL(req.url).searchParams.get("pipelineId");

    if (pipelineId) {
      const pipeline = await prisma.directorPipeline.findFirst({
        where: { id: pipelineId, userId: user.id },
      });
      if (!pipeline) return apiError({ code: "not_found", message: "Pipeline not found" });

      const shots = await prisma.directorShot.findMany({
        where: { pipelineId: pipeline.id },
        orderBy: { index: "asc" },
      });

      return NextResponse.json({
        pipeline: {
          id: pipeline.id,
          title: pipeline.title,
          type: pipeline.type,
          status: pipeline.status,
          plan: pipeline.plan,
          brief: pipeline.brief,
          costEstimate: pipeline.costEstimate,
          assembledUrl: pipeline.assembledUrl,
          stateMetadata: pipeline.stateMetadata,
          rerunHistory: pipeline.rerunHistory,
          createdAt: pipeline.createdAt,
          updatedAt: pipeline.updatedAt,
          shots: shots.map((s) => ({
            id: s.id,
            // DirectorShot.id is now namespaced to its pipeline
            // (director-executor.js's shotRowId) so rows never collide
            // across pipelines — but the client keeps mapping shots by the
            // PLAN-LOCAL id ("shot_000", …) it sent to generate-shot/rerun
            // (see DirectorStudio.js's readRun/runIndex/cards). `s.plan` is
            // the shot's plan snapshot, so its `.id` is that plan-local id.
            shotId: s.plan?.id ?? null,
            index: s.index,
            title: s.title,
            status: s.status,
            plan: s.plan,
            imageResult: s.imageResult,
            videoResult: s.videoResult,
            audioResult: s.audioResult,
            error: s.error,
          })),
        },
      });
    }

    const pipelines = await prisma.directorPipeline.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        costEstimate: true,
        assembledUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ pipelines });
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "director/status" } });
  }
}
