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
  it("treats the model's limit as a ceiling, never as a target", async () => {
    // The old rule said "the model can hold 30s, SO LET A SHOT RUN", which
    // turned capacity into the target: three steps across a room got eight
    // seconds and a two-word line got seven. Scenes came out far longer
    // than they play.
    const { durationRules, pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    const rule = durationRules({ min: 4, max: 30 });
    expect(rule).toMatch(/CEILING, NOT A TARGET/);
    expect(rule).toMatch(/30/);
    expect(rule).not.toMatch(/let a shot RUN/i);
    expect(pacingRules({ max: 30 })).toMatch(/FEWEST CAMERA SETUPS/);
  });

  it("gives measurable anchors instead of an adjective", async () => {
    // "Let it run" is interpretable; "two words a second" is not.
    const { durationRules } = await import("@/lib/script-breakdown-passes.mjs");
    const rule = durationRules({ min: 4, max: 30 });
    expect(rule).toMatch(/TWO WORDS PER SECOND/i);
    expect(rule).toMatch(/Not tonight/);
    expect(rule).toMatch(/crossing a room/i);
  });

  it("says the same thing to a short-clip model", async () => {
    // Length follows content at every take length — only the numbers move.
    const { durationRules, pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    const rule = durationRules({ min: 4, max: 10 });
    expect(rule).toMatch(/CEILING, NOT A TARGET/);
    expect(rule).toMatch(/minimum 4 seconds, maximum 10/);
    expect(pacingRules({ max: 10 })).toMatch(/FEWEST CAMERA SETUPS/);
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

  it("cuts when the camera must move, not every time something happens", async () => {
    // "Cut on every change" over-corrected: a man crossing a room to a
    // chair came back as TEN camera setups. A beat is a unit of action; a
    // shot is a unit of camera; they are not the same thing.
    const { pacingRules } = await import("@/lib/script-breakdown-passes.mjs");
    const rule = pacingRules({ max: 30 });
    expect(rule).toMatch(/FEWEST CAMERA SETUPS/);
    expect(rule).toMatch(/A NEW SPEAKER IS NOT A NEW SHOT/);
    expect(rule).toMatch(/THREE or FOUR shots/);
    expect(rule).toMatch(/It is not ten/);
    expect(rule).toMatch(/30 seconds when a SINGLE action/i);
  });

  it("does not let an off-screen voice move the camera", async () => {
    // The beat rule used to force a split on "a sound arriving from
    // off-screen", which is exactly how the woman's two lines became two
    // extra setups in a scene where nobody turns around.
    const { pacingRules, BEAT_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(pacingRules({ max: 30 })).toMatch(/never a reason to move the camera/i);
    expect(BEAT_RULE).toMatch(/is NOT one of these/);
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

describe("a man and his double must be dressed differently", () => {
  // The face is identical ON PURPOSE — that is what makes the reveal work.
  // So the clothes are the only thing an audience has, and a structure
  // that returns two variants wearing the same thing renders a two-shot of
  // the same man twice. Which is exactly what came back.
  const character = (variants, aliases = ["Other Wael"]) => ({ name: "Wael", aliases, variants });

  it("accepts two versions that look different", async () => {
    const { variantsAreDistinct } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantsAreDistinct([character([
      { name: "Wael", differences: "grey t-shirt, unshaven, no glasses" },
      { name: "Other Wael", differences: "black buttoned shirt, thin wire glasses" },
    ])])).toBe(true);
  });

  it("catches two versions wearing the same thing", async () => {
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    const problems = variantProblems([character([
      { name: "Wael", differences: "black shirt and trousers" },
      { name: "Other Wael", differences: "Black shirt and trousers" },
    ])]);
    expect(problems[0]).toMatch(/same thing/i);
  });

  it("catches a variant that says it looks the same as the other one", async () => {
    // Verbatim from the read: agreement with the letter of the request and
    // the exact opposite of its point.
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([
      { name: "Wael", differences: "grey t-shirt, unshaven" },
      { name: "Other Wael", differences: "Same clothing and appearance as Wael but with a calm, knowing demeanor" },
    ])])[0]).toMatch(/looking the same as another version/i);
  });

  it("catches a variant that describes a situation instead of a wardrobe", async () => {
    // Also verbatim. The note is pasted into EVERY shot the man appears in,
    // so "lying in bed" put him in bed while he stood in a black void.
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([
      { name: "Wael (bedroom)", differences: "Wearing a plain t-shirt and shorts, lying in bed" },
      { name: "Other Wael", differences: "black buttoned shirt, wire glasses" },
    ])])[0]).toMatch(/where he is or what he is doing/i);
  });

  it("catches a variant that is only a mood", async () => {
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([
      { name: "Wael", differences: "grey t-shirt, unshaven" },
      { name: "Other Wael", differences: "calm, knowing, quietly confident" },
    ])])[0]).toMatch(/cannot photograph a mood/i);
  });

  it("names which variant is at fault, not just the character", async () => {
    // "Wael is wrong" sends the whole structure back. "Wael / Other Wael is
    // wrong" tells it which line to rewrite.
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([
      { name: "Wael", differences: "grey t-shirt, unshaven" },
      { name: "Other Wael", differences: "seated in the chair" },
    ])])[0]).toContain("Wael / Other Wael");
  });

  it("catches a variant with no visible difference at all", async () => {
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([
      { name: "Wael", differences: "grey t-shirt, unshaven" },
      { name: "Other Wael", differences: "" },
    ])])[0]).toMatch(/no visible difference/i);
  });

  it("catches a double declared with only one variant", async () => {
    const { variantProblems } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantProblems([character([{ name: "Wael", differences: "grey t-shirt" }])])[0])
      .toMatch(/fewer than two variants/i);
  });

  it("says nothing about a character who is only ever himself", async () => {
    // One version has nothing to be confused with, and demanding a
    // wardrobe contrast would fail every ordinary character.
    const { variantsAreDistinct } = await import("@/lib/script-breakdown-passes.mjs");
    expect(variantsAreDistinct([{ name: "Woman", aliases: [], variants: [] }])).toBe(true);
  });

  it("names the problem in the retry so it can be fixed, not guessed at", async () => {
    const { VARIANT_RETRY_HINT } = await import("@/lib/script-breakdown-passes.mjs");
    const hint = VARIANT_RETRY_HINT(["Wael has two variants wearing the same thing."]);
    expect(hint).toContain("Wael has two variants wearing the same thing.");
    expect(hint).toMatch(/glasses on one and not the other/i);
  });
});

