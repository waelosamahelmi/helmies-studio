import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { checkRateLimit } from "@/lib/security";
import { apiError } from "@/lib/api-error";
import prisma from "@/lib/prisma";
import { getOwnedProject, normalizeSettings } from "@/lib/projects";
import { packFor, missingPackAngles } from "@/lib/entity-core.mjs";

/* P1.8 — what this project's cast and places are still missing.
   ────────────────────────────────────────────────────────────────────────
   Breaking a screenplay down creates every place it names, as a
   description with no photographs. Finding each one in the Cast studio and
   filling it in by hand is a chore nobody should be given eleven times, so
   this reports the whole gap in one call and the project can act on it.

   GET only. Generating is deliberately NOT done here: every view costs
   money, and a single button that quietly spends it across a dozen
   entities is the wrong shape. The client submits them through the normal
   quoted path, one at a time, so the spend is visible and stoppable. */

export async function GET(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return apiError({ code: "unauthorized" });

    const { id } = await params;
    const project = await getOwnedProject(user.id, id);
    if (!project) return apiError({ code: "not_found", message: "Project not found" });

    const entities = await prisma.studioEntity.findMany({
      where: { projectId: id, userId: user.id },
      select: { id: true, kind: true, name: true, description: true, references: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });

    const settings = normalizeSettings(project.data || {});
    const rows = entities.map((e) => {
      const missing = missingPackAngles(e);
      const refs = Array.isArray(e.references) ? e.references : [];
      const own = refs.filter((r) => r.source !== "generated");
      return {
        id: e.id,
        kind: e.kind,
        name: e.name,
        status: e.status,
        references: refs.length,
        missing: missing.map((a) => ({ kind: a.kind, label: a.label, prompt: a.prompt })),
        total: packFor(e.kind).length,
        // A character must start from a real photograph — inventing a face
        // and calling it their identity would be a lie. A place or a
        // product is invented anyway, so its first view can be drawn from
        // the description it already has.
        canStartFromScratch: e.kind !== "character" && own.length === 0 && Boolean((e.description || "").trim()),
        needsPhotograph: e.kind === "character" && own.length === 0,
      };
    });

    return NextResponse.json({
      settings,
      entities: rows,
      incomplete: rows.filter((r) => r.missing.length).length,
    });
  } catch (e) {
    return authzResponse(e);
  }
}
