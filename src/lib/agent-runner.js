// Helmies Studio — Durable Agent Run Engine (Phase A)
//
// An AgentRun executes a plan over the durable GenerationJob queue, the same
// proven pattern TemplateRuns already use (src/lib/template-runner.js):
// startAgentRun quotes the whole plan, reserves the FULL total ONCE (keyed
// by the run's own id), creates the AgentRun + AgentRunStep rows, and
// enqueues the ready steps; advanceAgentRun is called by job-runner.js /
// generation-webhook.js after each step's generation reaches a terminal
// state (and by the worker's stale-run sweep) and either enqueues newly
// ready steps or closes the run out (settle-actual on completion, settle/
// release on failure, release on cancel).
//
// MONEY RULES (normative, mirror job-runner.js's own header):
//   1. Exactly ONE reservation exists per run (key = runId). Per-step
//      Generation rows are created with creditsUsed: 0 and NEVER hold their
//      own reservation — job-runner.js / generation-webhook.js bypass their
//      per-generation money path for any job carrying payload.agentRunId.
//   2. Completion settles the ACTUAL cost (Σ succeeded steps' quoted
//      credits, clamped ≤ reserved by wallet.settleReservation) — the
//      difference is released back automatically. A failed step is never
//      charged. A failed RUN still charges its succeeded steps (settle
//      actual), matching the legacy debit-then-refund semantics exactly.
//   3. Cancellation releases the reservation without settling: in-flight
//      provider work is allowed to finish but is never charged.
//   4. advanceAgentRun is idempotent — safe to call any number of times
//      from any context; only a conditional step-claim flip (pending →
//      queued) gets to create a step's Generation + job.
//
// WORKER-SAFETY (see job-runner.js's header for the full story): every
// top-level import below is a relative path with an explicit extension and
// transitively "@/"-free. pricing-engine.js (uses "@/" aliases) is imported
// LAZILY inside startAgentRun only, which is only ever called from the
// Next-bundled web process (never from scripts/worker.mjs).
//
// RESTART SEMANTICS: a PM2 restart mid-run loses nothing. Media jobs resume
// via their persisted providerRequestId (job-runner); internal steps
// re-execute idempotently (a succeeded step short-circuits re-entry); the
// worker's sweepStaleAgentRuns recovers runs whose advance call was lost.

import prisma from "./prisma.js";
import { randomUUID } from "node:crypto";
import { reserveCredits, settleReservation, releaseReservation, refundCredits } from "./wallet.js";
import { enqueueJob } from "./job-queue.js";
import { releaseOrRefund } from "./job-runner.js";
import { llmComplete, resolveAdapterKey, brandForUser } from "./providers.js";
import {
  resolveRunnableModel,
  getRunnableModelsForType,
  requiresMediaInput,
  runnableProviderModelId,
} from "./runnable-models.js";
import { quoteCatalogModel } from "./model-catalog.js";
import { buildDag, validateDag } from "./dag.js";
import {
  isMediaAgent,
  isVideoOutput,
  latestImageOutput,
  displayOutputFor,
  assembleOutputs,
  buildExportResult,
  normalizeAgentKeyLite,
} from "./agent-output-core.mjs";
import {
  STORYBOARD_JSON_HINT,
  STRICT_JSON_RETRY_HINT,
  storyboardDraftFromParams,
  parseStoryboard,
} from "./storyboard-core.mjs";
import { AGENTS, TOOL_AGENT_KEYS, GENERIC_PERSONA_PROMPT } from "./agent-registry.mjs";
import { assembleVideos } from "./video-assembly.js";
import { renderTitleCard, overlayTitles } from "./title-render.js";
import { titleLines, titleDuration } from "./title-step.mjs";
import { chainStepIfNeeded } from "./video-chain.js";
import { log } from "./log.js";
import { injectEntities, purposeForStep } from "./entity-inject.js";
import { imageReferenceSlot, voiceReferenceSlot } from "./entity-core.mjs";
import { applyRequiredDefaults } from "./provider-payload-core.mjs";
import { normalizeSettings } from "./projects.js";

/* ── The project's format, applied to every step ──────────────────────────
   A run started inside a project inherits that project's aspect ratio. This
   is the whole reason format lives on the project: the planner guesses a
   ratio per step from the wording of the task, and a vertical film planned
   shot by shot came out with landscape shots in it. A project setting is a
   decision the user actually made, so it wins over the guess.

   Only applied where the model has the field — asking a model for an aspect
   ratio it does not take is a provider rejection, not a preference. */
async function projectFormatFor(run) {
  if (!run?.sessionId) return null;
  try {
    const session = await prisma.agentSession.findUnique({
      where: { id: run.sessionId },
      select: { project: { select: { data: true } } },
    });
    if (!session?.project) return null;
    return normalizeSettings(session.project.data || {});
  } catch {
    return null;
  }
}

