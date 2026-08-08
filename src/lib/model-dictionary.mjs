// Helmies Studio — the model dictionary (task 15).
//
// WHAT THIS IS FOR
// The catalog used to be built by crawling a documentation sitemap and
// turning doc-page paths into model ids. That invented rows the provider
// had never heard of, guessed prices for 60 of them, and mislabelled video
// models as image models — which is how a text-to-video model came to be
// chosen to draw a bedroom, and how a $1.28 model came to bill 8 credits.
//
// So the checked-in dictionary is the authority, and the sync is demoted
// to a reconciler: it may REPORT that the database and the dictionary
// disagree, and it may push the dictionary's answer into the database. It
// may not invent a row, and it may not activate one the dictionary does
// not describe.
//
// The file is a record of production as it stands, which is deliberately
// not the same as a record of what is TRUE — `costKnown` says whether a
// price came from the checked-in table or from a type default, and the
// verification field says whether anything ever probed the endpoint.
// Filling those in honestly is the work this file makes possible.
//
// Worker-safe: relative imports, no prisma, no side effects. createRequire
// so the same module loads under Next's bundler and under plain node.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const DICTIONARY = require("../../models/dictionary.json");

export const MODEL_IDS = Object.freeze(Object.keys(DICTIONARY));

/** Everything the dictionary knows about one model, or null. */
export function modelEntry(modelId) {
  if (!modelId || typeof modelId !== "string") return null;
  return DICTIONARY[modelId] || null;
}

/** Is this a model we have written down at all? */
export function isKnownModel(modelId) {
  return Boolean(modelEntry(modelId));
}

/**
 * May this model be served to users?
 *
 * A row the dictionary does not describe is never activated, however
 * confidently a sync reports it. That single rule is what stops the
 * catalog growing rows nobody chose.
 */
export function mayActivate(modelId) {
  const entry = modelEntry(modelId);
  if (!entry) return { ok: false, reason: "not in the dictionary" };
  if (entry.retired) return { ok: false, reason: "retired" };
  if (entry.verification === "not_callable") {
    return { ok: false, reason: "probed and found not callable" };
  }
  return { ok: true };
}

export function modelsWhere(predicate) {
  return MODEL_IDS.filter((id) => predicate(DICTIONARY[id], id)).map((id) => ({ id, ...DICTIONARY[id] }));
}

export const activeModels = () => modelsWhere((m) => m.active);

/** Models whose price came from a type default rather than a real number. */
export const guessedPriceModels = () => modelsWhere((m) => m.active && !m.costKnown);

/** Models nothing has ever probed. */
export const unverifiedModels = () => modelsWhere((m) => m.active && !m.verification);

/* ── What the agent needs ────────────────────────────────────────────────
   Not the schema — the agent already gets that. What it cannot infer is
   what a model is FOR. A one-line description per model, derived from what
   we know, so a planner picks on purpose rather than on name similarity. */
const CATEGORY_PURPOSE = {
  image: "makes a still from a description",
  i2i: "edits or restyles a still you give it",
  video: "makes a clip from a description",
  i2v: "animates a still you give it",
  v2v: "edits or extends a clip you give it",
  audio: "makes sound — speech, music or effects",
  lipsync: "makes a face in a still or clip speak",
};

export function describeModel(modelId) {
  const entry = modelEntry(modelId);
  if (!entry) return null;
  const bits = [entry.name, `— ${CATEGORY_PURPOSE[entry.category] || entry.category}`];
  if (entry.api?.aspects?.length) bits.push(`ratios ${entry.api.aspects.join("/")}`);
  if (entry.api?.durations?.length) bits.push(`${entry.api.durations.join("/")}s`);
  if (entry.credits) bits.push(`${entry.credits}cr`);
  if (entry.api?.required?.length) bits.push(`needs ${entry.api.required.join(", ")}`);
  return bits.join(" · ");
}

/* ── Reconciling ─────────────────────────────────────────────────────────
   Pure: hand it the database rows, get back what disagrees. The script
   that writes is a separate thing, so this can be tested without one. */
export function reconcile(dbRows = []) {
  const drift = [];
  const seen = new Set();

  for (const row of dbRows) {
    seen.add(row.modelId);
    const entry = modelEntry(row.modelId);

    if (!entry) {
      // The sync invented it, or somebody added it by hand. Either way
      // nobody chose it, and it is live.
      drift.push({
        modelId: row.modelId,
        kind: row.isActive ? "unknown_and_active" : "unknown",
        detail: "not in the dictionary",
      });
      continue;
    }
    if (row.isActive && !mayActivate(row.modelId).ok) {
      drift.push({ modelId: row.modelId, kind: "should_not_be_active", detail: mayActivate(row.modelId).reason });
    }
    for (const [field, dbValue, dictValue] of [
      ["displayName", row.displayName, entry.name],
      ["modelType", row.modelType, entry.category],
      ["capability", row.capability, entry.capability],
      ["providerCost", row.providerCost, entry.cost],
      ["creditsCost", row.creditsCost, entry.credits],
    ]) {
      if (dictValue == null) continue;
      const same = typeof dictValue === "number"
        ? Math.abs(Number(dbValue) - dictValue) < 0.0001
        : String(dbValue) === String(dictValue);
      if (!same) drift.push({ modelId: row.modelId, kind: "field", field, db: dbValue, dictionary: dictValue });
    }
  }

  for (const id of MODEL_IDS) {
    if (!seen.has(id)) drift.push({ modelId: id, kind: "missing_from_db", detail: "described but not present" });
  }

  return drift;
}
