// Helmies Studio — screenplay → scenes → shot boards (P1.5).
//
// The breakdown (script-breakdown.mjs) reads a screenplay the way a first
// AD does: characters, environments, scenes, and the shots inside each
// scene. Director executes a `plan` of shots. This is the join between
// them — pure, worker-safe, and tested, because it decides what every shot
// in a film is asked to render.
//
// One scene becomes one DirectorPipeline. That keeps the unit of work the
// same as the unit a person thinks in: you approve, re-shoot or re-plan a
// SCENE, not a film.

const CAMERA_BY_SHOT_TYPE = {
  establishing: { framing: "extreme wide shot", lens: "24mm", movement: "slow push in" },
  wide: { framing: "wide shot", lens: "28mm", movement: "static" },
  medium: { framing: "medium shot", lens: "35mm", movement: "static" },
  closeup: { framing: "close-up", lens: "85mm", movement: "static" },
  extreme_closeup: { framing: "extreme close-up", lens: "100mm macro", movement: "static" },
  insert: { framing: "insert shot", lens: "50mm", movement: "static" },
  over_shoulder: { framing: "over-the-shoulder shot", lens: "50mm", movement: "static" },
  pov: { framing: "point-of-view shot", lens: "35mm", movement: "handheld" },
};

const cameraFor = (type) => CAMERA_BY_SHOT_TYPE[type] || CAMERA_BY_SHOT_TYPE.medium;

/* A shot's prompt is the visual description plus the things that keep the
   film coherent between shots: where it is, how it is lit, and the tone the
   whole piece is graded to. The description alone drifts — the same room
   comes back a different room three shots later. */
export function shotPrompt(shot, { environment = null, toneReferences = "" } = {}) {
  const parts = [shot.description];
  if (environment?.description) parts.push(environment.description);
  if (environment?.lighting) parts.push(environment.lighting);
  if (toneReferences) parts.push(toneReferences);
  return parts.filter(Boolean).join(". ").replace(/\.\.+/g, ".");
}

/* Dialogue reaches the shot as text, never as part of the image prompt: a
   model handed the words draws them on the frame. */
/* Who is speaking, as a person would name them.

   A double is ONE character with two variants, and the breakdown is right
   to merge them — the reveal works precisely because both faces come from
   an identical reference set. But it means both sides of a two-hander come
   back under the same name, and a scene that reads

       Wael: Who are you?
       Wael: That's really what you came here to ask?

   tells nobody who says what. The declared variant is the distinguishing
   label, so it wins when there is one. */
export function speakerLabel(key, variant, charactersByKey = new Map()) {
  const name = charactersByKey.get(key)?.name || key || "";
  const v = typeof variant === "string" ? variant.trim() : "";
  if (!v) return name;
  if (!name) return v;
  // "Other Wael" already reads as a name; "weary" needs its base.
  return v.toLowerCase().includes(name.toLowerCase()) ? v : `${name} (${v})`;
}

export function shotDialogue(shot, charactersByKey = new Map()) {
  const lines = Array.isArray(shot.dialogue) ? shot.dialogue : [];
  if (!lines.length) return null;
  return lines
    .map((d) => {
      const who = speakerLabel(d.speaker, d.speakerVariant, charactersByKey);
      return who ? `${who}: ${d.line}` : d.line;
    })
    .filter(Boolean)
    .join("\n") || null;
}

/**
 * One breakdown scene → the `plan` a DirectorPipeline executes.
 *
 * `entityIdByKey` maps a breakdown character/environment key to a real
 * StudioEntity id. Those ids are what carry a face between shots, so a
 * shot whose characters resolve to entities records them on the shot —
 * the executor injects their reference photographs from there.
 */