function applyProjectFormat(params, schema, format) {
  if (!format) return null;
  const fields = schema?.fields;
  if (!fields || typeof fields !== "object") return null;
  const applied = {};
  if (fields.aspect_ratio && format.aspectRatio) {
    const allowed = fields.aspect_ratio.enum;
    if (!Array.isArray(allowed) || allowed.includes(format.aspectRatio)) {
      if (params.aspect_ratio !== format.aspectRatio) applied.aspect_ratio = format.aspectRatio;
      params.aspect_ratio = format.aspectRatio;
    }
  }
  if (fields.resolution && format.resolution) {
    const allowed = fields.resolution.enum;
    if (!Array.isArray(allowed) || allowed.includes(format.resolution)) {
      if (params.resolution !== format.resolution) applied.resolution = format.resolution;
      params.resolution = format.resolution;
    }
  }
  return Object.keys(applied).length ? applied : null;
}

// How many MEDIA jobs a single run may have in flight at once. Internal
// (LLM/storyboard/export) steps are cheap and uncapped; assembly is rare.
const MEDIA_IN_FLIGHT_CAP = 3;

const DEFAULT_WEBHOOK_URL = () =>
  `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`;

// AgentRun reservation TTL: the same per-step allowance TemplateRuns use.
const reservationTTLMinutes = (stepCount) => Math.max(60, stepCount * 40);

// Media-producing step kinds that run as provider jobs. `marketing` is
// conditional (media when images_list is present, LLM text otherwise);
// storyboard/assembly/export/personas always run internally.
function kindForStep(agent, params) {
  const key = normalizeAgentKeyLite(agent);
  if (["image", "video", "audio", "i2v", "upscale", "music", "voiceover"].includes(key)) return "media";
  if (key === "marketing") return params?.images_list?.length ? "media" : "internal";
  return "internal";
}

// Only these kinds name a ModelPricing-backed provider model worth
// validating/substituting (mirrors agents.js's CATALOG_MODEL_KINDS — the
// workflow kinds resolve through the same image/video/audio pools).
const CATALOG_KIND_BY_AGENT = {
  image: "image",
  video: "video",
  audio: "audio",
  i2v: "video",
  upscale: "image",
  music: "audio",
  voiceover: "audio",
  marketing: "video",
};

// ── Plan → DAG ────────────────────────────────────────────────────────────
// dependsOn comes from the wire tokens the planner actually emits:
// "$STEP_N_OUTPUT" (1-based plan position) anywhere in the params, and
// "${storyboard}" (depends on the plan's storyboard step). Explicit
// dependsOn arrays on steps are honored too.
function derivePlanDag(steps) {
  const base = steps.map((s, i) => ({ ...s, id: s.stepId || s.id || `step-${i + 1}` }));
  const ids = base.map((s) => s.id);
  const storyboardIdx = base.findIndex((s) => normalizeAgentKeyLite(s.agent) === "storyboard");
  const withDeps = base.map((s, i) => {
    const deps = new Set(Array.isArray(s.dependsOn) ? s.dependsOn.filter((d) => typeof d === "string") : []);
    const hay = JSON.stringify(s.params || {});
    for (const m of hay.matchAll(/\$STEP_(\d+)_OUTPUT/g)) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= steps.length && n - 1 !== i) deps.add(ids[n - 1]);
    }
    if (hay.includes("${storyboard}") && storyboardIdx !== -1 && storyboardIdx !== i) {
      deps.add(ids[storyboardIdx]);
    }
    return { ...s, dependsOn: [...deps] };
  });
  return buildDag(withDeps);
}

// ── $STEP_N_OUTPUT / ${storyboard} resolution ─────────────────────────────
// Exactly the semantics agents.js's executeStep has always had: N is the
// 1-based plan position; the storyboard token resolves to the first output
// containing a scenes payload (else the very first output).
function resolveStepParams(params, prevOutputs) {
  const resolved = { ...(params || {}) };
  const storyboardOutput =
    prevOutputs.find((o) => typeof o === "string" && /"scenes"\s*:/.test(o)) || prevOutputs[0];
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" && value.startsWith("$STEP_")) {
      const stepNum = parseInt(value.match(/\d+/)?.[0]) - 1;
      if (prevOutputs[stepNum]) resolved[key] = prevOutputs[stepNum];
    } else if (typeof value === "string" && value.includes("${storyboard}") && storyboardOutput) {
      resolved[key] = value.replaceAll("${storyboard}", storyboardOutput);
    }
  }
  return resolved;
}

// Raw outputs array for token resolution. `boundOutputs` (single-step review
// runs) occupy the FIRST slots — their $STEP_N references point at earlier
// steps of the plan the review came from. Within a run, a step's raw output
// lands at boundOutputs.length + stepIndex.
function buildPrevOutputs(run, steps) {
  const bound = Array.isArray(run.result?.boundOutputs) ? run.result.boundOutputs : [];
  const prev = [...bound];
  const offset = bound.length;
  for (const s of steps) {
    if (s.status === "succeeded") prev[offset + s.stepIndex] = s.output ?? s.outputUrl ?? null;
  }
  return prev;
}

