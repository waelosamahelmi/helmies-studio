import { describe, it, expect } from "vitest";
import {
  MODEL_IDS, modelEntry, isKnownModel, mayActivate, reconcile,
  activeModels, guessedPriceModels, unverifiedModels, describeModel,
} from "@/lib/model-dictionary.mjs";

describe("the dictionary is a record of the real catalog", () => {
  it("describes every model production serves", () => {
    expect(MODEL_IDS.length).toBeGreaterThan(200);
    expect(activeModels().length).toBeGreaterThan(100);
  });

  it("knows the models this app actually renders with", () => {
    // If these fall out of the dictionary, the sync deactivates them and
    // the studio goes quiet — so they are pinned.
    for (const id of ["seedream/5-pro-image-to-image", "bytedance/seedance-2", "nano-banana-2"]) {
      expect(isKnownModel(id), `${id} missing from the dictionary`).toBe(true);
    }
  });

  it("has a real price for every active model", () => {
    // Sixty rows were billing against a guessed default. A regression here
    // is money leaving quietly.
    expect(guessedPriceModels()).toEqual([]);
  });
});

describe("what may be served", () => {
  it("refuses to activate a model nobody wrote down", () => {
    // The whole failure being fixed: a sync that crawled a docs sitemap and
    // turned page paths into live models the provider never had.
    expect(mayActivate("invented-by-a-crawler").ok).toBe(false);
    expect(mayActivate("invented-by-a-crawler").reason).toMatch(/dictionary/);
  });

  it("refuses every model a probe found not callable", () => {
    // These are ids the sync built from doc-page paths that the provider
    // answers with "the model name you specified is not supported". A
    // studio must not list models that cannot run.
    const dead = MODEL_IDS.filter((id) => modelEntry(id).verification === "not_callable");
    for (const id of dead) {
      expect(mayActivate(id).ok, `${id} is probed-dead but permitted`).toBe(false);
    }
  });

  it("refuses one explicitly retired, without deleting what points at it", () => {
    // Retirement is a field, not a deletion: generations reference the id.
    const retired = MODEL_IDS.filter((id) => modelEntry(id).retired);
    for (const id of retired) expect(mayActivate(id).ok).toBe(false);
  });

  it("permits a model it describes", () => {
    expect(mayActivate("nano-banana-2").ok).toBe(true);
  });
});

describe("reconciling against the database", () => {
  const dbRow = (over = {}) => {
    const entry = modelEntry("nano-banana-2");
    return {
      modelId: "nano-banana-2",
      displayName: entry.name,
      modelType: entry.category,
      capability: entry.capability,
      providerCost: entry.cost,
      creditsCost: entry.credits,
      isActive: true,
      ...over,
    };
  };

  it("says nothing when they agree", () => {
    const drift = reconcile([dbRow()]).filter((d) => d.kind !== "missing_from_db");
    expect(drift).toEqual([]);
  });

  it("catches a price the database has drifted on", () => {
    const drift = reconcile([dbRow({ creditsCost: 9999 })]).filter((d) => d.kind === "field");
    expect(drift[0]).toMatchObject({ field: "creditsCost", db: 9999 });
  });

  it("flags a live row nobody wrote down, and says it is LIVE", () => {
    // The distinction matters: an unknown inactive row is untidy, an
    // unknown ACTIVE row is being served to customers.
    const drift = reconcile([{ modelId: "ghost-model", isActive: true }]);
    expect(drift.find((d) => d.modelId === "ghost-model").kind).toBe("unknown_and_active");
  });

  it("reports a described model that is absent, without inventing it", () => {
    const drift = reconcile([]);
    expect(drift.every((d) => d.kind === "missing_from_db")).toBe(true);
    expect(drift.length).toBe(MODEL_IDS.length);
  });
});

describe("what the agent is told", () => {
  it("says what a model is FOR, not just what it is called", () => {
    // The agent already gets the schema. What it cannot infer is purpose,
    // and picking by name similarity is how it chose wrong.
    const line = describeModel("bytedance/seedance-2");
    expect(line).toContain("Seedance 2");
    expect(line).toMatch(/clip|still|animates/);
  });

  it("returns null for something it does not know, rather than guessing", () => {
    expect(describeModel("no-such-model")).toBeNull();
  });
});

describe("what is still unknown", () => {
  it("can name the models nothing has ever probed", () => {
    // Not an assertion that the number is zero — it is not. This is the
    // list the verification sweep exists to work through.
    expect(Array.isArray(unverifiedModels())).toBe(true);
  });
});
