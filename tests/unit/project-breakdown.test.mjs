import { describe, it, expect } from "vitest";
import {
  sceneToDirectorPlan, breakdownToScenes, castFromBreakdown,
  matchExistingEntities, shotPrompt, shotDialogue, speakerLabel,
} from "@/lib/project-breakdown.mjs";

const BREAKDOWN = {
  title: "TWO LIVES",
  toneReferences: "desaturated, single practical source, heavy grain",
  characters: [
    { key: "wael", name: "Wael", aliases: [], description: "Man in his thirties", variants: [] },
    { key: "other_wael", name: "Other Wael", aliases: ["silhouette"], description: "The same man", variants: [] },
    { key: "woman_voice", name: "Woman", aliases: [], description: "Never seen", variants: [] },
  ],
  environments: [
    { key: "bedroom", name: "Bedroom", description: "A small bedroom", lighting: "phone glow" },
    { key: "the_room", name: "The Room", description: "Endless black space", lighting: "one beam" },
  ],
  scenes: [
    {
      id: 1, heading: "INT. BEDROOM — NIGHT", summary: "Wael scrolls, then sleeps", environmentKey: "bedroom",
      shots: [
        { id: "s1_1", description: "Wael on his back holding a phone", type: "medium", durationSec: 6,
          characters: ["wael"], offscreenVoices: [], dialogue: [], continuity: { follows: null }, sfx: ["reel audio"], notes: "" },
        { id: "s1_2", description: "The wall clock", type: "insert", durationSec: 4,
          characters: [], offscreenVoices: [], dialogue: [], continuity: { follows: "s1_1" }, sfx: ["tick"], notes: "" },
      ],
    },
    {
      id: 3, heading: "INT. THE ROOM", summary: "Wael walks to the chairs", environmentKey: "the_room",
      shots: [
        { id: "s3_1", description: "Two chairs under a beam", type: "wide", durationSec: 8,
          characters: ["wael"], offscreenVoices: ["woman_voice"],
          dialogue: [{ speaker: "wael", line: "Not tonight." }], continuity: { follows: null }, sfx: [], notes: "" },
      ],
    },
    {
      id: 4, heading: "INT. THE ROOM — THE MEETING", summary: "The face is revealed", environmentKey: "the_room",
      shots: [
        { id: "s4_1", description: "The light reveals the other man's face", type: "closeup", durationSec: 5,
          characters: ["other_wael"], offscreenVoices: [],
          dialogue: [{ speaker: "other_wael", line: "Better?" }], continuity: { follows: "s3_1" }, sfx: [], notes: "" },
      ],
    },
  ],
};

describe("a scene becomes a shot board", () => {
  it("keeps the shots in order and carries the project's aspect ratio, not the script's", () => {
    // The breakdown proposes a ratio; the PROJECT decides it. That is the
    // whole reason the setting lives up there.
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[0], BREAKDOWN, { aspectRatio: "9:16" });
    expect(plan.shots.map((s) => s.id)).toEqual(["s1_1", "s1_2"]);
    expect(plan.shots.map((s) => s.index)).toEqual([0, 1]);
    expect(plan.shots.every((s) => s.aspectRatio === "9:16")).toBe(true);
  });

  it("puts the place and the grade into every prompt, so shot 3 is the same room as shot 1", () => {
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[0], BREAKDOWN, {});
    expect(plan.shots[0].imageStrategy.prompt).toContain("A small bedroom");
    expect(plan.shots[0].imageStrategy.prompt).toContain("phone glow");
    expect(plan.shots[0].imageStrategy.prompt).toContain("heavy grain");
  });

  it("starts every clip from its still", () => {
    // The stills exist so a wrong face costs an image instead of a video.
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[0], BREAKDOWN, {});
    expect(plan.shots.every((s) => s.videoStrategy.mode === "i2v")).toBe(true);
  });

  it("keeps dialogue OUT of the image prompt and in its own field", () => {
    // A model handed the words draws them on the frame.
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[1], BREAKDOWN, {});
    expect(plan.shots[0].dialogue).toBe("Wael: Not tonight.");
    expect(plan.shots[0].imageStrategy.prompt).not.toContain("Not tonight");
  });

  it("does not paint an offscreen voice into the frame", () => {
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[1], BREAKDOWN, {});
    expect(plan.shots[0].subjects).toEqual(["Wael"]);
  });

  it("attaches the entity ids of who is visible plus the place", () => {
    const ids = new Map([["wael", "ent_wael"], ["the_room", "ent_room"], ["woman_voice", "ent_woman"]]);
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[1], BREAKDOWN, { entityIdByKey: ids });
    expect(plan.shots[0].entityIds).toEqual(["ent_wael", "ent_room"]);
    // The woman is heard, never seen — her reference would paint a stranger in.
    expect(plan.shots[0].entityIds).not.toContain("ent_woman");
  });

  it("preserves the continuity link so a shot can chain from the previous frame", () => {
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[0], BREAKDOWN, {});
    expect(plan.shots[0].continuity).toEqual([]);
    expect(plan.shots[1].continuity).toEqual(["s1_1"]);
  });

  it("gives every scene of the film a board, in screenplay order", () => {
    const boards = breakdownToScenes(BREAKDOWN, { aspectRatio: "9:16" });
    expect(boards).toHaveLength(3);
    expect(boards[0].title).toBe("INT. BEDROOM — NIGHT");
    expect(boards[1].plan.shots).toHaveLength(1);
  });
});

