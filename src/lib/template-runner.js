// Helmies Studio — Template Runs on the Durable Job Queue (Phase 6 Task 3)
//
// A TemplateRun executes a published TemplateVersion's graph, one step at a
// time, over the Phase 4A durable queue (src/lib/job-queue.js /
// src/lib/job-runner.js): startTemplateRun quotes the whole graph, reserves
// the FULL total ONCE, and enqueues the first step; advanceTemplateRun is
// called by job-runner.js after each step's own generation reaches a
// terminal state and either chains the next step or closes the run out
// (settle-once on the last step, release-or-refund-once on any failure).
//
// MONEY RULE (normative, mirrors job-runner.js's own header): exactly one
// reservation exists per run (keyed by the run's own id, via
// reserveCredits(userId, total, runId) — the same `jobId` parameter every
// other wallet.js caller uses for a Generation id also accepts a
// TemplateRun id; wallet.js only ever treats it as an opaque reservation
// key). Each step's own Generation row is created with creditsUsed: 0 and
// NEVER gets its own reservation — job-runner.js's normal per-generation
// settle/release path is deliberately bypassed for a job carrying
// payload.templateRunId (see that file's runJob/handleFailure/
// sweepTimedOutJobs) specifically so this module is the ONLY thing that
// ever moves money for a template run. releaseOrRefund is imported and
// reused UNCHANGED from job-runner.js — not reimplemented here — per that
// function's own money rules (release first; "No active reservation found"
// or a null return falls back to refund; release and refund are never both
// called for the same failure).
//
// WORKER-SAFETY (see job-runner.js / scripts/worker.mjs's header comments
// for the full story): this file is loaded transitively by scripts/worker.mjs
// under plain `node` via job-runner.js's import of advanceTemplateRun below
// — so every import actually needed by advanceTemplateRun must be a
// relative path with an explicit ".js" extension, and none of them may
// touch a module that uses the "@/..." bundler-only alias.
// src/lib/template-quote.js (quoteTemplate) transitively imports
// src/lib/model-catalog.js, which DOES use the "@/..." alias — that's fine
// for startTemplateRun (only ever called from the Next-bundled route,
// never from the worker), so it is imported LAZILY (dynamic import) inside
// startTemplateRun only, never at module top level, so the worker process
// never has to resolve it.
import prisma from "./prisma.js";
import { randomUUID } from "node:crypto";
import { topoSort } from "./template-graph.js";
import { reserveCredits, settleReservation } from "./wallet.js";
import { enqueueJob } from "./job-queue.js";
import { releaseOrRefund } from "./job-runner.js";
import { resolveAdapterKey } from "./providers.js";

const DEFAULT_WEBHOOK_URL = () =>
  `${process.env.NEXTAUTH_URL || "https://studio.helmies.fi"}/api/webhooks/generation-complete`;

// Merge a step's own graph-declared inputs with a caller-supplied per-step
// override (inputs[step.id]) — same convention as
// src/lib/template-quote.js's stepParams, kept as an independent (tiny)
// copy rather than an import specifically so this module's worker-reachable
// half never has to load template-quote.js (see the header comment above).
function mergeStepInputs(step, callerInputs) {
  return { ...(step.inputs || {}), ...((callerInputs && callerInputs[step.id]) || {}) };
}

// Resolve `$stepN.output` placeholders embedded in a step's (merged) input
// values against the real outputs of already-completed steps
// (stepOutputs: { [stepId]: outputUrl }). A value that is EXACTLY a
// placeholder is replaced wholesale (the common case — an image_url/
// video_url field); a placeholder embedded inside a longer string is
// substituted in place. A reference to a step with no recorded output yet
// is left untouched rather than resolved to undefined — validateGraph
// (Task 1) already guarantees every reference names an earlier, and
// therefore by the time this runs, completed, step.
function resolveValue(value, stepOutputs) {
  if (typeof value === "string") {
    const exact = value.match(/^\$step(\d+)\.output$/);
    if (exact) return stepOutputs[`step${exact[1]}`] ?? value;
    return value.replace(/\$step(\d+)\.output/g, (m, n) => stepOutputs[`step${n}`] ?? m);
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, stepOutputs));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, stepOutputs)]));
  }
  return value;
}

function resolveStepParams(step, stepOutputs, callerInputs) {
  const merged = mergeStepInputs(step, callerInputs);
  const resolved = {};
  for (const [key, value] of Object.entries(merged)) resolved[key] = resolveValue(value, stepOutputs);
  return resolved;
}

