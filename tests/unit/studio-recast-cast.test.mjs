import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inferCapability } from "@/lib/model-catalog-core.mjs";
import { CAPABILITY_GROUPS, matchesGroup } from "@/lib/capability-groups";

/* Two features were silently broken because a model's capability decided
   which picker could see it, and both were filed as coarse "video":

   · Recast offered a plain video-to-video model that cannot accept an
     identity photo, so every run was rejected AFTER credits were held.
   · Reference-to-video had a capability group and five live models, and no
     studio surfaced it at all.

   These pin the classification and the per-family payload shapes, because
   sending the wrong field name is the exact failure that reached users. */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

describe("recast capability", () => {
  it.each([
    "kling-3.0/motion-control",
    "kling-2.6/motion-control",
    "wan/2-2-animate-replace",
    "wan/2-2-animate-move",
    "kling-v3-pro-recast",
  ])("classifies %s as recast, not coarse video", (id) => {
    expect(inferCapability(id)).toBe("recast");
  });

  it("does not swallow neighbouring video capabilities", () => {
    expect(inferCapability("kling-2.6/image-to-video")).toBe("image-to-video");
    expect(inferCapability("wan/2-7-text-to-video")).toBe("text-to-video");
    expect(inferCapability("wan/2-6-video-to-video")).toBe("video-to-video");
    expect(inferCapability("pixverse-v6/reference-to-video")).toBe("reference-to-video");
  });

  it("has its own group so the recast picker cannot show a v2v model", () => {
    expect(CAPABILITY_GROUPS.recast).toEqual(["recast"]);
    expect(matchesGroup({ capability: "recast" }, "recast")).toBe(true);
    expect(matchesGroup({ capability: "recast" }, "v2v")).toBe(false);
    expect(matchesGroup({ capability: "video-to-video" }, "recast")).toBe(false);
  });
});

describe("recast payload", () => {
  const src = read("src/components/studio/VideoEditStudio.js");

  it("filters the recast pool by capability, not by v2v", () => {
    expect(src).toContain('matchesGroup(m, "recast")');
  });

  it("sends array fields to Kling and singular fields to Wan", () => {
    /* kling motion-control: input_urls[] + video_urls[].
       wan animate:          image_url + video_url. */
    expect(src).toContain("input_urls: [identity.url]");
    expect(src).toContain("video_urls: [source.url]");
    expect(src).toContain("image_url: identity.url, video_url: source.url");
  });

  it("offers only orientation values the provider enum accepts", () => {
    const block = src.slice(src.indexOf("const ORIENTATIONS"), src.indexOf("const SPEEDS"));
    expect(block).toContain('value: "image"');
    expect(block).toContain('value: "video"');
    /* "left"/"right" were never in the schema and were rejected. */
    expect(block).not.toContain('value: "left"');
    expect(block).not.toContain('value: "right"');
  });
});

describe("cast (reference-to-video)", () => {
  const src = read("src/components/studio/VideoStudio.js");

  it("is a real mode with copy, so MODE_COPY[mode] cannot be undefined", () => {
    expect(src).toMatch(/const MODES = \[[^\]]*"cast"/);
    const copy = src.slice(src.indexOf("const MODE_COPY"), src.indexOf("const MOTION_COPY"));
    expect(copy).toContain("cast: {");
    expect(copy).toContain("placeholder:");
    expect(copy).toContain("idle:");
  });

  it("draws from the r2v group", () => {
    expect(src).toContain('matchesGroup(m, casting ? "r2v" : mode)');
    expect(CAPABILITY_GROUPS.r2v).toEqual(["reference-to-video"]);
  });

  it("names the reference field the way each family expects", () => {
    expect(src).toContain("params.image_references = refUrls");
    expect(src).toContain("params.reference_image_urls = refUrls");
    expect(src).toContain("params.reference_image = refUrls[0]");
  });

  it("will not submit without a reference photo", () => {
    expect(src).toContain("casting && refUrls.length === 0");
  });
});
