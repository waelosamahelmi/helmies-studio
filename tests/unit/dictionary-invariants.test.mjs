import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { MODEL_IDS, modelEntry, mayActivate } from "../../src/lib/model-dictionary.mjs";

const require = createRequire(import.meta.url);
const DICTIONARY = require("../../models/dictionary.json");

const entries = Object.entries(DICTIONARY);
const active = entries.filter(([, e]) => e.active);

describe("the model dictionary is the authority (task 15)", () => {
  it("NEVER offers a live model whose price nobody knows", () => {
    /* This is the invariant that matters, and it is the one the old
       sitemap-crawling sync broke: it invented rows the provider had never
       heard of and guessed a price for sixty of them. A model with an
       unknown cost is fine as long as nobody can spend money on it — so
       the rule is not "every model has a price", it is "every ACTIVE model
       has a price". 59 entries still have no known cost; every one of them
       is switched off, and this test is what keeps it that way. */
    const offenders = active.filter(([, e]) => !e.costKnown).map(([id]) => id);
    expect(offenders).toEqual([]);
  });

  it("gives every active model a positive credit price", () => {
    const zero = active.filter(([, e]) => !(e.credits > 0)).map(([id]) => id);
    expect(zero).toEqual([]);
  });

  it("refuses to activate a model it has never heard of, and says why", () => {
    // The sync is a reconciler, not a discoverer: it may push the
    // dictionary's answer into the database and may not invent a row. The
    // reason travels with the refusal so a sync log names the cause rather
    // than reporting a silent skip.
    expect(mayActivate("someone/invented-this-model")).toEqual({ ok: false, reason: "not in the dictionary" });
    expect(mayActivate("").ok).toBe(false);
    expect(mayActivate(null).ok).toBe(false);
  });

  it("lets an entry it does describe through", () => {
    const [id] = active[0];
    expect(mayActivate(id)).toEqual({ ok: true });
    expect(modelEntry(id)).toBeTruthy();
  });

  it("refuses anything a probe found uncallable", () => {
    const bad = entries.find(([, e]) => e.verification === "not_callable");
    if (bad) expect(mayActivate(bad[0]).ok).toBe(false);
    // And refuses a retired entry outright.
    const retired = entries.find(([, e]) => e.retired);
    if (retired) expect(mayActivate(retired[0])).toEqual({ ok: false, reason: "retired" });
  });

  it("exports every id it holds", () => {
    expect(MODEL_IDS.length).toBe(entries.length);
    expect(new Set(MODEL_IDS).size).toBe(MODEL_IDS.length);
  });

  it("says plainly that nothing has been probed, rather than implying it has", () => {
    // `verification` is null across the board and that is honest: probing
    // an endpoint means paying for a generation on every model, and a
    // field that claimed otherwise would be worse than an empty one.
    const claimed = entries.filter(([, e]) => e.verification && e.verification !== "none");
    expect(claimed).toEqual([]);
  });
});
