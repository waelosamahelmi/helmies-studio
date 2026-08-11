// Imports are RELATIVE with explicit extensions, not the "@/..." alias: the
// worker (scripts/worker.mjs, plain node) reaches this module through
// screenplay-breakdown.js, and node cannot resolve the bundler's alias.
import { llmComplete, resolveProvider } from "./providers.js";
import { estimateCredits } from "./pricing-engine.js";
import prisma from "./prisma.js";
// the id only, NOT api-error.js — that module pulls in "next/server", which
// the plain-node worker cannot resolve and does not need.
import { newErrorId } from "./error-id-core.mjs";
import { SECTION_VISUAL_STRATEGY, PRODUCTION_TYPE_PRESETS } from "./director-constants.js";

export { SECTION_VISUAL_STRATEGY, PRODUCTION_TYPE_PRESETS };

// Thrown when neither the LLM nor the heuristic builder can produce a plan
// with an iterable, non-empty `shots` array. Callers (the API route) must
// surface this as a 422 with the public message + errorId — never let it
// fall through to a generic 500. Task E2.1: the errorId now comes from the
// shared src/lib/api-error.js helper (same 8-char shape as before), and the
// route renders this through apiError() — public behavior (422 + string
// error + errorId) unchanged.
export class DirectorPlanError extends Error {
  constructor(publicMessage, errorId = newErrorId()) {
    super(publicMessage);
    this.name = "DirectorPlanError";
    this.status = 422;
    this.errorId = errorId;
    this.retryable = true;
  }
}

// E4.2: the transitions a shot may cut into the next one with — consumed by
// assembly (video-assembly.js). Anything else normalizes to a hard cut.
export const VALID_SHOT_TRANSITIONS = ["cut", "fade", "dissolve"];

// A plan is only usable downstream (estimateDirectorCost, validateShotPlan,
// the route) if `shots` is a real, non-empty array of shot objects.
export function isValidPlanShape(plan) {
  return !!plan && Array.isArray(plan.shots) && plan.shots.length > 0 &&
    plan.shots.every((s) => s && typeof s === "object" && !Array.isArray(s));
}

// The LLM is asked for raw JSON but sometimes wraps it in markdown fences,
// or prefaces/trails it with commentary. Strip fences, then take the
// outermost {...} span rather than trusting the whole string to be JSON.
export function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

