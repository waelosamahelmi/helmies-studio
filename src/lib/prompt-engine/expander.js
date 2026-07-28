// Pass 2 — Creative Expansion
// Spec §29. Add useful detail (lighting, camera, style, mood) when the prompt
// is sparse. NEVER silently alter immutable facts: product names, exact
// slogans, exact counts, logos, specified colors, supplied identity.
//
// This pass subsumes the old `prompt-expansion.js` expandPrompt but is aware
// of normalized intent + context so it doesn't strip brand facts.

import { llmComplete } from "@/lib/providers";
import { MODEL_FAMILY } from "./dialect-compiler";

const IMMUTABLE_GUARD = `CRITICAL RULES:
- NEVER change or remove any quoted text, product name, slogan, brand color, count of people, or supplied identity. Treat them as immutable.
- ONLY ADD descriptive detail (lighting, camera, style, mood, atmosphere, composition) that is missing.
- If the user gave specific colors, keep them. If brand context is provided, honour it.
- Output ONLY the expanded prompt text, nothing else. No preamble, no labels.`;

const TOOL_EXPANSION = {
  image: `Expand into a vivid image prompt. Add if missing: subject positioning, lighting (e.g. golden hour, studio, dramatic), camera (lens, angle), style cues, color palette, mood, quality tags. Keep under 250 words.`,
  video: `Expand into a cinematic video prompt. Add if missing: camera movement (dolly, tracking, drone), subject motion, scene atmosphere, lighting over time, cinematography (shallow DOF, slow-mo), pacing. Keep under 150 words.`,
  audio: `Expand into an audio/music prompt. Add if missing: genre, instrumentation, tempo, energy, mood arc, production style. Keep under 120 words.`,
  lipsync: `Keep minimal. Preserve identity. Add only subtle expression/motion cues if missing. Keep under 60 words.`,
  recast: `Keep minimal. Preserve identity of the reference face. Describe only the target scene/wardrobe if missing. Keep under 60 words.`,
};

export async function creativeExpansion(state) {
  const raw = state.rawPrompt || "";
  const wordCount = raw.trim().split(/\s+/).filter(Boolean).length;

  // Short prompts benefit from expansion; long ones are already detailed.
  if (wordCount >= 30) {
    state.expandedPrompt = raw;
    return state;
  }

  const family = MODEL_FAMILY(state.tool, state.modelId);
  const toolGuide = TOOL_EXPANSION[state.tool] || TOOL_EXPANSION.image;
  const ctx = state.enrichedContext || {};

  // Build a context block with only relevant signals.
  const ctxBits = [];
  if (ctx.brand?.photographyStyle) ctxBits.push(`Brand photography style: ${ctx.brand.photographyStyle}`);
  if (ctx.brand?.toneOfVoice) ctxBits.push(`Brand tone: ${ctx.brand.toneOfVoice}`);
  if (ctx.brand?.palette?.primary) ctxBits.push(`Brand colors: ${(ctx.brand.palette.primary || []).join(", ")}`);
  if (ctx.brand?.avoid) ctxBits.push(`Avoid: ${(ctx.brand.avoid || []).join(", ")}`);
  if (ctx.character?.physicalDescription) ctxBits.push(`Character: ${ctx.character.physicalDescription}`);
  if (ctx.visual?.lighting) ctxBits.push(`Reference lighting: ${JSON.stringify(ctx.visual.lighting)}`);
  if (ctx.canvas?.instructions?.length) ctxBits.push(`Canvas instructions: ${ctx.canvas.instructions.join("; ")}`);

  const userContent = ctxBits.length
    ? `Context:\n${ctxBits.join("\n")}\n\nBrief: ${raw}`
    : raw;

  try {
    const expanded = await llmComplete(
      [
        { role: "system", content: `${toolGuide}\n\n${IMMUTABLE_GUARD}` },
        { role: "user", content: userContent },
      ],
      { maxTokens: 500, temperature: 0.7 }
    );
    const clean = expanded.replace(/^["']|["']$/g, "").trim();
    state.expandedPrompt = clean.length > 10 ? clean : raw;
  } catch {
    state.expandedPrompt = raw;
  }

  return state;
}