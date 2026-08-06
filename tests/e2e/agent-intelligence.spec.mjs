// A9 — agent intelligence journeys (owner defects 2/3/4/5).
//
//   • Auto-plan: a chat reply ending in a ```plan-ready block makes the
//     client call the plan endpoint AUTOMATICALLY — PlanApproval appears
//     with NO "Plan production" click (defect 3).
//   • Complete plans: a music-video brief yields a multi-step production
//     (clips + music + assembly + export) with per-step credits and a
//     total (defect 2). With no OPENROUTER_KEY in the e2e app this is the
//     deterministic heuristic planner — the same complete-production
//     contract, priced by the real /api/estimate quotes.
//   • Per-step model editing re-prices AUDIO steps too, from the honest
//     audioKind pool (defect 4).
//   • The finished run presents THE deliverable prominently with the
//     collected assets beneath (defect 5). The run stream is stubbed at the
//     network seam: real assembly shells out to ffmpeg, which the e2e
//     machine deliberately does not exercise.
//
// Chat replies are stubbed with page.route on OUR OWN /api/agent/chat
// endpoint (never a real LLM), exactly like agent-chat.spec.mjs. The PLAN
// journeys use the real /api/agent/plan route end to end.
import { test, expect } from "@playwright/test";
import { withTestDb, createIsolatedUser } from "./fixtures/db.mjs";
import { loginThroughForm } from "./fixtures/login.mjs";

// React 19 briefly duplicates streamed content — scope to the visible copy
// (see tests/e2e/fixtures/studio-actions.mjs for the full story).
const visible = (locator) => locator.and(locator.page().locator(":visible"));

const sseBody = (text) => {
  const frames = [];
  for (const part of text.match(/[\s\S]{1,40}/g) || []) {
    frames.push(`data: ${JSON.stringify({ type: "token", content: part })}\n\n`);
  }
  frames.push("data: [DONE]\n\n");
  return frames.join("");
};

const fulfillChat = (route, text) =>
  route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream" },
    body: sseBody(text),
  });

async function gotoAgent(page) {
  await page.goto("/studio/orchestrator");
  await expect(page.locator(".st-talk:visible")).toBeVisible();
  // Wait out React 19's doomed-duplicate flash (documented in
  // agent-chat.spec.mjs) before touching anything.
  await expect.poll(() => page.locator(".st-talk").count(), { timeout: 20000 }).toBe(1);
}

const brief = (page) => visible(page.getByLabel("Creative brief"));

// Two seeded music generators at KNOWN prices, classified as genuine
// composers by audioKind (the "generate-music" token) so they land in the
// music-step pool. Idempotent upserts — safe across parallel projects.
const MUSIC_ALPHA = { id: "e2e-generate-music-alpha", name: "E2E Music Alpha", credits: 7 };
const MUSIC_BETA = { id: "e2e-generate-music-beta", name: "E2E Music Beta", credits: 20 };

async function seedMusicModels() {
  await withTestDb(async (prisma) => {
    for (const m of [MUSIC_ALPHA, MUSIC_BETA]) {
      const data = {
        modelType: "audio",
        capability: "audio",
        providerName: "kie",
        displayName: m.name,
        providerCost: 0.01,
        creditsCost: m.credits,
        isActive: true,
        isDeprecated: false,
      };
      await prisma.modelPricing.upsert({
        where: { modelId: m.id },
        update: data,
        create: { modelId: m.id, ...data },
      });
    }
  });
}

async function readyIsolated(page, label) {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label });
  });
  await loginThroughForm(page, user);
  await gotoAgent(page);
  return user;
}

const MUSIC_VIDEO_BRIEF = "Make a music video about neon city nights";

// The heuristic music-video production: 3 clips + music + assembly + export.
async function planMusicVideo(page) {
  await brief(page).fill(MUSIC_VIDEO_BRIEF);
  await visible(page.getByRole("button", { name: "Plan production" })).click();
  const planCard = visible(page.locator(".st-plan"));
  await expect(planCard).toBeVisible({ timeout: 30000 });
  // Approve enables only once EVERY per-step quote and the total settled.
  await expect(planCard.getByRole("button", { name: /^Approve/ })).toBeEnabled({ timeout: 15000 });
  return planCard;
}

