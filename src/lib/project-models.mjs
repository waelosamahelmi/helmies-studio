// Which models are actually usable for a production (P1.7 / task 12).
//
// Filtering by capability alone is what put Veo 3 in the character-angle
// picker and offered text-only rows as image editors. Capability is a
// label somebody typed; the SCHEMA is what the model will actually accept.
// Every test here reads parameters.
//
// Pure and worker-safe: the same rules decide what a picker offers and
// what a plan is allowed to name.
import { imageReferenceSlot, isStillImageModel } from "./entity-core.mjs";

const has = (schema, field) => Boolean(schema?.fields?.[field]);

const enumOf = (schema, field) => {
  const v = schema?.fields?.[field]?.enum;
  return Array.isArray(v) ? v.map(String) : null;
};

/** Does this model offer the aspect ratio the project is shot in? */
export function supportsAspect(model, aspectRatio) {
  if (!aspectRatio) return true;
  const schema = model?.schema || model?.inputSchema;
  const allowed = enumOf(schema, "aspect_ratio");
  // A model with no enum takes what it is given; one with an enum that
  // omits the ratio would silently render the wrong shape.
  if (!allowed) return true;
  return allowed.includes(aspectRatio);
}

/** Does it make time rather than a frame? */
export function isVideoModel(model) {
  const schema = model?.schema || model?.inputSchema;
  const fields = schema?.fields;
  if (!fields) return false;
  return Boolean(fields.duration) || Object.keys(fields).some((k) => /video/i.test(k));
}

/** Can it start a clip from a still? */
export function takesFirstFrame(model) {
  const schema = model?.schema || model?.inputSchema;
  return ["first_frame_url", "image_url", "start_image", "image", "input_image"].some((f) => has(schema, f));
}

/**
 * The image models a production can use.
 *
 * A production needs a face and a room to survive thirty shots, so a still
 * model that cannot take a reference is not a candidate however good it is
 * — it would invent the person every time. The aspect ratio has to be one
 * the project actually shoots in.
 */
export function imageModelsFor(models = [], { aspectRatio = null } = {}) {
  return models.filter((m) => {
    const schema = m?.schema || m?.inputSchema;
    if (!isStillImageModel(schema)) return false;
    if (!imageReferenceSlot(schema)) return false;
    return supportsAspect(m, aspectRatio);
  });
}

/**
 * The video models a production can use.
 *
 * Every clip starts from an approved still — that is what makes a wrong
 * face cost an image instead of a video — so a model that cannot be given
 * a first frame cannot be the project's video model.
 */
export function videoModelsFor(models = [], { aspectRatio = null } = {}) {
  return models.filter((m) => {
    if (!isVideoModel(m)) return false;
    if (!takesFirstFrame(m)) return false;
    return supportsAspect(m, aspectRatio);
  });
}

/**
 * Still-image models that need NO reference — for drawing the first view of
 * a place from its description, where there is nothing to reference yet.
 *
 * The rule that matters here is POSITIVE EVIDENCE. A model whose schema we
 * do not have is excluded, not allowed through: treating "we know nothing
 * about it" as "it is safe" is what let a text-to-video model be chosen to
 * draw a room. isStillImageModel returns false for an absent schema, which
 * is exactly the behaviour this needs.
 */
export function textToImageModelsFor(models = [], { aspectRatio = null } = {}) {
  return models.filter((m) => {
    const schema = m?.schema || m?.inputSchema;
    if (!isStillImageModel(schema)) return false;
    // The schema is not always right. hailuo/02-text-to-video-pro and
    // wan/2-2-a14b-text-to-video-turbo both passed the schema test in
    // production because their stored fields declare no duration — so a
    // model that says "video" in its own name or category is refused
    // whatever its schema claims. Positive evidence AND negative evidence,
    // because either source can be wrong and only one has to be right to
    // spend somebody's money on the wrong thing.
    if (saysItIsNotAStill(m)) return false;
    const fields = schema?.fields || {};
    // Nothing that DEMANDS an image we do not have.
    if (Object.entries(fields).some(([name, f]) => f?.required && /image|reference/i.test(name))) return false;
    return supportsAspect(m, aspectRatio);
  });
}

const NOT_A_STILL = /(video|speech|music|audio|voice|lipsync|lip-sync|tts|upscale|animate)/i;
const STILL_TYPES = new Set(["image", "i2i"]);

/** Does anything about this model say it does not make a still frame? */
export function saysItIsNotAStill(model) {
  if (NOT_A_STILL.test(String(model?.id || model?.modelId || ""))) return true;
  if (NOT_A_STILL.test(String(model?.capability || ""))) return true;
  const type = String(model?.modelType || "").toLowerCase();
  // Only judge on modelType when there IS one — an absent type is not a
  // claim, and treating it as one would empty the pool.
  if (type && !STILL_TYPES.has(type)) return true;
  return false;
}

/**
 * Which of them to use.
 *
 * `preferred` is the project's own choice and wins outright when it can do
 * the job. Otherwise the MOST CAPABLE AFFORDABLE one — explicitly not the
 * most expensive: ranking by price descending picks whatever the priciest
 * row in the catalog happens to be, which is how a video model got chosen
 * to draw a bedroom.
 */
export function pickTextToImageModel(models = [], { preferred = null, aspectRatio = null } = {}) {
  const usable = textToImageModelsFor(models, { aspectRatio });
  if (!usable.length) return null;
  if (preferred) {
    const hit = usable.find((m) => m.id === preferred);
    if (hit) return hit;
  }
  // Middle of the range: cheap rows are draft-quality, the dearest is
  // rarely the right default for a reference nobody will look at twice.
  const ranked = [...usable].sort((a, b) => (a.credits ?? 0) - (b.credits ?? 0));
  return ranked[Math.floor(ranked.length / 2)] || ranked[0];
}

/** Models that speak. */
export function voiceModelsFor(models = []) {
  return models.filter((m) => {
    const schema = m?.schema || m?.inputSchema;
    const fields = schema?.fields;
    if (!fields) return false;
    if (isVideoModel(m)) return false;
    return Boolean(fields.voice_name || fields.voice || fields.voice_id || fields.reference_audio_url);
  });
}

/* ── What a project will cost to render ──────────────────────────────────
   Every shot is a still plus a clip, because that is how the pipeline
   works: approve the frame, then animate it. Shots already rendered are
   not counted again — the number a person wants is what finishing costs
   from here, not what the whole film would have cost from scratch.

   It is an estimate and says so. A model's row price is per generation;
   retries, re-shoots and audio are not in it. */
export function estimateProjectCost(scenes = [], { imageCredits = 0, videoCredits = 0 } = {}) {
  let shots = 0;
  let remaining = 0;
  for (const scene of scenes) {
    shots += scene.shots || 0;
    remaining += Math.max(0, (scene.shots || 0) - (scene.rendered || 0));
  }
  const perShot = (imageCredits || 0) + (videoCredits || 0);
  return {
    shots,
    remaining,
    perShot,
    total: shots * perShot,
    toFinish: remaining * perShot,
    known: perShot > 0,
  };
}
