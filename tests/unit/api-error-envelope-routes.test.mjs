import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase E2 Task E2.1 — every converted route answers errors with the uniform
// envelope { error, code, title, errorId, retryable, details, ...extra }.
// This file covers the converted routes that had no dedicated test file
// (estimate, agent/*, director/status, workflows list/create/publish,
// upload's auth gate). The heavier routes keep their envelope assertions in
// their own files: generate/async (generate-async-enqueue.test.mjs,
// generation-pricing-strict.test.mjs), generations/status
// (generations-status.test.mjs), director plan/execute/rerun and workflows
// run/regen (api-director-*.test.mjs, api-workflows-*.test.mjs), upload's
// content checks (api-upload-sniff.test.mjs).

vi.mock("@/lib/session", () => ({
  getCurrentUser: vi.fn(),
  getCurrentUserWithCredits: vi.fn(),
}));
vi.mock("@/lib/security", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    // E4.1: director/status now reads the REAL director tables
    // (directorPipeline + directorShot), not `project`.
    directorPipeline: { findFirst: vi.fn(), findMany: vi.fn() },
    directorShot: { findMany: vi.fn() },
    workflow: { updateMany: vi.fn(), findFirst: vi.fn() },
    asset: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/pricing-engine", () => ({ estimateCredits: vi.fn() }));
vi.mock("@/lib/credit-packs", () => ({ CREDIT_PACKS: [] }));
vi.mock("@/lib/agents", () => ({
  planTask: vi.fn(),
  planTaskStream: vi.fn(),
}));
// Phase A: /api/agent/run starts a DURABLE run — the route's error envelope
// now maps agent-runner's errorCode, not the retired in-request executor's.
vi.mock("@/lib/agent-runner", () => ({ startAgentRun: vi.fn() }));
vi.mock("@/lib/agent-sessions", () => ({ resolveOwnedSession: vi.fn(async () => null) }));
vi.mock("@/lib/providers", () => ({
  llmComplete: vi.fn(),
  brandError: vi.fn((t) => "Something went wrong on our end. Please try again."),
}));
vi.mock("@/lib/workflows", () => ({
  getUserWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  getTemplateWorkflows: vi.fn(),
  getPublishedWorkflows: vi.fn(),
  executeWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  publishWorkflow: vi.fn(),
  regenerateStep: vi.fn(),
}));
vi.mock("@/lib/upload-sniff", () => ({ sniffMatchesMime: vi.fn(() => true) }));

import { getCurrentUser, getCurrentUserWithCredits } from "@/lib/session";
import { checkRateLimit } from "@/lib/security";
import prisma from "@/lib/prisma";
import { estimateCredits } from "@/lib/pricing-engine";
import { startAgentRun } from "@/lib/agent-runner";
import { planTask } from "@/lib/agents";
import { getUserWorkflows } from "@/lib/workflows";

import { POST as postEstimate } from "@/app/api/estimate/route.js";
import { POST as postAgentChat } from "@/app/api/agent/chat/route.js";
import { POST as postAgentPlan } from "@/app/api/agent/plan/route.js";
import { POST as postAgentRun } from "@/app/api/agent/run/route.js";
import { GET as getDirectorStatus } from "@/app/api/director/status/route.js";
import { GET as getWorkflows, POST as postWorkflows } from "@/app/api/workflows/route.js";
import { POST as postPublish } from "@/app/api/workflows/[id]/publish/route.js";
import { POST as postUpload } from "@/app/api/upload/route.js";

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

function expectEnvelope(body, code) {
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  expect(body.code).toBe(code);
  expect(typeof body.title).toBe("string");
  expect(body.errorId).toMatch(/^[0-9a-f-]{8}$/);
  expect(typeof body.retryable).toBe("boolean");
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  getCurrentUserWithCredits.mockResolvedValue({ id: "u1", credits: 100 });
  checkRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/estimate — envelope", () => {
  it("401s with an unauthorized envelope", async () => {
    getCurrentUserWithCredits.mockResolvedValue(null);
    const res = await postEstimate(jsonReq("http://test/api/estimate", { tool: "image", model: "m1" }));
    expect(res.status).toBe(401);
    expectEnvelope(await res.json(), "unauthorized");
  });

  it("500s with a generic internal envelope, never the thrown message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    estimateCredits.mockRejectedValue(new Error("pricing table exploded"));
    const res = await postEstimate(jsonReq("http://test/api/estimate", { tool: "image", model: "m1" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expectEnvelope(body, "internal");
    expect(JSON.stringify(body)).not.toContain("pricing table exploded");
    // The cause reached the server-side log, keyed by the same errorId.
    expect(String(errSpy.mock.calls[0][0])).toContain(body.errorId);
  });
});

describe("POST /api/agent/chat — envelope", () => {
  it("400s with a bad_request envelope when messages are missing", async () => {
    const res = await postAgentChat(jsonReq("http://test/api/agent/chat", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expectEnvelope(body, "bad_request");
    expect(body.error).toBe("Messages required");
  });

  it("429s with retryAfter preserved", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 17 });
    const res = await postAgentChat(jsonReq("http://test/api/agent/chat", { messages: [{ role: "user", content: "x" }] }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expectEnvelope(body, "rate_limited");
    expect(body.retryAfter).toBe(17);
    expect(body.retryable).toBe(true);
  });
});

describe("POST /api/agent/plan — envelope", () => {
  it("429s with retryAfter preserved", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 9 });
    const res = await postAgentPlan(jsonReq("http://test/api/agent/plan", { message: "make a thing" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expectEnvelope(body, "rate_limited");
    expect(body.retryAfter).toBe(9);
  });

  it("400s with a bad_request envelope when message is missing", async () => {
    const res = await postAgentPlan(jsonReq("http://test/api/agent/plan", {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expectEnvelope(body, "bad_request");
    expect(body.error).toBe("Message required");
  });
});

describe("POST /api/agent/run — envelope", () => {
  it("402s with insufficient_credits, keeping creditsNeeded/creditsAvailable", async () => {
    // No body.plan → the route plans first, then starts the durable run.
    planTask.mockResolvedValue({
      steps: [{ agent: "image", task: "hero", params: { prompt: "x" } }],
      summary: "go",
      estimate: { total: 40, breakdown: [] },
    });
    startAgentRun.mockResolvedValue({
      error: "Insufficient credits: need 40, have 5",
      errorCode: "insufficient_credits",
      creditsNeeded: 40,
      creditsAvailable: 5,
    });
    const res = await postAgentRun(jsonReq("http://test/api/agent/run", { message: "go", stream: false }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expectEnvelope(body, "insufficient_credits");
    expect(body.error).toMatch(/Insufficient credits/);
    expect(body.creditsNeeded).toBe(40);
    expect(body.creditsAvailable).toBe(5);
  });

  it("400s with a bad_request envelope when neither message nor plan is given", async () => {
    const res = await postAgentRun(jsonReq("http://test/api/agent/run", { stream: false }));
    expect(res.status).toBe(400);
    expectEnvelope(await res.json(), "bad_request");
  });
});

describe("GET /api/director/status — envelope", () => {
  it("404s with a not_found envelope for an unknown pipeline", async () => {
    prisma.directorPipeline.findFirst.mockResolvedValue(null);
    const res = await getDirectorStatus(new Request("http://test/api/director/status?pipelineId=nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expectEnvelope(body, "not_found");
    expect(body.error).toBe("Pipeline not found");
  });

  it("500s with a generic internal envelope, never the thrown message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.directorPipeline.findMany.mockRejectedValue(new Error("relation does not exist"));
    const res = await getDirectorStatus(new Request("http://test/api/director/status"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expectEnvelope(body, "internal");
    expect(JSON.stringify(body)).not.toContain("relation does not exist");
  });
});

describe("/api/workflows — envelope", () => {
  it("GET 500s with a generic internal envelope, never the thrown message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getUserWorkflows.mockRejectedValue(new Error("db timeout at 10.0.0.9"));
    const res = await getWorkflows(new Request("http://test/api/workflows"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expectEnvelope(body, "internal");
    expect(JSON.stringify(body)).not.toContain("10.0.0.9");
  });

  it("POST 400s with a bad_request envelope when name/steps are missing", async () => {
    const res = await postWorkflows(jsonReq("http://test/api/workflows", { name: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expectEnvelope(body, "bad_request");
    expect(body.error).toBe("Name and steps required");
  });

  it("publish 404s with a not_found envelope on someone else's workflow", async () => {
    prisma.workflow.updateMany.mockResolvedValue({ count: 0 });
    const res = await postPublish(jsonReq("http://test/api/workflows/w1/publish", {}), { params: { id: "w1" } });
    expect(res.status).toBe(404);
    expectEnvelope(await res.json(), "not_found");
  });
});

describe("POST /api/upload — envelope", () => {
  it("401s with an unauthorized envelope", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await postUpload(new Request("http://test/api/upload", { method: "POST" }));
    expect(res.status).toBe(401);
    expectEnvelope(await res.json(), "unauthorized");
  });

  it("429s with retryAfter preserved", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
    const res = await postUpload(new Request("http://test/api/upload", { method: "POST" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expectEnvelope(body, "rate_limited");
    expect(body.retryAfter).toBe(30);
  });
});
