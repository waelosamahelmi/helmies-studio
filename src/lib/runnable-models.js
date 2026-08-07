// ── Unified runnable-model resolution (Phase 0.2 / Phase G) ────────────────
// THE single place every executor (Agent runs, Director pipelines, Workflow
// steps, template steps) answers "which catalog model actually runs this
// step?". Worker-safe: relative imports only — this module is loaded by
// scripts/worker.mjs via agent-runner.js/director-runner.js, and Node's ESM
// resolver has no "@/" alias (same precedent as model-catalog.js's header).
//
// Rules enforced here, uniformly, for every caller:
//   1. A planned/requested model is validated against the LIVE catalog
//      (isActive, !isDeprecated, has a submittable endpoint/providerModelId)
//      before a single credit moves — never trust an id a plan, a preset, or
//      a client produced.
//   2. Substitution/fallback pools come from the live catalog, cheapest
//      first, re-quoted per candidate, and HARD-CAPPED at the caller's
//      credit ceiling. Failing a step is always preferred to overspending.
//   3. Text-only steps never receive a model whose schema demands a media
//      upload (requiresMediaInput) — the provider rejects them outright.
//   4. LAST_RESORT_FALLBACKS is a tiny verified-id list used only when the
//      live catalog lookup itself returns nothing; every id in it is
//      re-verified against the live catalog before use (stale hardcoded ids
//      caused the flux-dev/nano-banana production incident this design
//      descends from).

import {
  resolveRunnableModel,
  getRunnableModelsForType,
  getCatalogModel,
} from "./model-catalog.js";
import {
  audioKind,
  isRunnableModelRow,
  modelTypeForCapability,
  requiresMediaInput,
  runnableProviderModelId,
} from "./model-catalog-core.mjs";

export {
  resolveRunnableModel,
  getRunnableModelsForType,
  audioKind,
  isRunnableModelRow,
  modelTypeForCapability,
  requiresMediaInput,
  runnableProviderModelId,
};

// Kinds that map onto catalog model pools (only these get runnable-model
// validation; internal kinds — storyboard/assembly/export/llm — don't).
export const CATALOG_MODEL_KINDS = new Set(["image", "video", "audio"]);

// Verified-at-call-time last resorts. video's old entry ("wan2.6-t2v") was
// dropped (Phase G1.4): it only ever resolved to a retired Alibaba adapter
// row — dead weight a verify gate had to keep filtering out.
export const LAST_RESORT_FALLBACKS = {
  image: ["google/nano-banana-2-lite", "qwen-image-max"],
  video: [],
  audio: ["suno-v4.5"],
};

// Confirms a LAST_RESORT_FALLBACKS id is STILL actually runnable in this
// environment's live catalog before ever treating it as a candidate.
// estimateCredits' generic per-tool default returns SOME number for ANY
// model string, real or not, so "try to quote it" can never fail — only a
// catalog row lookup is an honest gate.
export async function verifyLastResortIds(ids) {
  const verified = [];
  for (const id of ids) {
    const row = await resolveRunnableModel(id).catch(() => null);
    if (row) verified.push(id);
  }
  return verified;
}

// The cheapest currently-runnable model for an agent kind, straight from the
// live catalog. Audio is NOT just "cheapest row": ordering purely by
// creditsCost once resolved an audio step to an enhancement utility that
// transforms an existing track and cannot generate from scratch — audioKind
// prefers a genuine generator ("music" composer, or "tts" reader when the
// task wants a spoken voice) over transformer/enhancement/conversion rows.
// Falls back to LAST_RESORT_FALLBACKS[0] (verified) only when the live
// lookup itself is unavailable; ultimately to the kind string itself (the
// same failure mode the old code had — surfaces as a clean provider error).
export async function defaultRunnableModelForKind(agentKind, { wantsVoice = false } = {}) {
  try {
    if (agentKind === "audio") {
      const rows = await getRunnableModelsForType("audio", { limit: 50 });
      const preferredKind = wantsVoice ? "tts" : "music";
      const fallbackKind = wantsVoice ? "music" : "tts";
      const generator =
        rows.find((row) => audioKind(row) === preferredKind) ||
        rows.find((row) => audioKind(row) === fallbackKind) ||
        rows[0];
      if (generator) return runnableProviderModelId(generator);
    } else {
      const [row] = await getRunnableModelsForType(agentKind, { limit: 1 });
      if (row) return runnableProviderModelId(row);
    }
  } catch { /* fall through to the last-resort id below */ }
  return LAST_RESORT_FALLBACKS[agentKind]?.[0] || agentKind;
}

// Picks a single runnable replacement for `excludeModel`, cheapest first —
// live catalog first, verified LAST_RESORT_FALLBACKS only if that comes back
// empty. Every candidate is re-quoted via the injected `estimateFn`
// ((kind, modelId, params) => credits — pricing-engine.estimateCredits on the
// web side, a lazy-imported wrapper in workers) and skipped when unquotable
// or above `ceiling`. Returns `{ model, credits }` or null.
export async function pickSubstituteModel({ agentKind, excludeModel, params = {}, ceiling, estimateFn }) {
  const tryIds = async (ids) => {
    for (const subId of ids) {
      if (!subId || subId === excludeModel) continue;
      let credits;
      try {
        credits = await estimateFn(agentKind, subId, { ...params, model: subId, endpoint: subId });
      } catch {
        continue;
      }
      if (typeof ceiling === "number" && credits > ceiling) continue;
      return { model: subId, credits };
    }
    return null;
  };

  const liveCandidates = await getRunnableModelsForType(agentKind, { excludeModelIds: [excludeModel], limit: 5 }).catch(() => []);
  const found = await tryIds(liveCandidates.map(runnableProviderModelId));
  if (found) return found;
  const lastResort = await verifyLastResortIds((LAST_RESORT_FALLBACKS[agentKind] || []).filter((id) => id !== excludeModel));
  return tryIds(lastResort);
}

// Additional retry-chain candidates (beyond the primary slot) for a step —
// live catalog lookup first so a provider deprecating one model can never
// take down the whole chain; verified last-resort ids only when the live
// lookup returns nothing.
export async function getFallbackCandidates(agentKind, excludeModelIds = [], limit = 2) {
  if (!CATALOG_MODEL_KINDS.has(agentKind)) return [];
  const rows = await getRunnableModelsForType(agentKind, { excludeModelIds, limit }).catch(() => []);
  const ids = rows.map(runnableProviderModelId).filter(Boolean);
  if (ids.length) return ids;
  const lastResort = (LAST_RESORT_FALLBACKS[agentKind] || []).filter((id) => !excludeModelIds.includes(id));
  return verifyLastResortIds(lastResort);
}

// Full row lookup for display/quote purposes (worker-safe passthrough).
export async function getRunnableModelRow(candidateId) {
  const row = await resolveRunnableModel(candidateId);
  return row || null;
}

export { getCatalogModel };
