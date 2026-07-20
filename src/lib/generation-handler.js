import { NextResponse } from "next/server";
import { getCurrentUserWithCredits, debitCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { getCreditCost } from "@/lib/credits";
import { resolveProvider, brandError, logProviderError } from "@/lib/providers";

export async function handleGeneration(req, tool, cost, apiFn) {
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const model = body.model || body.endpoint || tool;
    const prompt = body.prompt || "";

    // ── Resolve provider for this model ──
    const provider = await resolveProvider(model);

    // ── Check DB pricing for actual cost ──
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
        prompt,
        params: body,
        status: "pending",
        creditsUsed: cost,
        providerCost,
      },
    });

    await debitCredits(user.id, cost);

    try {
      const result = await apiFn({ ...body, _provider: provider });
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
        provider: provider.name,
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
      return NextResponse.json({ error: brandedMsg, providerError: genError.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}