const persistableParams = (params) => {
  const { _provider, ...rest } = params || {};
  return rest;
};

// Best-effort session history write — a failed append must never fail a run
// (mirrors agents.js's persistSessionMessage without the "@/"-aliased
// agent-sessions module).
async function persistSessionMessage(sessionId, kind, payload) {
  if (!sessionId) return;
  try {
    await prisma.agentMessage.create({
      data: { sessionId, role: "assistant", kind, content: JSON.stringify(payload) },
    });
    await prisma.agentSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }).catch(() => {});
  } catch { /* history is best-effort */ }
}

// Live progress for polling clients — same result.stepResults shape the
// legacy executor persisted after every step.
async function persistProgress(run, stepRows) {
  const stepResults = stepRows.map((s) => ({
    step: s.stepIndex + 1,
    agent: s.agent,
    task: s.task,
    status: s.status === "succeeded" ? "completed" : s.status,
    ...(s.error ? { error: s.error } : {}),
    ...(s.status === "succeeded" && s.output != null
      ? { output: typeof s.output === "string" ? s.output.slice(0, 500) : s.output }
      : {}),
  }));
  await prisma.agentRun
    .update({
      where: { id: run.id },
      data: { result: { ...(run.result || {}), stepResults, summary: run.result?.summary } },
    })
    .catch(() => {});
  return stepResults;
}

// Does this step actually carry the media its model needs?
//
// This used to test four hardcoded names — image_url, images_list, video_url,
// audio_url. Seedream's field is `image_urls` (plural), so a shot carrying six
// reference photographs still read as "text only" and got demoted onto
// z-image, which takes no reference at all. Same hardcoded-field-list trap as
// absolutizeMediaUrls and maxImages: ask the model's OWN schema where its
// media goes, then look there.
function hasMediaInput(row, params = {}) {
  const filled = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));
  const slot = imageReferenceSlot(row?.inputSchema);
  if (slot && filled(params[slot.field])) return true;
  const voice = voiceReferenceSlot(row?.inputSchema);
  if (voice && filled(params[voice.field])) return true;
  // Backstop for rows whose schema we do not have.
  return ["image_url", "image_urls", "images_list", "image_input", "reference_image",
          "reference_image_urls", "video_url", "audio_url", "first_frame_url"].some((f) => filled(params[f]));
}

// ── Model resolution with budget ceiling (worker-safe) ────────────────────
// quoteCatalogModel (model-catalog.js) is "@/"-free, so substitution can
// re-quote here in the worker. A substitute that re-quotes above the step's
// approved ceiling is skipped; failing is always preferred to overspending.
async function resolveStepModel(step, params) {
  const agentKey = normalizeAgentKeyLite(step.agent);
  const catalogKind = CATALOG_KIND_BY_AGENT[agentKey];
  const planned = params?.model || step.modelPlanned || null;
  if (!catalogKind || !planned) return { modelId: planned, row: null, substitution: null };

  let row = await resolveRunnableModel(planned).catch(() => null);
  if (row && requiresMediaInput(row) && !hasMediaInput(row, params)) {
    row = null; // media-required model on a text-only step — substitute instead of wasting a provider call
  }
  if (row) return { modelId: row.modelId, row, substitution: null };

  const ceiling = step.creditsQuoted;
  const candidates = await getRunnableModelsForType(catalogKind, { excludeModelIds: [planned], limit: 5 }).catch(() => []);
  for (const candidate of candidates) {
    if (requiresMediaInput(candidate)) continue;
    const quote = await quoteCatalogModel(candidate.modelId, params).catch(() => null);
    const credits = quote?.valid ? quote.credits : null;
    if (credits != null && ceiling != null && credits > ceiling) continue;
    return { modelId: candidate.modelId, row: candidate, substitution: `substituted:${planned}` };
  }
  const err = new Error(
    `The planned model "${planned}" is not runnable and no affordable replacement exists within this step's approved budget. Re-plan this step.`
  );
  err.code = "model_unavailable";
  throw err;
}

