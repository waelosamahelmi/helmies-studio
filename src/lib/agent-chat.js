// EDITSv1 Phase E3 Task E3.2 — the structured chat contract.
//
// Client-safe (no prisma/auth imports): the same parser runs in the chat
// route (to persist a turn with the right kind) and in the browser feed (to
// render the QuestionCard), so the two can never disagree about what counts
// as a question.
//
// The contract: the assistant asks AT MOST ONE clarifying question per
// turn, and when it does, the reply ENDS with a fenced block
//
//   ```question
//   {"question":"…","options":["…","…"],"allowCustom":true}
//   ```
//
// The UI parses the LAST such block; everything before it is ordinary
// markdown prose.

const QUESTION_BLOCK_RE = /```question\s*\n([\s\S]*?)```/g;

// ── The asset request (2026-08-09) ────────────────────────────────────────
// A production is made of things that exist before any model runs: a face,
// a product, a logo, a voice. The assistant could not ask for ANY of them.
// It had one structured block for text answers and nothing for material, so
// "attach a photo of me" was a sentence in prose that the server then threw
// away — /api/agent/chat never read context.attachments, and no step ever
// turned an uploaded url into a reference. A brief that needs a real face
// rendered a stranger, every time, and nothing in the flow said why.
//
// So the assistant now asks for material the same way it asks a question:
// one fenced block, at the END of the turn, listing the SLOTS a production
// needs. The client renders it as an upload card; /api/agent/assets turns
// each filled slot into a real StudioEntity / brand kit / voice reference
// and reports the ids back into the conversation. From there the planner's
// existing castHint carries them, because by then they are ordinary cast.
//
//   ```asset-request
//   {"intro":"Three things and I can build the whole ad.",
//    "assets":[{"key":"actor","kind":"character","name":"Wael",
//               "label":"You — the actor in all three sequences",
//               "hint":"2-3 clear photos of your face, good light",
//               "min":1,"max":6}]}
//   ```
const ASSET_REQUEST_BLOCK_RE = /```asset-request\s*\n?([\s\S]*?)```/g;

// What a slot can be. The kind decides what the card accepts and what the
// intake route BUILDS from it — these are not cosmetic labels.
export const ASSET_SLOT_KINDS = {
  // Become StudioEntity rows with their uploads as `source` references, so
  // every later shot can name them in entityIds and get the real face back.
  character: { accept: "image", entity: "character", noun: "character" },
  product: { accept: "image", entity: "product", noun: "product" },
  environment: { accept: "image", entity: "environment", noun: "place" },
  // Becomes the brand kit's logo + visual references. Never a generated
  // image: a logo that a model drew is a different logo.
  logo: { accept: "image", entity: null, noun: "logo" },
  // Becomes a `voice` reference on the character it belongs to (voiceFor),
  // which is what makes the clip speak in that person's voice.
  voice: { accept: "audio", entity: null, noun: "voice" },
  // Real material the studio cannot generate — screen recordings, existing
  // footage. Kept as plain attachments the plan can reference.
  footage: { accept: "video", entity: null, noun: "footage" },
};

const SLOT_KIND_KEYS = Object.keys(ASSET_SLOT_KINDS);

