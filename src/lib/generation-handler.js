import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { resolveProvider, brandError, logProviderError } from "@/lib/providers";
import { checkRateLimit, logAudit } from "@/lib/security";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";
import { validateGenerationOutput, logQualityGate } from "@/lib/quality-gate";

export async function handleGeneration(req, tool, cost, apiFn) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(user.id, `/api/generate/${tool}`);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });
    }

    const body = await req.json();
    const model = body.model || body.endpoint || tool;
    const rawPrompt = body.prompt || "";

    const promptType = tool === "image" || tool === "i2i" ? "image" : tool === "video" || tool === "i2v" || tool === "v2v" ? "video" : "audio";

    let finalPrompt = rawPrompt;
    if (body.characterId || body.styleId) {
      finalPrompt = await applyMemoryToPrompt(user.id, finalPrompt, {
        characterId: body.characterId,
        styleId: body.styleId,
      });
    }

    if (shouldExpand(finalPrompt)) {
      finalPrompt = await expandPrompt(finalPrompt, promptType, model);
    }

    const provider = await resolveProvider(model);

    const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
    if (dbPricing?.creditsCost) cost = dbPricing.creditsCost;

    if (user.credits < cost) {
      return NextResponse.json({ error: "Insufficient credits", credits: user.credits, cost }, { status: 402 });
    }

    const providerCost = dbPricing?.providerCost || 0;

    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        tool,
        model,
        prompt: rawPrompt,
        params: body,
        status: "pending",
        creditsUsed: cost,
        providerCost,
      },
    });

    await debitCredits(user.id, cost);

    try {
      const paramsWithPrompt = { ...body, prompt: finalPrompt };
      if (!body.negative_prompt && promptType !== "audio") {
        paramsWithPrompt.negative_prompt = getNegativePrompt(promptType);
      }

      const result = await apiFn({ ...paramsWithPrompt, _provider: provider });
      const outputUrl = result.url || result.outputs?.[0];

      const quality = await validateGenerationOutput(outputUrl, tool);
      await logQualityGate(user.id, generation.id, tool, quality);

      if (!quality.valid) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: "failed", error: quality.reason },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: { increment: cost } },
        });
        await prisma.creditTransaction.create({
          data: { userId: user.id, amount: cost, type: "refund", description: `Quality gate refund: ${quality.reason}` },
        });
        return NextResponse.json({ error: quality.reason }, { status: 500 });
      }

      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "completed", outputUrl },
      });

      await logAudit("generation_complete", tool, generation.id, { model, provider: provider.name });

      return NextResponse.json({
        success: true,
        url: outputUrl,
        requestId: result.requestId,
        creditsUsed: cost,
        remainingCredits: user.credits - cost,
        provider: provider.name,
        expanded: finalPrompt !== rawPrompt,
        ...(result.outputs ? { outputs: result.outputs } : {}),
      });
    } catch (genError) {
      const brandedMsg = brandError(genError.message);
      await logProviderError(provider.name, tool, genError.message, user.id);
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: brandedMsg },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { credits: { increment: cost } },
      });
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: cost, type: "refund", description: `Refund: ${brandedMsg.slice(0, 100)}` },
      });
      return NextResponse.json({ error: brandedMsg }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