// ──────────────────────────────────────────────
// 11 Prompt Policies — validation functions
// ──────────────────────────────────────────────
const PROMPT_POLICIES = {
  no_character_names_outside_dialogue: {
    description: "Use physical descriptions, not character names",
    validate(text) {
      // Names in dialogue (quoted speech) are allowed
      const withoutDialogue = text.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
      // Check for proper names that look like character names (capitalized words not at sentence start)
      const lines = withoutDialogue.split(/[.!?]\s/);
      for (const line of lines) {
        const words = line.trim().split(/\s+/);
        for (let i = 1; i < words.length; i++) {
          const w = words[i].replace(/[^a-zA-Z]/g, "");
          if (w && w[0] === w[0].toUpperCase() && w.length > 2 && !["The","This","A","An","I"].includes(w)) {
            return { valid: false, reason: `Possible character name "${w}" found outside dialogue` };
          }
        }
      }
      return { valid: true };
    }
  },
  dialogue_in_quotes: {
    description: 'Dialogue must be in quotes — "Hello" not Hello',
    validate(text) {
      // Check for dialogue-like patterns without quotes
      const dialoguePattern = /(?:says|said|saying|shouts|whispers|mutters|asks)\s+([A-Z][^.,!?"']*[.,!?])/g;
      let match;
      while ((match = dialoguePattern.exec(text)) !== null) {
        return { valid: false, reason: `Dialogue not in quotes: "${match[1].trim()}"` };
      }
      return { valid: true };
    }
  },
  chronological_action: {
    description: "Describe actions in chronological order",
    validate(text) {
      // Heuristic: check for time-jump words that might indicate non-linear description
      const flashbackWords = /\b(?:earlier|before that|previously|meanwhile|simultaneously|at the same time)\b/gi;
      // These aren't necessarily invalid, just flag for review
      if (flashbackWords.test(text)) {
        return { valid: true, warning: "Contains potential non-chronological markers" };
      }
      return { valid: true };
    }
  },
  single_paragraph: {
    description: "No multi-paragraph prompts per shot",
    validate(text) {
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
      if (paragraphs.length > 1) {
        return { valid: false, reason: `Prompt contains ${paragraphs.length} paragraphs — use single paragraph` };
      }
      return { valid: true };
    }
  },
  present_tense: {
    description: "Use present tense — 'walks' not 'walked'",
    validate(text) {
      const pastTenseVerbs = /\b(?:walked|ran|stood|looked|turned|moved|sat|held|spoke|said|appeared|seemed|was|were)\b/gi;
      const matches = text.match(pastTenseVerbs);
      if (matches && matches.length > 2) {
        return { valid: false, reason: `Found past-tense verbs: ${matches.slice(0, 3).join(", ")}` };
      }
      return { valid: true };
    }
  },
  no_montage_language: {
    description: 'No "cut to", "montage", "series of shots" in single-clip prompts',
    validate(text) {
      const montageWords = /\b(?:cut to|montage|series of shots|dissolve to|fade to|wipe to|jump cut|match cut|smash cut|crossfade)\b/gi;
      if (montageWords.test(text)) {
        return { valid: false, reason: "Contains montage/edit language — describe single continuous shot" };
      }
      return { valid: true };
    }
  },
  physical_emotion_only: {
    description: 'No abstract emotions — replace "feeling happy" with physical cues',
    validate(text) {
      const abstractEmotions = /\b(?:feeling happy|feeling sad|feeling angry|feeling excited|feeling nervous|feeling confident|feeling scared|experiencing joy|overcome with emotion|filled with rage|bursting with happiness)\b/gi;
      if (abstractEmotions.test(text)) {
        return { valid: false, reason: "Contains abstract emotion — describe physical cues instead (smiling, relaxed posture, clenched fists)" };
      }
      return { valid: true };
    }
  },
  explicit_camera_language: {
    description: 'No "cinematic camera" — use specific lens/framing/movement',
    validate(text) {
      // Only flag if camera is mentioned but is vague
      const vagueCamera = /\b(?:cinematic camera|movie-like shot|film look|professional camera)\b/gi;
      if (vagueCamera.test(text)) {
        return { valid: false, reason: 'Vague camera language — use specific terms like "24mm wide, slow dolly in"' };
      }
      return { valid: true };
    }
  },
  re_describe_characters_every_shot: {
    description: "Every shot reintroduces characters with physical descriptions",
    validate(text) {
      // This is a structural check — the planner must ensure this
      // Here we just check if there's NO physical description at all
      const hasPhysicalDesc = /(?:tall|short|wearing|dressed in|hair|beard|glasses|tattoo|build|athletic|slender|muscular|outfit|clothing)\b/i;
      if (!hasPhysicalDesc.test(text)) {
        return { valid: true, warning: "No explicit physical character description found — ensure character is described" };
      }
      return { valid: true };
    }
  },
  no_meta_language_in_image_prompts: {
    description: 'No "preserve", "maintain", "keep" in image prompts',
    validate(text) {
      const metaWords = /\b(?:preserve|maintain|keep|retain|continue|stay consistent|same as before|as shown|as described)\b/gi;
      if (metaWords.test(text)) {
        return { valid: false, reason: `Contains meta-language — describe what IS there, not what to "preserve"` };
      }
      return { valid: true };
    }
  },
  no_action_in_image_prompts: {
    description: 'No action verbs in still image prompts — no "walks", "runs"',
    validate(text) {
      const actionVerbs = /\b(?:walks|runs|jumps|dances|flies|swims|moves|turns|crosses|crawls|leaps|sprints|strolls|paces|dashes)\b/gi;
      if (actionVerbs.test(text)) {
        return { valid: false, reason: `Contains action verbs in image prompt — describe a static pose, not motion` };
      }
      return { valid: true };
    }
  }
};

export function getPromptPolicies() {
  return Object.entries(PROMPT_POLICIES).map(([key, policy]) => ({
    key,
    description: policy.description
  }));
}

export function validatePrompt(text, policies = Object.keys(PROMPT_POLICIES)) {
  const results = [];
  for (const policyKey of policies) {
    const policy = PROMPT_POLICIES[policyKey];
    if (!policy) continue;
    const result = policy.validate(text);
    results.push({ policy: policyKey, ...result });
  }
  const violations = results.filter(r => !r.valid);
  return {
    valid: violations.length === 0,
    violations,
    warnings: results.filter(r => r.warning).map(r => ({ policy: r.policy, warning: r.warning })),
    all: results
  };
}

export function validateShotPlan(shot) {
  const results = [];
  if (shot.imageStrategy?.prompt) {
    results.push({
      field: "imagePrompt",
      ...validatePrompt(shot.imageStrategy.prompt, [
        "no_meta_language_in_image_prompts",
        "no_action_in_image_prompts",
        "no_character_names_outside_dialogue",
        "present_tense",
        "no_montage_language",
        "single_paragraph"
      ])
    });
  }
  if (shot.videoStrategy?.prompt) {
    results.push({
      field: "videoPrompt",
      ...validatePrompt(shot.videoStrategy.prompt, [
        "no_character_names_outside_dialogue",
        "dialogue_in_quotes",
        "chronological_action",
        "single_paragraph",
        "present_tense",
        "no_montage_language",
        "physical_emotion_only",
        "explicit_camera_language",
        "re_describe_characters_every_shot"
      ])
    });
  }
  return {
    valid: results.every(r => r.valid),
    results
  };
}

// E4.3: token-safe identifier for a character name, mirroring
// director-executor.js's characterSlug (a deliberate 2-line duplicate — the
// executor already imports from this module, so importing back would create
// a cycle). "$CHARACTER_<slug>" in imageStrategy.references is resolved by
// the executor to the character's uploaded reference image, or to the
// rolling reference seeded by the first completed shot containing them.
function characterToken(name) {
  const slug = String(name || "").trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? `$CHARACTER_${slug}` : null;
}

// ──────────────────────────────────────────────
// LLM System Prompt for Director Orchestrator
// ──────────────────────────────────────────────
function buildSystemPrompt(productionType, sectionStrategy, characters = []) {
  const strategyDesc = Object.entries(sectionStrategy)
    .map(([section, strat]) =>
      `  ${section}: ${strat.camera.framing}, ${strat.camera.angle}, ${strat.camera.lens}, ${strat.camera.movement} (${strat.camera.intensity} intensity). ${strat.notes}`
    )
    .join("\n");

  const cast = (characters || []).filter((c) => c?.name && characterToken(c.name));
  const referencesContract = cast.length
    ? `"references": ["$CHARACTER_<name> tokens for the characters in this shot — e.g. ${characterToken(cast[0].name)}"]`
    : `"references": []`;
  const castRules = cast.length
    ? `\nCHARACTER TOKENS (image-anchored consistency):\n${cast
        .map((c) => `  ${characterToken(c.name)} — "${c.name}": ${c.description || "no description"}`)
        .join("\n")}\nInclude each character's token in imageStrategy.references for EVERY shot that character appears in. Tokens resolve to real reference images at generation time. Still re-describe the character physically in the prompt text — the token anchors identity, the words anchor the pose.`
    : "";

  return `You are Helmies Studio's Director Agent. You create detailed multi-shot video production plans.

PRODUCTION TYPE: ${productionType}

You MUST output a single valid JSON object with this exact structure:
{
  "shots": [
    {
      "index": 0,
      "title": "Shot name",
      "durationSec": 5,
      "section": "intro|verse|chorus|bridge|outro|instrumental|dialogue|action",
      "narrativeRole": "What this shot accomplishes narratively",
      "sceneGoal": "The visual goal of this shot",
      "subjects": [{"role": "performer|character|product|environment", "description": "the woman in the red dress"}],
      "environment": "Detailed location description",
      "spatialSetup": "Where subjects are in frame",
      "lighting": "Lighting description — direction, quality, color temp",
      "mood": "Visual mood and atmosphere",
      "camera": {
        "framing": "Specific framing — wide establishing, medium shot, close-up, extreme close-up, over-shoulder, POV, etc.",
        "angle": "Specific angle — eye-level, low angle, high angle, dutch tilt, top-down, etc.",
        "lens": "Specific lens — 24mm wide, 35mm, 50mm, 85mm, 100mm macro, 14mm ultrawide, etc.",
        "movement": "Specific movement — static locked, subtle push-in, dolly left, crane up, handheld float, whip pan, tracking, etc.",
        "intensity": "static|subtle|moderate|dynamic|intense"
      },
      "imageStrategy": {
        "mode": "generate",
        "prompt": "Static image description — NO action verbs, NO meta-language, present tense, physical descriptions only",
        ${referencesContract}
      },
      "videoStrategy": {
        "mode": "t2v",
        "prompt": "15-40 word video description — present tense, explicit camera language, physical emotion only",
        "modelRoute": "wan-2.6",
        "keyframes": [],
        "windows": []
      },
      "audio": null,
      "transition": "cut|fade|dissolve — how this shot cuts INTO the next shot (applied at assembly)",
      "dialogue": "the spoken line for this shot in quotes, or null when nobody speaks",
      "audioCues": "sound design notes for this shot (e.g. rain on glass, distant sirens), or null",
      "continuity": ["character identity consistent with shot N-1", "outfit match", "environment match"],
      "continuityTracker": {
        "characterIdentity": "same person as previous shot — describe physically",
        "outfit": "same outfit as previous shot — describe it",
        "productIdentity": "same product appearance — describe it, or null",
        "environment": "same location/setting — describe it",
        "lighting": "matching light direction/quality — describe it",
        "timeOfDay": "consistent or intentional progression",
        "screenDirection": "180-degree rule — eye-line matches previous shot",
        "previousEndingFrame": "describe how this shot starts where the previous ended, or 'first shot'",
        "cameraLanguage": "consistent lens/framing vocabulary with previous shots"
      }
    }
  ],
  "globalStyle": {
    "visualStyle": "Overall visual direction",
    "colorPalette": "Color treatment",
    "pace": "slow|moderate|fast|dynamic",
    "transition": "cut|fade|dissolve|whip"
  },
  "estimatedDuration": 60,
  "conceptSummary": "Brief summary of the production concept"
}

SECTION-BASED CAMERA STRATEGY (apply these defaults per section):
${strategyDesc}
${castRules}
CRITICAL RULES:
1. Every shot is independent — re-describe all characters, environment, and lighting in every shot
2. NO character names in prompts — use physical descriptors ("the woman in red", "the guitarist")
3. NO montage language — each shot is a single continuous clip. No "cut to", "montage", "series of shots"
4. Present tense only — "walks" not "walked", "stands" not "stood"
5. Physical emotion only — "smiling, relaxed posture" not "feeling happy"
6. Explicit camera language — "24mm wide, slow dolly in" not "cinematic camera"
7. Image prompts must be STATIC — no action verbs. Describe a pose, not motion
8. Image prompts must NOT use meta-language — no "preserve", "maintain", "keep"
9. Video prompts: 15-40 words, music-driven, performance-driven
10. Dialogue MUST be in quotes — "Hello there" not Hello there
11. Single paragraph per prompt — no multi-paragraph descriptions
12. keyframe_prompts default to EMPTY — the video model handles motion/camera/expressions
13. Continuity must be EXPLICIT — note what carries over from previous shots
14. Use the section's default camera strategy as a starting point, then adapt creatively
15. No hallucinated unrelated scenes — stay on concept
16. continuityTracker MUST be filled for every shot — it is explicit data, not LLM-guessed. For shot 0, use "first shot" / "establishing" where appropriate
17. previousEndingFrame: shot N must visually start where shot N-1 ended (e.g. "starts on the close-up of the coffee cup, pulls back to reveal the cafe")
18. Re-describe characters physically in continuityTracker.characterIdentity every shot — never assume the model remembers
19. transition is per shot ("cut" unless a fade/dissolve serves the edit); dialogue and audioCues are null unless the shot genuinely calls for them

OUTPUT ONLY VALID JSON — no markdown, no explanation outside the JSON object.`;
}

// ──────────────────────────────────────────────
// Build user prompt for the LLM
// ──────────────────────────────────────────────
function buildUserPrompt(brief) {
  const parts = [`PRODUCTION TITLE: ${brief.title || "Untitled"}`];
  parts.push(`TYPE: ${brief.type || "music_video"}`);
  parts.push(`TARGET DURATION: ${brief.duration || 60} seconds`);
  parts.push(`PLATFORM: ${brief.platform || "instagram"}`);
  parts.push(`ASPECT RATIO: ${brief.aspectRatio || "9:16"}`);

  if (brief.concept) {
    parts.push(`\nCREATIVE CONCEPT:\n${brief.concept}`);
  }

  if (brief.characters?.length) {
    parts.push(`\nCHARACTERS:\n${brief.characters.map((c, i) =>
      `${i + 1}. ${c.name ? `"${c.name}" — ` : ""}${c.description || c}`).join("\n")}`);
  }

  if (brief.style) {
    parts.push(`\nVISUAL STYLE PREFERENCE: ${brief.style}`);
  }

  if (brief.mood) {
    parts.push(`\nMOOD / TONE: ${brief.mood}`);
  }

  if (brief.references?.length) {
    parts.push(`\nREFERENCE IMAGES: ${brief.references.length} reference(s) provided — use as visual ground truth for consistent character, lighting, and aesthetic`);
  }

  // E4.1: the user's pre-plan sketched outline. The plan route has always
  // sent `shots`, but nothing here ever read it — the sketch silently never
  // reached the LLM. It is a binding constraint, not a suggestion.
  if (brief.shots?.length) {
    parts.push(`\nUSER'S SHOT OUTLINE (follow this structure — keep the order, expand each sketch into a full shot):`);
    for (const s of brief.shots) {
      const title = s.title || `Shot ${(s.index ?? 0) + 1}`;
      parts.push(`  ${(s.index ?? 0) + 1}. ${title}${s.description ? ` — ${s.description}` : ""}`);
    }
  }

  if (brief.sections?.length) {
    parts.push(`\nSONG STRUCTURE / SCENE BREAKDOWN:`);
    for (const s of brief.sections) {
      parts.push(`  [${s.start || 0}s - ${s.end || 0}s] ${s.label || s.section}${s.lyrics ? `: "${s.lyrics.slice(0, 80)}"` : ""}${s.bpm ? ` (${s.bpm} BPM)` : ""}`);
    }
  }

  if (brief.brandKit) {
    parts.push(`\nBRAND CONTEXT: Apply brand guidelines — palette: ${JSON.stringify(brief.brandKit.palette)}, style: ${brief.brandKit.visualStyle || ""}`);
  }

  parts.push(`\nCreate a complete shot-by-shot production plan with ${Math.ceil((brief.duration || 60) / 5)} shots.`);
  parts.push(`Each shot should be 3-8 seconds. Total shots should fill the target duration.`);

  return parts.join("\n");
}

// ──────────────────────────────────────────────
// Heuristic plan builder (no LLM available)
// ──────────────────────────────────────────────
function buildHeuristicDirectorPlan(brief) {
  const preset = PRODUCTION_TYPE_PRESETS[brief.type] || PRODUCTION_TYPE_PRESETS.music_video;
  const duration = brief.duration || preset.defaultDuration;
  const shotsPerSection = preset.shotsPerSection;

  const shots = [];
  let index = 0;
  let runningTime = 0;

  const sectionOrder = Object.keys(shotsPerSection);

  for (const section of sectionOrder) {
    const count = shotsPerSection[section] || 1;
    const strat = preset.sectionStrategy[section] || SECTION_VISUAL_STRATEGY.verse;

    for (let i = 0; i < count; i++) {
      const shotDuration = Math.min(8, Math.max(3, Math.round(duration / (Object.values(shotsPerSection).reduce((a, b) => a + b, 0)))));
      shots.push({
        id: `shot_${String(index).padStart(3, "0")}`,
        index,
        title: `${section.charAt(0).toUpperCase() + section.slice(1)} ${i + 1}`,
        durationSec: shotDuration,
        section,
        narrativeRole: `Establish ${section} mood and visual identity`,
        sceneGoal: strat.notes,
        subjects: [{ role: "performer", description: brief.characters?.[0]?.description || "the performer" }],
        environment: brief.concept?.slice(0, 100) || "atmospheric setting",
        spatialSetup: "Subject centered or rule-of-thirds",
        lighting: "Dramatic directional lighting, warm key, cool rim",
        mood: strat.energy,
        camera: {
          framing: strat.camera.framing,
          angle: strat.camera.angle,
          lens: strat.camera.lens,
          movement: strat.camera.movement,
          intensity: strat.camera.intensity
        },
        imageStrategy: {
          mode: "generate",
          prompt: `${strat.camera.framing} of ${brief.characters?.[0]?.description || "the subject"}, ${strat.notes.toLowerCase()}, ${strat.camera.angle}, ${strat.camera.lens}`,
          // E4.3: named characters ride along as $CHARACTER_<name> tokens —
          // the executor anchors them to an uploaded or rolling reference.
          references: [
            ...(brief.references || []),
            ...(brief.characters || []).map((c) => characterToken(c?.name)).filter(Boolean),
          ]
        },
        videoStrategy: {
          mode: "t2v",
          prompt: `${strat.camera.framing}, ${strat.camera.movement}, ${strat.camera.angle} with ${strat.camera.lens}. ${strat.energy}. ${strat.notes.toLowerCase()}.`,
          modelRoute: preset.defaultModelVideo,
          keyframes: [],
          windows: []
        },
        audio: brief.type === "music_video" ? null : undefined,
        // E4.2: same shape the LLM contract emits — the heuristic path must
        // never produce a structurally poorer plan than the LLM path.
        transition: "cut",
        dialogue: null,
        audioCues: null,
        continuity: index > 0 ? [`Character consistent with shot ${index - 1}`, "Environment match", "Lighting continuity"] : ["Establishing shot — sets baseline"],
        continuityTracker: {
          characterIdentity: brief.characters?.[0]?.description || "the performer — same person throughout",
          outfit: index === 0 ? "establishing" : "same outfit as previous shot",
          productIdentity: null,
          environment: brief.concept?.slice(0, 100) || "same setting throughout",
          lighting: "dramatic directional lighting, warm key, cool rim — consistent",
          timeOfDay: "consistent",
          screenDirection: "180-degree rule maintained",
          previousEndingFrame: index === 0 ? "first shot" : `continues from shot ${index}`,
          cameraLanguage: `${strat.camera.lens}, ${strat.camera.framing} vocabulary`,
        }
      });
      runningTime += shotDuration;
      index++;
    }
  }

  return {
    shots,
    globalStyle: {
      visualStyle: brief.style || "Cinematic, high contrast, premium",
      colorPalette: "Warm amber and deep teal, filmic grade",
      pace: brief.type === "music_video" ? "dynamic" : "moderate",
      transition: "cut"
    },
    estimatedDuration: runningTime,
    conceptSummary: brief.concept || `A ${PRODUCTION_TYPE_PRESETS[brief.type]?.label || "production"} — ${brief.title || "Untitled"}`
  };
}

// ──────────────────────────────────────────────
// Cost estimation for a ProductionPlan
// ──────────────────────────────────────────────
export async function estimateDirectorCost(plan, brief) {
  const preset = PRODUCTION_TYPE_PRESETS[brief?.type] || PRODUCTION_TYPE_PRESETS.music_video;
  const imageModel = brief?.modelImage || preset.defaultModelImage;
  const videoModel = brief?.modelVideo || preset.defaultModelVideo;
  const audioModel = brief?.modelAudio || preset.defaultModelAudio;

  let totalCredits = 0;
  const shotCosts = [];

  for (const shot of plan.shots) {
    const imageCost = await estimateCredits("image", imageModel, {}).catch(() => 2);
    const videoCost = await estimateCredits("video", videoModel, { duration: shot.durationSec }).catch(() => 10);
    const audioCost = brief?.type === "music_video" || plan.shots.length <= 1
      ? await estimateCredits("audio", audioModel, { duration: shot.durationSec }).catch(() => 5)
      : 0;

    const shotTotal = imageCost + videoCost + audioCost;
    totalCredits += shotTotal;

    shotCosts.push({
      shotId: shot.id,
      shotIndex: shot.index,
      costs: { image: imageCost, video: videoCost, audio: audioCost },
      total: shotTotal
    });
  }

  // Assembly cost
  const assemblyCost = plan.shots.length > 1 ? 5 : 0;
  totalCredits += assemblyCost;

  return {
    totalCredits,
    assemblyCost,
    shotCosts,
    models: { image: imageModel, video: videoModel, audio: audioModel },
    shotCount: plan.shots.length
  };
}

// Turn a parsed LLM JSON payload into the canonical plan shape (fills in
// every field with a safe default so a partial/odd LLM shot never breaks
// a downstream consumer that expects the full shape).
function normalizePlanFromLLM(parsed, preset, brief) {
  return {
    shots: (parsed.shots || []).map((shot, i) => ({
      id: shot.id || `shot_${String(i).padStart(3, "0")}`,
      index: shot.index ?? i,
      title: shot.title || `Shot ${i + 1}`,
      durationSec: shot.durationSec || 5,
      section: shot.section || "verse",
      narrativeRole: shot.narrativeRole || "",
      sceneGoal: shot.sceneGoal || "",
      subjects: shot.subjects || [],
      environment: shot.environment || "",
      spatialSetup: shot.spatialSetup || "",
      lighting: shot.lighting || "",
      mood: shot.mood || "",
      camera: {
        framing: shot.camera?.framing || "medium shot",
        angle: shot.camera?.angle || "eye-level",
        lens: shot.camera?.lens || "35mm",
        movement: shot.camera?.movement || "static",
        intensity: shot.camera?.intensity || "subtle"
      },
      imageStrategy: {
        mode: shot.imageStrategy?.mode || "generate",
        prompt: shot.imageStrategy?.prompt || "",
        references: shot.imageStrategy?.references || []
      },
      videoStrategy: {
        mode: shot.videoStrategy?.mode || "t2v",
        prompt: shot.videoStrategy?.prompt || "",
        modelRoute: shot.videoStrategy?.modelRoute || preset.defaultModelVideo,
        keyframes: shot.videoStrategy?.keyframes || [],
        windows: shot.videoStrategy?.windows || []
      },
      audio: shot.audio || null,
      // E4.2: per-shot editorial fields. `transition` is how this shot cuts
      // INTO the next (consumed by assembly); unknown values fall back to a
      // hard cut rather than surprising the editor later.
      transition: VALID_SHOT_TRANSITIONS.includes(shot.transition) ? shot.transition : "cut",
      dialogue: typeof shot.dialogue === "string" && shot.dialogue.trim() ? shot.dialogue : null,
      audioCues: Array.isArray(shot.audioCues)
        ? (shot.audioCues.filter(Boolean).join(", ") || null)
        : (typeof shot.audioCues === "string" && shot.audioCues.trim() ? shot.audioCues : null),
      continuity: shot.continuity || [],
      continuityTracker: shot.continuityTracker || {
        characterIdentity: "not specified",
        outfit: "not specified",
        productIdentity: null,
        environment: "not specified",
        lighting: "not specified",
        timeOfDay: "not specified",
        screenDirection: "not specified",
        previousEndingFrame: shot.index === 0 ? "first shot" : "not specified",
        cameraLanguage: "not specified",
      }
    })),
    globalStyle: parsed.globalStyle || {
      visualStyle: brief.style || "Cinematic",
      colorPalette: "Warm and moody",
      pace: "moderate",
      transition: "cut"
    },
    estimatedDuration: parsed.estimatedDuration || (parsed.shots || []).reduce((sum, s) => sum + (s.durationSec || 5), 0) || 60,
    conceptSummary: parsed.conceptSummary || brief.concept || "Production plan"
  };
}

// One request/parse attempt at an LLM plan. Throws on any failure (network,
// non-JSON response, empty {...} span) — the caller decides whether to
// retry, fall back, or give up.
async function requestLLMPlan(systemPrompt, userPrompt, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: options.retryHint ? `${userPrompt}\n\n${options.retryHint}` : userPrompt
    }
  ];

  const response = await llmComplete(messages, {
    maxTokens: 4096,
    temperature: options.retryHint ? 0.2 : 0.4,
    model: "deepseek/deepseek-v4-flash"
  });

  const jsonText = extractJsonObject(response);
  if (!jsonText) throw new Error("LLM response did not contain a JSON object");
  return JSON.parse(jsonText);
}

