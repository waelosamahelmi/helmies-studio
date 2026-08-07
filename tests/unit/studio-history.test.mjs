import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readHistory,
  recordPrompt,
  clearHistory,
  removeEntry,
  HISTORY_KEY,
  HISTORY_LIMIT,
} from "@/lib/studio-history";

/* Prompt history is recorded from useAsyncGeneration's submit, so every
   tool gets it. These tests pin the behaviour that matters to a user:
   a retry does not stack a duplicate, the buffer cannot grow without
   bound, and a broken localStorage never breaks a generation. */

const store = new Map();

function mockWindow({ throwOnSet = false } = {}) {
  globalThis.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        if (throwOnSet) throw new Error("QuotaExceededError");
        store.set(k, v);
      },
      removeItem: (k) => store.delete(k),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
}

describe("recordPrompt", () => {
  beforeEach(() => { store.clear(); mockWindow(); });
  afterEach(() => { delete globalThis.window; });

  it("records a prompt with its tool", () => {
    recordPrompt({ tool: "image", prompt: "a red bicycle", model: "flux" });
    expect(readHistory()).toMatchObject([
      { tool: "image", prompt: "a red bicycle", model: "flux" },
    ]);
  });

  it("ignores empty and near-empty briefs", () => {
    recordPrompt({ tool: "image", prompt: "" });
    recordPrompt({ tool: "image", prompt: "  " });
    recordPrompt({ tool: "image", prompt: "ab" });
    recordPrompt({ tool: "image", prompt: undefined });
    expect(readHistory()).toEqual([]);
  });

  it("moves a repeated brief to the top instead of duplicating it", () => {
    recordPrompt({ tool: "image", prompt: "first" });
    recordPrompt({ tool: "image", prompt: "second" });
    recordPrompt({ tool: "image", prompt: "first" });

    const prompts = readHistory().map((e) => e.prompt);
    expect(prompts).toEqual(["first", "second"]);
  });

  it("keeps the same wording separately per tool", () => {
    recordPrompt({ tool: "image", prompt: "a wave" });
    recordPrompt({ tool: "video", prompt: "a wave" });
    expect(readHistory()).toHaveLength(2);
  });

  it("trims surrounding whitespace", () => {
    recordPrompt({ tool: "image", prompt: "   spaced out   " });
    expect(readHistory()[0].prompt).toBe("spaced out");
  });

  it("caps the buffer", () => {
    for (let i = 0; i < HISTORY_LIMIT + 25; i += 1) {
      recordPrompt({ tool: "image", prompt: `brief number ${i}` });
    }
    const all = readHistory();
    expect(all).toHaveLength(HISTORY_LIMIT);
    /* Newest first — the most recent brief survives, the oldest is dropped */
    expect(all[0].prompt).toBe(`brief number ${HISTORY_LIMIT + 24}`);
  });
});

describe("resilience", () => {
  afterEach(() => { delete globalThis.window; });

  it("never throws when storage is full", () => {
    store.clear();
    mockWindow({ throwOnSet: true });
    expect(() => recordPrompt({ tool: "image", prompt: "a brief" })).not.toThrow();
  });

  it("returns an empty list for a corrupt store", () => {
    store.clear();
    mockWindow();
    store.set(HISTORY_KEY, "{not json");
    expect(readHistory()).toEqual([]);
  });

  it("returns an empty list when the stored value is not an array", () => {
    store.clear();
    mockWindow();
    store.set(HISTORY_KEY, JSON.stringify({ nope: true }));
    expect(readHistory()).toEqual([]);
  });

  it("is inert without a window (server render)", () => {
    expect(globalThis.window).toBeUndefined();
    expect(readHistory()).toEqual([]);
    expect(() => recordPrompt({ tool: "image", prompt: "a brief" })).not.toThrow();
  });
});

describe("removal", () => {
  beforeEach(() => { store.clear(); mockWindow(); });
  afterEach(() => { delete globalThis.window; });

  it("forgets a single entry without taking its neighbour", () => {
    recordPrompt({ tool: "image", prompt: "keep this one" });
    recordPrompt({ tool: "image", prompt: "forget this one" });
    const target = readHistory().find((e) => e.prompt === "forget this one");

    removeEntry(target.id);

    expect(readHistory().map((e) => e.prompt)).toEqual(["keep this one"]);
  });

  it("gives every entry a unique id even within the same millisecond", () => {
    /* Date.now() alone collides on a fast machine, and a shared key would
       make deleting one entry delete its twin. */
    recordPrompt({ tool: "image", prompt: "one brief" });
    recordPrompt({ tool: "image", prompt: "two brief" });
    const ids = readHistory().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("clears everything", () => {
    recordPrompt({ tool: "image", prompt: "something" });
    clearHistory();
    expect(readHistory()).toEqual([]);
  });
});
