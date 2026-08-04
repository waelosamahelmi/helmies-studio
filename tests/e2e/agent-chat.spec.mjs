// EDITSv1 Phase E3 Tasks E3.3/E3.4 — the agent chat surface (Enter-to-send,
// markdown, question cards, busy glow) and the plan approval card (live
// re-quotes, model editing, honored approval, execution-mode persistence).
//
// Chat replies are stubbed with page.route on OUR OWN /api/agent/chat
// endpoint (never a real LLM), returning the exact SSE frame shape the
// route emits ({type:"token",content} + [DONE]). The PLAN journeys use the
// real /api/agent/plan and /api/agent/run routes end to end: with no
// OPENROUTER_KEY in the e2e app the planner is the deterministic heuristic
// (one image step), and provider calls resolve through the double-locked
// E2E mock (playwright.config.mjs webServerEnv), never a real provider.
import { test, expect } from "@playwright/test";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";
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
}

const brief = (page) => visible(page.getByLabel("Creative brief"));

test.describe("chat surface (E3.3)", () => {
test.use({ storageState: USER_AUTH_FILE });

test("Enter sends the message and the reply renders markdown (bold -> <strong>)", async ({ page }) => {
  await page.route("**/api/agent/chat", (route) =>
    fulfillChat(route, "Here is a **bold** idea and a [link](https://example.com/docs).")
  );

  await gotoAgent(page);
  await brief(page).fill("Plan a launch film");
  await brief(page).press("Enter");

  // The user's bubble appears (Enter sent it — no button click).
  await expect(visible(page.locator(".st-msg--user")).filter({ hasText: "Plan a launch film" })).toBeVisible();

  // The agent's reply is markdown: **bold** became a real <strong>.
  const strong = visible(page.locator(".st-md strong", { hasText: "bold" }));
  await expect(strong).toBeVisible({ timeout: 15000 });

  // Links open in a new tab and never carry the raw markdown syntax.
  const link = visible(page.locator(".st-md a", { hasText: "link" }));
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(visible(page.locator(".st-md"))).not.toContainText("**bold**");
});

test("Shift+Enter inserts a newline and sends nothing", async ({ page }) => {
  let chatCalls = 0;
  await page.route("**/api/agent/chat", (route) => {
    chatCalls += 1;
    return fulfillChat(route, "reply");
  });

  await gotoAgent(page);
  const field = brief(page);
  await field.fill("line one");
  await field.press("Shift+Enter");
  await field.pressSequentially("line two");

  await expect(field).toHaveValue("line one\nline two");
  expect(chatCalls).toBe(0);
});

test("a question block renders as options; choosing answers as the next message", async ({ page }) => {
  const question = {
    question: "What aspect ratio should the film use?",
    options: ["16:9 widescreen", "9:16 vertical"],
    allowCustom: true,
  };
  let call = 0;
  await page.route("**/api/agent/chat", (route) => {
    call += 1;
    if (call === 1) {
      return fulfillChat(
        route,
        "Good brief. One thing first.\n\n```question\n" + JSON.stringify(question) + "\n```"
      );
    }
    return fulfillChat(route, "Great - widescreen it is. Press **Plan production** when ready.");
  });

  await gotoAgent(page);
  await brief(page).fill("Make a product film");
  await brief(page).press("Enter");

  // The question card renders the question and its options — the raw
  // fenced block is never shown.
  const card = visible(page.locator(".st-question"));
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText("What aspect ratio should the film use?");
  await expect(visible(page.locator(".st-msg--agent"))).not.toContainText("```question");

  await card.getByRole("button", { name: "16:9 widescreen" }).click();

  // The choice went out as a normal user message and the card locked.
  await expect(visible(page.locator(".st-msg--user")).filter({ hasText: "16:9 widescreen" })).toBeVisible();
  await expect(visible(page.locator(".st-question__answered"))).toContainText("16:9 widescreen");

  // The follow-up reply landed.
  await expect(visible(page.locator(".st-md")).filter({ hasText: "widescreen it is" })).toBeVisible({ timeout: 15000 });
});

test("the thinking card and input-dock glow show while the agent is busy, and clear after", async ({ page }) => {
  await page.route("**/api/agent/chat", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    return fulfillChat(route, "Done thinking.");
  });

  await gotoAgent(page);
  await brief(page).fill("Something ambitious");
  await brief(page).press("Enter");

  // While the (deliberately slow) reply is pending: glow on the dock and
  // the thinking card with its elapsed clock.
  await expect(visible(page.locator(".st-dock-prompt.hs-glow"))).toBeVisible();
  const thinking = visible(page.locator(".st-thinking"));
  await expect(thinking).toBeVisible();
  await expect(thinking).toContainText("Thinking");

  // After the reply lands, both working states clear.
  await expect(visible(page.locator(".st-md")).filter({ hasText: "Done thinking." })).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".st-dock-prompt.hs-glow")).toHaveCount(0);
  await expect(page.locator(".st-thinking")).toHaveCount(0);
});

}); // describe: chat surface

