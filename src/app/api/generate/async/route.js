import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { resolveProvider, brandError } from "@/lib/providers";
import { generateImage, generateVideo, generateAudio, processLipSync, processRecast, runClipping, runMotionGraphics, generateMarketingAd, generateI2I, generateI2V, processV2V } from "@/lib/generation";

const GENERATORS = {
  image: generateImage,
  i2i: generateI2I,
  video: generateVideo,
  i2v: generateI2V,
  v2v: processV2V,
  lipsync: processLipSync,
  audio: generateAudio,
  recast: processRecast,
  clipping: runClipping,
  motion: runMotionGraphics,
  marketing: generateMarketingAd,
  cinema: generateImage,
  influencer: generateImage,
};

export async function POST(req) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { tool, model, prompt, ...params } = body;

    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    const provider = await resolveProvider(model);

    const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
    const cost = dbPricing?.creditsCost || 1;

    if (user.credits < cost) {
      return NextResponse.json({ error: "Insufficient credits", credits: user.credits, cost }, { status: 402 });
    }

    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        tool: tool || "image",
        model,
        prompt: prompt || "",
        params: body,
        status: "pending",
        creditsUsed: cost,
        providerCost: dbPricing?.providerCost || 0,
      },
    });

    await debitCredits(user.id, cost);

    const generator = GENERATORS[tool] || GENERATORS.image;

    generator({ ...params, model, prompt, endpoint: model, _provider: provider })
      .then(async (result) => {
        const outputUrl = result.url || result.outputs?.[0];
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: "completed", outputUrl, requestId: result.requestId },
        });
      })
      .catch(async (err) => {
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: "failed", error: err.message?.slice(0, 500) },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: { increment: cost } },
        });
      });

    return NextResponse.json({
      success: true,
      generationId: generation.id,
      status: "pending",
      creditsUsed: cost,
      remainingCredits: user.credits - cost,
      pollUrl: `/api/generations/status?id=${generation.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
