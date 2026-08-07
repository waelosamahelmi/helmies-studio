// Helmies Studio — StudioEntity core (Phase C1.1)
//
// Pure, dependency-free and worker-safe (no "@/" alias, no prisma): the
// entities lib, the generation paths, the agent runner and the director all
// share this one implementation of "what an entity is and how it reaches a
// prompt".
//
// An entity is a character, product or environment the user has defined ONCE
// and reuses everywhere. The whole point is that a face survives thirty
// shots without anybody copy-pasting a description.

export const ENTITY_KINDS = ["character", "product", "environment"];

// Reference kinds per entity kind. These are the vocabulary the reference
// picker and the identity pack both speak; anything else is rejected so a
// typo can never silently become an unselectable reference.
export const REFERENCE_KINDS = {
  character: [
    // What the user actually handed us. Deliberately NOT an angle: a photo
    // somebody uploads is whatever it happens to be — a holiday snap, a
    // three-quarter, a full body — and claiming it is the front would both
    // mislabel it and mark the front as covered, so the real front angle
    // would never get made. Every pack angle is generated FROM these.
    "source",
    "voice",          // a recording or kept sample of how they sound
    "sheet",          // the multi-angle character sheet
    "face_front",
    "face_34",
    "face_side",
    "full_body",
    "half_body",
    "outfit",       // a garment or full look they wear
    "accessory",    // glasses, a watch, a ring
    "prop",         // something they carry or handle — a phone, a cup
    "expression",
    "action",
    "other",
  ],
  product: ["front", "side", "back", "closeup", "logo", "packaging", "in_use", "other"],
  environment: ["wide", "detail", "texture", "lighting", "viewpoint", "time_of_day", "weather", "other"],
};

// Attribute keys we understand per kind. Unknown keys are dropped rather
// than rejected — a planner or an LLM inventing "vibe" must never fail a
// save — but only known keys reach the prompt block, so the phrasing stays
// deliberate.
export const ATTRIBUTE_KEYS = {
  character: [
    "ageAppearance", "genderPresentation", "ethnicity", "face", "skin", "hair", "eyes",
    "build", "heightImpression", "distinctiveFeatures", "wardrobe", "accessories",
    "makeup", "defaultExpression", "posture", "personality", "speakingStyle", "language", "notes",
  ],
  product: ["materials", "colors", "finish", "dimensionsNotes", "branding", "condition", "notes"],
  environment: ["lighting", "timeOfDay", "weather", "viewpoint", "mood", "architecture", "scale", "notes"],
};

// Which character traits a photograph can actually show. Everything here is
// something we can read off a reference and should never make somebody type
// out by hand — the photo already says it, and hand-typed guesses that
// contradict the photo are worse than nothing.
//
// The remainder (personality, speaking style, language, notes) is DIRECTION:
// no camera can tell you how someone talks or who they are, so those stay a
// human's job whether or not a reference exists.
export const OBSERVABLE_ATTRIBUTES = [
  "ageAppearance", "genderPresentation", "ethnicity", "face", "skin", "hair",
  "eyes", "build", "heightImpression", "distinctiveFeatures", "wardrobe",
  "accessories", "makeup", "defaultExpression", "posture",
];

export const isObservable = (key) => OBSERVABLE_ATTRIBUTES.includes(key);

// Audio the user gave us for this character: a recording of the voice, or a
// generated sample they decided to keep. Models with a voice slot
// (wan-2.7-r2v's reference_voice, seedance's reference_audio_urls) are fed
// from these the same way image references feed the image slot.
export const VOICE_REFERENCE_KIND = "voice";

export const voiceReferences = (entity) =>
  (entity?.references || []).filter((r) => r.kind === VOICE_REFERENCE_KIND);

