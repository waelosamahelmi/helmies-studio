import { describe, it, expect } from "vitest";
import { buildDag, validateDag, readyNodes } from "../../src/lib/dag.js";
import { runProgress } from "../../src/lib/template-graph.js";

describe("plan DAG roots (B1.2)", () => {
  it("starts every root, not just the first one", () => {
    // Three independent openers must all go at once; starting one and
    // waiting is the sequential bug that B1.3 fixed downstream.
    const nodes = buildDag([
      { id: "a", agent: "image" },
      { id: "b", agent: "image" },
      { id: "c", agent: "music" },
      { id: "d", agent: "assembly", dependsOn: ["a", "b", "c"] },
    ]);
    expect(readyNodes(nodes, new Set()).map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("rejects a plan with no root at all", () => {
    // A finite graph where every node has a dependency must contain a
    // cycle — so this is caught, and caught with a message that names it
    // rather than hanging forever waiting for a step that can never start.
    const nodes = buildDag([
      { id: "a", agent: "image", dependsOn: ["b"] },
      { id: "b", agent: "image", dependsOn: ["a"] },
    ]);
    const check = validateDag(nodes);
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/cycle/i);
    expect(readyNodes(nodes, new Set())).toEqual([]);
  });

  it("rejects a step that depends on itself", () => {
    const check = validateDag(buildDag([{ id: "a", agent: "image", dependsOn: ["a"] }]));
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/depends on itself/i);
  });

  it("rejects a dependency on a step that does not exist", () => {
    const check = validateDag([{ id: "a", dependsOn: ["ghost"] }]);
    expect(check.valid).toBe(false);
    expect(check.errors[0]).toMatch(/unknown step/i);
  });

  it("reads the planner's 1-based $STEP_N positions as real dependencies", () => {
    const nodes = buildDag([{ agent: "image" }, { agent: "video", dependsOn: [1] }]);
    expect(nodes[1].dependsOn).toEqual([nodes[0].id]);
    expect(validateDag(nodes).valid).toBe(true);
  });

  it("releases a step only when EVERY dependency is done", () => {
    // Nodes carry their own status (AgentRunStep rows do); a done step is
    // filtered out by that, not by being in the doneIds set.
    const nodes = buildDag([
      { id: "a", status: "succeeded" },
      { id: "b", status: "pending" },
      { id: "j", status: "pending", dependsOn: ["a", "b"] },
    ]);
    expect(readyNodes(nodes, new Set(["a"])).map((n) => n.id)).toEqual(["b"]);

    const bDone = buildDag([
      { id: "a", status: "succeeded" },
      { id: "b", status: "succeeded" },
      { id: "j", status: "pending", dependsOn: ["a", "b"] },
    ]);
    expect(readyNodes(bDone, new Set(["a", "b"])).map((n) => n.id)).toEqual(["j"]);
  });
});

describe("runProgress (B1.6)", () => {
  it("counts rather than naming a single current step", () => {
    // With parallel steps there is no such thing as "the" running one, and
    // a client that picks one shows an arbitrary choice.
    const p = runProgress({
      a: { status: "completed" },
      b: { status: "running" },
      c: { status: "running" },
      d: { status: "pending" },
    });
    expect(p).toMatchObject({ total: 4, completed: 1, running: 2, pending: 1, failed: 0 });
    expect(p.runningStepIds).toEqual(["b", "c"]);
  });

  it("never reads 100% while anything is still going", () => {
    // A run showing 100% with a step still at a provider is the most
    // annoying possible lie for somebody deciding whether to wait.
    const p = runProgress({ a: { status: "completed" }, b: { status: "running" } });
    expect(p.percent).toBe(50);
    const nearly = runProgress(Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`s${i}`, { status: i === 199 ? "running" : "completed" }]),
    ));
    expect(nearly.percent).toBe(99);
  });

  it("reads 100% exactly when every step is done", () => {
    expect(runProgress({ a: { status: "completed" }, b: { status: "completed" } }).percent).toBe(100);
  });

  it("reports a failure without pretending it is progress", () => {
    const p = runProgress({ a: { status: "completed" }, b: { status: "failed" } });
    expect(p.failed).toBe(1);
    expect(p.percent).toBe(50);
  });

  it("survives an empty or missing state", () => {
    expect(runProgress({})).toMatchObject({ total: 0, percent: 0 });
    expect(runProgress()).toMatchObject({ total: 0, percent: 0 });
  });
});
