import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUserWithCredits } from "@/lib/session";
import { AuthzError, authzResponse } from "@/lib/authz";
import { apiError } from "@/lib/api-error";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { reserveCredits, releaseReservation, getWallet } from "@/lib/wallet";
import { checkRateLimit } from "@/lib/security";
import { resolveProvider } from "@/lib/providers";
import { enqueueJob } from "@/lib/job-queue";
import { expandPrompt, getNegativePrompt, shouldExpand } from "@/lib/prompt-expansion";
import { applyMemoryToPrompt } from "@/lib/memory";
import { quoteCatalogModel } from "@/lib/model-catalog";
import { resolveModelPricingRow } from "@/lib/model-catalog-core.mjs";
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

// Deterministic JSON serialization (object keys sorted, recursively) so the
// idempotency hash below never depends on client-side key ordering — two
// requests with the same params but different key order must hash to the
// SAME key.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function POST(req) {
  // Declared outside the try so the catch below can reference it — optional
  // chaining does not guard an undeclared binding, and the ReferenceError was
  // masking every real error with an opaque 500.
  let body = null;
  try {
    const user = await getCurrentUserWithCredits();
    if (!user) return apiError({ code: "unauthorized" });
    // This route authenticates via session cookie only (no authenticateApiKey
    // branch — see the route-manifest note), so the origin check always
    // applies here; it is never conditional on the auth method the way the
    // mixed(user+apikey) /api/generate/* tool routes would need it to be.
    verifyOrigin(req);

    const rl = await checkRateLimit(user.id, "/api/generate/async");
    if (!rl.allowed) {
      return apiError({ code: "rate_limited", extra: { retryAfter: rl.retryAfter } });
    }

    body = await req.json();
    const { tool, model, prompt, ...params } = body;

    if (!model) return apiError({ code: "bad_request", message: "Model required" });

    const provider = await resolveProvider(model);

    // Tolerant of the "public" (provider-prefix-stripped) id the catalog now
    // hands back to clients (see resolveModelPricingRow's header in
    // model-catalog-core.mjs) — falls straight through to this exact query,
    // unchanged, for the real id every existing/internal caller still uses.
    const dbPricing = await resolveModelPricingRow(prisma, model).catch(() => null);
    // Billing requires a real, active ModelPricing row — same policy as
    // generation-handler.js. estimateCredits' flat per-tool fallback is a
    // planning/preview estimate only and must never be used to actually bill
    // a generation (that was the async-route half of this hole).
    if (!dbPricing || dbPricing.isActive === false || dbPricing.isDeprecated) {
      return apiError({ code: "model_not_priced", extra: { model } });
    }
    // ── Phase C1.8.1 — entity references ──────────────────────────────────
    // `entityIds` names the caller's OWN characters/products/environments.
    // Their descriptor is prefixed onto the prompt and their reference images
    // are written into whichever field THIS model actually exposes (seedance's
    // reference_image_urls, wan-r2v's reference_image, nano-banana's
    // image_input, ...). Resolved BEFORE the quote so the user is priced for
    // what really runs — reference images move the cost on some models.
    const requestedEntityIds = Array.isArray(body.entityIds)
      ? body.entityIds.filter((v) => typeof v === "string" && v).slice(0, 8)
      : [];
    let entityPromptPrefix = "";
    let entityDigests = null;
    let effectiveParams = params;

    if (requestedEntityIds.length) {
      // Owner-scoped load: an id the caller does not own is simply not
      // returned, so this can never inject somebody else's face.
      const { getOwnedEntities } = await import("@/lib/entities");
      const {
        entityPromptBlock, selectEntityReferences, imageReferenceSlot, applyEntityReferences,
        computeAttributeDigest, voiceReferenceSlot, voiceReferences,
      } = await import("@/lib/entity-core.mjs");

      const entities = await getOwnedEntities(user.id, requestedEntityIds);
      if (entities.length) {
        const slot = imageReferenceSlot(dbPricing.inputSchema);
        // Some families take the voice the same way they take the face —
        // wan-2.7-r2v's reference_voice, seedance's reference_audio_urls. A
        // character carrying a recording should sound like themselves without
        // anyone wiring it per shot.
        const voiceSlot = voiceReferenceSlot(dbPricing.inputSchema);
        const voiceUrls = [];
        const purpose = typeof body.entityPurpose === "string" && body.entityPurpose ? body.entityPurpose : "default";

        const blocks = [];
        const urls = [];
        entityDigests = {};
        for (const entity of entities) {
          blocks.push(entityPromptBlock(entity));
          // Snapshot what the entity looked like AT RENDER TIME — a later
          // edit to the character must never rewrite the history of a shot
          // that already rendered from the old version.
          entityDigests[entity.id] = computeAttributeDigest(entity);
          if (slot) {
            // Share the model's reference budget across the entities in the
            // shot instead of letting the first one consume all of it.
            const perEntity = Math.max(1, Math.floor(slot.max / entities.length));
            for (const ref of selectEntityReferences(entity, { purpose, max: perEntity })) urls.push(ref.url);
          }
          if (voiceSlot) for (const ref of voiceReferences(entity)) voiceUrls.push(ref.url);
        }
        entityPromptPrefix = blocks.filter(Boolean).join("\n");
        if (slot && urls.length) {
          effectiveParams = applyEntityReferences(params, dbPricing.inputSchema, urls, { slot });
        }
        if (voiceSlot && voiceUrls.length) {
          effectiveParams = applyEntityReferences(effectiveParams, dbPricing.inputSchema, voiceUrls, { slot: voiceSlot });
        }
      }
    }

    // Fill the model's REQUIRED rendering settings before quoting. These were
    // only applied at submit (providers.js), which is too late: a model like
    // seedream/5-pro-image-to-image requires quality and aspect_ratio, so a
    // caller that did not know to send them was rejected by the quote with
    // "Some settings aren't valid for this model" and never reached the
    // filling step. Quoting what will actually run is also the honest order —
    // on models where quality moves the price, the number the user sees is
    // now the number they pay.
    const { applyRequiredDefaults } = await import("@/lib/provider-payload-core.mjs");
    const filled = applyRequiredDefaults(effectiveParams, dbPricing.inputSchema, { modelId: dbPricing.modelId });
    effectiveParams = filled.params;

    let cost = dbPricing.creditsCost;
    let providerCost = dbPricing.providerCost || 0;
    if (dbPricing.pricingRules) {
      const quote = await quoteCatalogModel(model, { ...effectiveParams, prompt: prompt || "" });
      if (!quote.valid) return apiError({ code: "invalid_params", details: quote.errors });
      cost = quote.credits;
      providerCost = quote.providerCost;
    }

    // Wallet is the source of truth for the balance check.
    const wallet = await getWallet(user.id);

    // Idempotency key (Task 5): a double-clicked submit within the same
    // 60-second wall-clock bucket (minuteBucket = Math.floor(Date.now()/60000))
    // returns the SAME job instead of creating a second reservation/charge.
    // This is a coarse bucket, not a sliding window — two submits that
    // straddle a minute boundary are NOT guaranteed to collide; that's an
    // accepted false-negative (the submit just gets its own honest
    // reservation), not a safety hole. Keyed on the RAW client-submitted
    // prompt/params rather than the expanded/memory-applied prompt built
    // below, both because prompt-expansion can call an LLM (not guaranteed
    // deterministic run-to-run) and so a duplicate is caught BEFORE paying
    // for that expansion work a second time.
    const minuteBucket = Math.floor(Date.now() / 60000);
    const idempotencyKey = crypto
      .createHash("sha256")
      .update(`${user.id}:${model}:${stableStringify({ tool: tool || null, prompt: prompt || "", ...params })}:${minuteBucket}`)
      .digest("hex");

    // Pre-check: a recognized duplicate returns the FIRST request's job
    // without touching the wallet again — it also skips the insufficient-
    // credits gate below, since the original submit already reserved. The
    // real safety net against a genuine concurrent race (two requests both
    // passing this check before either has enqueued) is enqueueJob's own
    // idempotencyKey unique-constraint fallback (src/lib/job-queue.js),
    // handled by the `job.generationId !== generation.id` branch further
    // down.
    const existingJob = await prisma.generationJob.findUnique({ where: { idempotencyKey } }).catch(() => null);
    if (existingJob) {
      const existingGeneration = await prisma.generation.findUnique({ where: { id: existingJob.generationId } }).catch(() => null);
      return NextResponse.json({
        success: true,
        generationId: existingJob.generationId,
        jobId: existingJob.id,
        status: "queued",
        creditsUsed: existingGeneration?.creditsUsed ?? cost,
        remainingCredits: wallet.available,
        pollUrl: `/api/generations/status?id=${existingJob.generationId}`,
      });
    }

    if (wallet.available < cost) {
      return apiError({ code: "insufficient_credits", extra: { credits: wallet.available, cost } });
    }

    let finalPrompt = prompt || "";
    if (body.characterId || body.styleId) {
      finalPrompt = await applyMemoryToPrompt(user.id, finalPrompt, {
        characterId: body.characterId,
        styleId: body.styleId,
      });
    }
    // `expand: false` opts out. A reference photograph is a technical brief,
    // not a creative one: the expander rewrote "flat even lighting, plain
    // mid-grey background, no stylisation" into "editorial style, pale skin
    // tones, 8K clarity", which is exactly the kind of invention an identity
    // reference must not carry.
    if (body.expand !== false && shouldExpand(finalPrompt)) {
      const promptType = tool === "image" || tool === "i2i" ? "image" : tool === "video" || tool === "i2v" || tool === "v2v" ? "video" : "audio";
      finalPrompt = await expandPrompt(finalPrompt, promptType, model);
    }
    // Entity descriptors go on AFTER expansion: the expander rewrites the
    // creative brief, and it must not get the chance to paraphrase a locked
    // identity into something else.
    if (entityPromptPrefix) {
      finalPrompt = finalPrompt ? `${entityPromptPrefix}\n\n${finalPrompt}` : entityPromptPrefix;
    }

    const webhookUrl = `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`;
    const staticModel = MODEL_REGISTRY[model];
    // Server-decided endpoint. `params.endpoint` is deliberately NOT consulted
    // — same hole as generation-handler: a caller could target an arbitrary
    // provider endpoint while being billed for the cheap default.
    const endpoint = dbPricing?.endpoint || staticModel?.endpoint || model;
    // IMPORTANT-4 FIX (found in review): templateRunId/stepId are ALSO
    // stripped, same as endpoint — job-runner.js reads job.payload.templateRunId
    // to decide whether a job belongs to a Phase 6 TemplateRun step (and, if
    // so, routes its terminal transition to advanceTemplateRun instead of
    // this generation's own settle/release — see job-runner.js's header). A
    // client-supplied templateRunId here would let an attacker inject an
    // arbitrary run id into an ordinary /api/generate/async submission,
    // making job-runner.js skip THIS generation's own settle/release
    // entirely and instead call advanceTemplateRun against a run the
    // attacker doesn't even own.
    // entityIds/entityPurpose are OUR vocabulary, not the provider's — they
    // are stripped here (like endpoint/templateRunId above) so they never
    // ride along in the outbound request body. Their effect is already baked
    // into finalPrompt and effectiveParams' reference field.
    const {
      endpoint: _ep,
      templateRunId: _trid,
      stepId: _sid,
      entityIds: _eids,
      entityPurpose: _epurpose,
      ...cleanParams
    } = effectiveParams;
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
        // dbPricing.modelId (not the raw `model` the client sent, which may
        // be the catalog's public/provider-prefix-stripped id) is guaranteed
        // non-null here (the !dbPricing check above already returned) and
        // is the real, canonical ModelPricing.modelId — keeping this record
        // consistent with every other row regardless of which id form the
        // client happened to submit.
        model: dbPricing.modelId,
        prompt: prompt || "",
        // D1.7 lineage: body already carries entityIds; the digest records
        // WHICH version of each entity this shot actually rendered from.
        params: entityDigests ? { ...body, entityDigest: entityDigests } : body,
        status: "pending",
        creditsUsed: cost,
        providerCost,
      },
    });

    // Reserve (not debit) so a failure to enqueue — or a later provider
    // failure — is refundable. debitCredits is non-refundable.
    try {
      await reserveCredits(user.id, cost, generation.id);
    } catch (reserveErr) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: reserveErr.message },
      });
      return apiError({
        code: "insufficient_credits",
        cause: reserveErr,
        extra: { credits: wallet.available, cost },
      });
    }

    // Money-flow change (Task 5): this route no longer calls the provider
    // and no longer settles. It ends here with the reservation ACTIVE and a
    // durable job enqueued — the job runner (src/lib/job-runner.js) submits
    // to the provider, polls, ingests the output, and settles only once
    // that output is durably recorded; the completion webhook
    // (src/lib/generation-webhook.js) settles instead if it wins that race.
    // A submit that used to fail synchronously here (and get released) now
    // fails inside the runner instead, which releases/refunds exactly the
    // same way (see job-runner.js's money rules).
    let job;
    try {
      job = await enqueueJob({
        generationId: generation.id,
        userId: user.id,
        idempotencyKey,
        payload,
        providerName: provider.name,
        endpoint,
      });
    } catch (enqueueErr) {
      await releaseReservation(user.id, generation.id).catch(() => {});
      await syncLegacyCredits(user.id);
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: enqueueErr.message },
      }).catch(() => {});
      return apiError({
        code: "internal",
        cause: enqueueErr,
        context: { route: "generate/async", phase: "enqueue", generationId: generation.id },
      });
    }

    // Race: enqueueJob's own idempotencyKey unique-constraint fallback
    // (src/lib/job-queue.js) can hand back an EXISTING job belonging to a
    // DIFFERENT generation than the one just created above — a concurrent
    // duplicate request that reached enqueueJob a beat ahead of us, after
    // both of us passed the pre-check earlier. Whoever loses this race must
    // not keep an orphaned reservation and Generation row that nothing will
    // ever drive to completion — release it and hand back the winner's data
    // instead of silently charging twice.
    if (job.generationId !== generation.id) {
      await releaseReservation(user.id, generation.id).catch(() => {});
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: "Duplicate submit — superseded by a concurrent identical request" },
      }).catch(() => {});
      const winningGeneration = await prisma.generation.findUnique({ where: { id: job.generationId } }).catch(() => null);
      await syncLegacyCredits(user.id);
      return NextResponse.json({
        success: true,
        generationId: job.generationId,
        jobId: job.id,
        status: "queued",
        creditsUsed: winningGeneration?.creditsUsed ?? cost,
        remainingCredits: wallet.available,
        pollUrl: `/api/generations/status?id=${job.generationId}`,
      });
    }

    await syncLegacyCredits(user.id);

    return NextResponse.json({
      success: true,
      generationId: generation.id,
      jobId: job.id,
      status: "queued",
      creditsUsed: cost,
      remainingCredits: wallet.available - cost,
      pollUrl: `/api/generations/status?id=${generation.id}`,
    });
  } catch (e) {
    if (e instanceof AuthzError) return authzResponse(e);
    // The raw e.message never reaches the client (it used to leak here) —
    // apiError logs the full cause server-side keyed by the same errorId
    // the user sees.
    return apiError({
      code: "internal",
      cause: e,
      context: { route: "generate/async", tool: body?.tool, model: body?.model },
    });
  }
}