// ── Step enqueue (the ONLY place Generation + job rows are built) ─────────
async function enqueueStep(run, step, prevOutputs) {
  // Conditional claim: only the caller that flips pending → queued proceeds.
  // A concurrent advance (webhook + worker racing) loses with count 0.
  const claimed = await prisma.agentRunStep.updateMany({
    where: { id: step.id, status: "pending" },
    data: { status: "queued", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return false;

  try {
    const params = resolveStepParams(step.params, prevOutputs);
    const agentKey = normalizeAgentKeyLite(step.agent);

    if (step.kind === "internal") {
      const generation = await prisma.generation.create({
        data: {
          userId: run.userId,
          tool: agentKey,
          model: step.modelPlanned || agentKey,
          prompt: params.prompt || params.brief || step.task || "",
          params: persistableParams(params),
          status: "processing",
          creditsUsed: 0,
        },
      });
      await enqueueJob({
        generationId: generation.id,
        userId: run.userId,
        idempotencyKey: `agent-run-${run.id}-${step.stepId}`,
        payload: { agentRunId: run.id, stepId: step.stepId, internal: true, internalKind: agentKey },
        providerName: "internal",
        endpoint: null,
      });
      await prisma.agentRunStep.update({ where: { id: step.id }, data: { generationId: generation.id } });
      return true;
    }

    // Media step.
    if (["i2v", "upscale"].includes(agentKey) && !params.image_url) {
      const img = latestImageOutput(prevOutputs);
      if (img) params.image_url = img;
    }
    if (["video", "i2v"].includes(agentKey)) {
      // Last-frame chaining (continuity): a video step with no explicit
      // reference inherits the previous clip's last frame. Best-effort.
      try {
        const chained = await chainStepIfNeeded({ agent: step.agent, task: step.task, params }, prevOutputs);
        if (chained?.params) Object.assign(params, chained.params);
      } catch (err) {
        log.warn("agent_chain_frame_failed", { runId: run.id, stepId: step.stepId, err: err?.message });
      }
    }

    // Entity references FIRST, resolved against the PLANNED model's schema.
    // Order matters: resolveStepModel nulls out any model that requires media
    // input when the step has none, and substitutes something cheaper. The
    // entity's reference photographs ARE that media input — injecting after
    // resolution meant every character shot was demoted off
    // seedream/5-pro-image-to-image onto z-image, which takes no reference at
    // all, so the face was carried by the description alone.
    let finalPrompt = params.prompt || params.text || step.task || "";
    let entityDigests = null;
    const entityIds = Array.isArray(step.params?.entityIds) ? step.params.entityIds : [];
    if (entityIds.length) {
      try {
        const plannedRow = await resolveRunnableModel(step.params?.model || step.modelPlanned).catch(() => null);
        const injected = await injectEntities({
          prisma,
          userId: run.userId,
          entityIds,
          params,
          schema: plannedRow?.inputSchema || null,
          purpose: purposeForStep({ agent: agentKey, task: step.task, prompt: finalPrompt }),
        });
        Object.assign(params, injected.params);
        entityDigests = injected.digests;
        if (injected.promptPrefix) finalPrompt = `${injected.promptPrefix}

${finalPrompt}`;
      } catch (err) {
        // A missing cast must never sink the shot — it renders without the
        // reference and the run continues.
        log.warn("agent_entity_inject_failed", { runId: run.id, stepId: step.stepId, err: err?.message });
      }
    }

    const { modelId, row, substitution } = await resolveStepModel(step, params);

    // The project's format, before the required-defaults pass — otherwise a
    // default aspect ratio gets filled in first and the project's choice
    // never lands.
    const projectFormat = await projectFormatFor(run);
    const formatApplied = applyProjectFormat(params, row?.inputSchema || null, projectFormat);
    if (formatApplied) {
      log.info("agent_step_project_format", { runId: run.id, stepId: step.stepId, ...formatApplied });
    }

    const endpoint = row?.endpoint || modelId || agentKey;
    const providerModelId = (row && runnableProviderModelId(row)) || modelId || agentKey;

    // Fill the model's REQUIRED rendering settings, exactly as the async route
    // does. Without this a plan step on seedream/5-pro went out with no
    // `quality` and the provider rejected it — the fix had been applied to
    // one caller instead of to the shared path, which is the same mistake the
    // entity injection made.
    const withDefaults = applyRequiredDefaults(params, row?.inputSchema || null, { modelId: modelId || agentKey });
    Object.assign(params, withDefaults.params);
    if (Object.keys(withDefaults.filled).length) {
      log.info("agent_step_defaults_filled", { runId: run.id, stepId: step.stepId, filled: withDefaults.filled });
    }

    const generation = await prisma.generation.create({
      data: {
        userId: run.userId,
        tool: agentKey,
        model: modelId || agentKey,
        prompt: finalPrompt,
        params: entityDigests
          ? { ...persistableParams(params), entityIds, entityDigest: entityDigests }
          : persistableParams(params),
        status: "processing",
        creditsUsed: 0,
      },
    });
    await enqueueJob({
      generationId: generation.id,
      userId: run.userId,
      idempotencyKey: `agent-run-${run.id}-${step.stepId}`,
      payload: {
        ...persistableParams(params),
        prompt: finalPrompt,
        model: providerModelId,
        endpoint,
        callBackUrl: DEFAULT_WEBHOOK_URL(),
        agentRunId: run.id,
        stepId: step.stepId,
      },
      providerName: row ? resolveAdapterKey(row.providerName) : "kie",
      endpoint,
    });
    await prisma.agentRunStep.update({
      where: { id: step.id },
      data: { generationId: generation.id, modelUsed: modelId, substitution },
    });
    return true;
  } catch (err) {
    // Enqueue failed AFTER the claim flip — fail the step cleanly so the
    // run's finalize path (not a stuck queue) decides the outcome.
    await prisma.agentRunStep
      .update({
        where: { id: step.id },
        data: { status: "failed", error: brandForUser(err?.message || String(err)), completedAt: new Date() },
      })
      .catch(() => {});
    log.error("agent_step_enqueue_failed", { runId: run.id, stepId: step.stepId, err });
    return false;
  }
}

// ── Ready-step scheduling ─────────────────────────────────────────────────
export async function enqueueReadySteps(runId) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { runSteps: true } });
  if (!run || run.status !== "executing" || run.cancelRequested) return { enqueued: 0 };

  const steps = [...run.runSteps].sort((a, b) => a.stepIndex - b.stepIndex);
  const byStepId = new Map(steps.map((s) => [s.stepId, s]));
  const succeededIds = new Set(steps.filter((s) => s.status === "succeeded").map((s) => s.stepId));

  // Dependency-failure cascade: a step whose dependency can never produce an
  // output is skipped (never charged), repeatedly until a fixpoint.
  let cascaded = true;
  while (cascaded) {
    cascaded = false;
    for (const s of steps) {
      if (s.status !== "pending") continue;
      const deps = Array.isArray(s.dependsOn) ? s.dependsOn : [];
      if (deps.some((d) => ["failed", "skipped"].includes(byStepId.get(d)?.status))) {
        await prisma.agentRunStep.update({
          where: { id: s.id },
          data: { status: "skipped", error: "dependency_failed", completedAt: new Date() },
        }).catch(() => {});
        s.status = "skipped";
        cascaded = true;
      }
    }
  }

  // Budget gate (A1.2.3): never silently overspend the run's ceiling.
  const maxCredits = run.maxCredits ?? run.creditsEstimated;
  const actualSoFar = steps.reduce((a, s) => a + (s.creditsActual || 0), 0);
  const unfinishedQuoted = steps
    .filter((s) => ["pending", "queued", "running"].includes(s.status))
    .reduce((a, s) => a + (s.creditsQuoted || 0), 0);
  if (actualSoFar + unfinishedQuoted > maxCredits) {
    for (const s of steps) {
      if (s.status !== "pending") continue;
      await prisma.agentRunStep.update({
        where: { id: s.id },
        data: { status: "skipped", error: "budget_exceeded", completedAt: new Date() },
      }).catch(() => {});
      s.status = "skipped";
    }
  }

  // Recovery: a step claimed (queued) but whose Generation was never linked
  // (crash between claim flip and link) is reset to pending and retried.
  for (const s of steps) {
    if (s.status === "queued" && !s.generationId) {
      await prisma.agentRunStep.update({ where: { id: s.id }, data: { status: "pending" } }).catch(() => {});
      s.status = "pending";
    }
  }

  const inFlight = steps.filter((s) => s.kind === "media" && ["queued", "running"].includes(s.status)).length;
  let capacity = Math.max(0, MEDIA_IN_FLIGHT_CAP - inFlight);
  const prevOutputs = buildPrevOutputs(run, steps);

  let enqueued = 0;
  for (const s of steps) {
    if (s.status !== "pending") continue;
    const deps = Array.isArray(s.dependsOn) ? s.dependsOn : [];
    if (!deps.every((d) => succeededIds.has(d))) continue;
    if (s.kind === "media" && capacity <= 0) continue;
    const ok = await enqueueStep(run, s, prevOutputs);
    if (ok) {
      enqueued++;
      if (s.kind === "media") capacity--;
    }
  }
  return { enqueued };
}

