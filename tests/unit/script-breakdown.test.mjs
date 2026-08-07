import { describe, it, expect } from "vitest";
import {
  parseScriptBreakdown,
  allShots,
  breakdownSummary,
  continuityChains,
  SCRIPT_BREAKDOWN_SYSTEM_PROMPT,
  normalizeShotType,
  coverageWarnings,
} from "@/lib/script-breakdown.mjs";

// Shaped after the real TWO LIVES breakdown: one face, two versions of him,
// a dark room, and a clock that never stops.
const RAW = {
  title: "Two Lives",
  logline: "A man meets the version of himself that kept going.",
  aspectRatio: "2.39:1",
  characters: [
    {
      key: "wael",
      name: "Wael",
      aliases: ["OTHER WAEL", "SILHOUETTE"],
      description: "A man in his thirties, tired eyes, short dark hair.",
      variants: [
        { name: "present", differences: "Plain t-shirt, exhausted, uncertain." },
        { name: "other", differences: "Same face, composed, harder light on one side." },
      ],
      dialogueLineCount: 24,
    },
    { key: "woman", name: "Woman", description: "Heard, never seen.", dialogueLineCount: 2 },
  ],
  environments: [
    { key: "bedroom", name: "Bedroom", description: "A dark bedroom at night.", lighting: "Moonlight through blinds" },
    { key: "the_room", name: "The Room", description: "Infinite black space, one beam of light.", lighting: "Single hard top light" },
  ],
  scenes: [
    {
      id: 1,
      heading: "INT. BEDROOM — NIGHT",
      summary: "Wael lies awake. The clock ticks.",
      environmentKey: "bedroom",
      shots: [
        { id: "s1_1", description: "Black screen. A wall clock.", type: "insert", durationSec: 4, characters: [], dialogue: [], continuity: { follows: null }, sfx: ["clock tick"] },
        { id: "s1_2", description: "Extreme closeup of Wael's open eye.", type: "extreme_closeup", durationSec: 5, characters: ["wael"], characterVariant: "present", dialogue: [], continuity: { follows: "s1_1" }, sfx: ["clock tick"] },
        { id: "s1_3", description: "The clock reads 02:47.", type: "insert", durationSec: 3, characters: [], dialogue: [], continuity: { follows: "s1_2" }, sfx: ["silence"] },
      ],
    },
    {
      id: 3,
      heading: "INT. THE ROOM",
      summary: "Wael walks into the light and meets himself.",
      environmentKey: "the_room",
      shots: [
        { id: "s3_1", description: "Wide. Two chairs in a beam of light.", type: "wide", durationSec: 7, characters: [], offscreenVoices: ["woman"], dialogue: [{ speaker: "woman", line: "Wael..." }], continuity: { follows: null }, sfx: ["footstep"] },
        {
          id: "s3_2",
          description: "Wael sits. The other raises his head.",
          type: "medium",
          durationSec: 8,
          characters: ["wael"],
          characterVariant: "other",
          dialogue: [{ speaker: "wael", speakerVariant: "other", line: "You're late." }],
          continuity: { follows: "s3_1" },
          sfx: [],
        },
      ],
    },
  ],
  music: { description: "Low drone, one piano note.", cueSheet: [{ fromSceneId: 3, description: "Drone enters." }] },
};

const wrap = (obj) => "Here you go:\n```json\n" + JSON.stringify(obj) + "\n```\nHope that helps.";

describe("SCRIPT_BREAKDOWN_SYSTEM_PROMPT", () => {
  it("carries every rule a real breakdown got wrong on the first run", () => {
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/SAME face/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/aliases/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/minimum 4 seconds, maximum 10/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/offscreenVoices/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/speakerVariant/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/25-35 shots/);
    expect(SCRIPT_BREAKDOWN_SYSTEM_PROMPT).toMatch(/COVERAGE IS NOT OPTIONAL/);
  });
});

