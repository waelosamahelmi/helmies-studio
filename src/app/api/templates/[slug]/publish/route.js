import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/security";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { canPublish } from "@/lib/template-quote";

// POST /api/templates/[slug]/publish — admin only. Publishes a
// TemplateVersion ONLY when canPublish passes (structurally valid graph,
// every step's model active/non-deprecated, and the version's own sample
// inputs quote cleanly); otherwise 422 with the specific reasons and no
// write at all — `status` never flips on a rejected gate. Body may name
// `version` explicitly; omitted defaults to the template's highest-numbered
// version. On success, also flips the legacy Template.isPublished flag
// (src/lib/templates.js's listTemplates/getTemplateBySlug still read that
// column) so the published version is immediately visible in the existing
// library surface.
export async function POST(req, { params }) {
  try {
    await requireAdmin(req);
    verifyOrigin(req);

    const { slug } = params;
    const template = await prisma.template.findUnique({ where: { slug } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    let version = Number(body?.version);
    if (!Number.isFinite(version)) {
      const latest = await prisma.templateVersion.findFirst({
        where: { templateId: template.id },
        orderBy: { version: "desc" },
      });
      if (!latest) return NextResponse.json({ error: "No template version to publish" }, { status: 404 });
      version = latest.version;
    }

    const gate = await canPublish(template.id, version);
    if (!gate.ok) {
      return NextResponse.json(
        { error: "Template version cannot be published", reasons: gate.reasons },
        { status: 422 }
      );
    }

    await prisma.$transaction([
      prisma.templateVersion.update({
        where: { templateId_version: { templateId: template.id, version } },
        data: { status: "published" },
      }),
      prisma.template.update({ where: { id: template.id }, data: { isPublished: true } }),
    ]);

    return NextResponse.json({ success: true, templateId: template.id, version });
  } catch (e) {
    return authzResponse(e);
  }
}
