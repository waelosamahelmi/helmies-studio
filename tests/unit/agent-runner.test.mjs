import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory stores + mock handles (hoisted so vi.mock factories can use them)
const h = vi.hoisted(() => {
  const steps = [];
  const gens = [];
  const runs = [];
  const messages = [];
  let stepSeq = 0;
  let genSeq = 0;
  let currentRun = null;

  const applyWhere = (rows, where = {}) => rows.filter((r) => {
    // `id` must be honored: the runner's conditional claim is an updateMany
    // scoped to one row (where: { id, status: "pending" }). Ignoring it here
    // would flip every pending step at once and hide real scheduling bugs.
    if (where.id && r.id !== where.id) return false;
    if (where.runId && r.runId !== where.runId) return false;
    if (where.stepId && r.stepId !== where.stepId) return false;
    if (where.status) {
      const s = where.status;
      if (typeof s === "string" && r.status !== s) return false;
      if (s && typeof s === "object") {
        if (s.in && !s.in.includes(r.status)) return false;
        if (s.notIn && s.notIn.includes(r.status)) return false;
        if (s.not && r.status === s.not) return false;
      }
    }
    return true;
  });

  async function findRunWithSteps({ where }) {
    const run = runs.find((r) => r.id === where.id) || null;
    if (!run) return null;
    return { ...run, runSteps: steps.filter((s) => s.runId === run.id).sort((a, b) => a.stepIndex - b.stepIndex) };
  }

  const prisma = {
    agentRun: {
      create: vi.fn(async ({ data }) => {
        const run = { id: data.id || `run-${runs.length + 1}`, cancelRequested: false, ...data };
        runs.push(run);
        currentRun = run;
        return run;
      }),
      update: vi.fn(async ({ where, data }) => {
        const run = runs.find((r) => r.id === where.id);
        Object.assign(run, data);
        if (data.runSteps) run.runSteps = data.runSteps;
        return run;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(findRunWithSteps),
      findMany: vi.fn(async () => runs),
    },
    agentRunStep: {
      create: vi.fn(async ({ data }) => {
        const row = { id: `rs-${++stepSeq}`, attempts: 0, dependsOn: [], params: {}, status: "pending", ...data };
        steps.push(row);
        return row;
      }),
      createMany: vi.fn(async ({ data }) => {
        for (const d of data) {
          steps.push({ id: `rs-${++stepSeq}`, attempts: 0, dependsOn: [], params: {}, status: "pending", ...d });
        }
        return { count: data.length };
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = steps.find((s) => (where.id && s.id === where.id) || (where.runId_stepId && s.runId === where.runId_stepId.runId && s.stepId === where.runId_stepId.stepId) || (where.runId && s.runId === where.runId && (!where.stepId || s.stepId === where.stepId)));
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const matched = applyWhere(steps, where);
        for (const m of matched) Object.assign(m, data);
        return { count: matched.length };
      }),
      findMany: vi.fn(async ({ where } = {}) => applyWhere(steps, where).sort((a, b) => a.stepIndex - b.stepIndex)),
      count: vi.fn(async ({ where } = {}) => applyWhere(steps, where).length),
    },
    generation: {
      create: vi.fn(async ({ data }) => {
        const row = { id: `gen-${++genSeq}`, ...data };
        gens.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where } = {}) => {
        if (where?.id?.in) return gens.filter((g) => where.id.in.includes(g.id));
        return gens;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async ({ where } = {}) => {
        const ids = where?.id?.in || [];
        return gens.filter((g) => {
          if (!ids.includes(g.id)) return false;
          const st = where?.status;
          if (st?.notIn) return !st.notIn.includes(g.status);
          if (st?.in) return st.in.includes(g.status);
          return true;
        }).length;
      }),
    },
    agentSession: { update: vi.fn(async () => ({})) },
    agentMessage: {
      create: vi.fn(async ({ data }) => {
        messages.push(data);
        return data;
      }),
    },
    modelPricing: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    providerConfig: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn) => fn(prisma)),
  };

  return {
    prisma, steps, gens, runs, messages, findRunWithSteps,
    get currentRun() { return currentRun; },
    set currentRun(v) { currentRun = v; },
    reset() {
      steps.length = 0; gens.length = 0; runs.length = 0; messages.length = 0;
      stepSeq = 0; genSeq = 0; currentRun = null;
    },
    wallet: {
      reserveCredits: vi.fn(async () => ({ ok: true })),
      settleReservation: vi.fn(async () => ({ ok: true })),
      releaseReservation: vi.fn(async () => ({ ok: true })),
      refundCredits: vi.fn(async () => ({ ok: true })),
    },
    queue: { enqueueJob: vi.fn(async ({ idempotencyKey }) => ({ id: `job-${idempotencyKey}` })) },
    runner: { releaseOrRefund: vi.fn(async () => ({ ok: true })) },
    providers: {
      llmComplete: vi.fn(async () => ({ content: "{}" })),
      resolveAdapterKey: vi.fn(() => "kie"),
      brandForUser: vi.fn((m) => m),
    },
    pricing: {
      estimateAgentTask: vi.fn((steps) => ({
        total: steps.length * 3,
        breakdown: steps.map((s, i) => ({ step: i + 1, tool: s.agent, model: s.params?.model || s.agent, credits: 3 })),
      })),
      estimateCredits: vi.fn(async () => 3),
    },
    assembly: { assembleVideos: vi.fn(async () => "/api/media/local/assembled_test.mp4") },
    chain: { chainStepIfNeeded: vi.fn(async (s) => s) },
  };
});

