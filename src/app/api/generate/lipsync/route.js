import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import { processLipSync } from "@/lib/muapi";
import { getCreditCost } from "@/lib/credits";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { model, endpoint, image_url, video_url, audio_url, prompt, resolution } = body;

    if (!audio_url || (!image_url && !video_url)) {
      return NextResponse.json({ error: "Audio and image or video are required" }, { status: 400 });
    }

    const cost = getCreditCost("lipsync", model);
    if (user.credits < cost) {
      return NextResponse.json({ error: "Insufficient credits", credits: user.credits, cost }, { status: 402 });
    }

    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        tool: "lipsync",
        model: model || endpoint,
        prompt: prompt || "",
        params: { image_url, video_url, audio_url, resolution },
        status: "pending",
        creditsUsed: cost,
      },
    });

    await debitCredits(user.id, cost);

    try {
      const result = await processLipSync({
        endpoint: endpoint || model,
        image_url,
        video_url,
        audio_url,
        prompt,
        resolution,
      });

      const outputUrl = result.url || result.outputs?.[0];

      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "completed", outputUrl },
      });

      return NextResponse.json({
        success: true,
        url: outputUrl,
        requestId: result.requestId,
        creditsUsed: cost,
        remainingCredits: user.credits - cost,
      });
    } catch (genError) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: genError.message },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: cost } },
      });
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: cost, type: "refund", description: `Refund: ${genError.message.slice(0, 100)}` },
      });
      return NextResponse.json({ error: genError.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}