import { describe, it, expect } from "vitest";
import {
  splitScenes, parseStructureReply, parseSceneShotsReply,
  countScriptDialogue, countShotDialogue, sceneIsCovered,
} from "@/lib/script-breakdown-passes.mjs";

const SCRIPT = `TWO LIVES

SCENE 1 — BEDROOM — NIGHT

Wael lies on his back.
TICK.

SCENE 2 — THE ROOM

WAEL
Who are you?

SILHOUETTE
That's really what you came here to ask?

WAEL
I came here because nothing makes sense anymore.`;

describe("reading one scene at a time", () => {
  it("splits a screenplay on its scene headings", () => {
    const scenes = splitScenes(SCRIPT);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].heading).toMatch(/BEDROOM/);
    expect(scenes[1].text).toContain("Who are you?");
  });

  it("drops the title page, which belongs to no scene", () => {
    expect(splitScenes(SCRIPT)[0].text).not.toContain("TWO LIVES\n\nSCENE");
  });

  it("splits on INT./EXT. slug lines too", () => {
    const s = splitScenes("INT. KITCHEN - DAY\nHe waits.\nEXT. STREET - NIGHT\nHe walks.");
    expect(s).toHaveLength(2);
    expect(s[1].heading).toMatch(/EXT\. STREET/);
  });

  it("returns nothing rather than one giant scene for a script with no headings", () => {
    expect(splitScenes("just some prose with no headings")).toEqual([]);
  });
});

describe("counting what a scene actually says", () => {
  it("counts spoken lines from speaker cues", () => {
    const scene = splitScenes(SCRIPT)[1];
    expect(countScriptDialogue(scene.text)).toBe(3);
  });

  it("does not count slug lines or sound effects as dialogue", () => {
    // "TICK." and "SCENE 1" are upper case and are not people talking.
    expect(countScriptDialogue(splitScenes(SCRIPT)[0].text)).toBe(0);
  });
});

describe("catching a scene that came back as a summary", () => {
  // The exact regression: five conversation scenes collapsed to one shot
  // each, 92 lines of dialogue across 17 shots.
  const sceneText = splitScenes(SCRIPT)[1].text;

  it("accepts a scene whose shots carry its lines", () => {
    const shots = [
      { dialogue: [{ line: "Who are you?" }, { line: "That's really what you came here to ask?" }] },
      { dialogue: [{ line: "I came here because nothing makes sense anymore." }] },
    ];
    expect(sceneIsCovered(sceneText, shots)).toBe(true);
  });

  it("rejects a three-line scene rendered as one shot with one line", () => {
    expect(sceneIsCovered(sceneText, [{ dialogue: [{ line: "Who are you?" }] }])).toBe(false);
  });

  it("does not judge a scene with almost no dialogue", () => {
    // An action scene has none, and demanding coverage of nothing would
    // retry forever.
    expect(sceneIsCovered(splitScenes(SCRIPT)[0].text, [{ dialogue: [] }])).toBe(true);
  });

  it("allows a little slack rather than demanding an exact match", () => {
    // A cue-counting heuristic over free text will never match a model's
    // reading exactly, so insisting on equality would retry good scenes
    // forever. On a ten-line scene, eight is fine and five is a summary.
    const cues = [];
    for (let i = 0; i < 10; i++) cues.push(i % 2 ? "OTHER WAEL" : "WAEL", `line ${i}`);
    const long = cues.join("\n");
    expect(countScriptDialogue(long)).toBe(10);
    const shotsWith = (n) => [{ dialogue: Array.from({ length: n }, (_, k) => ({ line: `l${k}` })) }];
    expect(sceneIsCovered(long, shotsWith(8))).toBe(true);
    expect(sceneIsCovered(long, shotsWith(5))).toBe(false);
  });
});