// Create the Generation row + durable job for one step. Shared by
// startTemplateRun (step 1) and advanceTemplateRun (every later step) so
// there is exactly one place that builds the provider payload/idempotency
// key shape. `model` is the step's ModelPricing row (already loaded by the
// caller — both call sites need to check it exists before creating
// anything). Note: the job's `payload` carries `templateRunId`/`stepId` at
// the top level, per this module's interface contract with job-runner.js —
// that means these two fields DO get forwarded inside the outbound
// provider request body (src/lib/providers.js's submitOnly spreads every
// non-model/prompt payload key into the request), which every provider
// integrated here (KIE, Alibaba) simply ignores as unrecognized extra JSON
// fields. There is no separate metadata channel on GenerationJob to avoid
// this without inventing one; the leak is inert, not a money or security
// issue.
async function enqueueStep({ runId, userId, step, model, params }) {
  const generation = await prisma.generation.create({
    data: {
      userId,
      tool: step.tool,
      model: step.modelId,
      prompt: params.prompt || "",
      params,
      status: "processing",
      creditsUsed: 0, // template-run credits live on the run's own single reservation, not per step
    },
  });

  const endpoint = model.endpoint || step.modelId;
  const providerModelId = model.providerModelId || step.modelId;
  const payload = {
    ...params,
    model: providerModelId,
    endpoint,
    callBackUrl: DEFAULT_WEBHOOK_URL(),
    templateRunId: runId,
    stepId: step.id,
  };

  await enqueueJob({
    generationId: generation.id,
    userId,
    idempotencyKey: `template-run-${runId}-${step.id}`,
    payload,
    // resolveAdapterKey normalizes ModelPricing.providerName (e.g. the
    // Alibaba catalog's exact display casing "Alibaba" — see
    // src/lib/alibaba-catalog.js) to the lowercase adapter key
    // src/lib/providers.js's PROVIDERS map/getProvider actually indexes by
    // ("alibaba"/"kie"). Passing the raw, unnormalized display name here
    // (as an earlier version of this function did) makes getProvider's
    // direct `PROVIDERS[name]` lookup miss and silently fall back to
    // DEFAULT_PROVIDER ("kie") — the exact same normalization
    // generate/async/route.js gets via resolveProvider(modelId)'s own
    // internal resolveAdapterKey call; this is the cheaper direct call
    // recommended for a caller (like this one) that already has the
    // ModelPricing row in hand, per that function's own doc comment.
    providerName: resolveAdapterKey(model.providerName),
    endpoint,
  });

  return generation;
}

// startTemplateRun({ userId, slug, inputs }) -> { runId, totalCredits }.
// Quotes the currently PUBLISHED version, reserves the FULL total ONCE, and
// enqueues step 1. Insufficient credits throws reserveCredits' own standard
// "Insufficient credits: ..." error unchanged (the route maps it to 402,
// matching /api/generate/async).
export async function startTemplateRun({ userId, slug, inputs = {} }) {
  const template = await prisma.template.findUnique({ where: { slug } });
  if (!template) throw new Error("Template not found");

  const version = await prisma.templateVersion.findFirst({
    where: { templateId: template.id, status: "published" },
    orderBy: { version: "desc" },
  });
  if (!version) throw new Error("Template not available");

  const graph = version.graph;

  // Lazy/dynamic on purpose — see the module header. Never hoisted to a
  // static top-level import.
  const { quoteTemplate } = await import("./template-quote.js");
  const quote = await quoteTemplate(graph, inputs);
  if (!quote.valid) throw new Error(`Template quote invalid: ${quote.errors.join("; ")}`);

  const order = topoSort(graph);
  const stepById = new Map(graph.steps.map((s) => [s.id, s]));
  const firstStepId = order[0];
  const firstStep = stepById.get(firstStepId);

  const runId = randomUUID();

  // Reserve the full total ONCE, up front — never per step. Throws on a
  // shortfall before anything else is created.
  await reserveCredits(userId, quote.totalCredits, runId);

  const model = await prisma.modelPricing.findUnique({ where: { modelId: firstStep.modelId } });
  if (!model) {
    // Structurally impossible if canPublish (Task 2) gated this version —
    // defensive only. The reservation already happened; release it rather
    // than stranding credits behind a run that will never start.
    await releaseOrRefund({ userId, id: runId, creditsUsed: quote.totalCredits }, { payload: {} });
    throw new Error(`Model "${firstStep.modelId}" is no longer available`);
  }

  const params = resolveStepParams(firstStep, {}, inputs);
  const generation = await enqueueStep({ runId, userId, step: firstStep, model, params });

  const stepState = {};
  for (const s of graph.steps) {
    stepState[s.id] =
      s.id === firstStepId
        ? { status: "running", generationId: generation.id, outputUrl: null, error: null }
        : { status: "pending", generationId: null, outputUrl: null, error: null };
  }

  await prisma.templateRun.create({
    data: {
      id: runId,
      userId,
      templateId: template.id,
      versionId: version.id,
      status: "running",
      stepState,
      totalCredits: quote.totalCredits,
    },
  });

  return { runId, totalCredits: quote.totalCredits };
}