export function sceneToDirectorPlan(scene, breakdown, {
  aspectRatio = "16:9",
  videoModel = null,
  entityIdByKey = new Map(),
} = {}) {
  const charactersByKey = new Map((breakdown?.characters || []).map((c) => [c.key, c]));
  const environment = (breakdown?.environments || []).find((e) => e.key === scene.environmentKey) || null;
  const tone = breakdown?.toneReferences || "";

  const shots = (scene.shots || []).map((shot, i) => {
    const camera = cameraFor(shot.type);
    const visible = (shot.characters || []).map((k) => charactersByKey.get(k)).filter(Boolean);
    // Off-screen voices are heard, not seen. Putting them in `subjects`
    // would paint someone into a frame the script deliberately keeps empty.
    const entityIds = (shot.characters || [])
      .map((k) => entityIdByKey.get(k))
      .filter(Boolean);
    const envEntityId = scene.environmentKey ? entityIdByKey.get(scene.environmentKey) : null;
    if (envEntityId) entityIds.push(envEntityId);

    const prompt = shotPrompt(shot, { environment, toneReferences: tone });

    return {
      id: shot.id || `s${scene.id}_${i + 1}`,
      index: i,
      title: shot.description?.slice(0, 80) || `Shot ${i + 1}`,
      durationSec: shot.durationSec || 5,
      section: i === 0 ? "intro" : "verse",
      narrativeRole: scene.summary || "",
      sceneGoal: scene.summary || "",
      // Named once each. The same key listed twice is a two-hander between
      // one person and their double; repeating the name tells the model
      // nothing and reads as a mistake, so the variant distinguishes them
      // when the breakdown declared one.
      subjects: [...new Set(
        (shot.characters || [])
          .map((k) => speakerLabel(k, shot.characterVariant, charactersByKey))
          .filter(Boolean),
      )],
      environment: environment?.name || scene.heading || "",
      spatialSetup: "",
      lighting: environment?.lighting || "",
      mood: tone,
      camera: { ...camera, angle: "eye-level", intensity: "subtle" },
      imageStrategy: { mode: "generate", prompt, references: [] },
      videoStrategy: {
        // Every shot starts from an approved still. That is the whole
        // reason the stills exist: a face that is right in the frame stays
        // right in the clip, and a face that is wrong is caught for the
        // price of an image instead of a video.
        mode: "i2v",
        prompt,
        modelRoute: videoModel || null,
        keyframes: [],
        windows: [],
      },
      audio: null,
      transition: "cut",
      dialogue: shotDialogue(shot, charactersByKey),
      audioCues: Array.isArray(shot.sfx) && shot.sfx.length ? shot.sfx.join(", ") : null,
      // The breakdown's continuity link is a shot id; Director's field is a
      // list. Preserved so the executor can chain from the previous frame.
      continuity: shot.continuity?.follows ? [shot.continuity.follows] : [],
      entityIds: entityIds.length ? [...new Set(entityIds)] : undefined,
      aspectRatio,
      notes: shot.notes || "",
    };
  });

  return {
    title: scene.heading || `Scene ${scene.id}`,
    aspectRatio,
    conceptSummary: scene.summary || "",
    shots,
  };
}

/** Every scene of a breakdown, as boards, in screenplay order. */
export function breakdownToScenes(breakdown, options = {}) {
  return (breakdown?.scenes || []).map((scene) => ({
    scene,
    title: scene.heading || `Scene ${scene.id}`,
    plan: sceneToDirectorPlan(scene, breakdown, options),
  }));
}

/* What the breakdown wants to exist as reusable identities. A character who
   speaks or appears in more than one scene has to be an entity — that is
   what holds their face still across the film. One-shot extras do not, and
   making them would clutter the cast with people you never look at again. */
export function castFromBreakdown(breakdown, { minAppearances = 1 } = {}) {
  const appearances = new Map();
  for (const scene of breakdown?.scenes || []) {
    for (const shot of scene.shots || []) {
      for (const key of [...(shot.characters || []), ...(shot.offscreenVoices || [])]) {
        appearances.set(key, (appearances.get(key) || 0) + 1);
      }
    }
  }
  const characters = (breakdown?.characters || [])
    .filter((c) => (appearances.get(c.key) || 0) >= minAppearances)
    .map((c) => ({
      key: c.key,
      kind: "character",
      name: c.name,
      description: c.description || "",
      appearances: appearances.get(c.key) || 0,
    }));

  const usedEnvironments = new Set((breakdown?.scenes || []).map((s) => s.environmentKey).filter(Boolean));
  const environments = (breakdown?.environments || [])
    .filter((e) => usedEnvironments.has(e.key))
    .map((e) => ({
      key: e.key,
      kind: "environment",
      name: e.name,
      description: [e.description, e.lighting].filter(Boolean).join(". "),
      appearances: (breakdown?.scenes || []).filter((s) => s.environmentKey === e.key).length,
    }));

  return [...characters, ...environments];
}

/* Matching the breakdown's people to the cast that already exists. A film
   whose lead is already built must not get a second, empty copy of him —
   that is how a face starts drifting between scenes. Matched on name and on
   the aliases the breakdown itself collected ("OTHER WAEL" is Wael's face). */
export function matchExistingEntities(wanted, existing) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const byName = new Map();
  for (const e of existing || []) {
    byName.set(`${e.kind}:${norm(e.name)}`, e);
  }
  const matched = new Map();
  const missing = [];
  for (const want of wanted) {
    const hit = byName.get(`${want.kind}:${norm(want.name)}`);
    if (hit) matched.set(want.key, hit.id);
    else missing.push(want);
  }
  return { matched, missing };
}
