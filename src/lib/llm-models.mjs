// Helmies Studio — the brains the agent can think with.
//
// This used to be one hardcoded string (`deepseek/deepseek-v4-flash`) and an
// alias map pointing five dead Gemini ids at it. That was fine while the
// agent only ever read and wrote text. It stopped being fine the moment the
// agent had to LOOK at the photograph somebody attached and LISTEN to what
// they said into the microphone.
//
// The single most important fact here, measured against OpenRouter's live
// model list on 2026-08-09:
//
//     EVERY DeepSeek MODEL IS TEXT-ONLY.
//
// deepseek/deepseek-v4-pro is a genuine reasoning model, 1M context, cheap —
// and its input modalities are ["text"]. Nothing else. Give the agent that
// brain and an attached image is silently dropped on the floor: the model
// never sees it, answers confidently about a picture it was never shown, and
// nothing in the response says so. Same for a voice note. So DeepSeek stays
// available and is honestly labelled, but it is not the default, because the
// default has to be able to see.
//
// Prices are USD per MILLION tokens, read from OpenRouter's own /models
// endpoint. They are a snapshot for CHOOSING and DISPLAYING; nothing here is
// billed from these numbers.
//
// Sorted so the file itself answers "cheapest" and "best".

/** @typedef {"text"|"image"|"audio"|"video"|"file"} Modality */

export const LLM_MODELS = [
  /* ── The default ───────────────────────────────────────────────────────
     Everything the agent needs and almost nothing it does not: it reasons,
     it sees images, it hears audio, it can read a video, and a megabyte of
     conversation costs a quarter of a dollar. This is the row that makes
     "attach a photo" and "hold to talk" work at all. */
  {
    id: "google/gemini-3.1-flash-lite",
    label: "Balanced — sees, hears, thinks",
    tier: "balanced",
    inputPerM: 0.25,
    outputPerM: 1.5,
    context: 1048576,
    modalities: ["text", "image", "audio", "video", "file"],
    reasoning: true,
    note: "The default. Full multimodality with reasoning at a tenth of flagship price.",
  },

  /* ── Cheapest that still does everything ─────────────────────────────── */
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Cheapest — still sees and hears",
    tier: "cheapest",
    inputPerM: 0.1,
    outputPerM: 0.4,
    context: 1048576,
    modalities: ["text", "image", "audio", "video", "file"],
    reasoning: true,
    note: "An older generation, but every modality and a fifteenth of the pro price. Good for transcription and long back-and-forth.",
  },
  {
    id: "mistralai/voxtral-small-24b-2507",
    label: "Listening only — cheap transcription",
    tier: "transcribe",
    inputPerM: 0.1,
    outputPerM: 0.3,
    context: 32000,
    modalities: ["text", "audio", "file"],
    reasoning: false,
    note: "Built for speech. No vision, short context — a transcriber, not a planner.",
  },

  /* ── Best ──────────────────────────────────────────────────────────────
     When a production is being planned and it matters more that the plan is
     right than that the turn was cheap. */
  {
    id: "google/gemini-3.1-pro-preview",
    label: "Best — every modality, deepest reasoning",
    tier: "best",
    inputPerM: 2.0,
    outputPerM: 12.0,
    context: 1048576,
    modalities: ["text", "image", "audio", "video", "file"],
    reasoning: true,
    note: "The strongest model that can also hear. Worth it on the planning turn, wasteful on chatter.",
  },
  {
    id: "google/gemini-3.6-flash",
    label: "Fast and strong — sees and hears",
    tier: "strong",
    inputPerM: 1.5,
    outputPerM: 7.5,
    context: 1048576,
    modalities: ["text", "image", "audio", "video", "file"],
    reasoning: true,
    note: "Most of the pro's judgement at a quarter of the input price.",
  },
  {
    id: "anthropic/claude-opus-5",
    label: "Best writing — reads images, cannot hear",
    tier: "writing",
    inputPerM: 5.0,
    outputPerM: 25.0,
    context: 1000000,
    modalities: ["text", "image", "file"],
    reasoning: true,
    note: "The best screenplay and copy of any row here. NO audio input — a voice note reaches it as nothing.",
  },

  /* ── Thinking, but blind ───────────────────────────────────────────────
     Kept because it is asked for by name and it is genuinely good and cheap
     at pure reasoning. The label is the warning. */
  {
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek Pro — thinks hard, TEXT ONLY",
    tier: "thinking-text",
    inputPerM: 0.43,
    outputPerM: 0.87,
    context: 1048576,
    modalities: ["text"],
    reasoning: true,
    note: "Strong cheap reasoning, but BLIND AND DEAF: attached images and voice notes never reach it. Do not use it as the agent's brain while attachments matter.",
  },
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek Flash — fastest thinking, TEXT ONLY",
    tier: "thinking-text-fast",
    inputPerM: 0.14,
    outputPerM: 0.28,
    context: 1048576,
    modalities: ["text"],
    reasoning: true,
    note: "The studio's previous default. Cheap and quick, but cannot see or hear.",
  },
];

