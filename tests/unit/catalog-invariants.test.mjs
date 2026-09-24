/* Whole-catalog invariants, checked against the dictionary (the declared
   authority the database is reconciled to). Each one is a bug that shipped. */
import { describe, expect, it } from "vitest";
import { activeModels } from "../../src/lib/model-dictionary.mjs";
import { CAPABILITY_GROUPS } from "../../src/lib/capability-groups.js";
import { inferCapability, modelTypeForCapability, slugToTitle, calculateProviderQuote } from "../../src/lib/model-catalog-core.mjs";
import { KIE_PRICE_SCHEDULES, billsBySecond } from "../../src/lib/kie-price-schedules.mjs";

const active = activeModels().filter((m) => m.provider === "KIE");

describe("names", () => {
  it("no picker shows two models under one name", () => {
    for (const [group, caps] of Object.entries(CAPABILITY_GROUPS)) {
      const seen = new Map();
      for (const m of active.filter((m) => caps.includes(m.capability))) {
        const name = slugToTitle(m.id, { capability: m.capability });
        expect(seen.get(name), `"${name}" is both ${seen.get(name)} and ${m.id} in the ${group} picker`).toBeUndefined();
        seen.set(name, m.id);
      }
    }
  });

  it("the dictionary's name is the name the picker shows", () => {
    for (const m of active) expect(m.name, m.id).toBe(slugToTitle(m.id, { capability: m.capability }));
  });

  it("no name is a route verb or carries its capability", () => {
    for (const m of active) {
      expect(m.name, m.id).not.toMatch(/^(Generate|Upload|Add|Separate|Replace|Boost)\b/);
      expect(m.name, m.id).not.toMatch(/\b(Text|Image|Video) To (Image|Video)\b|\bR2V\b|A14B/);
    }
  });
});

describe("routing", () => {
  it("every active model's category is the one its capability derives", () => {
    for (const m of active) expect(m.category, m.id).toBe(modelTypeForCapability(m.capability));
  });

  it("a sync would put every active model in the SAME PICKER the dictionary does", () => {
    // Otherwise the next sync silently moves it back. Compared by picker group,
    // because "image" and "text-to-image" are one picker and that is what a
    // user sees. Audio is filed by kie-sync's own path rules, not by id.
    const groupOf = (capability) => Object.keys(CAPABILITY_GROUPS).find((g) => CAPABILITY_GROUPS[g].includes(capability)) || capability;
    const bySync = new Set(["ai-clipping"]);
    for (const m of active.filter((m) => m.category !== "audio" && !bySync.has(m.id))) {
      expect(groupOf(inferCapability(m.id.toLowerCase())), m.id).toBe(groupOf(m.capability));
    }
  });

  it("nothing that REQUIRES an image or a clip sits in a text-only picker", () => {
    const textOnly = new Set([...CAPABILITY_GROUPS.tti, ...CAPABILITY_GROUPS.ttv]);
    const media = /^(image_url|image_urls|input_urls|image|video_url|video_urls|audio_url|mask_url|reference_image_urls|first_frame_image_url)$/;
    for (const m of active.filter((m) => textOnly.has(m.capability))) {
      const required = (m.api?.required || []).filter((f) => media.test(f));
      expect(required, `${m.id} is offered with a prompt alone but requires ${required}`).toEqual([]);
    }
  });

  it("the two detection utilities are not sold as lip sync", () => {
    for (const m of active) expect(m.id).not.toMatch(/human-identification|subject-detection/);
  });
});