vi.mock("@/lib/prisma", () => ({ default: h.prisma, prisma: h.prisma }));
vi.mock("@/lib/wallet", () => h.wallet);
vi.mock("@/lib/job-queue", () => h.queue);
vi.mock("@/lib/job-runner", () => h.runner);
vi.mock("@/lib/providers", () => h.providers);
vi.mock("@/lib/pricing-engine", () => h.pricing);
vi.mock("@/lib/video-assembly", () => h.assembly);
vi.mock("@/lib/video-chain", () => h.chain);
vi.mock("@/lib/log", () => ({ log: { info() {}, warn() {}, error() {}, debug() {} } }));

const { startAgentRun, advanceAgentRun, executeInternalJob, sweepStaleAgentRuns } = await import("@/lib/agent-runner");

// ── Catalog fixtures (real model-catalog/runnable-models on mocked prisma)
const NANO = {
  modelId: "google/nano-banana-2-lite", providerModelId: "google/nano-banana-2-lite",
  providerName: "KIE", endpoint: "nano-banana-2-lite", capability: "text-to-image",
  modelType: "image", isActive: true, isDeprecated: false, creditsCost: 3,
  inputSchema: { fields: {} },
  pricingRules: { currency: "USD", unit: "fixed", rules: [{ price: 0.012 }] },
};
const QWEN_DEAD = {
  modelId: "alibaba:qwen-image-max", providerModelId: "qwen-image-max",
  providerName: "KIE", endpoint: "qwen-image-max", capability: "text-to-image",
  modelType: "image", isActive: true, isDeprecated: true, creditsCost: 6,
  inputSchema: { fields: {} },
  pricingRules: { currency: "USD", unit: "fixed", rules: [{ price: 0.024 }] },
};

function seedCatalog(rows) {
  h.prisma.modelPricing.findUnique.mockImplementation(async ({ where }) => rows.find((r) => r.modelId === where.modelId) || null);
  h.prisma.modelPricing.findFirst.mockImplementation(async ({ where }) => {
    if (where?.modelId?.endsWith) return rows.find((r) => r.modelId.endsWith(`:${where.modelId.endsWith}`)) || null;
    return rows[0] || null;
  });
  h.prisma.modelPricing.findMany.mockImplementation(async ({ where } = {}) => {
    let out = rows.filter((r) => r.isActive !== false && !r.isDeprecated);
    if (where?.modelType && typeof where.modelType === "string") out = out.filter((r) => r.modelType === where.modelType);
    if (where?.capability && typeof where.capability === "string") out = out.filter((r) => r.capability === where.capability);
    return out.sort((a, b) => (a.creditsCost ?? 0) - (b.creditsCost ?? 0));
  });
}

const imageStep = (over = {}) => ({ agent: "image", task: "Make a hero image", params: { prompt: "a fox", model: "google/nano-banana-2-lite" }, ...over });

beforeEach(() => {
  h.reset();
  vi.clearAllMocks();
  // clearAllMocks wipes call history but NOT implementations — any test that
  // overrides one must have it restored here or the override leaks forward.
  h.prisma.agentRun.findUnique.mockImplementation(h.findRunWithSteps);
  seedCatalog([NANO]);
  h.pricing.estimateAgentTask.mockImplementation((steps) => ({
    total: steps.length * 3,
    breakdown: steps.map((s, i) => ({ step: i + 1, tool: s.agent, model: s.params?.model || s.agent, credits: 3 })),
  }));
});

