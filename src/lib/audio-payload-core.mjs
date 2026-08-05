// ── The ONE audio parameter-name map ───────────────────────────────────────
// Production incident: every one of the 30 active `modelType:"audio"` rows
// failed. Live probes against the real KIE account (2026-08-05) found TWO
// distinct causes, and both are a NAMING problem, not a plumbing one:
//
//   1. The studio's canonical parameter names are not the names the audio
//      models want. src/lib/providers.js's KIE adapter posts everything as
//      `{ model, input: { prompt, ...rest } }`, but the speech models take
//      `text` — never `prompt` — and their voice field is `voice`, not
//      `voiceId`/`voice_id`:
//        {"model":"elevenlabs/text-to-speech-multilingual-v2",
//         "input":{"prompt":"hello there"}}      → {"code":500,"msg":"text is required"}
//        …"input":{"text":"hello there"}         → {"code":422,"msg":"voiceId cannot be empty"}
//        …"input":{"text":"…","voiceId":"…"}     → {"code":422,"msg":"voiceId cannot be empty"}
//        …"input":{"text":"…","voice":"…"}       → {"code":200,"msg":"success", taskId}
//      The provider NAMES the field "voiceId" in its error text and ACCEPTS
//      it as "voice" — which is exactly why passing `voiceId` explicitly
//      (four different values were tried in production) changed nothing.
//
//   2. The Suno music suite is not on the generic market route at all:
//        POST /api/v1/jobs/createTask {"model":"generate-music", …}
//          → {"code":422,"msg":"The model name you specified is not supported…"}
//        POST /api/v1/generate {"prompt":"…","customMode":false,
//                               "instrumental":true,"model":"V5", …}
//          → {"code":200,"msg":"success", taskId}  → real .mp3
//      Music lives on its OWN path with a FLAT body whose `model` is an
//      ENGINE selector (V4 / V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5), not a
//      model slug, and is polled at /api/v1/generate/record-info.
//
// This module is that single mapping site — canonical studio params in, the
// exact per-family provider body out. Nothing else in the codebase may learn
// a provider's field spelling: providers.js's formatPayload/buildUrl/
// buildPollUrl/parsePoll delegate here and to nothing else, so adding a
// family means editing this file only.
//
// It is dependency-free by design (no prisma, no "@/" alias), same as
// provider-payload-core.mjs — src/lib/providers.js is loaded both inside
// Next AND under plain `node` via scripts/worker.mjs, and this has to be
// unit-testable without a network or a database.
//
// TWO HARD RULES, both covered by tests (tests/unit/audio-payload-core.test.mjs):
//   1. Content is NEVER invented. `text`/`prompt` come from the caller or the
//      request is left to fail honestly on the provider's own validator. A
//      field the caller did not supply is simply absent.
//   2. A caller value is NEVER silently forwarded into a field the provider
//      would reject. Each family has a WHITELIST; anything not on it is
//      dropped rather than posted (the async route injects `negative_prompt`
//      into every payload, and speech models 422 on unknown input keys).
//      Voice/engine defaults ARE allowed — they are rendering settings, not
//      content, and the provider hard-requires them (see below).

export const AUDIO_FAMILY = {
  SUNO_MUSIC: "suno-music",
  ELEVENLABS_TTS: "elevenlabs-tts",
  ELEVENLABS_DIALOGUE: "elevenlabs-dialogue",
  GEMINI_TTS: "gemini-tts",
};

// KIE's Suno route. Documented at docs.kie.ai/suno-api/generate-music and
// /suno-api/get-music-details; both verified with live calls.
export const SUNO_SUBMIT_PATH = "/api/v1/generate";
export const SUNO_POLL_PATH = "/api/v1/generate/record-info";

