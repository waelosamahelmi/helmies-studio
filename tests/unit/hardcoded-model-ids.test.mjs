/* A model id typed into source is a claim about the catalog, and the catalog
   moves. Every default below was once a dead id — "flux-dev", "wan-2.6",
   "suno-v4", "z-image", "nano-banana-pro", "elevenlabs/text-to-dialogue-v3" —
   and none failed loudly: a template could not be quoted, a last resort came
   back empty, a plan priced a 390-credit clip at 10. models/dictionary.json is
   the authority the database is reconciled to, so it is what they are held to. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeModels, modelEntry } from "../../src/lib/model-dictionary.mjs";
import { PRODUCTION_TYPE_PRESETS, DEFAULT_MODEL_IMAGE, DEFAULT_MODEL_VIDEO, DEFAULT_MODEL_AUDIO } from "../../src/lib/director-constants.js";
import { TEMPLATE_SEEDS } from "../../src/lib/template-seeds.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const isActive = (id) => Boolean(modelEntry(id)?.active);
const expectActive = (id, where) => expect(isActive(id), `${where}: "${id}" is not an active model in models/dictionary.json`).toBe(true);

/* Read as text: these files import "@/lib/prisma" and friends, and the point is
   the literal that was typed, not the module's behaviour. */
const constants = (path, names) => {
  const source = read(path);
  return names.map((name) => {
    const m = new RegExp(`const ${name} = "([^"]+)"`).exec(source);
    expect(m, `${path} no longer declares ${name}`).toBeTruthy();
    return [name, m[1]];
  });
};

describe("hardcoded model ids are ACTIVE catalog ids", () => {
  it("director presets", () => {
    for (const id of [DEFAULT_MODEL_IMAGE, DEFAULT_MODEL_VIDEO, DEFAULT_MODEL_AUDIO]) expectActive(id, "director-constants");
    for (const [type, preset] of Object.entries(PRODUCTION_TYPE_PRESETS)) {
      for (const key of ["defaultModelImage", "defaultModelVideo", "defaultModelAudio"]) expectActive(preset[key], `${type}.${key}`);
    }
  });

  it("director executor fallbacks", () => {
    for (const [name, id] of constants("src/lib/director-executor.js", [
      "DEFAULT_IMAGE_MODEL", "DEFAULT_EDIT_MODEL", "DEFAULT_VIDEO_MODEL", "DEFAULT_I2V_MODEL", "DEFAULT_MUSIC_MODEL", "DEFAULT_SPEECH_MODEL",
    ])) expectActive(id, `director-executor ${name}`);
  });

  it("nothing in the director names a model the catalog never held", () => {
    for (const path of ["src/lib/director-constants.js", "src/lib/director-planner.js", "src/lib/director-executor.js"]) {
      // Comments may tell the story of the dead ids; code may not use them.
      const code = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, path).not.toMatch(/"(flux-dev|wan-2\.6|kling-v2\.1-i2v|seedance-2\.0|suno-v4(\.5)?)"/);
    }
  });

  it("last-resort fallbacks — a wrong id here leaves the last resort silently EMPTY", () => {
    const source = read("src/lib/runnable-models.js");
    const block = /export const LAST_RESORT_FALLBACKS = \{([\s\S]*?)\};/.exec(source)[1];
    const ids = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expectActive(id, "LAST_RESORT_FALLBACKS");
  });

  it("every template step — an inactive one makes the whole template unquotable", () => {
    for (const tpl of TEMPLATE_SEEDS) {
      for (const step of tpl.graph.steps) expectActive(step.modelId, `template ${tpl.slug} ${step.id}`);
    }
  });

  it("template steps send the fields their model REQUIRES", () => {
    for (const tpl of TEMPLATE_SEEDS) {
      for (const step of tpl.graph.steps) {
        const required = modelEntry(step.modelId)?.api?.required || [];
        const given = { ...(tpl.graph.sampleInputs?.[step.id] || {}), ...step.inputs };
        for (const field of required) expect(given, `${tpl.slug} ${step.id} (${step.modelId}) is missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it("CharacterStudio's preference lists", () => {
    const source = read("src/components/studio/CharacterStudio.js");
    for (const name of ["TEXT_TO_IMAGE_PREFERENCE", "IDENTITY_MODEL_PREFERENCE"]) {
      const block = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(source)[1];
      for (const [, id] of block.matchAll(/"([^"]+)"/g)) expectActive(id, name);
    }
  });
});

describe("per-family prompt guidance reaches real models", () => {
  it("every family matches at least one active model of its own media type", async () => {
    const source = read("src/lib/prompt-expansion.js");
    const families = [...source.matchAll(/family: "([^"]+)",\s*type: "([^"]+)",[\s\S]*?match: (\/.*\/),/g)];
    expect(families.length).toBeGreaterThanOrEqual(5);
    const mediaType = (m) => (["image", "i2i"].includes(m.category) ? "image" : ["video", "i2v", "v2v"].includes(m.category) ? "video" : m.category);
    for (const [, family, type, literal] of families) {
      const re = new RegExp(literal.slice(1, literal.lastIndexOf("/")));
      const hits = activeModels().filter((m) => mediaType(m) === type && re.test(m.id.toLowerCase()));
      expect(hits.length, `the ${family} guide matches no active ${type} model`).toBeGreaterThan(0);
    }
  });

  it("no guide is kept for a model the studio does not offer", () => {
    // Comments may say what was removed; the guides themselves may not remain.
    const code = read("src/lib/prompt-expansion.js").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/midjourney|sora/i);
  });
});

describe("public copy names only what the catalog has", () => {
  const ABSENT = /\b(Midjourney|Sora|SDXL|LTX|LatentSync|ElevenLabs|Luma|MusicGen|Bark)\b/;
  for (const path of ["src/app/page.js", "src/app/models/page.js", "src/app/faq/page.js", "src/components/landing/LogoTicker.js", "src/app/studio/[tool]/page.js"]) {
    it(path, () => expect(read(path)).not.toMatch(ABSENT));
  }

  it("the FAQ does not gate resolution by plan — every tier gets the whole catalog", () => {
    expect(read("src/app/faq/page.js")).not.toMatch(/HD resolution is available on|4K downloads are available on/);
  });
});