test.describe("plan approval (E3.4)", () => {

async function readyIsolated(page, label) {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label });
  });
  await loginThroughForm(page, user);
  await gotoAgent(page);
  return user;
}

// The heuristic planner (no LLM key in the e2e app) turns any image-y brief
// into exactly one image step, model flux-dev — which has no ModelPricing
// row in the test DB, so its fallback quote is 2 credits. The seeded
// catalog model costs 10. The 2 -> 10 flip after swapping models is the
// live re-quote, priced by the server.
async function planHeroShot(page) {
  await brief(page).fill("Create a hero shot of a ceramic kettle");
  await visible(page.getByRole("button", { name: "Plan production" })).click();
  const planCard = visible(page.locator(".st-plan"));
  await expect(planCard).toBeVisible({ timeout: 30000 });
  await expect(planCard.locator(".st-plan__cost").first()).toHaveText("2 cr", { timeout: 15000 });
  return planCard;
}

test("changing a step's model re-quotes live, and approval runs with the chosen model at its price", async ({ page }) => {
  const user = await readyIsolated(page, "agentplan");
  const planCard = await planHeroShot(page);

  // Swap the step's model to the seeded 10-credit catalog model.
  await planCard.getByRole("button", { name: "Change model for step 1" }).click();
  await visible(page.locator(".st-model", { hasText: "E2E Image Model" })).click();

  // Live re-quote: the step's price becomes the server's 10 credits.
  await expect(planCard.locator(".st-plan__cost").first()).toHaveText("10 cr", { timeout: 15000 });

  // Approve in auto-complete (the step-gated review path has its own E3.5
  // journeys below) — the run executes the EDITED plan (mocked provider,
  // real Generation row, real debit).
  await planCard.getByRole("button", { name: "Auto-complete" }).click();
  await planCard.getByRole("button", { name: /^Approve/ }).click();
  await expect(visible(page.locator(".st-plan").filter({ hasText: "Finished" }))).toBeVisible({ timeout: 60000 });

  await withTestDb(async (prisma) => {
    const generation = await prisma.generation.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(generation, "the approved run must write a Generation row").not.toBeNull();
    expect(generation.model).toBe("e2e-image-model");
    expect(generation.creditsUsed).toBe(10);

    // Debits never exceed the approved total: exactly 10 left the wallet.
    const wallet = await prisma.creditWallet.findUnique({ where: { userId: user.id } });
    expect(wallet.available).toBe(490);
  });
});

test("the execution-mode toggle persists onto the session's settings", async ({ page }) => {
  const user = await readyIsolated(page, "agentmode");
  const planCard = await planHeroShot(page);

  await planCard.getByRole("button", { name: "Auto-complete" }).click();

  await expect
    .poll(async () =>
      withTestDb(async (prisma) => {
        const session = await prisma.agentSession.findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
        });
        return session?.settings?.autoComplete ?? null;
      }),
    { timeout: 15000 })
    .toBe(true);
});

}); // describe: plan approval

