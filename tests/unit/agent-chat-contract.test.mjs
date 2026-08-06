import { describe, it, expect } from "vitest";
import { parseQuestionBlock, stripQuestionBlock, buildChatSystemPrompt } from "@/lib/agent-chat";

// EDITSv1 E3.2 — the structured chat contract: at most one question per
// turn, delivered as a trailing fenced ```question block the UI parses.

const block = (json) => "```question\n" + json + "\n```";

describe("parseQuestionBlock", () => {
  it("parses a well-formed question block", () => {
    const text = `Let's narrow this down.\n\n${block('{"question":"Which ratio?","options":["16:9","9:16"],"allowCustom":true}')}`;
    expect(parseQuestionBlock(text)).toEqual({
      question: "Which ratio?",
      options: ["16:9", "9:16"],
      allowCustom: true,
    });
  });

  it("returns the LAST block when several are present", () => {
    const text = [
      block('{"question":"First?","options":["a"]}'),
      "some prose",
      block('{"question":"Second?","options":["x","y"]}'),
    ].join("\n\n");
    expect(parseQuestionBlock(text).question).toBe("Second?");
  });

  it("returns null when no block is present", () => {
    expect(parseQuestionBlock("Just some **markdown** prose.")).toBeNull();
    expect(parseQuestionBlock("")).toBeNull();
    expect(parseQuestionBlock(null)).toBeNull();
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(parseQuestionBlock(block("{not json"))).toBeNull();
  });

  it("returns null when the JSON has no usable question", () => {
    expect(parseQuestionBlock(block('{"options":["a"]}'))).toBeNull();
    expect(parseQuestionBlock(block('{"question":"   "}'))).toBeNull();
  });

  it("defaults allowCustom to true and tolerates missing options", () => {
    const q = parseQuestionBlock(block('{"question":"Mood?"}'));
    expect(q).toEqual({ question: "Mood?", options: [], allowCustom: true });
  });

  it("honors allowCustom:false and drops non-string options", () => {
    const q = parseQuestionBlock(block('{"question":"Q?","options":["a", 2, "", "b"],"allowCustom":false}'));
    expect(q.allowCustom).toBe(false);
    expect(q.options).toEqual(["a", "b"]);
  });

  it("ignores ordinary fenced code blocks that are not tagged question", () => {
    expect(parseQuestionBlock('```json\n{"question":"nope"}\n```')).toBeNull();
  });
});

describe("stripQuestionBlock", () => {
  it("removes the last question block, keeping the prose", () => {
    const text = `Here is the thinking.\n\n${block('{"question":"Which?","options":["a"]}')}`;
    expect(stripQuestionBlock(text)).toBe("Here is the thinking.");
  });

  it("returns text unchanged when there is no block", () => {
    expect(stripQuestionBlock("plain text")).toBe("plain text");
  });
});

describe("buildChatSystemPrompt", () => {
  const prompt = buildChatSystemPrompt();

  it("instructs at most ONE question per turn, via the fenced question block", () => {
    expect(prompt).toMatch(/AT MOST ONE/i);
    expect(prompt).toContain("```question");
    expect(prompt).toMatch(/allowCustom/);
  });

  it("instructs markdown prose and forbids plan JSON in chat", () => {
    expect(prompt).toMatch(/Markdown/i);
    expect(prompt).toMatch(/Do not output plan JSON/i);
  });

  it("signals plan-readiness with the fenced plan-ready block and keeps approval as the money gate (A9)", () => {
    expect(prompt).toMatch(/plan-ready/);
    expect(prompt).toMatch(/"brief"/);
    expect(prompt).toMatch(/approve/i);
    expect(prompt).toMatch(/nothing runs and nothing is charged/i);
  });

  it("caps the interrogation: at most 2-3 questions across the whole conversation (A9)", () => {
    expect(prompt).toMatch(/AT MOST 2-3 questions/i);
    expect(prompt).toMatch(/Do not interrogate/i);
  });

  it("never names a provider", () => {
    expect(prompt).not.toMatch(/KIE|Alibaba|DashScope|OpenRouter|DeepSeek/i);
  });
});
