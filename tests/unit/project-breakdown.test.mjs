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

  it("does not freeze the project's video model into every shot", () => {
    // Copying the setting here means changing the model later changes
    // nothing: the scenes keep rendering on whatever was configured the
    // day they were planned. The executor reads the current choice.
    const plan = sceneToDirectorPlan(BREAKDOWN.scenes[0], BREAKDOWN, {});
    expect(plan.shots.every((s) => s.videoStrategy.modelRoute === null)).toBe(true);
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

describe("what the person is feeling reaches the frame", () => {
  // "Did you make sure to show Wael as depressed?" — no, and there was
  // nowhere to say it. The script says "his expression is blank", which
  // is what a camera sees; a model given only that renders a man with
  // nothing wrong with him.
  const shot = {
    id: "s1", description: "Medium shot of his face as he scrolls", type: "medium", durationSec: 6,
    characters: ["wael"], offscreenVoices: [], dialogue: [], continuity: { follows: null }, sfx: [],
    performance: "hollowed out, awake for hours, going through the motions",
  };
  const bd = {
    characters: [{ key: "wael", name: "Wael", aliases: [], description: "A man in his thirties", variants: [] }],
    environments: [{ key: "bed", name: "Bedroom", description: "A small dim bedroom", lighting: "phone glow" }],
    scenes: [{ id: 1, heading: "INT. BEDROOM", summary: "", environmentKey: "bed", shots: [shot] }],
  };

  it("puts the performance into the prompt, right after what the camera sees", () => {
    const plan = sceneToDirectorPlan(bd.scenes[0], bd, {});
    const prompt = plan.shots[0].imageStrategy.prompt;
    expect(prompt).toContain("hollowed out");
    expect(prompt.indexOf("hollowed out")).toBeLessThan(prompt.indexOf("A small dim bedroom"));
  });

  it("keeps the feeling OUT of the character's identity", () => {
    // A mood written into an identity drags itself into the reference
    // photographs and then into every scene, including the ones where he
    // is furious or frightened.
    const wanted = castFromBreakdown(bd);
    expect(wanted.find((w) => w.name === "Wael").description).not.toMatch(/hollow|depress|sad/i);
  });

  it("still builds a prompt for a shot with no direction", () => {
    const bare = { ...bd, scenes: [{ ...bd.scenes[0], shots: [{ ...shot, performance: "" }] }] };
    expect(sceneToDirectorPlan(bare.scenes[0], bare, {}).shots[0].imageStrategy.prompt)
      .toContain("Medium shot of his face");
  });
});

describe("objects that must not change between shots", () => {
  // "The phone is different." Props did not exist in the breakdown at all,
  // so nothing held them still — the same failure as an untracked room, on
  // a smaller scale and just as visible.
  const withProps = {
    characters: [{ key: "wael", name: "Wael", aliases: [], description: "", variants: [] }],
    environments: [{ key: "bed", name: "Bedroom", description: "", lighting: "" }],
    props: [
      { key: "phone", name: "His phone", description: "A black slab phone, cracked corner" },
      { key: "extra", name: "A passing car", description: "seen once" },
    ],
    scenes: [{
      id: 1, heading: "INT. BEDROOM", summary: "", environmentKey: "bed",
      shots: [
        { id: "s1", description: "he holds the phone", type: "medium", durationSec: 6,
          characters: ["wael"], props: ["phone"], offscreenVoices: [], dialogue: [], continuity: { follows: null }, sfx: [] },
        { id: "s2", description: "he puts the phone down", type: "closeup", durationSec: 5,
          characters: ["wael"], props: ["phone", "extra"], offscreenVoices: [], dialogue: [], continuity: { follows: "s1" }, sfx: [] },
      ],
    }],
  };

  it("makes an identity for a prop the script keeps returning to", () => {
    const wanted = castFromBreakdown(withProps);
    const phone = wanted.find((w) => w.name === "His phone");
    expect(phone).toBeTruthy();
    expect(phone.kind).toBe("product");
  });

  it("does not make one for something seen once", () => {
    // Nothing can contradict a single appearance, so an identity for it is
    // clutter in the cast and a coverage pack nobody will ever look at.
    expect(castFromBreakdown(withProps).some((w) => w.name === "A passing car")).toBe(false);
  });

  it("attaches the prop's references to the shots it appears in", () => {
    const ids = new Map([["wael", "e_wael"], ["bed", "e_bed"], ["phone", "e_phone"]]);
    const plan = sceneToDirectorPlan(withProps.scenes[0], withProps, { entityIdByKey: ids });
    expect(plan.shots[0].entityIds).toContain("e_phone");
    expect(plan.shots[1].entityIds).toContain("e_phone");
  });
});

describe("telling a man from his double", () => {
  // Both Waels rendered in identical clothes: the breakdown declares
  // variants and their differences, and nothing ever put those words in a
  // prompt. The face is deliberately identical — so the wardrobe is the
  // only thing an audience can use.
  const bd = {
    characters: [{
      key: "wael", name: "Wael", aliases: ["Other Wael"], description: "A man in his thirties",
      variants: [
        { name: "Wael", differences: "grey t-shirt, no glasses, unshaven" },
        { name: "Other Wael", differences: "black shirt buttoned to the collar, thin wire glasses" },
      ],
    }],
    environments: [{ key: "void", name: "The Void", description: "black space", lighting: "one beam" }],
    scenes: [{
      id: 4, heading: "INT. THE VOID", summary: "", environmentKey: "void",
      shots: [{
        id: "s4_1", description: "Two-shot of the two men", type: "medium", durationSec: 8,
        characters: ["wael"], characterVariant: "Other Wael", offscreenVoices: [],
        dialogue: [
          { speaker: "wael", speakerVariant: "Wael", line: "Who are you?" },
          { speaker: "wael", speakerVariant: "Other Wael", line: "Better?" },
        ],
        continuity: { follows: null }, sfx: [],
      }],
    }],
  };

  it("puts BOTH versions' wardrobe into the prompt", () => {
    const plan = sceneToDirectorPlan(bd.scenes[0], bd, {});
    const prompt = plan.shots[0].imageStrategy.prompt;
    expect(prompt).toContain("wire glasses");
    expect(prompt).toContain("grey t-shirt");
  });

  it("names each version so the wardrobe attaches to the right man", () => {
    const plan = sceneToDirectorPlan(bd.scenes[0], bd, {});
    expect(plan.shots[0].imageStrategy.prompt).toMatch(/Other Wael: black shirt/);
  });

  it("says nothing when a character has no declared differences", () => {
    const plain = {
      ...bd,
      characters: [{ key: "wael", name: "Wael", aliases: [], description: "", variants: [] }],
    };
    const plan = sceneToDirectorPlan(plain.scenes[0], plain, {});
    expect(plan.shots[0].imageStrategy.prompt).not.toMatch(/undefined|: $/);
  });

  it("does not repeat a variant mentioned twice in one shot", () => {
    const plan = sceneToDirectorPlan(bd.scenes[0], bd, {});
    const prompt = plan.shots[0].imageStrategy.prompt;
    expect(prompt.match(/wire glasses/g)).toHaveLength(1);
  });
});

describe("which mouth moves", () => {
  // Two recurring failures from the same silence in the prompt: a line
  // spoken by BOTH men at once, and a line coming out of the wrong one.
  // The clip gets "Spoken aloud: Wael: Not tonight." and two people in
  // frame with — by design — the same face.
  it("names the one person speaking and silences the other", async () => {
    const { speakingDirection } = await import("@/lib/project-breakdown.mjs");
    const out = speakingDirection({
      subjects: ["Wael", "Other Wael"],
      dialogue: "Other Wael: Sit.",
    });
    expect(out).toMatch(/Only Other Wael speaks/);
    expect(out).toMatch(/Wael does not speak here/);
    expect(out).toMatch(/mouth stays closed/);
  });

  it("keeps an off-screen voice out of everyone's mouth", async () => {
    // The beat is a man deliberately not turning around. Without this he
    // ends up mouthing the woman's line himself.
    const { speakingDirection } = await import("@/lib/project-breakdown.mjs");
    const out = speakingDirection({ subjects: ["Wael"], dialogue: "Woman: Where are you going?" });
    expect(out).toMatch(/Woman is NOT in this shot/);
    expect(out).toMatch(/nobody on camera mouths it/);
    expect(out).toMatch(/Wael does not speak here/);
  });

  it("makes two speakers take turns rather than chorus", async () => {
    const { speakingDirection } = await import("@/lib/project-breakdown.mjs");
    const out = speakingDirection({
      subjects: ["Wael", "Other Wael"],
      dialogue: "Wael: Who are you?\nOther Wael: Better?",
    });
    expect(out).toMatch(/one at a time, never together/);
    expect(out).not.toMatch(/does not speak/);
  });

  it("says nothing at all about a silent shot", async () => {
    // A sentence about silence only invites the model to animate it.
    const { speakingDirection } = await import("@/lib/project-breakdown.mjs");
    expect(speakingDirection({ subjects: ["Wael"], dialogue: null })).toBeNull();
    expect(speakingDirection({})).toBeNull();
  });

  it("matches a subject to its speaker label despite the variant suffix", async () => {
    // subjects carry "Wael (bedroom)" while the line says "Wael".
    const { speakingDirection, dialogueSpeakers } = await import("@/lib/project-breakdown.mjs");
    expect(dialogueSpeakers({ dialogue: "Wael (bedroom): No.\nWael (bedroom): Stop." })).toEqual(["Wael (bedroom)"]);
    const out = speakingDirection({ subjects: ["Wael (bedroom)"], dialogue: "Wael: No." });
    expect(out).toMatch(/Only Wael speaks/);
    expect(out).not.toMatch(/NOT in this shot/);
  });
});
