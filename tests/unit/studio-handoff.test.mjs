import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mediaKind,
  targetsFor,
  handoffHref,
  putHandoff,
  takeHandoff,
  HANDOFF_KEY,
  HANDOFF_TARGETS,
} from "@/lib/studio-handoff";

/* The handoff carries a finished result into the tool that consumes it.
   Its whole job is to classify media correctly and to hand the payload over
   exactly once — a second read would silently re-apply a stale asset. */

describe("mediaKind", () => {
  it("classifies video by extension and by path", () => {
    expect(mediaKind("https://x/a.mp4")).toBe("video");
    expect(mediaKind("https://x/a.webm?sig=1")).toBe("video");
    expect(mediaKind("https://x/video/abc")).toBe("video");
  });

  it("classifies audio by extension", () => {
    expect(mediaKind("https://x/a.mp3")).toBe("audio");
    expect(mediaKind("https://x/a.wav?t=2")).toBe("audio");
  });

  it("treats anything else as an image", () => {
    expect(mediaKind("https://x/a.png")).toBe("image");
    expect(mediaKind("https://x/no-extension")).toBe("image");
  });

  it("returns null for a non-string", () => {
    expect(mediaKind(null)).toBeNull();
    expect(mediaKind(undefined)).toBeNull();
  });
});

describe("targetsFor", () => {
  it("offers animation and lip sync for a still", () => {
    const labels = targetsFor("https://x/a.png").map((t) => t.label);
    expect(labels).toContain("Animate");
    expect(labels).toContain("Make it talk");
  });

  it("never offers to animate a video", () => {
    const labels = targetsFor("https://x/a.mp4").map((t) => t.label);
    expect(labels).not.toContain("Animate");
  });

  it("returns an empty list rather than throwing on unknown media", () => {
    expect(targetsFor(null)).toEqual([]);
  });

  it("names only real studio ids", () => {
    const valid = ["image", "video", "audio", "music", "perform", "marketing"];
    for (const list of Object.values(HANDOFF_TARGETS)) {
      for (const t of list) expect(valid).toContain(t.tool);
    }
  });
});

describe("handoffHref", () => {
  it("signals the handoff so the target knows to look", () => {
    expect(handoffHref({ tool: "video", mode: "i2v" }))
      .toBe("/studio/video?from=handoff&mode=i2v");
  });

  it("omits mode when there is none", () => {
    expect(handoffHref({ tool: "image" })).toBe("/studio/image?from=handoff");
  });
});

describe("put/take handoff", () => {
  const store = new Map();

  beforeEach(() => {
    globalThis.window = {
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
    };
    store.clear();
  });

  afterEach(() => { delete globalThis.window; });

  it("hands the payload over exactly once", () => {
    putHandoff({ url: "https://x/a.png", prompt: "a cat" });
    expect(takeHandoff()).toMatchObject({ url: "https://x/a.png", prompt: "a cat" });
    /* The second read must be empty: returning to the tool later should not
       re-apply an asset the user already consumed. */
    expect(takeHandoff()).toBeNull();
    expect(store.has(HANDOFF_KEY)).toBe(false);
  });

  it("returns null when nothing is pending", () => {
    expect(takeHandoff()).toBeNull();
  });

  it("survives a corrupt payload instead of throwing", () => {
    store.set(HANDOFF_KEY, "{not json");
    expect(takeHandoff()).toBeNull();
  });
});

describe("server rendering", () => {
  it("is inert without a window", () => {
    expect(globalThis.window).toBeUndefined();
    expect(() => putHandoff({ url: "x" })).not.toThrow();
    expect(takeHandoff()).toBeNull();
  });
});
