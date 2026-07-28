// Helmies Studio — Prompt Intelligence Engine
// Spec §26 (5-pass pipeline):
//   RAW INTENT → NORMALIZER → CONTEXT ENRICHMENT → CREATIVE EXPANSION
//                → MODEL DIALECT COMPILER → DETERMINISTIC VALIDATOR
//                → OPTIONAL POLISH → FINAL REQUEST
//
// Each pass is a pure async function that takes a `PromptState` and returns a
// new `PromptState`. The orchestrator (`compilePrompt`) chains them. Every
// compilation is recorded (caller writes a PromptCompilation row with the
// guideVersion used) so generations are reproducible and auditable.

import { normalizeIntent } from "./normalizer";
import { enrichContext } from "./enricher";
import { creativeExpansion } from "./expander";
import { compileDialect } from "./dialect-compiler";
import { validate } from "./validator";
import { premiumPolish } from "./polish";

/**
 * @typedef {Object} PromptInput
 * @property {string} rawPrompt          - the user's literal text
 * @property {string} tool               - image | video | i2i | i2v | v2v | audio | lipsync | recast | director
 * @property {string} modelId            - model id from the registry
 * @property {object} [settings]         - aspect, duration, resolution, etc.
 * @property {object} [references]       - [{ url, role }]
 * @property {object} [canvas]           - compiled canvas document (optional)
 * @property {object} [brandKit]         - brand fingerprint (optional)
 * @property {object} [project]          - project context (optional)
 * @property {object} [visualAnalysis]   - pre-computed analysis of references
 * @property {object} [character]        - ProjectMemory character/persona
 * @property {object} [previousAsset]    - approved prior asset for consistency
 * @property {"off"|"fast"|"balanced"|"premium"} [polish="off"]
 * @property {string} [userId]           - for recording compilation
 */

/**
 * @typedef {Object} PromptState
 * The mutable object passed through each pass. Each pass reads + writes fields.
 */

/**
 * Run the full 5-pass prompt pipeline.
 * @param {PromptInput} input
 * @returns {Promise<{ state: PromptState, finalPrompt: string, negativePrompt: string, warnings: string[], guideVersion: number|null }>}
 */
export async function compilePrompt(input) {
  let state = {
    rawPrompt: input.rawPrompt || "",
    tool: input.tool,
    modelId: input.modelId,
    settings: input.settings || {},
    references: input.references || [],
    canvas: input.canvas || null,
    brandKit: input.brandKit || null,
    project: input.project || null,
    visualAnalysis: input.visualAnalysis || null,
    character: input.character || null,
    previousAsset: input.previousAsset || null,
    polish: input.polish || "off",
    userId: input.userId || null,

    // populated pass-by-pass
    normalized: null,
    enrichedContext: null,
    expandedPrompt: null,
    dialectPrompt: null,
    negativePrompt: "",
    warnings: [],
    guideVersion: null,
  };

  // Pass 0 — Intent Normalization
  state = await normalizeIntent(state);

  // Pass 1 — Context Enrichment
  state = await enrichContext(state);

  // Pass 2 — Creative Expansion
  state = await creativeExpansion(state);

  // Pass 3 — Model Dialect Compilation
  state = await compileDialect(state);

  // Pass 4 — Deterministic Validation
  state = validate(state);

  // Pass 5 — Optional Premium Polish
  state = await premiumPolish(state);

  return {
    state,
    finalPrompt: state.dialectPrompt || state.expandedPrompt || state.rawPrompt,
    negativePrompt: state.negativePrompt,
    warnings: state.warnings,
    guideVersion: state.guideVersion,
  };
}

// Re-export the low-level helpers for direct use (e.g. Prompt Inspector UI)
export { normalizeIntent } from "./normalizer";
export { enrichContext } from "./enricher";
export { creativeExpansion } from "./expander";
export { compileDialect } from "./dialect-compiler";
export { validate } from "./validator";
export { premiumPolish } from "./polish";