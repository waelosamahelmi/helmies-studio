// S2 — Music timeline range math. The component translates pointer events
// into these calls; the arithmetic under test is what the grips, the Extend
// continueAt and the replace-section infill window actually submit.
import { describe, it, expect } from "vitest";
import {
  MIN_RANGE_S,
  clampTime,
  timeAtRatio,
  fullRange,
  normalizeRange,
  moveRangeEdge,
  continueAtFor,
  replaceWindow,
  replaceWindowIssue,
  isMusicTrackModel,
  TRACK_OPS,
  STEM_TYPES,
  DEFAULT_NEGATIVE_TAGS,
  opParams,
  opIssue,
  trackTitle,
} from "@/lib/music-timeline-core.mjs";
import { schemaForModel, validateModelInput } from "@/lib/model-catalog-core.mjs";

describe("range math", () => {
  it("clamps times to the track", () => {
    expect(clampTime(-5, 120)).toBe(0);
    expect(clampTime(500, 120)).toBe(120);
    expect(clampTime(NaN, 120)).toBe(0);
    expect(clampTime(30, 0)).toBe(0);
  });

  it("maps bar ratios to seconds", () => {
    expect(timeAtRatio(0.5, 120)).toBe(60);
    expect(timeAtRatio(-1, 120)).toBe(0);
    expect(timeAtRatio(2, 120)).toBe(120);
  });

  it("normalizeRange orders, clamps and enforces the minimum span", () => {
    expect(normalizeRange({ start: 80, end: 20 }, 120)).toEqual({ start: 20, end: 80 });
    expect(normalizeRange({ start: -10, end: 500 }, 120)).toEqual({ start: 0, end: 120 });
    const tiny = normalizeRange({ start: 60, end: 60.2 }, 120);
    expect(tiny.end - tiny.start).toBeCloseTo(MIN_RANGE_S);
    // Pinned against the track end: start yields instead.
    const atEnd = normalizeRange({ start: 120, end: 120 }, 120);
    expect(atEnd).toEqual({ start: 120 - MIN_RANGE_S, end: 120 });
  });

  it("moveRangeEdge never lets a grip cross its partner", () => {
    const r = { start: 20, end: 80 };
    expect(moveRangeEdge(r, "l", 95, 120).start).toBe(80 - MIN_RANGE_S);
    expect(moveRangeEdge(r, "r", 5, 120).end).toBe(20 + MIN_RANGE_S);
    expect(moveRangeEdge(r, "l", -50, 120).start).toBe(0);
    expect(moveRangeEdge(r, "r", 999, 120).end).toBe(120);
    // An ordinary move just moves.
    expect(moveRangeEdge(r, "l", 30, 120)).toEqual({ start: 30, end: 80 });
  });
});

describe("continueAtFor (Extend)", () => {
  it("uses the selected point when the user narrowed the selection", () => {
    expect(continueAtFor({ start: 42.34, end: 60 }, 120)).toBe(42.3);
  });
  it("uses the track end when the selection still covers the whole track", () => {
    expect(continueAtFor(fullRange(120), 120)).toBe(120);
    expect(continueAtFor(null, 90)).toBe(90);
  });
  it("is 0 with no known duration", () => {
    expect(continueAtFor({ start: 10, end: 20 }, 0)).toBe(0);
  });
});

describe("replace-section window", () => {
  it("emits the selected range as infillStartS/infillEndS", () => {
    expect(replaceWindow({ start: 12.51, end: 31.24 }, 120)).toEqual({ infillStartS: 12.5, infillEndS: 31.2 });
  });
  it("names the violated rule: under 6s, over 60s, over half the track", () => {
    expect(replaceWindowIssue({ start: 10, end: 14 }, 120)).toMatch(/at least 6 seconds/);
    expect(replaceWindowIssue({ start: 0, end: 61 }, 200)).toMatch(/at most 60 seconds/);
    expect(replaceWindowIssue({ start: 0, end: 30 }, 50)).toMatch(/at most half/);
    expect(replaceWindowIssue({ start: 10, end: 30 }, 120)).toBeNull();
    expect(replaceWindowIssue({ start: 0, end: 10 }, 0)).toMatch(/Load the track/);
  });
});

describe("track-list membership", () => {
  it("keeps track-producing Suno families and excludes text/voice producers and non-audio", () => {
    for (const id of ["generate-music", "suno-v4.5-plus", "upload-and-extend-audio", "replace-section", "separate-vocals", "generate-sounds"]) {
      expect(isMusicTrackModel(id), id).toBe(true);
    }
    for (const id of ["generate-lyrics", "boost-music-style", "suno-voice-validate", "suno-voice-generate", "elevenlabs/text-to-speech-multilingual-v2", "kling-2.6/text-to-video", ""]) {
      expect(isMusicTrackModel(id), id).toBe(false);
    }
  });
});

