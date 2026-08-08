// TWO PASSES, NOT ONE (task 9).
//
// Reading a whole screenplay in a single reply is unstable in exactly the
// way that matters. The SAME script produced 37 shots on one run and 17 on
// the next, with five conversation scenes collapsed to a single shot each —
// 92 lines of dialogue across 17 shots. Nothing was broken; the model was
// running out of room and compressing, and every field added to the shot
// shape (props, performance) made it compress harder. A feature-length
// script truncates outright.
//
// So: one pass reads the STRUCTURE — who is in it, where it happens, which
// objects recur, what the scenes are — and then one pass per SCENE reads
// that scene's shots with the structure as context. Each reply is small,
// none competes with the others for room, and coverage becomes checkable
// scene by scene instead of hoped for.
//
// Pure and worker-safe: the prompts and the parsing live here, the calling
// and retrying lives in the route.
import { extractJsonObject } from "./storyboard-core.mjs";

export const STRUCTURE_SYSTEM_PROMPT = `You are a first assistant director reading a screenplay for the first time.

Do NOT break it into shots. Read it for what the production needs to EXIST: who is in it, where it happens, which objects recur, and what the scenes are.

Rules that matter:
- A character who appears under different names but is played by the SAME face (a double, a younger self, a reflection, "OTHER <NAME>") is ONE entry, with the alternate names in "aliases" and the differences in "variants". Splitting one face into two characters is the most expensive mistake here.
- "props" are objects that must look the same every time they appear — a phone, a pillow, a wall clock, a chair somebody sits in twice. An object the script keeps returning to and nobody tracks is an object that changes shape between cuts. Do not list scenery that is part of the room, or something seen only once.
- Every scene in the script gets an entry, in order. Never merge two, never skip one.
- "toneReferences" is the visual grade and the films it should feel like.

Reply with ONLY one valid JSON object — no fences, no commentary:
{"title":"<film title>","logline":"<one sentence>","toneReferences":"<visual references / grade / mood>","aspectRatio":"16:9|9:16|2.39:1","characters":[{"key":"<slug>","name":"<name>","aliases":["<other names for the same face>"],"description":"<physical description a model can render>","variants":[{"name":"<variant name>","differences":"<wardrobe/lighting/demeanour>"}]}],"environments":[{"key":"<slug>","name":"<name>","description":"<what the space looks like>","lighting":"<lighting>"}],"props":[{"key":"<slug>","name":"<name>","description":"<what it looks like, specifically enough to recognise again>"}],"scenes":[{"id":1,"heading":"<INT./EXT. LOCATION - TIME>","summary":"<what happens>","environmentKey":"<environments[].key>"}]}`;

export const SCENE_SHOTS_SYSTEM_PROMPT = `You are a first assistant director shooting ONE scene of a screenplay you have already read.

You are given the production's cast, places and props, and the text of a single scene. Return the shots for THAT SCENE ONLY.

Rules that matter:
- COVERAGE IS NOT OPTIONAL. Every line of spoken dialogue in this scene appears exactly once, verbatim, across your shots. You are breaking the scene down, not summarising it. A conversation of twenty lines is not one shot.
{{PACING_RULES}}
{{DURATION_RULES}}
- "characters" means WHO IS VISIBLE. Someone only heard (O.S., V.O.) goes in "offscreenVoices".
- Every shot with a visible character sets "characterVariant" to one of that character's declared variant names.
- Every dialogue line names its "speaker" AND its "speakerVariant". For a film where one actor plays two versions of himself, this is the only thing telling us who is talking.
- "props" lists which of the production's props are visible in this shot, by key.
- "performance" is the direction you would give an actor for THIS shot: what the face and body are doing, and the state underneath it. A script that says "his expression is blank" is telling you what a camera sees, not what the man is - write the state ("hollowed out, awake for hours, going through the motions"). Required on every shot with a visible character.
- "type" is exactly one of: establishing, wide, medium, closeup, extreme_closeup, insert, over_shoulder, pov - and must match your own description.
- "continuity.follows" is for an unbroken continuous movement where the frame literally carries over. Cutting between angles is a new frame, not a continuation.
- Be concrete and visual in "description": it becomes the prompt verbatim. Name the framing, the light, and what moves.

Reply with ONLY one valid JSON object - no fences, no commentary:
{"shots":[{"id":"s<sceneId>_1","description":"<visual description, becomes the prompt>","type":"medium","durationSec":6,"characters":["<visible character keys>"],"offscreenVoices":["<heard-not-seen keys>"],"characterVariant":"<declared variant name>","props":["<prop keys visible here>"],"performance":"<the actor's direction for this shot>","dialogue":[{"speaker":"<character key>","speakerVariant":"<variant>","line":"<spoken words>"}],"continuity":{"follows":"<shot id or null>"},"sfx":["<sound>"],"notes":""}]}`;

/** The scene prompt, written for the model this project renders on. */
export function sceneShotsPrompt(limits) {
  return SCENE_SHOTS_SYSTEM_PROMPT
    .replace("{{PACING_RULES}}", pacingRules(limits))
    .replace("{{DURATION_RULES}}", durationRules(limits));
}