describe("startAgentRun", () => {
  it("rejects quote_changed when server estimate exceeds the approved total and never reserves", async () => {
    const res = await startAgentRun({ userId: "u1", plan: { steps: [imageStep()], approvedTotal: 1 }, task: "t" });
    expect(res.errorCode).toBe("quote_changed");
    expect(h.wallet.reserveCredits).not.toHaveBeenCalled();
    expect(h.prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it("rejects empty plans as invalid_plan", async () => {
    const res = await startAgentRun({ userId: "u1", plan: { steps: [] }, task: "t" });
    expect(res.errorCode).toBe("invalid_plan");
  });

  it("rejects cyclic declared dependencies as invalid_plan", async () => {
    const res = await startAgentRun({
      userId: "u1", task: "t",
      plan: { steps: [imageStep({ dependsOn: ["step-2"] }), imageStep({ dependsOn: ["step-1"] })] },
    });
    expect(res.errorCode).toBe("invalid_plan");
    expect(res.error).toMatch(/cycle/i);
  });

  it("maps insufficient balance to insufficient_credits with numbers", async () => {
    h.wallet.reserveCredits.mockRejectedValueOnce(new Error("Insufficient credits: need 3, have 1"));
    const res = await startAgentRun({ userId: "u1", plan: { steps: [imageStep()] }, task: "t" });
    expect(res.errorCode).toBe("insufficient_credits");
    expect(res.creditsNeeded).toBe(3);
    expect(res.creditsAvailable).toBe(1);
    expect(h.prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it("reserves once, creates run+steps, enqueues ready steps with zero-credit generations", async () => {
    const res = await startAgentRun({ userId: "u1", plan: { steps: [imageStep()] }, task: "t", sessionId: "sess1" });
    expect(res.queued).toBe(true);
    expect(res.runId).toBeTruthy();
    expect(h.wallet.reserveCredits).toHaveBeenCalledWith("u1", 3, res.runId, 60);
    expect(h.prisma.agentRun.create).toHaveBeenCalledTimes(1);
    const runData = h.prisma.agentRun.create.mock.calls[0][0].data;
    expect(runData.status).toBe("executing");
    expect(runData.engine).toBe("durable");
    // generation + job
    expect(h.gens).toHaveLength(1);
    expect(h.gens[0].creditsUsed).toBe(0);
    expect(h.gens[0].status).toBe("processing");
    const job = h.queue.enqueueJob.mock.calls[0][0];
    expect(job.idempotencyKey).toBe(`agent-run-${res.runId}-step-1`);
    expect(job.payload.agentRunId).toBe(res.runId);
    expect(job.payload.stepId).toBe("step-1");
    expect(job.payload.model).toBe("google/nano-banana-2-lite");
    expect(job.payload.callBackUrl).toMatch(/\/api\/webhooks\/generation-complete$/);
  });

  it("preflights models BEFORE reserving: unrunnable plan with empty catalog never touches the wallet", async () => {
    seedCatalog([]);
    const res = await startAgentRun({
      userId: "u1", task: "t",
      plan: { steps: [imageStep({ params: { prompt: "x", model: "no/such-model" } })] },
    });
    expect(res.errorCode).toBe("model_unavailable");
    expect(h.wallet.reserveCredits).not.toHaveBeenCalled();
    expect(h.prisma.agentRun.create).not.toHaveBeenCalled();
  });

  it("substitutes an unrunnable planned model with the cheapest runnable within ceiling", async () => {
    seedCatalog([NANO, QWEN_DEAD]);
    const res = await startAgentRun({
      userId: "u1", task: "t",
      plan: { steps: [imageStep({ params: { prompt: "x", model: "alibaba:qwen-image-max" } })] },
    });
    expect(res.queued).toBe(true);
    const job = h.queue.enqueueJob.mock.calls[0][0];
    expect(job.payload.model).toBe("google/nano-banana-2-lite");
    const stepRow = h.steps.find((s) => s.stepId === "step-1");
    expect(stepRow.modelUsed).toContain("nano-banana");
  });

  it("derives the DAG: ${storyboard} dep blocks dependents, independent roots enqueue in parallel", async () => {
    const steps = [
      { agent: "storyboard", task: "Board", params: { storyboard: JSON.stringify({ scenario: "s", scenes: [{ id: 1, title: "t", description: "d" }] }) } },
      imageStep({ task: "Scene still", params: { prompt: "Scene from ${storyboard}", model: "google/nano-banana-2-lite" } }),
      imageStep({ task: "Poster", params: { prompt: "poster", model: "google/nano-banana-2-lite" } }),
    ];
    h.pricing.estimateAgentTask.mockReturnValue({ total: 9, breakdown: steps.map((s, i) => ({ step: i + 1, tool: s.agent, model: s.params?.model || s.agent, credits: 3 })) });
    const res = await startAgentRun({ userId: "u1", plan: { steps }, task: "t" });
    expect(res.queued).toBe(true);
    expect(h.wallet.reserveCredits).toHaveBeenCalledWith("u1", 9, res.runId, 120);
    // step-2 depends on step-1 (storyboard); step-3 is independent
    const s2 = h.steps.find((s) => s.stepId === "step-2");
    expect(s2.dependsOn).toEqual(["step-1"]);
    // exactly two jobs enqueued at start: storyboard (internal) + poster (media)
    expect(h.queue.enqueueJob).toHaveBeenCalledTimes(2);
    const payloads = h.queue.enqueueJob.mock.calls.map((c) => c[0].payload);
    const internal = payloads.find((p) => p.internal === true);
    expect(internal.internalKind).toBe("storyboard");
    expect(internal.stepId).toBe("step-1");
    const media = payloads.find((p) => !p.internal);
    expect(media.stepId).toBe("step-3");
  });

  it("releases the reservation when post-reserve setup fails", async () => {
    h.prisma.$transaction.mockRejectedValueOnce(new Error("db down"));
    const res = await startAgentRun({ userId: "u1", plan: { steps: [imageStep()] }, task: "t" });
    expect(res.error).toBeTruthy();
    expect(h.runner.releaseOrRefund).toHaveBeenCalled();
  });
});

describe("advanceAgentRun", () => {
  function seedRun({ steps, runOver = {} }) {
    const run = {
      id: "run-1", userId: "u1", sessionId: "sess1", task: "t",
      status: "executing", cancelRequested: false,
      creditsEstimated: steps.reduce((a, s) => a + (s.creditsQuoted || 0), 0),
      maxCredits: null, ...runOver,
    };
    h.runs.push(run);
    h.setCurrentRunById?.(run.id);
    for (const s of steps) h.steps.push({ id: `rs-${s.stepId}`, runId: run.id, attempts: 0, dependsOn: [], params: {}, ...s });
    return run;
  }

  it("settles exactly the succeeded actuals on completion and is idempotent", async () => {
    const run = seedRun({
      steps: [{ stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "queued", generationId: "gen-1", creditsQuoted: 3, modelPlanned: "nano" }],
    });
    h.gens.push({ id: "gen-1", status: "completed", outputUrl: "https://cdn.example/x.png" });

    const first = await advanceAgentRun(run.id);
    expect(first.status).toBe("completed");
    expect(h.wallet.settleReservation).toHaveBeenCalledTimes(1);
    expect(h.wallet.settleReservation).toHaveBeenCalledWith("u1", run.id, 3);
    expect(h.runner.releaseOrRefund).not.toHaveBeenCalled();
    const done = h.prisma.agentRun.update.mock.calls.map((c) => c[0].data).find((d) => d.status === "completed");
    expect(done.creditsUsed).toBe(3);
    // session messages: run + outputs
    expect(h.messages.map((m) => m.kind)).toEqual(["run", "outputs"]);

    h.prisma.agentRun.findUnique.mockImplementation(async () => ({ ...run, status: "completed", runSteps: h.steps }));
    const second = await advanceAgentRun(run.id);
    expect(second.skipped).toBe(true);
    expect(h.wallet.settleReservation).toHaveBeenCalledTimes(1);
  });

  it("failed run with a succeeded step settles the actuals only (failed step never charged)", async () => {
    const run = seedRun({
      steps: [
        { stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "queued", generationId: "gen-1", creditsQuoted: 3 },
        { stepId: "step-2", stepIndex: 1, agent: "image", task: "b", kind: "media", status: "queued", generationId: "gen-2", creditsQuoted: 3 },
      ],
    });
    h.gens.push({ id: "gen-1", status: "completed", outputUrl: "https://cdn.example/x.png" });
    h.gens.push({ id: "gen-2", status: "failed", error: "provider exploded" });

    const res = await advanceAgentRun(run.id);
    expect(res.status).toBe("failed");
    expect(h.wallet.settleReservation).toHaveBeenCalledWith("u1", run.id, 3);
    const failed = h.prisma.agentRun.update.mock.calls.map((c) => c[0].data).find((d) => d.status === "failed");
    expect(failed.creditsUsed).toBe(3);
  });

  it("all-failed run releases the reservation without settling", async () => {
    const run = seedRun({
      steps: [{ stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "queued", generationId: "gen-1", creditsQuoted: 3 }],
    });
    h.gens.push({ id: "gen-1", status: "failed", error: "boom" });
    const res = await advanceAgentRun(run.id);
    expect(res.status).toBe("failed");
    expect(h.wallet.settleReservation).not.toHaveBeenCalled();
    expect(h.runner.releaseOrRefund).toHaveBeenCalled();
  });

  it("cancel skips pending steps and releases without settling", async () => {
    const run = seedRun({
      runOver: { cancelRequested: true },
      steps: [{ stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "pending", creditsQuoted: 3 }],
    });
    const res = await advanceAgentRun(run.id);
    expect(res.status).toBe("cancelled");
    expect(h.steps[0].status).toBe("skipped");
    expect(h.runner.releaseOrRefund).toHaveBeenCalled();
    expect(h.wallet.settleReservation).not.toHaveBeenCalled();
    expect(h.queue.enqueueJob).not.toHaveBeenCalled();
  });

  it("budget gate skips pending steps that would exceed maxCredits", async () => {
    const run = seedRun({
      runOver: { maxCredits: 3, creditsEstimated: 6 },
      steps: [
        { stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "pending", creditsQuoted: 3, params: { prompt: "a", model: "google/nano-banana-2-lite" } },
        { stepId: "step-2", stepIndex: 1, agent: "image", task: "b", kind: "media", status: "pending", creditsQuoted: 3, params: { prompt: "b", model: "google/nano-banana-2-lite" } },
      ],
    });
    await advanceAgentRun(run.id);
    expect(h.queue.enqueueJob).not.toHaveBeenCalled();
    expect(h.steps.every((s) => s.status === "skipped")).toBe(true);
    expect(h.steps[0].error).toMatch(/budget/i);
  });
});

describe("executeInternalJob", () => {
  it("passes an approved storyboard draft through without an LLM call and is idempotent", async () => {
    const draft = JSON.stringify({ scenario: "s", scenes: [{ id: 1, title: "t", description: "d" }] });
    h.runs.push({ id: "run-1", userId: "u1", sessionId: null, task: "t", status: "executing", cancelRequested: false, creditsEstimated: 0 });
    h.steps.push({
      id: "rs-1", runId: "run-1", stepId: "step-1", stepIndex: 0, agent: "storyboard", task: "board",
      kind: "internal", status: "queued", creditsQuoted: 0, params: { storyboard: draft }, dependsOn: [],
    });

    const res = await executeInternalJob({ agentRunId: "run-1", stepId: "step-1" });
    expect(res.output).toBeTruthy();
    expect(h.providers.llmComplete).not.toHaveBeenCalled();
    expect(h.steps[0].status).toBe("succeeded");

    const again = await executeInternalJob({ agentRunId: "run-1", stepId: "step-1" });
    expect(again.already).toBe(true);
  });
});

describe("sweepStaleAgentRuns", () => {
  // The sweep exists for the run whose advance was lost: its generations are
  // already terminal while the step rows still say queued. Judging "in
  // flight" by step status alone skipped exactly that case forever, and
  // wallet.js never releases an `executing` run's reservation — so the
  // credits had no path back to the user.
  function seedStuckRun(genStatus) {
    h.runs.push({ id: "run-1", userId: "u1", sessionId: null, task: "t", status: "executing", cancelRequested: false, creditsEstimated: 3, maxCredits: 3 });
    h.steps.push({ id: "rs-1", runId: "run-1", stepId: "step-1", stepIndex: 0, agent: "image", task: "a", kind: "media", status: "queued", generationId: "gen-1", creditsQuoted: 3, dependsOn: [], params: {} });
    h.gens.push({ id: "gen-1", status: genStatus, outputUrl: "https://cdn.example/x.png" });
  }

  it("finalizes a stale run whose step is queued but whose generation already landed", async () => {
    seedStuckRun("completed");

    const res = await sweepStaleAgentRuns({ staleMinutes: 10 });

    expect(res.advanced).toBe(1);
    expect(h.steps[0].status).toBe("succeeded");
    expect(h.wallet.settleReservation).toHaveBeenCalledWith("u1", "run-1", 3);
  });

  it("leaves a run alone while its provider work is genuinely still running", async () => {
    seedStuckRun("processing");

    const res = await sweepStaleAgentRuns({ staleMinutes: 10 });

    expect(res.advanced).toBe(0);
    expect(h.wallet.settleReservation).not.toHaveBeenCalled();
    expect(h.runner.releaseOrRefund).not.toHaveBeenCalled();
  });
});
