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
  opParams,
} from "@/lib/music-timeline-core.mjs";

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

  it("Extend carries continueAt from the selection", () => {
    expect(opParams("upload-and-extend-audio", { track, range: { start: 45, end: 60 }, duration: 120 }).continueAt).toBe(45);
    expect(opParams("upload-and-extend-audio", { track, range: fullRange(120), duration: 120 }).continueAt).toBe(120);
  });

  it("Replace section carries the infill window and maps style to tags", () => {
    const p = opParams("replace-section", { track, range: { start: 10, end: 30 }, duration: 120, prompt: "quieter", style: "ambient" });
    expect(p).toMatchObject({ infillStartS: 10, infillEndS: 30, prompt: "quieter", tags: "ambient" });
  });

  it("whole-track ops send no range fields", () => {
    for (const id of ["upload-and-cover-audio", "add-vocals", "add-instrumental", "separate-vocals"]) {
      const p = opParams(id, { track, range: { start: 10, end: 30 }, duration: 120, prompt: "p" });
      expect(p.continueAt, id).toBeUndefined();
      expect(p.infillStartS, id).toBeUndefined();
    }
  });
});