test.describe("per-asset review (E3.5)", () => {

async function readyIsolated(page, label) {
  let user;
  await withTestDb(async (prisma) => {
    user = await createIsolatedUser(prisma, { credits: 500, label });
  });
  await loginThroughForm(page, user);
  await gotoAgent(page);
  return user;
}

async function planBrief(page, text) {
  await brief(page).fill(text);
  await visible(page.getByRole("button", { name: "Plan production" })).click();
  const planCard = visible(page.locator(".st-plan"));
  await expect(planCard).toBeVisible({ timeout: 30000 });
  // Wait until the live quote settles so Approve is enabled.
  await expect(planCard.getByRole("button", { name: /^Approve/ })).toBeEnabled({ timeout: 15000 });
  return planCard;
}

const walletOf = (userId) =>
  withTestDb(async (prisma) => (await prisma.creditWallet.findUnique({ where: { userId } })).available);
const generationCountOf = (userId) =>
  withTestDb(async (prisma) => prisma.generation.count({ where: { userId } }));

test("review mode: asset card gates the run; Regenerate charges once more; Accept finishes", async ({ page }) => {
  const user = await readyIsolated(page, "review");

  // Heuristic plan: ONE image step (flux-dev fallback quote, 2 cr).
  const planCard = await planBrief(page, "Create a hero shot of a ceramic kettle");
  await planCard.getByRole("button", { name: /^Approve/ }).click();

  // The step runs via /api/agent/step and pauses behind an AssetCard.
  const asset = visible(page.locator(".st-asset"));
  await expect(asset).toBeVisible({ timeout: 60000 });
  await expect(asset.locator("img")).toBeVisible();
  await expect(asset.getByRole("button", { name: "Accept" })).toBeVisible();

  // One generation, 2 credits charged.
  await expect.poll(() => generationCountOf(user.id), { timeout: 15000 }).toBe(1);
  await expect.poll(() => walletOf(user.id), { timeout: 15000 }).toBe(498);

  // Regenerate: a NEW Generation row, charged once more.
  await asset.getByRole("button", { name: "Regenerate" }).click();
  await expect(visible(page.locator(".st-asset")).getByRole("button", { name: "Accept" })).toBeVisible({ timeout: 60000 });
  await expect.poll(() => generationCountOf(user.id), { timeout: 15000 }).toBe(2);
  await expect.poll(() => walletOf(user.id), { timeout: 15000 }).toBe(496);

  // Accept advances — single-step plan, so the production finishes.
  await visible(page.locator(".st-asset")).getByRole("button", { name: "Accept" }).click();
  await expect(visible(page.locator(".st-msg--agent")).filter({ hasText: "The production finished" })).toBeVisible({ timeout: 30000 });
});

test("don't ask again completes the remaining steps without further prompts", async ({ page }) => {
  const user = await readyIsolated(page, "dontask");

  // Heuristic plan: image step + video step ($STEP_1_OUTPUT chained).
  await planBrief(page, "Create a hero shot of a ceramic kettle and animate it as a video clip");
  await visible(page.locator(".st-plan")).getByRole("button", { name: /^Approve/ }).click();

  // First asset gates; choose "Don't ask again".
  const asset = visible(page.locator(".st-asset"));
  await expect(asset.getByRole("button", { name: "Don't ask again" })).toBeVisible({ timeout: 60000 });
  await asset.getByRole("button", { name: "Don't ask again" }).click();

  // The remaining video step runs to completion with NO further Accept
  // gate — the run finishes on its own.
  await expect(visible(page.locator(".st-msg--agent")).filter({ hasText: /The production (finished|stopped)/ }))
    .toBeVisible({ timeout: 90000 });
  await expect(visible(page.locator(".st-msg--agent")).filter({ hasText: "The production finished" })).toBeVisible();

  // Both steps produced Generation rows; the session flipped to
  // auto-complete; total spend = 2 (image) + 10 (video) = 12.
  await expect.poll(() => generationCountOf(user.id), { timeout: 15000 }).toBe(2);
  await expect.poll(() => walletOf(user.id), { timeout: 15000 }).toBe(488);
  await expect
    .poll(async () =>
      withTestDb(async (prisma) => {
        const session = await prisma.agentSession.findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
        });
        return session?.settings?.autoComplete ?? null;
      }),
    { timeout: 15000 })
    .toBe(true);
});

}); // describe: per-asset review
