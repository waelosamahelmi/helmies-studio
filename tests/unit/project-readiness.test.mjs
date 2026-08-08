import { describe, it, expect } from "vitest";
import { projectReadiness, readinessSummary, SEVERITY } from "@/lib/project-readiness.mjs";

const char = (over = {}) => ({ kind: "character", name: "Wael", references: [], ...over });
const place = (over = {}) => ({ kind: "environment", name: "Bedroom", references: [], ...over });

const full = (kind) => (kind === "character"
  ? [{ kind: "source" }, { kind: "face_front" }, { kind: "face_34" }, { kind: "face_side" }, { kind: "full_body" }, { kind: "half_body" }]
  : [{ kind: "wide" }, { kind: "viewpoint" }, { kind: "detail" }, { kind: "texture" }, { kind: "lighting" }]);

describe("what will go wrong, before the money moves", () => {
  it("BLOCKS a character with no photograph, because a face is never invented", () => {
    // Every way TWO LIVES came out wrong was knowable in advance and
    // nothing said it. This is the one that renders a stranger.
    const r = projectReadiness({ cast: [char()] });
    expect(r.ready).toBe(false);
    expect(r.blocks[0].looksLike).toMatch(/stranger/i);
  });

  it("does NOT block a place with no photograph — it drifts, which is different", () => {
    // A room still renders; it just renders differently each time. Refusing
    // to shoot over that would be this function spending somebody's
    // judgement for them.
    const r = projectReadiness({ environments: [place()] });
    expect(r.ready).toBe(true);
    expect(r.drifts[0].severity).toBe(SEVERITY.DRIFTS);
    expect(r.drifts[0].looksLike).toMatch(/re-invented|different window/i);
  });

  it("names the exact views a half-covered place is missing", () => {
    // "Add references" is a warning nobody acts on. Naming them is one
    // somebody can.
    const r = projectReadiness({ environments: [place({ references: [{ kind: "wide" }] })] });
    expect(r.drifts[0].fix).toMatch(/reverse|corner|surfaces|light/i);
  });

  it("says nothing about a cast that is fully covered", () => {
    const r = projectReadiness({
      cast: [char({ references: full("character") })],
      environments: [place({ references: full("environment") })],
      settings: { imageModel: "a", videoModel: "b" },
    });
    expect(r.findings).toEqual([]);
    expect(readinessSummary(r)).toBeNull();
  });

  it("blocks a scene that was never broken into shots", () => {
    const r = projectReadiness({ scenes: [{ title: "Scene 1", shots: 0 }] });
    expect(r.ready).toBe(false);
    expect(r.blocks[0].looksLike).toMatch(/nothing to render/i);
  });

  it("notes an unchosen model without blocking on it", () => {
    // A default nobody picked is how a $1.28 model got chosen by accident.
    const r = projectReadiness({ settings: {} });
    expect(r.ready).toBe(true);
    expect(r.findings.some((f) => f.subject === "Video model")).toBe(true);
  });

  it("puts what will render WRONG above what will merely drift", () => {
    const r = projectReadiness({
      cast: [char()],
      environments: [place()],
      settings: {},
    });
    expect(r.findings[0].severity).toBe(SEVERITY.BLOCKS);
    expect(r.findings[r.findings.length - 1].severity).toBe(SEVERITY.NOTE);
  });

  it("survives an empty project without inventing problems", () => {
    const r = projectReadiness({});
    expect(r.blocks).toEqual([]);
    expect(r.ready).toBe(true);
  });
});