// Human labels used when composing the prompt block. Order here IS the order
// the attributes are written in — most identity-defining first, because some
// models weight the head of the prompt more heavily.
const ATTRIBUTE_LABELS = {
  ageAppearance: "apparent age",
  genderPresentation: "gender presentation",
  ethnicity: "ethnicity",
  face: "face",
  skin: "skin",
  hair: "hair",
  eyes: "eyes",
  build: "build",
  heightImpression: "height",
  distinctiveFeatures: "distinctive features",
  wardrobe: "wardrobe",
  accessories: "accessories",
  makeup: "makeup",
  defaultExpression: "default expression",
  posture: "posture",
  personality: "personality",
  speakingStyle: "speaking style",
  language: "language",
  materials: "materials",
  colors: "colors",
  finish: "finish",
  dimensionsNotes: "proportions",
  branding: "branding",
  condition: "condition",
  lighting: "lighting",
  timeOfDay: "time of day",
  weather: "weather",
  viewpoint: "viewpoint",
  mood: "mood",
  architecture: "architecture",
  scale: "scale",
  notes: "notes",
};

const MAX_NAME = 80;
const MAX_DESCRIPTION = 2000;
const MAX_ATTRIBUTE_VALUE = 400;
const MAX_REFERENCES = 40;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A reference url must be either our own media (relative) or plain https —
// same posture as the rest of the app: never let a caller point an entity at
// an arbitrary scheme that later gets fetched server-side.
export function isAllowedReferenceUrl(url) {
  if (typeof url !== "string" || !url) return false;
  if (url.startsWith("/api/media/") || url.startsWith("/uploads/")) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

// validateEntityPayload(kind, body) -> { valid, errors[], value }
// `value` is the sanitized, storable shape — callers persist THAT, never the
// raw body.
export function validateEntityPayload(kind, body = {}, { partial = false } = {}) {
  const errors = [];
  if (!ENTITY_KINDS.includes(kind)) {
    return { valid: false, errors: [`Unknown entity kind "${kind}".`], value: null };
  }

  const value = {};

  if (!partial || body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("A name is required.");
    else if (name.length > MAX_NAME) errors.push(`The name must be ${MAX_NAME} characters or fewer.`);
    else value.name = name;
  }

  if (body.description !== undefined) {
    if (body.description === null || body.description === "") value.description = null;
    else if (typeof body.description !== "string") errors.push("The description must be text.");
    else if (body.description.length > MAX_DESCRIPTION) {
      errors.push(`The description must be ${MAX_DESCRIPTION} characters or fewer.`);
    } else value.description = body.description;
  }

  if (body.attributes !== undefined) {
    if (!isPlainObject(body.attributes)) {
      errors.push("Attributes must be an object.");
    } else {
      const allowed = ATTRIBUTE_KEYS[kind];
      const attrs = {};
      for (const [k, v] of Object.entries(body.attributes)) {
        if (!allowed.includes(k)) continue; // unknown keys are dropped, not fatal
        if (v === null || v === "") continue;
        const text = typeof v === "string" ? v : String(v);
        if (text.length > MAX_ATTRIBUTE_VALUE) {
          errors.push(`Attribute "${k}" must be ${MAX_ATTRIBUTE_VALUE} characters or fewer.`);
          continue;
        }
        attrs[k] = text.trim();
      }
      value.attributes = attrs;
    }
  }

  if (body.references !== undefined) {
    const refs = normalizeReferences(kind, body.references, errors);
    if (refs) value.references = refs;
  }

  if (body.status !== undefined) {
    if (!["draft", "ready", "locked"].includes(body.status)) errors.push("Unknown status.");
    else value.status = body.status;
  }

  if (body.voiceId !== undefined) value.voiceId = body.voiceId || null;
  if (body.voiceName !== undefined) value.voiceName = body.voiceName || null;
  if (body.projectId !== undefined) value.projectId = body.projectId || null;

  return { valid: errors.length === 0, errors, value: errors.length === 0 ? value : null };
}

export function normalizeReferences(kind, input, errors = []) {
  if (!Array.isArray(input)) {
    errors.push("References must be an array.");
    return null;
  }
  if (input.length > MAX_REFERENCES) {
    errors.push(`An entity can hold at most ${MAX_REFERENCES} references.`);
    return null;
  }
  const allowed = REFERENCE_KINDS[kind];
  const out = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) {
      errors.push("Each reference must be an object.");
      continue;
    }
    if (!isAllowedReferenceUrl(raw.url)) {
      errors.push("A reference url must be an https url or an uploaded file.");
      continue;
    }
    const refKind = allowed.includes(raw.kind) ? raw.kind : "other";
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : `ref_${out.length + 1}_${Date.now().toString(36)}`,
      url: raw.url,
      kind: refKind,
      label: typeof raw.label === "string" ? raw.label.slice(0, MAX_NAME) : "",
      locked: raw.locked === true,
      source: raw.source === "generated" ? "generated" : "user",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

// ── Identity pack ─────────────────────────────────────────────────────────
// The angles a character has to be seen from before a production can hold
// them steady. This is not an arbitrary list: it is exactly what
// selectEntityReferences reaches for — a dialogue close-up wants face_front,
// a wide wants full_body — so an entity missing these angles will silently
// fall back to whatever it does have, and the face starts drifting.
//
// The prompts deliberately describe a reference photograph rather than a
// picture: flat even light and a plain background give the video models a
// clean read of the face instead of baking a mood into the identity.
export const IDENTITY_PACK = [
  {
    kind: "face_front",
    label: "Front",
    hint: "Straight on. The anchor every other angle is judged against.",
    prompt: "Reference photograph, head and shoulders, facing the camera straight on, neutral expression, eyes to lens, flat even lighting, plain mid-grey background, sharp focus, no stylisation.",
  },
  {
    kind: "face_34",
    label: "Three-quarter",
    hint: "Turned about 45°. What most dialogue coverage actually sits at.",
    prompt: "Reference photograph, head and shoulders, face turned forty-five degrees from camera, neutral expression, flat even lighting, plain mid-grey background, sharp focus, no stylisation.",
  },
  {
    kind: "face_side",
    label: "Profile",
    hint: "Full profile. Fixes the nose and jaw the other angles guess at.",
    prompt: "Reference photograph, head and shoulders, full side profile, neutral expression, flat even lighting, plain mid-grey background, sharp focus, no stylisation.",
  },
  {
    kind: "full_body",
    label: "Full body",
    hint: "Head to feet. Used by every wide and every walking shot.",
    prompt: "Reference photograph, full body head to feet, standing straight, arms relaxed at sides, facing camera, flat even lighting, plain mid-grey background, sharp focus, no stylisation.",
  },
  {
    kind: "half_body",
    label: "Waist up",
    hint: "The framing most medium shots land on.",
    prompt: "Reference photograph, waist up, standing, facing camera, neutral expression, flat even lighting, plain mid-grey background, sharp focus, no stylisation.",
  },
];

// Which pack angles this entity is still missing. A reference the user
// uploaded themselves counts — we never regenerate an angle they already
// gave us.
export function missingPackAngles(entity) {
  const have = new Set((entity?.references || []).map((r) => r.kind));
  return IDENTITY_PACK.filter((a) => !have.has(a.kind));
}

// ── Prompt composition ────────────────────────────────────────────────────
// The block is deliberately terse and comma-joined: image/video models
// weight a dense descriptor far better than prose paragraphs, and every
// token here competes with the shot description that follows it.
export function entityPromptBlock(entity) {
  if (!entity) return "";
  const kind = entity.kind;
  const keys = ATTRIBUTE_KEYS[kind] || [];
  const attrs = isPlainObject(entity.attributes) ? entity.attributes : {};

  const parts = [];
  for (const key of keys) {
    if (key === "notes") continue; // notes go last, as a sentence
    const v = attrs[key];
    if (typeof v === "string" && v.trim()) parts.push(`${ATTRIBUTE_LABELS[key] || key}: ${v.trim()}`);
  }

  const lead =
    kind === "character" ? `${entity.name}`
    : kind === "product" ? `${entity.name} (product)`
    : `${entity.name} (location)`;

  const segments = [lead];
  if (entity.description) segments.push(entity.description.trim());
  if (parts.length) segments.push(parts.join(", "));
  if (typeof attrs.notes === "string" && attrs.notes.trim()) segments.push(attrs.notes.trim());

  return segments.join(" — ");
}

// Which reference kinds serve which shot purpose, best first. A purpose with
// no match falls through to the generic order rather than returning nothing:
// a reference the model can see always beats a description it has to invent
// from.
const PURPOSE_PRIORITY = {
  character: {
    dialogue: ["face_front", "face_34", "face_side", "half_body", "sheet", "source"],
    closeup: ["face_front", "face_34", "face_side", "sheet", "source"],
    wide: ["full_body", "half_body", "sheet", "face_front", "source"],
    action: ["full_body", "action", "half_body", "sheet", "source"],
    wardrobe: ["outfit", "accessory", "prop", "full_body", "half_body", "sheet", "source"],
    expression: ["expression", "face_front", "face_34", "sheet", "source"],
    sheet: ["sheet", "face_front", "full_body", "source"],
    // Building the identity pack itself: the photograph the user actually
    // gave us outranks anything we generated, so each new angle is derived
    // from the real person rather than from our own last guess.
    identity: ["source", "sheet", "face_front", "face_34", "full_body"],
    default: ["face_front", "full_body", "face_34", "sheet", "source"],
  },
  product: {
    product_hero: ["front", "closeup", "side", "packaging"],
    detail: ["closeup", "front", "logo"],
    packaging: ["packaging", "front", "logo"],
    default: ["front", "closeup", "side"],
  },
  environment: {
    wide: ["wide", "viewpoint", "detail"],
    detail: ["detail", "texture", "wide"],
    // A place is not one look. Returning to it at a different hour is the
    // same room with different light, and the reference has to say which.
    time_of_day: ["time_of_day", "lighting", "wide"],
    weather: ["weather", "wide", "lighting"],
    default: ["wide", "detail", "texture"],
  },
};

// selectEntityReferences(entity, { purpose, max }) -> [{ id, url, kind, ... }]
//
// Ordering contract (this is the consistency engine's heart):
//   1. locked references — the user pinned these as ground truth
//   2. purpose-matched kinds, in priority order
//   3. everything else, user-uploaded before generated
// then de-duplicated by url and capped by `max` (the target model's own
// reference-field limit — never guess a cap here).
export function selectEntityReferences(entity, { purpose = "default", max = 4 } = {}) {
  const refs = Array.isArray(entity?.references) ? entity.references : [];
  if (!refs.length || max <= 0) return [];

  const priority = PURPOSE_PRIORITY[entity.kind]?.[purpose] || PURPOSE_PRIORITY[entity.kind]?.default || [];
  const rank = (ref) => {
    const i = priority.indexOf(ref.kind);
    return i === -1 ? priority.length : i;
  };

  const sorted = [...refs].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? -1 : 1;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.source !== b.source) return a.source === "user" ? -1 : 1;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });

  const seen = new Set();
  const out = [];
  for (const ref of sorted) {
    // Voice recordings live in the same references array but are never an
    // image: handing one to an image slot would send an mp3 where a face
    // belongs.
    if (ref.kind === VOICE_REFERENCE_KIND) continue;
    if (seen.has(ref.url)) continue;
    seen.add(ref.url);
    out.push(ref);
    if (out.length >= max) break;
  }
  return out;
}

