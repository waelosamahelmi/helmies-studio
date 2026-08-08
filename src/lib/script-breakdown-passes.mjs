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
- A VARIANT'S "differences" is a WARDROBE LINE AND NOTHING ELSE. Write only what the person is wearing on their body: garments and their colours, glasses or none, beard or clean-shaven, hair wet or dry. When two versions of one person share a frame this is the only thing that lets an audience tell them apart — the face is deliberately identical, so the wardrobe cannot be. Three things it must never be, because each one has ruined a film already: never "same clothing as the other" or any wording that makes two versions match; never where they are or what they are doing ("lying in bed", "seated", "walking") — this text is pasted into EVERY shot that person appears in, so a posture in it puts them in the wrong position in every frame; never a mood alone ("calm and knowing") — a camera cannot photograph knowing. Good: "grey marl t-shirt, unshaven, no glasses" and "black buttoned shirt, thin wire glasses, clean-shaven".
- "props" are objects that must look the same every time they appear — a phone, a pillow, a wall clock, a chair somebody sits in twice. An object the script keeps returning to and nobody tracks is an object that changes shape between cuts. Do not list scenery that is part of the room, or something seen only once.
- Every scene in the script gets an entry, in order. Never merge two, never skip one.
- "toneReferences" is the visual grade and the films it should feel like.

Reply with ONLY one valid JSON object — no fences, no commentary:
{"title":"<film title>","logline":"<one sentence>","toneReferences":"<visual references / grade / mood>","aspectRatio":"16:9|9:16|2.39:1","characters":[{"key":"<slug>","name":"<name>","aliases":["<other names for the same face>"],"description":"<physical description a model can render>","variants":[{"name":"<variant name>","differences":"<wardrobe/lighting/demeanour>"}]}],"environments":[{"key":"<slug>","name":"<name>","description":"<what the space looks like>","lighting":"<lighting>"}],"props":[{"key":"<slug>","name":"<name>","description":"<what it looks like, specifically enough to recognise again>"}],"scenes":[{"id":1,"heading":"<INT./EXT. LOCATION - TIME>","summary":"<what happens>","environmentKey":"<environments[].key>"}]}`;

export const SCENE_SHOTS_SYSTEM_PROMPT = `You are a first assistant director shooting ONE scene of a screenplay you have already read.

You are given the production's cast, places and props, and the text of a single scene. Return the shots for THAT SCENE ONLY.

Rules that matter:
- COVERAGE IS NOT OPTIONAL. Every line of spoken dialogue in this scene appears exactly once, verbatim, across your shots. You are breaking the scene down, not summarising it. A conversation of twenty lines is not one shot.
- COVER THE ACTION TOO, not only the dialogue. Every thing the script says HAPPENS — a walk, a turn, a door, a voice arriving from off-screen, an object picked up — belongs to some shot. A beat the script wrote and no shot contains is a beat that will not be in the film.
{{BEAT_RULE}}
{{MONTAGE_RULE}}
{{BLOCKING_RULE}}
- WHEN TWO VERSIONS OF ONE CHARACTER SHARE A FRAME, say so explicitly in the description and name what each is wearing: "two men with the same face, one in <X>, the other in <Y>". Their faces are identical on purpose; if the description does not separate them by clothing, the shot renders the same man twice.
{{PACING_RULES}}
{{DURATION_RULES}}
- "characters" means WHO IS VISIBLE. Someone only heard (O.S., V.O.) goes in "offscreenVoices" and NEVER in "characters", however much of the beat is theirs. A voice calling from behind someone who does not turn around is a shot of the person NOT turning around: keep the camera on the listener and let the line arrive from outside the frame. Each such line still gets its own shot — the reaction is the beat.
- Every shot with a visible character sets "characterVariant" to one of that character's declared variant names.
- Every dialogue line names its "speaker" AND its "speakerVariant". For a film where one actor plays two versions of himself, this is the only thing telling us who is talking.
- "props" lists which of the production's props are visible in this shot, by key.
- "performance" is the direction you would give an actor for THIS shot: what the face and body are doing, and the state underneath it. A script that says "his expression is blank" is telling you what a camera sees, not what the man is - write the state ("hollowed out, awake for hours, going through the motions"). Required on every shot with a visible character.
- "type" is exactly one of: establishing, wide, medium, closeup, extreme_closeup, insert, over_shoulder, pov - and must match your own description. DIRECT the scene with them: open on a wide or establishing so the audience knows where they are, go CLOSER as the scene tightens, use closeup or extreme_closeup on the line that turns the scene, over_shoulder for an exchange between two people, and insert for an object that matters (a phone, a clock, a hand). A scene shot entirely in medium is not directed, it is recorded.
- Every shot with a visible character MUST set "characterVariant". Where two versions of the same character share a frame, name the variant of the one the shot is ABOUT, and name each speaker's variant on their dialogue line — that is what tells us who is wearing what.
- "continuity.follows" is for an unbroken continuous movement where the frame literally carries over. Cutting between angles is a new frame, not a continuation.
- Be concrete and visual in "description": it becomes the prompt verbatim. Name the framing, the light, and what moves.

