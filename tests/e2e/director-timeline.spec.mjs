// Helmies Studio — E2E Director timeline journeys (EDITSv1 E4.4)
//
// Self-contained: the three source clips are generated locally with ffmpeg
// in beforeAll (2s color cards, 320x180) and served through the app's own
// /api/media/local route — re-assembly therefore runs REAL ffmpeg trims,
// concat and xfade against the app's /api/assemble. The timeline-chat leg is
// stubbed via page.route (its LLM call is server-side; the stub answers with
// a pre-validated op list) — no real LLM is ever dialed.
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stubProviders } from "./fixtures/intercept.mjs";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

const execFileAsync = promisify(execFile);
const MEDIA_DIR = join(process.cwd(), "public", "media");

// Local copy of src/lib/director-executor.js's shotRowId — Playwright Test's
// loader mis-transpiles src/lib/*.js (see fixtures/db.mjs's header), so this
// spec seeds DirectorShot rows directly via its own prisma client rather than
// importing the executor. DirectorShot.id is namespaced to its pipeline
// (`${pipelineId}::${shotId}`) so two pipelines' identically-numbered shots
// never collide; seeding rows in that same shape keeps this fixture honest
// about the real row format even though nothing in this spec's own flow
// (status/timeline-chat routes only ever query DirectorShot by pipelineId,
// never by row id) currently depends on it.
function shotRowId(pipelineId, shotId) {
  if (!pipelineId) throw new Error("shotRowId: pipelineId is required");
  if (!shotId) throw new Error("shotRowId: shotId is required");
  return `${pipelineId}::${shotId}`;
}

const CLIPS = [
  { name: "e2e-tl-red.mp4", color: "red", title: "Red" },
  { name: "e2e-tl-green.mp4", color: "green", title: "Green" },
  { name: "e2e-tl-blue.mp4", color: "blue", title: "Blue" },
];

function visible(locator) {
  return locator.and(locator.page().locator(":visible"));
}

const clipRows = (page) => visible(page.locator("li.st-clip"));

test.beforeAll(async () => {
  await mkdir(MEDIA_DIR, { recursive: true });
  for (const clip of CLIPS) {
    await execFileAsync("ffmpeg", [
      "-f", "lavfi",
      "-i", `color=c=${clip.color}:s=320x180:d=2:r=30`,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-y",
      join(MEDIA_DIR, clip.name),
    ], { timeout: 60000 });
  }
});

async function seedCompletedPipeline(prisma, userId) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const shots = CLIPS.map((clip, i) => ({
    id: `tl_${stamp}_${i}`,
    index: i,
    title: clip.title,
    durationSec: 2,
    section: "verse",
    // Shot 2 (Green) fades INTO the next shot; the others hard-cut.
    transition: i === 1 ? "fade" : "cut",
    imageStrategy: { mode: "generate", prompt: "static", references: [] },
    videoStrategy: { mode: "t2v", prompt: "motion" },
  }));

  const pipeline = await prisma.directorPipeline.create({
    data: {
      userId,
      title: "Timeline Production",
      type: "commercial",
      status: "completed",
      plan: { shots, globalStyle: {} },
      brief: { type: "commercial", title: "Timeline Production" },
      costEstimate: { totalCredits: 30, shotCosts: shots.map((s) => ({ shotId: s.id, shotIndex: s.index, costs: { image: 2, video: 8, audio: 0 }, total: 10 })) },
    },
  });

  for (const [i, shot] of shots.entries()) {
    await prisma.directorShot.create({
      data: {
        id: shotRowId(pipeline.id, shot.id),
        pipelineId: pipeline.id,
        index: shot.index,
        title: shot.title,
        status: "completed",
        plan: shot,
        imageResult: null,
        videoResult: { url: `/api/media/local/${CLIPS[i].name}` },
        audioResult: null,
      },
    });
  }
  return pipeline;
}