// ── Model-aware reference plumbing ────────────────────────────────────────
// Every family names its reference input differently, and sending the wrong
// key means the model silently ignores the identity and invents a face. The
// order here is most-specific-first: a model that offers a true reference
// field (seedance's reference_image_urls, wan-r2v's reference_image) must
// never be fed through a generic image_url slot, because those two mean
// different things to the provider — one is "this is who the person is",
// the other is "this is the frame you are animating".
const IMAGE_REFERENCE_FIELDS = [
  { field: "reference_image_urls", multiple: true, defaultMax: 4 },
  { field: "reference_images", multiple: true, defaultMax: 4 },
  { field: "reference_image", multiple: false, defaultMax: 1 },
  { field: "image_input", multiple: true, defaultMax: 4 },
  { field: "images_list", multiple: true, defaultMax: 4 },
  { field: "image_urls", multiple: true, defaultMax: 4 },
  { field: "image_url", multiple: false, defaultMax: 1 },
];

const VOICE_REFERENCE_FIELDS = [
  { field: "reference_voice", multiple: false, defaultMax: 1 },
  { field: "reference_audio_urls", multiple: true, defaultMax: 2 },
  { field: "audio_url", multiple: false, defaultMax: 1 },
];

function pickField(schema, candidates) {
  const fields = schema?.fields;
  if (!fields || typeof fields !== "object") return null;
  for (const candidate of candidates) {
    const def = fields[candidate.field];
    if (!def) continue;
    const max = Number.isInteger(def.maxItems) && def.maxItems > 0 ? def.maxItems : candidate.defaultMax;
    return { ...candidate, max: candidate.multiple ? max : 1 };
  }
  return null;
}

