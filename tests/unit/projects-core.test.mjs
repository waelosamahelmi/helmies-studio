import { describe, it, expect } from "vitest";
import {
  PROJECT_KINDS, PROJECT_KIND_VALUES, kindOf,
  normalizeSettings, validateProjectPayload, sceneSummary,
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

  it("counts a scene's shots and how many have actually been rendered", () => {
    const summary = sceneSummary({
      id: "p1",
      title: "Scene 1",
      type: "short_film",
      status: "executing",
      updatedAt: new Date("2026-08-08"),
      plan: {
        shots: [
          { imageResult: { url: "https://x/1.png" } },
          { videoResult: { url: "https://x/2.mp4" } },
          {},
        ],
      },
    });
    expect(summary.shots).toBe(3);
    expect(summary.rendered).toBe(2);
    expect(summary.assembledUrl).toBeNull();
  });

  it("survives a pipeline with no plan yet", () => {
    // Planning can fail or still be running; the scene list must still draw.
    const summary = sceneSummary({ id: "p2", title: "Scene 2", status: "planning" });
    expect(summary.shots).toBe(0);
    expect(summary.rendered).toBe(0);
  });
});