describe("a voice the script keeps off-screen never gets a face", () => {
  // SCENE 3 writes WOMAN (O.S.) — she calls from behind Wael and the beat
  // is that he does not turn around. The read listed her among the shot's
  // visible characters, which puts her in frame; with no photograph of her
  // on file that is a different woman every time she appears.
  const SCENE = `SCENE 3 — THE ROOM

Wael stands in the darkness.

WOMAN (O.S.)
Wael?

He stops. Doesn't turn.

WAEL
Not tonight.`;

  it("reads the off-screen tags out of the script", async () => {
    const { offscreenSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const names = offscreenSpeakers(SCENE);
    expect(names.has("woman")).toBe(true);
    expect(names.has("wael")).toBe(false);
  });

  it("takes her out of frame and leaves her voice in", async () => {
    const { keepOffscreenOffscreen } = await import("@/lib/script-breakdown-passes.mjs");
    const [shot] = keepOffscreenOffscreen(
      [{ characters: ["wael", "woman"], dialogue: [{ speaker: "woman", line: "Wael?" }] }],
      SCENE,
    );
    expect(shot.characters).toEqual(["wael"]);
    expect(shot.offscreenVoices).toContain("woman");
    // The line is never removed. She still speaks; the camera stays on him.
    expect(shot.dialogue).toHaveLength(1);
  });

  it("matches a slug key against the script's spelling", async () => {
    const { keepOffscreenOffscreen } = await import("@/lib/script-breakdown-passes.mjs");
    const [shot] = keepOffscreenOffscreen(
      [{ characters: ["young_woman"] }],
      "YOUNG WOMAN (V.O.)\nWael?",
    );
    expect(shot.characters).toEqual([]);
  });

  it("leaves a scene with no off-screen voices completely alone", async () => {
    const { keepOffscreenOffscreen } = await import("@/lib/script-breakdown-passes.mjs");
    const shots = [{ characters: ["wael", "woman"] }];
    // Same array back, not a rebuilt copy — nothing to do means nothing done.
    expect(keepOffscreenOffscreen(shots, "WAEL\nHello.")).toBe(shots);
  });

  it("does not strip someone who is on screen in this scene and off in another", async () => {
    // The tag is read per scene, which is the only place it is true.
    const { offscreenSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    expect(offscreenSpeakers("WOMAN\nI'm right here.").has("woman")).toBe(false);
  });
});

describe("a montage is one shot, and a room keeps its furniture", () => {
  it("keeps a rush of flashes in a single generation", async () => {
    // "ONE SHOT IS ONE BEAT" split a memory flood — hallway, woman turning,
    // hands, rain, mirror — into eight separate four-second clips. Each
    // rendered as a calm little scene, which is the opposite of a montage,
    // and it cost eight generations to get there.
    const { MONTAGE_RULE, sceneShotsPrompt } = await import("@/lib/script-breakdown-passes.mjs");
    expect(MONTAGE_RULE).toMatch(/MONTAGE OR A RUSH OF FLASHES IS ONE SHOT/);
    expect(MONTAGE_RULE).toMatch(/flashing is the beat/i);
    expect(sceneShotsPrompt({ min: 4, max: 30 })).toContain("ONE SHOT");
  });

  it("keeps the beat rule from contradicting the montage rule", async () => {
    // Two rules in one prompt, one saying split and one saying don't. The
    // beat rule has to name the exception or the read picks whichever it
    // read last.
    const { BEAT_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(BEAT_RULE).toMatch(/ONE exception is a montage/i);
  });

  it("makes every shot restate where the furniture and the people are", async () => {
    // Two chairs facing each other, one empty: shot to shot they moved,
    // changed number, and both men ended up in the same one. Each shot is
    // generated alone and knows only its own description.
    const { BLOCKING_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(BLOCKING_RULE).toMatch(/IN EVERY SHOT, IDENTICALLY/);
    expect(BLOCKING_RULE).toMatch(/who occupies which chair/i);
  });

  it("puts all three rules in the prompt with no placeholders left", async () => {
    const { sceneShotsPrompt } = await import("@/lib/script-breakdown-passes.mjs");
    const prompt = sceneShotsPrompt({ min: 4, max: 30 }, null);
    for (const token of ["{{BEAT_RULE}}", "{{MONTAGE_RULE}}", "{{BLOCKING_RULE}}", "{{PACING_RULES}}", "{{DURATION_RULES}}"]) {
      expect(prompt).not.toContain(token);
    }
    expect(prompt).toMatch(/RUSH OF FLASHES/);
    expect(prompt).toMatch(/PHYSICAL ARRANGEMENT/);
  });
});

describe("people underplay, so the direction has to", () => {
  // Every performance note came back at the top of its range: "eyes wide,
  // mouth slightly open", "a sharp intake of breath, his face hardening",
  // "frustration boils over". A model renders whatever you name, so the
  // film played as a run of soap-opera reaction shots — wrong for a script
  // about a man too tired to be sure which life is his.
  it("asks for what is held back, not what is shown", async () => {
    const { ACTING_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(ACTING_RULE).toMatch(/DIRECT THE PERFORMANCE DOWN, NEVER UP/);
    expect(ACTING_RULE).toMatch(/HOLDING BACK/);
  });

  it("names the stock gestures it will not accept", async () => {
    // A general plea for subtlety is ignorable. A list is not.
    const { ACTING_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    for (const tic of ["eyes widening", "gasping", "trembling", "boiling over", "visceral"]) {
      expect(ACTING_RULE.toLowerCase()).toContain(tic.toLowerCase());
    }
  });

  it("shows the difference rather than describing it", async () => {
    const { ACTING_RULE } = await import("@/lib/script-breakdown-passes.mjs");
    expect(ACTING_RULE).toMatch(/Bad:/);
    expect(ACTING_RULE).toMatch(/Good:/);
    // The good example is behaviour a camera can photograph.
    expect(ACTING_RULE).toMatch(/voice is completely level/);
  });

  it("points the performance field at the same rule", async () => {
    // Two instructions about acting in one prompt, one asking for the face
    // and one asking for restraint, is how the melodrama got back in.
    const { sceneShotsPrompt } = await import("@/lib/script-breakdown-passes.mjs");
    const prompt = sceneShotsPrompt({ min: 4, max: 30 });
    expect(prompt).not.toContain("{{ACTING_RULE}}");
    expect(prompt).toMatch(/written DOWN per the acting rule above/);
    expect(prompt).not.toMatch(/what the face and body are doing/);
  });
});

describe("a shot is as long as what happens in it", () => {
  // Asked for in the prompt twice and still padded: eight seconds for a
  // man standing still, eight for a wide of an empty room, four for a
  // two-word line. Computed rather than requested, same as the wardrobe.
  const limits = { min: 2, max: 30 };

  it("gives a two-word line the time to say it and no more", async () => {
    // "Not tonight." is a TWO second shot. Padding by two seconds and
    // flooring at four made it four, and an actor who finishes speaking
    // while the clip runs on reads as the frame freezing.
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    expect(neededSeconds({ durationSec: 8, dialogue: [{ line: "Not tonight." }] }, limits)).toBe(2);
    expect(neededSeconds({ durationSec: 4, dialogue: [{ line: "Sit." }] }, limits)).toBe(2);
    expect(neededSeconds({ durationSec: 8, dialogue: [{ line: "Where are you going?" }] }, limits)).toBe(3);
  });

  it("gives a long speech the room it needs", async () => {
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    const line = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    // 40 words at two a second, plus the pause and the beat after.
    expect(neededSeconds({ durationSec: 25, dialogue: [{ line }] }, limits)).toBe(21);
  });

  it("drops a silent action beat to the floor", async () => {
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    expect(neededSeconds({ durationSec: 8, description: "He walks toward the chairs." }, limits)).toBe(2);
  });

  it("believes a shot that says it is being held", async () => {
    // The script's own word is better evidence than any number the read
    // attached to it — "silence", "slowly", "lingers".
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    const held = { durationSec: 8, description: "They face each other. Silence." };
    expect(neededSeconds(held, limits)).toBe(8);
    expect(neededSeconds({ durationSec: 7, description: "He slowly lowers himself in." }, limits)).toBe(7);
  });

  it("only ever shortens", async () => {
    // A read asking for less than the content needs is a different problem,
    // and lengthening on a guess invents footage nobody asked for.
    const { tightenDurations } = await import("@/lib/script-breakdown-passes.mjs");
    const shots = [{ durationSec: 3, dialogue: [{ line: "a b c d e f g h i j" }] }];
    expect(tightenDurations(shots, limits)[0].durationSec).toBe(3);
  });

  it("returns an already-tight shot untouched", async () => {
    const { tightenDurations } = await import("@/lib/script-breakdown-passes.mjs");
    const shot = { durationSec: 2, description: "He walks." };
    expect(tightenDurations([shot], limits)[0]).toBe(shot);
  });

  it("never goes under the model's own declared minimum", async () => {
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    // A model that really does refuse anything under 5 still gets 5.
    expect(neededSeconds({ durationSec: 9, description: "He walks." }, { min: 5, max: 10 })).toBe(5);
  });

  it("counts the words across every line in the shot", async () => {
    const { spokenWords } = await import("@/lib/script-breakdown-passes.mjs");
    expect(spokenWords({ dialogue: [{ line: "Where are you going?" }, { line: "Not tonight." }] })).toBe(6);
    expect(spokenWords({ dialogue: [] })).toBe(0);
    expect(spokenWords({})).toBe(0);
  });
});

describe("the screenplay says who speaks, not the read", () => {
  // Scene 3 came back with "Not tonight." spoken by Other Wael. The script
  // puts it under WAEL — the man walking says it, the seated silhouette
  // says "Sit." two beats later. Backwards, that swaps the two men in the
  // scene that introduces them, and since the variant follows the speaker
  // it puts them both in the same clothes too.
  const SCENE = `SCENE 3 — THE ROOM

Wael stands in the darkness.
STEP.

WOMAN (O.S.)
Where are you going?

WAEL
Not tonight.

He reaches the chair.

SILHOUETTE
Sit.`;

  it("reads each line's speaker off the character cue", async () => {
    const { scriptSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const by = scriptSpeakers(SCENE);
    expect(by.get("not tonight")).toBe("WAEL");
    expect(by.get("sit")).toBe("SILHOUETTE");
    expect(by.get("where are you going")).toBe("WOMAN");
  });

  it("does not mistake a sound effect for a character", async () => {
    // "STEP." is capitals on its own line and nobody says it.
    const { scriptSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    expect([...scriptSpeakers(SCENE).values()]).not.toContain("STEP");
  });

  it("takes the line back off the wrong man", async () => {
    const { attributeSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const [shot] = attributeSpeakers(
      [{ dialogue: [{ speaker: "Other Wael", speakerVariant: "Other Wael", line: "Not tonight." }] }],
      SCENE,
    );
    expect(shot.dialogue[0].speaker).toBe("WAEL");
    expect(shot.dialogue[0].speakerVariant).toBe("WAEL");
  });

  it("leaves a line the script does not contain exactly as it is", async () => {
    // A paraphrase is the read's own. Rewriting its speaker on a guess is
    // worse than leaving it alone.
    const { attributeSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const shots = [{ dialogue: [{ speaker: "Other Wael", line: "Something he never says." }] }];
    expect(attributeSpeakers(shots, SCENE)[0]).toBe(shots[0]);
  });

  it("leaves a correctly attributed line untouched", async () => {
    const { attributeSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const shots = [{ dialogue: [{ speaker: "SILHOUETTE", line: "Sit." }] }];
    expect(attributeSpeakers(shots, SCENE)[0]).toBe(shots[0]);
  });

  it("matches regardless of punctuation and case", async () => {
    const { attributeSpeakers } = await import("@/lib/script-breakdown-passes.mjs");
    const [shot] = attributeSpeakers([{ dialogue: [{ speaker: "x", line: "not tonight" }] }], SCENE);
    expect(shot.dialogue[0].speaker).toBe("WAEL");
  });
});

describe("a montage is the one shot that must not be trimmed", () => {
  // The montage rule folds a memory flood into a single clip; the duration
  // clamp then cut it to two seconds — six images, a voice and an
  // acceleration, in the time it takes to say "Not tonight."
  const limits = { min: 2, max: 30 };
  const montage = {
    durationSec: 10,
    description: "A rapid series of flashes, each under a second: a hallway, a woman turning, hands almost touching, rain on glass, a mirror.",
  };

  it("keeps the length the read gave a series of flashes", async () => {
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    expect(neededSeconds(montage, limits)).toBe(10);
  });

  it("still floors an ordinary silent action shot", async () => {
    // The exemption is for a series, not for every shot without dialogue.
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    expect(neededSeconds({ durationSec: 8, description: "He walks to the chair." }, limits)).toBe(2);
  });

  it("does not let a montage run past what the model can hold", async () => {
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    expect(neededSeconds({ ...montage, durationSec: 90 }, limits)).toBe(30);
  });
});

describe("a direction written in the scene wins over the rules", () => {
  it("makes ONE UNBROKEN TAKE binding, above every other rule", async () => {
    // The beat, blocking and pacing rules all push toward splitting. A
    // director who writes "no cuts" on the page has to outrank them, or
    // the tool cannot be told how to shoot anything.
    const { sceneShotsPrompt } = await import("@/lib/script-breakdown-passes.mjs");
    const prompt = sceneShotsPrompt({ min: 2, max: 30 });
    expect(prompt).toMatch(/OVERRIDES EVERY RULE BELOW/);
    expect(prompt).toMatch(/ONE UNBROKEN TAKE/);
    expect(prompt).toMatch(/return exactly ONE shot/);
    // It has to come before the rules it overrides, or "below" is a lie.
    expect(prompt.indexOf("OVERRIDES EVERY RULE BELOW")).toBeLessThan(prompt.indexOf("ONE SHOT IS ONE BEAT"));
  });

  it("gives a six-line exchange the seconds to say it in one take", async () => {
    // The new scene: 53 words across six lines, which has to fit inside a
    // 30-second take or it cannot be one shot at all.
    const { neededSeconds } = await import("@/lib/script-breakdown-passes.mjs");
    const lines = [
      "Alright, alright. Tell me who is she?",
      "Who is who?",
      "You know who I'm talking about!",
      "You still didn't recognise?",
      "She is another version of you. Your head created her to fulfil what you're missing. Caring. Sharing.",
      "You just wanted someone who is like you to share your life. So you created her.",
    ].map((line) => ({ line }));
    const seconds = neededSeconds({ durationSec: 30, dialogue: lines }, { min: 2, max: 30 });
    expect(seconds).toBeGreaterThan(24);
    expect(seconds).toBeLessThanOrEqual(30);
  });
});