test.describe("auto-plan (A9 defect 3)", () => {

test("a plan-ready chat reply generates the complete plan WITHOUT pressing the plan button", async ({ page }) => {
  await seedMusicModels();
  await readyIsolated(page, "autoplan");

  await page.route("**/api/agent/chat", (route) =>
    fulfillChat(
      route,
      'Perfect — I have everything I need.\n\n```plan-ready\n{"brief":"Make a music video about neon city nights: three clips and an original track."}\n```',
    ),
  );

  await brief(page).fill("I want a music video about neon city nights");
  await brief(page).press("Enter");

  // The prose renders; the machine block never does.
  await expect(visible(page.locator(".st-md")).filter({ hasText: "everything I need" })).toBeVisible({ timeout: 15000 });
  await expect(visible(page.locator(".st-msg--agent")).first()).not.toContainText("plan-ready");

  // PlanApproval appears on its own — the "Plan production" button was
  // never clicked in this test.
  const planCard = visible(page.locator(".st-plan"));
  await expect(planCard).toBeVisible({ timeout: 30000 });

  // The COMPLETE production (defect 2): multiple steps including music and
  // assembly, per-step credits, and an enabled Approve carrying the total.
  await expect.poll(() => planCard.locator('[role="listitem"]').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(4);
  await expect(planCard).toContainText("Music");
  await expect(planCard).toContainText("Assembly");
  await expect(planCard).toContainText("Deliverable");
  await expect(planCard.locator(".st-plan__cost").first()).toHaveText(/\d+ cr/, { timeout: 15000 });
  const approveBtn = planCard.getByRole("button", { name: /^Approve/ });
  await expect(approveBtn).toBeEnabled({ timeout: 15000 });
  await expect(approveBtn.locator(".hs-btn__cost")).toHaveText(/^\d+$/);
});

}); // describe: auto-plan

test.describe("complete plans + audio re-pricing (A9 defects 2 and 4)", () => {

test("a music-video brief plans a multi-step production and an audio step's model change re-prices it", async ({ page }) => {
  await seedMusicModels();
  await readyIsolated(page, "audioprice");

  const planCard = await planMusicVideo(page);

  // The complete production, each step priced.
  const stepCount = await planCard.locator('[role="listitem"]').count();
  expect(stepCount).toBeGreaterThanOrEqual(4);
  await expect(planCard.getByText("Original track")).toBeVisible();
  await expect(planCard.getByText("Join the clips into the final cut")).toBeVisible();

  // The music step row, its live server quote, and its model picker.
  const musicRow = planCard.locator('[role="listitem"]').filter({ hasText: "Original track" });
  await expect(musicRow.locator(".st-plan__cost")).toHaveText(/\d+ cr/);

  await musicRow.getByRole("button", { name: /Change model for step/ }).click();
  // The pool is the honest composer pool — pick the seeded 20-credit model.
  await visible(page.locator(".st-model", { hasText: MUSIC_BETA.name })).click();

  // Live re-quote (server prices only): the step becomes EXACTLY the
  // seeded model's known price — the same proof agent-chat.spec runs for
  // image steps, now on an AUDIO step.
  await expect(musicRow.locator(".st-plan__cost")).toHaveText(`${MUSIC_BETA.credits} cr`, { timeout: 15000 });
  await expect(planCard.getByRole("button", { name: /^Approve/ })).toBeEnabled({ timeout: 15000 });
});

}); // describe: complete plans

test.describe("final deliverable (A9 defect 5)", () => {

test("approving runs to a deliverable card presented above the collected assets", async ({ page }) => {
  await seedMusicModels();
  await readyIsolated(page, "deliverable");

  const planCard = await planMusicVideo(page);

  // Stub the run at the network seam: real assembly shells out to ffmpeg.
  // The frames mirror /api/agent/run's real SSE shape, including the
  // assembled.deliverable the server now emits for assembly/export runs.
  const FIXTURE = "/api/media/local/e2e-fixture.png";
  await page.route("**/api/agent/run", (route) => {
    const frames = [
      { type: "step_start", step: 1, agent: "video", task: "Clip 1 — opening" },
      { type: "step_complete", step: 1, agent: "video", status: "completed", output: `${FIXTURE}?step=1`, creditsUsed: 12 },
      {
        type: "run_complete",
        success: true,
        summary: "The production finished.",
        creditsUsed: 40,
        outputs: [`${FIXTURE}?step=1`, FIXTURE],
        stepResults: [
          { step: 1, agent: "video", status: "completed", output: `${FIXTURE}?step=1` },
          { step: 2, agent: "assembly", status: "completed" },
          { step: 3, agent: "export", status: "completed" },
        ],
        assembled: {
          images: [{ step: 1, url: `${FIXTURE}?step=1` }],
          videos: [],
          audio: [],
          text: [],
          deliverable: { url: FIXTURE, name: "Music video" },
          total: 3,
        },
      },
    ];
    return route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") + "data: [DONE]\n\n",
    });
  });

  await planCard.getByRole("button", { name: "Auto-complete" }).click();
  await planCard.getByRole("button", { name: /^Approve/ }).click();

  // THE deliverable, prominent and labeled — not an undifferentiated grid.
  const deliverable = visible(page.getByTestId("agent-deliverable"));
  await expect(deliverable).toBeVisible({ timeout: 30000 });
  await expect(deliverable).toContainText("Final deliverable");
  await expect(deliverable).toContainText("Music video");
  await expect(deliverable.locator("img")).toBeVisible();

  // The collected assets sit beneath it, under their own label.
  await expect(visible(page.getByText("Collected assets"))).toBeVisible();
  await expect(visible(page.locator(".st-msg--agent .st-asset")).nth(1)).toBeVisible();
});

}); // describe: final deliverable
