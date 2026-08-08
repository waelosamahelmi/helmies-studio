// Helmies Studio — screenplay breakdown (pure, worker-safe).
//
// The storyboard step (storyboard-core.mjs) turns a ONE-LINE BRIEF into
// scenes. This module handles the other direction: the user already wrote a
// full screenplay, and we have to read it the way a first assistant director
// does — pull out who is in it, where it happens, and what each shot is —
// before a single credit is spent.
//
// The output is deliberately shot-level, not scene-level: a 2-3 minute film
// is ~25-35 shots, each of which becomes its own generation with its own
// references and its own continuity link to the shot before it.

import { extractJsonObject } from "./storyboard-core.mjs";

export const SHOT_TYPES = ["establishing", "wide", "medium", "closeup", "extreme_closeup", "insert", "over_shoulder", "pov"];

// Models write shot types the way people say them ("extreme close-up", "ECU",
// "wide shot"), not the way an enum spells them. Measured on a real run: 33 of
// 34 shots fell through to "medium", which would have sent face references to
// wide shots and body references to inserts — the type is what picks the
// reference purpose, so a silent default here is not cosmetic.
const SHOT_TYPE_ALIASES = {
  ecu: "extreme_closeup",
  xcu: "extreme_closeup",
  extreme_close_up: "extreme_closeup",
  extreme_close: "extreme_closeup",
  cu: "closeup",
  close_up: "closeup",
  close: "closeup",
  med: "medium",
  ms: "medium",
  mcu: "closeup",
  medium_close_up: "closeup",
  two_shot: "medium",
  ws: "wide",
  wide_shot: "wide",
  ls: "wide",
  long_shot: "wide",
  establishing_shot: "establishing",
  master: "establishing",
  insert_shot: "insert",
  cutaway: "insert",
  ots: "over_shoulder",
  over_the_shoulder: "over_shoulder",
  point_of_view: "pov",
};

export function normalizeShotType(raw) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  if (!key) return "medium";
  if (SHOT_TYPES.includes(key)) return key;
  if (SHOT_TYPE_ALIASES[key]) return SHOT_TYPE_ALIASES[key];
  // "extreme_closeup_of_an_eye" and friends — match the longest known type
  // that the answer starts with before giving up.
  const prefix = [...SHOT_TYPES, ...Object.keys(SHOT_TYPE_ALIASES)]
    .filter((t) => key.startsWith(t))
    .sort((a, b) => b.length - a.length)[0];
  if (prefix) return SHOT_TYPES.includes(prefix) ? prefix : SHOT_TYPE_ALIASES[prefix];
  return "medium";
}

