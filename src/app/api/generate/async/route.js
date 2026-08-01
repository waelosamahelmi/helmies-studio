import { NextResponse } from "next/server";
import { getCurrentUserWithCredits } from "@/lib/session";
import { AuthzError, authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { reserveCredits, settleReservation, releaseReservation, getWallet } from "@/lib/wallet";
import { checkRateLimit } from "@/lib/security";
import { resolveProvider, brandError, submitOnly } from "@/lib/providers";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";
import { quoteCatalogModel } from "@/lib/model-catalog";
import {
  IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS,
  LIPSYNC_MODELS, AUDIO_MODELS, RECAST_MODELS,
} from "@/lib/models";

const ENDPOINT_MAP = {
  image: "image", i2i: "i2i", video: "video", i2v: "i2v", v2v: "v2v",
  lipsync: "lipsync", audio: "audio", recast: "recast", clipping: "clipping",
  motion: "motion", marketing: "marketing", cinema: "cinema", influencer: "influencer",
};

// Build a flat lookup from all static model arrays: id → { endpoint, providerModelId }
const ALL_MODELS = [
  ...IMAGE_MODELS, ...I2I_MODELS, ...VIDEO_MODELS, ...I2V_MODELS, ...V2V_MODELS,
  ...LIPSYNC_MODELS, ...AUDIO_MODELS, ...RECAST_MODELS,
];
const MODEL_REGISTRY = Object.fromEntries(
  ALL_MODELS.map((m) => [m.id, { endpoint: m.endpoint, providerModelId: m.endpoint || m.id }]),
);

// Mirror the wallet's `available` onto the legacy User.credits column so the
// existing UI keeps showing the right number.
async function syncLegacyCredits(userId) {
  try {
    const w = await getWallet(userId);
    await prisma.user.update({ where: { id: userId }, data: { credits: w.available } });
  } catch {}
}

export async function POST(req) {
  // Declared outside the try so the catch below can reference it — optional
  // chaining does not guard an undeclared binding, and the ReferenceError was
  // masking every real error with an opaque 500.
  let body = null;
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // This route authenticates via session cookie only (no authenticateApiKey
    // branch — see the route-manifest note), so the origin check always
    // applies here; it is never conditional on the auth method the way the
    // mixed(user+apikey) /api/generate/* tool routes would need it to be.
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/generate/async");
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limited", retryAfter: rl.retryAfter }, { status: 429 });
    }

    body = await req.json();
    const { tool, model, prompt, ...params } = body;

    if (!model) return NextResponse.json({ error: "Model required" }, { status: 400 });

    const provider = await resolveProvider(model);

    const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
    // Billing requires a real, active ModelPricing row — same policy as
    // generation-handler.js. estimateCredits' flat per-tool fallback is a
    // planning/preview estimate only and must never be used to actually bill
    // a generation (that was the async-route half of this hole).
    if (!dbPricing || dbPricing.isActive === false || dbPricing.isDeprecated) {
      return NextResponse.json({ error: "Model not priced", model }, { status: 422 });
    }
    let cost = dbPricing.creditsCost;
    let providerCost = dbPricing.providerCost || 0;
    if (dbPricing.pricingRules) {
      const quote = await quoteCatalogModel(model, { ...params, prompt: prompt || "" });
      if (!quote.valid) return NextResponse.json({ error: "Invalid model parameters", details: quote.errors }, { status: 422 });
      cost = quote.credits;
      providerCost = quote.providerCost;
    }

    // Wallet is the source of truth for the balance check.
    const wallet = await getWallet(user.id);
    if (wallet.available < cost) {
      return NextResponse.json({ error: "Insufficient credits", credits: wallet.available, cost }, { status: 402 });
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
    const staticModel = MODEL_REGISTRY[model];
    // Server-decided endpoint. `params.endpoint` is deliberately NOT consulted
    // — same hole as generation-handler: a caller could target an arbitrary
    // provider endpoint while being billed for the cheap default.
    const endpoint = dbPricing?.endpoint || staticModel?.endpoint || model;
    const { endpoint: _ep, ...cleanParams } = params;
    const providerModelId = dbPricing?.providerModelId || staticModel?.providerModelId || model;
    const payload = { ...cleanParams, model: providerModelId, prompt: finalPrompt, endpoint, callBackUrl: webhookUrl };
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

    // Reserve (not debit) so a submission failure is refundable. debitCredits
    // is non-refundable — a failed submitOnly charged the user for nothing.
    try {
      await reserveCredits(user.id, cost, generation.id);
    } catch (reserveErr) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: reserveErr.message },
      });
      return NextResponse.json({ error: reserveErr.message, credits: wallet.available, cost }, { status: 402 });
    }

    let requestId;
    try {
      ({ requestId } = await submitOnly(provider, endpoint, payload));
    } catch (submitErr) {
      await releaseReservation(user.id, generation.id).catch(() => {});
      await syncLegacyCredits(user.id);
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: brandError(submitErr.message) },
      }).catch(() => {});
      return NextResponse.json({ error: brandError(submitErr.message) }, { status: 500 });
    }

    if (requestId) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { requestId },
      });
    }

    // Submission accepted — settle at the quoted cost. The completion webhook
    // refunds if the job later fails.
    const settled = await settleReservation(user.id, generation.id, cost).catch(() => null);
    await syncLegacyCredits(user.id);

    return NextResponse.json({
      success: true,
      generationId: generation.id,
      requestId,
      status: "pending",
      creditsUsed: cost,
      remainingCredits: settled?.available ?? (wallet.available - cost),
      pollUrl: `/api/generations/status?id=${generation.id}`,
    });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    console.error("[generate/async] ERROR", { tool: body?.tool, model: body?.model, message: e.message, stack: e.stack?.split("\n").slice(0, 3).join(" | ") });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