// Where do this model's identity references go? null when the model takes
// none — the caller must then fall back to the text block alone rather than
// inventing a field.
export function imageReferenceSlot(schema) {
  return pickField(schema, IMAGE_REFERENCE_FIELDS);
}

export function voiceReferenceSlot(schema) {
  return pickField(schema, VOICE_REFERENCE_FIELDS);
}

// Does this model produce a STILL, judged by its own parameters?
//
// The catalog's capability/modelType columns cannot be trusted for this.
// Three live rows — generate-veo-3-video, generate-ai-video,
// generate-aleph-video — are stored as capability "text-to-image",
// modelType "image", outputModalities ["image"], and are plainly video
// generators: they carry `duration`, `video_url`, and one of them is named
// "Generate Veo 3 Video". Filtering on those columns offered Veo 3 as a
// choice for making a character's face.
//
// A model's parameters do not lie the way its metadata does: anything that
// takes a duration, or names a video anywhere in its inputs, produces time,
// not a frame.
// Capabilities that render a still we could use as a reference angle.
// Deliberately excludes image-upscale and background-removal: both live in
// the `iti` capability group and both take an image, but neither can render
// somebody from a new angle — offering them here would be offering a control
// that cannot do the job.
export const IDENTITY_CAPABILITIES = new Set([
  "text-to-image", "image", "image-to-image", "i2i", "image-edit",
]);