// ── startAgentRun (WEB ONLY — lazily imports "@/"-aliased pricing-engine) ──
export async function startAgentRun({ userId, plan, sessionId = null, task = null, tier = null, qcMode = "off", maxCredits = null, boundOutputs = [] } = {}) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  if (!steps.length) {
    return { error: "The plan has no steps.", errorCode: "invalid_plan" };
  }

  const dagified = derivePlanDag(steps);
  const dagCheck = validateDag(dagified);
  if (!dagCheck.valid) {
    return { error: `Invalid plan: ${dagCheck.errors[0]}`, errorCode: "invalid_plan" };
  }

  // Server-authoritative quote — never the client's number. Lazy import:
  // pricing-engine.js uses "@/" aliases and must never load in the worker.
  const { estimateAgentTask } = await import("./pricing-engine.js");
  const estimate = await estimateAgentTask(steps);
  const approvedTotal = plan?.estimate?.total ?? plan?.approvedTotal ?? null;
  if (approvedTotal != null && estimate.total > approvedTotal) {
    return {
      error: `The quote changed since approval (${approvedTotal} → ${estimate.total} credits). Please re-approve the plan.`,
      errorCode: "quote_changed",
    };
  }

  const runId = randomUUID();
  const ttl = reservationTTLMinutes(steps.length);
  const breakdown = Array.isArray(estimate.breakdown) ? estimate.breakdown : [];

  // Preflight: every media step's model must resolve (planned or an
  // in-budget substitute) BEFORE any money moves. The legacy in-request
  // executor validated runnability before charging; the durable version
  // keeps that contract — a plan that cannot run never even holds a
  // reservation.
  for (let i = 0; i < dagified.length; i++) {
    const s = dagified[i];
    if (kindForStep(s.agent, s.params) !== "media") continue;
    try {
      await resolveStepModel({ agent: s.agent, modelPlanned: s.params?.model || null, creditsQuoted: breakdown[i]?.credits ?? null }, s.params || {});
    } catch (err) {
      if (err?.code === "model_unavailable") {
        return { error: err.message, errorCode: "model_unavailable" };
      }
      throw err;
    }
  }

  // Reserve BEFORE creating anything else; any setup failure after this
  // point releases the reservation and marks the run failed.
  try {
    await reserveCredits(userId, estimate.total, runId, ttl);
  } catch (err) {
    const msg = err?.message || "Insufficient credits";
    const m = msg.match(/need (\d+), have (\d+)/);
    return {
      error: msg,
      errorCode: "insufficient_credits",
      creditsNeeded: m ? Number(m[1]) : estimate.total,
      creditsAvailable: m ? Number(m[2]) : undefined,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agentRun.create({
        data: {
          id: runId,
          userId,
          agentType: "orchestrator",
          task: task || plan.summary || "Agent run",
          status: "executing",
          creditsEstimated: estimate.total,
          steps: steps,
          sessionId,
          maxCredits: maxCredits ?? estimate.total,
          tier,
          qcMode,
          engine: "durable",
          result: {
            stepResults: dagified.map((s, i) => ({ step: i + 1, agent: s.agent, task: s.task, status: "pending" })),
            summary: plan.summary || "",
            boundOutputs: Array.isArray(boundOutputs) ? boundOutputs : [],
          },
        },
      });
      for (let i = 0; i < dagified.length; i++) {
        const s = dagified[i];
        await tx.agentRunStep.create({
          data: {
            runId,
            stepIndex: i,
            stepId: s.id,
            agent: s.agent,
            task: s.task || "",
            params: s.params || {},
            dependsOn: s.dependsOn || [],
            kind: kindForStep(s.agent, s.params),
            status: "pending",
            creditsQuoted: breakdown[i]?.credits ?? 0,
            modelPlanned: s.params?.model || null,
          },
        });
      }
    });
  } catch (err) {
    await releaseOrRefund({ userId, id: runId, creditsUsed: estimate.total }, { payload: { creditsUsed: estimate.total } });
    log.error("agent_run_start_failed", { runId, err });
    return { error: "The run could not be started. Please try again.", errorCode: "internal" };
  }

  const { enqueued } = await enqueueReadySteps(runId);
  if (enqueued === 0) {
    // Nothing could even start (all steps failed enqueue) — close out now.
    await advanceAgentRun(runId);
  }
  return { queued: true, runId, estimate: { total: estimate.total, breakdown: estimate.breakdown } };
}