Reply with ONLY one valid JSON object - no fences, no commentary:
{"shots":[{"id":"s<sceneId>_1","description":"<visual description, becomes the prompt>","type":"medium","durationSec":6,"characters":["<visible character keys>"],"offscreenVoices":["<heard-not-seen keys>"],"characterVariant":"<declared variant name>","props":["<prop keys visible here>"],"performance":"<the actor's direction for this shot>","dialogue":[{"speaker":"<character key>","speakerVariant":"<variant>","line":"<spoken words>"}],"continuity":{"follows":"<shot id or null>"},"sfx":["<sound>"],"notes":""}]}`;

/** The scene prompt, written for the model this project renders on. */
export function sceneShotsPrompt(limits, budget = null) {
  return SCENE_SHOTS_SYSTEM_PROMPT
    .replace("{{BEAT_RULE}}", BEAT_RULE)
    .replace("{{MONTAGE_RULE}}", MONTAGE_RULE)
    .replace("{{BLOCKING_RULE}}", BLOCKING_RULE)
    .replace("{{PACING_RULES}}", pacingRules(limits))
    .replace(
      "{{DURATION_RULES}}",
      [durationRules(limits), budget ? budgetRule(budget) : null].filter(Boolean).join("\n"),
    );
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
  const held = max >= 20
    ? ` A take may be held up to ${max} seconds when a SINGLE action fills it — a long look, a slow approach, one unbroken exchange.`
    : "";
  return `- BE SPECIFIC AND CUT ON EVERY CHANGE. A new camera position, a new speaker, a new action, a reveal, an object that matters — each is its own shot. Precision beats economy: a scene of many exactly-specified shots renders correctly, and one of a few overloaded shots renders as mush.${held}`;
}

/* How long a shot is, decided by what happens in it.
   ────────────────────────────────────────────────────────────────────────
   The old rule said the model can hold 30 seconds, SO LET A SHOT RUN. That
   turned the model's capacity into the target: a man taking three steps
   across a room was given eight seconds, a two-word line seven, and scenes
   came out far longer than they play. Capacity is a CEILING. Nothing about
   a model that can hold thirty seconds means a three-second action wants
   thirty, and a held frame with nothing happening in it is not a long
   take — it is a short take with dead time on the end.

   Worse, it contradicted the pacing rule sitting right beneath it, which
   says cut on every change. One asked for fewer, longer shots and the
   other for a cut per beat, so the read did both: many shots, each padded.

   Length now comes from content. Speech is measurable — roughly two words
   a second at dramatic pace — and actions have anchors. */
export function durationRules({ min = 4, max = 10 } = {}) {
  return [
    `- Shot duration: minimum ${min} seconds, maximum ${max}. The maximum is a CEILING, NOT A TARGET — a model that can hold ${max} seconds does not want ${max} seconds of a three-second action.`,
    "- LENGTH COMES FROM WHAT HAPPENS, not from what the model can hold. Work it out rather than guessing:",
    "  · Dialogue: about TWO WORDS PER SECOND at dramatic pace, plus a second either side to breathe. \"Not tonight.\" is two words — that shot is 4 seconds, not 8.",
    "  · A look, a reaction, a realisation landing: 3-5 seconds.",
    "  · Someone crossing a room, sitting down, turning around: 4-6 seconds.",
    "  · A held silence the script explicitly calls for: as long as the script implies, and say in the description that it is held.",
    `- Only go past 15 seconds when ONE continuous thing genuinely fills it — an unbroken exchange of several lines, or a single long approach. Padding a shot to reach ${max} adds dead frames at the end, which read as the clip freezing.`,
  ].join("\n");
}

/* A rush of fragments is ONE shot, not one shot per fragment.
   ────────────────────────────────────────────────────────────────────────
   "ONE SHOT IS ONE BEAT" split a montage of memory flashes — hallway,
   woman turning, hands, rain, mirror — into eight separate four-second
   clips. Each rendered as a calm little scene of its own, which is the
   opposite of a montage: the flashing IS the beat, and cutting it into
   eight generations both costs eight times as much and removes the only
   thing that made it work. */
export const MONTAGE_RULE = `- A MONTAGE OR A RUSH OF FLASHES IS ONE SHOT. When the script calls for a rapid series of fragmentary images — a memory flood, a dream, intercut flashes with no dialogue — write ONE shot whose description lists the images in order and says how fast they come ("a rapid series of flashes, each under a second: a hallway, a woman turning, hands almost touching, rain on glass"). The flashing is the beat. Splitting it into one shot per image renders eight calm little scenes instead of a montage, and costs eight generations to do it.`;

/* Where everyone and everything physically IS.
   ────────────────────────────────────────────────────────────────────────
   Two chairs facing each other, one occupied, one empty, and a man walking
   toward them: shot to shot the chairs moved, changed number, and both men
   ended up in the same one. Every shot is generated independently and knows
   only its own description, so an arrangement the script fixes has to be
   restated in each of them or it is re-invented each time. */
export const BLOCKING_RULE = `- STATE THE PHYSICAL ARRANGEMENT IN EVERY SHOT, IDENTICALLY. When the script fixes how a space is laid out — how many chairs, where they are, which one is empty, who is in which — repeat that arrangement word for word in every shot of the scene, and say where the camera is relative to it. Each shot is generated on its own and knows nothing about the others: "two chairs" in one and "the chairs" in the next produces a different number of chairs. Name who occupies which chair every time, and never let a shot imply someone moved unless the script says they did.`;

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

/* ── How many shots a scene should come back with ─────────────────────────
   "Let a shot run" is advice, and advice gets applied to some scenes and
   not others: the same read gave one two-hander 30-second takes and
   another twenty-two shots of four seconds. Same room, same kind of
   scene.

   That inconsistency is expensive in a way that is easy to miss. Video
   models bill a FLAT RATE per clip — 143 credits whether the clip is four
   seconds or thirty — so a scene cut into twenty-two shots costs four
   times the same scene in five takes, and every extra cut is another
   chance for the room to change.

   So the budget is computed and stated as a number. A ceiling the model
   can be measured against beats an adjective it can interpret away. */

/** Roughly how long a scene plays, from its text. */
export function estimateSceneSeconds(sceneText) {
  const lines = String(sceneText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const spoken = countScriptDialogue(sceneText);
  // A spoken line runs about three seconds; a line of action about two.
  // Cue lines are not themselves screen time, so they are excluded.
  const action = Math.max(0, lines.length - spoken * 2 - 1);
  return Math.max(8, spoken * 3 + action * 2);
}

/**
 * The most shots a scene should need, given what one take can hold.
 *
 * Deliberately generous — a ceiling, not a target. It exists to catch a
 * scene chopped into four-second fragments, not to force an arbitrary
 * rhythm on a director who has a reason to cut.
 */
export function shotBudget(sceneText, { max = 10 } = {}) {
  const seconds = estimateSceneSeconds(sceneText);
  // Assume a take averages two thirds of the ceiling: nobody writes every
  // shot at the maximum.
  const perTake = Math.max(4, Math.round(max * 0.66));
  const ideal = Math.max(1, Math.ceil(seconds / perTake));
  // Room for coverage — a reverse, an insert, a reaction.
  return { seconds, perTake, ideal, ceiling: Math.max(3, Math.ceil(ideal * 1.6)) };
}

/* Guidance, NOT a ceiling.

   An earlier version made this a hard limit and retried any scene that
   exceeded it. That was the wrong instinct: it optimised for cost and
   produced a twenty-eight-second shot carrying eight separate events,
   which rendered as none of them. A wrong thirty-second clip costs
   exactly what a wrong five-second clip costs and loses the whole scene.

   THE BEAT COUNT DECIDES HOW MANY SHOTS THERE ARE. This only says how
   long each may be held. */
export function budgetRule(budget) {
  return `- For scale: this scene runs roughly ${budget.seconds} seconds of screen time. Let the beats decide how many shots that is — do not compress two beats into one to hit a number, and do not cut a beat in half to make more. A take may run up to its maximum when ONE action genuinely fills it.`;
}

/* ONE SHOT IS ONE BEAT.

   This is the rule that was missing, and its absence produced a
   twenty-eight-second shot asking for: an empty chair, an occupied chair,
   a man at the edge of darkness, him walking, footsteps, a woman's voice
   from behind, him stopping, and a line of dialogue. A video model given
   eight events renders an average of them — both chairs occupied, no
   woman, no walk. Every beat WAS in the prompt; none of it was in the
   clip.

   Length and content are different axes. A thirty-second take is one
   action HELD for thirty seconds, not six actions compressed into it. */
export const BEAT_RULE = `- ONE SHOT IS ONE BEAT, whatever its length. A shot is a single continuous action seen from one camera position: a man walking toward a chair IS a shot; him arriving, being spoken to, and sitting down is THREE. If your description contains "then", or a second character starting to do something, or a sound arriving from off-screen, you have written more than one shot — split it. A long take means holding ONE action longer, never packing more events into it. A model handed several events at once renders an average of them and none of them properly. The ONE exception is a montage of flashes, which is a single beat made of fragments — see the montage rule below.`;

/** Did the scene come back within its budget? */
export const sceneIsWithinBudget = (shots, budget) => (shots?.length || 0) <= budget.ceiling;

export const SCENE_BUDGET_RETRY_HINT =
  "That is more shots than this scene needs. Return the SAME scene again with fewer, longer takes — hold a whole exchange in one shot instead of cutting on every line. Keep every line of dialogue; only the shot boundaries change.";

/* ── Two versions of one person must be told apart ────────────────────────
   The face is identical on purpose — that is what makes a double work, and
   the Scene 4 reveal depends on it. So the clothes are the ONLY thing an
   audience has. A structure pass that returns two variants with the same
   wardrobe, or with none, produces a two-shot of the same man twice, which
   is what happened.

   Asking nicely in the prompt was not enough, so it is checked. Three
   separate ways it came back wrong, each caught by name:

   1. "Same clothing and appearance as Wael, but calmer" — agreement with
      the letter of the request and the exact opposite of its point.
   2. "Wearing a plain t-shirt and shorts, lying in bed" — a SITUATION, not
      an appearance. The variant note is pasted into every shot the man
      appears in, so this put him in bed while he was standing in a void.
   3. "calm, knowing demeanour" — a mood. There is nothing to look at, and
      a camera cannot photograph knowing. */

// Something a viewer can actually see. Positive evidence: if none of these
// appear, the "difference" is not a difference anyone will notice.
const WARDROBE = /\b(shirt|t-?shirt|sweater|jumper|jacket|coat|blazer|hoodie|vest|waistcoat|suit|tie|trousers|pants|jeans|shorts|skirt|dress|robe|uniform|apron|scarf|hat|cap|glasses|spectacles|shoes|boots|barefoot|gloves|watch|ring|necklace|earring|collar|sleeves|buttoned|unbuttoned|beard|stubble|clean-?shaven|moustache|hair|wet|damp|bloodied|torn|creased|black|white|grey|gray|navy|olive|worn)\b/i;

// Where he is and what he is doing. True of a shot, never of a wardrobe.
const SITUATION = /\b(lying|laying|lies|sitting|seated|sits|standing|stands|walking|walks|kneeling|asleep|sleeping|awake|in bed|on the bed|in the chair|off-?screen|entering|leaving)\b/i;

// Sameness, in the words it actually used.
const SAMENESS = /\b(same|identical|unchanged|matching|no different|as the other|as (the )?(first|second)|like the other)\b/i;

export function variantProblems(characters = []) {
  const problems = [];
  for (const c of characters || []) {
    const variants = Array.isArray(c.variants) ? c.variants : [];
    // Only a character who appears as more than one version needs telling
    // apart. One version has nothing to be confused with.
    const needsDistinction = variants.length > 1 || (c.aliases || []).length > 0;
    if (!needsDistinction) continue;

    if (variants.length < 2) {
      problems.push(`${c.name} appears as more than one version (${(c.aliases || []).join(", ") || "aliases"}) but has fewer than two variants.`);
      continue;
    }

    let flagged = false;
    const seen = new Set();
    for (const v of variants) {
      const text = String(v?.differences || "").trim();
      const label = `${c.name} / ${v?.name || "a variant"}`;

      if (text.length <= 8) {
        problems.push(`${label} has no visible difference described.`);
        flagged = true;
        break;
      }
      if (SAMENESS.test(text)) {
        problems.push(`${label} is described as looking the same as another version ("${text}"), which is the one thing it must not be.`);
        flagged = true;
        break;
      }
      if (SITUATION.test(text)) {
        problems.push(`${label} describes where he is or what he is doing ("${text}") instead of what he is wearing. This text is added to every shot he appears in, so it puts him in the wrong place.`);
        flagged = true;
        break;
      }
      if (!WARDROBE.test(text)) {
        problems.push(`${label} names only a mood ("${text}"). A camera cannot photograph a mood — name the garments.`);
        flagged = true;
        break;
      }
      const key = text.toLowerCase();
      if (seen.has(key)) {
        problems.push(`${c.name} has two variants wearing the same thing.`);
        flagged = true;
        break;
      }
      seen.add(key);
    }
    if (flagged) continue;
  }
  return problems;
}

export const variantsAreDistinct = (characters) => variantProblems(characters).length === 0;

export const VARIANT_RETRY_HINT = (problems) =>
  `${problems.join(" ")} When one actor plays two versions of a person, the FACE is identical on purpose — so the clothing is the only thing an audience can tell them apart by. Return the same JSON again, and make every variant's "differences" a wardrobe line and nothing else: the garments and their colours, plus something unmistakable like glasses on one and not the other. No posture, no location, no mood, and never a wording that makes two versions match. Good: "grey marl t-shirt, unshaven, no glasses" and "black buttoned shirt, thin wire glasses, clean-shaven".`;

