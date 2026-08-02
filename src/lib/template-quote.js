// Helmies Studio — Server-Authoritative Template Quoting + Publish Gate
// (Phase 6 Task 2)
//
// MONEY RULE (normative): every credit amount in a quote comes from
// quoteCatalogModel (src/lib/model-catalog.js), which reads the ModelPricing
// row — never from the graph JSON and never from anything the caller sends
// in a request body. A step's `inputs` (graph-declared or caller-supplied)
// can influence WHICH pricing rule matches (e.g. resolution/duration — a
// legitimate user choice), but the resulting `credits` number is always
// computed here from that pricing table, never trusted verbatim from any
// input. A client-supplied `credits` or `price` field is inert by
// construction: quoteCatalogModel only ever reads the fields its own model
// schema declares, so an extraneous key is simply never looked at.
import prisma from "./prisma.js";
import { validateGraph, topoSort } from "./template-graph.js";
import { quoteCatalogModel } from "./model-catalog.js";

// Merge a step's own graph-declared inputs with any caller-supplied
// per-step override (`inputs[step.id]`, e.g. a user picking a different
// resolution/duration before running). The graph's own values are the
// baseline; the caller's values are layered on top field-by-field.
function stepParams(step, callerInputs) {
  return { ...(step.inputs || {}), ...((callerInputs && callerInputs[step.id]) || {}) };
}

// quoteTemplate(graph, inputs) -> { valid, steps, totalCredits, errors }.
// `inputs` is an optional object keyed by step id (each value overrides
// that step's own graph-declared inputs for this quote only — never
// persisted). Every step is priced independently via quoteCatalogModel; a
// single unpriced/invalid step makes the WHOLE quote invalid (errors[]
// names which step and why), but every step is still attempted so the
// caller sees every problem at once, not just the first.
export async function quoteTemplate(graph, inputs = {}) {
  const structural = validateGraph(graph);
  if (!structural.valid) {
    return { valid: false, steps: [], totalCredits: 0, errors: structural.errors };
  }

  let order;
  try {
    order = topoSort(graph);
  } catch (err) {
    return { valid: false, steps: [], totalCredits: 0, errors: [err.message] };
  }

  const stepById = new Map(graph.steps.map((s) => [s.id, s]));
  const steps = [];
  const errors = [];
  let totalCredits = 0;

  for (const stepId of order) {
    const step = stepById.get(stepId);
    const params = stepParams(step, inputs);
    let quote;
    try {
      quote = await quoteCatalogModel(step.modelId, params);
    } catch (err) {
      errors.push(`step "${step.id}" (${step.modelId}): ${err.message}`);
      continue;
    }
    if (!quote.valid) {
      const detail = (quote.errors || []).map((e) => e.message || e.field).join(", ") || "invalid input";
      errors.push(`step "${step.id}" (${step.modelId}): ${detail}`);
      continue;
    }
    steps.push({ stepId: step.id, modelId: step.modelId, credits: quote.credits });
    totalCredits += quote.credits;
  }

  return { valid: errors.length === 0, steps, totalCredits, errors };
}

// canPublish(templateId, version) -> { ok, reasons[] }. Every reason is
// checked independently — a graph can fail more than one at once, and every
// one is reported, not just the first. The four ways a version is refused:
//   1. validateGraph rejects the graph's own structure.
//   2/3. any step's modelId has no ModelPricing row at all, or the row
//      exists but is inactive/deprecated.
//   4. quoteTemplate against the version's own declared sample inputs
//      (graph.sampleInputs, defaulting to {}) is invalid — e.g. a required
//      field the graph doesn't already supply and no sample fills in.
export async function canPublish(templateId, version) {
  const row = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version } },
  });
  if (!row) return { ok: false, reasons: [`Template version ${templateId}@${version} not found`] };

  const graph = row.graph || {};
  const reasons = [];

  const structural = validateGraph(graph);
  if (!structural.valid) {
    reasons.push(...structural.errors.map((e) => `invalid graph: ${e}`));
  }

  if (Array.isArray(graph.steps)) {
    for (const step of graph.steps) {
      if (!step?.modelId) continue; // already reported by validateGraph above
      const model = await prisma.modelPricing.findUnique({ where: { modelId: step.modelId } });
      if (!model) {
        reasons.push(`step "${step.id}": model "${step.modelId}" does not exist in the catalog`);
      } else if (!model.isActive) {
        reasons.push(`step "${step.id}": model "${step.modelId}" is inactive`);
      } else if (model.isDeprecated) {
        reasons.push(`step "${step.id}": model "${step.modelId}" is deprecated`);
      }
    }
  }

  // Only attempt to quote a structurally sound graph — otherwise this would
  // just re-report the same structural problems validateGraph already named
  // above under a different message.
  if (structural.valid) {
    const quote = await quoteTemplate(graph, graph.sampleInputs || {});
    if (!quote.valid) {
      reasons.push(...quote.errors.map((e) => `quote failed: ${e}`));
    }
  }

  return { ok: reasons.length === 0, reasons };
}