// ── advanceAgentRun — idempotent state-machine tick ───────────────────────
export async function advanceAgentRun(runId) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { runSteps: true } });
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "executing") return { ok: true, skipped: true };

  const steps = [...run.runSteps].sort((a, b) => a.stepIndex - b.stepIndex);

  // Cancellation: pending work is skipped, in-flight provider work finishes
  // but is never charged (money rule 3).
  if (run.cancelRequested) {
    for (const s of steps) {
      if (s.status === "pending") {
        await prisma.agentRunStep.update({
          where: { id: s.id },
          data: { status: "skipped", error: "cancelled", completedAt: new Date() },
        }).catch(() => {});
      }
    }
    await releaseOrRefund({ userId: run.userId, id: runId, creditsUsed: run.creditsEstimated }, { payload: { creditsUsed: run.creditsEstimated } });
    const finalSteps = await prisma.agentRunStep.findMany({ where: { runId }, orderBy: { stepIndex: "asc" } });
    const stepResults = await persistProgress(run, finalSteps);
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: "cancelled", error: "Cancelled by user", result: { ...(run.result || {}), stepResults } },
    });
    await persistSessionMessage(run.sessionId, "run", { runId, status: "cancelled", creditsUsed: 0, stepResults });
    return { ok: true, status: "cancelled" };
  }

  // Sync media steps from their Generation rows (internal steps are written
  // directly by executeInternalJob — see below).
  const genIds = steps.filter((s) => s.generationId).map((s) => s.generationId);
  const generations = genIds.length
    ? await prisma.generation.findMany({ where: { id: { in: genIds } } })
    : [];
  const genById = new Map(generations.map((g) => [g.id, g]));

  let changed = false;
  for (const s of steps) {
    if (!["queued", "running"].includes(s.status) || !s.generationId) continue;
    const gen = genById.get(s.generationId);
    if (!gen) continue;
    if (gen.status === "completed") {
      await prisma.agentRunStep.update({
        where: { id: s.id },
        data: {
          status: "succeeded",
          output: s.kind === "media" ? gen.outputUrl : (s.output ?? gen.outputUrl),
          outputUrl: gen.outputUrl,
          creditsActual: s.creditsQuoted,
          completedAt: new Date(),
        },
      }).catch(() => {});
      changed = true;
    } else if (gen.status === "failed") {
      await prisma.agentRunStep.update({
        where: { id: s.id },
        data: { status: "failed", error: gen.error || "Step failed", completedAt: new Date() },
      }).catch(() => {});
      changed = true;
    } else if (s.status === "queued") {
      await prisma.agentRunStep.update({ where: { id: s.id }, data: { status: "running" } }).catch(() => {});
    }
  }

  let current = await prisma.agentRunStep.findMany({ where: { runId }, orderBy: { stepIndex: "asc" } });
  await persistProgress(run, current);
  await enqueueReadySteps(runId);
  current = await prisma.agentRunStep.findMany({ where: { runId }, orderBy: { stepIndex: "asc" } });

  const active = current.filter((s) => ["pending", "queued", "running"].includes(s.status));
  if (active.length > 0) return { ok: true, status: "executing", changed };

  // ── Finalize ──
  const failed = current.filter((s) => s.status === "failed");
  const succeeded = current.filter((s) => s.status === "succeeded");
  const actualTotal = succeeded.reduce((a, s) => a + (s.creditsActual || 0), 0);

  // Money: settle actual (succeeded steps only — failed work is never
  // charged); when nothing succeeded, release the whole reservation.
  if (actualTotal > 0) {
    try {
      await settleReservation(run.userId, runId, actualTotal);
    } catch (err) {
      log.error("agent_run_settle_failed", { runId, userId: run.userId, amount: actualTotal, err });
    }
  } else {
    await releaseOrRefund({ userId: run.userId, id: runId, creditsUsed: run.creditsEstimated }, { payload: { creditsUsed: run.creditsEstimated } });
  }

  const stepResults = await persistProgress(run, current);
  const summary = run.result?.summary || "";

  if (failed.length > 0) {
    const firstError = failed[0].error || "A step failed";
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        error: firstError,
        creditsUsed: actualTotal,
        result: { ...(run.result || {}), stepResults },
      },
    });
    await persistSessionMessage(run.sessionId, "run", { runId, status: "failed", error: firstError, creditsUsed: actualTotal, stepResults });
    return { ok: true, status: "failed", error: firstError };
  }

  // Success: assemble display outputs exactly like the legacy executor.
  const offset = Array.isArray(run.result?.boundOutputs) ? run.result.boundOutputs.length : 0;
  const rawOutputs = [];
  const displayOutputs = [];
  const displaySteps = [];
  for (const s of current) {
    const raw = s.output ?? s.outputUrl ?? null;
    rawOutputs[offset + s.stepIndex] = raw;
    const isStoryboard = normalizeAgentKeyLite(s.agent) === "storyboard";
    const hidden = isStoryboard || s.params?.referenceOnly;
    displayOutputs.push(hidden ? null : displayOutputFor(s, raw));
    displaySteps.push({ agent: s.agent, task: s.task });
  }
  void rawOutputs;
  const assembled = assembleOutputs(displayOutputs, displaySteps);

  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      creditsUsed: actualTotal,
      result: { ...(run.result || {}), outputs: displayOutputs, stepResults, summary, assembled },
    },
  });
  await persistSessionMessage(run.sessionId, "run", { runId, status: "done", summary, creditsUsed: actualTotal, stepResults });
  await persistSessionMessage(run.sessionId, "outputs", {
    runId,
    assembled,
    outputs: displayOutputs.filter((o) => typeof o === "string"),
  });
  return { ok: true, status: "completed", creditsUsed: actualTotal };
}

