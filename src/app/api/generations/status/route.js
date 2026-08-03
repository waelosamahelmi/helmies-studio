import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUserWithCredits } from "@/lib/session";
import { apiError } from "@/lib/api-error";

// Phase 4A Task 6: additive-only job fields. Generation.status stays
// pending/processing/completed/failed (the client contract in
// src/components/studio/useAsyncGeneration.js polls on THOSE values) — the
// JOB carries its own queued/running/succeeded/failed/dead vocabulary
// separately, exposed here as jobStatus/attempts/queuedAt (+ maxAttempts,
// Task E2.2 — the client's "Retrying (attempt N of M)…" note needs the
// denominator), null for a generation with no GenerationJob row (legacy, or
// a sync-route generation).
function withJobFields(gen, job) {
  return {
    ...gen,
    jobStatus: job?.status ?? null,
    attempts: job?.attempts ?? null,
    maxAttempts: job?.maxAttempts ?? null,
    queuedAt: job?.createdAt ?? null,
  };
}

export async function GET(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return apiError({ code: "unauthorized" });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (id) {
      const gen = await prisma.generation.findFirst({
        where: { id, userId: user.id },
        select: { id: true, status: true, outputUrl: true, error: true, creditsUsed: true, createdAt: true, model: true, prompt: true },
      });
      if (!gen) return apiError({ code: "not_found", message: "Not found" });

      const job = await prisma.generationJob.findUnique({
        where: { generationId: id },
        select: { status: true, attempts: true, maxAttempts: true, createdAt: true },
      }).catch(() => null);

      return NextResponse.json(withJobFields(gen, job));
    }

    const generations = await prisma.generation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: { id: true, status: true, outputUrl: true, error: true, creditsUsed: true, createdAt: true, model: true, prompt: true, tool: true },
    });

    // Batched lookup — one query for the whole page rather than N+1.
    const jobs = generations.length
      ? await prisma.generationJob.findMany({
          where: { generationId: { in: generations.map((g) => g.id) } },
          select: { generationId: true, status: true, attempts: true, maxAttempts: true, createdAt: true },
        }).catch(() => [])
      : [];
    const jobByGenerationId = new Map(jobs.map((j) => [j.generationId, j]));
    const generationsWithJobs = generations.map((g) => withJobFields(g, jobByGenerationId.get(g.id)));

    const total = await prisma.generation.count({ where: { userId: user.id } });

    return NextResponse.json({ generations: generationsWithJobs, total, hasMore: offset + limit < total });
  } catch (e) {
    return apiError({ code: "internal", cause: e, context: { route: "generations/status" } });
  }
}
