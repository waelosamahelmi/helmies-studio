import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { quoteTemplate } from "@/lib/template-quote";

// POST /api/templates/[slug]/quote — server-authoritative credit quote for
// the caller's own inputs, computed against the currently PUBLISHED
// TemplateVersion (never a draft — a signed-in user quotes what they could
// actually run). Every credit in the response comes from
// quoteTemplate/quoteCatalogModel's ModelPricing lookup; any "credits" or
// "price" field in the request body is simply never read.
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const { slug } = params;
    const template = await prisma.template.findUnique({ where: { slug } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const version = await prisma.templateVersion.findFirst({
      where: { templateId: template.id, status: "published" },
      orderBy: { version: "desc" },
    });
    if (!version) return NextResponse.json({ error: "Template not available" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const quote = await quoteTemplate(version.graph, body?.inputs || {});

    return NextResponse.json({ templateId: template.id, version: version.version, ...quote });
  } catch (e) {
    return authzResponse(e);
  }
}
