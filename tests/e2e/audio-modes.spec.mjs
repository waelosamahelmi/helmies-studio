// Helmies Studio — honest audio split (EDITSv1 E1.4)
//
// Written FIRST, against surfaces that do not exist yet:
//  · AudioStudio's Segmented becomes Speech / Dialogue / Voice cloning /
//    Sound effects, each pooling models via audioKind (E1.1) instead of the
//    dead `m.provider` filter.
//  · MusicStudio pools audioKind === "music" only, and its schema-gated
//    controls (Genre, Duration enum, Instrumental toggle) actually render
//    for a Suno-family model now that E1.2's curated schemas exist.
//  · A new Audio Tools surface (/studio/audio-tools) lists the enhancement /
//    conversion / utility kinds that are neither speech nor composition.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb } from "./fixtures/db.mjs";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.use({ storageState: USER_AUTH_FILE });

const PROMPT_FIELD = { prompt: { type: "string", required: true, maxLength: 5000 } };

// Curated-style Suno schema — mirrors what E1.2's sync/backfill writes for
// the real generate-music row, so the controls assertions are deterministic.
const SUNO_SCHEMA = {
  fields: {
    ...PROMPT_FIELD,
    style: { type: "string", required: false, maxLength: 1000 },
    title: { type: "string", required: false, maxLength: 100 },
    instrumental: { type: "boolean", required: false },
    vocal_gender: { type: "string", required: false, enum: ["m", "f"] },
    negative_tags: { type: "string", required: false, maxLength: 500 },
    duration: { type: "number", required: false, enum: [30, 60, 120, 180, 240] },
  },
};

const TTS_SCHEMA = {
  fields: {
    ...PROMPT_FIELD,
    voice: { type: "string", required: false },
    stability: { type: "number", required: false, minimum: 0, maximum: 1 },
    similarity_boost: { type: "number", required: false, minimum: 0, maximum: 1 },
    speed: { type: "number", required: false, minimum: 0.7, maximum: 1.2 },
  },
};

// One model per audioKind. The ids carry the SAME tokens audioKind reads on
// the real catalog (generate-music, tts, text-to-dialogue, voice-generate,
// generate-sounds, audio-isolation, convert-to-wav) — that token inference
// IS the behavior under test.
const AUDIO_MODELS = [
  { modelId: "e2e-generate-music", capability: "audio", displayName: "E2E Composer Model", inputSchema: SUNO_SCHEMA },
  { modelId: "e2e-tts-model", capability: "text-to-speech", displayName: "E2E Speech Model", inputSchema: TTS_SCHEMA },
  { modelId: "e2e-text-to-dialogue-model", capability: "text-to-speech", displayName: "E2E Dialogue Model", inputSchema: { fields: { ...PROMPT_FIELD, voice: { type: "string", required: false } } } },
  { modelId: "e2e-voice-generate-model", capability: "text-to-speech", displayName: "E2E Voice Clone Model", inputSchema: { fields: PROMPT_FIELD } },
  { modelId: "e2e-generate-sounds-model", capability: "audio", displayName: "E2E Sound Effects Model", inputSchema: { fields: PROMPT_FIELD } },
  { modelId: "e2e-audio-isolation-model", capability: "audio", displayName: "E2E Audio Cleanup Model", inputSchema: { fields: PROMPT_FIELD } },
  { modelId: "e2e-convert-to-wav-model", capability: "audio", displayName: "E2E Audio Convert Model", inputSchema: { fields: PROMPT_FIELD } },
];

async function seedAudioModels() {
  await withTestDb(async (prisma) => {
    for (const m of AUDIO_MODELS) {
      const data = {
        modelType: "audio",
        providerName: "kie",
        displayName: m.displayName,
        capability: m.capability,
        inputSchema: m.inputSchema,
        providerCost: 0.01,
        creditsCost: 5,
        isActive: true,
        isDeprecated: false,
      };
      await prisma.modelPricing.upsert({
        where: { modelId: m.modelId },
        update: data,
        create: { modelId: m.modelId, ...data },
      });
    }
  });
}

const PROVIDER_TOKENS = /\b(kie|alibaba|dashscope|wavespeed|openrouter|suno|elevenlabs)\b/i;

