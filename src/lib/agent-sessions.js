import prisma from "@/lib/prisma";
import { AuthzError } from "@/lib/authz-error";

// EDITSv1 Phase E3 Task E3.1 — persistent agent sessions.
//
// Every function that takes a userId enforces ownership itself (throwing
// AuthzError(404) — 404, not 403, so another user's session id is
// indistinguishable from one that doesn't exist, matching
// /api/templates/runs/[runId]'s precedent). Routes catch through
// authzResponse, which already maps a 404 AuthzError to the uniform
// not_found envelope.

const MESSAGE_ROLES = new Set(["user", "assistant", "system"]);
const MESSAGE_KINDS = new Set(["text", "question", "plan", "run", "outputs"]);

// Settings keys a client may persist on a session. Anything else in the
// payload is dropped (mass-assignment guard), matching the shape the plan
// documents on the model: { imageModel, videoModel, audioModel, quality,
// aspect, autoComplete }.
const SETTINGS_KEYS = ["imageModel", "videoModel", "audioModel", "quality", "aspect", "autoComplete"];

export function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const out = {};
  for (const key of SETTINGS_KEYS) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return Object.keys(out).length ? out : null;
}

export async function createSession(userId, title) {
  return prisma.agentSession.create({
    data: {
      userId,
      ...(title ? { title: String(title).slice(0, 120) } : {}),
    },
  });
}

// Newest 50 active sessions. Archived sessions are hidden from the list —
// archiving IS the soft delete (the DELETE route maps here).
export async function listSessions(userId) {
  return prisma.agentSession.findMany({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true, status: true },
  });
}

// The session plus its full ordered feed. Throws 404 for a missing session
// AND for another user's session — identically.
export async function getSession(userId, id) {
  const session = await prisma.agentSession.findUnique({ where: { id } });
  if (!session || session.userId !== userId) {
    throw new AuthzError(404, "Session not found");
  }
  const messages = await prisma.agentMessage.findMany({
    where: { sessionId: id },
    // createdAt has millisecond precision and two appends can share a
    // millisecond — the id tiebreak (cuid, monotonic within a process)
    // keeps insertion order stable.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return { session, messages };
}

// Appends one message and bumps the session's updatedAt so the session list
// sorts by real activity, not by title edits. No ownership check here —
// this is a server-side primitive called by routes that have already
// resolved the session through getSession/assertOwned.
export async function appendMessage(sessionId, { role, kind = "text", content }) {
  if (!MESSAGE_ROLES.has(role)) throw new Error(`Invalid message role: ${role}`);
  if (!MESSAGE_KINDS.has(kind)) throw new Error(`Invalid message kind: ${kind}`);
  const message = await prisma.agentMessage.create({
    data: { sessionId, role, kind, content: String(content ?? "") },
  });
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  }).catch(() => {}); // the session vanishing mid-append must not lose the message write
  return message;
}

// Ownership assertion shared by the mutators below: an updateMany scoped by
// (id, userId) both checks and mutates in one statement — count 0 means
// "not yours or not there", which is a 404 either way.
async function updateOwned(userId, id, data) {
  const res = await prisma.agentSession.updateMany({ where: { id, userId }, data });
  if (res.count === 0) throw new AuthzError(404, "Session not found");
  return prisma.agentSession.findUnique({ where: { id } });
}

export async function renameSession(userId, id, title) {
  const clean = String(title || "").trim().slice(0, 120);
  if (!clean) throw new AuthzError(400, "Title required");
  return updateOwned(userId, id, { title: clean });
}

export async function updateSessionSettings(userId, id, settings) {
  const clean = sanitizeSettings(settings);
  return updateOwned(userId, id, { settings: clean });
}

export async function archiveSession(userId, id) {
  return updateOwned(userId, id, { status: "archived" });
}

// Resolves a session the caller owns, or null when sessionId is falsy —
// used by chat/run/step routes that persist turns only when a session is
// attached. Throws 404 on someone else's session id (never silently drops
// into an unowned session).
export async function resolveOwnedSession(userId, sessionId) {
  if (!sessionId) return null;
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) {
    throw new AuthzError(404, "Session not found");
  }
  return session;
}
