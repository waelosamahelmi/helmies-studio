import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

// EDITSv1 E3.1 — agent sessions against the real (disposable, local-only)
// test database: cross-user isolation, append order, archive-hides-from-list.

let prisma;
let sessions;

beforeEach(async () => {
  prisma = await resetDb();
  sessions = await import("@/lib/agent-sessions");
});

describe("agent sessions (integration)", () => {
  it("isolates sessions between users — the other user's read 404s like a missing row", async () => {
    const alice = await createUserWithWallet(100);
    const bob = await createUserWithWallet(100);

    const mine = await sessions.createSession(alice.id, "Alice's plan");

    // Bob cannot read, rename, or archive Alice's session.
    await expect(sessions.getSession(bob.id, mine.id)).rejects.toMatchObject({ status: 404 });
    await expect(sessions.renameSession(bob.id, mine.id, "hijack")).rejects.toMatchObject({ status: 404 });
    await expect(sessions.archiveSession(bob.id, mine.id)).rejects.toMatchObject({ status: 404 });

    // And Bob's list never contains it.
    const bobsList = await sessions.listSessions(bob.id);
    expect(bobsList.map((s) => s.id)).not.toContain(mine.id);

    // Alice still reads her own untouched session fine.
    const { session } = await sessions.getSession(alice.id, mine.id);
    expect(session.title).toBe("Alice's plan");
  });

  it("appendMessage preserves order across many rapid appends", async () => {
    const user = await createUserWithWallet(100);
    const s = await sessions.createSession(user.id);

    const texts = [];
    for (let i = 0; i < 10; i++) {
      const text = `message ${i}`;
      texts.push(text);
      await sessions.appendMessage(s.id, {
        role: i % 2 === 0 ? "user" : "assistant",
        content: text,
      });
    }

    const { messages } = await sessions.getSession(user.id, s.id);
    expect(messages.map((m) => m.content)).toEqual(texts);
  });

  it("appendMessage bumps the session's updatedAt so activity sorts the list", async () => {
    const user = await createUserWithWallet(100);
    const older = await sessions.createSession(user.id, "older");
    const newer = await sessions.createSession(user.id, "newer");

    // Touch the OLDER session — it must move to the top of the list.
    await new Promise((r) => setTimeout(r, 20));
    await sessions.appendMessage(older.id, { role: "user", content: "hello again" });

    const list = await sessions.listSessions(user.id);
    expect(list[0].id).toBe(older.id);
    expect(list[1].id).toBe(newer.id);
  });

  it("archiving hides a session from the list but keeps its history readable", async () => {
    const user = await createUserWithWallet(100);
    const s = await sessions.createSession(user.id, "to archive");
    await sessions.appendMessage(s.id, { role: "user", content: "kept" });

    await sessions.archiveSession(user.id, s.id);

    const list = await sessions.listSessions(user.id);
    expect(list.map((x) => x.id)).not.toContain(s.id);

    // The archived session's history is still there (soft delete).
    const { session, messages } = await sessions.getSession(user.id, s.id);
    expect(session.status).toBe("archived");
    expect(messages).toHaveLength(1);
  });

  it("deleting a session cascades its messages; the AgentRun billing record survives", async () => {
    const user = await createUserWithWallet(100);
    const s = await sessions.createSession(user.id);
    await sessions.appendMessage(s.id, { role: "user", content: "hi" });

    const run = await prisma.agentRun.create({
      data: { userId: user.id, agentType: "orchestrator", task: "t", sessionId: s.id },
    });

    await prisma.agentSession.delete({ where: { id: s.id } });

    expect(await prisma.agentMessage.count({ where: { sessionId: s.id } })).toBe(0);
    const survivingRun = await prisma.agentRun.findUnique({ where: { id: run.id } });
    expect(survivingRun).not.toBeNull();
    expect(survivingRun.sessionId).toBe(s.id);
  });
});
