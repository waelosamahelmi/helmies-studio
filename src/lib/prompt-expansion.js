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

const PER_MODEL_TEMPLATES = {
  "flux-dev": {
    system: `You are a prompt engineer for Flux image generation. Flux excels at photorealistic and cinematic imagery. Expand the user's prompt with:
- Precise subject description and positioning
- Natural lighting conditions (golden hour, overcast, studio)
- Camera specs (aperture, focal length, lens type)
- Photographic style (editorial, street, fine art)
- Environmental details and atmosphere
Keep under 250 words. Output ONLY the expanded prompt.`,
  },
  "midjourney-v7-text-to-image": {
    system: `You are a prompt engineer for Midjourney. Midjourney responds best to evocative, artistic language. Expand the user's prompt with:
- Artistic style and movement references
- Mood and emotional tone
- Composition and framing
- Color theory and palette
- Texture and material qualities
Use Midjourney-friendly syntax (commas, no periods). Keep under 200 words. Output ONLY the expanded prompt.`,
  },
  "kling-v3": {
    system: `You are a prompt engineer for Kling video generation. Kling excels at cinematic motion. Expand the user's prompt with:
- Camera movement and speed
- Subject motion and choreography
- Scene transitions
- Lighting changes over time
- Cinematic references
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  "sora-2": {
    system: `You are a prompt engineer for Sora 2 video generation. Sora excels at complex scenes with multiple subjects. Expand the user's prompt with:
- Detailed scene description
- Multiple subject interactions
- Environmental dynamics (weather, time of day)
- Camera perspective and movement
- Narrative arc within the clip
Keep under 200 words. Output ONLY the expanded prompt.`,
  },
  "veo-3": {
    system: `You are a prompt engineer for Veo 3 video generation. Veo excels at realistic motion and physics. Expand the user's prompt with:
- Realistic physics and motion
- Natural lighting progression
- Subject detail and texture
- Environmental context
- Temporal progression
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  "wan-2.6": {
    system: `You are a prompt engineer for Wan video generation. Wan excels at dynamic action and visual effects. Expand the user's prompt with:
- Dynamic motion and action
- Visual effects and particles
- Dramatic lighting and contrast
- Speed and intensity
- Atmospheric elements
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
  "seedance-2.0": {
    system: `You are a prompt engineer for Seedance video generation. Seedance excels at smooth, fluid motion. Expand the user's prompt with:
- Fluid, continuous motion
- Smooth camera movements
- Subject grace and flow
- Ambient atmosphere
- Rhythmic pacing
Keep under 150 words. Output ONLY the expanded prompt.`,
  },
};

const NEGATIVE_PROMPTS = {
  image: "low quality, blurry, distorted, deformed, watermark, text overlay, jpeg artifacts, oversaturated, cropped, out of frame",
  video: "low quality, blurry, distorted, watermark, text overlay, flickering, artifacts, stuttering motion",
  audio: "distortion, clipping, noise, artifacts, low quality",
};

export async function expandPrompt(rawPrompt, type = "image", modelId = null) {
  if (!rawPrompt || rawPrompt.trim().length < 5) return rawPrompt;

  const wordCount = rawPrompt.trim().split(/\s+/).length;
  if (wordCount >= 30) return rawPrompt;

  const template = (modelId && PER_MODEL_TEMPLATES[modelId]) || MODEL_TEMPLATES[type];
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