describe("parseScriptBreakdown", () => {
  it("reads a fenced reply surrounded by commentary", () => {
    const b = parseScriptBreakdown(wrap(RAW));
    expect(b.title).toBe("Two Lives");
    expect(b.aspectRatio).toBe("2.39:1");
    expect(b.scenes).toHaveLength(2);
  });

  it("keeps one character with two variants rather than splitting the face", () => {
    const b = parseScriptBreakdown(wrap(RAW));
    const wael = b.characters.find((c) => c.key === "wael");
    expect(b.characters).toHaveLength(2);
    expect(wael.aliases).toContain("OTHER WAEL");
    expect(wael.variants.map((v) => v.name)).toEqual(["present", "other"]);
  });

  it("clamps shot durations into what video models actually accept", () => {
    const long = structuredClone(RAW);
    long.scenes[0].shots[0].durationSec = 45;
    long.scenes[0].shots[1].durationSec = 0.5;
    const shots = allShots(parseScriptBreakdown(wrap(long)));
    expect(shots[0].durationSec).toBe(10);
    // Floor is 4, not 2: a 2-second clip bills exactly like a 5-second one,
    // so a sub-minimum shot is pure waste.
    expect(shots[1].durationSec).toBe(4);
  });

  it("defaults an unknown shot type and drops a self-referential continuity link", () => {
    const odd = structuredClone(RAW);
    odd.scenes[0].shots[0].type = "dutch_spinny_thing";
    odd.scenes[0].shots[0].continuity = { follows: "s1_1" };
    const shots = allShots(parseScriptBreakdown(wrap(odd)));
    expect(shots[0].type).toBe("medium");
    expect(shots[0].continuity.follows).toBeNull();
  });

  it("rejects a reply with no shots, no scenes, or no json at all", () => {
    expect(parseScriptBreakdown("no json here")).toBeNull();
    expect(parseScriptBreakdown(wrap({ title: "x" }))).toBeNull();
    expect(parseScriptBreakdown(wrap({ ...RAW, scenes: [{ id: 1, shots: [] }] }))).toBeNull();
  });
});

describe("breakdownSummary", () => {
  const summary = breakdownSummary(parseScriptBreakdown(wrap(RAW)));

  it("counts the production honestly", () => {
    expect(summary.shotCount).toBe(5);
    expect(summary.sceneCount).toBe(2);
    expect(summary.totalSeconds).toBe(4 + 5 + 4 + 7 + 8); // the 3s insert is floored to 4
    expect(summary.dialogueLineCount).toBe(2);
  });

  it("flags only the characters we actually have to SEE as needing a reference", () => {
    const wael = summary.characters.find((c) => c.key === "wael");
    const woman = summary.characters.find((c) => c.key === "woman");
    expect(wael.needsReference).toBe(true);
    expect(wael.shotCount).toBe(2);
    // The woman is a voice off-screen — asking the user for her photo would
    // be a wasted question and a wasted identity pack.
    expect(woman.needsReference).toBe(false);
    // She still needs a VOICE — she has a line, she just never has a face.
    expect(woman.needsVoice).toBe(true);
    expect(woman.offscreenShotCount).toBe(1);
  });

  it("collects the sound cues the film needs", () => {
    expect(summary.sfxCues).toContain("clock tick");
    expect(summary.needsMusic).toBe(true);
  });
});

describe("continuityChains", () => {
  it("groups shots that must carry the frame forward", () => {
    expect(continuityChains(parseScriptBreakdown(wrap(RAW)))).toEqual([
      ["s1_1", "s1_2", "s1_3"],
      ["s3_1", "s3_2"],
    ]);
  });

  it("still emits a shot whose continuity points at a missing id", () => {
    const orphan = structuredClone(RAW);
    orphan.scenes[1].shots[1].continuity = { follows: "does_not_exist" };
    const chains = continuityChains(parseScriptBreakdown(wrap(orphan)));
    expect(chains.flat()).toContain("s3_2");
    expect(chains.flat()).toHaveLength(5); // nothing dropped
  });

  it("does not loop forever on a cycle", () => {
    const cyclic = structuredClone(RAW);
    cyclic.scenes[1].shots[0].continuity = { follows: "s3_2" };
    cyclic.scenes[1].shots[1].continuity = { follows: "s3_1" };
    const chains = continuityChains(parseScriptBreakdown(wrap(cyclic)));
    expect(chains.flat().sort()).toEqual(["s1_1", "s1_2", "s1_3", "s3_1", "s3_2"]);
  });
});

