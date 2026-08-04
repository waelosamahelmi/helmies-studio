import { describe, it, expect, vi, beforeEach } from "vitest";

// E4.4: POST /api/director/timeline-chat — natural-language timeline edits.
// The LLM's reply is a CONSTRAINED op list, validated server-side against
// the pipeline's real clip count before a single op reaches the client; the
// route NEVER assembles anything (the user still clicks Re-assemble).

import { validateTimelineOps, TIMELINE_OPS } from "@/lib/timeline-ops";

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));
vi.mock("@/lib/prisma", () => ({
  default: {
    directorPipeline: { findFirst: vi.fn() },
    directorShot: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/providers", () => ({ llmComplete: vi.fn() }));
vi.mock("@/lib/video-assembly", () => ({ assembleVideos: vi.fn() }));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { llmComplete } from "@/lib/providers";
import { assembleVideos } from "@/lib/video-assembly";
import { POST } from "@/app/api/director/timeline-chat/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/director/timeline-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const SHOTS = [
  { id: "s1", index: 0, title: "One", plan: { durationSec: 5 }, videoResult: { url: "/api/media/local/a.mp4" } },
  { id: "s2", index: 1, title: "Two", plan: { durationSec: 5 }, videoResult: { url: "/api/media/local/b.mp4" } },
  { id: "s3", index: 2, title: "Three", plan: { durationSec: 5 }, videoResult: { url: "/api/media/local/c.mp4" } },
];

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
  prisma.directorPipeline.findFirst.mockResolvedValue({ id: "p1", userId: "u1", status: "completed" });
  prisma.directorShot.findMany.mockResolvedValue(SHOTS.map((s) => ({ ...s })));
});

describe("validateTimelineOps — pure op validation", () => {
  it("accepts a well-formed op list and tracks the evolving clip count", () => {
    expect(
      validateTimelineOps(
        [
          { op: "split", index: 0, atSec: 2 },   // 3 -> 4 clips
          { op: "remove", index: 3 },             // valid only because of the split
          { op: "trim", index: 1, inSec: 0.5, outSec: 3 },
          { op: "reorder", from: 2, to: 0 },
        ],
        3
      ).ok
    ).toBe(true);
  });

  it("rejects unknown ops", () => {
    const v = validateTimelineOps([{ op: "explode", index: 0 }], 3);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/unknown op/i);
  });

  it("rejects out-of-range indexes for every op kind", () => {
    expect(validateTimelineOps([{ op: "remove", index: 3 }], 3).ok).toBe(false);
    expect(validateTimelineOps([{ op: "trim", index: -1, outSec: 2 }], 3).ok).toBe(false);
    expect(validateTimelineOps([{ op: "reorder", from: 0, to: 9 }], 3).ok).toBe(false);
    expect(validateTimelineOps([{ op: "split", index: 1.5, atSec: 1 }], 3).ok).toBe(false);
  });

  it("rejects bad trim/split math and removing the last clip", () => {
    expect(validateTimelineOps([{ op: "trim", index: 0, inSec: 4, outSec: 2 }], 3).ok).toBe(false);
    expect(validateTimelineOps([{ op: "split", index: 0, atSec: 0 }], 3).ok).toBe(false);
    expect(validateTimelineOps([{ op: "remove", index: 0 }], 1).ok).toBe(false);
  });

  it("exports the exact op vocabulary the contract promises", () => {
    expect(TIMELINE_OPS).toEqual(["trim", "reorder", "remove", "split"]);
  });
});

describe("POST /api/director/timeline-chat", () => {
  it("returns validated ops from the LLM and NEVER assembles", async () => {
    llmComplete.mockResolvedValue('{"ops":[{"op":"remove","index":2}]}');

    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "remove the last clip" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ops).toEqual([{ op: "remove", index: 2 }]);
    expect(assembleVideos).not.toHaveBeenCalled();

    // The LLM saw the real clip list.
    const messages = llmComplete.mock.calls[0][0];
    const userMsg = messages.find((m) => m.role === "user").content;
    expect(userMsg).toContain("remove the last clip");
    expect(userMsg).toContain("One");
  });

  it("422s with invalid_params when the LLM emits an unknown op", async () => {
    llmComplete.mockResolvedValue('{"ops":[{"op":"explode","index":0}]}');

    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "blow it up" }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("invalid_params");
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("422s with invalid_params when an index is out of range for the pipeline's real clips", async () => {
    llmComplete.mockResolvedValue('{"ops":[{"op":"remove","index":7}]}');

    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "remove clip 8" }));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_params");
  });

  it("422s when the LLM reply is not parseable JSON at all", async () => {
    llmComplete.mockResolvedValue("I'm sorry, I can't do that.");

    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "do something" }));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("invalid_params");
  });

  it("404s for a pipeline that is missing or another user's", async () => {
    prisma.directorPipeline.findFirst.mockResolvedValue(null);

    const res = await POST(jsonReq({ pipelineId: "nope", instruction: "trim" }));

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
  });

  it("400s when pipelineId or instruction is missing", async () => {
    const res = await POST(jsonReq({ pipelineId: "p1" }));
    expect(res.status).toBe(400);
    expect(llmComplete).not.toHaveBeenCalled();
  });

  it("401s with the envelope when there is no session", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "x" }));
    expect(res.status).toBe(401);
  });

  it("maps a missing LLM key to the provider-unavailable envelope, never leaking the key name", async () => {
    llmComplete.mockRejectedValue(new Error("OPENROUTER_KEY not configured"));

    const res = await POST(jsonReq({ pipelineId: "p1", instruction: "x" }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("missing_provider_key");
    expect(JSON.stringify(body)).not.toContain("OPENROUTER");
  });
});
