// EDITSv1 Phase E3 Task E3.3 — the agent chat surface: Enter-to-send,
// markdown rendering, question cards, and the busy glow.
//
// The LLM reply is stubbed with page.route on OUR OWN /api/agent/chat
// endpoint (never a real LLM), returning the exact SSE frame shape the
// route emits ({type:"token",content} + [DONE]).
import { test, expect } from "@playwright/test";
import { USER_AUTH_FILE } from "./fixtures/storage-state.mjs";

test.use({ storageState: USER_AUTH_FILE });

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
