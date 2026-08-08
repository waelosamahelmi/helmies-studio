import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { authzResponse } from "@/lib/authz";
import { requireDeveloper } from "@/lib/dev-guard";
import prisma from "@/lib/prisma";

/* Why things are failing — grouped by the RAW provider reason.
   ────────────────────────────────────────────────────────────────────────
   The user sees a branded message on purpose: it does not name the
   upstream provider. The operator needs the opposite, and until now got
   the branded string too, so "An unexpected error occurred" covered
   eleven different models and every distinct cause. Grouped here, with
   ids scrubbed so the same failure lands in the same bucket. */

const DAYS = 14;

// Request ids, cuids and hex blobs make every message unique, which would
// give every failure its own group of one.
const scrub = (s) => String(s || "")
  .replace(/[0-9a-f]{8,}/gi, "<id>")
  .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, "<time>")
  .slice(0, 200);

export async function GET(req) {
  try {
    await requireDeveloper(req);

    const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
    const failed = await prisma.generation.findMany({
      where: { status: "failed", createdAt: { gte: since } },
      select: { id: true, model: true, tool: true, createdAt: true, creditsUsed: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    if (!failed.length) return NextResponse.json({ days: DAYS, total: 0, groups: [] });

    const jobs = await prisma.generationJob.findMany({
      where: { generationId: { in: failed.map((f) => f.id) } },
      select: { generationId: true, lastError: true, attempts: true, providerRequestId: true, providerName: true },
    });
    const byGen = new Map(jobs.map((j) => [j.generationId, j]));

    const groups = new Map();
    for (const f of failed) {
      const job = byGen.get(f.id);
      const key = scrub(job?.lastError || "no job row — this generation predates the durable queue");
      if (!groups.has(key)) {
        groups.set(key, { reason: key, count: 0, models: new Set(), tools: new Set(), dispatched: 0, credits: 0, last: null });
      }
      const g = groups.get(key);
      g.count += 1;
      g.models.add(f.model);
      g.tools.add(f.tool);
      // Dispatched means the provider was actually asked — the difference
      // between "we broke" and "they broke" and it changes who to chase.
      if (job?.providerRequestId) g.dispatched += 1;
      g.credits += f.creditsUsed || 0;
      if (!g.last || f.createdAt > g.last) g.last = f.createdAt;
    }

    const total = await prisma.generation.count({ where: { createdAt: { gte: since } } });

    return NextResponse.json({
      days: DAYS,
      total: failed.length,
      totalRuns: total,
      rate: total ? Math.round((failed.length / total) * 100) : 0,
      groups: [...groups.values()]
        .map((g) => ({ ...g, models: [...g.models].slice(0, 8), tools: [...g.tools] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 40),
    });
  } catch (e) {
    if (e?.status === 404) return apiError({ code: "not_found" });
    return authzResponse(e);
  }
}
