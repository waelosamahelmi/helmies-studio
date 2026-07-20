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

const NEGATIVE_PROMPTS = {
  image: "low quality, blurry, distorted, deformed, watermark, text overlay, jpeg artifacts, oversaturated, cropped, out of frame",
  video: "low quality, blurry, distorted, watermark, text overlay, flickering, artifacts, stuttering motion",
  audio: "distortion, clipping, noise, artifacts, low quality",
};

export async function expandPrompt(rawPrompt, type = "image", modelId = null) {
  if (!rawPrompt || rawPrompt.trim().length < 5) return rawPrompt;

  const wordCount = rawPrompt.trim().split(/\s+/).length;
  if (wordCount >= 30) return rawPrompt;

  const template = MODEL_TEMPLATES[type];
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
