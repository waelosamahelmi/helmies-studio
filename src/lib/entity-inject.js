// One place that turns `entityIds` into a prompt prefix and reference params.
//
// This lived inline in /api/generate/async, which meant the DURABLE AGENT
// never got it: agent-runner builds its provider payload itself and enqueues
// straight onto the job queue, bypassing that route entirely. So a plan step
// carrying entityIds produced a shot with no face attached — the character
// system worked everywhere except the surface that most needs it.
//
// Worker-safe: relative imports only, and prisma is passed in rather than
// imported, so agent-runner can call this under plain node.
import {
  entityPromptBlock,
  selectEntityReferences,
  imageReferenceSlot,
  voiceReferenceSlot,
  voiceReferences,
  applyEntityReferences,
  computeAttributeDigest,
} from "./entity-core.mjs";

// Owner-scoped by construction: an id the caller does not own is simply not
// returned, so this can never inject somebody else's face.
async function loadOwned(prisma, userId, ids) {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))].slice(0, 8);
  if (!unique.length) return [];
  const rows = await prisma.studioEntity.findMany({ where: { id: { in: unique }, userId } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * injectEntities({ prisma, userId, entityIds, params, schema, purpose })
 *   -> { params, promptPrefix, digests, entities }
 *
 * `params` comes back with the entities' references written into whichever
 * field this model actually exposes. `promptPrefix` is the descriptor block
 * the caller prepends to the prompt — never appended, because the identity
 * has to lead. Nothing is mutated in place.
 */
export async function injectEntities({ prisma, userId, entityIds = [], params = {}, schema = null, purpose = "default" }) {
  const ids = Array.isArray(entityIds) ? entityIds : [];
  if (!ids.length) return { params, promptPrefix: "", digests: null, entities: [] };

  const entities = await loadOwned(prisma, userId, ids);
  if (!entities.length) return { params, promptPrefix: "", digests: null, entities: [] };

  const slot = imageReferenceSlot(schema);
  const voiceSlot = voiceReferenceSlot(schema);
  const blocks = [];
  const urls = [];
  const voiceUrls = [];
  const digests = {};

  for (const entity of entities) {
    blocks.push(entityPromptBlock(entity));
    // Snapshot the identity AT RENDER TIME so a later edit never rewrites the
    // history of a shot that already rendered from the old version.
    digests[entity.id] = computeAttributeDigest(entity);
    if (slot) {
      // Share the model's reference budget across the entities in the shot
      // rather than letting the first one consume all of it.
      const perEntity = Math.max(1, Math.floor(slot.max / entities.length));
      for (const ref of selectEntityReferences(entity, { purpose, max: perEntity })) urls.push(ref.url);
    }
    if (voiceSlot) for (const ref of voiceReferences(entity)) voiceUrls.push(ref.url);
  }

  let next = params;
  if (slot && urls.length) next = applyEntityReferences(next, schema, urls, { slot });
  if (voiceSlot && voiceUrls.length) next = applyEntityReferences(next, schema, voiceUrls, { slot: voiceSlot });

  return { params: next, promptPrefix: blocks.filter(Boolean).join("\n"), digests, entities };
}

// Which reference angle a step should reach for, derived from what the step
// actually is. A close-up wants the face; a wide wants the whole body.
export function purposeForStep({ agent, task = "", prompt = "" } = {}) {
  const text = `${task} ${prompt}`.toLowerCase();
  if (/close ?-?up|face|portrait|eyes|reaction/.test(text)) return "closeup";
  if (/wide|establishing|full body|walking|room|landscape/.test(text)) return "wide";
  if (/wardrobe|outfit|wearing|coat|dressed/.test(text)) return "wardrobe";
  if (agent === "video" || agent === "i2v") return "wide";
  return "default";
}
