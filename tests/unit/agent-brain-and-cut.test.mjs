import { describe, it, expect } from "vitest";
import {
  LLM_MODELS, DEFAULT_LLM, llmModel, canSee, canHear, resolveLlm, llmChoices,
} from "../../src/lib/llm-models.mjs";
import {
  attachmentKind, absoluteUrl, buildUserParts, audioPart, contentText,
} from "../../src/lib/agent-multimodal.mjs";
import { buildAudioGraph, beatAlignedCuts } from "../../src/lib/final-cut.js";

describe("the LLM registry", () => {
  it("defaults to a brain that can both see and hear", () => {
    // The entire reason this file exists: attachments and voice notes are
    // silently dropped by a text-only model, and the reply never says so.
    expect(canSee(DEFAULT_LLM)).toBe(true);
    expect(canHear(DEFAULT_LLM)).toBe(true);
    expect(llmModel(DEFAULT_LLM).reasoning).toBe(true);
  });

  it("is honest that DeepSeek is blind and deaf", () => {
    // Measured against OpenRouter's live model list: every DeepSeek row
    // lists ["text"] and nothing else.
    for (const m of LLM_MODELS.filter((x) => x.id.startsWith("deepseek/"))) {
      expect(m.modalities).toEqual(["text"]);
      expect(m.label).toMatch(/TEXT ONLY/);
    }
  });

  it("substitutes a capable model rather than sending an image into the void", () => {
    const r = resolveLlm("deepseek/deepseek-v4-pro", { needs: ["text", "image"] });
    expect(r.substituted).toBe("deepseek/deepseek-v4-pro");
    expect(canSee(r.id)).toBe(true);
    expect(r.missing).toContain("image");
  });

  it("leaves a capable choice alone", () => {
    const r = resolveLlm(DEFAULT_LLM, { needs: ["text", "image", "audio"] });
    expect(r.substituted).toBeNull();
    expect(r.id).toBe(DEFAULT_LLM);
  });

  it("substitutes the CHEAPEST model that covers the need", () => {
    const r = resolveLlm("deepseek/deepseek-v4-flash", { needs: ["audio"] });
    const able = LLM_MODELS.filter((m) => m.modalities.includes("audio")).sort((a, b) => a.inputPerM - b.inputPerM)[0];
    expect(r.id).toBe(able.id);
  });

  it("falls back to the default for an id it has never heard of", () => {
    expect(resolveLlm("someone/invented-this", { needs: ["text"] }).id).toBe(DEFAULT_LLM);
  });

  it("offers a per-turn price, because $/M means nothing to somebody choosing", () => {
    for (const c of llmChoices()) {
      expect(c.approxTurnUsd).toBeGreaterThan(0);
      expect(c.modalities).toContain("text");
    }
  });
});

describe("attachments reaching the model", () => {
  it("knows what a file is from its mime type or its url", () => {
    expect(attachmentKind({ type: "image/png" })).toBe("image");
    expect(attachmentKind({ url: "/uploads/a.JPG" })).toBe("image");
    expect(attachmentKind({ url: "/uploads/a.mp3" })).toBe("audio");
    expect(attachmentKind({ url: "/uploads/a.mp4" })).toBe("video");
    expect(attachmentKind({ url: "/uploads/a.pdf" })).toBe("file");
  });

  it("makes urls absolute, because the provider is not on our host", () => {
    expect(absoluteUrl("/api/media/local/a.png", "https://studio.helmies.fi"))
      .toBe("https://studio.helmies.fi/api/media/local/a.png");
    expect(absoluteUrl("https://x.com/a.png", "https://studio.helmies.fi")).toBe("https://x.com/a.png");
  });

  it("sends images as content parts with the text leading", () => {
    const parts = buildUserParts("Make me a superhero film", [{ url: "/uploads/me.png", type: "image/png" }], { baseUrl: "https://s.fi" });
    expect(Array.isArray(parts)).toBe(true);
    expect(parts[0].type).toBe("text");
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: "https://s.fi/uploads/me.png" } });
  });

  it("stays a plain string when nothing was attached", () => {
    expect(buildUserParts("just words", [])).toBe("just words");
  });

  it("NAMES what it cannot inline instead of dropping it", () => {
    // Silently discarding an attachment is the exact bug this module exists
    // to end; discarding only the awkward ones would be the same bug.
    const parts = buildUserParts("here", [{ url: "/uploads/a.mp4", type: "video/mp4", name: "clip.mp4" }], { baseUrl: "https://s.fi" });
    expect(parts[0].text).toContain("clip.mp4");
    expect(parts[0].text).toContain("Also attached");
  });

  it("shapes an audio part the way the provider expects", () => {
    expect(audioPart("AAAA", "webm")).toEqual({ type: "input_audio", input_audio: { data: "AAAA", format: "webm" } });
  });

  it("reads the text back out of a parts array for the transcript", () => {
    expect(contentText([{ type: "text", text: "hello" }, { type: "image_url", image_url: { url: "x" } }])).toBe("hello");
    expect(contentText("plain")).toBe("plain");
  });
});