// Can this model render one angle of an identity pack?
//
// Three tests, deliberately overlapping. Capability narrows it to the image
// families — but that column is not trustworthy on its own (live video rows
// are stored as "text-to-image"), so the schema tests are what actually keep
// a video model out, and they read the model's own parameters. The
// capability check alone would let Veo 3 through; the schema check alone
// would let a background remover through.
export function canRenderIdentityAngle(model) {
  if (!model || !IDENTITY_CAPABILITIES.has(model.capability)) return false;
  return isStillImageModel(model.schema) && !!imageReferenceSlot(model.schema);
}

export function isStillImageModel(schema) {
  const fields = schema?.fields;
  if (!fields || typeof fields !== "object") return false;
  for (const name of Object.keys(fields)) {
    if (name === "duration" || /video/i.test(name)) return false;
  }
  return true;
}

// applyEntityReferences(params, schema, urls) — writes `urls` into the right
// field WITHOUT clobbering what the caller already set there. A shot that
// already carries a first frame or a user-chosen image keeps it; entity
// references are appended after it and the whole list is re-capped.
export function applyEntityReferences(params, schema, urls, { slot = null } = {}) {
  const target = slot || imageReferenceSlot(schema);
  if (!target || !urls?.length) return params;

  const existingRaw = params[target.field];
  const existing = Array.isArray(existingRaw) ? existingRaw : existingRaw ? [existingRaw] : [];

  if (!target.multiple) {
    // Single-slot model: never displace an explicit frame the caller set.
    if (existing.length) return params;
    return { ...params, [target.field]: urls[0] };
  }

  const merged = [];
  for (const url of [...existing, ...urls]) {
    if (typeof url === "string" && url && !merged.includes(url)) merged.push(url);
  }
  return { ...params, [target.field]: merged.slice(0, target.max) };
}

// A stable digest of the identity-defining fields, snapshotted onto a
// generation's params so a later edit to the entity never rewrites what a
// past shot actually rendered from.
export function computeAttributeDigest(entity) {
  const attrs = isPlainObject(entity?.attributes) ? entity.attributes : {};
  const keys = (ATTRIBUTE_KEYS[entity?.kind] || []).filter((k) => attrs[k]);
  const body = keys.map((k) => `${k}=${attrs[k]}`).join("|");
  const refs = (entity?.references || []).filter((r) => r.locked).map((r) => r.url).join("|");
  const source = `${entity?.kind}:${entity?.name}:${entity?.description || ""}:${body}:${refs}`;
  // djb2 — deterministic, dependency-free, and only ever compared for
  // equality (never used as a security primitive).
  let h = 5381;
  for (let i = 0; i < source.length; i++) h = ((h << 5) + h + source.charCodeAt(i)) | 0;
  return `e${(h >>> 0).toString(36)}`;
}