describe("what has to exist as an identity", () => {
  it("names the people and the places the film actually uses", () => {
    const wanted = castFromBreakdown(BREAKDOWN);
    expect(wanted.filter((w) => w.kind === "character").map((w) => w.name).sort())
      .toEqual(["Other Wael", "Wael", "Woman"]);
    expect(wanted.filter((w) => w.kind === "environment").map((w) => w.name).sort())
      .toEqual(["Bedroom", "The Room"]);
  });

  it("leaves out a character the script never actually puts in a shot", () => {
    const unused = { ...BREAKDOWN, characters: [...BREAKDOWN.characters, { key: "ghost", name: "Ghost", aliases: [], description: "", variants: [] }] };
    expect(castFromBreakdown(unused).some((w) => w.name === "Ghost")).toBe(false);
  });

  it("reuses a character that already has real photographs instead of shadowing them", () => {
    // The failure this prevents: a second, empty "Wael" beside the built
    // one, so half the film renders a stranger.
    const wanted = castFromBreakdown(BREAKDOWN);
    const { matched, missing } = matchExistingEntities(wanted, [
      { id: "ent_wael", kind: "character", name: "Wael" },
      { id: "ent_bedroom", kind: "environment", name: "Bedroom" },
    ]);
    expect(matched.get("wael")).toBe("ent_wael");
    expect(matched.get("bedroom")).toBe("ent_bedroom");
    expect(missing.map((m) => m.name).sort()).toEqual(["Other Wael", "The Room", "Woman"]);
  });

  it("matches on name regardless of case and padding", () => {
    const { matched } = matchExistingEntities(
      [{ key: "wael", kind: "character", name: "Wael" }],
      [{ id: "e1", kind: "character", name: "  WAEL " }],
    );
    expect(matched.get("wael")).toBe("e1");
  });

  it("never matches a character to an environment of the same name", () => {
    const { matched, missing } = matchExistingEntities(
      [{ key: "room", kind: "environment", name: "The Room" }],
      [{ id: "e1", kind: "character", name: "The Room" }],
    );
    expect(matched.size).toBe(0);
    expect(missing).toHaveLength(1);
  });
});

describe("prompt and dialogue helpers", () => {
  it("survives a shot with no environment and no tone", () => {
    expect(shotPrompt({ description: "A face" }, {})).toBe("A face");
  });
  it("returns null rather than an empty line for a silent shot", () => {
    expect(shotDialogue({ dialogue: [] })).toBeNull();
    expect(shotDialogue({})).toBeNull();
  });
  it("names the speaker by their real name, not their key", () => {
    const map = new Map([["wael", { name: "Wael" }]]);
    expect(shotDialogue({ dialogue: [{ speaker: "wael", line: "Sit." }] }, map)).toBe("Wael: Sit.");
  });
});

describe("a person and their double", () => {
  // The breakdown is RIGHT to merge them into one character: the reveal
  // works precisely because both faces come from an identical reference
  // set. But the shot must still say who is speaking.
  const DOUBLE = {
    characters: [{ key: "wael", name: "Wael", aliases: ["Other Wael"], description: "", variants: [] }],
    environments: [],
    scenes: [{
      id: 4, heading: "INT. THE VOID", summary: "", environmentKey: null,
      shots: [{
        id: "s4_1", description: "The two of them across the chairs", type: "medium", durationSec: 8,
        characters: ["wael", "wael"], offscreenVoices: [],
        dialogue: [
          { speaker: "wael", line: "Who are you?" },
          { speaker: "wael", speakerVariant: "Other Wael", line: "That's really what you came here to ask?" },
        ],
        continuity: { follows: null }, sfx: [], notes: "",
      }],
    }],
  };

  it("names the variant so a two-hander is not both lines under one name", () => {
    const plan = sceneToDirectorPlan(DOUBLE.scenes[0], DOUBLE, {});
    expect(plan.shots[0].dialogue).toBe("Wael: Who are you?\nOther Wael: That's really what you came here to ask?");
  });

  it("does not repeat the same name in the subjects", () => {
    // ["Wael", "Wael"] tells the model nothing and reads as a bug.
    const plan = sceneToDirectorPlan(DOUBLE.scenes[0], DOUBLE, {});
    expect(plan.shots[0].subjects).toEqual(["Wael"]);
  });

  it("keeps the base name when a variant is a mood rather than a name", () => {
    expect(speakerLabel("wael", "weary", new Map([["wael", { name: "Wael" }]]))).toBe("Wael (weary)");
    expect(speakerLabel("wael", "Other Wael", new Map([["wael", { name: "Wael" }]]))).toBe("Other Wael");
  });
});
