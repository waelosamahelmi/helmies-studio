import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase A route contract for the two spending entry points, /api/agent/run
// and /api/agent/step. Both now start ONE durable run instead of executing
// in-request. These assertions carry over the guarantees the retired
// agent-run-approved suite protected: an approved plan is executed verbatim
// (the planner is never re-run behind the user's back), overrides are
// re-quoted server-side, and every refusal keeps its HTTP envelope.

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn() }));
vi.mock("@/lib/agent-sessions", () => ({ resolveOwnedSession: vi.fn(async () => ({ id: "sess1" })) }));
vi.mock("@/lib/agent-runner", () => ({ startAgentRun: vi.fn() }));
vi.mock("@/lib/agents", () => ({ planTask: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ default: { agentRun: { findUnique: vi.fn() } } }));

import { startAgentRun } from "@/lib/agent-runner";
import { planTask } from "@/lib/agents";
import { POST as postRun } from "@/app/api/agent/run/route.js";
import { POST as postStep } from "@/app/api/agent/step/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const APPROVED_PLAN = {
  summary: "Two-shot promo",
  steps: [
    { agent: "image", task: "Hero still", params: { prompt: "a fox", model: "google/nano-banana-2-lite" } },
    { agent: "video", task: "Clip", params: { prompt: "$STEP_1_OUTPUT", model: "kling-3" } },
  ],
  estimate: { total: 40, breakdown: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  startAgentRun.mockResolvedValue({ queued: true, runId: "run-1", estimate: { total: 40, breakdown: [] } });
});

describe("POST /api/agent/run — durable start", () => {
  it("executes an approved plan verbatim: the planner is never called and the approved total becomes the ceiling", async () => {
    const res = await postRun(jsonReq({ plan: APPROVED_PLAN, stream: false, sessionId: "sess1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: true, runId: "run-1" });
    expect(planTask).not.toHaveBeenCalled();

    const arg = startAgentRun.mock.calls[0][0];
    expect(arg.userId).toBe("u1");
    expect(arg.plan.steps).toEqual(APPROVED_PLAN.steps);
    expect(arg.plan.approvedTotal).toBe(40);
    expect(arg.maxCredits).toBe(40);
    expect(arg.sessionId).toBe("sess1");
  });

  it("plans first when no approved plan is supplied", async () => {
    planTask.mockResolvedValue({ steps: APPROVED_PLAN.steps, summary: "s", estimate: { total: 40 } });

    await postRun(jsonReq({ message: "make me a promo", stream: false }));

    expect(planTask).toHaveBeenCalledTimes(1);
    expect(startAgentRun.mock.calls[0][0].plan.steps).toEqual(APPROVED_PLAN.steps);
  });

  it("surfaces a changed quote as invalid_params without starting anything", async () => {
    startAgentRun.mockResolvedValue({ error: "The quote changed since approval.", errorCode: "quote_changed" });

    const res = await postRun(jsonReq({ plan: APPROVED_PLAN, stream: false }));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_params");
  });

  it("returns a queued handle rather than a stream when background is requested", async () => {
    const res = await postRun(jsonReq({ plan: APPROVED_PLAN, background: true }));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toMatchObject({ queued: true, runId: "run-1" });
  });
});

describe("POST /api/agent/step — durable single step", () => {
  it("runs exactly the requested step, merging overrides over the planned params", async () => {
    const res = await postStep(
      jsonReq({
        plan: APPROVED_PLAN,
        stepIndex: 1,
        regenerate: true,
        paramOverrides: { model: "veo3", prompt: "a slower push-in" },
        previousOutputs: ["https://cdn.example/hero.png"],
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ queued: true, runId: "run-1", stepId: "step-1" });

    const arg = startAgentRun.mock.calls[0][0];
    expect(arg.plan.steps).toHaveLength(1);
    expect(arg.plan.steps[0].agent).toBe("video");
    expect(arg.plan.steps[0].params.model).toBe("veo3");
    expect(arg.plan.steps[0].params.prompt).toBe("a slower push-in");
    // The override is re-quoted fresh — no client total is accepted as a ceiling.
    expect(arg.plan.approvedTotal).toBeUndefined();
    expect(arg.boundOutputs).toEqual(["https://cdn.example/hero.png"]);
  });

  it("rejects a stepIndex outside the plan", async () => {
    const res = await postStep(jsonReq({ plan: APPROVED_PLAN, stepIndex: 9 }));
    expect(res.status).toBe(400);
    expect(startAgentRun).not.toHaveBeenCalled();
  });

  it("402s with the credit numbers when the step cannot be reserved", async () => {
    startAgentRun.mockResolvedValue({
      error: "Insufficient credits: need 20, have 3",
      errorCode: "insufficient_credits",
      creditsNeeded: 20,
      creditsAvailable: 3,
    });

    const res = await postStep(jsonReq({ plan: APPROVED_PLAN, stepIndex: 0 }));
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.creditsNeeded).toBe(20);
    expect(body.creditsAvailable).toBe(3);
  });
});