// Never throws — mirrors job-runner.js's safeSettle (rule 3: a credit-side
// failure is logged loudly, never masks the fact that every step's real
// output already landed).
async function safeSettleRun(userId, runId, totalCredits) {
  try {
    await settleReservation(userId, runId, totalCredits);
  } catch (err) {
    console.error(
      `[template-runner] SETTLE FAILED — user may not be charged correctly. userId=${userId} runId=${runId} amount=${totalCredits}:`,
      err.message
    );
  }
}

// advanceTemplateRun(runId) — called by job-runner.js exactly once per step
// terminal transition (immediately after IT wins its own conditional
// generation-status transition, so this is never invoked twice for the same
// step's outcome — see job-runner.js's tryTransitionGeneration/rule 4). Re-
// derives everything it needs from persisted state rather than taking a
// step id as a parameter, per this module's own interface contract: reads
// the run, finds the one step currently "running", and looks at THAT step's
// Generation row to decide what happened.
export async function advanceTemplateRun(runId) {
  const run = await prisma.templateRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "running") return; // already terminal, or unknown — idempotent no-op

  const version = await prisma.templateVersion.findUnique({ where: { id: run.versionId } });
  if (!version) {
    console.error(`[template-runner] advanceTemplateRun: TemplateVersion ${run.versionId} not found for run ${runId}`);
    return;
  }
  const graph = version.graph;
  const stepById = new Map(graph.steps.map((s) => [s.id, s]));

  const stepState = { ...run.stepState };
  const currentStepId = Object.keys(stepState).find((id) => stepState[id]?.status === "running");
  if (!currentStepId) return; // nothing actively running — already advanced/closed out

  const currentGenerationId = stepState[currentStepId].generationId;
  const generation = currentGenerationId
    ? await prisma.generation.findUnique({ where: { id: currentGenerationId } })
    : null;
  if (!generation) {
    console.error(
      `[template-runner] advanceTemplateRun: Generation ${currentGenerationId} not found for run ${runId} step ${currentStepId}`
    );
    return;
  }

  if (generation.status === "completed") {
    stepState[currentStepId] = {
      ...stepState[currentStepId],
      status: "completed",
      outputUrl: generation.outputUrl,
      error: null,
    };

    const order = topoSort(graph);
    const nextStepId = order[order.indexOf(currentStepId) + 1];

    if (!nextStepId) {
      // Last step done — settle the WHOLE reservation at the quoted total,
      // exactly once, and close the run out.
      await safeSettleRun(run.userId, runId, run.totalCredits);
      await prisma.templateRun.update({ where: { id: runId }, data: { status: "completed", stepState } });
      return;
    }

    const stepOutputs = {};
    for (const [id, s] of Object.entries(stepState)) {
      if (s.status === "completed") stepOutputs[id] = s.outputUrl;
    }

    const nextStep = stepById.get(nextStepId);
    const model = await prisma.modelPricing.findUnique({ where: { modelId: nextStep.modelId } });
    if (!model) {
      // Structurally impossible if canPublish gated this version —
      // defensive only. Treat exactly like a step failure: release/refund
      // the run's one reservation exactly once, mark it failed.
      stepState[nextStepId] = {
        status: "failed",
        generationId: null,
        outputUrl: null,
        error: `Model "${nextStep.modelId}" is no longer available`,
      };
      await prisma.templateRun.update({ where: { id: runId }, data: { status: "failed", stepState } });
      await releaseOrRefund({ userId: run.userId, id: runId, creditsUsed: run.totalCredits }, { payload: {} });
      return;
    }

    const params = resolveStepParams(nextStep, stepOutputs, {});
    const nextGeneration = await enqueueStep({ runId, userId: run.userId, step: nextStep, model, params });

    stepState[nextStepId] = { status: "running", generationId: nextGeneration.id, outputUrl: null, error: null };
    await prisma.templateRun.update({ where: { id: runId }, data: { stepState } });
    return;
  }

  if (generation.status === "failed") {
    stepState[currentStepId] = {
      ...stepState[currentStepId],
      status: "failed",
      error: generation.error || "Generation failed",
    };
    await prisma.templateRun.update({ where: { id: runId }, data: { status: "failed", stepState } });
    // Release-or-refund the run's ONE reservation exactly once — reused
    // unchanged from job-runner.js, never a second implementation.
    await releaseOrRefund({ userId: run.userId, id: runId, creditsUsed: run.totalCredits }, { payload: {} });
    return;
  }

  // Still pending/processing — defensive no-op. In practice this function
  // is only ever invoked right after the generation's own terminal
  // transition already landed.
}
