// Helmies Studio — Storyboard step core (pure, worker-safe).
//
// Extracted from src/lib/agents.js (Phase A) so the durable agent runner can
// execute storyboard steps inside the plain-node worker. agents.js delegates
// to this module — one contract, two call sites.

// The strict JSON contract the planner was told to emit; downstream steps
// embed the result via the ${storyboard} token, so the shape must be
// identical whether the draft came from the user, the planner, or this
// fallback generation.
export const STORYBOARD_JSON_HINT =
  'Reply with ONLY one valid JSON object — no markdown fences, no commentary: {"scenario":"<one-paragraph narrative of the whole video>","characters":[{"name":"<name>","role":"<role>","appearance":"<same words every sheet reuses>","shots":["full body","face front","face side","face 3/4"]}],"scenes":[{"id":1,"title":"<scene title>","description":"<what happens, where, who>","location":"<setting>","time":"<time of day>","camera":"<shot size and movement>","characters":["<names from characters>"]}]}';

export const STRICT_JSON_RETRY_HINT =
  "Your previous reply was not a single valid JSON object. Reply again with ONLY the JSON object — no markdown fences, no commentary.";

// Tolerant JSON-object extraction: strips ```json fences and takes the
// outermost balanced {...} span so commentary around the object survives.
export function extractJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}

export function parseStoryboard(text) {
  const json = typeof text === "string" ? extractJsonObject(text) : null;
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && Array.isArray(parsed.scenes) ? parsed : null;
  } catch {
    return null;
  }
}

// A storyboard draft supplied with the plan (approved/edited at the plan
// card) is executed as a pure pass-through — zero LLM calls, zero credits.
export function storyboardDraftFromParams(params) {
  if (!params) return null;
  if (typeof params.storyboard === "string") return parseStoryboard(params.storyboard);
  if (params.storyboard && typeof params.storyboard === "object" && Array.isArray(params.storyboard.scenes)) {
    return params.storyboard;
  }
  return null;
}