describe("price schedules", () => {
  const entries = Object.entries(KIE_PRICE_SCHEDULES);

  it("every scheduled model is an active model", () => {
    const ids = new Set(active.map((m) => m.id));
    for (const [id] of entries) expect(ids.has(id), id).toBe(true);
  });

  it("ends in a catch-all at least as dear as every variant — the studio never pays for a guess", () => {
    for (const [id, { pricing }] of entries) {
      const last = pricing.rules[pricing.rules.length - 1];
      expect(last.when, id).toBeUndefined();
      expect(last.price, id).toBe(Math.max(...pricing.rules.map((r) => r.price)));
    }
  });

  it("no rule is shadowed: a dearer variant is never listed after a cheaper rule that also matches it", () => {
    for (const [id, { pricing }] of entries) {
      pricing.rules.forEach((later, j) => pricing.rules.slice(0, j).forEach((earlier) => {
        if (!later.when || !earlier.when) return;
        const subset = Object.entries(earlier.when).every(([k, v]) => JSON.stringify(later.when[k]) === JSON.stringify(v));
        expect(subset && later.price > earlier.price, `${id}: ${JSON.stringify(later.when)} is shadowed by ${JSON.stringify(earlier.when)}`).toBe(false);
      }));
    }
  });

  it("every setting a rule reads is filled before the quote", () => {
    for (const [id, { pricing, fill }] of entries) {
      const read = new Set(pricing.rules.flatMap((r) => Object.keys(r.when || {})));
      // A switch that is simply off when absent needs no filling.
      for (const k of ["sound", "generate_audio", "generate_audio_switch", "extend_times"]) if (!fill.includes(k)) read.delete(k);
      for (const k of read) expect(fill, `${id} prices on ${k} but never fills it`).toContain(k);
      if (billsBySecond(pricing)) expect(fill, id).toContain("duration");
    }
  });

  it("the ledger cases: what KIE consumed is what the schedule says", () => {
    const kie = (id, params) => Math.round(calculateProviderQuote(KIE_PRICE_SCHEDULES[id].pricing, params).providerCost / 0.005 * 100) / 100;
    expect(kie("generate-music", {})).toBe(12);                                   // consumed 12, was sold for 1 credit
    expect(kie("flux-2/flex-text-to-image", { resolution: "2K" })).toBe(24);      // consumed 24, was sold for 8
    expect(kie("flux-2/pro-text-to-image", { resolution: "1K" })).toBe(5);        // consumed 5
    expect(kie("bytedance/seedance-2-5", { resolution: "720p", duration: 5 })).toBe(315);
    expect(kie("kling-2.6/text-to-video", { duration: "10", sound: true })).toBe(220);
    expect(kie("pixverse-v6/text-to-video", { quality: "1080p", duration: 10, generate_audio_switch: true })).toBe(184);
  });
});

describe("billable seconds — the quote is a reservation, and a small one is a run the studio pays for", () => {
  it("uses the chosen length, then the schema's default, then its first offered length", async () => {
    const { billableSeconds } = await import("../../src/lib/kie-price-schedules.mjs");
    expect(billableSeconds(8, { fields: { duration: { type: "number", default: 5 } } })).toBe(8);
    expect(billableSeconds(undefined, { fields: { duration: { type: "number", default: 5 } } })).toBe(5);
    expect(billableSeconds(undefined, { fields: { duration: { type: "string", enum: ["6", "10"] } } })).toBe(6);
  });
  it("'auto' (-1 / 0) and an undeclared clip length are priced at the maximum, never the minimum", async () => {
    const { billableSeconds, ASSUMED_INPUT_SECONDS } = await import("../../src/lib/kie-price-schedules.mjs");
    expect(billableSeconds(-1, { fields: { duration: { type: "number", minimum: -1, maximum: 30, default: 5 } } })).toBe(30);
    expect(billableSeconds(0, { fields: { duration: { type: "number", minimum: 0, maximum: 10 } } })).toBe(10);
    expect(billableSeconds(undefined, { fields: {} })).toBe(ASSUMED_INPUT_SECONDS);
  });
});

describe("quote normalisation — the meter and the charge read the same params", () => {
  it("a per-second model with a STRING duration enum (kling-3.0/video) still validates", async () => {
    // The billable length is a number for the price and must never reach the
    // validator: it refused every quote for the one model spelled this way.
    const { validateModelInput } = await import("../../src/lib/model-catalog-core.mjs");
    const { billableSeconds } = await import("../../src/lib/kie-price-schedules.mjs");
    const schema = { fields: { prompt: { type: "string", required: true }, duration: { type: "string", enum: ["3", "5", "15"] } } };
    const params = { prompt: "x", duration: "5" };
    expect(validateModelInput(schema, params)).toEqual([]);
    expect(typeof billableSeconds(params.duration, schema)).toBe("number");
  });

  it("gpt-4o's `size` is a ratio field: a chosen 3:2 reaches it instead of being dropped for the default", async () => {
    const { adaptInputsToSchema } = await import("../../src/lib/provider-payload-core.mjs");
    const schema = { fields: { prompt: { type: "string" }, size: { type: "string", required: true, enum: ["1:1", "3:2", "2:3"] } } };
    expect(adaptInputsToSchema({ prompt: "x", aspect_ratio: "3:2" }, schema).params).toEqual({ prompt: "x", size: "3:2" });
  });
});
