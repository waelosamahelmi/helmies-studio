import { NextResponse } from "next/server";
import { getCurrentUserWithCredits } from "@/lib/session";
import prisma from "@/lib/prisma";
import { resolveProvider, resolveProviderWithFallback, brandError, logProviderError, submitAndPoll, PROVIDERS, DEFAULT_PROVIDER } from "@/lib/providers";
import { checkRateLimit, logAudit } from "@/lib/security";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";
import { validateGenerationOutput, logQualityGate } from "@/lib/quality-gate";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { storeMedia } from "@/lib/media-storage";
import { reserveCredits, settleReservation, releaseReservation, getWallet } from "@/lib/wallet";
import { quoteCatalogModel } from "@/lib/model-catalog";
import {
  IMAGE_MODELS, I2I_MODELS, VIDEO_MODELS, I2V_MODELS, V2V_MODELS,
  LIPSYNC_MODELS, AUDIO_MODELS, RECAST_MODELS,
} from "@/lib/models";

// Server-defined model registry. Together with the ModelPricing table this is
// the complete set of models a caller may name — anything else is rejected
// before credits are touched, and the provider endpoint is always taken from
// here or from the DB, never from the request body.
const MODEL_REGISTRY = Object.fromEntries(
  [
    ...IMAGE_MODELS, ...I2I_MODELS, ...VIDEO_MODELS, ...I2V_MODELS, ...V2V_MODELS,
    ...LIPSYNC_MODELS, ...AUDIO_MODELS, ...RECAST_MODELS,
  ].map((m) => [m.id, { endpoint: m.endpoint || m.id, providerModelId: m.endpoint || m.id }]),
);

// Re-mirror the wallet's `available` balance onto the legacy `User.credits`
// column so existing UI/queries keep showing the right number.
async function syncLegacyCredits(userId) {
  try {
    const w = await getWallet(userId);
    await prisma.user.update({ where: { id: userId }, data: { credits: w.available } });
  } catch {}
}

