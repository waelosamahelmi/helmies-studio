import prisma from "@/lib/prisma";
import { AuthzError } from "@/lib/authz-error";

// S2 — VoiceProfile persistence for the Suno voice-clone wizard.
//
// Every function that takes a userId enforces ownership itself, throwing
// AuthzError(404) — 404, not 403, so another user's profile id is
// indistinguishable from one that doesn't exist (the agent-sessions
// precedent). Routes catch through authzResponse.

export const VOICE_PROFILE_STATUSES = ["pending", "validating", "generating", "ready", "failed"];

export async function createProfile(userId, { name, provider } = {}) {
  const clean = String(name || "").trim().slice(0, 120);
  if (!clean) throw new AuthzError(400, "Name required");
  return prisma.voiceProfile.create({
    data: {
      userId,
      name: clean,
      ...(provider ? { provider: String(provider).slice(0, 40) } : {}),
    },
  });
}

// Newest 100. `status` filters (the pickers ask for "ready" only).
export async function listProfiles(userId, { status } = {}) {
  return prisma.voiceProfile.findMany({
    where: {
      userId,
      ...(status ? { status: String(status) } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function getProfile(userId, id) {
  const profile = await prisma.voiceProfile.findUnique({ where: { id } });
  if (!profile || profile.userId !== userId) {
    throw new AuthzError(404, "Voice profile not found");
  }
  return profile;
}

// Ownership assertion + mutation in one statement: an updateMany scoped by
// (id, userId) — count 0 means "not yours or not there", a 404 either way.
async function updateOwned(userId, id, data) {
  const res = await prisma.voiceProfile.updateMany({ where: { id, userId }, data });
  if (res.count === 0) throw new AuthzError(404, "Voice profile not found");
  return prisma.voiceProfile.findUnique({ where: { id } });
}

// The wizard's transition writes: status (validated against the enum) and,
// when the generate step reports one, the provider voiceId. Name edits ride
// along. Anything else in the payload is ignored (mass-assignment guard).
export async function updateProfile(userId, id, { status, voiceId, name } = {}) {
  const data = {};
  if (status !== undefined) {
    if (!VOICE_PROFILE_STATUSES.includes(status)) {
      throw new AuthzError(400, `Invalid status "${status}"`);
    }
    data.status = status;
  }
  if (voiceId !== undefined) data.voiceId = String(voiceId).slice(0, 300);
  if (name !== undefined) {
    const clean = String(name).trim().slice(0, 120);
    if (!clean) throw new AuthzError(400, "Name required");
    data.name = clean;
  }
  if (!Object.keys(data).length) throw new AuthzError(400, "Nothing to update");
  return updateOwned(userId, id, data);
}

export async function updateStatus(userId, id, status) {
  return updateProfile(userId, id, { status });
}

export async function deleteProfile(userId, id) {
  const res = await prisma.voiceProfile.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new AuthzError(404, "Voice profile not found");
  return { success: true };
}
