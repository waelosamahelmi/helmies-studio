// Pass 5 — Optional Premium Polish
// Spec §32. Modes: off | fast | balanced | premium.
// For expensive jobs, an additional LLM reviews the final prompt quality.
// Off = no-op. Fast = single quick pass. Balanced = one pass with context.
// Premium = two passes (review + rewrite) and longer reasoning budget.

import { llmComplete } from "@/lib/providers";

const POLISH_SYSTEM = `You are a prompt quality reviewer for AI media generation. Improve the given prompt for clarity, specificity, and model-friendliness WITHOUT changing any immutable facts (quoted text, product names, slogans, colors, counts, identities). Preserve the model dialect. Output ONLY the improved prompt, nothing else.`;

export async function premiumPolish(state) {
  if (!state.polish || state.polish === "off") return state;

  const prompt = state.dialectPrompt || state.expandedPrompt || state.rawPrompt;
  if (!prompt || prompt.length < 5) return state;

  const ctx = state.enrichedContext || {};
  const ctxBits = [];
  if (ctx.brand?.name) ctxBits.push(`Brand: ${ctx.brand.name}`);
  if (ctx.brand?.photographyStyle) ctxBits.push(`Style: ${ctx.brand.photographyStyle}`);
  if (ctx.visual?.lighting) ctxBits.push(`Reference lighting: ${JSON.stringify(ctx.visual.lighting)}`);

  const maxTokens = state.polish === "premium" ? 800 : state.polish === "balanced" ? 600 : 300;
  const temperature = state.polish === "premium" ? 0.5 : 0.4;

  const userContent = ctxBits.length
    ? `Context:\n${ctxBits.join("\n")}\n\nPrompt to improve:\n${prompt}`
    : `Prompt to improve:\n${prompt}`;

  try {
    let improved = await llmComplete(
      [
        { role: "system", content: POLISH_SYSTEM },
        { role: "user", content: userContent },
      ],
      { maxTokens, temperature }
    );
    improved = improved.replace(/^["']|["']$/g, "").trim();

    if (state.polish === "premium" && improved.length > 10) {
      // Second pass: tighten
      improved = await llmComplete(
        [
          { role: "system", content: `${POLISH_SYSTEM}\nTighten and remove redundancy. Keep it concise and impactful.` },
          { role: "user", content: improved },
        ],
        { maxTokens: maxTokens / 2, temperature: 0.3 }
      );
      improved = improved.replace(/^["']|["']$/g, "").trim();
    }

    if (improved.length > 10) {
      state.dialectPrompt = improved;
      state.polished = true;
    }
  } catch {
    // polish is best-effort; never block generation
  }

  return state;
}