test("rearrange, trim, chat-remove and re-assemble produce a fresh cut", async ({ page }) => {
  await stubProviders(page);

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "tl" });
    await seedCompletedPipeline(prisma, user.id);
  });
  await loginThroughForm(page, user);

  // The chat leg: stub the (server-side LLM) route with a pre-validated op
  // list — the browser never reaches a real LLM.
  await page.route("**/api/director/timeline-chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ops: [{ op: "remove", index: 2 }] }),
    }),
  );

  await page.goto("/studio/director");
  await expect(visible(page.locator(".st-app"))).toBeVisible();
  // Settle past React 19's streaming-duplicate window before interacting
  // (see fixtures/studio-actions.mjs and director-editor.spec.mjs).
  await expect(visible(page.locator(".st-credits"))).toContainText(/\d/, { timeout: 15000 });

  // Open the seeded production from "Earlier productions".
  await visible(page.getByRole("button", { name: "Production", exact: true })).click();
  await visible(page.getByRole("button", { name: /Timeline Production/ })).click();

  // The completed film shows as an editable 3-clip timeline.
  await expect(clipRows(page)).toHaveCount(3, { timeout: 15000 });
  await expect(clipRows(page).first()).toContainText("Red");

  // Rearrange (keyboard-accessible move — same reorder the drag handlers use).
  await visible(page.getByRole("button", { name: "Move clip 1 later" })).click();
  await expect(clipRows(page).first()).toContainText("Green");
  await expect(clipRows(page).nth(1)).toContainText("Red");

  // Trim clip 1 (Green) to its first 1.5 seconds.
  await visible(page.getByLabel("Clip 1 out point in seconds")).fill("1.5");

  // Chat: "remove the last clip" -> validated remove op -> Blue disappears.
  // Ops only touch the client timeline — nothing assembles yet.
  await visible(page.getByLabel("Timeline instruction")).fill("remove the last clip");
  await visible(page.getByRole("button", { name: "Apply", exact: true })).click();
  await expect(clipRows(page)).toHaveCount(2, { timeout: 10000 });
  await expect(clipRows(page).nth(1)).toContainText("Red");

  // Re-assemble: REAL ffmpeg — a 1.5s trim re-encode, then an xfade (Green
  // fades into Red) — producing a FRESH output file.
  const assembleResponse = page.waitForResponse(
    (r) => r.url().includes("/api/assemble") && r.request().method() === "POST",
    { timeout: 90000 },
  );
  await visible(page.getByRole("button", { name: "Re-assemble" })).click();
  const res = await assembleResponse;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.url).toMatch(/\/api\/media\/local\/assembled_[0-9a-f]+\.mp4/);

  // The fresh cut renders inline and becomes the film link; the source clips
  // are untouched (the timeline still lists them).
  const result = visible(page.getByTestId("assembled-result"));
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute("src", /assembled_/);
  await expect(visible(page.getByRole("link", { name: /Open the film/ }))).toHaveAttribute("href", /assembled_/);
  await expect(clipRows(page)).toHaveCount(2);
});

test("an invalid chat instruction surfaces the envelope error and changes nothing", async ({ page }) => {
  await stubProviders(page);

  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label: "tlerr" });
    await seedCompletedPipeline(prisma, user.id);
  });
  await loginThroughForm(page, user);

  // Server-shaped 422 invalid_params envelope, as the real route emits when
  // the LLM's ops fail validation.
  await page.route("**/api/director/timeline-chat", (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "That instruction produced edits that don't fit this timeline. Try rephrasing it.",
        code: "invalid_params",
        title: "Check your settings",
        errorId: "e2e42tst",
        retryable: false,
        details: ["ops[0]: index out of range"],
      }),
    }),
  );

  await page.goto("/studio/director");
  await expect(visible(page.locator(".st-app"))).toBeVisible();
  await expect(visible(page.locator(".st-credits"))).toContainText(/\d/, { timeout: 15000 });
  await visible(page.getByRole("button", { name: "Production", exact: true })).click();
  await visible(page.getByRole("button", { name: /Timeline Production/ })).click();
  await expect(clipRows(page)).toHaveCount(3, { timeout: 15000 });

  await visible(page.getByLabel("Timeline instruction")).fill("remove clip nine");
  await visible(page.getByRole("button", { name: "Apply", exact: true })).click();

  await expect(visible(page.locator(".st-timeline .hs-notice--fault"))).toContainText(/rephrasing/i);
  await expect(clipRows(page)).toHaveCount(3);
});