const clampInt = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Parse the LAST ```asset-request block.
 *
 * Returns { intro, assets: [...] } or null. A block whose slots are all
 * unusable returns null rather than an empty card — an upload card with
 * nothing to upload is worse than no card, because the user waits at it.
 */
export function parseAssetRequestBlock(text) {
  if (!text || typeof text !== "string") return null;
  let match = null;
  for (const m of text.matchAll(ASSET_REQUEST_BLOCK_RE)) match = m;
  if (!match) return null;
  let parsed;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  const raw = Array.isArray(parsed?.assets) ? parsed.assets : [];
  const assets = [];
  const seen = new Set();
  for (const a of raw.slice(0, 8)) {
    if (!a || typeof a !== "object") continue;
    const kind = SLOT_KIND_KEYS.includes(a.kind) ? a.kind : null;
    if (!kind) continue;
    // The key is how an upload gets matched back to the slot it filled, so a
    // duplicate would silently overwrite an earlier slot's files.
    const key = str(a.key, 40).replace(/[^\w-]+/g, "_") || `${kind}_${assets.length + 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const max = clampInt(a.max, 1, 8, kind === "character" ? 6 : 3);
    assets.push({
      key,
      kind,
      accept: ASSET_SLOT_KINDS[kind].accept,
      name: str(a.name, 60),
      label: str(a.label, 120) || str(a.name, 60) || ASSET_SLOT_KINDS[kind].noun,
      hint: str(a.hint, 240),
      /* The look the assistant PROPOSES, for anyone with no photograph to
         upload. Filled in, it becomes the entity's description and the same
         words then describe that person in every shot they appear in. This
         is what keeps an invented character from being re-invented shot by
         shot; without it, "the villain" is a different man each time. */
      description: str(a.description, 600),
      // A voice belongs to somebody. Without this the recording is filed
      // against nobody and no shot can ever reach for it.
      voiceFor: kind === "voice" ? str(a.voiceFor || a.name, 60) : "",
      min: clampInt(a.min, 0, max, a.required === false ? 0 : 1),
      max,
    });
  }
  if (!assets.length) return null;
  return { intro: str(parsed?.intro, 400), assets };
}

/** The prose around the asset-request block (the block itself is never shown). */
export function stripAssetRequestBlock(text) {
  if (!text || typeof text !== "string") return text || "";
  const matches = [...text.matchAll(ASSET_REQUEST_BLOCK_RE)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
}

// A9 — the auto-plan signal. When the assistant judges it has enough to
// plan, it ends its reply with a fenced block
//
//   ```plan-ready
//   {"brief":"<the complete distilled production brief>"}
//   ```
//
// The client, on seeing it, calls the plan endpoint automatically — no
// button press. Parsed with the same last-block-wins discipline as the
// question block, and the same client/server sharing guarantee.
const PLAN_READY_BLOCK_RE = /```plan-ready\s*\n?([\s\S]*?)```/g;

// Parses the LAST ```plan-ready block. Returns { brief } (brief may be ""
// when the model omitted or malformed the JSON — the SIGNAL still counts,
// and the caller falls back to the conversation as the brief source) or
// null when no block is present.
export function parsePlanReadyBlock(text) {
  if (!text || typeof text !== "string") return null;
  let match = null;
  for (const m of text.matchAll(PLAN_READY_BLOCK_RE)) match = m;
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const brief = typeof parsed?.brief === "string" ? parsed.brief.trim() : "";
    return { brief };
  } catch {
    return { brief: "" };
  }
}

// The prose around the plan-ready block (rendered as markdown; the block
// itself is never shown to the user).
export function stripPlanReadyBlock(text) {
  if (!text || typeof text !== "string") return text || "";
  const matches = [...text.matchAll(PLAN_READY_BLOCK_RE)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
}

// Parses the LAST ```question block out of `text`. Returns
// { question, options, allowCustom } or null when there is no
// (well-formed) block — malformed JSON degrades to plain prose, never an
// exception.
export function parseQuestionBlock(text) {
  if (!text || typeof text !== "string") return null;
  let match = null;
  for (const m of text.matchAll(QUESTION_BLOCK_RE)) match = m;
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed || typeof parsed.question !== "string" || !parsed.question.trim()) return null;
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o) => typeof o === "string" && o.trim()).map((o) => o.trim()).slice(0, 6)
      : [];
    return {
      question: parsed.question.trim(),
      options,
      allowCustom: parsed.allowCustom !== false,
    };
  } catch {
    return null;
  }
}

// The prose around the LAST question block (the part rendered as markdown
// above the QuestionCard).
export function stripQuestionBlock(text) {
  if (!text || typeof text !== "string") return text || "";
  const matches = [...text.matchAll(QUESTION_BLOCK_RE)];
  if (!matches.length) return text;
  const last = matches[matches.length - 1];
  return (text.slice(0, last.index) + text.slice(last.index + last[0].length)).trim();
}