// ──────────────────────────────────────────────
// MAIN: Create a ProductionPlan from a brief
// ──────────────────────────────────────────────
export async function createProductionPlan(brief, userId) {
  const preset = PRODUCTION_TYPE_PRESETS[brief.type] || PRODUCTION_TYPE_PRESETS.music_video;
  const sectionStrategy = preset.sectionStrategy;

  const hasLLM = process.env.OPENROUTER_KEY;
  let plan = null;
  let lastError = null;

  if (hasLLM) {
    const systemPrompt = buildSystemPrompt(preset.label, sectionStrategy, brief.characters);
    const userPrompt = buildUserPrompt(brief);

    let parsed = null;
    try {
      parsed = await requestLLMPlan(systemPrompt, userPrompt);
    } catch (err) {
      console.error("[DirectorPlanner] LLM plan failed, retrying once:", err.message);
      lastError = err;
      try {
        parsed = await requestLLMPlan(systemPrompt, userPrompt, {
          retryHint: "Your previous reply was not valid JSON. Reply with ONLY a single valid JSON object — no markdown fences, no commentary before or after it."
        });
      } catch (retryErr) {
        console.error("[DirectorPlanner] LLM plan retry failed, using heuristic:", retryErr.message);
        lastError = retryErr;
      }
    }

    if (parsed) {
      try {
        plan = normalizePlanFromLLM(parsed, preset, brief);
      } catch (normErr) {
        console.error("[DirectorPlanner] LLM plan had an unusable shape, using heuristic:", normErr.message);
        lastError = normErr;
        plan = null;
      }
    }
  }

  if (!isValidPlanShape(plan)) {
    try {
      plan = buildHeuristicDirectorPlan(brief);
    } catch (heuristicErr) {
      lastError = heuristicErr;
      plan = null;
    }
  }

  if (!isValidPlanShape(plan)) {
    const errorId = newErrorId();
    console.error(`[DirectorPlanner] [${errorId}] Could not produce a valid production plan for brief type "${brief?.type}":`, lastError);
    throw new DirectorPlanError(
      "We couldn't generate a production plan for this brief. Please try again in a moment, or simplify the request.",
      errorId
    );
  }

  // Run validators on all shots
  const validationResults = plan.shots.map(shot => ({
    shotId: shot.id,
    ...validateShotPlan(shot)
  }));

  const allValid = validationResults.every(r => r.valid);

  // Calculate cost
  const costEstimate = await estimateDirectorCost(plan, brief);

  // Persist to database
  const pipeline = await prisma.directorPipeline.create({
    data: {
      userId,
      title: brief.title || "Untitled Production",
      type: brief.type || "music_video",
      status: "planning",
      plan: plan,
      brief: brief,
      costEstimate: costEstimate,
      validationResults: validationResults
    }
  });

  return {
    pipelineId: pipeline.id,
    plan,
    costEstimate,
    validation: { allValid, results: validationResults },
    status: "planning",
    createdAt: pipeline.createdAt
  };
}

