import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { resolveProvider, brandError, submitOnly } from "@/lib/providers";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";
import { estimateCredits } from "@/lib/pricing-engine";
import { quoteCatalogModel } from "@/lib/model-catalog";

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
    let cost = dbPricing?.creditsCost || await estimateCredits(tool || "image", model, params);
    let providerCost = dbPricing?.providerCost || 0;
    if (dbPricing?.pricingRules) {
      const quote = await quoteCatalogModel(model, { ...params, prompt: prompt || "" });
      if (!quote.valid) return NextResponse.json({ error: "Invalid model parameters", details: quote.errors }, { status: 422 });
      cost = quote.credits;
      providerCost = quote.providerCost;
    }

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
    const endpoint = dbPricing?.endpoint || params.endpoint || model;
    const { endpoint: _ep, ...cleanParams } = params;
    const payload = { ...cleanParams, model: dbPricing?.providerModelId || model, prompt: finalPrompt, endpoint, callBackUrl: webhookUrl };
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
        providerCost,
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
    console.error("[generate/async] ERROR", { tool: body?.tool, model: body?.model, message: e.message, stack: e.stack?.split("\n").slice(0, 3).join(" | ") });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