describe("regressions from the first real TWO LIVES breakdown", () => {
  it("coerces an invented variant name back onto one the character declared", () => {
    // The live run answered "default" for 41 of 88 shots. For a film whose
    // whole premise is which version of him we are looking at, that is not a
    // usable answer.
    const invented = structuredClone(RAW);
    invented.scenes[0].shots[1].characterVariant = "default";
    const shots = allShots(parseScriptBreakdown(wrap(invented)));
    expect(shots[1].characterVariant).toBe("present");
  });

  it("never leaves a visible character without a variant", () => {
    const missing = structuredClone(RAW);
    delete missing.scenes[0].shots[1].characterVariant;
    const shots = allShots(parseScriptBreakdown(wrap(missing)));
    expect(shots[1].characterVariant).toBe("present");
  });

  it("keeps a shot with nobody in it free of a variant", () => {
    const shots = allShots(parseScriptBreakdown(wrap(RAW)));
    expect(shots[0].characters).toEqual([]);
    expect(shots[0].characterVariant).toBeNull();
  });

  it("attributes each line to the version of the character that speaks it", () => {
    const shots = allShots(parseScriptBreakdown(wrap(RAW)));
    const line = shots[4].dialogue[0];
    expect(line.speaker).toBe("wael");
    expect(line.speakerVariant).toBe("other");
  });

  it("accepts the older 'character' spelling on a dialogue line rather than dropping it", () => {
    const legacy = structuredClone(RAW);
    legacy.scenes[1].shots[1].dialogue = [{ character: "wael", line: "You're late." }];
    const shots = allShots(parseScriptBreakdown(wrap(legacy)));
    expect(shots[4].dialogue[0].speaker).toBe("wael");
  });

  it("splits a runaway continuity chain so the production can still fan out", () => {
    // The live run produced a single 58-shot chain: every shot waiting on the
    // one before it, drift compounding the whole way down.
    const long = structuredClone(RAW);
    long.scenes[0].shots = Array.from({ length: 12 }, (_, i) => ({
      id: `s1_${i + 1}`,
      description: `Shot ${i + 1}`,
      type: "medium",
      durationSec: 5,
      characters: [],
      dialogue: [],
      continuity: { follows: i === 0 ? null : `s1_${i}` },
      sfx: [],
    }));
    const chains = continuityChains(parseScriptBreakdown(wrap(long)));
    const sceneOne = chains.filter((c) => c[0].startsWith("s1_"));
    expect(Math.max(...sceneOne.map((c) => c.length))).toBeLessThanOrEqual(5);
    expect(sceneOne.flat()).toHaveLength(12); // split, never dropped
  });
});

describe("normalizeShotType", () => {
  it("accepts how people actually write shot types", () => {
    expect(normalizeShotType("extreme close-up")).toBe("extreme_closeup");
    expect(normalizeShotType("ECU")).toBe("extreme_closeup");
    expect(normalizeShotType("Close Up")).toBe("closeup");
    expect(normalizeShotType("wide shot")).toBe("wide");
    expect(normalizeShotType("OTS")).toBe("over_shoulder");
    expect(normalizeShotType("cutaway")).toBe("insert");
    expect(normalizeShotType("point of view")).toBe("pov");
  });

  it("recovers the type from a longer phrase before giving up", () => {
    expect(normalizeShotType("extreme close-up of an eye")).toBe("extreme_closeup");
    expect(normalizeShotType("wide establishing")).toBe("wide");
  });

  it("falls back to medium only when there is genuinely nothing to read", () => {
    expect(normalizeShotType("")).toBe("medium");
    expect(normalizeShotType(null)).toBe("medium");
    expect(normalizeShotType("interpretive dance")).toBe("medium");
  });

  it("the shot type reaches selectEntityReferences as a usable purpose", () => {
    // The type is what decides face-vs-body references. A run where every
    // shot collapsed to "medium" would have fed the wrong reference to 33 of
    // 34 shots without a single error anywhere.
    const b = parseScriptBreakdown(wrap({
      ...RAW,
      scenes: [{ ...RAW.scenes[0], shots: [{ ...RAW.scenes[0].shots[1], type: "extreme close-up" }] }],
    }));
    expect(allShots(b)[0].type).toBe("extreme_closeup");
  });
});

describe("coverageWarnings", () => {
  const SCRIPT = `
## SCENE 1
### INT. BEDROOM — NIGHT
A clock ticks.
**WAEL** Not tonight.
**WOMAN (O.S.)** Where are you going?

## SCENE 2
### INT. THE ROOM
**SILHOUETTE** You're late.
**WAEL** For what?
`;

  it("catches a breakdown that quietly merged or dropped scenes", () => {
    const oneScene = parseScriptBreakdown(wrap({ ...RAW, scenes: [RAW.scenes[0]] }));
    const warnings = coverageWarnings(oneScene, SCRIPT);
    expect(warnings.join(" ")).toMatch(/scenes were merged or dropped/i);
  });

  it("catches a breakdown that dropped the writer's dialogue", () => {
    const noLines = structuredClone(RAW);
    for (const scene of noLines.scenes) for (const shot of scene.shots) shot.dialogue = [];
    const warnings = coverageWarnings(parseScriptBreakdown(wrap(noLines)), SCRIPT);
    expect(warnings.join(" ")).toMatch(/dialogue was cut/i);
  });

  it("stays quiet when coverage is honest, and when there is no script to compare", () => {
    const full = structuredClone(RAW);
    full.scenes[0].shots[0].dialogue = [
      { speaker: "wael", line: "Not tonight." },
      { speaker: "woman", line: "Where are you going?" },
    ];
    full.scenes[1].shots[0].dialogue = [{ speaker: "wael", speakerVariant: "other", line: "For what?" }];
    expect(coverageWarnings(parseScriptBreakdown(wrap(full)), SCRIPT)).toEqual([]);
    expect(coverageWarnings(parseScriptBreakdown(wrap(RAW)), "")).toEqual([]);
  });
});