// ──────────────────────────────────────────────
// Get existing production plan
// ──────────────────────────────────────────────
export async function getProductionPlan(pipelineId, userId) {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) return null;
  return pipeline;
}

// ──────────────────────────────────────────────
// Update a production plan (edit shots)
// ──────────────────────────────────────────────
export async function updateProductionPlan(pipelineId, userId, updates) {
  const pipeline = await prisma.directorPipeline.findFirst({
    where: { id: pipelineId, userId }
  });
  if (!pipeline) throw new Error("Pipeline not found");
  if (pipeline.status === "executing" || pipeline.status === "completed") {
    throw new Error("Cannot edit plan in current state: " + pipeline.status);
  }

  const currentPlan = pipeline.plan || {};
  const newPlan = {
    ...currentPlan,
    ...updates,
    shots: updates.shots || currentPlan.shots
  };

  if (!isValidPlanShape(newPlan)) {
    throw new Error("Cannot edit plan: the edited plan has no shots");
  }

  // Re-index after edits so reorder/duplicate/delete keep index === position —
  // the executor and cost estimator both key shotCosts by shot.index.
  newPlan.shots = newPlan.shots.map((shot, i) => ({ ...shot, index: i }));

  const costEstimate = await estimateDirectorCost(newPlan, pipeline.brief || {});

  // E4.1: re-run the shot validators on every edit — edited prompts get the
  // same 11-policy validation a fresh plan gets, and the stored
  // validationResults never go stale relative to the stored plan.
  const validationResults = newPlan.shots.map(shot => ({
    shotId: shot.id,
    ...validateShotPlan(shot)
  }));

  await prisma.directorPipeline.update({
    where: { id: pipelineId },
    data: {
      plan: newPlan,
      costEstimate,
      validationResults
    }
  });

  return {
    pipelineId,
    plan: newPlan,
    costEstimate,
    validation: { allValid: validationResults.every(r => r.valid), results: validationResults },
    status: pipeline.status
  };
}