export async function handleGeneration(req, tool, cost, apiFn) {
  try {
    let user = await authenticateApiKey(req);
    if (!user) {
      user = await getCurrentUserWithCredits(req);
    }
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

    // ── Prompt Intelligence Engine (5-pass) ──
    // Replaces the old single-pass expandPrompt. Spec §26.
    let finalPrompt = rawPrompt;
    let compiledNegative = body.negative_prompt || null;
    let promptWarnings = [];
    let guideVersion = null;

    // Apply ProjectMemory character/style first (enricher reads it).
    let character = null;
    if (body.characterId || body.styleId) {
      try {
        const mem = await applyMemoryToPrompt(user.id, rawPrompt, {
          characterId: body.characterId,
          styleId: body.styleId,
        });
        if (mem && mem !== rawPrompt) {
          character = { physicalDescription: mem };
        }
      } catch {}
    }

    try {
      const { compilePrompt } = await import("@/lib/prompt-engine");

      // Load brand kit constraints when a brandKitId is provided (spec §8.4).
      let brandKit = null;
      if (body.brandKitId) {
        try {
          const { buildBrandPromptContext, checkBrandCompliance } = await import("@/lib/brand-engine");
          const bk = await prisma.brandKit.findFirst({ where: { id: body.brandKitId, userId: user.id } });
          if (bk) {
            brandKit = {
              name: bk.name,
              palette: bk.fingerprint?.palette || { primary: bk.primaryColors, secondary: bk.secondaryColors },
              typography: bk.fingerprint?.typography || { heading: null, body: null },
              photographyStyle: bk.photographyStyle,
              toneOfVoice: bk.toneOfVoice,
              avoid: bk.avoid,
              enforcement: bk.enforcement,
              slogans: bk.slogans,
            };
            // Check compliance and add warnings
            const compliance = checkBrandCompliance(rawPrompt, bk);
            if (!compliance.compliant) {
              promptWarnings = [...(promptWarnings || []), ...compliance.violations.map((v) => `Brand: ${v.message || v.term}`)];
            }
          }
        } catch {}
      }

      const result = await compilePrompt({
        rawPrompt,
        tool,
        modelId: model,
        settings: {
          aspect_ratio: body.aspect_ratio,
          duration: body.duration,
          resolution: body.resolution,
          seed: body.seed,
        },
        references: body.images_list || (body.image_url ? [{ url: body.image_url, role: "reference" }] : []),
        character,
        brandKit,
        polish: body.polish || "off",
        userId: user.id,
      });
      finalPrompt = result.finalPrompt;
      if (!compiledNegative && result.negativePrompt) compiledNegative = result.negativePrompt;
      promptWarnings = result.warnings;
      guideVersion = result.guideVersion;
    } catch {
      // Fallback to the old single-pass expander if the engine fails to load.
      if (shouldExpand(finalPrompt)) {
        finalPrompt = await expandPrompt(finalPrompt, promptType, model).catch(() => finalPrompt);
      }
    }

    const provider = await resolveProvider(model);

    const dbPricing = await prisma.modelPricing.findUnique({ where: { modelId: model } }).catch(() => null);
    // A model that is in neither the ModelPricing table nor the static
    // registry has no trustworthy price and no trustworthy endpoint — refuse
    // before any credits are reserved, rather than charging the default cost
    // for an arbitrary client-chosen endpoint.
    const staticModel = MODEL_REGISTRY[model];
    if (!dbPricing && !staticModel) {
      return NextResponse.json({ error: "Unknown model" }, { status: 400 });
    }
    let providerCost = dbPricing?.providerCost || 0;
    if (dbPricing?.pricingRules) {
      const catalogQuote = await quoteCatalogModel(model, { ...body, prompt: rawPrompt });
      if (!catalogQuote.valid) {
        return NextResponse.json({ error: "Invalid model parameters", details: catalogQuote.errors }, { status: 422 });
      }
      cost = catalogQuote.credits;
      providerCost = catalogQuote.providerCost;
    } else if (dbPricing?.creditsCost) {
      cost = dbPricing.creditsCost;
    }

    // Wallet is the source of truth for the balance check.
    const wallet = await getWallet(user.id);
    if (wallet.available < cost) {
      return NextResponse.json({ error: "Insufficient credits", credits: wallet.available, cost }, { status: 402 });
    }

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

    // Reserve credits for this job up-front; released/refunded on outcome.
    // This replaces the old debit-then-manual-increment-refund pattern and
    // guarantees a single ledger entry per credit change (spec §12.1, §32).
    try {
      await reserveCredits(user.id, cost, generation.id);
    } catch (reserveErr) {
      await prisma.generation.update({ where: { id: generation.id }, data: { status: "failed", error: reserveErr.message } });
      return NextResponse.json({ error: reserveErr.message, credits: wallet.available, cost }, { status: 402 });
    }

    try {
      const webhookUrl = `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`;
      // The endpoint is server-decided. Never let the request body pick the
      // provider endpoint — that lets a caller reach an expensive model while
      // being billed for a cheap one.
      const paramsWithPrompt = {
        ...body,
        model: dbPricing?.providerModelId || staticModel?.providerModelId || model,
        endpoint: dbPricing?.endpoint || staticModel?.endpoint || model,
        prompt: finalPrompt,
        webhook_url: webhookUrl,
      };
      // Use the compiled negative prompt from the engine when present.
      if (compiledNegative && !body.negative_prompt && promptType !== "audio") {
        paramsWithPrompt.negative_prompt = compiledNegative;
      } else if (!body.negative_prompt && promptType !== "audio") {
        paramsWithPrompt.negative_prompt = getNegativePrompt(promptType);
      }

      let result;
      let lastError;
      let successfulProvider = provider;
      let providers = await resolveProviderWithFallback(model);
      console.error(`[handleGeneration] providers chain for model=${model}:`, providers.map((p) => p.name).join(", "));
      console.error(`[handleGeneration] paramsWithPrompt:`, { model: paramsWithPrompt.model, endpoint: paramsWithPrompt.endpoint, tool });

      // If the provider chain is empty (e.g., all providers disabled in DB),
      // fall back to a direct KIE + Alibaba chain so users can still generate.
      if (providers.length === 0) {
        console.error(`[handleGeneration] WARNING: empty provider chain. Falling back to [kie, alibaba].`);
        const fallbackNames = [DEFAULT_PROVIDER, "alibaba"].filter((n) => PROVIDERS[n]);
        providers = fallbackNames.map((n) => ({ name: n, ...PROVIDERS[n], apiKey: PROVIDERS[n].getKey() }));
      }

      for (const prov of providers) {
        try {
          result = await apiFn({ ...paramsWithPrompt, _provider: prov });
          successfulProvider = prov;
          break;
        } catch (e) {
          lastError = e;
          console.error(`[Provider:${prov.name}] ${tool}: ${e.message}`, e.stack?.split("\n").slice(0, 3).join("\n"));
          await logProviderError(prov.name, tool, e.message, user.id).catch(() => {});
          continue;
        }
      }

      if (!result) {
        console.error(`[handleGeneration] All providers failed for model=${model} tool=${tool}. Last error:`, lastError?.message, lastError?.stack);
        throw lastError || new Error("All providers failed");
      }

      const outputUrl = result.url || result.outputs?.[0];

      let storedUrl = outputUrl;
      if (outputUrl) {
        try {
          storedUrl = await storeMedia(outputUrl);
        } catch {
          storedUrl = `/api/media/proxy?url=${encodeURIComponent(outputUrl)}`;
        }
      }

      const quality = await validateGenerationOutput(outputUrl, tool);
      await logQualityGate(user.id, generation.id, tool, quality);

      if (!quality.valid) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: { status: "failed", error: quality.reason },
        });
        // Quality gate failed: release the full reservation back to the user.
        await releaseReservation(user.id, generation.id);
        await syncLegacyCredits(user.id);
        return NextResponse.json({ error: quality.reason }, { status: 500 });
      }

      const proxiedUrl = storedUrl;

      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "completed", outputUrl: proxiedUrl, requestId: result.requestId || null },
      });

      // Create an Asset record with lineage (spec §14, §35-37).
      // Every provider output is ingested into controlled storage.
      try {
        const assetType = tool === "video" || tool === "i2v" || tool === "v2v" || tool === "lipsync" || tool === "recast" ? "video"
          : tool === "audio" ? "audio" : "image";
        const parentAssetId = body.image_url || body.video_url
          ? (await prisma.asset.findFirst({ where: { userId: user.id, url: body.image_url || body.video_url }, select: { id: true } }))?.id
          : null;
        await prisma.asset.create({
          data: {
            userId: user.id,
            type: assetType,
            source: "generation",
            url: proxiedUrl,
            storageKey: storedUrl !== proxiedUrl ? storedUrl : null,
            model,
            generationId: generation.id,
            parentAssetId: parentAssetId || null,
            metadata: { tool, prompt: rawPrompt, provider: successfulProvider.name, creditsUsed: cost },
          },
        });
      } catch {}

      // Record the prompt compilation for reproducibility (spec §33).
      try {
        await prisma.promptCompilation.create({
          data: {
            generationId: generation.id,
            userId: user.id,
            modelId: model,
            tool,
            rawPrompt,
            finalPrompt,
            negativePrompt: compiledNegative || "",
            guideVersion,
            warnings: promptWarnings,
            polishMode: body.polish || "off",
          },
        });
      } catch {}

      // Success: settle the reservation at the actual (quoted) cost.
      const settled = await settleReservation(user.id, generation.id, cost);
      await syncLegacyCredits(user.id);

      await logAudit("generation_complete", tool, generation.id, { model, provider: successfulProvider.name }, req);

      return NextResponse.json({
        success: true,
        url: proxiedUrl,
        requestId: result.requestId,
        creditsUsed: cost,
        remainingCredits: settled?.available ?? (wallet.available - cost),
        provider: successfulProvider.name,
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
      // Generation threw: release the full reservation back to the user.
      // releaseReservation already writes the reservation_release ledger entry.
      // Writing an extra creditTransaction{type:"refund"} here would
      // double-count the refund with no matching balance change.
      await releaseReservation(user.id, generation.id).catch(() => {});
      await syncLegacyCredits(user.id);
      return NextResponse.json({ error: brandedMsg }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
