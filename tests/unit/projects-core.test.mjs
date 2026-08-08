import { describe, it, expect } from "vitest";
import {
  PROJECT_KINDS, PROJECT_KIND_VALUES, kindOf,
  normalizeSettings, validateProjectPayload, sceneSummary, movieClips, breakdownState,
} from "@/lib/projects";

describe("project kinds", () => {
  it("names what a scene MEANS for each kind", () => {
    // Not decoration: an episode and a cut are different units of work, which
    // is why the kind is asked once at the top rather than inferred per shot.
    expect(kindOf("series").unit).toBe("episode");
    expect(kindOf("movie").unit).toBe("scene");
    expect(kindOf("ad").unit).toBe("cut");
  });

  it("falls back to a film for an unknown kind rather than throwing", () => {
    expect(kindOf("nonsense").value).toBe("movie");
    expect(kindOf(undefined).value).toBe("movie");
    expect(PROJECT_KIND_VALUES).toEqual(PROJECT_KINDS.map((k) => k.value));
  });
});

describe("normalizeSettings", () => {
  it("gives a project a usable format without being asked", () => {
    expect(normalizeSettings({})).toMatchObject({ kind: "movie", aspectRatio: "16:9", resolution: "720p" });
  });

  it("keeps a vertical film vertical", () => {
    expect(normalizeSettings({ aspectRatio: "9:16", resolution: "1080p" }))
      .toMatchObject({ aspectRatio: "9:16", resolution: "1080p" });
  });

  it("refuses an aspect or resolution no model offers, keeping what was there", () => {
    const previous = { kind: "movie", aspectRatio: "9:16", resolution: "720p" };
    const out = normalizeSettings({ aspectRatio: "banana", resolution: "8k" }, previous);
    expect(out.aspectRatio).toBe("9:16");
    expect(out.resolution).toBe("720p");
  });

  it("carries the model choices so no individual shot has to be told them", () => {
    const out = normalizeSettings({ imageModel: "seedream/5-pro-image-to-image", videoModel: "bytedance/seedance-2" });
    expect(out.imageModel).toBe("seedream/5-pro-image-to-image");
    expect(out.videoModel).toBe("bytedance/seedance-2");
    expect(out.voiceModel).toBeNull();
  });

  it("merges over the previous settings rather than resetting them", () => {
    const out = normalizeSettings({ resolution: "1080p" }, { kind: "series", aspectRatio: "9:16", imageModel: "x" });
    expect(out).toMatchObject({ kind: "series", aspectRatio: "9:16", resolution: "1080p", imageModel: "x" });
  });
});

describe("validateProjectPayload", () => {
  it("requires a name on create but not on a partial update", () => {
    expect(validateProjectPayload({}).valid).toBe(false);
    expect(validateProjectPayload({ brief: "..." }, { partial: true }).valid).toBe(true);
  });

  it("accepts a whole screenplay as the scenario", () => {
    // The scenario is what lets every later step be prefilled instead of
    // re-asked, so it has to hold a real script.
    const script = "INT. BEDROOM — NIGHT\n".repeat(1000);
    const { valid, value } = validateProjectPayload({ name: "TWO LIVES", brief: script });
    expect(valid).toBe(true);
    expect(value.brief.length).toBe(script.length);
  });

  it("rejects a scenario too large to store, and an unknown status", () => {
    expect(validateProjectPayload({ name: "x", brief: "y".repeat(40001) }).valid).toBe(false);
    expect(validateProjectPayload({ name: "x", status: "deleted" }).valid).toBe(false);
  });

  it("trims the name and allows clearing the description", () => {
    expect(validateProjectPayload({ name: "  TWO LIVES  " }).value.name).toBe("TWO LIVES");
    expect(validateProjectPayload({ name: "x", description: "" }).value.description).toBeNull();
  });
});

