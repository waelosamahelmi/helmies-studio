import { describe, it, expect } from "vitest";
import { parsePlanReadyBlock, stripPlanReadyBlock, parseQuestionBlock } from "@/lib/agent-chat";

// A9 owner defect 3 — auto-plan. The chat model signals readiness with a
// trailing ```plan-ready fenced block; the client auto-calls the plan
// endpoint on seeing it. Same last-block-wins discipline as ```question.

const block = (json) => "```plan-ready\n" + json + "\n```";

describe("parsePlanReadyBlock", () => {
  it("parses a well-formed block with a brief", () => {
    const text = `Great — I have everything I need.\n\n${block('{"brief":"A 20-second synthwave music video: neon city, retro car, rain."}')}`;
    expect(parsePlanReadyBlock(text)).toEqual({
      brief: "A 20-second synthwave music video: neon city, retro car, rain.",
    });
  });

  it("returns null when no block is present", () => {
    expect(parsePlanReadyBlock("Just some **markdown** prose.")).toBeNull();
    expect(parsePlanReadyBlock("")).toBeNull();
    expect(parsePlanReadyBlock(null)).toBeNull();
  });

  it("the SIGNAL still counts when the JSON is malformed or briefless — brief degrades to empty", () => {
    expect(parsePlanReadyBlock(block("{not json"))).toEqual({ brief: "" });
    expect(parsePlanReadyBlock(block("{}"))).toEqual({ brief: "" });
    expect(parsePlanReadyBlock(block('{"brief":42}'))).toEqual({ brief: "" });
  });

  it("uses the LAST block when several are present", () => {
    const text = [block('{"brief":"first"}'), "prose", block('{"brief":"second"}')].join("\n\n");
    expect(parsePlanReadyBlock(text).brief).toBe("second");
  });

  it("ignores ordinary fenced code and question blocks", () => {
    expect(parsePlanReadyBlock('```json\n{"brief":"nope"}\n```')).toBeNull();
    expect(parsePlanReadyBlock('```question\n{"question":"Q?"}\n```')).toBeNull();
  });

  it("coexists with a question block without confusing the two parsers", () => {
    const text = `Prose.\n\n\`\`\`question\n{"question":"Ratio?"}\n\`\`\`\n\n${block('{"brief":"the brief"}')}`;
    expect(parseQuestionBlock(text).question).toBe("Ratio?");
    expect(parsePlanReadyBlock(text).brief).toBe("the brief");
  });
});

describe("stripPlanReadyBlock", () => {
  it("removes the block, keeping the prose", () => {
    const text = `Ready to plan.\n\n${block('{"brief":"b"}')}`;
    expect(stripPlanReadyBlock(text)).toBe("Ready to plan.");
  });

  it("leaves text without a block untouched", () => {
    expect(stripPlanReadyBlock("Plain prose.")).toBe("Plain prose.");
    expect(stripPlanReadyBlock("")).toBe("");
  });
});
