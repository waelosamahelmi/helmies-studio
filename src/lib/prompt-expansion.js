import { llmComplete } from "@/lib/providers";

const MODEL_TEMPLATES = {
  image: {
    system: `You are a prompt engineer for AI image generation. Expand the user's brief prompt into a detailed, vivid description optimized for high-quality image generation. Include:
- Subject and composition details
- Lighting (golden hour, studio, dramatic, soft)
- Camera angle and lens (wide, macro, drone, portrait)
- Style cues (photorealistic, cinematic, editorial, illustration)
- Color palette and mood
- Quality tags (highly detailed, 8K, sharp focus)

Keep the expanded prompt under 300 words. Do NOT add negative prompts. Output ONLY the expanded prompt text, nothing else.`,
  },
  video: {
    system: `You are a prompt engineer for AI video generation. Expand the user's brief prompt into a detailed, cinematic description optimized for video generation. Include:
- Camera movement (pan, dolly, tracking, drone flyover)
- Subject action and motion
- Scene atmosphere and lighting
- Cinematography language (shallow depth of field, slow motion, time-lapse)
- Duration-appropriate pacing
- Mood and tone

Keep the expanded prompt under 200 words. Output ONLY the expanded prompt text, nothing else.`,
  },
  audio: {
    system: `You are a prompt engineer for AI audio/music generation. Expand the user's brief prompt into a detailed description optimized for music or sound generation. Include:
- Genre and subgenre
- Instrumentation (piano, synth, orchestral, drums)
- Tempo and energy level
- Mood and emotional arc
- Production style (lo-fi, polished, ambient, aggressive)
- Reference vibes (without naming specific songs)

Keep the expanded prompt under 150 words. Output ONLY the expanded prompt text, nothing else.`,
  },
};

/* Per-FAMILY guidance, matched against the live model id.
   ────────────────────────────────────────────────────────────────────────
   This was a table keyed by exact id — "flux-dev", "kling-v3", "veo-3",
   "wan-2.6", "seedance-2.0" — and not one of those is an id the catalog
   holds, so the lookup missed every time and every model silently got the
   generic template. The guidance was never the problem; the keys were.

   A family is matched by pattern because ids are the provider's routes and
   there are many per family (kling-2.6/text-to-video, kling/v3-turbo-…,
   kling-3.0/video). `type` keeps a family's VIDEO advice off its image
   models: wan/2-7-image is a still. The Midjourney and Sora guides are gone —
   the studio has never offered either, and a guide for a model that cannot
   be picked is a claim about the catalog that is not true.
   tests/unit/hardcoded-model-ids.test.mjs checks every family still matches
   at least one active model. */
export const FAMILY_TEMPLATES = [
  {
    family: "flux",
    type: "image",
    // generate-or-edit-image is Flux Kontext's route (image-payload-core.mjs).
    match: /(^|[^a-z])flux|^generate-or-edit-image$/,
    system: `You are a prompt engineer for Flux image generation. Flux excels at photorealistic and cinematic imagery. Expand the user's prompt with:
- Precise subject description and positioning
- Natural lighting conditions (golden hour, overcast, studio)
- Camera specs (aperture, focal length, lens type)
- Photographic style (editorial, street, fine art)
- Environmental details and atmosphere
Keep under 250 words. Output ONLY the expanded prompt.`,
  },
  {
    family: "kling",
    type: "video",
    match: /(^|[^a-z])kling/,
    system: `You are a prompt engineer for Kling video generation. Kling excels at cinematic motion. Expand the user's prompt with:
- Camera movement and speed
- Subject motion and choreography
- Scene transitions
- Lighting changes over time
- Cinematic references
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  {
    family: "veo",
    type: "video",
    match: /(^|[^a-z])veo/,
    system: `You are a prompt engineer for Veo 3 video generation. Veo excels at realistic motion and physics. Expand the user's prompt with:
- Realistic physics and motion
- Natural lighting progression
- Subject detail and texture
- Environmental context
- Temporal progression
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  {
    family: "wan",
    type: "video",
    match: /^wan\//,
    system: `You are a prompt engineer for Wan video generation. Wan excels at dynamic action and visual effects. Expand the user's prompt with:
- Dynamic motion and action
- Visual effects and particles
- Dramatic lighting and contrast
- Speed and intensity
- Atmospheric elements
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  {
    family: "seedance",
    type: "video",
    // bytedance/v1-* is Seedance V1: the vendor folder carries no brand.
    match: /seedance|^bytedance\/v1-/,
    system: `You are a prompt engineer for Seedance video generation. Seedance excels at smooth, fluid motion. Expand the user's prompt with:
- Fluid, continuous motion
- Smooth camera movements
- Subject grace and flow
- Ambient atmosphere
- Rhythmic pacing
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
];

/** The family guide for this model, or null. A Wan or Flux id of the OTHER
    media type gets null and therefore the generic template for its type. */
export function familyTemplateFor(modelId, type) {
  const id = String(modelId || "").toLowerCase();
  if (!id) return null;
  return FAMILY_TEMPLATES.find((t) => t.type === type && t.match.test(id)) || null;
}

const NEGATIVE_PROMPTS = {
  image: "low quality, blurry, distorted, deformed, watermark, text overlay, jpeg artifacts, oversaturated, cropped, out of frame",
  video: "low quality, blurry, distorted, watermark, text overlay, flickering, artifacts, stuttering motion",
  audio: "distortion, clipping, noise, artifacts, low quality",
};

export async function expandPrompt(rawPrompt, type = "image", modelId = null) {
  if (!rawPrompt || rawPrompt.trim().length < 5) return rawPrompt;

  const wordCount = rawPrompt.trim().split(/\s+/).length;
  if (wordCount >= 30) return rawPrompt;

  const template = familyTemplateFor(modelId, type) || MODEL_TEMPLATES[type];
  if (!template) return rawPrompt;

  try {
    const expanded = await llmComplete(
      [
        { role: "system", content: template.system },
        { role: "user", content: rawPrompt },
      ],
      { maxTokens: 500, temperature: 0.7 }
    );

    const clean = expanded.replace(/^["']|["']$/g, "").trim();
    return clean.length > 10 ? clean : rawPrompt;
  } catch {
    return rawPrompt;
  }
}

export function getNegativePrompt(type = "image") {
  return NEGATIVE_PROMPTS[type] || "";
}

export function shouldExpand(rawPrompt) {
  if (!rawPrompt) return false;
  const wordCount = rawPrompt.trim().split(/\s+/).length;
  return wordCount < 30;
}