test.beforeEach(async ({ page }) => {
  await seedAudioModels();
  await stubProviders(page);
});

test("Audio studio: each segment pools only its own kind", async ({ page }) => {
  await page.goto("/studio/audio");
  const job = page.getByRole("group", { name: "Audio job" });
  await expect(job.getByRole("button", { name: "Speech" })).toBeVisible();
  await expect(job.getByRole("button", { name: "Dialogue" })).toBeVisible();
  await expect(job.getByRole("button", { name: "Voice cloning" })).toBeVisible();
  await expect(job.getByRole("button", { name: "Sound effects" })).toBeVisible();

  // Speech (default): the tts model only.
  await expect(page.getByRole("button", { name: /E2E Speech Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Dialogue Model/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Composer Model/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Audio Cleanup Model/ })).toHaveCount(0);

  await job.getByRole("button", { name: "Dialogue" }).click();
  await expect(page.getByRole("button", { name: /E2E Dialogue Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Speech Model/ })).toHaveCount(0);

  await job.getByRole("button", { name: "Voice cloning" }).click();
  await expect(page.getByRole("button", { name: /E2E Voice Clone Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Dialogue Model/ })).toHaveCount(0);

  await job.getByRole("button", { name: "Sound effects" }).click();
  await expect(page.getByRole("button", { name: /E2E Sound Effects Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Voice Clone Model/ })).toHaveCount(0);
});

test("Music studio: composition pool only, with genre/duration/instrumental controls for a Suno-family model", async ({ page }) => {
  await page.goto("/studio/music");

  // Pool: music kind only — utilities and speech never appear here.
  await expect(page.getByRole("button", { name: /E2E Composer Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Audio Cleanup Model/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Audio Convert Model/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Speech Model/ })).toHaveCount(0);

  // Schema-gated controls render from the curated schema.
  await expect(page.getByRole("group", { name: "Genre" })).toBeVisible();
  // Assert the CONTROL, not the loose text: kit/Controls.js's Toggle wraps a
  // role="switch" button and a <span> label inside one <label>, so a text
  // locator matches both the wrapper and the span — and React 19's streaming
  // duplicate can double that again, which is the strict-mode violation this
  // used to hit under full-suite load. The switch is unambiguous and is what
  // the user actually operates.
  await expect(page.getByRole("switch", { name: /Instrumental only/ })).toBeVisible();

  // Duration comes from the schema enum [30,60,120,180,240] — "4m" exists
  // and the fallback-only "90s" does NOT (the fallback list would show it).
  const lengths = page.getByRole("group", { name: "Length" });
  await expect(lengths.getByRole("button", { name: "4m", exact: true })).toBeVisible();
  await expect(lengths.getByRole("button", { name: "90s", exact: true })).toHaveCount(0);
});

test("Audio Tools: utilities live in Audio's Tools mode, not in Music — and the legacy slug lands there", async ({ page }) => {
  // S1: /studio/audio-tools is a legacy slug now — it redirects into the
  // consolidated Audio studio's Tools mode, where the utility pool lives.
  await page.goto("/studio/audio-tools");
  await expect(page).toHaveURL(/\/studio\/audio\?.*mode=tools/);

  const rail = page.getByRole("navigation", { name: "Instruments" });
  await expect(rail.getByRole("button", { name: "Audio", exact: true })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Audio Tools" })).toHaveCount(0);

  await expect(page.getByRole("button", { name: /E2E Audio Cleanup Model/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E Audio Convert Model/ })).toBeVisible();
  // Composition and speech models never appear in the utility surface.
  await expect(page.getByRole("button", { name: /E2E Composer Model/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /E2E Speech Model/ })).toHaveCount(0);
});

test("no audio surface leaks an upstream provider name", async ({ page }) => {
  for (const path of ["/studio/audio", "/studio/music", "/studio/audio-tools"]) {
    await page.goto(path);
    await expect(page.locator(".st-model").first()).toBeVisible();
    // `:visible` + .first(): React 19's streaming SSR briefly renders the
    // resolved Suspense content twice (see smoke.spec.mjs's note) — a bare
    // #studio-work locator can catch both and trip strict mode.
    const text = await page.locator("#studio-work:visible").first().innerText();
    expect(text, `${path} must not name an upstream provider`).not.toMatch(PROVIDER_TOKENS);
  }
});