// Normalization ladder shared with model-catalog-core.mjs's
// curatedSchemaEntry: a sitemap-derived id keeps its vendor folder and
// hyphenated version ("elevenlabs/text-to-speech-turbo-2-5") while the
// canonical spelling uses "-" and a dotted version ("…turbo-2.5").
function normalizeId(modelId) {
  const raw = String(modelId || "").toLowerCase();
  return {
    raw,
    slashless: raw.replace(/\//g, "-"),
    dotted: raw.replace(/\//g, "-").replace(/(\d)-(\d)/g, "$1.$2"),
  };
}

// Mirrors model-catalog-core.mjs's AUDIO_KIND_RULES "music" entry — ONLY a
// from-scratch composer (`generate-music`, or a bare versioned engine
// selector such as `suno-v4.5-plus`) is routed to the music API. Every other
// Suno-suite slug (extend-music, replace-section, generate-mashup, …) lives
// on its own per-operation path and needs a source track id the studio has
// no surface to supply, so it is deliberately NOT claimed here and keeps
// falling through to the generic market route that honestly rejects it.
const SUNO_MUSIC_RE = /(^|[^a-z])generate-music($|[^a-z])|(^|[^a-z])suno-v[\d.]+/;
const ELEVENLABS_TTS_RE = /elevenlabs[/-]text-to-speech/;
const ELEVENLABS_DIALOGUE_RE = /elevenlabs[/-]text-to-dialogue/;
// google/gemini-3-1-flash-tts, gemini-2-5-pro-tts — Google's multi-speaker
// TTS models, which take `speakers` + `dialogue_turns`, never a `prompt`.
const GEMINI_TTS_RE = /gemini[a-z0-9.\-]*-tts($|[^a-z])/;

/**
 * The provider family a model id belongs to, or null when this module has
 * nothing to say about it (every non-audio model, and every audio model the
 * generic market shape already serves — e.g. elevenlabs/audio-isolation,
 * which takes a plain `audio_url` and is verified working as-is).
 */
export function audioProviderFamily(modelId) {
  const { raw, slashless, dotted } = normalizeId(modelId);
  if (!raw) return null;
  const probe = `${raw} ${slashless} ${dotted}`;
  if (ELEVENLABS_DIALOGUE_RE.test(probe)) return AUDIO_FAMILY.ELEVENLABS_DIALOGUE;
  if (ELEVENLABS_TTS_RE.test(probe)) return AUDIO_FAMILY.ELEVENLABS_TTS;
  if (GEMINI_TTS_RE.test(probe)) return AUDIO_FAMILY.GEMINI_TTS;
  if (SUNO_MUSIC_RE.test(probe)) return AUDIO_FAMILY.SUNO_MUSIC;
  return null;
}

// ── Voices ─────────────────────────────────────────────────────────────────
// The studio's voice picker (src/components/studio/AudioStudio.js) offers
// eight voices by SLUG — rachel/domi/bella/elli/antoni/josh/arnold/sam, each
// with a one-line character description. Neither provider accepts those
// slugs: KIE's ElevenLabs proxy validates `voice` against its own published
// allow-list of voice IDs ("Invalid voice parameter: rachel. Please refer to
// the documentation for the list of supported voices." — live 422), and
// Google's TTS validates `voice_name` against its 30 prebuilt names ("The
// voice_name parameter is invalid" — live 422).
//
// So the slug→provider-value translation has to happen somewhere, and this
// is the one place it may. Each mapping picks the allow-listed voice whose
// published description matches the studio's own description of that slug;
// the comment on each line is the provider's own wording, so the choice is
// checkable rather than arbitrary. A value that is ALREADY a provider voice
// identifier (the user typed one, or a template stored one) is passed
// through untouched — the map only ever resolves a slug it knows.
export const ELEVENLABS_VOICE_IDS = {
  rachel: "aD6riP1btT197c6dACmy", // Rachel M — Pro British Radio Presenter
  domi: "qDuRKMlYmrm8trt5QyBn", // Taksh — Calm, Serious and Smooth
  bella: "hpp4J3VqNfWAUOO0d1Us", // Bella — Professional, Bright, Warm
  elli: "5l5f8iK3YPeGga21rQIX", // Adeline — Feminine and Conversational
  antoni: "LruHrtVF6PSyGItzMNHS", // Benjamin — Deep, Warm, Calming
  josh: "UgBBYS2sOqTuMpoF3BR0", // Mark — Natural Conversations
  arnold: "DGzg6RaUqxGRTHSBjfgF", // Brock — Commanding and Loud Sergeant
  sam: "scOwDtmlUjD3prqpp97I", // Sam — Support Agent
};

export const GEMINI_VOICE_NAMES = {
  rachel: "Sulafat", // Warm
  domi: "Schedar", // Even
  bella: "Zephyr", // Bright
  elli: "Leda", // Youthful
  antoni: "Gacrux", // Mature
  josh: "Achird", // Friendly
  arnold: "Alnilam", // Firm
  sam: "Iapetus", // Clear
};

// A voice is a RENDERING SETTING, not content (rule 1 above is about text
// and asset URLs), and both providers REQUIRE one — "voiceId cannot be
// empty" / "The voice_name parameter cannot be empty" are hard 422s. So an
// absent voice is filled with the family's neutral default rather than
// submitted empty and guaranteed to fail. A caller-supplied voice always
// wins.
export const ELEVENLABS_DEFAULT_VOICE = ELEVENLABS_VOICE_IDS.rachel;
export const GEMINI_DEFAULT_VOICE = GEMINI_VOICE_NAMES.rachel;

function pickVoice(params) {
  for (const key of ["voice", "voice_id", "voiceId", "voice_name", "voiceName"]) {
    const v = params?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function resolveElevenLabsVoice(params) {
  const raw = pickVoice(params);
  if (!raw) return ELEVENLABS_DEFAULT_VOICE;
  return ELEVENLABS_VOICE_IDS[raw.toLowerCase()] || raw;
}

export function resolveGeminiVoice(params) {
  const raw = pickVoice(params);
  if (!raw) return GEMINI_DEFAULT_VOICE;
  return GEMINI_VOICE_NAMES[raw.toLowerCase()] || raw;
}

// ── Suno engines ───────────────────────────────────────────────────────────
// The music route's `model` is an engine selector, not a model slug. A
// version-pinned catalog id maps to its own engine; the unversioned
// `generate-music` row has no version to read, so it gets the newest engine
// — the only one that can honour a requested duration at all.
export const SUNO_ENGINES = ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"];
export const SUNO_DEFAULT_ENGINE = "V5_5";
const SUNO_ENGINE_BY_MODEL = {
  "suno-v4": "V4",
  "suno-v4.5": "V4_5",
  "suno-v4.5-plus": "V4_5PLUS",
  "suno-v4.5-all": "V4_5ALL",
  "suno-v5": "V5",
  "suno-v5.5": "V5_5",
};

export function resolveSunoEngine(modelId, params = {}) {
  for (const key of ["engine", "model_version", "modelVersion", "suno_model"]) {
    const v = params?.[key];
    if (typeof v === "string" && SUNO_ENGINES.includes(v.toUpperCase())) return v.toUpperCase();
  }
  const { dotted, slashless } = normalizeId(modelId);
  return SUNO_ENGINE_BY_MODEL[dotted] || SUNO_ENGINE_BY_MODEL[slashless] || SUNO_DEFAULT_ENGINE;
}

// ── Per-family field maps ──────────────────────────────────────────────────
// canonical studio name → provider field name. A key absent from the map is
// DROPPED (rule 2): the async route injects `negative_prompt` into every
// payload and the speech models reject unknown input keys.
const ELEVENLABS_TTS_MAP = {
  stability: "stability",
  similarity_boost: "similarity_boost",
  similarity: "similarity_boost",
  speed: "speed",
  style: "style",
  language_code: "language_code",
  timestamps: "timestamps",
  previous_text: "previous_text",
  next_text: "next_text",
};

const ELEVENLABS_DIALOGUE_MAP = {
  stability: "stability",
  language_code: "language_code",
};

// Suno's flat body is camelCase; the studio's canonical names are snake_case.
// Sending the snake_case spelling is silently ignored by the provider (a live
// probe with negative_tags/vocal_gender was accepted and neither was applied),
// which is the quiet half of this bug.
const SUNO_MAP = {
  style: "style",
  title: "title",
  negative_tags: "negativeTags",
  negativeTags: "negativeTags",
  vocal_gender: "vocalGender",
  vocalGender: "vocalGender",
  style_weight: "styleWeight",
  weirdness_constraint: "weirdnessConstraint",
  audio_weight: "audioWeight",
  persona_id: "personaId",
  persona_model: "personaModel",
};

// Fields only Suno's CUSTOM mode can honour. If the caller supplied any of
// them, custom mode is what they asked for, whether or not they said so.
const SUNO_CUSTOM_ONLY = new Set(["style", "title", "negativeTags", "vocalGender", "duration"]);

function isAbsent(value) {
  return value === undefined || value === null || value === "";
}

function mapFields(params, map, out) {
  for (const [canonical, providerName] of Object.entries(map)) {
    const value = params?.[canonical];
    if (isAbsent(value)) continue;
    if (out[providerName] === undefined) out[providerName] = value;
  }
  return out;
}

// The caller's text, wherever they put it. `text` wins because it is the
// provider's own field name (a caller that already speaks the provider's
// language is not second-guessed); `prompt` is the studio's canonical name
// and the one every studio surface actually sends.
function textOf(prompt, params) {
  for (const candidate of [params?.text, prompt, params?.prompt]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * Build the ElevenLabs speech body: `{ model, input: { text, voice, … } }`
 * on the ordinary market route.
 */
export function buildElevenLabsTtsInput(prompt, params = {}) {
  const input = {};
  const text = textOf(prompt, params);
  // Rule 1: no text is a real caller error. Leave it absent so the provider
  // answers "text is required" and the failure is honest, rather than
  // fabricating something to say.
  if (text !== null) input.text = text;
  input.voice = resolveElevenLabsVoice(params);
  return mapFields(params, ELEVENLABS_TTS_MAP, input);
}

/**
 * ElevenLabs' dialogue model takes turns, not a flat string:
 * `{ input: { dialogue: [{ text, voice }], … } }`. A caller that already
 * built the turns keeps them; a plain studio submit becomes a single turn.
 */
export function buildElevenLabsDialogueInput(prompt, params = {}) {
  const input = {};
  const supplied = Array.isArray(params.dialogue) ? params.dialogue : null;
  if (supplied) {
    input.dialogue = supplied.map((turn) => {
      const line = { ...turn };
      if (line.voice !== undefined || line.voice_id !== undefined || line.voiceId !== undefined) {
        line.voice = resolveElevenLabsVoice(line);
        delete line.voice_id;
        delete line.voiceId;
      } else {
        line.voice = resolveElevenLabsVoice(params);
      }
      return line;
    });
  } else {
    const text = textOf(prompt, params);
    if (text !== null) input.dialogue = [{ text, voice: resolveElevenLabsVoice(params) }];
  }
  return mapFields(params, ELEVENLABS_DIALOGUE_MAP, input);
}

/**
 * Google's TTS is multi-speaker by construction: one `speakers` entry per
 * voice and one `dialogue_turns` entry per line. A single-voice studio
 * submit is the one-speaker case of exactly that shape.
 */
export const GEMINI_SPEAKER_ID = "Speaker 1";

export function buildGeminiTtsInput(prompt, params = {}) {
  const input = {};
  if (Array.isArray(params.speakers) && params.speakers.length) {
    input.speakers = params.speakers;
    if (Array.isArray(params.dialogue_turns)) input.dialogue_turns = params.dialogue_turns;
    return input;
  }
  input.speakers = [{ speaker_id: GEMINI_SPEAKER_ID, voice_name: resolveGeminiVoice(params) }];
  const text = textOf(prompt, params);
  // Rule 1 again — an absent script stays absent ("The dialogue_turns
  // parameter cannot be empty" is the honest answer).
  if (text !== null) input.dialogue_turns = [{ speaker_id: GEMINI_SPEAKER_ID, text }];
  return input;
}

/**
 * Suno's music body is FLAT (no `input` wrapper) and its `model` is the
 * engine selector.
 *
 * `duration` is only accepted "when customMode is true and model is V5_5"
 * (the provider's own 422 text), so it is forwarded only under exactly those
 * conditions and dropped otherwise — sending it to any other engine is a
 * guaranteed rejection, and dropping it is what lets a version-pinned engine
 * still generate.
 */
export function buildSunoMusicBody(modelId, prompt, params = {}) {
  const engine = resolveSunoEngine(modelId, params);
  const body = { model: engine };

  const text = textOf(prompt, params);
  if (text !== null) body.prompt = text;

  mapFields(params, SUNO_MAP, body);

  const duration = Number(params.duration);
  if (Number.isFinite(duration) && duration > 0 && engine === SUNO_DEFAULT_ENGINE) body.duration = duration;

  const instrumental = params.instrumental;
  body.instrumental = typeof instrumental === "boolean" ? instrumental : instrumental === "true";

  // Custom mode is inferred from what SURVIVED the mapping above, not from
  // what the caller passed: a `duration` dropped for the wrong engine must
  // not switch the whole submit into a mode nothing then uses.
  const explicitCustom = params.custom_mode ?? params.customMode;
  body.customMode = typeof explicitCustom === "boolean"
    ? explicitCustom
    : Object.keys(body).some((k) => SUNO_CUSTOM_ONLY.has(k));

  return body;
}

/**
 * The complete provider request for one audio submit, or null when this
 * model is not one of the mapped families (the caller then keeps its
 * existing generic behaviour).
 *
 * `callBackUrl` is deliberately NOT added here — providers.js owns that for
 * every route it speaks, audio or not.
 *
 * @returns {{ path: string, body: object, family: string } | null}
 */
export function formatAudioRequest(modelId, prompt, params = {}) {
  const family = audioProviderFamily(modelId);
  if (!family) return null;

  if (family === AUDIO_FAMILY.SUNO_MUSIC) {
    return { family, path: SUNO_SUBMIT_PATH, body: buildSunoMusicBody(modelId, prompt, params) };
  }

  const input =
    family === AUDIO_FAMILY.ELEVENLABS_TTS ? buildElevenLabsTtsInput(prompt, params)
      : family === AUDIO_FAMILY.ELEVENLABS_DIALOGUE ? buildElevenLabsDialogueInput(prompt, params)
        : buildGeminiTtsInput(prompt, params);

  // Everything but Suno rides the ordinary market route — same path, same
  // `{ model, input }` envelope, only the field NAMES were ever wrong.
  return { family, path: null, body: { model: modelId, input } };
}

/** The submit path a model needs, or null for "the caller's default". */
export function audioSubmitPath(modelId) {
  return audioProviderFamily(modelId) === AUDIO_FAMILY.SUNO_MUSIC ? SUNO_SUBMIT_PATH : null;
}

/** The poll path a model needs, or null for "the caller's default". */
export function audioPollPath(modelId, requestId) {
  if (audioProviderFamily(modelId) !== AUDIO_FAMILY.SUNO_MUSIC) return null;
  return `${SUNO_POLL_PATH}?taskId=${encodeURIComponent(requestId)}`;
}

// ── Suno poll parsing ──────────────────────────────────────────────────────
// The music route answers with its own envelope — `data.status` (an enum of
// words, not the market route's lowercase `state`) and
// `data.response.sunoData[]` rather than `data.resultJson` — so the market
// parser reads it as "no outputs, still pending" forever. Shape-detected
// rather than family-detected: parsePoll is handed only the body.
const SUNO_TERMINAL_FAILURES = new Set([
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
]);

export function isSunoPollBody(data) {
  if (!data || typeof data !== "object") return false;
  if (data.response && Array.isArray(data.response.sunoData)) return true;
  return typeof data.status === "string" && (data.status === "SUCCESS" || data.status === "PENDING" || SUNO_TERMINAL_FAILURES.has(data.status) || data.status === "TEXT_SUCCESS" || data.status === "FIRST_SUCCESS");
}

/**
 * @returns {{ status: string, outputs: string[], error: string|undefined } | null}
 */
export function parseSunoPoll(data) {
  if (!isSunoPollBody(data)) return null;
  const tracks = Array.isArray(data.response?.sunoData) ? data.response.sunoData : [];
  const outputs = tracks
    .map((t) => t?.audioUrl || t?.sourceAudioUrl || t?.streamAudioUrl)
    .filter((u) => typeof u === "string" && u);

  const raw = String(data.status || "");
  if (SUNO_TERMINAL_FAILURES.has(raw)) {
    return {
      status: "failed",
      outputs,
      // SENSITIVE_WORD_ERROR carries no message of its own — the status IS
      // the reason, and brandError's moderation tokens turn it into the
      // "blocked by safety filters" message rather than a generic one.
      error: data.errorMessage || data.errorCode || raw,
    };
  }
  // A track is only usable once its audioUrl is populated: FIRST_SUCCESS can
  // arrive with an empty audioUrl and a stream url that is still filling.
  if (raw === "SUCCESS" && outputs.length) return { status: "success", outputs, error: undefined };
  return { status: "pending", outputs: [], error: undefined };
}
