import { describe, it, expect } from "vitest";
import {
  escapeDrawtext,
  trackedWidth,
  capHeight,
  glyphPositions,
  alphaExpr,
  cursorAlphaExpr,
  lineFilters,
  layoutRow,
  buildCardFilters,
  beatGrid,
  snapToBeat,
  centeredBaseline,
  FONT_WEIGHTS,
} from "../../src/lib/title-cards.mjs";

describe("escapeDrawtext", () => {
  it("escapes the characters ffmpeg reads as syntax", () => {
    // A colon is a parameter separator: unescaped, "COMING: 09.09.2026" is a
    // broken filter, not a broken sentence — it fails loudly or truncates.
    expect(escapeDrawtext("COMING: 09.09.2026")).toBe("COMING\\: 09.09.2026");
    expect(escapeDrawtext("100%")).toBe("100\\%");
    expect(escapeDrawtext("it's")).toBe("it\\'s");
  });

  it("escapes backslashes before the escapes it introduces", () => {
    expect(escapeDrawtext("a\\b")).toBe("a\\\\b");
  });

  it("leaves the date the whole ad ends on untouched", () => {
    expect(escapeDrawtext("09.09.2026")).toBe("09.09.2026");
  });
});

describe("measurement", () => {
  it("agrees with what ffmpeg actually draws", () => {
    // Calibrated against real renders: ink width for this line at 200px
    // measured 1382px, and the prediction includes the last glyph's right
    // side bearing, so it reads a shade wider.
    const px = trackedWidth("EVEN THIS AD.", { weight: "black", size: 200 });
    expect(px).toBeGreaterThan(1370);
    expect(px).toBeLessThan(1410);
  });

  it("counts tracking in the gaps between glyphs, not after the last one", () => {
    const plain = trackedWidth("AB", { size: 100 });
    const tracked = trackedWidth("AB", { size: 100, tracking: 0.5 });
    expect(tracked - plain).toBeCloseTo(50, 5); // exactly one gap
  });

  it("is zero for empty text", () => {
    expect(trackedWidth("", { size: 100 })).toBe(0);
  });

  it("falls back rather than throwing on a glyph it has no metrics for", () => {
    expect(trackedWidth("☃", { size: 100 })).toBeGreaterThan(0);
  });

  it("knows the cap height, which is what a line of capitals is as tall as", () => {
    expect(capHeight({ weight: "black", size: 200 })).toBeCloseTo(143, 0);
  });
});

describe("glyphPositions", () => {
  it("advances past a space without drawing one", () => {
    const g = glyphPositions("A B", { size: 100 });
    expect(g.map((x) => x.char)).toEqual(["A", "B"]);
    // The B still sits beyond the space's advance.
    expect(g[1].dx).toBeGreaterThan(g[0].dx + 70);
  });

  it("gives every glyph the ink height that puts it on a shared baseline", () => {
    const [e, dot] = glyphPositions("E.", { weight: "black", size: 200 });
    // The period's ink rises far less than a capital's — which is exactly
    // why anchoring both by their ink top floated it up the line.
    expect(e.dy).toBeCloseTo(143, 0);
    expect(dot.dy).toBeCloseTo(40, 0);
    expect(dot.dy).toBeLessThan(e.dy);
  });

  it("hangs a descender below the baseline", () => {
    const [g] = glyphPositions("g", { weight: "black", size: 200 });
    // A "g" rises less than a capital and its tail falls under the line;
    // drawn from the same baseline that comes out right on its own.
    expect(g.dy).toBeLessThan(capHeight({ weight: "black", size: 200 }));
  });
});

describe("alpha", () => {
  it("is dark before the line starts and after it ends", () => {
    const e = alphaExpr({ start: 1, duration: 2, fadeIn: 0.5, fadeOut: 0.5 });
    expect(e).toContain("lt(t,1)");
    expect(e).toContain("3");
  });

  it("never lets a fade run past the middle of the line", () => {
    // A 0.4s clip cannot hold a 2s fade in AND out; clamping is what keeps
    // the expression monotonic instead of inverting.
    const e = alphaExpr({ start: 0, duration: 0.4, fadeIn: 2, fadeOut: 2 });
    expect(e).toContain("0.2");
  });

  it("blinks the cursor as a square wave, not a glow", () => {
    const e = cursorAlphaExpr({ start: 0, duration: 3, period: 1 });
    expect(e).toContain("mod(t-0,1)");
    expect(e).toContain("0.5");
    expect(e).not.toContain("/"); // no ramp anywhere
  });
});

