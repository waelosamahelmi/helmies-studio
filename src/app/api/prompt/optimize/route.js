import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import { expandPrompt } from "@/lib/prompt-expansion";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.id, "/api/prompt");
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });

    const { prompt, type, modelId } = await req.json();
    if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    const expanded = await expandPrompt(prompt, type || "image", modelId || null);
    return NextResponse.json({ original: prompt, expanded, optimized: expanded !== prompt });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