const BY_ID = new Map(LLM_MODELS.map((m) => [m.id, m]));

/* The agent's brain when nothing else is chosen.

   Overridable with LLM_MODEL so a bad upstream day can be routed around
   without a deploy — but the override is CHECKED: an id that is not in the
   registry, or one that cannot see, would silently break attachments, and
   the whole point of this file is that that failure is never silent again. */
export const DEFAULT_LLM = "google/gemini-3.1-flash-lite";

/** The model that reads audio when somebody talks instead of typing. */
export const TRANSCRIBE_LLM = "google/gemini-2.5-flash-lite";

/** The model used for a live call — chosen for latency, not depth. */
export const CALL_LLM = "google/gemini-2.5-flash-lite";

export function llmModel(id) {
  return BY_ID.get(id) || null;
}

export function canSee(id) {
  return Boolean(llmModel(id)?.modalities.includes("image"));
}

export function canHear(id) {
  return Boolean(llmModel(id)?.modalities.includes("audio"));
}

/**
 * Resolve a requested model to one that can actually do the job.
 *
 * `needs` names the modalities this call will send. A model that cannot take
 * one of them is REPLACED rather than used, because the failure mode is not
 * an error — it is a confident answer about an image the model never saw.
 * The substitution is reported so the caller can say so.
 */
export function resolveLlm(requested, { needs = [], fallback = DEFAULT_LLM } = {}) {
  const wanted = llmModel(requested) || llmModel(fallback) || llmModel(DEFAULT_LLM);
  const missing = needs.filter((m) => m !== "text" && !wanted.modalities.includes(m));
  if (!missing.length) return { id: wanted.id, substituted: null, missing: [] };

  // The cheapest registry row that covers everything this call needs.
  const able = LLM_MODELS
    .filter((m) => needs.every((n) => n === "text" || m.modalities.includes(n)))
    .sort((a, b) => a.inputPerM - b.inputPerM)[0];

  if (!able) return { id: wanted.id, substituted: null, missing };
  return { id: able.id, substituted: wanted.id, missing };
}

/** What the settings picker shows: id, label, price, what it can take in. */
export function llmChoices() {
  return LLM_MODELS.map((m) => ({
    id: m.id,
    label: m.label,
    tier: m.tier,
    inputPerM: m.inputPerM,
    outputPerM: m.outputPerM,
    context: m.context,
    modalities: m.modalities,
    reasoning: m.reasoning,
    note: m.note,
    // A rough per-turn figure is far more use than $/M to somebody choosing:
    // ~8k in, ~1k out is a realistic planning turn.
    approxTurnUsd: Number((8 * m.inputPerM / 1000 + 1 * m.outputPerM / 1000).toFixed(4)),
  }));
}
