import { describe, it, expect } from "vitest";
import { buildDag, validateDag, readyNodes, topoLayers, progressFor } from "@/lib/dag";

// dag.js is deliberately generic: a node is { id, dependsOn }. The agent
// runner adapts its own AgentRunStep.stepId to `id` at the boundary, so the
// template graph (which already uses `id`) can share the same module.

describe("dag", () => {
  it("buildDag assigns positional ids and normalizes numeric dependsOn", () => {
    const nodes = buildDag([
      { agent: "image", task: "a" },
      { agent: "video", task: "b", params: { prompt: "$STEP_1_OUTPUT" } },
    ]);
    expect(nodes[0].id).toBe("step-1");
    expect(nodes[1].id).toBe("step-2");
    // buildDag does NOT read tokens — dependency derivation is the caller's
    // job; it only normalizes what dependsOn already declares.
    expect(nodes[1].dependsOn).toEqual([]);

    const withDeps = buildDag([
      { agent: "image", task: "a" },
      { agent: "video", task: "b", dependsOn: [1] },
    ]);
    expect(withDeps[1].dependsOn).toEqual(["step-1"]);
  });

  it("buildDag preserves explicit ids and never mutates the caller's steps", () => {
    const input = [{ id: "board", agent: "storyboard" }, { agent: "image", dependsOn: ["board"] }];
    const nodes = buildDag(input);
    expect(nodes.map((n) => n.id)).toEqual(["board", "step-2"]);
    expect(nodes[1].dependsOn).toEqual(["board"]);
    expect(input[1].id).toBeUndefined();
  });

  it("validateDag rejects duplicate ids, unknown deps, self-deps and cycles", () => {
    expect(validateDag([{ id: "a" }, { id: "a" }]).errors[0]).toMatch(/Duplicate/);
    expect(validateDag([{ id: "a", dependsOn: ["zzz"] }]).errors[0]).toMatch(/unknown/);
    expect(validateDag([{ id: "a", dependsOn: ["a"] }]).errors[0]).toMatch(/itself/);

    const cyclic = [
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ];
    const cycle = validateDag(cyclic);
    expect(cycle.valid).toBe(false);
    expect(cycle.errors[0]).toMatch(/cycle/i);

    expect(validateDag([{ id: "a" }, { id: "b", dependsOn: ["a"] }]).valid).toBe(true);
    expect(validateDag([]).valid).toBe(false);
  });

  it("readyNodes returns only nodes whose deps are done and still pending", () => {
    const nodes = [
      { id: "a", status: "succeeded" },
      { id: "b", status: "pending", dependsOn: ["a"] },
      { id: "c", status: "pending", dependsOn: ["b"] },
      { id: "d", status: "queued", dependsOn: [] },
    ];
    expect(readyNodes(nodes, new Set(["a"])).map((n) => n.id)).toEqual(["b"]);
  });

  it("topoLayers parallelizes a diamond", () => {
    const layers = topoLayers([
      { id: "a" },
      { id: "b", dependsOn: ["a"] },
      { id: "c", dependsOn: ["a"] },
      { id: "d", dependsOn: ["b", "c"] },
    ]);
    expect(layers).toEqual([["a"], ["b", "c"], ["d"]]);
  });

  it("topoLayers throws on a cycle rather than looping forever", () => {
    expect(() => topoLayers([
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ])).toThrow(/cycle/i);
  });

  it("progressFor counts terminal steps as done", () => {
    expect(progressFor([{ status: "succeeded" }, { status: "failed" }, { status: "pending" }]))
      .toEqual({ done: 2, total: 3 });
    expect(progressFor([{ status: "skipped" }, { status: "queued" }])).toEqual({ done: 1, total: 2 });
  });
});