export const SCENE_COVERAGE_RETRY_HINT =
  "That scene has more spoken lines than your shots account for. Return the shots for the SAME scene again, this time with every line of dialogue present exactly once and verbatim. Add shots rather than lengthening them.";

/**
 * Split a screenplay into its scenes so each can be read on its own.
 *
 * Boundaries are slug lines (INT./EXT.) or numbered SCENE headers — the two
 * ways scripts in the wild mark a scene. Anything before the first boundary
 * (a title page, a logline) belongs to no scene and is dropped.
 */
export function splitScenes(script) {
  const lines = String(script || "").split(/\r?\n/);
  const isHeading = (l) => /^\s*(?:#+\s*)?(?:INT\.|EXT\.|INT\/EXT|SCENE\s+\d+)/i.test(l);

  const out = [];
  let current = null;
  for (const line of lines) {
    if (isHeading(line)) {
      if (current) out.push(current);
      current = { heading: line.trim().replace(/^#+\s*/, ""), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) out.push(current);

  return out.map((s, i) => ({
    index: i,
    heading: s.heading,
    text: `${s.heading}\n${s.body.join("\n")}`.trim(),
  }));
}

const parseJson = (text) => {
  const json = typeof text === "string" ? extractJsonObject(text) : null;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const parseStructureReply = (text) => {
  const parsed = parseJson(text);
  if (!parsed || !Array.isArray(parsed.scenes) || !parsed.scenes.length) return null;
  return parsed;
};

/* The shot-length rules, written from the model the project will actually
   render on. Handed to the prompt so the reading matches the shooting: a
   model that holds thirty seconds should be given thirty seconds of the
   script, and a conversation plays out in one take rather than five. */
/* How often to cut, which follows from how long a take can be. A model
   that holds thirty seconds does not want a cut every six. */
export function pacingRules({ max = 10 } = {}) {
  if (max >= 20) {
    return `- Cut only when the FRAMING has to change — a reveal, a reaction that needs to fill the frame, a move to another part of the room. A whole exchange of dialogue in one sustained take is correct here, and better than three short ones.`;
  }
  return `- Aim for roughly one shot per 6-8 seconds of screen time, and cut on who is speaking and on what changes. Two people talking is a shot every exchange or two, not one wide held for a minute.`;
}

export function durationRules({ min = 4, max = 10 } = {}) {
  if (max >= 20) {
    return `- Shot duration: minimum ${min} seconds, maximum ${max}. This production's video model can hold ${max} seconds in ONE take, so let a shot RUN — a whole exchange of dialogue, an entire beat, a complete action — rather than cutting every few seconds. Fewer, longer shots is better here: every cut is another generation and another chance for the room to change. Only cut when the framing genuinely has to change.`;
  }
  return `- Shot duration: minimum ${min} seconds, maximum ${max}. Video models bill a fixed clip length, so never write a shot shorter than ${min} seconds; fold a short beat into its neighbour.`;
}

export const parseSceneShotsReply = (text) => {
  const parsed = parseJson(text);
  const shots = parsed && Array.isArray(parsed.shots) ? parsed.shots : null;
  return shots && shots.length ? shots : null;
};

/* How many spoken lines a scene's TEXT contains, so a scene that comes
   back with a fraction of them can be caught and re-read rather than
   silently shipping a summary. Counts a speaker cue followed by a line —
   the only structure every screenplay shares. */
export function countScriptDialogue(sceneText) {
  const lines = String(sceneText || "").split(/\r?\n/).map((l) => l.trim());
  let count = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const cue = lines[i];
    const next = lines[i + 1];
    if (!cue || !next) continue;
    // A cue is short, upper case, and not a slug line or a transition.
    if (!/^[A-Z][A-Z0-9 .'()#-]{1,38}$/.test(cue)) continue;
    if (/^(INT|EXT|CUT TO|FADE|SCENE|MONTAGE|BLACK|TICK|STEP|SWIPE|SILENCE)/i.test(cue)) continue;
    if (/^[A-Z][A-Z0-9 .'()#-]{1,38}$/.test(next)) continue; // two cues in a row is not dialogue
    count++;
  }
  return count;
}

/** How many lines a set of returned shots actually accounts for. */
export function countShotDialogue(shots = []) {
  return shots.reduce((total, s) => total + (Array.isArray(s?.dialogue) ? s.dialogue.length : 0), 0);
}

/**
 * Did this scene come back covered?
 *
 * Deliberately a RATIO, not equality: a cue-counting heuristic over free
 * text will never match a model's reading exactly, and demanding it would
 * retry forever on scenes that are actually fine. Missing a third of the
 * lines is not a rounding difference — it is a summary.
 */
export function sceneIsCovered(sceneText, shots, { minRatio = 0.7 } = {}) {
  const wanted = countScriptDialogue(sceneText);
  if (wanted < 3) return true; // too few to judge; action scenes have none
  const got = countShotDialogue(shots);
  return got >= Math.ceil(wanted * minRatio);
}
