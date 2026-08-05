// Audit class A — app-relative media URLs must be absolutized before any
// provider submit. Our upload route returns "/api/media/local/<key>" by
// design; a provider's servers cannot fetch that, so a fresh user upload used
// as an i2i/i2v/v2v source silently failed while re-using a prior output
// (already an absolute CDN URL) worked — the exact asymmetry that hid the bug.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { absolutizeMediaUrls, publicBaseUrl } from "@/lib/provider-payload-core.mjs";

const ORIGINAL = process.env.NEXTAUTH_URL;

describe("absolutizeMediaUrls", () => {
  beforeEach(() => { process.env.NEXTAUTH_URL = "https://studio.helmies.fi"; });
  afterEach(() => { process.env.NEXTAUTH_URL = ORIGINAL; });

  it("rewrites an app-relative image_url to an absolute one", () => {
    const out = absolutizeMediaUrls({ image_url: "/api/media/local/abc.png", prompt: "x" });
    expect(out.image_url).toBe("https://studio.helmies.fi/api/media/local/abc.png");
    expect(out.prompt).toBe("x");
  });

  it("covers every media-ish field generically: *_url, *_urls, *_list, reference_images", () => {
    const out = absolutizeMediaUrls({
      video_url: "/api/media/local/v.mp4",
      audio_url: "/api/media/local/a.mp3",
      image_urls: ["/api/media/local/1.png", "https://cdn.example/2.png"],
      images_list: ["/api/media/local/3.png"],
      reference_images: ["/api/media/local/4.png"],
    });
    expect(out.video_url).toBe("https://studio.helmies.fi/api/media/local/v.mp4");
    expect(out.audio_url).toBe("https://studio.helmies.fi/api/media/local/a.mp3");
    expect(out.image_urls).toEqual(["https://studio.helmies.fi/api/media/local/1.png", "https://cdn.example/2.png"]);
    expect(out.images_list).toEqual(["https://studio.helmies.fi/api/media/local/3.png"]);
    expect(out.reference_images).toEqual(["https://studio.helmies.fi/api/media/local/4.png"]);
  });

  it("never touches absolute URLs, data URIs, task ids, or non-media fields", () => {
    const params = {
      image_url: "https://cdn.kie.ai/x.png",
      audio_url: "data:audio/mp3;base64,AAAA",
      taskId: "/api/looks-like-a-path-but-not-a-media-field",
      prompt: "/api/media/local/never-a-url-field",
    };
    const out = absolutizeMediaUrls(params);
    expect(out.image_url).toBe(params.image_url);
    expect(out.audio_url).toBe(params.audio_url);
    expect(out.taskId).toBe(params.taskId);
    expect(out.prompt).toBe(params.prompt);
  });

  it("strips a trailing slash from the base and survives odd input", () => {
    process.env.NEXTAUTH_URL = "https://studio.helmies.fi/";
    expect(publicBaseUrl()).toBe("https://studio.helmies.fi");
    expect(absolutizeMediaUrls(null)).toBeNull();
    expect(absolutizeMediaUrls({ image_urls: [null, 42, "/api/media/local/x.png"] }).image_urls)
      .toEqual([null, 42, "https://studio.helmies.fi/api/media/local/x.png"]);
  });

  it("does not mutate the input object", () => {
    const params = { image_url: "/api/media/local/abc.png" };
    absolutizeMediaUrls(params);
    expect(params.image_url).toBe("/api/media/local/abc.png");
  });
});
