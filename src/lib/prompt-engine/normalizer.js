// Pass 0 — Intent Normalization
// Spec §27. Extract structured intent from the raw prompt WITHOUT an LLM when
// possible (deterministic parse), falling back to an LLM only for ambiguous or
// long free-form briefs. Produces a `normalized` object the later passes read.

import { llmComplete } from "@/lib/providers";

const GOAL_KEYWORDS = {
  image: ["image", "picture", "photo", "render", "illustration", "poster", "logo", "portrait"],
  video: ["video", "animate", "animation", "clip", "footage", "scene", "shot", "cinematic"],
  audio: ["music", "song", "sound", "audio", "voice", "tts", "speech", "track", "sfx"],
  edit: ["edit", "change", "replace", "remove", "add", "inpaint", "outpaint", "modify"],
};

const STYLE_HINTS = ["photorealistic", "cinematic", "editorial", "anime", "illustration", "3d", "render", "painting", "sketch", "minimalist", "maximalist", "vintage", "futuristic", "noir", "documentary", "ugc"];
const CAMERA_HINTS = ["close-up", "wide shot", "drone", "aerial", "tracking", "dolly", "pan", "macro", "portrait", "overhead", "low angle", "high angle", "pov", "first-person"];
const MOOD_HINTS = ["dark", "bright", "moody", "joyful", "epic", "intimate", "tense", "calm", "energetic", "dreamy", "gritty", "luxurious", "playful"];
const LIGHTING_HINTS = ["golden hour", "blue hour", "studio", "natural", "dramatic", "soft", "hard", "neon", "candlelight", "overcast", "backlit", "rim light"];
const PLATFORM_HINTS = ["instagram", "tiktok", "youtube", "shorts", "twitter", "x", "linkedin", "facebook", "pinterest", "snapchat"];

function findHints(text, hints) {
  const lower = text.toLowerCase();
  return hints.filter((h) => lower.includes(h));
}

function extractQuotedText(text) {
  // "exact text" or 'exact text' — preserve for immutable-fact protection
  const matches = [];
  const re = /[""']([^""']{1,200})[""']/g;
  let m;
  while ((m = re.exec(text)) !== null) matches.push(m[1]);
  return matches;
}

function inferGoal(text, tool) {
  const lower = text.toLowerCase();
  for (const [goal, words] of Object.entries(GOAL_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return goal;
  }
  return tool;
}

function deterministicParse(state) {
  const text = state.rawPrompt;
  const exactTexts = extractQuotedText(text);
  return {
    goal: inferGoal(text, state.tool),
    subject: null,          // left for LLM pass if needed
    action: null,
    environment: null,
    styles: findHints(text, STYLE_HINTS),
    camera: findHints(text, CAMERA_HINTS),
    moods: findHints(text, MOOD_HINTS),
    lighting: findHints(text, LIGHTING_HINTS),
    platforms: findHints(text, PLATFORM_HINTS),
    aspect: state.settings.aspect_ratio || null,
    duration: state.settings.duration || null,
    resolution: state.settings.resolution || null,
    exactTexts,
    immutableFacts: {
      // anything in quotes is immutable (product names, slogans, exact text)
      texts: exactTexts,
      // brand kit colors/logo are also immutable but handled in enricher
    },
    references: (state.references || []).map((r) => ({ url: r.url, role: r.role })),
    negativeConstraints: [],
  };
}

async function llmNormalize(rawPrompt, tool) {
  // Only used for long or ambiguous briefs (>60 words) where deterministic
  // parse misses too much. Spec §27 allows structured extraction.
  const system = `You are an intent normalizer for an AI media generation platform. Extract structured intent from the user's brief and return ONLY a JSON object with these keys:
goal, subject, action, environment, styles (array), camera (array), moods (array), lighting (array), platforms (array), exactTexts (array of any quoted text), negativeConstraints (array).
Do NOT invent facts. If a field is unknown, use null or an empty array. Keep subject/action/environment as short noun/verb phrases.`;
  try {
    const out = await llmComplete(
      [
        { role: "system", content: system },
        { role: "user", content: `Tool: ${tool}\nBrief: ${rawPrompt}` },
      ],
      { maxTokens: 400, temperature: 0.2 }
    );
    return JSON.parse(out);
  } catch {
    return null;
  }
}

export async function normalizeIntent(state) {
  const wordCount = (state.rawPrompt || "").trim().split(/\s+/).filter(Boolean).length;
  let normalized = deterministicParse(state);

  // For long briefs, augment with an LLM pass but keep deterministic hints
  // and immutable facts (quotes) authoritative.
  if (wordCount > 60) {
    const llm = await llmNormalize(state.rawPrompt, state.tool);
    if (llm) {
      normalized = {
        ...normalized,
        subject: llm.subject || normalized.subject,
        action: llm.action || normalized.action,
        environment: llm.environment || normalized.environment,
        styles: Array.from(new Set([...normalized.styles, ...(llm.styles || [])])),
        camera: Array.from(new Set([...normalized.camera, ...(llm.camera || [])])),
        moods: Array.from(new Set([...normalized.moods, ...(llm.moods || [])])),
        lighting: Array.from(new Set([...normalized.lighting, ...(llm.lighting || [])])),
        platforms: Array.from(new Set([...normalized.platforms, ...(llm.platforms || [])])),
        negativeConstraints: llm.negativeConstraints || normalized.negativeConstraints,
        // exactTexts stay from deterministic parse (quotes are ground truth)
      };
    }
  }

  state.normalized = normalized;
  return state;
}