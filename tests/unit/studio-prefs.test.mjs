import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readPrefs, writePrefs, preferredRatio, PREFS_KEY } from "@/lib/studio-prefs";

/* The Settings "Generation defaults" panel wrote these values for a long
   time and nothing read them back. This is the read side; the contract that
   matters is that a preference is a STARTING POINT, never an override of a
   model that cannot honour it. */

const store = new Map();

function mockWindow() {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
}

describe("preferredRatio", () => {
  beforeEach(() => { store.clear(); mockWindow(); });
  afterEach(() => { delete globalThis.window; });

  it("returns the saved ratio when the model offers it", () => {
    writePrefs({ ratio: "9:16" });
    expect(preferredRatio(["1:1", "9:16", "16:9"])).toBe("9:16");
  });

  it("returns null when the model cannot do it, so the caller keeps its own choice", () => {
    writePrefs({ ratio: "9:16" });
    expect(preferredRatio(["1:1", "16:9"])).toBeNull();
  });

  it("returns null when nothing is saved", () => {
    expect(preferredRatio(["1:1", "16:9"])).toBeNull();
  });

  it("tolerates a missing or malformed option list", () => {
    writePrefs({ ratio: "16:9" });
    expect(preferredRatio(undefined)).toBeNull();
    expect(preferredRatio(null)).toBeNull();
    expect(preferredRatio("16:9")).toBeNull();
  });
});

describe("readPrefs", () => {
  beforeEach(() => { store.clear(); mockWindow(); });
  afterEach(() => { delete globalThis.window; });

  it("round-trips what settings saved", () => {
    writePrefs({ quality: "ultra", ratio: "4:5" });
    expect(readPrefs()).toEqual({ quality: "ultra", ratio: "4:5" });
  });

  it("returns an empty object for corrupt or non-object values", () => {
    store.set(PREFS_KEY, "{not json");
    expect(readPrefs()).toEqual({});
    store.set(PREFS_KEY, JSON.stringify(["nope"]));
    expect(readPrefs()).toEqual({});
    store.set(PREFS_KEY, JSON.stringify(null));
    expect(readPrefs()).toEqual({});
  });

  it("is inert without a window (server render)", () => {
    delete globalThis.window;
    expect(readPrefs()).toEqual({});
    expect(preferredRatio(["16:9"])).toBeNull();
    expect(() => writePrefs({ ratio: "1:1" })).not.toThrow();
  });
});
