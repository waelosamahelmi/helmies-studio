import { describe, it, expect } from "vitest";
import { validateGraph, topoSort } from "@/lib/template-graph";

function step(id, overrides = {}) {
  return { id, tool: "generate", modelId: "alibaba:wan2.7-image", inputs: {}, dependsOn: [], ...overrides };
}

describe("topoSort", () => {
  it("sorts a valid 3-step chain into dependency-first execution order", () => {
    const graph = {
      steps: [
        step("step1"),
        step("step2", { dependsOn: ["step1"] }),
        step("step3", { dependsOn: ["step2"] }),
      ],
    };
    expect(topoSort(graph)).toEqual(["step1", "step2", "step3"]);
  });

  it("sorts correctly regardless of declaration order in the steps array", () => {
    const graph = {
      steps: [
        step("step3", { dependsOn: ["step2"] }),
        step("step1"),
        step("step2", { dependsOn: ["step1"] }),
      ],
    };
    const order = topoSort(graph);
    expect(order.indexOf("step1")).toBeLessThan(order.indexOf("step2"));
    expect(order.indexOf("step2")).toBeLessThan(order.indexOf("step3"));
  });

  it("throws on a cycle", () => {
    const graph = {
      steps: [
        step("step1", { dependsOn: ["step2"] }),
        step("step2", { dependsOn: ["step1"] }),
      ],
    };
    expect(() => topoSort(graph)).toThrow(/cycle/i);
  });

  it("throws on a dependency naming an unknown step", () => {
    const graph = { steps: [step("step1", { dependsOn: ["ghost"] })] };
    expect(() => topoSort(graph)).toThrow(/unknown step/i);
  });
});

describe("validateGraph — happy path", () => {
  it("accepts a valid 3-step chain", () => {
    const graph = {
      steps: [
        step("step1", { inputs: { prompt: "a cat" } }),
        step("step2", { dependsOn: ["step1"], inputs: { image_url: "$step1.output" } }),
        step("step3", { dependsOn: ["step2"], inputs: { video_url: "$step2.output" } }),
      ],
    };
    const result = validateGraph(graph);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("accepts a step reference nested inside an array/object input value", () => {
    const graph = {
      steps: [
        step("step1", { inputs: { prompt: "a cat" } }),
        step("step2", { dependsOn: ["step1"], inputs: { images_list: ["$step1.output"] } }),
      ],
    };
    expect(validateGraph(graph).valid).toBe(true);
  });
});

describe("validateGraph — rejections", () => {
  it("rejects an empty steps array", () => {
    const result = validateGraph({ steps: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a graph with no steps array at all", () => {
    expect(validateGraph({}).valid).toBe(false);
    expect(validateGraph(null).valid).toBe(false);
  });

  it("rejects a cycle", () => {
    const graph = {
      steps: [
        step("step1", { dependsOn: ["step2"] }),
        step("step2", { dependsOn: ["step1"] }),
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /cycle/i.test(e))).toBe(true);
  });

  it("rejects a dependsOn naming an unknown step", () => {
    const graph = { steps: [step("step1", { dependsOn: ["ghost"] })] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /unknown step/i.test(e))).toBe(true);
  });

  it("rejects a forward reference — an earlier step's input pointing at a later step's output", () => {
    // step1 runs first (no deps) but its own input claims to consume
    // step2's output, which cannot exist yet at that point in execution.
    const graph = {
      steps: [
        step("step1", { inputs: { image_url: "$step2.output" } }),
        step("step2", { dependsOn: ["step1"] }),
      ],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /not an earlier step/i.test(e))).toBe(true);
  });

  it("rejects an input referencing $stepN.output where N is not a step in the graph at all", () => {
    const graph = { steps: [step("step1", { inputs: { image_url: "$step9.output" } })] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /unknown step/i.test(e))).toBe(true);
  });

  it("rejects a step with no modelId", () => {
    const graph = { steps: [step("step1", { modelId: undefined })] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /missing modelId/i.test(e))).toBe(true);
  });

  it("rejects a step with no tool", () => {
    const graph = { steps: [step("step1", { tool: undefined })] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /missing tool/i.test(e))).toBe(true);
  });

  it("rejects a step with no id", () => {
    const graph = { steps: [{ tool: "generate", modelId: "x" }] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate step ids", () => {
    const graph = { steps: [step("step1"), step("step1")] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true);
  });
});