describe("opParams — the same object quotes and submits", () => {
  const track = { outputUrl: "/api/media/local/track-1.mp3" };

  it("every op listed in TRACK_OPS produces params carrying the track's URL", () => {
    for (const op of TRACK_OPS) {
      const p = opParams(op.id, { track, range: { start: 10, end: 30 }, duration: 120, prompt: "x" });
      expect(p.audio_url, op.id).toBe(track.outputUrl);
    }
  });

  // Field names are the SCHEMA's. A camelCase spelling sails past
  // validateModelInput undeclared, so a required infill_start_s read as missing.
  it("Extend carries continue_at from the selection — and omits it when no length is known", () => {
    expect(opParams("upload-and-extend-audio", { track, range: { start: 45, end: 60 }, duration: 120 }).continue_at).toBe(45);
    expect(opParams("upload-and-extend-audio", { track, range: fullRange(120), duration: 120 }).continue_at).toBe(120);
    // Audio Tools has no timeline: no length, no continue_at, a default extend.
    expect(opParams("upload-and-extend-audio", { track })).toEqual({ audio_url: track.outputUrl });
  });

  it("Replace section carries the infill window, the style, a title and the new words", () => {
    const p = opParams("replace-section", { track, range: { start: 10, end: 30 }, duration: 120, prompt: "quieter", style: "ambient" });
    expect(p).toMatchObject({ infill_start_s: 10, infill_end_s: 30, prompt: "quieter", full_lyrics: "quieter", style: "ambient" });
    expect(p.title).toBeTruthy();
  });

  it("whole-track ops send no range fields", () => {
    for (const id of ["upload-and-cover-audio", "add-vocals", "add-instrumental", "separate-vocals"]) {
      const p = opParams(id, { track, range: { start: 10, end: 30 }, duration: 120, prompt: "p" });
      expect(p.continue_at, id).toBeUndefined();
      expect(p.infill_start_s, id).toBeUndefined();
    }
  });
});

/* add-vocals / add-instrumental: 0 of 5 in production. Their schema REQUIRES
   title, style and negative_tags; neither surface sent all three. */
describe("opParams — the fields add-vocals and add-instrumental require", () => {
  const made = { outputUrl: "https://cdn/t.mp3", params: { title: "Helmies Anthem", style: "cinematic electronic" }, prompt: "an anthem" };
  const attached = { outputUrl: "https://cdn/u.mp3", name: "take 3 (final).mp3" };

  it("defaults the title to the track's own name, and negative_tags to the two things nobody wants", () => {
    expect(opParams("add-vocals", { track: made, prompt: "sing it" })).toMatchObject({ title: "Helmies Anthem", negative_tags: DEFAULT_NEGATIVE_TAGS });
    expect(opParams("add-instrumental", { track: attached, prompt: "warm jazz trio" }).title).toBe("take 3 (final)");
    expect(trackTitle({})).toBe("Untitled track");
  });

  it("takes the style from the user, else from the track it was made with — never from nowhere", () => {
    expect(opParams("add-vocals", { track: made, prompt: "sing it", style: "breathy alto" }).style).toBe("breathy alto");
    expect(opParams("add-vocals", { track: made, prompt: "sing it" }).style).toBe("cinematic electronic");
    expect(opParams("add-vocals", { track: attached, prompt: "sing it" }).style).toBeUndefined();
  });

  it("add-instrumental has no lyric brief: what the user typed IS its style", () => {
    const p = opParams("add-instrumental", { track: attached, prompt: "warm jazz trio" });
    expect(p).toEqual({ audio_url: attached.outputUrl, style: "warm jazz trio", title: "take 3 (final)", negative_tags: DEFAULT_NEGATIVE_TAGS });
    expect(p.prompt).toBeUndefined();
  });

  it("every required field of the real schemas is satisfied by what the two surfaces send", () => {
    for (const [id, args] of [
      ["add-vocals", { track: made, prompt: "sing it" }],
      ["add-instrumental", { track: attached, prompt: "warm jazz trio" }],
      ["separate-vocals", { track: attached }],
      ["replace-section", { track: made, range: { start: 10, end: 30 }, duration: 120, prompt: "quieter" }],
      ["upload-and-extend-audio", { track: made, range: { start: 45, end: 60 }, duration: 120 }],
    ]) {
      const params = opParams(id, args);
      expect(opIssue(id, params), id).toBeNull();
      expect(validateModelInput(schemaForModel(id, "audio"), params), id).toEqual([]);
    }
  });

  it("opIssue names the missing field before a quote is ever taken", () => {
    expect(opIssue("add-vocals", opParams("add-vocals", { track: attached, prompt: "sing it" }))).toMatch(/style/i);
    expect(opIssue("add-vocals", opParams("add-vocals", { track: made }))).toMatch(/describe/i);
    expect(opIssue("add-instrumental", opParams("add-instrumental", { track: attached }))).toMatch(/style/i);
    expect(opIssue("separate-vocals", opParams("separate-vocals", { track: null }))).toMatch(/track/i);
  });
});

describe("separate-vocals — the split is a price, so it is a choice", () => {
  it("sends the chosen type, the cheapest by default, and never one the model does not have", () => {
    const track = { outputUrl: "https://cdn/t.mp3" };
    expect(opParams("separate-vocals", { track }).type).toBe("separate_vocal");
    expect(opParams("separate-vocals", { track, stemType: "split_stem" }).type).toBe("split_stem");
    expect(opParams("separate-vocals", { track, stemType: "everything" }).type).toBe("separate_vocal");
    expect(STEM_TYPES.map((t) => t.value).sort()).toEqual(["separate_vocal", "split_stem", "split_stem_advanced"]);
    expect(opParams("separate-vocals", { track, prompt: "ignored" }).prompt).toBeUndefined();
  });
});
