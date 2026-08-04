import { describe, it, expect, vi, beforeEach } from "vitest";

// EDITSv1 E3.1 — src/lib/agent-sessions.js contract:
//   - listSessions returns only ACTIVE sessions, newest first, capped at 50
//   - getSession throws a 404 AuthzError for another user's session (and a
//     missing one) — identically, leaking nothing
//   - appendMessage validates role/kind, preserves order via the
//     [createdAt, id] sort contract, and bumps the session's updatedAt
//   - rename/settings/archive are ownership-scoped updateMany calls that
//     404 when the row isn't the caller's
//   - sanitizeSettings drops unknown keys (mass-assignment guard)

vi.mock("@/lib/prisma", () => {
  const prisma = {
    agentSession: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    agentMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { default: prisma };
});

import prisma from "@/lib/prisma";
import { AuthzError } from "@/lib/authz-error";
import {
  createSession, listSessions, getSession, appendMessage,
  renameSession, updateSessionSettings, archiveSession,
  resolveOwnedSession, sanitizeSettings,
} from "@/lib/agent-sessions";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.agentSession.update.mockResolvedValue({});
  prisma.agentSession.findUnique.mockResolvedValue(null);
});

describe("createSession", () => {
  it("creates with the model's defaults when no title is given", async () => {
    prisma.agentSession.create.mockResolvedValue({ id: "s1" });
    await createSession("u1");
    expect(prisma.agentSession.create).toHaveBeenCalledWith({ data: { userId: "u1" } });
  });

  it("trims an explicit title to 120 chars", async () => {
    prisma.agentSession.create.mockResolvedValue({ id: "s1" });
    await createSession("u1", "x".repeat(300));
    const { data } = prisma.agentSession.create.mock.calls[0][0];
    expect(data.title).toHaveLength(120);
  });
});

describe("listSessions", () => {
  it("lists only active sessions, newest 50, newest first", async () => {
    prisma.agentSession.findMany.mockResolvedValue([]);
    await listSessions("u1");
    expect(prisma.agentSession.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", status: "active" },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { id: true, title: true, updatedAt: true, status: true },
    });
  });
});

describe("getSession", () => {
  it("throws a 404 AuthzError for another user's session", async () => {
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", userId: "someone-else" });
    await expect(getSession("u1", "s1")).rejects.toThrowError(AuthzError);
    await expect(getSession("u1", "s1")).rejects.toMatchObject({ status: 404 });
  });

  it("throws the SAME 404 for a session that does not exist", async () => {
    prisma.agentSession.findUnique.mockResolvedValue(null);
    await expect(getSession("u1", "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("returns the session and its messages ordered by [createdAt, id]", async () => {
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", userId: "u1" });
    prisma.agentMessage.findMany.mockResolvedValue([{ id: "m1" }]);
    const { session, messages } = await getSession("u1", "s1");
    expect(session.id).toBe("s1");
    expect(messages).toEqual([{ id: "m1" }]);
    expect(prisma.agentMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: "s1" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
});

describe("appendMessage", () => {
  it("writes the message and bumps the session's updatedAt", async () => {
    prisma.agentMessage.create.mockResolvedValue({ id: "m1" });
    const msg = await appendMessage("s1", { role: "user", content: "hello" });
    expect(msg.id).toBe("m1");
    expect(prisma.agentMessage.create).toHaveBeenCalledWith({
      data: { sessionId: "s1", role: "user", kind: "text", content: "hello" },
    });
    expect(prisma.agentSession.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it("rejects an invalid role and an invalid kind", async () => {
    await expect(appendMessage("s1", { role: "robot", content: "x" })).rejects.toThrow(/role/i);
    await expect(appendMessage("s1", { role: "user", kind: "gif", content: "x" })).rejects.toThrow(/kind/i);
  });
});

describe("ownership-scoped mutations", () => {
  it("renameSession 404s when the row is not the caller's", async () => {
    prisma.agentSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(renameSession("u1", "s1", "New name")).rejects.toMatchObject({ status: 404 });
  });

  it("renameSession updates via (id, userId)-scoped updateMany", async () => {
    prisma.agentSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", title: "New name" });
    const session = await renameSession("u1", "s1", "  New name  ");
    expect(session.title).toBe("New name");
    expect(prisma.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
      data: { title: "New name" },
    });
  });

  it("archiveSession flips status to archived, ownership-scoped", async () => {
    prisma.agentSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", status: "archived" });
    await archiveSession("u1", "s1");
    expect(prisma.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
      data: { status: "archived" },
    });
  });

  it("updateSessionSettings persists only sanitized settings", async () => {
    prisma.agentSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1" });
    await updateSessionSettings("u1", "s1", { autoComplete: true, evil: "x", role: "admin" });
    expect(prisma.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", userId: "u1" },
      data: { settings: { autoComplete: true } },
    });
  });
});

describe("resolveOwnedSession", () => {
  it("returns null for a falsy id (no session attached)", async () => {
    expect(await resolveOwnedSession("u1", null)).toBeNull();
    expect(prisma.agentSession.findUnique).not.toHaveBeenCalled();
  });

  it("404s on someone else's session id", async () => {
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", userId: "other" });
    await expect(resolveOwnedSession("u1", "s1")).rejects.toMatchObject({ status: 404 });
  });

  it("returns the session when owned", async () => {
    prisma.agentSession.findUnique.mockResolvedValue({ id: "s1", userId: "u1" });
    const s = await resolveOwnedSession("u1", "s1");
    expect(s.id).toBe("s1");
  });
});

describe("sanitizeSettings", () => {
  it("keeps only the documented keys", () => {
    expect(sanitizeSettings({ imageModel: "m", quality: "1080p", nope: 1 }))
      .toEqual({ imageModel: "m", quality: "1080p" });
  });
  it("returns null for empty/invalid input", () => {
    expect(sanitizeSettings(null)).toBeNull();
    expect(sanitizeSettings([])).toBeNull();
    expect(sanitizeSettings({ nope: 1 })).toBeNull();
  });
});