describe("scenes", () => {
  it("routes every kind to a production preset the planner actually knows", async () => {
    // A scene is planned as a DirectorPipeline, so a kind whose directorType
    // is not a real preset would silently fall back to music_video — a film
    // scene planned with verse/chorus pacing.
    const { PRODUCTION_TYPE_PRESETS } = await import("@/lib/director-constants");
    for (const kind of PROJECT_KINDS) {
      expect(kind.directorType, `${kind.value} has no director type`).toBeTruthy();
      expect(
        PRODUCTION_TYPE_PRESETS[kind.directorType],
        `${kind.value} maps to unknown preset "${kind.directorType}"`,
      ).toBeTruthy();
    }
  });

  it("counts rendered shots from the shot ROWS, not from the plan", () => {
    // The plan is what was asked for; the DirectorShot row is what came
    // back. Reading results off plan.shots reported every scene as 0
    // rendered forever, because the executor never writes there.
    const summary = sceneSummary(
      {
        id: "p1",
        title: "Scene 1",
        type: "short_film",
        status: "executing",
        updatedAt: new Date("2026-08-08"),
        plan: { shots: [{}, {}, {}] },
      },
      [
        { index: 0, videoResult: { url: "https://x/1.mp4" } },
        { index: 1, videoResult: { rawUrl: "https://x/2.mp4" } },
        { index: 2, videoResult: null },
      ],
    );
    expect(summary.shots).toBe(3);
    expect(summary.rendered).toBe(2);
    expect(summary.assembledUrl).toBeNull();
  });

  it("builds a movie from each scene's assembled cut, falling back to its shots", () => {
    const scenes = [
      { id: "a", title: "One", assembledUrl: "https://x/one.mp4" },
      { id: "b", title: "Two", assembledUrl: null },
    ];
    const shots = new Map([
      ["b", [{ videoResult: { url: "https://x/b1.mp4" } }, { videoResult: { url: "https://x/b2.mp4" } }]],
    ]);
    const { clips, missing } = movieClips(scenes, shots);
    expect(clips).toEqual(["https://x/one.mp4", "https://x/b1.mp4", "https://x/b2.mp4"]);
    expect(missing).toEqual([]);
  });

  it("names an empty scene rather than quietly leaving it out of the movie", () => {
    // A cut silently missing scene 4 looks finished. That is the expensive
    // kind of wrong, so the caller refuses instead.
    const { clips, missing } = movieClips(
      [{ id: "a", title: "One", assembledUrl: "https://x/one.mp4" }, { id: "b", title: "Two", assembledUrl: null }],
      new Map(),
    );
    expect(clips).toEqual(["https://x/one.mp4"]);
    expect(missing).toEqual(["Two"]);
  });

  it("survives a pipeline with no plan yet", () => {
    // Planning can fail or still be running; the scene list must still draw.
    const summary = sceneSummary({ id: "p2", title: "Scene 2", status: "planning" }, []);
    expect(summary.shots).toBe(0);
    expect(summary.rendered).toBe(0);
  });
});

describe("the assembled piece survives a settings edit", () => {
  it("carries movieUrl through normalizeSettings instead of erasing it", () => {
    // updateProject rewrites `data` wholesale from normalizeSettings, so a
    // key it does not carry is destroyed by an unrelated format change.
    const previous = { kind: "movie", aspectRatio: "9:16", movieUrl: "https://x/film.mp4", movieBuiltAt: "2026-08-08T00:00:00.000Z" };
    const out = normalizeSettings({ aspectRatio: "16:9" }, previous);
    expect(out.aspectRatio).toBe("16:9");
    expect(out.movieUrl).toBe("https://x/film.mp4");
    expect(out.movieBuiltAt).toBe("2026-08-08T00:00:00.000Z");
  });

  it("never takes a movie url from caller input", () => {
    // It is written by the assembly route alone; accepting it from a PATCH
    // body would let anyone point a project at any URL.
    const out = normalizeSettings({ movieUrl: "https://evil/x.mp4" }, {});
    expect(out.movieUrl).toBeUndefined();
  });
});

describe("reading the scenario is durable", () => {
  it("reports a read nobody has touched in half an hour as stalled, not still reading", () => {
    // A process restart mid-read is a real thing. "Still reading…" an hour
    // later is a lie, and it leaves the user with no way forward.
    const old = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const state = breakdownState({ data: { breakdown: { status: "reading", startedAt: old } } });
    expect(state.status).toBe("stalled");
    expect(state.error).toMatch(/again/i);
  });

  it("leaves a read that started a minute ago alone", () => {
    const recent = new Date(Date.now() - 60 * 1000).toISOString();
    expect(breakdownState({ data: { breakdown: { status: "reading", startedAt: recent } } }).status).toBe("reading");
  });

  it("says idle when nothing has ever been read", () => {
    expect(breakdownState({ data: {} }).status).toBe("idle");
    expect(breakdownState({}).status).toBe("idle");
  });

  it("carries the read state through a settings edit", () => {
    // Same trap as movieUrl: updateProject rewrites `data` wholesale.
    const out = normalizeSettings({ aspectRatio: "16:9" }, { breakdown: { status: "done", scenes: 11 } });
    expect(out.breakdown).toEqual({ status: "done", scenes: 11 });
  });
});