// ── Internal step execution (storyboard / assembly / export / LLM text) ───
// Called by job-runner.js for payload.internal jobs. Idempotent: a step
// already terminal short-circuits (crash between step write and generation
// completion replays safely).
export async function executeInternalJob(payload) {
  const { agentRunId: runId, stepId } = payload || {};
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { runSteps: true } });
  if (!run) throw new Error(`Agent run ${runId} not found`);
  const step = run.runSteps.find((s) => s.stepId === stepId);
  if (!step) throw new Error(`Step ${stepId} not found in run ${runId}`);

  if (step.status === "succeeded") {
    return { output: step.output, outputUrl: step.outputUrl, already: true };
  }
  if (run.status !== "executing") {
    return { output: null, outputUrl: null, already: true };
  }

  const steps = [...run.runSteps].sort((a, b) => a.stepIndex - b.stepIndex);
  const prevOutputs = buildPrevOutputs(run, steps);
  const params = resolveStepParams(step.params, prevOutputs);
  const kind = normalizeAgentKeyLite(step.agent);

  let output = null;
  let outputUrl = null;

  if (kind === "storyboard") {
    const draft = storyboardDraftFromParams(step.params);
    if (draft) {
      output = JSON.stringify(draft);
    } else {
      const brief = params?.brief || params?.prompt || params?.task || step.task || "A short video";
      const messages = [
        { role: "system", content: AGENTS.storyboard.systemPrompt },
        { role: "user", content: `${brief}\n\n${STORYBOARD_JSON_HINT}` },
      ];
      let parsed = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const reply = await llmComplete(messages, { maxTokens: 3000, temperature: 0.4 });
        parsed = parseStoryboard(reply);
        if (!parsed && attempt === 0) messages.push({ role: "user", content: STRICT_JSON_RETRY_HINT });
      }
      if (!parsed) throw new Error("The storyboard draft could not be parsed. Please try again.");
      output = JSON.stringify(parsed);
    }
  } else if (kind === "assembly") {
    const clips = prevOutputs.filter(isVideoOutput);
    if (!clips.length) {
      throw new Error("This step joins the video clips made earlier in the chain, but none were produced.");
    }
    const options = {};
    if (typeof params?.transition === "string" && params.transition) options.transition = params.transition;
    if (params?.transitionDuration != null) options.transitionDuration = params.transitionDuration;
    outputUrl = await assembleVideos(clips, options);
    output = outputUrl;
  } else if (kind === "title") {
    /* Typography, rendered rather than generated — see title-cards.mjs for
       why that distinction is the whole point. Two modes, decided by what
       came before: with an earlier clip to sit on, the type is burned over
       it (a section title on a shot, which is what makes three sequences
       read as one film); with nothing before it, the card stands alone. */
    const format = await projectFormatFor(run);
    const height = format?.resolution === "1080p" || !format?.resolution ? 1080 : 720;
    const lines = titleLines(params, { height });
    if (!lines.length) throw new Error("A title step needs a headline or a subtitle to draw.");

    const logoUrl = typeof params.logoUrl === "string" && params.logoUrl ? params.logoUrl : null;
    const over = params.over === false ? null : prevOutputs.filter(isVideoOutput).pop() || null;

    const result = over
      ? await overlayTitles(over, { lines, logoUrl, logoWidth: params.logoWidth })
      : await renderTitleCard({
        lines,
        duration: titleDuration(params, lines),
        width: height === 1080 ? 1920 : 1280,
        height,
        background: params.background || "black",
        logoUrl,
        logoWidth: params.logoWidth,
      });
    outputUrl = result.url;
    output = result.url;
  } else if (kind === "export") {
    output = buildExportResult(params, prevOutputs, step.task);
    outputUrl = output.url || null;
  } else {
    // Persona / website / coding / marketing-text: one LLM completion using
    // the persona's own systemPrompt (or the generic fallback for an
    // invented agent name — a plan must never hard-crash over it).
    const systemPrompt = (AGENTS[kind] && !TOOL_AGENT_KEYS.has(kind) ? AGENTS[kind].systemPrompt : AGENTS[kind]?.systemPrompt) || GENERIC_PERSONA_PROMPT;
    const userContent = params?.prompt || params?.task || step.task || "Proceed with your role for this step.";
    output = await llmComplete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: typeof userContent === "string" ? userContent : JSON.stringify(userContent) },
      ],
      { maxTokens: 2000, temperature: 0.5 }
    );
  }

  await prisma.agentRunStep.update({
    where: { id: step.id },
    data: {
      status: "succeeded",
      output: output != null ? output : undefined,
      outputUrl,
      creditsActual: step.creditsQuoted,
      completedAt: new Date(),
    },
  });
  return { output, outputUrl };
}

