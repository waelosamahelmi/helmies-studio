import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import { startTemplateRun } from "@/lib/template-runner";

// POST /api/templates/[slug]/run — starts a TemplateRun: quotes the
// currently published version, reserves the full total once, and enqueues
// step 1 on the durable job queue. Every credit here comes from
// startTemplateRun/quoteTemplate's ModelPricing lookup — the request body
// only ever supplies per-step input VALUES (prompt text, an aspect ratio
// choice, etc.), never a price.
export async function POST(req, { params }) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    verifyOrigin(req);

    const { slug } = params;
    const body = await req.json().catch(() => ({}));

    const result = await startTemplateRun({ userId: user.id, slug, inputs: body?.inputs || {} });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    // Mirrors /api/generate/async and /api/workflows/[id]/run's own mapping
    // for the same condition — insufficient credits reaches the UI as a
    // clean 402, not authzResponse's blanket 500.
    if (/Insufficient credits/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    if (e.message === "Template not found" || e.message === "Template not available") {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (/Template quote invalid/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return authzResponse(e);
  }
}