export const SCRIPT_BREAKDOWN_SYSTEM_PROMPT = `You are a first assistant director breaking down a screenplay for an AI film production.

Read the script and produce a SHOT-LEVEL breakdown. Rules that matter:

- A character who appears under different names/versions but is played by the SAME face (a double, a younger self, a reflection, "OTHER <NAME>") must share ONE entry in "characters", with the alternate names in "aliases" and the differences in "variants". Never split one face into two characters — it is the most expensive mistake in the breakdown.
- "characters" on a shot means WHO IS VISIBLE IN FRAME. A character who is only heard (O.S., V.O., a voice on a phone) goes in "offscreenVoices" instead. Never list someone as visible just because they speak — we generate a face for everyone visible, and generating one for a voice that is never seen is wasted work.
- Every shot with a visible character MUST set "characterVariant" to one of that character's declared variant names. Never "default", never null, when somebody is on screen.
- Every line of dialogue names its "speaker" (a character key) AND its "speakerVariant" (which version of that character says it). For a film where one actor plays two versions of himself, this is the only thing telling us who is talking.
- Shot duration: minimum 4 seconds, maximum 10. Video models bill a fixed clip length — a 2-second shot costs exactly the same as a 5-second one, so never write one. If a beat is short, fold it into the neighbouring shot rather than splitting it off.
- COVERAGE IS NOT OPTIONAL. Every scene in the script gets its own entry, in order, and every line of spoken dialogue appears exactly once, verbatim. You are breaking the script down, not rewriting or shortening it: never merge two scenes, never cut a line, never paraphrase the writer's words. If the result is longer than you expected, the result is longer than you expected.
- Within that constraint, aim for roughly one shot per 6-8 seconds of runtime and let a shot hold more than one line where the coverage allows it. A 3-minute film is about 25-35 shots, not 80 — but reaching that number by dropping material is a failure, not a success.
- "type" MUST be exactly one of: establishing, wide, medium, closeup, extreme_closeup, insert, over_shoulder, pov. Choose the one that matches your own description — if you wrote "extreme close-up of an eye", the type is extreme_closeup, not medium. This drives which reference images the shot is given, so a wrong type produces a face reference for a landscape.
- "continuity.follows" is for an unbroken continuous movement where the frame literally carries over — a walk that keeps going, a slow fade, a head turn completing. Use it where the motion genuinely continues, typically runs of 2-4 shots. Do NOT chain a whole conversation together just because it happens in one room: cutting between angles is a new frame, not a continuation.
- "props" are the OBJECTS that must look the same every time they appear — a phone, a pillow, a wall clock, a chair somebody sits in twice. List them once at the top and name them per shot. An object the script keeps returning to and the breakdown does not track is an object that changes shape between cuts, because nothing is holding it still. Do not list scenery that is part of the room, and do not list something seen once and never again.
- "sfx" lists diegetic sound this shot needs. Reuse the exact same wording for a recurring sound so it can be generated once ("clock tick", not "clock tick (three times)"). "silence" is a valid entry.
- Be concrete and visual in "description": it becomes the image/video prompt verbatim. Name the framing, the light, and what moves.
- "performance" is the direction you would give an actor for THIS shot: what the face and body are doing, and the state underneath it. A script that says "his expression is blank" is telling you what a camera sees, not what the man is — write the state ("hollowed out, awake for hours, going through the motions"). Never write a mood into the character's "description": that is who they ARE, and it has to survive every scene including the ones where they are furious or frightened. Put the feeling here, one shot at a time.

Reply with ONLY one valid JSON object — no markdown fences, no commentary:
{"title":"<film title>","logline":"<one sentence>","toneReferences":"<visual references / grade / mood>","aspectRatio":"16:9|9:16|2.39:1","characters":[{"key":"<slug>","name":"<name>","aliases":["<other names for the same face>"],"description":"<physical description a model can render>","variants":[{"name":"<variant name>","differences":"<wardrobe/lighting/demeanor distinguishing this version>"}],"dialogueLineCount":0}],"environments":[{"key":"<slug>","name":"<name>","description":"<what the space looks like>","lighting":"<lighting>"}],"props":[{"key":"<slug>","name":"<name>","description":"<what the object looks like, specifically enough to recognise it again>"}],"scenes":[{"id":1,"heading":"<INT./EXT. LOCATION — TIME>","summary":"<what happens>","environmentKey":"<environments[].key>","shots":[{"id":"s1_1","description":"<visual description, becomes the prompt>","type":"wide","durationSec":6,"characters":["<visible character keys>"],"offscreenVoices":["<heard-but-not-seen character keys>"],"characterVariant":"<declared variant name>","props":["<prop keys visible in this shot>"],"performance":"<what the visible character is feeling and doing with their face and body in THIS shot — the direction an actor would be given>","dialogue":[{"speaker":"<character key>","speakerVariant":"<declared variant name>","line":"<spoken words>"}],"continuity":{"follows":"<shot id or null>"},"sfx":["<sound>"],"notes":"<anything the director should know>"}]}],"music":{"description":"<score direction>","cueSheet":[{"fromSceneId":1,"description":"<what the music does here>"}]}}`;

export const SCRIPT_BREAKDOWN_RETRY_HINT =
  "Your previous reply was not a single valid JSON object. Reply again with ONLY the JSON object — no markdown fences, no commentary.";

