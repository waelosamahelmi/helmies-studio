import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { resolveProvider, brandError, submitOnly } from "@/lib/providers";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";

const ENDPOINT_MAP = {
  image: "image", i2i: "i2i", video: "video", i2v: "i2v", v2v: "v2v",
  lipsync: "lipsync", audio: "audio", recast: "recast", clipping: "clipping",
  motion: "motion", marketing: "marketing", cinema: "cinema", influencer: "influencer",
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

    let finalPrompt = prompt || "";
    if (body.characterId || body.styleId) {
      finalPrompt = await applyMemoryToPrompt(user.id, finalPrompt, {
        characterId: body.characterId,
        styleId: body.styleId,
      });
    }
    if (shouldExpand(finalPrompt)) {
      const promptType = tool === "image" || tool === "i2i" ? "image" : tool === "video" || tool === "i2v" || tool === "v2v" ? "video" : "audio";
      finalPrompt = await expandPrompt(finalPrompt, promptType, model);
    }

    const webhookUrl = `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`;
    const endpoint = params.endpoint || model;
    const payload = { ...params, model, prompt: finalPrompt, endpoint, webhook_url: webhookUrl };
    if (!body.negative_prompt) {
      const promptType = tool === "image" || tool === "i2i" ? "image" : tool === "video" || tool === "i2v" || tool === "v2v" ? "video" : "audio";
      payload.negative_prompt = getNegativePrompt(promptType);
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

    const { requestId } = await submitOnly(provider, endpoint, payload);

    if (requestId) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { requestId },
      });
    }

    return NextResponse.json({
      success: true,
      generationId: generation.id,
      requestId,
      status: "pending",
      creditsUsed: cost,
      remainingCredits: user.credits - cost,
      pollUrl: `/api/generations/status?id=${generation.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
