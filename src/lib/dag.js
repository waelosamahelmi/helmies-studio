// Helmies Studio — DAG utilities for durable run engines (Phase B1.1)
//
// Pure, dependency-free, worker-safe (no "@/" alias, no prisma): the agent
// runner, template runner and tests all share this one implementation.
//
// A "node" is any object with at least { id: string, dependsOn?: string[] }.
// The agent runner derives dependsOn from $STEP_N_OUTPUT / ${storyboard}
// tokens before calling buildDag; the template graph already declares
// dependsOn explicitly.

// Assign stable ids where missing (step-1, step-2, ... by position) and
// normalize dependsOn to an array of id strings. Returns NEW node objects —
// the caller's array is never mutated.
export function buildDag(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  const ids = steps.map((s, i) => (typeof s?.id === "string" && s.id ? s.id : `step-${i + 1}`));
  const positionById = new Map(ids.map((id, i) => [id, i]));
  return steps.map((s, i) => {
    const raw = Array.isArray(s?.dependsOn) ? s.dependsOn : [];
    const dependsOn = raw
      .map((d) => {
        if (typeof d === "string" && positionById.has(d)) return d;
        // Numeric deps ("2", 2) are 1-based positions — the form the agent
        // planner's $STEP_N_OUTPUT tokens naturally produce.
        const n = typeof d === "number" ? d : parseInt(String(d), 10);
        if (Number.isInteger(n) && n >= 1 && n <= steps.length) return ids[n - 1];
        return null;
      })
      .filter(Boolean);
    return { ...s, id: ids[i], dependsOn: [...new Set(dependsOn)] };
  });
}

// Validate a dagified node list. Returns { valid, errors[] }:
//  - unknown dependency id
//  - self-dependency
//  - cycle (DFS, iterative)
export function validateDag(nodes) {
  const errors = [];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { valid: false, errors: ["The plan has no steps."] };
  }
  const byId = new Map();
  for (const n of nodes) {
    if (byId.has(n.id)) errors.push(`Duplicate step id "${n.id}".`);
    byId.set(n.id, n);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn || []) {
      if (dep === n.id) errors.push(`Step "${n.id}" depends on itself.`);
      else if (!byId.has(dep)) errors.push(`Step "${n.id}" depends on unknown step "${dep}".`);
    }
  }
  if (errors.length) return { valid: false, errors };

  // Cycle detection — iterative DFS with white/gray/black coloring.
  const color = new Map(nodes.map((n) => [n.id, 0])); // 0 white, 1 gray, 2 black
  for (const start of nodes) {
    if (color.get(start.id) !== 0) continue;
    const stack = [[start.id, 0]];
    color.set(start.id, 1);
    while (stack.length) {
      const [id, childIdx] = stack[stack.length - 1];
      const deps = byId.get(id)?.dependsOn || [];
      if (childIdx >= deps.length) {
        color.set(id, 2);
        stack.pop();
        continue;
      }
      stack[stack.length - 1][1] = childIdx + 1;
      const dep = deps[childIdx];
      if (!byId.has(dep)) continue; // already reported
      const c = color.get(dep);
      if (c === 1) {
        errors.push(`Cycle detected involving step "${dep}".`);
        return { valid: false, errors };
      }
      if (c === 0) {
        color.set(dep, 1);
        stack.push([dep, 0]);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// Ids of nodes whose every dependency is in `doneIds` (a Set of succeeded
// step ids) and whose own status is `pendingStatus` (default "pending").
// Nodes may carry a `status` field (AgentRunStep rows) — plain plan steps
// without one are treated as pending.
export function readyNodes(nodes, doneIds, { pendingStatus = "pending" } = {}) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds);
  return nodes.filter((n) => {
    const status = n.status ?? pendingStatus;
    if (status !== pendingStatus) return false;
    return (n.dependsOn || []).every((d) => done.has(d));
  });
}

// Layered topological view (for progress display/tests): layer 0 = no deps,
// layer N = all deps in earlier layers. Throws on cycle (validate first).
export function topoLayers(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const layerOf = new Map();
  const remaining = new Set(nodes.map((n) => n.id));
  let layer = 0;
  const layers = [];
  while (remaining.size) {
    const current = [];
    for (const id of remaining) {
      const deps = byId.get(id).dependsOn || [];
      if (deps.every((d) => layerOf.has(d) && layerOf.get(d) < layer)) current.push(id);
    }
    if (!current.length) throw new Error("Cycle detected in DAG");
    for (const id of current) {
      layerOf.set(id, layer);
      remaining.delete(id);
    }
    layers.push(current);
    layer++;
  }
  return layers;
}

// { done, total } progress over nodes carrying a `status` field.
export function progressFor(nodes) {
  const total = nodes.length;
  const done = nodes.filter((n) => ["succeeded", "failed", "skipped"].includes(n.status)).length;
  return { done, total };
}