// ── Worker sweep: recover runs whose advance was lost (restart mid-run) ───
// An executing run with no active jobs and no recent movement is either
// recoverable (advance can enqueue the next steps) or genuinely stuck
// (everything terminal but the finalize never ran) — advance handles both.
export async function sweepStaleAgentRuns({ staleMinutes = 10 } = {}) {
  const cutoff = new Date(Date.now() - staleMinutes * 60000);
  const stale = await prisma.agentRun.findMany({
    where: { status: "executing", updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 25,
  });
  let advanced = 0;
  for (const { id } of stale) {
    try {
      // "In flight" is a property of the PROVIDER work, not of the step row.
      // The whole point of this sweep is the run whose advance was lost:
      // its generations are already terminal while the step rows are still
      // queued/running, because the advance that would have synced them
      // never ran. Judging by step status alone would skip exactly that
      // case forever — and since wallet.js's reservation sweep deliberately
      // never touches an `executing` run, the reservation would be stranded
      // with no path back to the user.
      const openSteps = await prisma.agentRunStep.findMany({
        where: { runId: id, status: { in: ["queued", "running"] } },
        select: { generationId: true },
      });
      const genIds = openSteps.map((s) => s.generationId).filter(Boolean);
      const live = genIds.length
        ? await prisma.generation.count({
            where: { id: { in: genIds }, status: { notIn: ["completed", "failed"] } },
          })
        : 0;
      if (live > 0) continue; // genuinely still with the provider — leave it
      await advanceAgentRun(id);
      advanced++;
    } catch (err) {
      log.error("agent_run_sweep_failed", { runId: id, err });
    }
  }
  return { swept: stale.length, advanced };
}