describe("parsing each pass", () => {
  it("refuses a structure with no scenes", () => {
    expect(parseStructureReply('{"title":"x","scenes":[]}')).toBeNull();
    expect(parseStructureReply("not json")).toBeNull();
  });

  it("reads a structure out of a fenced reply", () => {
    const out = parseStructureReply('```json\n{"title":"x","scenes":[{"id":1,"heading":"INT. A"}]}\n```');
    expect(out.title).toBe("x");
  });

  it("refuses an empty shot list", () => {
    expect(parseSceneShotsReply('{"shots":[]}')).toBeNull();
    expect(parseSceneShotsReply('{"shots":[{"id":"s1_1"}]}')).toHaveLength(1);
  });
});

describe("the shot list follows what the model can hold", () => {
  it("tells a 30-second model to let a shot run", async () => {
    // A model that holds thirty seconds does not want a cut every six.
    const { durationRules, pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    expect(durationRules({ min: 4, max: 30 })).toMatch(/ONE take/);
    expect(durationRules({ min: 4, max: 30 })).toMatch(/30/);
    // Pacing is no longer "cut less" — it is "cut on every change, and
    // hold a beat as long as that ONE beat runs".
    expect(pacingRules({ max: 30 })).toMatch(/cut on every change/i);
  });

  it("keeps the old short-clip pacing for a 10-second model", async () => {
    const { durationRules, pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    expect(durationRules({ min: 4, max: 10 })).toMatch(/never write a shot shorter/);
    // The same specificity rule applies at every take length; only the
    // "hold it longer" clause is dropped for a short-clip model.
    expect(pacingRules({ max: 10 })).toMatch(/cut on every change/i);
    expect(pacingRules({ max: 10 })).not.toMatch(/held up to/i);
  });

  it("writes the limits into the scene prompt itself", async () => {
    const { sceneShotsPrompt } = await import("@/lib/script-breakdown-passes.mjs");
    const prompt = sceneShotsPrompt({ min: 4, max: 30 });
    expect(prompt).toContain("30");
    expect(prompt).not.toContain("{{DURATION_RULES}}");
    expect(prompt).not.toContain("{{PACING_RULES}}");
  });
});

describe("beats decide the shot count, not a budget", () => {
  // An earlier version made the budget a hard ceiling and retried any
  // scene over it. That optimised for cost and produced a 28-second shot
  // carrying eight separate events — an empty chair, an occupied chair, a
  // man walking, footsteps, a voice from off-screen, him stopping, a line
  // of dialogue — which rendered as none of them. A wrong 30-second clip
  // costs exactly what a wrong 5-second clip costs and loses the scene.
  const conversation = (() => {
    const l = [];
    for (let i = 0; i < 20; i++) l.push(i % 2 ? "OTHER WAEL" : "WAEL", `line number ${i}`);
    return ["INT. THE ROOM", ...l].join("\n");
  })();

  it("offers the scene's length as SCALE, never as a limit", async () => {
    const { shotBudget, budgetRule } = await import("@/lib/script-breakdown-passes.mjs");
    const rule = budgetRule(shotBudget(conversation, { max: 30 }));
    expect(rule).toMatch(/let the beats decide/i);
    expect(rule).not.toMatch(/must not exceed/i);
  });

  it("tells the model to cut on every change", async () => {
    // "Precision beats economy" — the rule that replaced the ceiling.
    const { pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    expect(pacingRules({ max: 30 })).toMatch(/cut on every change/i);
    expect(pacingRules({ max: 30 })).toMatch(/30 seconds when a SINGLE action/i);
  });

  it("forbids packing several events into one long take", async () => {
    // The exact failure: length and content are different axes.
    const { BEAT_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(BEAT_RULE).toMatch(/ONE SHOT IS ONE BEAT/);
    expect(BEAT_RULE).toMatch(/holding ONE action longer/i);
  });

  it("still estimates a scene's length for scale", async () => {
    const { shotBudget } = await import("@/lib/script-breakdown-passes.mjs");
    expect(shotBudget(conversation, { max: 30 }).seconds).toBeGreaterThan(30);
  });
});
