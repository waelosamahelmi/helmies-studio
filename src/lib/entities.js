// Helmies Studio — StudioEntity CRUD (Phase C1.1).
//
// Owner-scoped throughout: every read and write is filtered by userId, and a
// miss is reported as "not found" rather than "forbidden" so an id probe can
// never confirm that somebody else's entity exists.
//
// The prompt/reference logic lives in entity-core.mjs (worker-safe) — this
// file is only the database half.
import prisma from "./prisma.js";
import {
  ENTITY_KINDS,
  validateEntityPayload,
  normalizeReferences,
  computeAttributeDigest,
  entityPromptBlock,
  selectEntityReferences,
} from "./entity-core.mjs";

export { ENTITY_KINDS, entityPromptBlock, selectEntityReferences };

const MAX_PAGE = 100;

export async function listEntities(userId, { kind = null, projectId = null, limit = 50 } = {}) {
  return prisma.studioEntity.findMany({
    where: {
      userId,
      ...(kind ? { kind } : {}),
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(1, limit), MAX_PAGE),
  });
}

export async function getOwnedEntity(userId, id) {
  if (!id) return null;
  return prisma.studioEntity.findFirst({ where: { id, userId } });
}

// Load several owned entities at once, preserving the caller's id order —
// the generation paths inject references in the order the user picked them,
// and a Map lookup would lose that.
export async function getOwnedEntities(userId, ids = []) {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (!unique.length) return [];
  const rows = await prisma.studioEntity.findMany({ where: { id: { in: unique }, userId } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique.map((id) => byId.get(id)).filter(Boolean);
}

export async function createEntity(userId, kind, body) {
  const { valid, errors, value } = validateEntityPayload(kind, body);
  if (!valid) {
    const err = new Error(errors[0]);
    err.code = "invalid_params";
    err.errors = errors;
    throw err;
  }
  return prisma.studioEntity.create({
    data: {
      userId,
      kind,
      name: value.name,
      description: value.description ?? null,
      attributes: value.attributes ?? {},
      references: value.references ?? [],
      voiceId: value.voiceId ?? null,
      voiceName: value.voiceName ?? null,
      projectId: value.projectId ?? null,
      status: value.status ?? "draft",
    },
  });
}

export async function updateEntity(userId, id, body) {
  const existing = await getOwnedEntity(userId, id);
  if (!existing) return null;

  const { valid, errors, value } = validateEntityPayload(existing.kind, body, { partial: true });
  if (!valid) {
    const err = new Error(errors[0]);
    err.code = "invalid_params";
    err.errors = errors;
    throw err;
  }

  // D1.5: a locked identity is immutable in the ways that would change what
  // it looks like. Unlocking is an explicit, separate act — otherwise a
  // stray PATCH silently rewrites a character halfway through a production
  // and every shot after it drifts.
  if (existing.status === "locked") {
    const identityTouched =
      value.attributes !== undefined ||
      value.description !== undefined ||
      value.references !== undefined ||
      value.name !== undefined;
    const unlocking = value.status && value.status !== "locked";
    if (identityTouched && !unlocking) {
      const err = new Error("This identity is locked. Unlock it before changing how it looks.");
      err.code = "locked";
      throw err;
    }
  }

  const data = {};
  for (const key of ["name", "description", "attributes", "references", "voiceId", "voiceName", "projectId", "status"]) {
    if (value[key] !== undefined) data[key] = value[key];
  }
  if (!Object.keys(data).length) return existing;

  const updated = await prisma.studioEntity.update({ where: { id: existing.id }, data });
  return updated;
}

export async function deleteEntity(userId, id) {
  const existing = await getOwnedEntity(userId, id);
  if (!existing) return false;
  await prisma.studioEntity.delete({ where: { id: existing.id } });
  return true;
}

// Append one reference. Kept separate from updateEntity so an upload or a
// generated pack image never has to read-modify-write the whole array from
// the client (which would race two concurrent uploads into a lost update).
export async function addEntityReference(userId, id, ref) {
  const existing = await getOwnedEntity(userId, id);
  if (!existing) return null;
  if (existing.status === "locked") {
    const err = new Error("This identity is locked. Unlock it before adding references.");
    err.code = "locked";
    throw err;
  }

  const errors = [];
  const normalized = normalizeReferences(existing.kind, [ref], errors);
  if (!normalized?.length) {
    const err = new Error(errors[0] || "That reference could not be added.");
    err.code = "invalid_params";
    err.errors = errors;
    throw err;
  }

  const current = Array.isArray(existing.references) ? existing.references : [];
  return prisma.studioEntity.update({
    where: { id: existing.id },
    data: { references: [...current, normalized[0]] },
  });
}

export async function removeEntityReference(userId, id, refId) {
  const existing = await getOwnedEntity(userId, id);
  if (!existing) return null;
  if (existing.status === "locked") {
    const err = new Error("This identity is locked. Unlock it before removing references.");
    err.code = "locked";
    throw err;
  }
  const current = Array.isArray(existing.references) ? existing.references : [];
  const next = current.filter((r) => r.id !== refId);
  if (next.length === current.length) return existing;
  return prisma.studioEntity.update({ where: { id: existing.id }, data: { references: next } });
}

// Deterministic identity digest — written onto the entity so the UI can show
// "this changed since that shot rendered", and snapshotted into generation
// params by the injection path.
export async function refreshFingerprint(userId, id) {
  const entity = await getOwnedEntity(userId, id);
  if (!entity) return null;
  const fingerprint = computeAttributeDigest(entity);
  if (fingerprint === entity.fingerprint) return entity;
  return prisma.studioEntity.update({ where: { id: entity.id }, data: { fingerprint } });
}