describe("lineFilters", () => {
  it("emits one drawtext per inked glyph", () => {
    const f = lineFilters({ text: "AB", size: 100, tracking: 0.1 });
    expect(f).toHaveLength(2);
    expect(f[0]).toContain("text='A'");
    expect(f[1]).toContain("text='B'");
  });

  it("centres a line on its own measured width", () => {
    const [first] = lineFilters({ text: "AB", size: 100 });
    expect(first).toMatch(/x=\(w-\d+\.\d\)\/2/);
  });

  it("puts every glyph on one baseline expression", () => {
    const f = lineFilters({ text: "E.", weight: "black", size: 200 });
    const base = centeredBaseline({ weight: "black", size: 200 });
    // Same baseline, different ink-top offsets: that IS the alignment.
    expect(f[0]).toContain(`y=${base}-`);
    expect(f[1]).toContain(`y=${base}-`);
    expect(f[0]).not.toBe(f[1]);
  });

  it("honours an explicit y instead of computing one", () => {
    const [f] = lineFilters({ text: "A", y: 120 });
    expect(f).toContain("y=120");
  });

  it("names the weight's font file", () => {
    const [f] = lineFilters({ text: "A", weight: "medium" }, { fontDir: "/f" });
    expect(f).toContain(FONT_WEIGHTS.medium);
    expect(f).toContain("/f/");
  });

  it("draws nothing for empty text", () => {
    expect(lineFilters({ text: "" })).toEqual([]);
    expect(lineFilters(null)).toEqual([]);
  });
});

describe("layoutRow", () => {
  it("centres the group and sets each piece flush after the last", () => {
    const [head, caret] = layoutRow([
      { text: "EVEN THIS AD.", size: 100, weight: "black" },
      { text: "|", size: 100, weight: "black" },
    ], { gap: 10 });
    expect(head.x).toMatch(/^\(w-\d+\.\d\)\/2\+0\.0$/);
    const offset = Number(caret.x.match(/\+([\d.]+)$/)[1]);
    expect(offset).toBeCloseTo(trackedWidth("EVEN THIS AD.", { size: 100, weight: "black" }) + 10, 1);
  });

  it("leaves an explicit x alone", () => {
    const [a] = layoutRow([{ text: "A", x: "40" }]);
    expect(a.x).toBe("40");
  });
});

describe("buildCardFilters", () => {
  it("joins every line into one chain", () => {
    const chain = buildCardFilters([
      { text: "ONE TOOL.", size: 80 },
      { text: "ONE PROMPT.", size: 80 },
    ]);
    expect(chain.split("drawtext=").length - 1).toBe("ONETOOL.".length + "ONEPROMPT.".length);
  });

  it("survives junk in the list", () => {
    expect(buildCardFilters([null, { text: "" }, undefined])).toBe("");
  });
});

describe("beats", () => {
  it("lays a grid at the tempo, from the first downbeat", () => {
    expect(beatGrid({ bpm: 120, offset: 0.5, from: 0, to: 2 })).toEqual([0.5, 1, 1.5, 2]);
  });

  it("refuses a nonsense tempo instead of looping forever", () => {
    expect(beatGrid({ bpm: 0 })).toEqual([]);
    expect(beatGrid({ bpm: -4 })).toEqual([]);
  });

  it("snaps a title to the nearest beat", () => {
    const grid = beatGrid({ bpm: 120, from: 0, to: 4 });
    expect(snapToBeat(1.4, grid)).toBe(1.5);
    expect(snapToBeat(1.2, grid)).toBe(1);
  });

  it("leaves the time alone when there is no grid", () => {
    expect(snapToBeat(1.234, [])).toBe(1.234);
  });
});
