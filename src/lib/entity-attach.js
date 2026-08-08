// Attaching a finished render to the thing it was made for.
//
// This used to happen in the browser: submit, poll until the generation
// said "completed", then POST the reference. Which meant closing the tab —
// or navigating from Cast & places to anywhere else — produced a render
// that completed, was paid for, and then went nowhere. The work was
// durable; the LAST STEP was not, so it looked like the work had died.
//
// Now the intent travels with the generation as `params.attachTo`, and
// the worker performs the attach when the job settles. Nothing depends on
// a browser being there.
//
// Worker-safe: relative imports only.
import { REFERENCE_KINDS } from "./entity-core.mjs";
import { log } from "./log.js";

const MAX_REFERENCES = 40;

/** Shape check for what a client may ask for. */
export function normalizeAttachTo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entityId = typeof raw.entityId === "string" ? raw.entityId.trim() : "";
  const kind = typeof raw.kind === "string" ? raw.kind.trim() : "";
  if (!entityId || !kind) return null;
  return {
    entityId,
    kind,
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : "",
  };
}

/**
 * Append the finished output to its entity, once.
 *
 * Owner-scoped, idempotent by URL, and never throws — an attach failure
 * must not sink the money path that called it.
 */
export async function attachGenerationToEntity(prisma, generation) {
  try {
    const params = generation?.params && typeof generation.params === "object" ? generation.params : {};
    const want = normalizeAttachTo(params.attachTo);
    if (!want || !generation?.outputUrl) return null;

    const entity = await prisma.studioEntity.findFirst({
      where: { id: want.entityId, userId: generation.userId },
    });
    if (!entity) return null;

    // A locked identity is immutable in the ways that change how it looks.
    // A render that arrives after the lock is dropped rather than silently
    // rewriting a character mid-production.
    if (entity.status === "locked") {
      log.warn("entity_attach_locked", { entityId: entity.id, generationId: generation.id });
      return null;
    }

    const allowed = REFERENCE_KINDS[entity.kind] || [];
    if (!allowed.includes(want.kind)) {
      log.warn("entity_attach_bad_kind", { entityId: entity.id, kind: want.kind });
      return null;
    }

    const refs = Array.isArray(entity.references) ? entity.references : [];
    // The worker can retry a settled job; the same URL must not land twice.
    if (refs.some((r) => r.url === generation.outputUrl)) return entity;
    if (refs.length >= MAX_REFERENCES) return entity;

    const next = [
      ...refs,
      {
        id: `r_${generation.id}`,
        url: generation.outputUrl,
        kind: want.kind,
        label: want.label || want.kind,
        source: "generated",
        locked: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const updated = await prisma.studioEntity.update({
      where: { id: entity.id },
      data: { references: next },
    });
    log.info("entity_attach_done", { entityId: entity.id, kind: want.kind, generationId: generation.id });
    return updated;
  } catch (err) {
    log.error("entity_attach_failed", { generationId: generation?.id, err: err?.message });
    return null;
  }
}
