import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUserWithCredits } from "@/lib/session";
import { AuthzError, authzResponse } from "@/lib/authz";
import { verifyOrigin } from "@/lib/origin-check";
import prisma from "@/lib/prisma";
import { reserveCredits, releaseReservation, getWallet } from "@/lib/wallet";
import { checkRateLimit } from "@/lib/security";
import { resolveProvider } from "@/lib/providers";
import { enqueueJob } from "@/lib/job-queue";
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
    const { endpoint: _ep, templateRunId: _trid, stepId: _sid, ...cleanParams } = params;
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

    // Reserve (not debit) so a failure to enqueue — or a later provider
    // failure — is refundable. debitCredits is non-refundable.
    try {
      await reserveCredits(user.id, cost, generation.id);
    } catch (reserveErr) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed", error: reserveErr.message },
      });
      return NextResponse.json({ error: reserveErr.message, credits: wallet.available, cost }, { status: 402 });
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
      return NextResponse.json({ error: enqueueErr.message }, { status: 500 });
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
    console.error("[generate/async] ERROR", { tool: body?.tool, model: body?.model, message: e.message, stack: e.stack?.split("\n").slice(0, 3).join(" | ") });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
