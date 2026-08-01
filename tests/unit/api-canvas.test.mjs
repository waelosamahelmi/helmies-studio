import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const models = {
    canvasDocument: {
      create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), delete: vi.fn(),
    },
    canvasVersion: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  };
  const prisma = { ...models, $transaction: vi.fn(async (fn) => fn(prisma)) };
  return { default: prisma };
});
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
// Origin verification (Task 3) is exercised on its own in
// tests/unit/origin-check.test.mjs — stub it here so these tests keep
// focusing on the canvas persistence shape.
vi.mock("@/lib/origin-check", () => ({ verifyOrigin: vi.fn(() => true) }));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { POST, PATCH } from "@/app/api/canvas/route.js";
import { GET as getVersions } from "@/app/api/canvas/versions/route.js";

const jsonReq = (method, body, url = "http://test/api/canvas") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "u1" });
});

describe("POST /api/canvas", () => {
  it("persists to the `data` column, never `content`, and creates an initial version", async () => {
    prisma.canvasDocument.create.mockResolvedValue({ id: "doc1", name: "X" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v1" });

    const res = await POST(jsonReq("POST", { name: "X", data: { objects: [1] } }));

    expect(res.status).toBe(201);
    const docArgs = prisma.canvasDocument.create.mock.calls[0][0];
    expect(docArgs.data).toHaveProperty("data", { objects: [1] });
    expect(docArgs.data).not.toHaveProperty("content");
    const verArgs = prisma.canvasVersion.create.mock.calls[0][0];
    expect(verArgs.data).toHaveProperty("data", { objects: [1] });
    expect(verArgs.data).not.toHaveProperty("version");
  });

  it("accepts legacy `content` payloads into the `data` column", async () => {
    prisma.canvasDocument.create.mockResolvedValue({ id: "doc1" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v1" });

    await POST(jsonReq("POST", { name: "X", content: { objects: [2] } }));

    expect(prisma.canvasDocument.create.mock.calls[0][0].data)
      .toHaveProperty("data", { objects: [2] });
  });
});

describe("PATCH /api/canvas", () => {
  it("updates `data` and snapshots a version without a version counter", async () => {
    prisma.canvasDocument.findFirst.mockResolvedValue({ id: "doc1", userId: "u1" });
    prisma.canvasDocument.update.mockResolvedValue({ id: "doc1" });
    prisma.canvasVersion.create.mockResolvedValue({ id: "v2" });

    const res = await PATCH(jsonReq("PATCH", { id: "doc1", name: "Y", data: { objects: [3] } }));

    expect(res.status).toBe(200);
    expect(prisma.canvasDocument.update.mock.calls[0][0].data)
      .toHaveProperty("data", { objects: [3] });
    expect(prisma.canvasVersion.findFirst).not.toHaveBeenCalled(); // no version-counter read
  });
});

describe("GET /api/canvas/versions", () => {
  it("orders by createdAt desc (no `version` column exists)", async () => {
    prisma.canvasDocument.findFirst.mockResolvedValue({ id: "doc1", userId: "u1" });
    prisma.canvasVersion.findMany.mockResolvedValue([]);

    const res = await getVersions(
      new Request("http://test/api/canvas/versions?documentId=doc1"),
    );

    expect(res.status).toBe(200);
    expect(prisma.canvasVersion.findMany.mock.calls[0][0].orderBy)
      .toEqual({ createdAt: "desc" });
  });
});
