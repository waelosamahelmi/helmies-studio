import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { compilePrompt } from "@/lib/prompt-engine";

// Exposes the full 5-pass Prompt Intelligence Engine to the client.
// Used by the Prompt Inspector (Advanced Mode) and pre-generation preview.
// Returns every intermediate pass so the UI can show the full pipeline.
export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/prompt");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const {
      prompt, tool = "image", modelId, settings = {},
      references, canvas, brandKitId, projectId, polish = "off",
    } = body;

    if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // TODO: load brandKit + project + visualAnalysis from DB when IDs are provided.
    // For now the client may pass pre-fetched objects directly.
    const result = await compilePrompt({
      rawPrompt: prompt,
      tool,
      modelId,
      settings,
      references,
      canvas,
      polish,
      userId: user.id,
    });

    return NextResponse.json({
      original: prompt,
      finalPrompt: result.finalPrompt,
      negativePrompt: result.negativePrompt,
      warnings: result.warnings,
      guideVersion: result.guideVersion,
      passes: {
        normalized: result.state.normalized,
        enrichedContext: result.state.enrichedContext,
        expandedPrompt: result.state.expandedPrompt,
        dialectPrompt: result.state.dialectPrompt,
        dialectGuide: result.state.dialectGuide,
        polished: result.state.polished || false,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}