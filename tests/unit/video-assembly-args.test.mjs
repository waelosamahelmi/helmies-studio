import { describe, it, expect } from "vitest";
import {
  buildTrimArgs,
  buildTransitionGraph,
  buildXfadeArgs,
  normalizeAssemblySpec,
  MAX_CLIPS,
} from "@/lib/video-assembly";

// E4.4: the ffmpeg argument builders are PURE and unit-tested — every value
// lands in an execFile args ARRAY (no shell, no string interpolation into a
// command line), trim math is validated before ffmpeg ever runs, and xfade
// offsets follow the running-duration math exactly.

describe("buildTrimArgs — per-clip -ss/-to re-encode", () => {
  it("builds an args array with the trim window after the input (accurate output-side seek)", () => {
    const args = buildTrimArgs("C:/media/in.mp4", "C:/media/out.mp4", { inSec: 1.5, outSec: 4 });

    expect(Array.isArray(args)).toBe(true);
    for (const a of args) expect(typeof a).toBe("string");

    const i = args.indexOf("-i");
    expect(args[i + 1]).toBe("C:/media/in.mp4");
    const ss = args.indexOf("-ss");
    const to = args.indexOf("-to");
    expect(ss).toBeGreaterThan(i); // output-side seek — unambiguous -to semantics
    expect(args[ss + 1]).toBe("1.5");
    expect(args[to + 1]).toBe("4");
    expect(args[args.length - 1]).toBe("C:/media/out.mp4");
    expect(args).toContain("libx264");
  });

  it("allows an open-ended trim (inSec only)", () => {
    const args = buildTrimArgs("in.mp4", "out.mp4", { inSec: 2 });
    expect(args).toContain("-ss");
    expect(args).not.toContain("-to");
  });

  it("rejects invalid trim math before ffmpeg is ever involved", () => {
    expect(() => buildTrimArgs("in.mp4", "out.mp4", { inSec: -1, outSec: 4 })).toThrow(/trim/i);
    expect(() => buildTrimArgs("in.mp4", "out.mp4", { inSec: 4, outSec: 4 })).toThrow(/trim/i);
    expect(() => buildTrimArgs("in.mp4", "out.mp4", { inSec: 5, outSec: 2 })).toThrow(/trim/i);
  });

  it("refuses injection-shaped numbers instead of stringifying them into args", () => {
    expect(() => buildTrimArgs("in.mp4", "out.mp4", { inSec: "0; rm -rf /", outSec: 4 })).toThrow(/trim/i);
    expect(() => buildTrimArgs("in.mp4", "out.mp4", { inSec: 0, outSec: "4 -vf evil" })).toThrow(/trim/i);
  });

  it("passes filenames through verbatim as standalone argv entries (execFile, no shell)", () => {
    const spicy = "C:/media/a clip with spaces & $(dollar).mp4";
    const args = buildTrimArgs(spicy, "out.mp4", { inSec: 0.5, outSec: 1 });
    expect(args).toContain(spicy); // one argv entry, never concatenated into a shell string
  });
});

describe("buildTransitionGraph — xfade offsets and cut concat", () => {
  it("computes xfade offsets from the running output duration", () => {
    const graph = buildTransitionGraph([4, 4, 4], ["fade", "fade"], 0.5);

    // First fade starts at 4 - 0.5 = 3.5; running becomes 7.5.
    expect(graph.filter).toContain("xfade=transition=fade:duration=0.5:offset=3.5");
    // Second fade starts at 7.5 - 0.5 = 7.
    expect(graph.filter).toContain("offset=7");
    expect(graph.totalDuration).toBe(11); // 4 + 3.5 + 3.5
    expect(graph.outLabel).toBe("[vout]");
  });

  it("uses a concat node for cut boundaries and mixes it with fades", () => {
    const graph = buildTransitionGraph([2, 3, 4], ["cut", "fade"], 0.5);

    expect(graph.filter).toContain("concat=n=2:v=1:a=0");
    // Cut: running = 5; fade offset = 5 - 0.5 = 4.5.
    expect(graph.filter).toContain("offset=4.5");
    expect(graph.totalDuration).toBe(8.5); // 2 + 3 + 4 - 0.5
  });

  it("maps dissolve to the dissolve xfade transition", () => {
    const graph = buildTransitionGraph([3, 3], ["dissolve"], 0.5);
    expect(graph.filter).toContain("xfade=transition=dissolve");
  });

  it("normalizes every input's fps/timebase before the chain (xfade requires it)", () => {
    const graph = buildTransitionGraph([3, 3], ["fade"], 0.5);
    expect(graph.filter).toContain("[0:v]fps=30,settb=AVTB[p0]");
    expect(graph.filter).toContain("[1:v]fps=30,settb=AVTB[p1]");
  });

  it("degrades a fade longer than its clips to a hard cut instead of failing", () => {
    const graph = buildTransitionGraph([0.4, 3], ["fade"], 2);
    expect(graph.filter).toContain("concat=n=2");
    expect(graph.filter).not.toContain("xfade");
  });

  it("rejects unknown transitions and non-positive durations", () => {
    expect(() => buildTransitionGraph([3, 3], ["star-wipe"], 0.5)).toThrow(/transition/i);
    expect(() => buildTransitionGraph([3, 0], ["fade"], 0.5)).toThrow(/duration/i);
    expect(() => buildTransitionGraph([3], [], 0.5)).toThrow(/two/i);
  });
});