const asString = (v, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const asArray = (v) => (Array.isArray(v) ? v : []);

const slugify = (value, fallback) => {
  const base = asString(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || fallback;
};

// Clamp to what real video models will actually accept. A breakdown asking
// for a 30-second continuous take would otherwise sail through and only fail
// at submit time, after the user approved a quote built on it.
const MAX_SHOT_SECONDS = 10;
// Video models bill a fixed clip length; nothing shorter than this is
// cheaper, it is just shorter. Measured on the first real breakdown: 40 of
// 88 shots came back at 2-3s, every one of them priced as a full clip.
const MIN_SHOT_SECONDS = 4;
// A continuity chain is a serial dependency — each shot waits for the frame
// of the one before it. The same run produced a single 58-shot chain, which
// would have serialized the entire film and compounded drift down its whole
// length. Longer chains are split so the production can still fan out.
export const MAX_CONTINUITY_CHAIN = 5;

function normalizeCharacter(raw, index) {
  const name = asString(raw?.name, 80) || `Character ${index + 1}`;
  return {
    key: slugify(raw?.key || name, `character_${index + 1}`),
    name,
    aliases: asArray(raw?.aliases).map((a) => asString(a, 80)).filter(Boolean),
    description: asString(raw?.description),
    variants: asArray(raw?.variants)
      .map((v) => ({ name: asString(v?.name, 80), differences: asString(v?.differences, 600) }))
      .filter((v) => v.name),
    dialogueLineCount: Number.isFinite(raw?.dialogueLineCount) ? raw.dialogueLineCount : 0,
    // Filled in by the caller once the user has supplied or generated a
    // reference; the breakdown itself only reports that one is needed.
    entityId: null,
  };
}

// Resolve a claimed variant name against what the character actually
// declared. A model that answers "default" (measured on the first real run:
// 41 of 88 shots) or leaves it null must not silently produce shots where we
// cannot tell WHICH version of the character we are looking at — for a film
// built on that distinction, an unset variant is a defect, so we fall back to
// the character's first declared variant rather than to nothing.
function resolveVariant(claimed, character) {
  const declared = character?.variants || [];
  if (!declared.length) return null;
  const name = asString(claimed, 80);
  const exact = declared.find((v) => v.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact.name;
  return declared[0].name;
}

function normalizeShot(raw, sceneId, index, charactersByKey) {
  const id = slugify(raw?.id, `s${sceneId}_${index + 1}`);
  const duration = Number.isFinite(raw?.durationSec) ? raw.durationSec : 5;
  const follows = asString(raw?.continuity?.follows, 80) || null;

  const visible = asArray(raw?.characters).map((c) => slugify(c, "")).filter(Boolean);
  // Heard but not seen. Kept separate from `characters` so we never ask the
  // user for a photo of a voice, and never spend a shot's reference budget
  // on a face that is not in the frame.
  const offscreen = asArray(raw?.offscreenVoices).map((c) => slugify(c, "")).filter((c) => c && !visible.includes(c));

  const primary = charactersByKey.get(visible[0]);
  const shotVariant = visible.length ? resolveVariant(raw?.characterVariant, primary) : null;

  return {
    id,
    sceneId,
    description: asString(raw?.description),
    type: normalizeShotType(raw?.type),
    durationSec: Math.min(MAX_SHOT_SECONDS, Math.max(MIN_SHOT_SECONDS, Math.round(duration))),
    characters: visible,
    offscreenVoices: offscreen,
    characterVariant: shotVariant,
    // Objects that must survive the cut unchanged. Same idea as a face: a
    // phone nobody tracks is a different phone in the next shot.
    props: asArray(raw?.props).map((k) => slugify(k, "")).filter(Boolean),
    /* WHAT THE PERSON IS FEELING IN THIS SHOT.

       Kept apart from the character's identity on purpose. A mood written
       into an identity ("depressed") drags itself into the reference
       photographs and then into every shot the person appears in —
       including the ones where they argue, or are afraid, or finally
       stop being any of it. The identity holds what a face IS; this holds
       what it is DOING, one shot at a time.

       Without it, a screenplay about a man hollowed out renders a man
       with a blank expression, which is a different film. */
    performance: asString(raw?.performance, 240),
    dialogue: asArray(raw?.dialogue)
      .map((d) => {
        // `speaker` is the current field; `character` is accepted as the
        // older spelling so an in-flight breakdown does not lose its lines.
        const speaker = slugify(d?.speaker ?? d?.character, "");
        return {
          speaker,
          speakerVariant: resolveVariant(d?.speakerVariant, charactersByKey.get(speaker)),
          line: asString(d?.line, 600),
        };
      })
      .filter((d) => d.line),
    continuity: { follows: follows === id ? null : follows },
    sfx: asArray(raw?.sfx).map((s) => asString(s, 120)).filter(Boolean),
    notes: asString(raw?.notes, 600),
  };
}

// parseScriptBreakdown(text) -> normalized breakdown | null.
// Tolerant of fences and commentary (extractJsonObject), strict about shape:
// a breakdown with no shots is not a breakdown.
export function parseScriptBreakdown(text) {
  const json = typeof text === "string" ? extractJsonObject(text) : null;
  if (!json) return null;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.scenes)) return null;

  const characters = asArray(parsed.characters).map(normalizeCharacter);
  const environments = asArray(parsed.environments).map((raw, i) => ({
    key: slugify(raw?.key || raw?.name, `environment_${i + 1}`),
    name: asString(raw?.name, 80) || `Location ${i + 1}`,
    description: asString(raw?.description),
    lighting: asString(raw?.lighting, 600),
    entityId: null,
  }));

  // Objects that must survive the cut unchanged — a phone, a pillow, a
  // clock. Same treatment as a place: named once, referenced per shot.
  const props = asArray(parsed.props).map((raw, i) => ({
    key: slugify(raw?.key || raw?.name, `prop_${i + 1}`),
    name: asString(raw?.name, 80) || `Prop ${i + 1}`,
    description: asString(raw?.description),
    entityId: null,
  }));

  const charactersByKey = new Map(characters.map((c) => [c.key, c]));

  const scenes = parsed.scenes.map((raw, i) => {
    const sceneId = Number.isFinite(raw?.id) ? raw.id : i + 1;
    return {
      id: sceneId,
      heading: asString(raw?.heading, 200) || `SCENE ${sceneId}`,
      summary: asString(raw?.summary),
      environmentKey: slugify(raw?.environmentKey, "") || null,
      shots: asArray(raw?.shots).map((s, j) => normalizeShot(s, sceneId, j, charactersByKey)),
    };
  });

  const shotCount = scenes.reduce((a, s) => a + s.shots.length, 0);
  if (!shotCount) return null;

  return {
    title: asString(parsed.title, 200) || "Untitled",
    logline: asString(parsed.logline, 600),
    toneReferences: asString(parsed.toneReferences, 1000),
    aspectRatio: ["16:9", "9:16", "1:1", "2.39:1", "4:5"].includes(parsed.aspectRatio) ? parsed.aspectRatio : "16:9",
    characters,
    environments,
    props,
    scenes,
    music: {
      description: asString(parsed.music?.description, 1000),
      cueSheet: asArray(parsed.music?.cueSheet).map((c) => ({
        fromSceneId: Number.isFinite(c?.fromSceneId) ? c.fromSceneId : 1,
        description: asString(c?.description, 600),
      })),
    },
  };
}

// Flat shot list in execution order — the thing everything downstream (quote,
// storyboard board, shot generation) actually iterates.
export function allShots(breakdown) {
  return asArray(breakdown?.scenes).flatMap((scene) => scene.shots.map((shot) => ({ ...shot, sceneId: scene.id })));
}

// Summary the agent reads back to the user before anything is spent: what it
// found, and what it still needs from them.
export function breakdownSummary(breakdown) {
  const shots = allShots(breakdown);
  const totalSeconds = shots.reduce((a, s) => a + s.durationSec, 0);
  const speaking = new Set();
  for (const shot of shots) for (const line of shot.dialogue) speaking.add(line.speaker);

  return {
    title: breakdown?.title || "Untitled",
    sceneCount: asArray(breakdown?.scenes).length,
    shotCount: shots.length,
    totalSeconds,
    characters: asArray(breakdown?.characters).map((c) => ({
      key: c.key,
      name: c.name,
      aliases: c.aliases,
      variantCount: c.variants.length,
      speaks: speaking.has(c.key),
      // Only a character we actually SEE needs a face we can hold steady.
      // One that is merely heard (offscreenVoices) needs a voice and nothing
      // else — asking the user for their photo would be a wasted question
      // and a wasted identity pack.
      needsReference: shots.some((s) => s.characters.includes(c.key)),
      needsVoice: speaking.has(c.key) || shots.some((s) => s.offscreenVoices.includes(c.key)),
      shotCount: shots.filter((s) => s.characters.includes(c.key)).length,
      offscreenShotCount: shots.filter((s) => s.offscreenVoices.includes(c.key)).length,
    })),
    environments: asArray(breakdown?.environments).map((e) => ({ key: e.key, name: e.name })),
    dialogueLineCount: shots.reduce((a, s) => a + s.dialogue.length, 0),
    // Every distinct look we must be able to render for each character —
    // one identity pack per character, one wardrobe/lighting treatment per
    // variant.
    variantsInUse: Object.fromEntries(
      asArray(breakdown?.characters).map((c) => [
        c.key,
        [...new Set(shots.filter((s) => s.characters.includes(c.key)).map((s) => s.characterVariant).filter(Boolean))],
      ])
    ),
    needsMusic: Boolean(breakdown?.music?.description),
    sfxCues: [...new Set(shots.flatMap((s) => s.sfx))],
  };
}

// Coverage check against the SOURCE script. The breakdown is an LLM read of
// the writer's work, and across three real runs of the same script it came
// back with 88, then 34, then 23 shots — the short one having quietly merged
// six scenes into three and dropped 34 of 46 dialogue lines. Nothing in the
// JSON itself looks wrong when that happens, so the only way to catch it is
// to count the script and compare.
export function coverageWarnings(breakdown, scriptText) {
  const warnings = [];
  if (typeof scriptText !== "string" || !scriptText.trim()) return warnings;

  // Scene headings. A script commonly carries BOTH a "## SCENE 2" header and
  // the slug line under it ("### INT. THE ROOM"), so counting each pattern
  // separately would double every scene. Prefer the slug lines, which is what
  // a scene actually is, and fall back to the numbered headers.
  const slugs = scriptText.match(/^\s*(?:#+\s*)?(?:INT\.|EXT\.)/gim) || [];
  const numbered = scriptText.match(/^\s*(?:#+\s*)?SCENE\s+\d+/gim) || [];
  const headings = slugs.length ? slugs : numbered;
  const sceneCount = asArray(breakdown?.scenes).length;
  if (headings.length && sceneCount < headings.length) {
    warnings.push(
      `The script has ${headings.length} scenes but the breakdown has ${sceneCount}. Scenes were merged or dropped.`
    );
  }

  // Dialogue: a bold speaker cue followed by the line, the shape this
  // codebase's own scripts use.
  const cues = scriptText.match(/\*\*[A-Z][A-Z\s'().]{1,40}\*\*/g) || [];
  const lines = allShots(breakdown).reduce((a, s) => a + s.dialogue.length, 0);
  if (cues.length && lines < Math.floor(cues.length * 0.8)) {
    warnings.push(
      `The script has about ${cues.length} dialogue cues but the breakdown carries ${lines} lines. Dialogue was cut.`
    );
  }

  const shots = allShots(breakdown);
  const unnamed = shots.filter((s) => s.characters.length && !s.characterVariant);
  if (unnamed.length) {
    warnings.push(`${unnamed.length} shots show a character without saying which version of them it is.`);
  }

  return warnings;
}

// Continuity chains: runs of shots that must carry the frame forward. Used to
// order the DAG (a shot that follows another cannot start until that one has
// produced its last frame) and to decide where last_frame_url/first_frame_url
// get wired.
export function continuityChains(breakdown) {
  const shots = allShots(breakdown);
  const byId = new Map(shots.map((s) => [s.id, s]));
  const chains = [];
  const claimed = new Set();

  for (const shot of shots) {
    if (claimed.has(shot.id)) continue;
    // Only start a chain at a shot nothing precedes.
    if (shot.continuity.follows && byId.has(shot.continuity.follows)) continue;

    let chain = [shot.id];
    claimed.add(shot.id);
    let current = shot.id;
    for (;;) {
      const next = shots.find((s) => s.continuity.follows === current && !claimed.has(s.id));
      if (!next) break;
      // Split rather than grow without bound. A chain is a serial
      // dependency, so an over-long one both serializes the production and
      // compounds visual drift shot after shot; the break costs one hard cut
      // the editor would probably have made anyway.
      if (chain.length >= MAX_CONTINUITY_CHAIN) {
        chains.push(chain);
        chain = [];
      }
      chain.push(next.id);
      claimed.add(next.id);
      current = next.id;
    }
    if (chain.length) chains.push(chain);
  }

  // A shot whose `follows` points at a missing/cyclic id is still work that
  // has to happen — emit it as its own chain rather than dropping it.
  for (const shot of shots) {
    if (!claimed.has(shot.id)) {
      chains.push([shot.id]);
      claimed.add(shot.id);
    }
  }
  return chains;
}