describe("finishing the cut", () => {
  it("normalises music alone when the clips are silent", () => {
    // amix with a missing input does not fail — it halves the level of the
    // one that IS there, and the film comes out inexplicably soft.
    const g = buildAudioGraph({ hasClipAudio: false, musicIndex: 1, seconds: 25 });
    expect(g).not.toContain("amix");
    expect(g).toContain("loudnorm");
    expect(g).toContain("[aout]");
  });

  it("ducks the score under the clips when they have audio", () => {
    const g = buildAudioGraph({ hasClipAudio: true, musicIndex: 1, seconds: 25 });
    expect(g).toContain("sidechaincompress");
    expect(g).toContain("amix");
    expect(g).toContain("[aout]");
  });

  it("can be told not to duck", () => {
    expect(buildAudioGraph({ hasClipAudio: true, musicIndex: 1, seconds: 10, duckDialogue: false }))
      .not.toContain("sidechaincompress");
  });

  it("ends the music with the picture", () => {
    const g = buildAudioGraph({ hasClipAudio: false, musicIndex: 1, seconds: 25, fadeOut: 1.2 });
    expect(g).toContain("atrim=0:25.000");
    expect(g).toContain("afade=t=out:st=23.800");
  });

  it("never lets the fade run past the halfway point of a short cut", () => {
    const g = buildAudioGraph({ hasClipAudio: false, musicIndex: 1, seconds: 1, fadeOut: 10 });
    expect(g).toContain("afade=t=out:st=0.500");
  });
});

describe("beatAlignedCuts", () => {
  it("returns plain cumulative cuts when there is no tempo", () => {
    expect(beatAlignedCuts([2, 3, 4])).toEqual([2, 5, 9]);
  });

  it("nudges a cut onto the nearest beat", () => {
    // 120bpm = a beat every 0.5s. A clip ending at 2.4 belongs on 2.5.
    const cuts = beatAlignedCuts([2.4, 2.6], { bpm: 120 });
    expect(cuts[0]).toBe(2.5);
  });

  it("refuses to DRAG a cut — a clip is nudged or left alone", () => {
    // A cut a whole second from the nearest beat would lose the shot's
    // ending, which is worse than being slightly off the grid.
    const cuts = beatAlignedCuts([3.0, 2.0], { bpm: 7.5, maxNudge: 0.35 });
    expect(cuts[0]).toBe(3);
  });

  it("always ends on the real total, never on a beat past it", () => {
    const cuts = beatAlignedCuts([2.4, 2.6], { bpm: 120 });
    expect(cuts[cuts.length - 1]).toBeCloseTo(5.1, 1);
  });

  it("survives an empty or nonsense list", () => {
    expect(beatAlignedCuts([])).toEqual([]);
    expect(beatAlignedCuts(null)).toEqual([]);
  });
});