/* ── Someone the script keeps off-screen is never put in frame ────────────
   The script writes "WOMAN (O.S.)" — off-screen. She is a voice from behind
   Wael, and the whole point of the beat is that he does not turn around. A
   read that lists her under the shot's visible characters puts her face in
   the frame, and since the production has no photograph of her it invents a
   different woman every time she appears.

   The (O.S.) and (V.O.) tags are in the screenplay, so this is read from
   the text rather than asked of the model: whoever the script marks as
   off-screen is moved out of the visible cast and into the voices, for
   every shot of that scene. */
const OFFSCREEN_CUE = /^\s*([A-Z][A-Z0-9 .'\-]{1,40}?)\s*\((?:O\.?S\.?|V\.?O\.?|OFF|OFF-?SCREEN|VOICE ?OVER)\)\s*$/;

export function offscreenSpeakers(sceneText = "") {
  const names = new Set();
  for (const line of String(sceneText).split(/\r?\n/)) {
    const m = OFFSCREEN_CUE.exec(line);
    if (m) names.add(m[1].trim().toLowerCase());
  }
  return names;
}

/** Does this character key or name refer to one of those speakers? */
const isOffscreen = (who, names) => {
  const v = String(who || "").trim().toLowerCase();
  if (!v) return false;
  if (names.has(v)) return true;
  // Keys are slugs of the name: "woman" for WOMAN, "young_woman" for YOUNG WOMAN.
  const slug = v.replace(/[_-]+/g, " ");
  return names.has(slug);
};

/**
 * Move every off-screen speaker out of each shot's visible cast.
 *
 * Returns new shots — the caller's array is untouched — and never removes
 * the line itself. The words are still spoken; the camera simply stays on
 * whoever is listening, which is what the script asked for.
 */
export function keepOffscreenOffscreen(shots = [], sceneText = "") {
  const names = offscreenSpeakers(sceneText);
  if (!names.size) return shots;
  return shots.map((shot) => {
    const visible = (shot.characters || []).filter((k) => !isOffscreen(k, names));
    if (visible.length === (shot.characters || []).length) return shot;
    const heard = (shot.characters || []).filter((k) => isOffscreen(k, names));
    return {
      ...shot,
      characters: visible,
      offscreenVoices: [...new Set([...(shot.offscreenVoices || []), ...heard])],
    };
  });
}