describe("buildXfadeArgs — full argv for the transition render", () => {
  it("lists every input, maps the graph's output label, and stays an argv array", () => {
    const graph = buildTransitionGraph([2, 2], ["fade"], 0.5);
    const args = buildXfadeArgs(["a.mp4", "b.mp4"], graph, "out.mp4");

    for (const a of args) expect(typeof a).toBe("string");
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    const map = args.indexOf("-map");
    expect(args[map + 1]).toBe("[vout]");
    expect(args).toContain("-filter_complex");
    expect(args[args.length - 1]).toBe("out.mp4");
  });
});

describe("normalizeAssemblySpec — old and new call shapes", () => {
  it("keeps the legacy urls[] signature working (hard cuts by default)", () => {
    const spec = normalizeAssemblySpec(["https://a/1.mp4", "https://a/2.mp4"], {});
    expect(spec.clips).toEqual([{ url: "https://a/1.mp4" }, { url: "https://a/2.mp4" }]);
    expect(spec.transitions).toEqual([]);
  });

  it("legacy urls[] with an explicit transition now honors it", () => {
    const spec = normalizeAssemblySpec(["u1", "u2", "u3"], { transition: "fade" });
    expect(spec.transitions).toEqual(["fade", "fade"]);
  });

  it("accepts the clip-list form with trims and transitions", () => {
    const spec = normalizeAssemblySpec(
      { clips: [{ url: "u1", inSec: 1, outSec: 3 }, { url: "u2" }], transitions: ["dissolve"] },
      { transitionDuration: 0.3 }
    );
    expect(spec.clips[0]).toEqual({ url: "u1", inSec: 1, outSec: 3 });
    expect(spec.transitions).toEqual(["dissolve"]);
    expect(spec.transitionDuration).toBe(0.3);
  });

  it("rejects bad trims, bad transitions, and oversize clip lists", () => {
    expect(() => normalizeAssemblySpec({ clips: [{ url: "u1", inSec: -1 }] }, {})).toThrow(/trim/i);
    expect(() => normalizeAssemblySpec({ clips: [{ url: "u1", inSec: 3, outSec: 1 }] }, {})).toThrow(/trim/i);
    expect(() => normalizeAssemblySpec({ clips: [{ url: "u1" }, { url: "u2" }], transitions: ["explode"] }, {})).toThrow(/transition/i);
    expect(() => normalizeAssemblySpec([], {})).toThrow(/No videos/i);
    expect(() =>
      normalizeAssemblySpec(Array.from({ length: MAX_CLIPS + 1 }, (_, i) => `u${i}`), {})
    ).toThrow(/Too many/i);
    expect(() => normalizeAssemblySpec({ clips: [{ url: 42 }] }, {})).toThrow(/url/i);
  });

  it("clamps the transition duration into a sane band", () => {
    expect(normalizeAssemblySpec(["u1", "u2"], { transitionDuration: 99 }).transitionDuration).toBe(2);
    expect(normalizeAssemblySpec(["u1", "u2"], { transitionDuration: 0 }).transitionDuration).toBe(0.1);
    expect(normalizeAssemblySpec(["u1", "u2"], {}).transitionDuration).toBe(0.5);
  });
});
