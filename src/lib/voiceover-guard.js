// A9 — the voiceover instruction guard (owner defect 1: "the voiceover SAYS
// the prompt"). A TTS model reads its `text` field VERBATIM, so if a plan
// step carries "Generate a voiceover about our new mattress" instead of the
// narration itself, the finished audio literally speaks the instruction.
//
// The planner contract now requires finished narration in every voiceover
// step, but plans can be old, degraded (heuristic), or hand-edited — so the
// execution path runs this cheap shape detector as a belt-and-braces last
// line of defense, and rewrites the text through one LLM call when it
// triggers (see executeVoiceoverStep in agents.js).
//
// Pure and dependency-free so both the server executor and the unit suite
// (tests/unit/voiceover-guard.test.mjs) share the exact same judgment.

// Imperative production verbs an INSTRUCTION starts with. Real narration
// can start with "Make" or "Create" too ("Make your mornings better…"), so
// a leading verb alone is never enough — it must be paired with a speech-
// production noun close behind it.
const LEAD_VERB_RE =
  /^\s*(?:please\s+|now\s+|can you\s+|could you\s+)*(?:generate|create|make|write|produce|record|compose|narrate|say|read|do)\b/i;

// The nouns that make the leading verb an instruction ABOUT speech rather
// than speech itself. "audio" and "tts" are included ("generate audio for
// the promo"), but generic words like "sound" are not — narration about
// sound is perfectly normal.
const SPEECH_NOUN_RE =
  /\b(?:voice[\s-]?over|narration|narrator|narrating|tts|text[\s-]?to[\s-]?speech|audio|voice[\s-]?track|spoken\s+(?:word|audio|track))\b/i;

// Unmistakable instruction idioms that convict on their own, wherever they
// appear: "a voiceover about X", "narration for the promo", "voiceover
// script for…". Narration never refers to itself this way.
const IDIOM_RE =
  /\b(?:(?:voice[\s-]?over|narration)\s+(?:about|for|of|describing)|an?\s+(?:voice[\s-]?over|narration)\s+that|(?:voice[\s-]?over|narration)\s+script\s+for|script\s+for\s+(?:a\s+|the\s+)?(?:voice[\s-]?over|narration))\b/i;

// "Narrate X" is self-convicting — narration scripts never open by telling
// someone to narrate. ("Say"/"Read"/"Record" stay innocent on their own:
// real copy opens with those constantly.)
const SELF_CONVICTING_RE = /^\s*(?:please\s+|now\s+|can you\s+|could you\s+)*narrate\b/i;

/**
 * True when `text` is shaped like an instruction to produce a voiceover
 * rather than the voiceover's own words. Deliberately conservative: a real
 * narration script must never trigger it (a false positive burns an LLM
 * rewrite on already-good copy; a false negative speaks an instruction
 * aloud — but the planner contract is the first line of defense there).
 */
export function isVoiceoverInstruction(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;
  if (IDIOM_RE.test(t)) return true;
  if (SELF_CONVICTING_RE.test(t)) return true;
  if (!LEAD_VERB_RE.test(t)) return false;
  // The speech noun must appear near the leading verb — an instruction is
  // short and front-loaded ("Generate a warm voiceover narrating…"), while
  // narration that merely mentions "audio" deep in a long script is content.
  return SPEECH_NOUN_RE.test(t.slice(0, 140));
}
