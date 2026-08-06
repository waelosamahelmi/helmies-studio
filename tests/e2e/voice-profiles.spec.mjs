// Helmies Studio — S2 voice profiles
//
// Journey 1: the voice-clone wizard's validate step runs through the real
// generation flow (worker + provider mock) and persists a VoiceProfile row;
// the mock answers without the documented phrase/taskId payload, and the
// wizard SAYS so instead of pretending — the honest-states requirement.
// Journey 2: a ready profile appears in the Speech voice picker and in
// Music's vocal options.
import { test, expect } from "@playwright/test";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

async function settle(page) {
  await expect(page.locator(".st-app:visible")).toBeVisible();
  await expect.poll(() => page.locator(".st-app").count(), { timeout: 20000 }).toBe(1);
}

// A minimal valid WAV (RIFF/WAVE header + a silent data chunk) — enough for
// /api/upload's content sniff (upload-sniff.js checks RIFF@0 + WAVE@8).
function wavBuffer() {
  const dataSize = 320;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const TTS_SCHEMA = {
  fields: {
    prompt: { type: "string", required: true, maxLength: 5000 },
    voice: { type: "string", required: false },
  },
};

const SUNO_SCHEMA = {
  fields: {
    prompt: { type: "string", required: true, maxLength: 3000 },
    style: { type: "string", required: false, maxLength: 1000 },
    instrumental: { type: "boolean", required: false },
    vocal_gender: { type: "string", required: false, enum: ["m", "f"] },
  },
};

async function seedVoiceModels() {
  await withTestDb(async (prisma) => {
    const rows = [
      { modelId: "suno-voice-validate", displayName: "E2E Voice Validate", capability: "text-to-speech", inputSchema: null },
      { modelId: "suno-voice-generate", displayName: "E2E Voice Generate", capability: "text-to-speech", inputSchema: null },
      { modelId: "e2e-tts-model", displayName: "E2E Speech Model", capability: "text-to-speech", inputSchema: TTS_SCHEMA },
      { modelId: "e2e-generate-music", displayName: "E2E Composer Model", capability: "audio", inputSchema: SUNO_SCHEMA },
    ];
    for (const r of rows) {
      const data = {
        modelType: "audio",
        providerName: "kie",
        displayName: r.displayName,
        capability: r.capability,
        inputSchema: r.inputSchema,
        providerCost: 0.01,
        creditsCost: 5,
        isActive: true,
        isDeprecated: false,
      };
      await prisma.modelPricing.upsert({
        where: { modelId: r.modelId },
        update: data,
        create: { modelId: r.modelId, ...data },
      });
    }
  });
}

test("wizard: the validate step persists a VoiceProfile and blocked chaining is stated honestly", async ({ page }) => {
  test.setTimeout(120_000);
  await stubProviders(page);
  await seedVoiceModels();

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "vcw" });
  });
  await loginThroughForm(page, user);

  const voiceName = `E2E narrator ${Date.now()}`;

  await page.goto("/studio/audio?mode=voice");
  await settle(page);
  await expect(visible(page.getByRole("list", { name: "Voice cloning steps" }))).toBeVisible();

  await visible(page.getByLabel("Voice name")).fill(voiceName);
  await page.locator('input[type="file"]').setInputFiles({
    name: "recording.wav",
    mimeType: "audio/wav",
    buffer: wavBuffer(),
  });
  // The Dropzone swaps its browse button for a thumbnail once the upload
  // lands — the thumb's remove control is the reliable "upload finished"
  // signal.
  await expect(visible(page.getByRole("button", { name: /Remove recording\.wav/ }))).toBeVisible({ timeout: 15000 });

  const validate = visible(page.getByRole("button", { name: /Validate recording/ }));
  await expect(validate).toBeEnabled({ timeout: 15000 });
  await validate.click();

  // The validate generation completes through the worker; the wizard moves
  // to step 2 and — because the mocked provider answered without the
  // documented phrase/taskId payload — states BOTH gaps instead of
  // inventing content.
  await expect(visible(page.getByText(/did not return a phrase to read/))).toBeVisible({ timeout: 45000 });
  await expect(visible(page.getByText(/validation task id could not be read back/))).toBeVisible();
  await expect(visible(page.getByRole("button", { name: /Build the voice/ }))).toBeDisabled();

  // The transition writes are in the database: created, then advanced to
  // "validating" when the paid step fired.
  const row = await withTestDb((prisma) =>
    prisma.voiceProfile.findFirst({ where: { userId: user.id, name: voiceName } }),
  );
  expect(row).toBeTruthy();
  expect(row.status).toBe("validating");
  expect(row.provider).toBe("suno");
});

test("pickers: a ready profile lists in Speech voices and in Music's vocal options", async ({ page }) => {
  await stubProviders(page);
  await seedVoiceModels();

  let user;
  const profileName = `E2E cloned voice ${Date.now()}`;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 100, label: "vcp" });
    await prisma.voiceProfile.create({
      data: { userId: user.id, name: profileName, status: "ready", voiceId: "e2e-voice-id-1" },
    });
  });
  await loginThroughForm(page, user);

  // Speech: the cloned voice sits alongside the stock cast. Other specs
  // seed their own TTS models into the shared catalog (fullyParallel), so
  // select THIS spec's model — its schema declares `voice`, which is what
  // makes the picker render.
  await page.goto("/studio/audio");
  await settle(page);
  await visible(page.locator(".st-model", { hasText: "E2E Speech Model" })).click();
  const voiceChips = visible(page.getByRole("group", { name: "Voice", exact: true }));
  await expect(voiceChips.getByRole("button", { name: profileName })).toBeVisible({ timeout: 20000 });
  await expect(voiceChips.getByRole("button", { name: "Rachel" })).toBeVisible();

  // Music: under "Your voices" in the vocal options — again on this spec's
  // own composer model (schema declares instrumental/vocal_gender).
  await page.goto("/studio/music");
  await settle(page);
  await visible(page.locator(".st-model", { hasText: "E2E Composer Model" })).click();
  const mine = visible(page.getByRole("group", { name: "Your voices" }));
  await expect(mine.getByRole("button", { name: profileName })).toBeVisible({ timeout: 20000 });
});
