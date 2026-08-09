// Helmies Studio — Template Graph Validation (Phase 6 Task 1)
//
// A TemplateVersion.graph (prisma/schema.prisma) is a plain JSON object:
//   { steps: [{ id, tool, modelId, inputs, dependsOn }], sampleInputs? }
// `steps[].id` is the sole addressing key — this codebase's convention
// (followed by every seed in src/lib/template-seeds.js, Task 4) is to name
// them "step1", "step2", ... in execution order, because a step's `inputs`
// values may embed a literal `$stepN.output` placeholder string that
// references an EARLIER step's output by that same numeral. That
// placeholder is resolved for real at run time by src/lib/template-runner.js
// (Task 3); here it is only checked for well-formedness: N must name an
// actual step in the graph, and that step must run strictly before the step
// doing the referencing.
//
// Execution order itself, however, is NOT derived from the numeral in the
// id — it is derived from `dependsOn`, exactly like any other DAG. The two
// are independent on purpose: `dependsOn` is what topoSort/template-runner
// actually schedule against; the `$stepN.output` numeral is just a
// human-readable pointer into that same id space. A well-formed graph keeps
// them in agreement (a step referencing $stepN.output also lists that step
// in its own dependsOn), but this module does not require that redundancy —
// it only enforces the ordering constraint each mechanism defines for
// itself.

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Recursively collect every `$stepN.output` reference embedded in `value`
// (a step's input value can be a plain string, or an array/object nesting
// strings — e.g. an `images_list` field). Returns an array of the numeral N
// (as a Number) for each match found, duplicates included.
function extractStepRefs(value, found = []) {
  if (typeof value === "string") {
    const re = /\$step(\d+)\.output/g;
    let m;
    while ((m = re.exec(value))) found.push(Number(m[1]));
  } else if (Array.isArray(value)) {
    for (const item of value) extractStepRefs(item, found);
  } else if (isPlainObject(value)) {
    for (const item of Object.values(value)) extractStepRefs(item, found);
  }
  return found;
}

// topoSort(graph) -> step ids in dependency-first execution order (a step
// always appears after everything in its own `dependsOn`, transitively).
// Throws on an unknown dependency or a cycle — callers that need a
// non-throwing check should go through validateGraph instead, which catches
// this and reports it as a validation error.
export function topoSort(graph) {
  const steps = Array.isArray(graph?.steps) ? graph.steps : [];
  const stepById = new Map();
  for (const step of steps) {
    if (step && typeof step.id === "string" && step.id && !stepById.has(step.id)) {
      stepById.set(step.id, step);
    }
  }

  const visited = new Set(); // fully ordered
  const visiting = new Set(); // on the current DFS path
  const order = [];

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Cycle detected in template graph at step "${id}"`);
    }
    const step = stepById.get(id);
    if (!step) throw new Error(`Template graph references unknown step "${id}"`);
    visiting.add(id);
    for (const dep of step.dependsOn || []) visit(dep);
    visiting.delete(id);
    visited.add(id);
    order.push(id);
  }

  for (const step of steps) {
    if (step && typeof step.id === "string" && step.id) visit(step.id);
  }
  return order;
}

// validateGraph(graph) -> { valid, errors[] }. Never throws — a cycle
// (topoSort's one throwing case) is caught and reported as a normal
// validation error instead, so every caller (including the publish gate in
// src/lib/template-quote.js) can treat this as the single source of truth
// for "is this graph well-formed" without its own try/catch.
export function validateGraph(graph) {
  if (!isPlainObject(graph) || !Array.isArray(graph.steps) || graph.steps.length === 0) {
    return { valid: false, errors: ["graph.steps must be a non-empty array"] };
  }

  const steps = graph.steps;
  const errors = [];
  const stepById = new Map();

  for (const step of steps) {
    if (!step || typeof step.id !== "string" || !step.id.trim()) {
      errors.push("every step requires a non-empty string id");
      continue;
    }
    if (stepById.has(step.id)) {
      errors.push(`duplicate step id: "${step.id}"`);
      continue;
    }
    stepById.set(step.id, step);
  }

  for (const step of steps) {
    if (!step || typeof step.id !== "string" || !stepById.has(step.id)) continue; // already flagged above
    if (!step.modelId) errors.push(`step "${step.id}" is missing modelId`);
    if (!step.tool) errors.push(`step "${step.id}" is missing tool`);

    const dependsOn = step.dependsOn ?? [];
    if (!Array.isArray(dependsOn)) {
      errors.push(`step "${step.id}" dependsOn must be an array`);
    } else {
      for (const dep of dependsOn) {
        if (!stepById.has(dep)) errors.push(`step "${step.id}" dependsOn references unknown step: "${dep}"`);
      }
    }
  }

  if (errors.length) return { valid: false, errors };

  // Structurally sound so far — safe to attempt a real topological sort,
  // which is the only thing that can detect a cycle.
  let order;
  try {
    order = topoSort(graph);
  } catch (err) {
    return { valid: false, errors: [err.message] };
  }
  const indexOf = new Map(order.map((id, i) => [id, i]));

  for (const step of steps) {
    for (const [key, value] of Object.entries(step.inputs || {})) {
      for (const n of extractStepRefs(value)) {
        const refId = `step${n}`;
        if (!stepById.has(refId)) {
          errors.push(`step "${step.id}" input "${key}" references unknown step: $step${n}.output`);
          continue;
        }
        if (indexOf.get(refId) >= indexOf.get(step.id)) {
          errors.push(
            `step "${step.id}" input "${key}" references $step${n}.output, which is not an earlier step`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/* Progress a person can read (B1.6).
   ────────────────────────────────────────────────────────────────────────
   The run route handed back stepState — the raw per-step map — and left
   every caller to reduce it themselves. They each did it slightly
   differently, and none of them could answer the one question somebody
   watching a run actually asks: how far along is it.

   That question got harder, not easier, when steps started running in
   parallel (B1.3): "which step is running" no longer has one answer, so a
   client counting on a single current step now shows an arbitrary one of
   several. Counts are the honest shape.

   Pure — no database, no request. */
export function runProgress(stepState = {}) {
  const steps = Object.entries(stepState || {}).map(([id, s]) => ({ id, status: s?.status || "pending" }));
  const total = steps.length;
  const count = (status) => steps.filter((s) => s.status === status).length;

  const completed = count("completed");
  const failed = count("failed");
  const running = steps.filter((s) => s.status === "running").map((s) => s.id);

  return {
    total,
    completed,
    failed,
    running: running.length,
    pending: count("pending"),
    // The ids, plural and in graph order, because with parallel steps there
    // is no such thing as "the" current one.
    runningStepIds: running,
    // Whole percent, and never 100 until it genuinely is: a run showing
    // 100% while a step is still at a provider is the most annoying
    // possible lie for somebody deciding whether to wait.
    percent: total === 0 ? 0 : Math.min(completed === total ? 100 : 99, Math.round((completed / total) * 100)),
  };
}