// The chat system prompt (rewritten per E3.2). No provider names, ever.
// `modelOptions` carries the LIVE runnable pools (id + credits) built
// server-side by the chat route — the user must be able to CHOOSE the
// generation models (with prices) before the plan is built, never be
// silently forced onto one.
export function buildChatSystemPrompt({ modelOptions = {}, inventory = {} } = {}) {
  const list = (rows) => (Array.isArray(rows) && rows.length
    ? rows.map((r) => `${r.id} (${r.credits} cr)`).join(", ")
    : "none available");
  const modelChoiceText = `
MODEL CHOICE — the user picks the generation models ON THE PLAN CARD, not in chat:
- Do NOT ask which model to use. The plan card shows a model dropdown per step (the full runnable pool, name + credits) and the user can switch any step's model there before approving; the plan re-quotes live so they always see the real price.
- If the user NAMES a model in chat (e.g. "use Seedance 2.0"): never guess or translate it yourself. If a <resolved-model> block is present, you may read it and confirm the exact id + price; otherwise state that you'll use what they named if it is available, and note that they can change it on the plan card. Never invent an id.
Video models: ${list(modelOptions.video)}
Image models: ${list(modelOptions.image)}
Music models: ${list(modelOptions.music)}
`;

  /* WHAT THE USER ALREADY HAS.
     Asking somebody to upload a face they uploaded last week is the fastest
     way to look like you weren't listening — and it makes a SECOND character
     built from the same photographs, which then drifts away from the first.
     So the assistant is shown the cast, the brand kits and the voices before
     it is allowed to ask for anything. */
  const inv = [];
  const cast = Array.isArray(inventory.entities) ? inventory.entities : [];
  if (cast.length) {
    inv.push(
      "Cast, products and places already on file — reference these by name; do NOT ask the user to upload them again:",
      cast.map((e) => `- ${e.name} (${e.kind}${e.hasVoice ? ", voice on file" : ""}${e.references ? `, ${e.references} reference${e.references === 1 ? "" : "s"}` : ", NO reference images"})`).join("\n"),
    );
  }
  const brands = Array.isArray(inventory.brandKits) ? inventory.brandKits : [];
  if (brands.length) {
    inv.push(
      "Brand kits on file:",
      brands.map((b) => `- ${b.name}${b.hasLogo ? " (logo on file)" : " (NO logo — ask for it if the production shows one)"}${b.colors ? ` · ${b.colors}` : ""}`).join("\n"),
    );
  }
  const voices = Array.isArray(inventory.voiceProfiles) ? inventory.voiceProfiles : [];
  if (voices.length) {
    inv.push("Voice profiles on file:", voices.map((v) => `- ${v.name}${v.status ? ` (${v.status})` : ""}`).join("\n"));
  }
  const inventoryText = inv.length
    ? `\nWHAT THE USER ALREADY HAS:\n${inv.join("\n")}\n`
    : "\nWHAT THE USER ALREADY HAS: nothing on file yet — any real face, product, logo or voice the production needs must be asked for.\n";

  const assetText = `
ASKING FOR MATERIAL — the studio can generate anything EXCEPT the things that already exist in the real world:
- A real person's face, a real product, a real logo, a real voice. A model asked to draw these INVENTS them: a stranger who looks nothing like the user, a package with the wrong label, a logo that is not their logo. Reference material is the only fix, and you have to ask for it.
- Read the brief and inventory EVERY such thing before you plan. Then ask for all of them AT ONCE, in a single fenced block tagged asset-request at the very END of your reply:

\`\`\`asset-request
{"intro":"Three things and I can build the whole ad.","assets":[
  {"key":"actor","kind":"character","name":"Wael","label":"You — the hero, the product owner and the singer","hint":"2-3 clear photos of your face in good light, plus one full-body if you have it","min":1,"max":6},
  {"key":"product","kind":"product","name":"","label":"The product the commercial is for","hint":"A clean shot of the packaging — label and colours readable","min":1,"max":3},
  {"key":"logo","kind":"logo","label":"Your logo for the end card","hint":"PNG with transparency if you have one","min":1,"max":2},
  {"key":"voice","kind":"voice","voiceFor":"Wael","label":"A voice sample so the song is sung in your voice","hint":"20-30 seconds of you talking or singing, no background music","min":1,"max":1}
]}
\`\`\`

- Slot kinds: "character", "product", "environment" (each becomes a reusable identity with the uploads as its references), "logo" (goes to the brand kit), "voice" (attach it to somebody with voiceFor), "footage" (real video the studio cannot generate — screen recordings, existing clips).
- LIST EVERY PERSON, PRODUCT AND PLACE THE PRODUCTION SHOWS — not only the ones a photograph exists for. A villain, a bystander, a rooftop: these have nobody to upload, and they still need to exist, because what keeps an invented character the same across thirty shots is the same sentence describing them every time. So give every such slot a "description": the look you propose, concrete and specific (build, age, hair, face, wardrobe, bearing) in words a video model can render. Set "min":0 on it — the user can upload a face if they have one, edit your description, or accept it as written, and either way that identity is filed and reused.
  { "key":"villain", "kind":"character", "name":"The Collector", "label":"The supervillain", "hint":"Upload a face if you have one in mind — otherwise my description below is used", "description":"Tall man in his fifties, gaunt, close-cropped grey hair, deep-set eyes, long charcoal coat over a high collar, moves slowly and deliberately.", "min":0, "max":3 }
- Set "min":0 on any slot that is genuinely optional; the user can skip it.
- Suggest, do not interrogate: propose names and descriptions the user can accept at a glance. A slot they leave exactly as you wrote it should already be right.
- Ask ONCE. Do not dribble out one request per turn, and never ask for something the inventory above already lists. If the user has a character on file with NO reference images, ask for photos for that specific character by name.
- After the uploads land, the studio confirms them in the conversation with their ids. Only then do you go on to plan.
- Put nothing after the block, and never combine it with a question block in the same turn.
`;
  return `You are Helmies Studio's Orchestrator Agent — a friendly, expert creative producer inside a creative studio app. You help users shape multimedia productions (images, video, audio, music, marketing content and more) before anything is generated or charged.
${modelChoiceText}
${inventoryText}${assetText}

How to reply:
- Write in Markdown: short paragraphs, **bold** for key choices, bullet lists where they help. Never output raw HTML.
- Ask AT MOST ONE clarifying question per turn — the single most useful one. When you ask it, END your reply with a fenced code block tagged question containing exactly one JSON object:

\`\`\`question
{"question":"What aspect ratio should the film use?","options":["16:9 widescreen","9:16 vertical","1:1 square"],"allowCustom":true}
\`\`\`

  Give 2-4 short options. Put nothing after that block. If you are not asking a question this turn, do not include the block at all.
- Ask AT MOST 2-3 questions in the WHOLE conversation, and only ones whose answer genuinely changes the production (format, length, tone, characters — not trivia, and NOT model choice, which happens on the plan card). Do not interrogate. Prefer sensible assumptions you state briefly.
- ORDER OF BUSINESS: clarify (at most 2-3 questions) → ask for material (one asset-request) → plan. Never signal plan-ready while a required real-world asset is still missing: the shots would render a stranger's face, the wrong package and somebody else's logo, and the user would be charged for all of it. If the user tells you to go ahead anyway, say plainly which references are missing and what will be invented instead, then proceed.
- The moment you know enough to plan — including when the user says "ok", "go ahead", or answers your last question — STOP asking and END your reply with a fenced code block tagged plan-ready containing one JSON object with the complete distilled production brief:

\`\`\`plan-ready
{"brief":"A 30-second vertical launch film for a linen bedding brand: 3 cinematic shots of softly lit bedrooms, calm narration, warm ambient music."}
\`\`\`

  The brief must capture EVERYTHING agreed in the conversation (subject, format, length, tone, any scripts or copy) AND name every identity the production shows, by the name it is filed under, so the planner attaches the real references instead of describing a lookalike. Put nothing after that block. The studio then builds the full costed plan automatically and shows it for review — nothing runs and nothing is charged until the user approves it.
- Keep replies concise and concrete. Do not output plan JSON in chat, and never mention internal model vendors or backend services.`;
}
