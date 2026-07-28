import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { llmComplete } from "@/lib/providers";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

    // If client provides analysis, store it (backward compat)
    if (body.analysis && Object.keys(body.analysis).length > 0) {
      const analysis = await prisma.visualAnalysis.create({
        data: { userId: user.id, imageUrl: body.imageUrl, modelUsed: body.model || "client", analysis: body.analysis, tags: body.tags || [] },
      });
      return NextResponse.json(analysis, { status: 201 });
    }

    // Otherwise, run real server-side visual analysis via LLM vision
    const visionPrompt = `Analyze this image and provide a JSON object with:
- description: 2-3 sentence description of the image
- tags: array of relevant tags (max 10)
- colors: array of dominant colors (hex codes)
- composition: one of "centered", "rule-of-thirds", "symmetrical", "dynamic", "minimalist"
- mood: one-word mood descriptor
- style: one-word style descriptor
- subjects: array of main subjects detected

Image URL: ${body.imageUrl}`;

    let analysisResult = {};
    let tags = [];
    let modelUsed = "kie-vision";

    try {
      const response = await llmComplete(
        [
          { role: "system", content: "You are a visual analysis AI. Respond only with valid JSON." },
          { role: "user", content: visionPrompt },
        ],
        "google/gemini-2.5-flash-openai",
        { temperature: 0.3, max_tokens: 500 }
      );
      // Parse the LLM response as JSON
      const cleaned = response.replace(/```json\n?/g, "").replace(/\n?```/g, "").trim();
      analysisResult = JSON.parse(cleaned);
      tags = analysisResult.tags || [];
    } catch (parseErr) {
      // If LLM fails, store minimal analysis
      analysisResult = { description: "Analysis unavailable", tags: [] };
      modelUsed = "failed";
    }

    const analysis = await prisma.visualAnalysis.create({
      data: {
        userId: user.id,
        imageUrl: body.imageUrl,
        modelUsed,
        analysis: analysisResult,
        tags,
      },
    });

    return NextResponse.json(analysis, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json(await prisma.visualAnalysis.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
